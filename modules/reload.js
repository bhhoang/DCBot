// modules/reload.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const path = require('path');
const fs = require('fs');

/**
 * Reload a specific module or all modules
 * @param {string|null} moduleName - Name of module to reload, or null for all
 * @param {object} bot - Bot instance
 * @returns {object} - Result of the reload operation
 */
async function reloadModules(moduleName, bot) {
  const results = {
    success: [],
    failed: [],
    notFound: []
  };
  
  try {
    // If no module name is specified, reload all modules
    if (!moduleName) {
      // Get all currently loaded modules
      const loadedModules = Array.from(bot.moduleLoader.modules.keys());
      
      // First, unregister commands and events
      await bot.commandHandler.unregisterAllCommands();
      await bot.eventHandler.unregisterAllEvents();
      
      // Unload all modules
      await bot.moduleLoader.unloadModules();
      
      // Reload modules
      await bot.moduleLoader.loadModules();
      
      // Check which modules were successfully reloaded
      for (const name of loadedModules) {
        if (bot.moduleLoader.isModuleLoaded(name)) {
          results.success.push(name);
        } else {
          results.failed.push(name);
        }
      }
      
      // Register commands and events ONCE after all modules are loaded
      await bot.commandHandler.registerCommands();
      await bot.eventHandler.registerEvents();
      
      return results;
    }
    
    // Handle multiple modules separated by commas or spaces
    const moduleNames = moduleName.split(/[\s,]+/).filter(Boolean);
    
    if (moduleNames.length > 1) {
      // Collect modules to be reloaded
      const modulesToReload = [];
      
      for (const name of moduleNames) {
        if (bot.moduleLoader.isModuleLoaded(name)) {
          modulesToReload.push(name);
        } else {
          // Try to find the module
          const modPath = findModulePath(name, bot);
          if (modPath) {
            modulesToReload.push(name);
          } else {
            results.notFound.push(name);
          }
        }
      }
      
      // First unregister all commands and events for these modules
      for (const name of modulesToReload) {
        if (bot.moduleLoader.isModuleLoaded(name)) {
          // Unregister commands from this module
          await bot.commandHandler.unregisterModuleCommands(name);
          // Unregister events from this module
          await bot.eventHandler.unregisterModuleEvents(name);
        }
      }
      
      // Then reload each module
      for (const name of modulesToReload) {
        const singleResult = await reloadSingleModule(name, bot, false); // Pass false to skip command registration
        results.success.push(...singleResult.success);
        results.failed.push(...singleResult.failed);
      }
      
      // Register commands and events ONCE after all modules are reloaded
      await bot.commandHandler.registerCommands();
      await bot.eventHandler.registerEvents();
      
      return results;
    }
    
    // Single module reload - unregister commands/events first
    if (bot.moduleLoader.isModuleLoaded(moduleName)) {
      // Unregister commands from this module
      await bot.commandHandler.unregisterModuleCommands(moduleName);
      // Unregister events from this module
      await bot.eventHandler.unregisterModuleEvents(moduleName);
    }
    
    // Now reload the single module
    return await reloadSingleModule(moduleName, bot, true);
  } catch (error) {
    console.error('Error during reload:', error);
    results.failed.push(moduleName || 'all modules');
    return results;
  }
}

/**
 * Find a module's path by name
 * @param {string} moduleName - Name of the module to find
 * @param {object} bot - Bot instance
 * @returns {string|null} - Module path or null if not found
 */
function findModulePath(moduleName, bot) {
  const modulesPath = path.join(__dirname, '../modules');
  const moduleItems = fs.readdirSync(modulesPath, { withFileTypes: true });
  
  // Check if module exists as a file or directory
  const moduleFile = moduleItems.find(item => 
    (item.isFile() && item.name === `${moduleName}.js`) ||
    (item.isDirectory() && item.name === moduleName)
  );
  
  if (!moduleFile) {
    return null;
  }
  
  return moduleFile.isFile() 
    ? path.join(modulesPath, moduleFile.name)
    : path.join(modulesPath, moduleFile.name, 'index.js');
}

/**
 * Reload a single module
 * @param {string} moduleName - Name of the module to reload
 * @param {object} bot - Bot instance
 * @param {boolean} registerCommands - Whether to register commands after reloading
 * @returns {object} - Result of the reload operation
 */
