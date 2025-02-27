// src/core/commandHandler.js - Handles command registration and execution
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { Collection } = require('discord.js');

class CommandHandler {
  constructor(bot) {
    this.bot = bot;
    this.commands = new Collection();
    this.slashCommands = new Collection();
    this.legacyCommands = new Collection();
    this.cooldowns = new Collection();
    this.rest = new REST({ version: '9' }).setToken(this.bot.config.bot.token);
  }
  
  /**
   * Register commands from all modules
   */
  async registerCommands() {
    console.log('Registering commands...');
    
    // Get all commands from modules
    for (const module of this.bot.moduleLoader.getAllModules()) {
      if (module.commands && Array.isArray(module.commands)) {
        for (const command of module.commands) {
          try {
            // Skip commands without a name
            if (!command.name) {
              console.warn(`Found command without name in module ${module.meta.name}, skipping...`);
              continue;
            }
            
            // Add module metadata to command
            const fullCommand = {
              ...command,
              module: module.meta.name,
              modulePath: module._path,
              moduleRequire: module._require,
              permissions: this.getCommandPermissions(module, command.name),
              cooldown: command.cooldown || this.bot.config.commands?.cooldown || 3
            };
            
            // Register command by type
            if (command.slash) {
              this.slashCommands.set(command.name, fullCommand);
            }
            
            if (command.legacy) {
              // Add command for case sensitivity handling
              if (this.bot.config.commands?.caseSensitive === false) {
                this.legacyCommands.set(command.name.toLowerCase(), fullCommand);
              } else {
                this.legacyCommands.set(command.name, fullCommand);
              }
            }
            
            // Add to general commands collection
            this.commands.set(command.name, fullCommand);
            
            // Add to Discord.js client commands collection for easy access
            this.bot.client.commands.set(command.name, fullCommand);
            
          } catch (error) {
            console.error(`Error registering command ${command.name} from module ${module.meta.name}:`, error);
          }
        }
      }
    }
    
    // Register slash commands with Discord API
    if (this.bot.config.commands?.registerSlashCommands) {
      await this.registerSlashCommandsWithDiscord();
    }
    
    // Set up command listeners
    this.setupCommandListeners();
    
    console.log(`Registered ${this.commands.size} commands (${this.slashCommands.size} slash, ${this.legacyCommands.size} legacy).`);
  }
  
  /**
   * Get command permissions from module configuration
   * @param {object} module - Module object
   * @param {string} commandName - Command name
   * @returns {string[]} - Array of role names that can use the command
   */
  getCommandPermissions(module, commandName) {
    // Check if module has permissions defined in config
    if (this.bot.config.modules?.permissions?.[module.meta.name]?.[commandName]) {
      return this.bot.config.modules.permissions[module.meta.name][commandName];
    }
    
    // Check if module has default permissions
    if (module.permissions?.[commandName]) {
      return module.permissions[commandName];
    }
    
    // Default to everyone
    return ['@everyone'];
  }
  
  /**
   * Register slash commands with Discord API
   */
  async registerSlashCommandsWithDiscord() {
    try {
      const commandsData = Array.from(this.slashCommands.values())
        .filter(cmd => cmd.data)
        .map(cmd => cmd.data);
      
      if (commandsData.length > 0) {
        console.log(`Registering ${commandsData.length} slash commands with Discord...`);
        
        // Register to test guild if in development mode
        if (this.bot.config.development?.testGuildId) {
          await this.registerCommandsToGuild(this.bot.config.development.testGuildId, commandsData);
        } else {
          // Register globally (takes up to an hour to propagate)
          await this.rest.put(
            Routes.applicationCommands(this.bot.config.bot.clientId),
            { body: commandsData }
          );
          console.log('Global slash commands registered.');
        }
      }
    } catch (error) {
      console.error('Failed to register slash commands:', error);
    }
  }
  
  /**
   * Register commands to a specific guild
   * @param {string} guildId - Discord guild ID
   * @param {Array} commandsData - Command data to register
   */
  async registerCommandsToGuild(guildId, commandsData = null) {
    if (!commandsData) {
      commandsData = Array.from(this.slashCommands.values())
        .filter(cmd => cmd.data)
        .map(cmd => cmd.data);
    }
    
    if (commandsData.length > 0) {
      await this.rest.put(
        Routes.applicationGuildCommands(
          this.bot.config.bot.clientId, 
          guildId
        ),
        { body: commandsData }
      );
      console.log(`Guild slash commands registered to guild ${guildId}.`);
    }
  }
  
  /**
   * Set up command listeners
   */
  setupCommandListeners() {
    // Handle slash commands
    this.bot.client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand()) return;
      
