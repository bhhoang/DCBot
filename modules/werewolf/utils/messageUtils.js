// modules/werewolf/utils/messageUtils.js
const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder 
} = require('discord.js');
const { CUSTOM_ID } = require('../constants');
const { getRole } = require('../roles');

/**
 * Create a lobby message for game
 * @param {Object} game - Game instance
 * @returns {Object} - Embed and components for lobby message
 */
function createLobbyMessage(game) {
  const embed = new EmbedBuilder()
    .setTitle("🐺 Trò Chơi Ma Sói")
    .setDescription("Nhấn nút bên dưới để tham gia!")
    .setColor("#9b59b6")
    .addFields(
      { name: "Người Chơi", value: getPlayersList(game) },
      { name: "Cách Chơi", value: "Ma Sói là trò chơi mạo hiểm dựa trên tâm lý. Mỗi người chơi sẽ nhận một vai trò bí mật. Ma Sói sẽ âm thầm ăn thịt dân làng mỗi đêm, trong khi dân làng phải tìm ra và tiêu diệt Ma Sói." }
    );
  
  const joinButton = new ButtonBuilder()
    .setCustomId(CUSTOM_ID.JOIN_BUTTON)
    .setLabel('Tham Gia')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🐺');
  
  const startButton = new ButtonBuilder()
    .setCustomId(CUSTOM_ID.START_BUTTON)
    .setLabel('Bắt Đầu')
    .setStyle(ButtonStyle.Success)
    .setEmoji('🎮');
  
  const row = new ActionRowBuilder().addComponents(joinButton, startButton);
  
  return { embed, components: [row] };
}

/**
 * Get a formatted list of players
 * @param {Object} game - Game instance 
 * @returns {string} - Formatted player list
 */
function getPlayersList(game) {
  if (Object.keys(game.players).length === 0) {
    return "Chưa có người chơi nào tham gia.";
  }
  
  return Object.values(game.players)
    .map(player => `• ${player.name}`)
    .join('\n');
}

/**
 * Create countdown timer embed
 * @param {number} seconds - Seconds remaining
 * @param {string} phase - Current phase name
 * @returns {EmbedBuilder} - Embed for countdown
 */
function createCountdownEmbed(seconds, phase) {
  return new EmbedBuilder()
    .setTitle(`⏱️ ${phase} - Còn lại: ${seconds} giây`)
    .setColor(seconds <= 10 ? "#e74c3c" : "#f1c40f")
    .setDescription(`Thời gian ${phase.toLowerCase()} sẽ kết thúc sau ${seconds} giây.`);
}

/**
 * Create voting embed and components
 * @param {Object} game - Game instance
 * @returns {Object} - Embed and components for voting
 */
