// src/core/dependencyManager.js - Manages npm dependencies for modules
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DependencyManager {
  constructor() {
    this.modulesPath = path.join(__dirname, '../../modules');
  }
  
  /**
   * Check and install dependencies for all modules
   */
  async checkDependencies() {
    console.log('Checking module dependencies...');
    
    // Create modules directory if it doesn't exist
    if (!fs.existsSync(this.modulesPath)) {
      fs.mkdirSync(this.modulesPath, { recursive: true });
    }
    
    // Handle directory-based modules
    await this.checkDirectoryModuleDependencies();
    
    // Handle single-file command modules
    await this.checkSingleFileModuleDependencies();
    
    console.log('Dependency check completed.');
  }
  
  /**
   * Check dependencies for directory-based modules
   */
  async checkDirectoryModuleDependencies() {
    // Get all module directories
    const moduleDirs = fs.readdirSync(this.modulesPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory() && dirent.name !== 'node_modules')
      .map(dirent => dirent.name);
    
    // Check each module for missing npm dependencies
    for (const moduleDir of moduleDirs) {
      try {
        const modulePath = path.join(this.modulesPath, moduleDir);
        const modulePackageJsonPath = path.join(modulePath, 'package.json');
        
        // Skip if module doesn't have a package.json file
        if (!fs.existsSync(modulePackageJsonPath)) {
          continue;
        }
        
        console.log(`Checking dependencies for directory module: ${moduleDir}`);
        
        // Check if module has node_modules directory
        const moduleNodeModulesPath = path.join(modulePath, 'node_modules');
        
        // Conditions to install dependencies:
        // 1. node_modules directory doesn't exist
        // 2. package.json has been modified since last install
        // 3. package-lock.json doesn't exist
        if (!fs.existsSync(moduleNodeModulesPath) || 
            !fs.existsSync(path.join(modulePath, 'package-lock.json'))) {
          console.log(`Installing dependencies for module: ${moduleDir}`);
          await this.installModuleDependencies(modulePath);
          continue;
        }
        
        // Check if package.json is newer than node_modules
        const packageJsonStat = fs.statSync(modulePackageJsonPath);
        const nodeModulesStat = fs.statSync(moduleNodeModulesPath);
        
        if (packageJsonStat.mtime > nodeModulesStat.mtime) {
          console.log(`Package.json updated, reinstalling dependencies for module: ${moduleDir}`);
          await this.installModuleDependencies(modulePath);
        }
      } catch (error) {
        console.error(`Failed to check dependencies for module ${moduleDir}:`, error);
      }
    }
  }
  
  /**
   * Check dependencies for single-file command modules
   */
  async checkSingleFileModuleDependencies() {
    // Get all JavaScript files in the modules directory
    const moduleFiles = fs.readdirSync(this.modulesPath)
      .filter(file => file.endsWith('.js'));
    
    if (moduleFiles.length === 0) return;
    
    // Create or check the shared node_modules directory
    const sharedNodeModulesPath = path.join(this.modulesPath, 'node_modules');
    
    // Collect all npm dependencies from single-file modules
    const allDependencies = {};
    let needsInstall = false;
    
    // Check if we need to create a package.json for modules
    const modulePackageJsonPath = path.join(this.modulesPath, 'package.json');
    let modulePackageJson = { 
      name: "discord-bot-modules",
      version: "1.0.0",
      description: "Shared dependencies for bot modules",
      dependencies: {}
    };
    
    // Load existing package.json if it exists
    if (fs.existsSync(modulePackageJsonPath)) {
      try {
        modulePackageJson = JSON.parse(fs.readFileSync(modulePackageJsonPath, 'utf8'));
        if (!modulePackageJson.dependencies) {
          modulePackageJson.dependencies = {};
        }
      } catch (error) {
        console.error('Error reading modules package.json:', error);
      }
    }
    
    const existingDeps = { ...modulePackageJson.dependencies };
    
    // Collect dependencies from all module files
    for (const file of moduleFiles) {
      try {
        const modulePath = path.join(this.modulesPath, file);
        const module = require(modulePath);
        
        if (module.meta && module.meta.npmDependencies) {
          console.log(`Found dependencies in module file: ${file}`);
          
          for (const [name, version] of Object.entries(module.meta.npmDependencies)) {
            // Skip if dependency is already in package.json with same version
            if (existingDeps[name] === version) continue;
            
            allDependencies[name] = version;
            needsInstall = true;
          }
        }
      } catch (error) {
        console.error(`Failed to check dependencies for module file ${file}:`, error);
      }
    }
    
    // Update package.json and install if needed
    if (needsInstall) {
      console.log('New dependencies found in module files, updating package.json...');
      
      // Update dependencies
      modulePackageJson.dependencies = {
        ...modulePackageJson.dependencies,
        ...allDependencies
      };
      
      // Write updated package.json
      fs.writeFileSync(
        modulePackageJsonPath,
        JSON.stringify(modulePackageJson, null, 2)
      );
      
      // Install dependencies
      console.log('Installing shared dependencies for single-file modules...');
      await this.installModuleDependencies(this.modulesPath);
    } else {
      console.log('All single-file module dependencies are up to date.');
    }
  }
  
  /**
   * Install dependencies for a specific module
   * @param {string} modulePath - Path to the module directory
   */
  async installModuleDependencies(modulePath) {
    return new Promise((resolve, reject) => {
      try {
        // Read package.json to check if there are any dependencies
        const packageJsonPath = path.join(modulePath, 'package.json');
        
        // Skip if package.json doesn't exist
        if (!fs.existsSync(packageJsonPath)) {
          return resolve();
        }
        
        const packageJson = require(packageJsonPath);
        
        // Skip if no dependencies defined
        if (!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0) {
          console.log(`No dependencies defined for module: ${path.basename(modulePath)}`);
          return resolve();
        }
        
        // Run npm install in the module directory
        console.log(`Installing dependencies for module: ${path.basename(modulePath)}`);
        
        execSync('npm install --no-audit --quiet', { 
          cwd: modulePath,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        console.log(`Dependencies installed successfully for module: ${path.basename(modulePath)}`);
        resolve();
      } catch (error) {
        console.error(`Failed to install dependencies for module ${path.basename(modulePath)}:`, error);
        // Continue even if there's an error, to not block other modules
        resolve();
      }
    });
  }
  
  /**
   * Check if a module has all required dependencies installed
   * @param {string} modulePath - Path to the module directory
   * @returns {Promise<boolean>} - Whether all dependencies are installed
   */
  async verifyModuleDependencies(modulePath) {
    return new Promise((resolve) => {
      try {
        // Read package.json to get dependencies
        const packageJsonPath = path.join(modulePath, 'package.json');
        if (!fs.existsSync(packageJsonPath)) {
          return resolve(true); // No package.json, no dependencies to verify
        }
        
        const packageJson = require(packageJsonPath);
        if (!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0) {
          return resolve(true); // No dependencies defined
        }
        
        // Check if node_modules exists
        const nodeModulesPath = path.join(modulePath, 'node_modules');
        if (!fs.existsSync(nodeModulesPath)) {
          return resolve(false); // No node_modules directory
        }
        
        // Check each dependency
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          const depPath = path.join(nodeModulesPath, name);
          if (!fs.existsSync(depPath)) {
            console.warn(`Missing dependency ${name} in module ${path.basename(modulePath)}`);
            return resolve(false);
          }
        }
        
        resolve(true);
      } catch (error) {
        console.error(`Error verifying dependencies for module ${path.basename(modulePath)}:`, error);
        resolve(false);
      }
    });
  }
  
  /**
   * Verify a specific npm dependency exists in the shared node_modules
   * @param {string} dependency - Name of the dependency
   * @returns {boolean} - Whether the dependency exists
   */
  verifySharedDependency(dependency) {
    try {
      const sharedNodeModulesPath = path.join(this.modulesPath, 'node_modules');
      const depPath = path.join(sharedNodeModulesPath, dependency);
      return fs.existsSync(depPath);
    } catch (error) {
      console.error(`Error verifying shared dependency ${dependency}:`, error);
      return false;
    }
  }
}

module.exports = { DependencyManager };