      await this.handleSlashCommand(interaction);
    });
    
    // Handle legacy message commands if enabled
    if (this.bot.config.commands?.enableLegacyCommands) {
      this.bot.client.on('messageCreate', async message => {
        await this.handleLegacyCommand(message);
      });
    }
  }
  
  /**
   * Handle slash command interactions
   * @param {object} interaction - Discord interaction
   */
  async handleSlashCommand(interaction) {
    const commandName = interaction.commandName;
    const command = this.slashCommands.get(commandName);
    
    if (!command) return;
    
    // Check if command is on cooldown
    if (this.isOnCooldown(interaction.user.id, command)) {
      const timeLeft = this.getCooldownTimeLeft(interaction.user.id, command);
      return interaction.reply({
        content: `Please wait ${timeLeft.toFixed(1)} more second(s) before using the /${command.name} command.`,
        ephemeral: true
      });
    }
    
    // Check permissions
    if (!this.userHasPermission(interaction.member, command)) {
      return interaction.reply({
        content: `You don't have permission to use this command.`,
        ephemeral: true
      });
    }
    
    // Set cooldown
    this.setCooldown(interaction.user.id, command);
    
    // Execute command
    try {
      await command.execute(interaction, this.bot);
    } catch (error) {
      console.error(`Error executing command ${commandName}:`, error);
      
      const replyOptions = {
        content: 'There was an error executing this command.',
        ephemeral: true
      };
      
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(replyOptions).catch(console.error);
      } else {
        await interaction.reply(replyOptions).catch(console.error);
      }
    }
  }
  
  /**
   * Handle legacy (prefix) commands
   * @param {object} message - Discord message
   */
  async handleLegacyCommand(message) {
    // Ignore messages from bots or messages that don't start with the prefix
    if (message.author.bot) return;
    
    // Get prefix from config, or guild-specific prefix if available
    let prefix = this.bot.config.bot.prefix;
    
    // Check for guild-specific prefix
    if (message.guild && this.bot.databaseManager) {
      const guildSettings = await this.bot.databaseManager.getGuildSettings(message.guild.id);
      if (guildSettings && guildSettings.prefix) {
        prefix = guildSettings.prefix;
      }
    }
    
    // Check if message starts with prefix
    if (!message.content.startsWith(prefix)) return;
    
    // Parse command and arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = this.bot.config.commands?.caseSensitive === false
      ? args.shift().toLowerCase()
      : args.shift();
    
    // Get command
    const command = this.legacyCommands.get(commandName);
    if (!command) return;
    
    // Check if command is on cooldown
    if (this.isOnCooldown(message.author.id, command)) {
      const timeLeft = this.getCooldownTimeLeft(message.author.id, command);
      return message.reply(`Please wait ${timeLeft.toFixed(1)} more second(s) before using the ${prefix}${command.name} command.`)
        .then(msg => {
          if (message.guild) {
            setTimeout(() => msg.delete().catch(console.error), 5000);
          }
        }).catch(console.error);
    }
    
    // Check permissions
    if (message.guild && !this.userHasPermission(message.member, command)) {
      return message.reply(`You don't have permission to use this command.`);
    }
    
    // Set cooldown
    this.setCooldown(message.author.id, command);
    
    // Execute command
    try {
      await command.legacyExecute(message, args, this.bot);
    } catch (error) {
      console.error(`Error executing legacy command ${commandName}:`, error);
      message.reply('There was an error executing this command.').catch(console.error);
    }
  }
  
  /**
   * Check if a user has permission to use a command
   * @param {object} member - Discord guild member
   * @param {object} command - Command object
   * @returns {boolean} - Whether the user has permission
   */
  userHasPermission(member, command) {
    // DM messages always have permission
    if (!member) return true;
    
    // Bot owner always has permission
    if (this.bot.config.bot.ownerIds?.includes(member.user.id)) {
      return true;
    }
    
    // Check required Discord permissions
    if (command.requiredPermissions) {
      if (!member.permissions.has(command.requiredPermissions)) {
        return false;
      }
    }
    
    // Check role-based permissions
    if (command.permissions && command.permissions.length > 0) {
      // Everyone has permission
      if (command.permissions.includes('@everyone')) {
        return true;
      }
      
      // Check if user has any of the required roles
      const memberRoles = member.roles.cache;
      const hasRequiredRole = memberRoles.some(role => {
        return command.permissions.includes(role.name) || 
               command.permissions.includes(role.id);
      });
      
      if (!hasRequiredRole) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Set cooldown for a command
   * @param {string} userId - Discord user ID
   * @param {object} command - Command object
   */
  setCooldown(userId, command) {
    const cooldownAmount = command.cooldown * 1000;
    
    if (!this.cooldowns.has(command.name)) {
      this.cooldowns.set(command.name, new Collection());
    }
    
    const timestamps = this.cooldowns.get(command.name);
    timestamps.set(userId, Date.now() + cooldownAmount);
    
    // Auto-remove the user from the cooldown after it expires
    setTimeout(() => timestamps.delete(userId), cooldownAmount);
  }
  
  /**
   * Check if a command is on cooldown for a user
   * @param {string} userId - Discord user ID
   * @param {object} command - Command object
   * @returns {boolean} - Whether the command is on cooldown
   */
  isOnCooldown(userId, command) {
    if (!this.cooldowns.has(command.name)) {
      return false;
    }
    
    const timestamps = this.cooldowns.get(command.name);
    if (!timestamps.has(userId)) {
      return false;
    }
    
    const expirationTime = timestamps.get(userId);
    return Date.now() < expirationTime;
  }
  
  /**
   * Get the time left on a cooldown
   * @param {string} userId - Discord user ID
   * @param {object} command - Command object
   * @returns {number} - Time left in seconds
   */
  getCooldownTimeLeft(userId, command) {
    const timestamps = this.cooldowns.get(command.name);
    const expirationTime = timestamps.get(userId);
    return (expirationTime - Date.now()) / 1000;
  }
}

module.exports = { CommandHandler };