function createVotingMessage(game) {
  const embed = new EmbedBuilder()
    .setTitle(`🗳️ Bỏ Phiếu - Ngày ${game.day}`)
    .setDescription("Đã đến lúc bỏ phiếu! Ai sẽ bị treo cổ hôm nay?")
    .setColor("#e74c3c");
  
  // Create voting buttons
  const rows = [];
  const alivePlayers = Object.values(game.players).filter(p => p.isAlive);
  let currentRow = new ActionRowBuilder();
  
  alivePlayers.forEach((player, index) => {
    const button = new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.VOTE_PREFIX}${player.id}`)
      .setLabel(player.name)
      .setStyle(ButtonStyle.Primary);
    
    currentRow.addComponents(button);
    
    // Create a new row every 5 buttons (Discord limit)
    if ((index + 1) % 5 === 0 || index === alivePlayers.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });
  
  // Add a "Skip Vote" button
  if (rows.length > 0 && rows[rows.length - 1].components.length < 5) {
    const skipButton = new ButtonBuilder()
      .setCustomId(CUSTOM_ID.VOTE_SKIP)
      .setLabel('Bỏ Qua')
      .setStyle(ButtonStyle.Secondary);
    
    rows[rows.length - 1].addComponents(skipButton);
  } else {
    const skipButton = new ButtonBuilder()
      .setCustomId(CUSTOM_ID.VOTE_SKIP)
      .setLabel('Bỏ Qua')
      .setStyle(ButtonStyle.Secondary);
    
    rows.push(new ActionRowBuilder().addComponents(skipButton));
  }
  
  return { embed, components: rows };
}

/**
 * Create night status embed
 * @param {Object} game - Game instance
 * @returns {EmbedBuilder} - Embed for night status
 */
function createNightStatusEmbed(game) {
  const currentPhase = game.nightPhase;
  const roleName = currentPhase ? getRole(currentPhase).name : '';
  
  return new EmbedBuilder()
    .setTitle(`🌙 Đêm ${game.day}`)
    .setDescription(`Mọi người đi ngủ. Đang chờ ${roleName} thực hiện hành động...`)
    .setColor("#2f3136");
}

/**
 * Create day results embed
 * @param {Object} game - Game instance
 * @returns {EmbedBuilder} - Embed for day results
 */
function createDayResultsEmbed(game) {
  const embed = new EmbedBuilder()
    .setTitle(`☀️ Ngày ${game.day}`)
    .setColor("#f1c40f");
  
  if (game.deaths.length === 0) {
    embed.setDescription("Mọi người thức dậy an toàn. Không ai bị giết trong đêm qua.");
  } else {
    // Filter out deaths where the player doesn't exist
    const validDeaths = game.deaths.filter(death => game.players[death.playerId]);
    
    if (validDeaths.length === 0) {
      embed.setDescription("Mọi người thức dậy an toàn. Không ai bị giết trong đêm qua.");
    } else {
      const deathMessages = validDeaths.map(death => {
        const player = game.players[death.playerId];
        // Double-check that player exists
        if (!player) {
          console.error(`Player with ID ${death.playerId} not found in game.players`);
          return null;
        }
        
        // Get role safely
        const role = getRole(player.role);
        if (!role) {
          console.error(`Role ${player.role} not found for player ${player.name}`);
          return `**${player.name}** ${death.message}.`;
        }
        
        return `**${player.name}** (${role.name}) ${death.message}.`;
      }).filter(msg => msg !== null); // Remove null entries
      
      embed.setDescription(`Buổi sáng đến và làng làng phát hiện:\n\n${deathMessages.join('\n')}`);
    }
  }
  
  // Add instructions for the day
  embed.addFields(
    { name: "Thảo Luận", value: "Bây giờ là lúc thảo luận. Ai là Ma Sói? Bạn có bằng chứng nào không?" },
    { name: "Thời Gian", value: "Bỏ phiếu sẽ bắt đầu sau 1.5 phút." }
  );
  
  return embed;
}

/**
 * Create voting results embed
 * @param {Object} game - Game instance
 * @param {Object} executed - Player who was executed (null for no execution)
 * @param {boolean} tie - Whether there was a tie
 * @param {number} maxVotes - Maximum number of votes
 * @returns {EmbedBuilder} - Embed for voting results
 */
function createVotingResultsEmbed(game, executed, tie, maxVotes) {
  const embed = new EmbedBuilder()
    .setTitle(`📢 Kết Quả Bỏ Phiếu - Ngày ${game.day}`)
    .setColor("#e74c3c");
  
  // No one voted or tie
  if (!executed || tie || maxVotes === 0) {
    embed.setDescription("Không có ai bị treo cổ do không đủ biểu quyết thống nhất.");
  } else {
    // Someone was executed
    const role = getRole(executed.role);
    embed.setDescription(`**${executed.name}** (${role.name} ${role.emoji}) đã bị treo cổ với ${maxVotes} phiếu bầu.`);
  }
  
  return embed;
}

/**
 * Create game end embed
 * @param {Object} game - Game instance
 * @returns {EmbedBuilder} - Embed for game end
 */
function createGameEndEmbed(game) {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Trò Chơi Kết Thúc - ${game.winner} CHIẾN THẮNG!`)
    .setColor(game.winner === "MA SÓI" ? "#ff0000" : "#00b0f4");
  
  // Create description with all players and their roles
  const playersList = Object.values(game.players)
    .map(player => {
      const role = getRole(player.role);
      const status = player.isAlive ? "Còn sống" : "Đã chết";
      return `**${player.name}** - ${role.name} ${role.emoji} (${status})`;
    })
    .join('\n');
  
  embed.setDescription(`**Danh sách người chơi:**\n${playersList}`);
  
  return embed;
}

/**
 * Create help embed
 * @returns {EmbedBuilder} - Embed for help message
 */
function createHelpEmbed(isLegacy = false) {
  const prefix = isLegacy ? "!" : "/";
  
  const embed = new EmbedBuilder()
    .setTitle("🐺 Trò Chơi Ma Sói - Trợ Giúp")
    .setColor("#9b59b6")
    .addFields(
      { name: "Tạo Trò Chơi", value: `${prefix}werewolf create - Tạo trò chơi mới` },
      { name: "Tham Gia", value: `${prefix}werewolf join - Tham gia trò chơi` },
      { name: "Bắt Đầu", value: `${prefix}werewolf start [số lượng bot] - Bắt đầu trò chơi (chỉ người tạo)` },
      { name: "Hủy", value: `${prefix}werewolf cancel - Hủy trò chơi (chỉ người tạo)` },
      { name: "Bot Tự Động", value: `Bạn có thể thêm bot để đủ người chơi bằng cách thêm số lượng sau lệnh start\nVí dụ: ${prefix}werewolf start 8` },
      { name: "Vai Trò", value: "Ma Sói 🐺, Dân Làng 👨‍🌾, Tiên Tri 👁️, Bảo Vệ 🛡️, Phù Thủy 🧙‍♀️, Thợ Săn 🏹" }
    );
    
  return embed;
}

module.exports = {
  createLobbyMessage,
  getPlayersList,
  createCountdownEmbed,
  createVotingMessage,
  createNightStatusEmbed,
  createDayResultsEmbed,
  createVotingResultsEmbed,
  createGameEndEmbed,
  createHelpEmbed
};