// modules/werewolf/roles/bodyguard.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const BaseRole = require('./baseRole');
const { NIGHT_PHASE, TEAM, CUSTOM_ID } = require('../constants');

class Bodyguard extends BaseRole {
  constructor() {
    super();
    this.id = 'BODYGUARD';
    this.name = 'Bảo Vệ';
    this.description = 'Mỗi đêm, bạn có thể bảo vệ một người chơi khỏi bị tấn công';
    this.team = TEAM.VILLAGER;
    this.nightAction = true;
    this.emoji = '🛡️';
    this.nightPhase = NIGHT_PHASE.BODYGUARD;
  }

  /**
   * Create night action prompt for the Bodyguard
   * @param {Object} gameState - Current game state
   * @param {Object} player - Player to create prompt for
   * @returns {Object} Embed and components for night action
   */
  createNightActionPrompt(gameState, player) {
    const embed = new EmbedBuilder()
      .setTitle(`🌙 Đêm ${gameState.day} - Hành Động Của ${this.name}`)
      .setDescription('Bạn muốn bảo vệ ai đêm nay?')
      .setColor("#3498db");
    
    // Get all alive players
    const targets = Object.values(gameState.players).filter(p => p.isAlive);
    
    if (targets.length === 0) {
      return { embed, components: [] };
    }
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID.ACTION_PREFIX}${player.id}`)
      .setPlaceholder('Chọn người chơi để bảo vệ...');
    
    // Can't protect the same person twice in a row
    const lastProtectedId = gameState.lastProtected;
    
    // Add all players as options (including self)
    targets.forEach(target => {
      // Skip if this was protected last night (can't protect same person twice)
      if (target.id === lastProtectedId && gameState.day > 1) {
        return;
      }
      
      selectMenu.addOptions({
        label: target.id === player.id ? `${target.name} (Bản thân)` : target.name,
        value: target.id,
        description: target.id === player.id ? 
          'Bảo vệ chính mình' : 
          `Bảo vệ ${target.name}`,
      });
    });
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    return { embed, components: [row] };
  }

  /**
   * Process the Bodyguard's night action
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player performing action
   * @param {string} targetId - ID of action target
   * @returns {Object} Action result
   */
  processNightAction(gameState, playerId, targetId) {
    // Store the target ID in game state
    gameState.nightActions.bodyguardTarget = targetId;
    
    const target = gameState.players[targetId];
    const isSelf = targetId === playerId;
    
    return { 
      success: true, 
      message: isSelf ? 
        'Bạn đã chọn bảo vệ chính mình đêm nay.' : 
        `Bạn đã chọn bảo vệ ${target ? target.name : targetId} đêm nay.`
    };
  }

  /**
   * Execute night results for Bodyguard
   * @param {Object} gameState - Current game state
   * @returns {Object} Result of night actions
   */
  executeNightResults(gameState) {
    const protectedId = gameState.nightActions.bodyguardTarget;
    
    // Store who was protected for rules about not protecting same person twice
    if (protectedId) {
      gameState.lastProtected = protectedId;
    }
    
    return { protectedId };
  }
}

module.exports = Bodyguard;