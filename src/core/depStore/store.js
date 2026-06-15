// src/core/depStore/store.js — pnpm-lite content store orchestration. IO-heavy.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const layout = require('./layout');
const closuresLib = require('./closures');
const { ensureJunction, safeRemove } = require('./links');

// Native deps need their build scripts; rebuild only these known-safe names.
// MAINTENANCE: add any future native module dep names here.
const NATIVE_REBUILD_ALLOWLIST = [
  'sqlite3', 'opusscript', '@discordjs/opus', 'sodium-native', 'libsodium-wrappers',
];

class Store {
  // modulesConfig: bot.config.modules (for the `disabled` array).
  constructor(modulesPath, modulesConfig = {}) {
    this.modulesPath = modulesPath;
    this.modulesConfig = modulesConfig;
  }

  isEnabled(moduleName) {
    const disabled = this.modulesConfig.disabled;
    if (Array.isArray(disabled)) return !disabled.includes(moduleName);
    return true;
  }

  // Discover every module as { name, type: 'file'|'directory', deps, isolated }.
  // Skips .store/.views/node_modules and directories without index.js.
  discoverModules() {
    const out = [];
    if (!fs.existsSync(this.modulesPath)) return out;
    const items = fs.readdirSync(this.modulesPath, { withFileTypes: true });

    for (const item of items) {
      if (item.isFile() && item.name.endsWith('.js')) {
        const info = this._readFileModule(item.name);
        if (info) out.push(info);
      } else if (item.isDirectory()) {
        if (['node_modules', '.store', '.views'].includes(item.name)) continue;
        const info = this._readDirModule(item.name);
        if (info) out.push(info);
      }
    }
    return out;
  }

  _readFileModule(fileName) {
    try {
      const modulePath = path.join(this.modulesPath, fileName);
      const mod = require(modulePath);
      const meta = mod.meta || {};
      const name = meta.name || path.basename(fileName, '.js');
      return {
        name,
        type: 'file',
        deps: meta.npmDependencies || {},
        isolated: meta.isolatedInstall === true,
      };
    } catch (error) {
      console.error(`[DEP-STORE] failed reading module file ${fileName}: ${error.message}`);
      return null;
    }
  }

