// modules/werewolf/roles/witch.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const BaseRole = require('./baseRole');
const { NIGHT_PHASE, TEAM, CUSTOM_ID } = require('../constants');

class Witch extends BaseRole {
  constructor() {
    super();
    this.id = 'WITCH';
    this.name = 'Phù Thủy';
    this.description = 'Bạn có hai bình thuốc: một để cứu sống, một để giết chết';
    this.team = TEAM.VILLAGER;
    this.nightAction = true;
    this.emoji = '🧙‍♀️';
    this.nightPhase = NIGHT_PHASE.WITCH;
  }

  /**
   * Initialize witch-specific state
   * @param {Object} gameState - Game state
   */
  initializeState(gameState) {
    if (!gameState.witch) {
      gameState.witch = {
        healPotion: true,
        killPotion: true
      };
    }
  }

  createNightActionPrompt(gameState, player) {
    this.initializeState(gameState);
    
    const targetId = gameState.currentWerewolfTarget;
    const target = targetId ? gameState.players[targetId] : null;
    
    // Log for debugging
    console.log(`Creating witch prompt, werewolf target: ${targetId ? target?.name : 'none'}, day: ${gameState.day}`);
    
    let embed = new EmbedBuilder()
      .setTitle(`🌙 Đêm ${gameState.day} - Hành Động Của ${this.name}`)
      .setColor("#2f3136");
    
    if (target && gameState.witch.healPotion) {
      embed.setDescription(`Người chơi **${target.name}** sẽ bị Ma Sói cắn đêm nay. Bạn có muốn sử dụng bình thuốc cứu để cứu họ?`)
        .setColor("#ff9900"); // Orange color for urgency
    } else if (targetId === null || targetId === undefined) {
      embed.setDescription(`Ma Sói không có mục tiêu đêm nay. Bạn có muốn sử dụng bình thuốc độc không?`);
    } else if (!gameState.witch.healPotion) {
      embed.setDescription(`Người chơi **${target.name}** sẽ bị Ma Sói cắn đêm nay, nhưng bạn đã hết bình thuốc cứu. Bạn có muốn sử dụng bình thuốc độc không?`);
    } else {
      embed.setDescription(`Bạn có muốn sử dụng bình thuốc cứu hoặc bình thuốc độc không?`);
    }
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID.ACTION_PREFIX}${player.id}`)
      .setPlaceholder('Chọn hành động...');
    
    // Add heal option if werewolf target exists and heal potion available
    if (target && gameState.witch.healPotion) {
      selectMenu.addOptions({
        label: `Cứu ${target.name}`,
        value: "heal",
        description: "Sử dụng bình thuốc cứu người bị Ma Sói tấn công",
        emoji: "💖"
      });
    }
    
    // Add kill option if kill potion available
    if (gameState.witch.killPotion) {
      selectMenu.addOptions({
        label: "Giết một người",
        value: "kill_select",
        description: "Sử dụng bình thuốc độc",
        emoji: "☠️"
      });
    }
    
    // Add do nothing option
    selectMenu.addOptions({
      label: "Không làm gì",
      value: "none",
      description: "Bỏ qua lượt này",
      emoji: "➖"
    });
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    return { embed, components: [row] };
  }

  /**
   * Create target selection for kill potion
   * @param {Object} gameState - Game state
   * @param {Object} player - Player using kill potion
   */
  createKillPotionPrompt(gameState, player) {
    const embed = new EmbedBuilder()
      .setTitle(`🧪 Sử Dụng Bình Thuốc Độc`)
      .setDescription(`Chọn một người chơi để đầu độc:`)
      .setColor("#800000"); // Dark red for kill action
    
    const targets = Object.values(gameState.players).filter(p => 
      p.isAlive && p.id !== player.id
    );
    
    if (targets.length === 0) {
      return { embed, components: [] };
    }
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID.WITCH_KILL_PREFIX}${player.id}`)
      .setPlaceholder('Chọn người chơi để giết...');
    
    targets.forEach(target => {
      selectMenu.addOptions({
        label: target.name,
        value: target.id,
        description: `Đầu độc ${target.name}`,
        emoji: "☠️"
      });
    });
    
    // Add cancel option
    selectMenu.addOptions({
      label: "Hủy",
      value: "cancel",
      description: "Quay lại lựa chọn trước",
      emoji: "❌"
    });
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    return { embed, components: [row] };
  }

  processNightAction(gameState, playerId, action) {
    this.initializeState(gameState);
    
    if (action === "heal") {
      // Use heal potion on werewolf target
      gameState.nightActions.witchHeal = true;
      gameState.witch.healPotion = false;
      
      const targetId = gameState.currentWerewolfTarget;
      const target = gameState.players[targetId];
      
      return { 
        success: true, 
        message: `Bạn đã sử dụng bình thuốc cứu ${target ? target.name : "người bị tấn công"}.`
      };
    } else if (action === "kill_select") {
      // This is just selecting the kill option - actual target selection comes later
      return {
        success: true,
        message: "Hãy chọn người chơi để đầu độc",
        killSelect: true
      };
    } else if (action === "none") {
      // Doing nothing
      gameState.nightActions.witchAction = "none";
      
      return {
        success: true,
        message: "Bạn đã quyết định không sử dụng thuốc."
      };
    } else {
      // If it's not a special action, it must be a player ID for kill potion
      gameState.nightActions.witchKill = action;
      gameState.witch.killPotion = false;
      
      const target = gameState.players[action];
      
      return {
        success: true,
        message: `Bạn đã chọn đầu độc ${target ? target.name : action}.`
      };
    }
  }

  executeNightResults(gameState) {
    this.initializeState(gameState);
    
    const result = {
      savedTarget: null,
      killedTarget: null
    };
    
    // Check if witch saved the werewolf target
    if (gameState.nightActions.witchHeal) {
      result.savedTarget = gameState.currentWerewolfTarget;
    }
    
    // Check if witch killed someone
    if (gameState.nightActions.witchKill) {
      result.killedTarget = gameState.nightActions.witchKill;
    }
    
    return result;
  }
}

module.exports = Witch;