async function reloadSingleModule(moduleName, bot, registerCommands = true) {
  const results = {
    success: [],
    failed: [],
    notFound: []
  };
  
  try {
    // Check if module is loaded
    if (!bot.moduleLoader.isModuleLoaded(moduleName)) {
      // Try to look for the module
      const modulesPath = path.join(__dirname, '../modules');
      const moduleItems = fs.readdirSync(modulesPath, { withFileTypes: true });
      
      // Check if module exists as a file or directory
      const moduleFile = moduleItems.find(item => 
        (item.isFile() && item.name === `${moduleName}.js`) ||
        (item.isDirectory() && item.name === moduleName)
      );
      
      if (!moduleFile) {
        results.notFound.push(moduleName);
        return results;
      }
      
      // Module exists but isn't loaded, try to load it
      try {
        if (moduleFile.isFile()) {
          // Extract metadata without requiring the module
          const modulePath = path.join(modulesPath, moduleFile.name);
          
          // Clear require cache for this module
          delete require.cache[require.resolve(modulePath)];
          
          // Create module info for loader
          const moduleInfo = {
            path: modulePath,
            item: { name: moduleFile.name, type: 'file' },
            meta: { name: moduleName } // Basic meta
          };
          
          await bot.moduleLoader.loadModule(moduleInfo);
        } else {
          // Directory-based module
          const indexPath = path.join(modulesPath, moduleFile.name, 'index.js');
          if (!fs.existsSync(indexPath)) {
            results.notFound.push(moduleName);
            return results;
          }
          
          // Clear require cache for this module
          delete require.cache[require.resolve(indexPath)];
          
          // Create module info for loader
          const moduleInfo = {
            path: indexPath,
            item: { name: moduleFile.name, type: 'directory' },
            meta: { name: moduleName } // Basic meta
          };
          
          await bot.moduleLoader.loadModule(moduleInfo);
        }
        
        if (bot.moduleLoader.isModuleLoaded(moduleName)) {
          results.success.push(moduleName);
          
          // Register commands and events only if specified
          if (registerCommands) {
            await bot.commandHandler.registerCommands();
            await bot.eventHandler.registerEvents();
          }
        } else {
          results.failed.push(moduleName);
        }
      } catch (error) {
        console.error(`Failed to load module ${moduleName}:`, error);
        results.failed.push(moduleName);
      }
      
      return results;
    }
    
    // Module is loaded, get its information for reloading
    const module = bot.moduleLoader.getModule(moduleName);
    if (!module) {
      results.notFound.push(moduleName);
      return results;
    }
    
    // Get module type and path
    const moduleType = module._type;
    const modulePath = module._path;
    
    // Shutdown the module
    if (typeof module.shutdown === 'function') {
      await module.shutdown();
    }
    
    // Remove event handlers for this module
    if (bot.eventHandler && typeof bot.eventHandler.unregisterModuleEvents === 'function') {
      bot.eventHandler.unregisterModuleEvents(moduleName);
    }
    
    // Remove the module from the loaded modules map
    bot.moduleLoader.modules.delete(moduleName);
    
    // Clear require cache for this module
    delete require.cache[require.resolve(modulePath)];
    
    // Reload the module
    try {
      const moduleInfo = {
        path: modulePath,
        item: { 
          name: moduleType === 'file' 
            ? path.basename(modulePath) 
            : path.basename(path.dirname(modulePath)), 
          type: moduleType 
        },
        meta: { name: moduleName }
      };
      
      await bot.moduleLoader.loadModule(moduleInfo);
      
      if (bot.moduleLoader.isModuleLoaded(moduleName)) {
        results.success.push(moduleName);
        
        // Register commands and events only if specified
        if (registerCommands) {
          await bot.commandHandler.registerCommands();
          await bot.eventHandler.registerEvents();
        }
      } else {
        results.failed.push(moduleName);
      }
    } catch (error) {
      console.error(`Failed to reload module ${moduleName}:`, error);
      results.failed.push(moduleName);
    }
    
    return results;
  } catch (error) {
    console.error(`Error reloading module ${moduleName}:`, error);
    results.failed.push(moduleName);
    return results;
  }
}

