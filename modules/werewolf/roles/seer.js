// modules/werewolf/roles/seer.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const BaseRole = require('./baseRole');
const { NIGHT_PHASE, TEAM, CUSTOM_ID } = require('../constants');

class Seer extends BaseRole {
  constructor() {
    super();
    this.id = 'SEER';
    this.name = 'Tiên Tri';
    this.description = 'Mỗi đêm, bạn có thể nhìn thấy vai trò của một người chơi khác';
    this.team = TEAM.VILLAGER;
    this.nightAction = true;
    this.emoji = '👁️';
    this.nightPhase = NIGHT_PHASE.SEER;
  }

  /**
   * Create night action prompt for the Seer
   * @param {Object} gameState - Current game state
   * @param {Object} player - Player to create prompt for
   * @returns {Object} Embed and components for night action
   */
  createNightActionPrompt(gameState, player) {
    const embed = new EmbedBuilder()
      .setTitle(`🌙 Đêm ${gameState.day} - Hành Động Của ${this.name}`)
      .setDescription('Bạn muốn tiên tri ai đêm nay?')
      .setColor("#9b59b6");
    
    const targets = Object.values(gameState.players).filter(p => 
      p.isAlive && p.id !== player.id
    );
    
    if (targets.length === 0) {
      return { embed, components: [] };
    }
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID.ACTION_PREFIX}${player.id}`)
      .setPlaceholder('Chọn người chơi để tiên tri...');
    
    targets.forEach(target => {
      selectMenu.addOptions({
        label: target.name,
        value: target.id,
        description: `Tiên tri ${target.name}`,
      });
    });
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    return { embed, components: [row] };
  }

  /**
   * Process the Seer's night action
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player performing action
   * @param {string} targetId - ID of action target
   * @returns {Object} Action result
   */
  processNightAction(gameState, playerId, targetId) {
    // Store the target ID in game state
    gameState.nightActions.seerTarget = targetId;
    
    // Also store in a more persistent way
    if (!gameState.seerResults) {
      gameState.seerResults = {};
    }
    
    // Store by day and player ID
    if (!gameState.seerResults[gameState.day]) {
      gameState.seerResults[gameState.day] = {};
    }
    
    gameState.seerResults[gameState.day][playerId] = targetId;
    
    console.log(`Storing seer result for day ${gameState.day}, seer ${playerId}, target: ${targetId}`);
    
    const target = gameState.players[targetId];
    
    return { 
      success: true, 
      message: `Bạn đã chọn tiên tri ${target ? target.name : targetId}. Kết quả sẽ được thông báo vào buổi sáng.`
    };
  }

  /**
   * Send the result of the Seer's vision
   * @param {Object} gameState - Current game state
   * @param {Object} seer - The Seer player
   * @param {Object} target - The target player
   * @returns {Promise} A promise that resolves when the DM is sent
   */
  async sendSeerResult(gameState, seer, target) {
    const embed = new EmbedBuilder()
      .setTitle(`👁️ Kết Quả Tiên Tri`)
      .setDescription(`Bạn đã tiên tri **${target.name}**`)
      .setColor("#9b59b6");
    
    // Check if target is a werewolf
    const isWerewolf = target.role === "WEREWOLF";
    
    if (isWerewolf) {
      embed.addFields({ name: "Kết Quả", value: "Người chơi này là **Ma Sói**! 🐺" });
    } else {
      embed.addFields({ name: "Kết Quả", value: "Người chơi này **không phải** Ma Sói. ✅" });
    }
    
    try {
      await seer.user.send({ embeds: [embed] });
      return { success: true };
    } catch (error) {
      console.error(`Failed to send seer result to ${seer.name}:`, error);
      return { success: false, error };
    }
  }
}

module.exports = Seer;