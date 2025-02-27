// src/core/moduleLoader.js - Handles loading and management of modules
const fs = require('fs');
const path = require('path');

class ModuleLoader {
  constructor(bot) {
    this.bot = bot;
    this.modules = new Map();
    this.modulesPath = path.join(__dirname, '../../modules');
    this.modulesConfig = this.bot.config.modules;
  }

  /**
   * Load all enabled modules
   */
  async loadModules() {
    console.log('Loading modules...');

    // Create modules directory if it doesn't exist
    if (!fs.existsSync(this.modulesPath)) {
      fs.mkdirSync(this.modulesPath, { recursive: true });
    }

    // Get all items in the modules directory
    const moduleItems = fs.readdirSync(this.modulesPath, { withFileTypes: true });

    // Separate into files and directories
    const moduleFiles = moduleItems
      .filter(item => item.isFile() && item.name.endsWith('.js'))
      .map(item => ({ name: item.name, type: 'file' }));

    const moduleDirs = moduleItems
      .filter(item => item.isDirectory())
      .map(item => ({ name: item.name, type: 'directory' }));

    // Combine both types
    const allModules = [...moduleFiles, ...moduleDirs];

    // Pre-load module data to resolve dependencies
    const moduleInfoMap = new Map();

    for (const moduleItem of allModules) {
      try {
        let modulePath, moduleMeta;

        if (moduleItem.type === 'file') {
          modulePath = path.join(this.modulesPath, moduleItem.name);
          const tempModule = require(modulePath);
          moduleMeta = tempModule.meta || {};
        } else {
          const indexPath = path.join(this.modulesPath, moduleItem.name, 'index.js');
          if (fs.existsSync(indexPath)) {
            modulePath = indexPath;
            const tempModule = require(modulePath);
            moduleMeta = tempModule.meta || {};
          } else {
            continue; // Skip directories without index.js
          }
        }

        moduleInfoMap.set(moduleMeta.name, {
          path: modulePath,
          meta: moduleMeta,
          item: moduleItem
        });
      } catch (error) {
        console.error(`Error preloading module ${moduleItem.name}:`, error);
      }
    }

    // Sort modules by dependencies
    const sortedModules = this.sortModulesByDependencies(moduleInfoMap);

    // Load modules in order
    for (const moduleInfo of sortedModules) {
      try {
        await this.loadModule(moduleInfo);
      } catch (error) {
        console.error(`Failed to load module ${moduleInfo.meta.name}:`, error);
      }
    }

    console.log(`Loaded ${this.modules.size} modules.`);
  }

  /**
   * Load a specific module
   * @param {object} moduleInfo - Module information object
   */
  async loadModule(moduleInfo) {
    const { path: modulePath, meta, item } = moduleInfo;

    // Skip if module isn't enabled in config
    if (!this.isModuleEnabled(meta.name)) {
      console.log(`Module ${meta.name} is disabled, skipping...`);
      return;
    }

    // Check if module dependencies are available
    if (!this.checkModuleDependencies(meta)) {
      console.log(`Module ${meta.name} has missing dependencies, skipping...`);
      return;
    }

    // Set up custom require function based on module type
    let moduleDir;
    if (item.type === 'file') {
      moduleDir = this.modulesPath;
    } else {
      moduleDir = path.join(this.modulesPath, item.name);
    }

    const moduleRequire = this.createModuleRequire(moduleDir);

    // Load the module
    let module;
    if (item.type === 'file') {
      module = moduleRequire(`./${item.name}`);
    } else {
      module = moduleRequire('./index.js');
    }

    // Apply module-specific settings from config
    this.applyModuleSettings(module);

    // Initialize the module
    if (typeof module.init === 'function') {
      await module.init(this.bot.client, this.bot);
    }

    // Store the module
    this.modules.set(module.meta.name, {
      ...module,
      _path: modulePath,
      _directory: moduleDir,
      _require: moduleRequire,
      _type: item.type
    });

    console.log(`Module ${module.meta.name} (${module.meta.version}) loaded successfully.`);
  }

  /**
   * Sort modules by their dependencies
   * @param {Map} moduleInfoMap - Map of module information
   * @returns {Array} - Sorted array of module information objects
   */
  sortModulesByDependencies(moduleInfoMap) {
    const result = [];
    const visited = new Set();
    const temp = new Set();  // For cycle detection

    // Recursive function to visit module and its dependencies
    const visit = (moduleName) => {
      // If we've already processed this module, skip
      if (visited.has(moduleName)) {
        return;
      }

      // Check for circular dependencies
      if (temp.has(moduleName)) {
        console.error(`Circular dependency detected in module ${moduleName}`);
        return;
      }

      // Get module info
      const moduleInfo = moduleInfoMap.get(moduleName);
      if (!moduleInfo) return;

      // Mark node as temporarily visited (for cycle detection)
      temp.add(moduleName);

      // Visit all dependencies first
      if (moduleInfo.meta.dependencies) {
        for (const depName of moduleInfo.meta.dependencies) {
          if (moduleInfoMap.has(depName)) {
            visit(depName);
          }
        }
      }

      // Mark as visited and add to result
      temp.delete(moduleName);
      visited.add(moduleName);
      result.push(moduleInfo);
    };

    // Visit all modules
    for (const [moduleName] of moduleInfoMap) {
      if (!visited.has(moduleName)) {
        visit(moduleName);
      }
    }

    return result;
  }