module.exports = {
  meta: {
    name: "reload",
    type: "admin",
    version: "1.1.0", // Updated version
    description: "Reload commands without restarting the bot",
    dependencies: [], // No dependencies on other modules
    npmDependencies: {} // No npm dependencies
  },
  
  // Module initialization
  async init(client, bot) {
    console.log("Reload module initialized!");
    
    // Add methods to commandHandler and eventHandler if they don't exist
    if (bot.commandHandler && !bot.commandHandler.unregisterAllCommands) {
      bot.commandHandler.unregisterAllCommands = async function() {
        console.log("Unregistering all commands before reload");
        // Implementation depends on your command handler structure
        // This is a placeholder - you need to implement based on your system
        if (typeof this.commands === 'object') {
          this.commands.clear();
        }
        
        if (Array.isArray(this.commandsList)) {
          this.commandsList = [];
        }
        
        return true;
      };
    }
    
    if (bot.commandHandler && !bot.commandHandler.unregisterModuleCommands) {
      bot.commandHandler.unregisterModuleCommands = async function(moduleName) {
        console.log(`Unregistering commands for module: ${moduleName}`);
        // Implementation depends on your command handler structure
        // This is a placeholder - you need to implement based on your system
        return true;
      };
    }
    
    if (bot.eventHandler && !bot.eventHandler.unregisterAllEvents) {
      bot.eventHandler.unregisterAllEvents = async function() {
        console.log("Unregistering all events before reload");
        // Implementation depends on your event handler structure
        // This is a placeholder - you need to implement based on your system
        return true;
      };
    }
  },
  
  // Module shutdown
  async shutdown() {
    console.log("Reload module shut down!");
  },
  
  // Commands
  commands: [
    {
      name: "reload",
      description: "Reload commands without restarting the bot",
      data: {
        name: "reload",
        description: "Reload commands without restarting the bot",
        options: [
          {
            name: "module",
            description: "Specific module to reload (leave empty for all)",
            type: 3, // STRING
            required: false
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        // Check if user has administrator permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({
            content: "You need Administrator permissions to use this command.",
            ephemeral: true
          });
        }
        
        await interaction.deferReply();
        
        // Get module name from options
        const moduleName = interaction.options.getString("module");
        
        const startTime = Date.now();
        const results = await reloadModules(moduleName, bot);
        const endTime = Date.now();
        
        // Create embed for response
        const embed = new EmbedBuilder()
          .setTitle('Module Reload Results')
          .setColor(results.failed.length > 0 ? '#ff9900' : '#00ff00')
          .setFooter({ text: `Reload completed in ${endTime - startTime}ms` })
          .setTimestamp();
        
        // Add fields for the results
        if (results.success.length > 0) {
          embed.addFields({ 
            name: '✅ Successfully Reloaded', 
            value: results.success.join('\n') || 'None'
          });
        }
        
        if (results.failed.length > 0) {
          embed.addFields({ 
            name: '❌ Failed to Reload', 
            value: results.failed.join('\n') || 'None'
          });
        }
        
        if (results.notFound.length > 0) {
          embed.addFields({ 
            name: '❓ Not Found', 
            value: results.notFound.join('\n') || 'None'
          });
        }
        
        return interaction.editReply({ embeds: [embed] });
      },
      
      legacy: true,
      async legacyExecute(message, args, bot) {
        // Check if user has administrator permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("You need Administrator permissions to use this command.");
        }
        
        // Get module name from arguments
        const moduleName = args.join(' ');
        
        const loadingMsg = await message.reply('🔄 Reloading modules...');
        
        const startTime = Date.now();
        const results = await reloadModules(moduleName, bot);
        const endTime = Date.now();
        
        // Create embed for response
        const embed = new EmbedBuilder()
          .setTitle('Module Reload Results')
          .setColor(results.failed.length > 0 ? '#ff9900' : '#00ff00')
          .setFooter({ text: `Reload completed in ${endTime - startTime}ms` })
          .setTimestamp();
        
        // Add fields for the results
        if (results.success.length > 0) {
          embed.addFields({ 
            name: '✅ Successfully Reloaded', 
            value: results.success.join('\n') || 'None'
          });
        }
        
        if (results.failed.length > 0) {
          embed.addFields({ 
            name: '❌ Failed to Reload', 
            value: results.failed.join('\n') || 'None'
          });
        }
        
        if (results.notFound.length > 0) {
          embed.addFields({ 
            name: '❓ Not Found', 
            value: results.notFound.join('\n') || 'None'
          });
        }
        
        return loadingMsg.edit({ content: null, embeds: [embed] });
      }
    }
  ]
};