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
}

module.exports = { Store, NATIVE_REBUILD_ALLOWLIST };