  /**
   * Create a custom require function for a module
   * @param {string} moduleDir - Path to the module directory
   * @returns {Function} - Custom require function
   */
  createModuleRequire(moduleDir) {
    // Create a custom require function that looks in the module's node_modules first
    return (id) => {
      if (id.startsWith('./') || id.startsWith('../')) {
        // Relative path - load from the module directory
        return require(path.join(moduleDir, id));
      }

      try {
        // First try to load from the module's node_modules (if it's a directory)
        if (fs.existsSync(path.join(moduleDir, 'node_modules'))) {
          return require(require.resolve(id, { paths: [path.join(moduleDir, 'node_modules')] }));
        }

        // Then try to load from the shared modules node_modules
        if (fs.existsSync(path.join(this.modulesPath, 'node_modules'))) {
          return require(require.resolve(id, { paths: [path.join(this.modulesPath, 'node_modules')] }));
        }

        // If not found, try to load from the main project's node_modules
        return require(id);
      } catch (error) {
        // If all else fails, try a direct require
        return require(id);
      }
    };
  }


  /**
   * Check if a module is enabled (not in the disabled list)
   * @param {string} moduleName - Name of the module
   * @returns {boolean} - Whether the module is enabled
   */
  isModuleEnabled(moduleName) {
    // If the modules config has a disabled array, check if the module is NOT in it
    if (this.modulesConfig.disabled && Array.isArray(this.modulesConfig.disabled)) {
      return !this.modulesConfig.disabled.includes(moduleName);
    }

    // If there's no disabled array, all modules are enabled by default
    return true;
  }

  /**
   * Check if a module's dependencies are available
   * @param {object} meta - Module metadata
   * @returns {boolean} - Whether all dependencies are available
   */
  checkModuleDependencies(meta) {
    if (!meta.dependencies || meta.dependencies.length === 0) {
      return true;
    }

    return meta.dependencies.every(dependency => {
      return this.modules.has(dependency);
    });
  }

  /**
   * Apply module-specific settings from config
   * @param {object} module - Module object
   */
  applyModuleSettings(module) {
    const moduleName = module.meta.name;

    // Apply settings from config if they exist
    if (this.modulesConfig.settings && this.modulesConfig.settings[moduleName]) {
      module.settings = this.modulesConfig.settings[moduleName];
    }

    // Apply permissions from config if they exist
    if (this.modulesConfig.permissions && this.modulesConfig.permissions[moduleName]) {
      module.permissions = this.modulesConfig.permissions[moduleName];
    }
  }

  /**
   * Unload all modules
   */
  async unloadModules() {
    // Unload modules in reverse dependency order
    const moduleNames = Array.from(this.modules.keys());
    const moduleEntries = Array.from(this.modules.entries());

    // Create a dependency graph for reverse topological sort
    const dependencyGraph = {};

    for (const [name, module] of moduleEntries) {
      dependencyGraph[name] = {
        dependents: [],  // Modules that depend on this module
        dependencies: module.meta.dependencies || []
      };
    }

    // Build the dependency graph
    for (const [name, module] of moduleEntries) {
      if (module.meta.dependencies) {
        for (const dependency of module.meta.dependencies) {
          if (dependencyGraph[dependency]) {
            dependencyGraph[dependency].dependents.push(name);
          }
        }
      }
    }

    // Perform topological sort for shutdown order
    const shutdownOrder = [];
    const visited = new Set();

    const visit = (name) => {
      if (visited.has(name)) return;
      visited.add(name);

      const node = dependencyGraph[name];
      if (!node) return;

      // First visit all modules that depend on this one
      for (const dependent of node.dependents) {
        visit(dependent);
      }

      shutdownOrder.push(name);
    };

    // Visit all modules
    for (const name of moduleNames) {
      if (!visited.has(name)) {
        visit(name);
      }
    }

    // Unload modules in the determined order
    for (const name of shutdownOrder) {
      try {
        const module = this.modules.get(name);
        if (module && typeof module.shutdown === 'function') {
          await module.shutdown();
        }
        console.log(`Module ${name} unloaded.`);
      } catch (error) {
        console.error(`Failed to unload module ${name}:`, error);
      }
    }

    // Clear the require cache for all modules
    for (const key in require.cache) {
      if (key.includes('/modules/')) {
        delete require.cache[key];
      }
    }

    this.modules.clear();
  }

  /**
   * Get a module by name
   * @param {string} name - Name of the module
   * @returns {object|undefined} - Module object or undefined if not found
   */
  getModule(name) {
    return this.modules.get(name);
  }

  /**
   * Get an array of all loaded modules
   * @returns {object[]} - Array of module objects
   */
  getAllModules() {
    return Array.from(this.modules.values());
  }

  /**
   * Get the absolute path to a module
   * @param {string} name - Name of the module
   * @returns {string|null} - Path to the module or null if not found
   */
  getModulePath(name) {
    const module = this.modules.get(name);
    return module ? module._path : null;
  }

  /**
   * Check if a specific module is loaded
   * @param {string} name - Name of the module
   * @returns {boolean} - Whether the module is loaded
   */
  isModuleLoaded(name) {
    return this.modules.has(name);
  }
}

module.exports = { ModuleLoader };
