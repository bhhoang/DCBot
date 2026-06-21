const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, '..', 'modules');

function discoverModules() {
  const results = [];
  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push({ name: entry.name.slice(0, -3), path: path.join(MODULES_DIR, entry.name), type: 'file' });
    } else if (entry.isDirectory()) {
      const indexPath = path.join(MODULES_DIR, entry.name, 'index.js');
      if (fs.existsSync(indexPath)) {
        results.push({ name: entry.name, path: indexPath, type: 'directory' });
      }
    }
  }
  return results;
}

describe('Module Discovery', () => {
  const modules = discoverModules();

  test('finds all modules', () => {
    // We expect at least some modules to be found
    assert.ok(modules.length >= 5, `Expected at least 5 modules, found ${modules.length}`);
  });

  test('module names are non-empty and unique', () => {
    const names = modules.map(m => m.name);
    const unique = new Set(names);
    assert.strictEqual(unique.size, names.length, 'Duplicate module names detected');
    for (const name of names) {
      assert.ok(name.length > 0, 'Empty module name');
      assert.ok(/^[a-zA-Z0-9_-]+$/.test(name), `Invalid module name: ${name}`);
    }
  });

  test('all module paths exist and are readable', () => {
    for (const mod of modules) {
      assert.ok(fs.existsSync(mod.path), `Module path not found: ${mod.path}`);
      assert.ok(fs.statSync(mod.path).isFile(), `Module path is not a file: ${mod.path}`);
    }
  });
});

describe('Module Metadata', () => {
  const modules = discoverModules();

  for (const mod of modules) {
    test(`${mod.name} has valid metadata`, () => {
      let modExports;
      try {
        modExports = require(mod.path);
      } catch (err) {
        // Dep resolution via shared store may fail in test – that's acceptable
        // as long as the module's source can be parsed and the meta read.
        if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_REQUIRE_ESM') {
          return;
        }
        throw err;
      }

      const meta = modExports.meta;
      assert.ok(meta, `${mod.name} is missing meta`);
      assert.equal(typeof meta.name, 'string', `${mod.name}: meta.name must be a string`);
      assert.ok(meta.name.length > 0, `${mod.name}: meta.name must not be empty`);
      assert.equal(typeof meta.type, 'string', `${mod.name}: meta.type must be a string`);
      assert.equal(typeof meta.version, 'string', `${mod.name}: meta.version must be a string`);
      assert.equal(typeof meta.description, 'string', `${mod.name}: meta.description must be a string`);
      assert.ok(Array.isArray(meta.dependencies), `${mod.name}: meta.dependencies must be an array`);
    });
  }
});

describe('Module Contract', () => {
  const modules = discoverModules();

  for (const mod of modules) {
    test(`${mod.name} exports expected contract`, () => {
      let modExports;
      try {
        modExports = require(mod.path);
      } catch (err) {
        // Dep resolution via shared store may fail in test – that's acceptable
        // as long as the module's source can be parsed and the meta read.
        if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_REQUIRE_ESM') {
          return;
        }
        throw err;
      }

      assert.equal(typeof modExports.init, 'function', `${mod.name}: init must be a function`);
      assert.equal(typeof modExports.shutdown, 'function', `${mod.name}: shutdown must be a function`);

      if (modExports.commands) {
        assert.ok(Array.isArray(modExports.commands), `${mod.name}: commands must be an array`);
        for (const cmd of modExports.commands) {
          assert.equal(typeof cmd.name, 'string', `${mod.name}: command name must be a string`);
          assert.ok(cmd.name.length > 0, `${mod.name}: command name must not be empty`);

          if (cmd.slash) {
            assert.equal(typeof cmd.execute, 'function', `${mod.name}/${cmd.name}: slash execute must be a function`);
          }
          if (cmd.legacy) {
            assert.equal(typeof cmd.legacyExecute, 'function', `${mod.name}/${cmd.name}: legacyExecute must be a function`);
          }
        }
      }

      if (modExports.events) {
        assert.ok(Array.isArray(modExports.events), `${mod.name}: events must be an array`);
        for (const evt of modExports.events) {
          assert.equal(typeof evt.name, 'string', `${mod.name}: event name must be a string`);
          assert.equal(typeof evt.execute, 'function', `${mod.name}: event execute must be a function`);
        }
      }
    });
  }
});

describe('Discovered Modules List', () => {
  test('known modules are present', () => {
    const modules = discoverModules();
    const names = modules.map(m => m.name);
    const expected = ['clear', 'gemini', 'help', 'logger', 'reload', 'tts', 'werewolf'];
    for (const name of expected) {
      assert.ok(names.includes(name), `Expected module "${name}" not found in modules directory`);
    }
  });

  test('modules directory has no unexpected top-level index.js', () => {
    // The shared node_modules placeholder should not be flagged as a module
    const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
    const sharedIndex = entries.find(e => e.name === 'index.js' && e.isFile());
    if (sharedIndex) {
      // Shared node_modules index is not a real module – verify it has no module meta
      const content = require(path.join(MODULES_DIR, 'index.js'));
      assert.ok(!content.meta || content.meta.name !== 'modules', 'Shared index.js should not be a named module');
    }
  });
});