  _readDirModule(dirName) {
    const pkgPath = path.join(this.modulesPath, dirName, 'package.json');
    if (!fs.existsSync(pkgPath)) return null; // no deps to manage
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return {
        name: dirName,
        type: 'directory',
        deps: pkg.dependencies || {},
        isolated: pkg.isolatedInstall === true,
      };
    } catch (error) {
      console.error(`[DEP-STORE] failed reading ${pkgPath}: ${error.message}`);
      return null;
    }
  }

  readClosures() {
    const file = layout.closuresFile(this.modulesPath);
    if (!fs.existsSync(file)) return {};
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      // Derived cache — corruption is safe; rebuild from scratch.
      console.error(`[DEP-STORE] corrupt closures.json, rebuilding: ${error.message}`);
      return {};
    }
  }

  writeClosures(closures) {
    const file = layout.closuresFile(this.modulesPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(closures, null, 2));
  }

  // listStoreEntries(): decoded "name@version" keys currently present in .store.
  listStoreEntries() {
    const root = layout.storeRoot(this.modulesPath);
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '.staging')
      .map((d) => layout.decodeEntryDirName(d.name));
  }

  // Run a hardened npm install for one module in an isolated staging dir.
  // Returns { closure: string[], skipped: boolean }. skipped=true means the
  // declared-deps hash matched the recorded closure (fast path, no npm call).
  _stageInstall(module, recordedHash) {
    const deps = module.deps || {};
    const declaredHash = closuresLib.hashDeclaredDeps(deps);

    if (Object.keys(deps).length === 0) {
      return { closure: [], skipped: true, hash: declaredHash };
    }
    if (recordedHash && recordedHash === declaredHash) {
      return { closure: null, skipped: true, hash: declaredHash };
    }

    const stageDir = layout.stagingPath(this.modulesPath, module.name);
    safeRemove(stageDir);
    fs.mkdirSync(stageDir, { recursive: true });
    fs.writeFileSync(
      path.join(stageDir, 'package.json'),
      JSON.stringify({ name: `stage-${module.name}`, version: '1.0.0', dependencies: deps }, null, 2)
    );

    // --ignore-scripts blocks lifecycle-script RCE (supply-chain hardening).
    execSync('npm install --ignore-scripts --no-audit --no-fund --quiet', {
      cwd: stageDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const lockPath = path.join(stageDir, 'package-lock.json');
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const closure = closuresLib.parseClosureFromLock(lock);
    return { closure, skipped: false, hash: declaredHash, stageDir };
  }

  // Move each "name@version" in the closure from the staging tree into the store,
  // unless that entry already exists (dedup). Then wire intra-store junctions and
  // rebuild any native entries that were newly promoted.
  _promoteClosure(closure, stageDir) {
    const stageModules = path.join(stageDir, 'node_modules');
    const newlyPromoted = [];

    for (const entry of closure) {
      const dest = layout.storeEntryPackagePath(this.modulesPath, entry);
      if (fs.existsSync(dest)) continue; // already in store — dedup

      const { name } = layout.splitEntry(entry);
      const src = path.join(stageModules, ...name.split('/'));
      if (!fs.existsSync(src)) {
        // npm may dedupe a transitive higher in the tree; locate it by walking.
        const found = this._findInStageTree(stageModules, name);
        if (!found) {
          console.error(`[DEP-STORE] resolved package not found in staging: ${entry}`);
          continue;
        }
        this._movePackage(found, dest);
      } else {
        this._movePackage(src, dest);
      }
      newlyPromoted.push(entry);
    }

    this._wireIntraStoreJunctions(closure);
    this._rebuildNative(newlyPromoted);
  }

  _movePackage(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest); // same volume (modules/.store) — atomic move
  }

  // Find a package dir by name anywhere in a staging node_modules tree (handles
  // nested node_modules from npm's occasional non-hoisted placement).
  _findInStageTree(stageModules, name) {
    const direct = path.join(stageModules, ...name.split('/'));
    if (fs.existsSync(direct)) return direct;
    const stack = [stageModules];
    while (stack.length) {
      const dir = stack.pop();
      if (!fs.existsSync(dir)) continue;
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const nested = path.join(dir, d.name, 'node_modules');
        const candidate = path.join(nested, ...name.split('/'));
        if (fs.existsSync(candidate)) return candidate;
        if (fs.existsSync(nested)) stack.push(nested);
      }
    }
    return null;
  }

  // For each store entry, create junctions to its direct deps inside the entry's
  // own node_modules, so nested require() resolves pnpm-style without hoisting.
  _wireIntraStoreJunctions(closure) {
    const byName = new Map(); // name -> "name@version" present in this closure
    for (const entry of closure) byName.set(layout.splitEntry(entry).name, entry);

    for (const entry of closure) {
      const pkgPath = layout.storeEntryPackagePath(this.modulesPath, entry);
      const pkgJsonPath = path.join(pkgPath, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;

      let directDeps = {};
      try {
        directDeps = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).dependencies || {};
      } catch { continue; }

      const entryModules = layout.storeEntryModulesPath(this.modulesPath, entry);
      for (const depName of Object.keys(directDeps)) {
        const depEntry = byName.get(depName);
        if (!depEntry) continue; // satisfied at root or by self — skip
        const linkPath = path.join(entryModules, ...depName.split('/'));
        const target = layout.storeEntryPackagePath(this.modulesPath, depEntry);
        ensureJunction(linkPath, target);
      }
    }
  }

  _rebuildNative(entries) {
    for (const entry of entries) {
      const { name } = layout.splitEntry(entry);
      if (!NATIVE_REBUILD_ALLOWLIST.includes(name)) continue;
      const pkgPath = layout.storeEntryPackagePath(this.modulesPath, entry);
      try {
        console.log(`[DEP-STORE] rebuilding native dep ${entry}`);
        execSync('npm rebuild', { cwd: pkgPath, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error) {
        console.error(`[DEP-STORE] native rebuild failed for ${entry}: ${error.message}`);
      }
    }
  }
}

module.exports = { Store, NATIVE_REBUILD_ALLOWLIST };
