// modules/werewolf/handlers/commandHandlers.js
const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const WerewolfGame = require('../game');
const messageUtils = require('../utils/messageUtils');
const buttonHandlers = require('./buttonHandlers');
const ttsUtils = require('../utils/ttsUtils');


/**
 * Handle voice channel selection for TTS
 * @param {Interaction|Message} source - Discord interaction or message
 * @param {Map} activeGames - Map of active games
 * @param {boolean} isLegacy - Whether this is a legacy command
 */
async function handleVoiceCommand(source, activeGames, isLegacy = false) {
  const channelId = source.channelId;
  const game = activeGames.get(channelId);
  
  if (!game) {
    const response = "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }
  
  const user = isLegacy ? source.author : source.user;
  
  // Check if user is in a voice channel
  const member = source.guild.members.cache.get(user.id);
  if (!member || !member.voice.channel) {
    const response = "Bạn cần vào một kênh thoại trước để kích hoạt chức năng đọc.";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }
  
  // Check if the user is the host or has administrator permissions
  const isHost = game.host.id === user.id;
  const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
  
  if (!isHost && !isAdmin) {
    const response = "Chỉ người tạo trò chơi hoặc quản trị viên mới có thể bật chức năng đọc.";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }
  
  // Set the voice channel for the game
  game.setVoiceChannel(member.voice.channel);
  
  // Test TTS by saying a welcome message
  try {
    await ttsUtils.speak(member.voice.channel, "Chức năng đọc cho trò chơi Ma Sói đã được kích hoạt.");
    
    const response = `Chức năng đọc đã kích hoạt trên kênh thoại ${member.voice.channel.name}.`;
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply(response);
    }
  } catch (error) {
    console.error("Error setting up TTS:", error);
    
    const response = "Có lỗi xảy ra khi kích hoạt chức năng đọc. Vui lòng thử lại sau.";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

/**
 * Handle werewolf create command with voice support
 * @param {Interaction|Message} source - Discord interaction or message
 * @param {Object} bot - Bot instance
 * @param {Map} activeGames - Map of active games
 * @param {boolean} isLegacy - Whether this is a legacy command
 * @param {boolean} useVoice - Whether to use voice features
 */
async function handleCreateCommand(source, bot, activeGames, isLegacy = false, useVoice = false) {
  const channelId = source.channelId;

  // Check if there's already a game in this channel
  if (activeGames.has(channelId)) {
    const response = "Đã có trò chơi Ma Sói đang diễn ra trong kênh này!";
    if (isLegacy) {
      console.log(activeGames);
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  // Try to find the author's voice channel if voice is enabled
  let voiceChannel = null;
  if (useVoice) {
    const member = isLegacy ? source.member : source.member;
    voiceChannel = member?.voice?.channel;

    if (!voiceChannel) {
      const noVoiceResponse = "Bạn cần vào một kênh voice để sử dụng tính năng voice. Trò chơi sẽ được tạo mà không có tính năng voice.";
      if (isLegacy) {
        await source.reply(noVoiceResponse);
      } else {
        await source.reply({
          content: noVoiceResponse,
          flags: MessageFlags.Ephemeral
        });
      }
      useVoice = false;
    }
  }

  // Create a new game
  const game = new WerewolfGame(source.channel, isLegacy ? source.author : source.user);
  activeGames.set(channelId, game);

  // Add the host to the game
  game.addPlayer(isLegacy ? source.author : source.user);

  // Connect to voice channel if requested
  if (useVoice && voiceChannel) {
    const voiceConnected = await game.connectVoice(voiceChannel);
    if (voiceConnected) {
      console.log(`Connected to voice channel: ${voiceChannel.name}`);
    }
  }

  // Create a lobby message with join button
  const { embed, components } = messageUtils.createLobbyMessage(game);

  let message;
  if (isLegacy) {
    message = await source.channel.send({
      embeds: [embed],
      components
    });
  } else {
    message = await source.reply({
      embeds: [embed],
      components,
      fetchReply: true
    });
  }

  // Store the message ID for later updates
  game.messageId = message.id;
}


/**
 * Handle werewolf join command
 * @param {Interaction|Message} source - Discord interaction or message
 * @param {Map} activeGames - Map of active games
 * @param {boolean} isLegacy - Whether this is a legacy command
 */
async function handleJoinCommand(source, activeGames, isLegacy = false) {
  const channelId = source.channelId;
  const game = activeGames.get(channelId);

  if (!game) {
    const response = "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (game.state !== 'LOBBY') {
    const response = "Trò chơi đã bắt đầu, không thể tham gia lúc này!";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  const user = isLegacy ? source.author : source.user;
  const success = game.addPlayer(user);

  if (success) {
    const response = `${user} đã tham gia trò chơi Ma Sói!`;
    if (isLegacy) {
      await source.reply(response);
    } else {
      await source.reply(response);
    }
    await buttonHandlers.updateLobbyMessage(game);
  } else {
    const response = "Bạn đã tham gia trò chơi này!";
    if (isLegacy) {
      await source.reply(response);
    } else {
      await source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }
}

/**
 * Handle werewolf start command
 * @param {Interaction|Message} source - Discord interaction or message
 * @param {Map} activeGames - Map of active games
 * @param {boolean} isLegacy - Whether this is a legacy command
 * @param {number} aiPlayerCount - Number of AI players to add (optional)
 */
async function handleStartCommand(source, activeGames, isLegacy = false, aiPlayerCount = 0) {
  const channelId = source.channelId;
  const game = activeGames.get(channelId);

  if (!game) {
    const response = "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  const userId = isLegacy ? source.author.id : source.user.id;
  if (game.host.id !== userId) {
    const response = "Chỉ người tạo trò chơi mới có thể bắt đầu!";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  if (game.state !== 'LOBBY') {
    const response = "Trò chơi đã bắt đầu!";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  let loadingMsg;
  if (isLegacy) {
    loadingMsg = await source.reply("Đang khởi động trò chơi...");
  } else {
    await source.deferReply();
  }

  const result = await game.start(aiPlayerCount);

  if (result.success) {
    let response = "Trò chơi Ma Sói đã bắt đầu! Mỗi người chơi sẽ nhận được tin nhắn riêng với vai trò của mình.";

    // Add info about AI players if they were added
    const aiPlayers = Object.values(game.players).filter(p => p.isAI);
    if (aiPlayers.length > 0) {
      response += `\n\n${aiPlayers.length} Bot đã tham gia để đủ số lượng người chơi.`;
    }

    if (isLegacy) {
      if (loadingMsg) {
        await loadingMsg.edit(response);
      } else {
        await source.channel.send(response);
      }
    } else {
      await source.editReply(response);
    }

    // Disable the lobby buttons if possible
    try {
      const message = await source.channel.messages.fetch(game.messageId);
      if (message) {
        await message.edit({ components: [] });
      }
    } catch (error) {
      console.error("Error disabling lobby buttons:", error);
    }
  } else {
    if (isLegacy) {
      if (loadingMsg) {
        await loadingMsg.edit(result.message);
      } else {
        await source.reply(result.message);
      }
    } else {
      await source.editReply({
        content: result.message
      });
    }
  }
}

/**
 * Handle werewolf cancel command
 * @param {Interaction|Message} source - Discord interaction or message
 * @param {Map} activeGames - Map of active games
 * @param {boolean} isLegacy - Whether this is a legacy command 
 */
async function handleCancelCommand(source, activeGames, isLegacy = false) {
  const channelId = source.channelId;
  const game = activeGames.get(channelId);

  if (!game) {
    const response = "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  const userId = isLegacy ? source.author.id : source.user.id;
  if (game.host.id !== userId) {
    const response = "Chỉ người tạo trò chơi mới có thể hủy!";
    if (isLegacy) {
      return source.reply(response);
    } else {
      return source.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    }
  }

  // Clean up game resources before removing from map
  if (typeof game.cleanup === 'function') {
    game.cleanup();
  }

  // Set state to ENDED before removing from map
  game.state = 'ENDED';

  // Remove from active games
  activeGames.delete(channelId);

  const response = "Trò chơi Ma Sói đã bị hủy.";
  if (isLegacy) {
    await source.reply(response);
  } else {
    await source.reply(response);
  }
}

/**
 * Handle werewolf help command
 * @param {Interaction|Message} source - Discord interaction or message
 * @param {boolean} isLegacy - Whether this is a legacy command
 */
async function handleHelpCommand(source, isLegacy = false) {
  const embed = messageUtils.createHelpEmbed(isLegacy);

  if (isLegacy) {
    await source.reply({ embeds: [embed] });
  } else {
    await source.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral
    });
  }
}

/**
 * Handle main slash command
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} bot - Bot instance
 * @param {Map} activeGames - Map of active games
 */
async function handleSlashCommand(interaction, bot, activeGames) {
  const action = interaction.options.getString("action") || "create";
  // Get AI player count if provided
  const aiPlayerCount = interaction.options.getInteger("bots") || 0;
  
  switch (action) {
    case "create":
      await handleCreateCommand(interaction, bot, activeGames);
      break;
    case "join":
      await handleJoinCommand(interaction, activeGames);
      break;
    case "start":
      await handleStartCommand(interaction, activeGames, false, aiPlayerCount);
      break;
    case "cancel":
      await handleCancelCommand(interaction, activeGames);
      break;
    case "voice":
      await handleVoiceCommand(interaction, activeGames);
      break;
    case "help":
      await handleHelpCommand(interaction);
      break;
    default:
      await interaction.reply({
        content: "Hành động không hợp lệ!",
        flags: MessageFlags.Ephemeral
      });
  }
}


/**
 * Handle legacy command
 * @param {Message} message - Discord message
 * @param {Array} args - Command arguments
 * @param {Object} bot - Bot instance
 * @param {Map} activeGames - Map of active games
 */
async function handleLegacyCommand(message, args, bot, activeGames) {
  const action = args[0] || "create";
  
  // Check if there's a number parameter for AI players
  let aiPlayerCount = 0;
  for (let i = 1; i < args.length; i++) {
    const num = parseInt(args[i]);
    if (!isNaN(num) && num > 0) {
      aiPlayerCount = num;
      break;
    }
  }
  
  switch (action) {
    case "create":
    case "tao":
      await handleCreateCommand(message, bot, activeGames, true);
      break;
    case "join":
    case "thamgia":
      await handleJoinCommand(message, activeGames, true);
      break;
    case "start":
    case "batdau":
      await handleStartCommand(message, activeGames, true, aiPlayerCount);
      break;
    case "cancel":
    case "huy":
      await handleCancelCommand(message, activeGames, true);
      break;
    case "voice":
    case "thoai":
      await handleVoiceCommand(message, activeGames, true);
      break;
    case "help":
    case "huongdan":
      await handleHelpCommand(message, true);
      break;
    default:
      await message.reply("Hành động không hợp lệ! Dùng `!werewolf help` để xem các lệnh có sẵn.");
  }
}

module.exports = {
  handleSlashCommand,
  handleLegacyCommand,
  handleCreateCommand,
  handleJoinCommand,
  handleStartCommand,
  handleCancelCommand,
  handleVoiceCommand,
  handleHelpCommand
};