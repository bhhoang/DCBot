// src/core/bot.js - The main Bot class
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Collection, 
  ActivityType 
} = require('discord.js');
const { ModuleLoader } = require('./moduleLoader');
const { CommandHandler } = require('./commandHandler');
const { EventHandler } = require('./eventHandler');
const { DependencyManager } = require('./dependencyManager');
const { DatabaseManager } = require('./databaseManager');
const fs = require('fs');
const path = require('path');

class Bot {
  constructor(config) {
    this.config = config;
    
    // Setup Discord.js client with appropriate intents and partials
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
      ],
      partials: [
        Partials.Channel, 
        Partials.Message, 
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
      ],
      allowedMentions: { 
        parse: ['users', 'roles'], 
        repliedUser: true 
      }
    });
    
    // Collections for command and event tracking
    this.client.commands = new Collection();
    this.client.cooldowns = new Collection();
    
    // Core component initialization
    this.dependencyManager = new DependencyManager();
    this.moduleLoader = new ModuleLoader(this);
    this.commandHandler = new CommandHandler(this);
    this.eventHandler = new EventHandler(this);
    
    // Initialize database if enabled
    if (this.config.database?.enabled) {
      this.databaseManager = new DatabaseManager(this.config.database);
    }
    
    // Store start time for uptime tracking
    this.startTime = Date.now();
  }
  
  /**
   * Initialize the bot - load modules, commands, and events
   */
  async initialize() {
    console.log('Initializing bot...');
    
    // Initialize database connection
    if (this.databaseManager) {
      await this.databaseManager.connect();
      console.log('Database connected successfully.');
    }
    
    // Check for module dependencies and install if needed
    await this.dependencyManager.checkDependencies();
    
    // Load modules
    await this.moduleLoader.loadModules();
    
    // Register commands from modules
    await this.commandHandler.registerCommands();
    
    // Register event handlers from modules
    await this.eventHandler.registerEvents();
    
    // Set up the bot's own core event handlers
    this.setupCoreEvents();
    
    console.log('Bot initialized successfully!');
  }
  
  /**
   * Set up essential bot events
   */
  setupCoreEvents() {
    // Ready event
    this.client.on('ready', () => {
      console.log(`Logged in as ${this.client.user.tag}!`);
      this.setStatus();
    });
    
    // Error events
    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });
    
    this.client.on('warn', (warning) => {
      console.log('Discord client warning:', warning);
    });
    
    // Guild events
    this.client.on('guildCreate', (guild) => {
      console.log(`Bot joined a new guild: ${guild.name} (${guild.id})`);
    });
    
    this.client.on('guildDelete', (guild) => {
      console.log(`Bot was removed from a guild: ${guild.name} (${guild.id})`);
    });
    
    // Debug logging if enabled
    if (this.config.development?.debug) {
      this.client.on('debug', (info) => {
        console.log('Discord debug:', info);
      });
    }
  }
  
  /**
   * Set the bot's activity status based on config
   */
  setStatus() {
    const { status, activity } = this.config.bot;
    
    // Set the presence
    if (activity) {
      // Map the activity type string to the ActivityType enum
      const activityTypeMap = {
        'PLAYING': ActivityType.Playing,
        'STREAMING': ActivityType.Streaming,
        'LISTENING': ActivityType.Listening,
        'WATCHING': ActivityType.Watching,
        'COMPETING': ActivityType.Competing,
        'CUSTOM': ActivityType.Custom
      };
      
      const activityType = activityTypeMap[activity.type] || ActivityType.Playing;
      
      this.client.user.setPresence({
        status: status || 'online',
        activities: [{
          name: activity.name || 'with modules',
          type: activityType,
          url: activity.url || null
        }]
      });
    } else {
      this.client.user.setStatus(status || 'online');
    }
  }
  
  /**
   * Login to Discord
   */
  async login() {
    console.log('Logging in to Discord...');
    return this.client.login(this.config.bot.token);
  }
  
  /**
   * Get bot uptime in milliseconds
   */
  getUptime() {
    return Date.now() - this.startTime;
  }
  
  /**
   * Format uptime as a readable string
   */
  getFormattedUptime() {
    const uptime = this.getUptime();
    const seconds = Math.floor(uptime / 1000) % 60;
    const minutes = Math.floor(uptime / (1000 * 60)) % 60;
    const hours = Math.floor(uptime / (1000 * 60 * 60)) % 24;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  
  /**
   * Gracefully shut down the bot
   */
  async shutdown() {
    console.log('Shutting down...');
    
    // Unload all modules
    console.log('Unloading modules...');
    await this.moduleLoader.unloadModules();
    
    // Close database connection if exists
    if (this.databaseManager) {
      console.log('Closing database connection...');
      await this.databaseManager.disconnect();
    }
    
    // Close Discord connection
    console.log('Logging out from Discord...');
    if (this.client) {
      this.client.destroy();
    }
    
    console.log('Shutdown complete.');
  }
}

module.exports = { Bot };
