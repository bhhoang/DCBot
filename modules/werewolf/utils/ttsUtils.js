// modules/werewolf/utils/ttsUtils.js
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const googleTTS = require('google-tts-api');
const axios = require('axios');
const { Readable } = require('stream');

// Store active connections
const activeConnections = new Map();

/**
 * Convert text to speech using Google TTS API and play it in a voice channel
 * @param {Object} channel - Voice channel to join
 * @param {string} text - Text to speak
 * @param {string} language - Language code (default: 'vi', Vietnamese)
 * @returns {Promise<void>}
 */
async function speak(channel, text, language = 'vi') {
  try {
    // FIXED: Skip if text is empty or undefined
    if (!text || text.trim() === '') {
      console.log('[DEBUG-TTS] Empty text received, skipping TTS');
      return;
    }
    
    if (!channel) {
      console.error('Cannot speak: No voice channel provided');
      return;
    }

    // Get or create connection
    let connection = activeConnections.get(channel.guild.id);
    let player;

    if (!connection) {
      // Create new connection
      connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });

      // Create audio player
      player = createAudioPlayer();
      connection.subscribe(player);

      // Store connection and player
      activeConnections.set(channel.guild.id, {
        connection,
        player,
        channelId: channel.id
      });
    } else {
      // Get existing player
      player = connection.player;

      // If the channel changed, update the connection
      if (connection.channelId !== channel.id) {
        connection.connection.destroy();
        connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator,
        });

        player = createAudioPlayer();
        connection.subscribe(player);

        activeConnections.set(channel.guild.id, {
          connection,
          player,
          channelId: channel.id
        });
      }
    }

    // Get audio URL from Google TTS API
    // We need to break text into chunks of 200 characters due to API limitations
    const MAX_CHARS = 200;
    const textChunks = [];

    for (let i = 0; i < text.length; i += MAX_CHARS) {
      textChunks.push(text.substring(i, i + MAX_CHARS));
    }

    // Process each chunk sequentially
    for (const chunk of textChunks) {
      // Fixed: Use the correct function call for googleTTS
      const url = googleTTS.getAudioUrl(chunk, {
        lang: language,
        slow: false,
        host: 'https://translate.google.com',
      });

      // Download audio content
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer',
      });

      // Create a readable stream from buffer
      const audioStream = new Readable();
      audioStream.push(Buffer.from(response.data));
      audioStream.push(null); // End of stream

      // Create audio resource and play
      const resource = createAudioResource(audioStream);
      player.play(resource);

      // Wait for audio to finish playing before proceeding to next chunk
      await new Promise((resolve) => {
        const onStateChange = (oldState, newState) => {
          if (
            newState.status === AudioPlayerStatus.Idle &&
            oldState.status !== AudioPlayerStatus.Idle
          ) {
            player.removeListener('stateChange', onStateChange);
            resolve();
          }
        };

        player.on('stateChange', onStateChange);
      });
    }
  } catch (error) {
    console.error('Error playing TTS:', error);
  }
}

/**
 * Disconnect from voice channel
 * @param {string} guildId - Discord guild ID 
 */
function disconnect(guildId) {
  const connection = activeConnections.get(guildId);

  if (connection) {
    connection.connection.destroy();
    activeConnections.delete(guildId);
  }
}

/**
 * Disconnect from all voice channels
 */
function disconnectAll() {
  for (const [guildId, connection] of activeConnections.entries()) {
    connection.connection.destroy();
  }

  activeConnections.clear();
}

/**
 * Format text for TTS by removing markdown, emojis, and other formatting
 * @param {string} text - Text to format
 * @returns {string} - Formatted text
 */
function formatTextForTTS(text) {
  // Remove markdown formatting
  let formattedText = text
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/\*(.*?)\*/g, '$1')     // Remove italic
    .replace(/__(.*?)__/g, '$1')     // Remove underline
    .replace(/~~(.*?)~~/g, '$1')     // Remove strikethrough
    .replace(/```(.*?)```/g, '')     // Remove code blocks
    .replace(/`(.*?)`/g, '')         // Remove inline code
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links, keep text
    .replace(/\[(.*?)\)/g, '')       // Remove footnotes
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '') // Remove emojis and special characters
    .replace(/https?:\/\/\S+/g, ''); // Remove URLs

  return formattedText;
}

/**
 * Get the narrative announcement for a specific night phase/role
 * @param {string} roleId - The role ID for the current phase
 * @param {number} day - Current game day
 * @param {Object} gameState - Optional game state for checking role existence
 * @returns {string} - Thematic narrative announcement
 */
