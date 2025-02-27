// modules/logger.js - Updated with improved error handling
const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    name: "logger",
    type: "utility",
    version: "1.0.0",
    description: "Logs various server events to a specified channel",
    dependencies: [],
    npmDependencies: {}
  },
  
  // Storage for guild settings
  guildSettings: new Map(),
  
  // Module initialization
  async init(client, bot) {
    console.log("Logger module initializing...");
    
    // Store client reference
    this.client = client;
    this.bot = bot;
    
    // Ensure data directory exists
    this.dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    // Load settings from file
    this.loadSettings();
    
    // Set up event listeners
    this.setupEventListeners();
    
    console.log("Logger module initialized successfully!");
  },
  
  // Module shutdown
  async shutdown() {
    console.log("Logger module shutting down...");
    // Save settings before shutdown
    this.saveSettings();
    console.log("Logger module shut down successfully!");
  },
  
  // Load settings from file
  loadSettings() {
    const settingsPath = path.join(this.dataDir, 'logger-settings.json');
    
    if (fs.existsSync(settingsPath)) {
      try {
        const data = fs.readFileSync(settingsPath, 'utf8');
        const settings = JSON.parse(data);
        
        // Convert to Map
        Object.entries(settings).forEach(([guildId, guildData]) => {
          this.guildSettings.set(guildId, guildData);
        });
        
        console.log(`Loaded logger settings for ${this.guildSettings.size} guilds`);
      } catch (error) {
        console.error('Error loading logger settings:', error);
      }
    }
  },
  
  // Save settings to file
  saveSettings() {
    const settingsPath = path.join(this.dataDir, 'logger-settings.json');
    
    try {
      // Convert Map to object
      const settings = {};
      this.guildSettings.forEach((guildData, guildId) => {
        settings[guildId] = guildData;
      });
      
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      console.log(`Saved logger settings for ${this.guildSettings.size} guilds`);
    } catch (error) {
      console.error('Error saving logger settings:', error);
    }
  },
  
  // Set a guild setting
  setGuildSetting(guildId, key, value) {
    if (!this.guildSettings.has(guildId)) {
      this.guildSettings.set(guildId, {});
    }
    
    const settings = this.guildSettings.get(guildId);
    settings[key] = value;
    
    // Save after update
    this.saveSettings();
  },
  
  // Get a guild setting
  getGuildSetting(guildId, key) {
    const settings = this.guildSettings.get(guildId);
    return settings ? settings[key] : undefined;
  },
  
  // Set up event listeners
  setupEventListeners() {
    // Voice state update event (voice channel joins, leaves, moves)
    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      try {
        await this.handleVoiceStateUpdate(oldState, newState);
      } catch (error) {
        console.error('Error handling voice state update:', error);
      }
    });
    
    // Member join/leave events
    this.client.on('guildMemberAdd', async (member) => {
      try {
        await this.logMemberJoin(member);
      } catch (error) {
        console.error('Error handling member join:', error);
      }
    });
    
    this.client.on('guildMemberRemove', async (member) => {
      try {
        await this.logMemberLeave(member);
      } catch (error) {
        console.error('Error handling member leave:', error);
      }
    });
    
    // Message delete/edit events
    this.client.on('messageDelete', async (message) => {
      try {
        if (message.author && !message.author.bot) {
          await this.logMessageDelete(message);
        }
      } catch (error) {
        console.error('Error handling message delete:', error);
      }
    });
    
    this.client.on('messageUpdate', async (oldMessage, newMessage) => {
      try {
        if (oldMessage.author && !oldMessage.author.bot && oldMessage.content !== newMessage.content) {
          await this.logMessageEdit(oldMessage, newMessage);
        }
      } catch (error) {
        console.error('Error handling message edit:', error);
      }
    });
  },
  
  /**
   * Format timestamp
   */
  formatTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  },
  
  /**
   * Handle voice state updates
   */
  async handleVoiceStateUpdate(oldState, newState) {
    // Ensure both states exist
    if (!oldState || !newState) {
      console.log("Voice state update with null state, skipping");
      return;
    }
    
    // Ensure member exists
    if (!oldState.member || !newState.member) {
      console.log("Voice state update with null member, skipping");
      return;
    }
    
    // Skip if bot
    if (oldState.member.user && oldState.member.user.bot) return;
    
    // Ensure guild exists
    const guild = newState.guild;
    if (!guild) {
      console.log("Voice state update with null guild, skipping");
      return;
    }
    
    // Find the logging channel
    const logChannel = await this.getLogChannel(guild.id);
    if (!logChannel) return; // No log channel configured
    
    const timestamp = this.formatTimestamp();
    const userName = oldState.member.user ? oldState.member.user.tag : "Unknown User";
    const userId = oldState.member.user ? oldState.member.user.id : "unknown";
    
    try {
      // Case 1: User joined a voice channel
      if (!oldState.channel && newState.channel) {
        const channelName = newState.channel ? newState.channel.name : "Unknown Channel";
        await this.logToChannel(
          logChannel,
          `[${timestamp}] [${guild.name}] Event: Voice Channel Join | User: ${userName} | Channel: ${channelName}`
        );
        return;
      }
      
      // Case 2: User left a voice channel
      if (oldState.channel && !newState.channel) {
        const channelName = oldState.channel ? oldState.channel.name : "Unknown Channel";
        await this.logToChannel(
          logChannel,
          `[${timestamp}] [${guild.name}] Event: Voice Channel Leave | User: ${userName} | Channel: ${channelName}`
        );
        return;
      }
      
      // Case 3: User moved voice channels
      if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
        const oldChannelName = oldState.channel ? oldState.channel.name : "Unknown Channel";
        const newChannelName = newState.channel ? newState.channel.name : "Unknown Channel";
        
        // Check if the move was done by another user by checking audit logs
        try {
          // Fetch recent audit logs for member moves
          const auditLogs = await guild.fetchAuditLogs({
            type: AuditLogEvent.MemberMove,
            limit: 5, // Fetch more logs to increase chance of finding the right one
          }).catch(err => {
            console.error("Error fetching audit logs:", err);
            return null;
          });
          console.log("Fetched audit logs:", auditLogs.entries.executor);
          // If we successfully got audit logs
          if (auditLogs && auditLogs.entries.size > 0) {
            // Look for a matching entry (within last 3 seconds)
            const now = Date.now();
            const threeSecondsAgo = now - 3000;
            
            // Find an entry matching our user
            let foundEntry = null;
            
            for (const [id, entry] of auditLogs.entries) {
              // Skip old entries
              if (entry.createdTimestamp < threeSecondsAgo) continue;
              foundEntry = entry;
            }
            
            // If we found a matching entry
            if (foundEntry) {
              const executorTag = foundEntry.executor ? foundEntry.executor.tag : "Unknown Moderator";
              const executorId = foundEntry.executor ? foundEntry.executor.id : "unknown";
              
              // Make sure this wasn't the user moving themselves
              if (executorId !== userId) {
                await this.logToChannel(
                  logChannel,
                  `[${timestamp}] [${guild.name}] Event: Voice Channel Force Move | Moderator: ${executorTag} moved User: ${userName} | From: ${oldChannelName} | To: ${newChannelName}`
                );
                return;
              }
            }
          }
        } catch (error) {
          console.error("Error checking audit logs for voice movement:", error);
        }
        
        // If we couldn't find an audit log or had an error, it was likely the user moving themselves
        await this.logToChannel(
          logChannel, 
          `[${timestamp}] [${guild.name}] Event: Voice Channel Move | User: ${userName} | From: ${oldChannelName} | To: ${newChannelName}`
        );
      }
    } catch (error) {
      console.error("Detailed voice state update error:", error);
    }
  },
  
  /**
   * Log member join event
   */
  async logMemberJoin(member) {
    if (!member || !member.guild) return;
    
    const logChannel = await this.getLogChannel(member.guild.id);
    if (!logChannel) return;
    
    const timestamp = this.formatTimestamp();
    const userName = member.user ? member.user.tag : "Unknown User";
    
    await this.logToChannel(
      logChannel, 
      `[${timestamp}] [${member.guild.name}] Event: Member Join | User: ${userName}`
    );
  },
  
  /**
   * Log member leave event
   */
  async logMemberLeave(member) {
    if (!member || !member.guild) return;
    
    const logChannel = await this.getLogChannel(member.guild.id);
    if (!logChannel) return;
    
    const timestamp = this.formatTimestamp();
    const userName = member.user ? member.user.tag : "Unknown User";
    
    await this.logToChannel(
      logChannel, 
      `[${timestamp}] [${member.guild.name}] Event: Member Leave | User: ${userName}`
    );
  },
  
  /**
   * Log message deletion
   */
  async logMessageDelete(message) {
    if (!message || !message.guild || !message.author) return; // Skip if incomplete data or DMs
    
    const logChannel = await this.getLogChannel(message.guild.id);
    if (!logChannel) return;
    
    const timestamp = this.formatTimestamp();
    const userName = message.author ? message.author.tag : "Unknown User";
    const channelName = message.channel ? message.channel.name : "Unknown Channel";
    
    let content = message.content || "No text content";
    if (content.length > 900) {
      content = content.substring(0, 900) + '...';
    }
    
    await this.logToChannel(
      logChannel, 
      `[${timestamp}] [${message.guild.name}] Event: Message Delete | User: ${userName} | Channel: #${channelName} | Content: "${content}"`
    );
  },
  
  /**
   * Log message edit
   */
  async logMessageEdit(oldMessage, newMessage) {
    if (!oldMessage || !oldMessage.guild || !oldMessage.author) return; // Skip if incomplete data or DMs
    
    const logChannel = await this.getLogChannel(oldMessage.guild.id);
    if (!logChannel) return;
    
    const timestamp = this.formatTimestamp();
    const userName = oldMessage.author ? oldMessage.author.tag : "Unknown User";
    const channelName = oldMessage.channel ? oldMessage.channel.name : "Unknown Channel";
    
    let oldContent = oldMessage.content || "No text content";
    let newContent = newMessage.content || "No text content";
    
    if (oldContent.length > 450) {
      oldContent = oldContent.substring(0, 450) + '...';
    }
    
    if (newContent.length > 450) {
      newContent = newContent.substring(0, 450) + '...';
    }
    
    await this.logToChannel(
      logChannel, 
      `[${timestamp}] [${oldMessage.guild.name}] Event: Message Edit | User: ${userName} | Channel: #${channelName} | Before: "${oldContent}" | After: "${newContent}"`
    );
  },
  
  /**
   * Get the log channel for a guild
   */
  async getLogChannel(guildId) {
    if (!guildId) return null;
    
    // First check our own storage
    const logChannelId = this.getGuildSetting(guildId, 'logChannel');
    if (logChannelId) {
      const guild = this.client.guilds.cache.get(guildId);
      if (guild) {
        const channel = guild.channels.cache.get(logChannelId);
        if (channel && channel.isTextBased()) {
          return channel;
        }
      }
    }
    
    // Next check database if available
    if (this.bot.databaseManager) {
      try {
        const guildSettings = await this.bot.databaseManager.getGuildSettings(guildId);
        if (guildSettings && guildSettings.log_channel) {
          const guild = this.client.guilds.cache.get(guildId);
          if (guild) {
            const channel = guild.channels.cache.get(guildSettings.log_channel);
            if (channel && channel.isTextBased()) {
              return channel;
            }
          }
        }
      } catch (error) {
        console.error(`Error getting log channel from database for guild ${guildId}:`, error);
      }
    }
    
    // Fallback: Look for a channel named "logs" or "server-logs"
    const guild = this.client.guilds.cache.get(guildId);
    if (guild) {
      const logChannel = guild.channels.cache.find(
        channel => channel.isTextBased() && 
        (channel.name === 'logs' || channel.name === 'server-logs' || channel.name === 'audit-logs')
      );
      
      return logChannel;
    }
    
    return null;
  },
  
  /**
   * Send a log message to a channel
   */
  async logToChannel(channel, message) {
    if (!channel) return;
    
    try {
      await channel.send({
        content: message,
        allowedMentions: { parse: [] } // Don't ping anyone
      });
    } catch (error) {
      console.error(`Error sending log message to channel:`, error);
    }
  },
  
  // Commands for setting up logging
  commands: [
    {
      name: "setlogchannel",
      description: "Set the channel for server logs",
      data: {
        name: "setlogchannel",
        description: "Set the channel for server logs",
        options: [
          {
            name: "channel",
            description: "The channel to send logs to",
            type: 7, // CHANNEL type
            required: true,
            channel_types: [0, 5, 10, 11, 12] // Text channels & threads
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        if (!interaction || !interaction.member || !interaction.guild) {
          return;
        }
      
        // Check for admin permissions
        if (!interaction.member.permissions.has('Administrator')) {
          return interaction.reply({
            content: "You need Administrator permission to use this command!",
            ephemeral: true
          });
        }
        
        const channel = interaction.options.getChannel("channel");
        if (!channel) {
          return interaction.reply({
            content: "Invalid channel selection.",
            ephemeral: true
          });
        }
        
        // Ensure the channel is text-based
        if (!channel.isTextBased()) {
          return interaction.reply({
            content: "The log channel must be a text channel!",
            ephemeral: true
          });
        }
        
        // Get the logger module
        const loggerModule = bot.moduleLoader.getModule("logger");
        if (!loggerModule) {
          return interaction.reply({
            content: "Logger module is not loaded!",
            ephemeral: true
          });
        }
        
        // Save to file storage
        loggerModule.setGuildSetting(interaction.guild.id, 'logChannel', channel.id);
        
        // Also try to save to database if available
        if (bot.databaseManager) {
          try {
            await bot.databaseManager.setGuildSettings(interaction.guild.id, {
              log_channel: channel.id
            });
          } catch (error) {
            console.error('Error saving log channel to database:', error);
          }
        }
        
        // Send a test log
        const timestamp = loggerModule.formatTimestamp();
        await loggerModule.logToChannel(
          channel,
          `[${timestamp}] [${interaction.guild.name}] Event: Logger Setup | User: ${interaction.user.tag} | Status: Logging enabled for this channel`
        );
        
        return interaction.reply(`Server logs will now be sent to ${channel}!`);
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        if (!message || !message.member || !message.guild) {
          return;
        }
      
        // Check for admin permissions
        if (!message.member.permissions.has('Administrator')) {
          return message.reply("You need Administrator permission to use this command!");
        }
        
        // Get the mentioned channel
        const channel = message.mentions.channels.first();
        if (!channel) {
          return message.reply("Please mention a channel to set as the log channel!");
        }
        
        // Ensure the channel is text-based
        if (!channel.isTextBased()) {
          return message.reply("The log channel must be a text channel!");
        }
        
        // Get the logger module
        const loggerModule = bot.moduleLoader.getModule("logger");
        if (!loggerModule) {
          return message.reply("Logger module is not loaded!");
        }
        
        // Save to file storage
        loggerModule.setGuildSetting(message.guild.id, 'logChannel', channel.id);
        
        // Also try to save to database if available
        if (bot.databaseManager) {
          try {
            await bot.databaseManager.setGuildSettings(message.guild.id, {
              log_channel: channel.id
            });
          } catch (error) {
            console.error('Error saving log channel to database:', error);
          }
        }
        
        // Send a test log
        const timestamp = loggerModule.formatTimestamp();
        await loggerModule.logToChannel(
          channel,
          `[${timestamp}] [${message.guild.name}] Event: Logger Setup | User: ${message.author.tag} | Status: Logging enabled for this channel`
        );
        
        return message.reply(`Server logs will now be sent to ${channel}!`);
      }
    }
  ]
};