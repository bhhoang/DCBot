// modules/werewolf/roles/bodyguard.js - Updated for improved protection rules

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
    this.protectionCooldown = 2; // Number of rounds before can protect same person again
  }

  /**
   * Create night action prompt for the Bodyguard
   * @param {Object} gameState - Current game state
   * @param {Object} player - Player to create prompt for
   * @returns {Object} Embed and components for night action
   */
  createNightActionPrompt(gameState, player) {
    // Initialize protection history if needed
    if (!gameState.bodyguardHistory) {
      gameState.bodyguardHistory = {};
    }

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
    
    // Check which players are on cooldown
    const onCooldown = new Set();
    for (const targetId in gameState.bodyguardHistory) {
      const lastProtectedDay = gameState.bodyguardHistory[targetId];
      const daysSinceProtection = gameState.day - lastProtectedDay;
      
      if (daysSinceProtection < this.protectionCooldown) {
        onCooldown.add(targetId);
      }
    }

    // Add all eligible players as options
    targets.forEach(target => {
      const isCooldown = onCooldown.has(target.id);
      const isSelf = target.id === player.id;
      
      // Only add if not on cooldown
      if (!isCooldown) {
        selectMenu.addOptions({
          label: isSelf ? `${target.name} (Bản thân)` : target.name,
          value: target.id,
          description: isSelf ? 
            'Bảo vệ chính mình' : 
            `Bảo vệ ${target.name}`,
        });
      }
    });
    
    // Add info about players on cooldown to the embed
    if (onCooldown.size > 0) {
      const cooldownPlayers = [];
      for (const id of onCooldown) {
        const player = gameState.players[id];
        if (player) {
          const lastDay = gameState.bodyguardHistory[id];
          const remainingDays = this.protectionCooldown - (gameState.day - lastDay);
          cooldownPlayers.push(`${player.name} (còn ${remainingDays} đêm)`);
        }
      }
      
      if (cooldownPlayers.length > 0) {
        embed.addFields([
          { 
            name: '⏳ Người chơi đang trong thời gian hồi', 
            value: cooldownPlayers.join('\n'),
            inline: false
          }
        ]);
      }
    }
    
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
    // Initialize history if needed
    if (!gameState.bodyguardHistory) {
      gameState.bodyguardHistory = {};
    }
    
    // Store the target ID in game state
    gameState.nightActions.bodyguardTarget = targetId;
    
    // Update protection history
    gameState.bodyguardHistory[targetId] = gameState.day;
    
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