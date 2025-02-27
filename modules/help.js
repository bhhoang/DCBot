// modules/help.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  meta: {
    name: "help",
    type: "utility",
    version: "1.0.0",
    description: "Display help information about commands",
    dependencies: [], // No dependencies
    npmDependencies: {} // No external dependencies needed
  },
  
  // Module initialization
  async init(client, bot) {
    console.log("Help module initialized!");
  },
  
  // Module shutdown
  async shutdown() {
    console.log("Help module shut down!");
  },
  
  // Commands
  commands: [
    {
      name: "help",
      description: "Display help information about commands",
      data: {
        name: "help",
        description: "Display help information about commands",
        options: [
          {
            name: "command",
            description: "Get help for a specific command",
            type: 3, // STRING
            required: false
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        const commandName = interaction.options.getString("command");
        
        if (commandName) {
          // Detailed help for a specific command
          await this.showCommandHelp(commandName, interaction, bot);
        } else {
          // General help listing all commands
          await this.showGeneralHelp(interaction, bot);
        }
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        const commandName = args[0];
        
        if (commandName) {
          // Detailed help for a specific command
          await this.showCommandHelp(commandName, message, bot);
        } else {
          // General help listing all commands
          await this.showGeneralHelp(message, bot);
        }
      },
      
      /**
       * Show general help with all commands
       */
      async showGeneralHelp(source, bot) {
        // Get all loaded modules
        const modules = bot.moduleLoader.getAllModules();
        
        // Group commands by module type
        const commandsByType = {};
        
        for (const module of modules) {
          // Skip modules without commands
          if (!module.commands || module.commands.length === 0) continue;
          
          const moduleType = module.meta.type || 'Miscellaneous';
          
          if (!commandsByType[moduleType]) {
            commandsByType[moduleType] = [];
          }
          
          // Add all commands from this module
          for (const command of module.commands) {
            commandsByType[moduleType].push({
              name: command.name,
              description: command.description || 'No description available',
              module: module.meta.name
            });
          }
        }
        
        // Create the help embed
        const embed = new EmbedBuilder()
          .setTitle('Command Help')
          .setColor('#3498db')
          .setDescription(`Here are all available commands. Use \`/help [command]\` for detailed info on a specific command.`)
          .setFooter({ text: `${bot.client.user.username} | Total Commands: ${countTotalCommands(commandsByType)}` });
        
        // Add fields for each command type
        for (const [type, commands] of Object.entries(commandsByType)) {
          // Format commands as a list
          const commandList = commands
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(cmd => `\`${cmd.name}\` - ${cmd.description}`)
            .join('\n');
          
          embed.addFields({ name: `📚 ${capitalizeFirstLetter(type)}`, value: commandList });
        }
        
        // Send the embed
        if (source.reply) {
          // Slash command
          await source.reply({ embeds: [embed] });
        } else {
          // Legacy command
          await source.channel.send({ embeds: [embed] });
        }
      },
      
      /**
       * Show detailed help for a specific command
       */
      async showCommandHelp(commandName, source, bot) {
        // Convert to lowercase for case-insensitive matching
        const cmdNameLower = commandName.toLowerCase();
        
        // Find the command in all modules
        let targetCommand = null;
        let moduleName = null;
        
        // Get all loaded modules
        const modules = bot.moduleLoader.getAllModules();
        
        // Search for the command
        for (const module of modules) {
          if (!module.commands) continue;
          
          const command = module.commands.find(cmd => 
            cmd.name.toLowerCase() === cmdNameLower
          );
          
          if (command) {
            targetCommand = command;
            moduleName = module.meta.name;
            break;
          }
        }
        
        // If command not found
        if (!targetCommand) {
          const reply = `Command \`${commandName}\` not found. Use \`/help\` to see all available commands.`;
          
          if (source.reply) {
            // Slash command
            await source.reply({ content: reply, ephemeral: true });
          } else {
            // Legacy command
            await source.reply(reply);
          }
          return;
        }
        
        // Build the detailed help embed
        const embed = new EmbedBuilder()
          .setTitle(`Command: ${targetCommand.name}`)
          .setColor('#2ecc71')
          .setDescription(targetCommand.description || 'No description available')
          .addFields(
            { name: 'Module', value: moduleName, inline: true },
            { name: 'Slash Command', value: targetCommand.slash ? 'Yes' : 'No', inline: true },
            { name: 'Text Command', value: targetCommand.legacy ? 'Yes' : 'No', inline: true }
          );
        
        // Add usage information if available
        if (targetCommand.usage) {
          embed.addFields({ name: 'Usage', value: targetCommand.usage });
        }
        
        // Add options if available (for slash commands)
        if (targetCommand.data && targetCommand.data.options && targetCommand.data.options.length > 0) {
          const optionsText = targetCommand.data.options.map(opt => {
            const required = opt.required ? '(required)' : '(optional)';
            return `\`${opt.name}\` - ${opt.description} ${required}`;
          }).join('\n');
          
          embed.addFields({ name: 'Options', value: optionsText });
        }
        
        // Add examples if available
        if (targetCommand.examples) {
          const examples = Array.isArray(targetCommand.examples) 
            ? targetCommand.examples.join('\n') 
            : targetCommand.examples;
          
          embed.addFields({ name: 'Examples', value: examples });
        }
        
        // Send the embed
        if (source.reply) {
          // Slash command
          await source.reply({ embeds: [embed] });
        } else {
          // Legacy command
          await source.channel.send({ embeds: [embed] });
        }
      }
    }
  ]
};

/**
 * Count total commands across all categories
 * @param {Object} commandsByType - Commands grouped by type
 * @returns {number} - Total number of commands
 */
function countTotalCommands(commandsByType) {
  let total = 0;
  for (const commands of Object.values(commandsByType)) {
    total += commands.length;
  }
  return total;
}

/**
 * Capitalize the first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} - Capitalized string
 */
function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
