// modules/clear.js
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  meta: {
    name: "clear",
    type: "admin",
    version: "1.0.0",
    description: "Clear all messages from a channel",
    dependencies: [], // No dependencies on other modules
    npmDependencies: {} // No npm dependencies
  },
  
  // Module initialization
  async init(client, bot) {
    console.log("Clear channel module initialized!");
  },
  
  // Module shutdown
  async shutdown() {
    console.log("Clear channel module shut down!");
  },
  
  // Commands
  commands: [
    {
      name: "clear",
      description: "Clear all messages from the current channel",
      data: {
        name: "clear",
        description: "Clear all messages from the current channel",
        options: [
          {
            name: "amount",
            description: "Number of messages to delete (max 100, default all)",
            type: 4, // INTEGER
            required: false
          },
          {
            name: "reason",
            description: "Reason for clearing messages",
            type: 3, // STRING
            required: false
          },
          {
            name: "confirm",
            description: "Confirm deletion without prompt (dangerous!)",
            type: 5, // BOOLEAN
            required: false
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        // Check if user has administrator or manage messages permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.reply({
            content: "You need Administrator or Manage Messages permissions to use this command.",
            ephemeral: true
          });
        }
        
        const amount = interaction.options.getInteger("amount");
        const reason = interaction.options.getString("reason") || "No reason provided";
        const skipConfirm = interaction.options.getBoolean("confirm") || false;
        
        // Check if channel is a text channel
        if (!interaction.channel.isTextBased()) {
          return interaction.reply({
            content: "This command can only be used in text channels.",
            ephemeral: true
          });
        }
        
        // If amount is specified, use bulkDelete method
        if (amount) {
          if (amount < 1 || amount > 100) {
            return interaction.reply({
              content: "Please provide a number between 1 and 100.",
              ephemeral: true
            });
          }
          
          try {
            await interaction.deferReply({ ephemeral: true });
            const deletedMessages = await interaction.channel.bulkDelete(amount, true);
            
            await interaction.editReply({
              content: `Successfully deleted ${deletedMessages.size} messages.`,
              ephemeral: true
            });
            
            // Log the action
            this.logAction(interaction, amount, reason, deletedMessages.size, bot);
            
          } catch (error) {
            console.error("Error deleting messages:", error);
            await interaction.editReply({
              content: `Error deleting messages: ${error.message}`,
              ephemeral: true
            });
          }
          
          return;
        }
        
        // If no amount is specified, clone and delete the channel
        if (!skipConfirm) {
          // Confirm with the user first
          const confirmEmbed = new EmbedBuilder()
            .setTitle("⚠️ Confirm Channel Clear")
            .setDescription("You're about to delete ALL messages in this channel by cloning and deleting it.")
            .setColor("#ff9900")
            .addFields(
              { name: "Channel", value: `${interaction.channel.name}` },
              { name: "Reason", value: reason },
              { name: "Warning", value: "This action cannot be undone! Use `/clear confirm:true` to skip this confirmation." }
            );
          
          await interaction.reply({
            embeds: [confirmEmbed],
            ephemeral: true,
            components: [
              {
                type: 1, // Action Row
                components: [
                  {
                    type: 2, // Button
                    style: 4, // Danger
                    customId: `clear_confirm_${interaction.id}`,
                    label: "Confirm Clear All"
                  },
                  {
                    type: 2, // Button
                    style: 2, // Secondary
                    customId: `clear_cancel_${interaction.id}`,
                    label: "Cancel"
                  }
                ]
              }
            ]
          });
          
          // Create a button collector
          const filter = i => i.customId.startsWith('clear_') && i.customId.endsWith(interaction.id);
          
          try {
            const confirmation = await interaction.channel.awaitMessageComponent({
              filter, time: 30000
            });
            
            if (confirmation.customId === `clear_cancel_${interaction.id}`) {
              return confirmation.update({
                content: "Channel clear canceled.",
                embeds: [],
                components: []
              });
            }
            
            // Continue with deletion if confirmed
            await confirmation.update({
              content: "Clearing channel...",
              embeds: [],
              components: []
            });
            
            await this.clearAllMessages(interaction, reason, bot);
            
          } catch (error) {
            // Handle timeout
            if (error.code === 'INTERACTION_COLLECTOR_ERROR') {
              await interaction.editReply({
                content: "Confirmation timed out. Channel clear canceled.",
                embeds: [],
                components: []
              });
            } else {
              console.error("Error with confirmation:", error);
              await interaction.editReply({
                content: `Error: ${error.message}`,
                embeds: [],
                components: []
              });
            }
          }
        } else {
          // Skip confirmation and proceed directly
          await interaction.deferReply({ ephemeral: true });
          await this.clearAllMessages(interaction, reason, bot);
        }
      },
      
      // Clear all messages by cloning and deleting the channel
      async clearAllMessages(interaction, reason, bot) {
        try {
          const oldChannel = interaction.channel;
          const channelName = oldChannel.name;
          const channelPosition = oldChannel.position;
          const channelParent = oldChannel.parent;
          const channelPermissions = oldChannel.permissionOverwrites.cache;
          const channelTopic = oldChannel.topic;
          const channelType = oldChannel.type;
          
          // Create a new channel with the same settings
          const newChannel = await oldChannel.clone({
            name: channelName,
            topic: channelTopic,
            type: channelType,
            parent: channelParent ? channelParent.id : null,
            position: channelPosition,
            reason: `Channel clear requested by ${interaction.user.tag}: ${reason}`
          });
          
          // Delete the old channel
          await oldChannel.delete(`Channel clear requested by ${interaction.user.tag}: ${reason}`);
          
          // Send confirmation message to the new channel
          const confirmEmbed = new EmbedBuilder()
            .setTitle("🧹 Channel Cleared")
            .setDescription(`This channel has been cleared by ${interaction.user}.`)
            .setColor("#00ff00")
            .addFields(
              { name: "Reason", value: reason }
            )
            .setTimestamp();
          
          await newChannel.send({ embeds: [confirmEmbed] });
          
          // Log the action
          this.logAction(interaction, "ALL", reason, null, bot, newChannel);
          
        } catch (error) {
          console.error("Error clearing channel:", error);
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply({
              content: `Error clearing channel: ${error.message}`,
              ephemeral: true
            });
          } else {
            await interaction.reply({
              content: `Error clearing channel: ${error.message}`,
              ephemeral: true
            });
          }
        }
      },
      
      // Log the clear action
      async logAction(interaction, amount, reason, deleted, bot, newChannel = null) {
        // Check if logger module exists
        const loggerModule = bot.moduleLoader.getModule("logger");
        if (!loggerModule) return;
        
        // Get the log channel
        const guild = interaction.guild;
        const logChannel = await loggerModule.getLogChannel(guild.id);
        if (!logChannel) return;
        
        // Create log embed
        const logEmbed = new EmbedBuilder()
          .setTitle("🧹 Channel Clear")
          .setColor("#ff9900")
          .addFields(
            { name: "Moderator", value: `${interaction.user.tag} (${interaction.user.id})` },
            { name: "Channel", value: newChannel ? `${newChannel.name} (cloned)` : `${interaction.channel.name}` },
            { name: "Amount", value: amount === "ALL" ? "All messages (channel cloned)" : `${deleted} messages` },
            { name: "Reason", value: reason }
          )
          .setTimestamp();
        
        // Send log
        await logChannel.send({ embeds: [logEmbed] });
      }
    },
    
    // Legacy command (text-based)
    {
      name: "cc",
      description: "Clear all messages from the current channel (shorthand)",
      legacy: true,
      async legacyExecute(message, args, bot) {
        // Check if user has administrator or manage messages permissions
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && 
            !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return message.reply("You need Administrator or Manage Messages permissions to use this command.");
        }
        
        // Check if channel is a text channel
        if (!message.channel.isTextBased()) {
          return message.reply("This command can only be used in text channels.");
        }
        
        // Parse arguments
        let amount = null;
        let reason = "No reason provided";
        let skipConfirm = false;
        
        if (args.length > 0) {
          // Check if first argument is a number
          if (!isNaN(args[0]) && parseInt(args[0]) > 0) {
            amount = parseInt(args[0]);
            if (amount > 100) amount = 100;
            args.shift();
          }
          
          // Check for -y flag for skip confirmation
          const yesIndex = args.indexOf('-y');
          if (yesIndex !== -1) {
            skipConfirm = true;
            args.splice(yesIndex, 1);
          }
          
          // Remaining args are the reason
          if (args.length > 0) {
            reason = args.join(' ');
          }
        }
        
        // If amount is specified, use bulkDelete method
        if (amount) {
          try {
            const statusMsg = await message.reply(`Deleting ${amount} messages...`);
            
            // Delete messages
            const deletedMessages = await message.channel.bulkDelete(amount, true);
            
            // Edit status message or send new one if the status message was deleted
            try {
              await statusMsg.edit(`Successfully deleted ${deletedMessages.size} messages.`);
              // Delete status message after 5 seconds
              setTimeout(() => statusMsg.delete().catch(console.error), 5000);
            } catch (error) {
              // Status message was probably deleted in the bulk delete
              const newStatusMsg = await message.channel.send(`Successfully deleted ${deletedMessages.size} messages.`);
              setTimeout(() => newStatusMsg.delete().catch(console.error), 5000);
            }
            
            // Log the action
            this.logAction({ user: message.author, guild: message.guild, channel: message.channel }, 
                          amount, reason, deletedMessages.size, bot);
            
          } catch (error) {
            console.error("Error deleting messages:", error);
            message.reply(`Error deleting messages: ${error.message}`);
          }
          
          return;
        }
        
        // If no amount is specified, proceed with channel clone and delete
        if (!skipConfirm) {
          // Confirm with the user first
          const confirmMsg = await message.reply(
            "⚠️ **Warning**: You're about to delete ALL messages in this channel by cloning and deleting it.\n" +
            `**Channel**: #${message.channel.name}\n` +
            `**Reason**: ${reason}\n\n` +
            "Reply with **confirm** in the next 30 seconds to proceed, or anything else to cancel."
          );
          
          // Create a message collector
          const filter = m => m.author.id === message.author.id;
          const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });
          
          collector.on('collect', async m => {
            if (m.content.toLowerCase() === 'confirm') {
              await m.delete().catch(console.error);
              await confirmMsg.edit("Clearing channel...");
              
              await this.clearAllMessages({ 
                user: message.author, 
                guild: message.guild, 
                channel: message.channel 
              }, reason, bot);
            } else {
              await confirmMsg.edit("Channel clear canceled.");
              setTimeout(() => confirmMsg.delete().catch(console.error), 5000);
            }
          });
          
          collector.on('end', (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
              confirmMsg.edit("Confirmation timed out. Channel clear canceled.");
              setTimeout(() => confirmMsg.delete().catch(console.error), 5000);
            }
          });
        } else {
          // Skip confirmation and proceed directly
          const statusMsg = await message.reply("Clearing channel...");
          
          await this.clearAllMessages({ 
            user: message.author, 
            guild: message.guild, 
            channel: message.channel 
          }, reason, bot);
        }
      },
      
      // Clear all messages by cloning and deleting the channel
      async clearAllMessages(context, reason, bot) {
        try {
          const oldChannel = context.channel;
          const channelName = oldChannel.name;
          const channelPosition = oldChannel.position;
          const channelParent = oldChannel.parent;
          const channelPermissions = oldChannel.permissionOverwrites.cache;
          const channelTopic = oldChannel.topic;
          const channelType = oldChannel.type;
          
          // Create a new channel with the same settings
          const newChannel = await oldChannel.clone({
            name: channelName,
            topic: channelTopic,
            type: channelType,
            parent: channelParent ? channelParent.id : null,
            position: channelPosition,
            reason: `Channel clear requested by ${context.user.tag}: ${reason}`
          });
          
          // Delete the old channel
          await oldChannel.delete(`Channel clear requested by ${context.user.tag}: ${reason}`);
          
          // Send confirmation message to the new channel
          const confirmEmbed = new EmbedBuilder()
            .setTitle("🧹 Channel Cleared")
            .setDescription(`This channel has been cleared by ${context.user}.`)
            .setColor("#00ff00")
            .addFields(
              { name: "Reason", value: reason }
            )
            .setTimestamp();
          
          await newChannel.send({ embeds: [confirmEmbed] });
          
          // Log the action
          this.logAction(context, "ALL", reason, null, bot, newChannel);
          
        } catch (error) {
          console.error("Error clearing channel:", error);
          // Cannot reply since the channel is deleted
        }
      },
      
      // Log the clear action
      async logAction(context, amount, reason, deleted, bot, newChannel = null) {
        // Check if logger module exists
        const loggerModule = bot.moduleLoader.getModule("logger");
        if (!loggerModule) return;
        
        // Get the log channel
        const guild = context.guild;
        const logChannel = await loggerModule.getLogChannel(guild.id);
        if (!logChannel) return;
        
        // Create log embed
        const logEmbed = new EmbedBuilder()
          .setTitle("🧹 Channel Clear")
          .setColor("#ff9900")
          .addFields(
            { name: "Moderator", value: `${context.user.tag} (${context.user.id})` },
            { name: "Channel", value: newChannel ? `${newChannel.name} (cloned)` : `${context.channel.name}` },
            { name: "Amount", value: amount === "ALL" ? "All messages (channel cloned)" : `${deleted} messages` },
            { name: "Reason", value: reason }
          )
          .setTimestamp();
        
        // Send log
        await logChannel.send({ embeds: [logEmbed] });
      }
    }
  ]
};