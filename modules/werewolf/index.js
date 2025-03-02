// modules/werewolf/index.js
const { MessageFlags, EmbedBuilder } = require('discord.js');
const { CUSTOM_ID } = require('./constants');
const buttonHandlers = require('./handlers/buttonHandlers');
const selectMenuHandlers = require('./handlers/selectMenuHandlers');
const commandHandlers = require('./handlers/commandHandlers');

// Map to store active games by channel ID
const activeGames = new Map();

module.exports = {
  meta: {
    name: "werewolf",
    type: "game",
    version: "2.1.0",
    description: "Trò chơi Ma Sói trong Discord",
    dependencies: [],
    npmDependencies: {}
  },

  // Module initialization
  async init(client, bot) {
    console.log("Module Ma Sói đã khởi tạo!");

    // Set up auto-cleanup interval for ended games
    setInterval(() => {
      // Check for any games that have ended but not been removed from the map
      for (const [channelId, game] of activeGames.entries()) {
        if (game.state === 'ENDED') {
          console.log(`Auto-removing ended game from channel ${channelId}`);
          activeGames.delete(channelId);
          // Notify the channel that the game is cleaned up
          // Send a message for players to wait for the game to be cleaned up
          const cleanedUpEmbed = new EmbedBuilder()
            .setTitle("🧹 Trò Chơi Kết Thúc")
            .setDescription("Trò chơi đã dọn dẹp xong. Bạn có thể bắt đầu trò chơi mới hoặc tham gia trò chơi khác.")
            .setColor("#2f3136");
          game.channel.send({ embeds: [cleanedUpEmbed] }).catch(console.error);
        }
      }
    }, 30000); // Check every half minute

    // Set up button and select menu interaction handlers
    client.on('interactionCreate', async (interaction) => {
      try {
        // Handle button interactions
        if (interaction.isButton()) {
          const game = activeGames.get(interaction.channelId);

          if (interaction.customId === CUSTOM_ID.JOIN_BUTTON) {
            await buttonHandlers.handleJoinButton(interaction, game);
          } else if (interaction.customId === CUSTOM_ID.START_BUTTON) {
            await buttonHandlers.handleStartButton(interaction, game);
          } else if (interaction.customId.startsWith(CUSTOM_ID.VOTE_PREFIX)) {
            await buttonHandlers.handleVoteButton(interaction, game);
          }
        }

        // Handle select menu interactions
        if (interaction.isStringSelectMenu()) {
          if (interaction.customId.startsWith(CUSTOM_ID.ACTION_PREFIX)) {
            await selectMenuHandlers.handleNightActionSelect(interaction, activeGames);
          } else if (interaction.customId.startsWith(CUSTOM_ID.HUNTER_PREFIX)) {
            await selectMenuHandlers.handleHunterSelect(interaction, activeGames);
          } else if (interaction.customId.startsWith(CUSTOM_ID.WITCH_KILL_PREFIX)) {
            await selectMenuHandlers.handleWitchKillSelect(interaction, activeGames);
          }
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
        // Try to respond to the interaction if we haven't already
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content: "Có lỗi xảy ra khi xử lý tương tác.",
              flags: MessageFlags.Ephemeral
            });
          } catch (e) {
            console.error("Failed to respond to interaction after error:", e);
          }
        }
      }
    });
  },

  // Module shutdown
  // Add clean shutdown with TTS
  // Update the shutdown method completely:
  async shutdown() {
    console.log("Module Ma Sói đang tắt!");

    // Import TTS utils for disconnection
    try {
      const ttsUtils = require('./utils/ttsUtils');
      // Disconnect from all voice channels
      ttsUtils.disconnectAll();
    } catch (error) {
      console.error("Error disconnecting voice channels:", error);
    }

    // Clean up any active games
    for (const [channelId, game] of activeGames.entries()) {
      console.log(`Cleaning up game in channel ${channelId}`);

      // Send an embedded message to the channel to notify players that the game is cleaning up
      // const cleanupEmbed = new EmbedBuilder()
      //   .setTitle("🧹 Trò Chơi Kết Thúc")
      //   .setDescription("Trò chơi đã kết thúc. Vui lòng chờ để chúng tôi dọn dẹp.")
      //   .setColor("#2f3136");

      try {
        await game.channel.send({ embeds: [cleanupEmbed] });
      } catch (error) {
        console.error(`Error sending cleanup message to channel ${channelId}:`, error);
      }

      // Clean up game timers and resources
      if (typeof game.cleanup === 'function') {
        game.cleanup();
      }

      // Set state to ENDED
      game.state = 'ENDED';

      // Try to send a cleanup message
      try {
        await game.channel.send({
          content: "Trò chơi Ma Sói đã bị buộc dừng do bot khởi động lại hoặc bảo trì hệ thống."
        });
      } catch (error) {
        console.error(`Error sending game shutdown message to channel ${channelId}:`, error);
      }
    }

    // Clear all games
    activeGames.clear();
  },

  // Commands
  commands: [
    {
      name: "werewolf",
      description: "Bắt đầu trò chơi Ma Sói",
      data: {
        name: "werewolf",
        description: "Bắt đầu trò chơi Ma Sói",
        options: [
          {
            name: "action",
            description: "Hành động",
            type: 3, // STRING
            required: false,
            choices: [
              { name: "Kích hoạt giọng nói", value: "voice" },
              { name: "Tạo trò chơi mới", value: "create" },
              { name: "Tham gia", value: "join" },
              { name: "Bắt đầu", value: "start" },
              { name: "Hủy", value: "cancel" },
              { name: "Giúp đỡ", value: "help" }
            ]
          },
          {
            name: "bots",
            description: "Số lượng Bot bổ sung (chỉ dùng khi start)",
            type: 4, // INTEGER
            required: false,
            min_value: 0,
            max_value: 12
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        await commandHandlers.handleSlashCommand(interaction, bot, activeGames);
      },

      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        await commandHandlers.handleLegacyCommand(message, args, bot, activeGames);
      }
    },
    // Alias for the main command (shorter name)
    {
      name: "ww",
      description: "Alias cho lệnh Ma Sói (gõ tắt)",
      data: {
        name: "ww",
        description: "Alias cho lệnh Ma Sói (gõ tắt)",
        options: [
          {
            name: "action",
            description: "Hành động",
            type: 3, // STRING
            required: false,
            choices: [
              { name: "Kích hoạt giọng nói", value: "voice" },
              { name: "Tạo trò chơi mới", value: "create" },
              { name: "Tham gia", value: "join" },
              { name: "Bắt đầu", value: "start" },
              { name: "Hủy", value: "cancel" },
              { name: "Giúp đỡ", value: "help" }
            ]
          },
          {
            name: "bots",
            description: "Số lượng Bot bổ sung (chỉ dùng khi start)",
            type: 4, // INTEGER
            required: false,
            min_value: 0,
            max_value: 12
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        await commandHandlers.handleSlashCommand(interaction, bot, activeGames);
      },

      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        await commandHandlers.handleLegacyCommand(message, args, bot, activeGames);
      }
    }
  ]
};