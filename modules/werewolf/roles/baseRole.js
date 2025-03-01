// modules/werewolf/roles/baseRole.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

class BaseRole {
  constructor() {
    this.id = '';
    this.name = '';
    this.description = '';
    this.team = '';
    this.nightAction = false;
    this.emoji = '';
    this.nightPhase = null;
  }

  /**
   * Get role information
   * @returns {Object} Role information object
   */
  getInfo() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      team: this.team,
      nightAction: this.nightAction,
      emoji: this.emoji,
      nightPhase: this.nightPhase
    };
  }

  /**
   * Create DM embed for role assignment
   * @param {Object} gameState - Current game state
   * @param {Object} player - Player this DM is for
   * @returns {EmbedBuilder} Discord embed with role information
   */
  createRoleDMEmbed(gameState, player) {
    const embed = new EmbedBuilder()
      .setTitle(`🎮 Ma Sói - Vai Trò Của Bạn`)
      .setDescription(`Bạn là **${this.name}** ${this.emoji}`)
      .setColor(this.team === 'MA SÓI' ? "#ff0000" : "#00b0f4")
      .addFields(
        { name: "Mô Tả", value: this.description },
        { name: "Phe", value: this.team }
      )
      .setFooter({ text: "Giữ bí mật vai trò của bạn!" });
    
    return embed;
  }

  /**
   * Process night action
   * @param {Object} gameState - Current game state
   * @param {string} playerId - ID of player performing action
   * @param {string} targetId - ID of action target
   * @returns {Object} Action result
   */
  processNightAction(gameState, playerId, targetId) {
    // Base implementation - override in specific roles
    return { success: false, message: "Role has no night action" };
  }

  /**
   * Create night action prompt
   * @param {Object} gameState - Current game state
   * @param {Object} player - Player to create prompt for
   * @returns {Object} Embed and components for night action
   */
  createNightActionPrompt(gameState, player) {
    // Base implementation - should be overridden by roles with night actions
    return null;
  }

  /**
   * Execute night results for this role
   * @param {Object} gameState - Current game state
   * @returns {Object} Result of night actions
   */
  executeNightResults(gameState) {
    // Base implementation - override in specific roles
    return {};
  }

  /**
   * Handle when a player with this role dies
   * @param {Object} gameState - Current game state
   * @param {Object} player - Player who died
   * @returns {Object} Any special effects from death
   */
  handleDeath(gameState, player) {
    // Base implementation - override in roles with death effects
    return null;
  }
}

module.exports = BaseRole;