function getNightPhaseAnnouncement(roleId, day, gameState = null) {
  // FIXED: If gameState is provided, check if there are actually players with this role
  if (gameState && roleId) {
    const playersWithRole = gameState.getAlivePlayersWithRole(roleId);
    if (playersWithRole.length === 0) {
      console.log(`[DEBUG-TTS] Skipping announcement for ${roleId} - no alive players with this role`);
      return '';  // Return empty string to skip announcement
    }
  }
  
  const dayText = convertNumberToVietnamese(day);
  
  switch (roleId) {
    case 'WEREWOLF':
    case 'CURSED_WEREWOLF':
      return `Đêm ${dayText} đã đến. Mọi người nhắm mắt lại. Sói ơi, hãy thức dậy và chọn nạn nhân của mình.`;
    
    case 'SEER':
      return `Sói đã đi ngủ. Tiên tri ơi, hãy thức dậy và sử dụng khả năng tiên tri của mình.`;
    
    case 'BODYGUARD':
      return `Tiên tri đã đi ngủ. Bảo vệ ơi, hãy thức dậy và chọn người bạn muốn bảo vệ đêm nay. Nhớ rằng, bạn không thể bảo vệ cùng một người trong hai đêm liên tiếp.`;
    
    case 'WITCH':
      return `Bảo vệ đã đi ngủ. Phù thủy ơi, hãy thức dậy và sử dụng bình thuốc của mình nếu muốn.`;
    
    case 'HUNTER':
      return `Thợ săn ơi, hãy chọn một người để bắn trước khi bạn ra đi.`;
    
    default:
      return `Đêm ${dayText} đã đến. Mọi người hãy nhắm mắt lại.`;
  }
}

/**
 * Convert a number to Vietnamese text
 * @param {number} num - Number to convert
 * @returns {string} - Vietnamese text representation
 */
function convertNumberToVietnamese(num) {
  const numbers = [
    'không', 'một', 'hai', 'ba', 'bốn',
    'năm', 'sáu', 'bảy', 'tám', 'chín',
    'mười', 'mười một', 'mười hai', 'mười ba', 'mười bốn',
    'mười lăm', 'mười sáu', 'mười bảy', 'mười tám', 'mười chín',
    'hai mươi'
  ];

  if (num >= 0 && num <= 20) {
    return numbers[num];
  }

  // If greater than 20, just return the number
  return num.toString();
}

/**
 * Extract key information from game state for TTS
 * @param {Object} game - Game state
 * @param {string} type - Type of announcement
 * @returns {string} - Formatted text to speak
 */
function getGameAnnouncementText(game, type) {
  let text = '';

  switch (type) {
    case 'night-start':
      text = `Đêm ${convertNumberToVietnamese(game.day)} bắt đầu. Mọi người hãy nhắm mắt lại.`;
      break;

    case 'night-phase':
      // FIXED: Check if the current phase has any alive players
      const hasPlayersWithRole = game.nightPhase && 
        game.getAlivePlayersWithRole(game.nightPhase).length > 0;
      
      if (hasPlayersWithRole) {
        // This is for specific role announcements during night
        text = getNightPhaseAnnouncement(game.nightPhase, game.day);
      } else {
        // If no players with this role, don't make a specific announcement
        console.log(`[DEBUG-TTS] Skipping announcement for ${game.nightPhase} - no alive players with this role`);
        text = '';
      }
      break;

    case 'day-start':
      // Announce deaths
      if (game.deaths.length === 0) {
        text = `Mặt trời đã mọc. Đêm qua không ai bị giết. Mọi người hãy mở mắt và thảo luận. Bỏ phiếu sẽ bắt đầu sau một phút rưỡi.`;
      } else {
        const deathMessages = game.deaths.map(death => {
          const player = game.players[death.playerId];
          if (!player) return '';

          const role = getRole(player.role);
          if (!role) return `${player.name} ${death.message}.`;

          return `${player.name}, vai ${role.name}, ${death.message}.`;
        }).filter(msg => msg !== '');

        if (deathMessages.length > 0) {
          text = `Mặt trời đã mọc. Trong đêm qua, ${deathMessages.join('. ')}. Mọi người hãy thảo luận để tìm ra Ma Sói. Bỏ phiếu sẽ bắt đầu sau một phút rưỡi.`;
        } else {
          text = `Mặt trời đã mọc. Đêm qua không ai bị giết. Mọi người hãy mở mắt và thảo luận. Bỏ phiếu sẽ bắt đầu sau một phút rưỡi.`;
        }
      }
      break;

    case 'voting-start':
      text = `Thời gian thảo luận đã kết thúc. Giờ là lúc bỏ phiếu chọn người mà bạn nghĩ là Ma Sói. Thời gian bỏ phiếu là một phút.`;
      break;

    case 'voting-result':
      if (game.executedPlayer) {
        const player = game.executedPlayer;
        const role = getRole(player.role);
        text = `Kết quả bỏ phiếu: ${player.name}, vai ${role.name}, đã bị treo cổ với ${player.voteCount} phiếu bầu.`;
      } else {
        text = `Không ai bị treo cổ lần này vì không đủ phiếu bầu.`;
      }
      break;

    case 'game-end':
      if (game.winner === "MA SÓI") {
        text = `Trò chơi kết thúc. Ma Sói đã chiến thắng! Dân làng đã không thể tìm ra hết tất cả sói.`;
      } else {
        text = `Trò chơi kết thúc. Dân làng đã chiến thắng! Tất cả sói đã bị tiêu diệt.`;
      }
      break;

    case 'phase-countdown':
      if (game.countdown <= 10 && game.countdown > 0) {
        text = `${convertNumberToVietnamese(game.countdown)}`;
      }
      break;
  }

  return text;
}

/**
 * Get role information from role ID
 * @param {string} roleId - Role ID
 * @returns {Object|null} - Role object or null
 */
function getRole(roleId) {
  try {
    const { getRole } = require('../roles');
    return getRole(roleId);
  } catch (error) {
    console.error('Error getting role:', error);
    return null;
  }
}

module.exports = {
  speak,
  disconnect,
  disconnectAll,
  formatTextForTTS,
  getGameAnnouncementText,
  getNightPhaseAnnouncement
};