// src/core/dependencyManager.js — facade over the pnpm-lite dep store.
const path = require('path');
const { Store } = require('./depStore/store');

class DependencyManager {
  // modulesConfig: bot.config.modules (carries the `disabled` array). Optional so
  // existing arg-less construction in tests/tools still works.
  constructor(modulesConfig = {}) {
    this.modulesPath = path.join(__dirname, '../../modules');
    this.store = new Store(this.modulesPath, modulesConfig);
  }

  // Boot-time install of all enabled, non-isolated module deps into the store.
  async checkDependencies() {
    console.log('Checking module dependencies...');
    this.store.installAll();
    console.log('Dependency check completed.');
  }

  // Reclaim orphaned store entries and stale views. Safe to call repeatedly.
  async gcStore() {
    console.log('Running dependency store GC...');
    this.store.gc();
  }
}

module.exports = { DependencyManager };
