// modules/werewolf/roles/werewolf.js
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const BaseRole = require('./baseRole');
const { NIGHT_PHASE, TEAM, CUSTOM_ID } = require('../constants');

class Werewolf extends BaseRole {
  constructor() {
    super();
    this.id = 'WEREWOLF';
    this.name = 'Ma Sói';
    this.description = 'Đêm tối, bạn có thể chọn một người chơi để giết';
    this.team = TEAM.WEREWOLF;
    this.nightAction = true;
    this.emoji = '🐺';
    this.nightPhase = NIGHT_PHASE.WEREWOLF;
  }

  createRoleDMEmbed(gameState, player) {
    const embed = super.createRoleDMEmbed(gameState, player);
    
    // Add list of other werewolves if there are any
    const werewolves = Object.values(gameState.players)
      .filter(p => p.role === this.id && p.id !== player.id && p.role === "CURSED_WEREWOLF")
      .map(p => p.name);
    
    if (werewolves.length > 0) {
      embed.addFields({ 
        name: "Đồng Đội Ma Sói", 
        value: werewolves.join(", ")
      });
    }
    
    return embed;
  }

  createNightActionPrompt(gameState, player) {
    const embed = new EmbedBuilder()
      .setTitle(`🌙 Đêm ${gameState.day} - Hành Động Của ${this.name}`)
      .setDescription(`Đã đến lượt hành động của bạn. Hãy chọn một người chơi để tấn công.`)
      .setColor("#2f3136");
    
    // Get ALL alive players who aren't werewolves - make sure this works correctly
    const targets = Object.values(gameState.players).filter(p => 
      p.isAlive && p.role !== "WEREWOLF" && p.role !== "CURSED_WEREWOLF"
    );
    
    console.log(`[DEBUG] Werewolf attack - Found ${targets.length} possible targets:`);
    targets.forEach(t => console.log(`- ${t.name} (${t.role})`));
    
    if (targets.length === 0) {
      return { embed, components: [] };
    }
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID.ACTION_PREFIX}${player.id}`)
      .setPlaceholder('Chọn nạn nhân...');
    
    // Add ALL targets to the menu - make sure we're adding all options
    targets.forEach(target => {
      // console.log(`[DEBUG] Adding target option: ${target.name}`);
      selectMenu.addOptions({
        label: target.name,
        value: target.id,
        description: `Tấn công ${target.name}`
      });
    });
    
    // Make sure this row is properly created
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    return { embed, components: [row] };
  }

  processNightAction(gameState, playerId, targetId) {
    // Store the werewolf's vote for a target
    const player = gameState.players[playerId];
    
    if (!player || !player.isAlive) {
      return { success: false, message: "Người chơi không hợp lệ" };
    }
    
    // Werewolves vote together, store in nightActions
    if (!gameState.nightActions.werewolfVotes) {
      gameState.nightActions.werewolfVotes = {};
    }
    
    gameState.nightActions.werewolfVotes[playerId] = targetId;
    
    return { 
      success: true, 
      message: `Bạn đã chọn tấn công ${gameState.players[targetId]?.name}.`
    };
  }

  executeNightResults(gameState) {
    // Count votes from all werewolves and determine the target
    const votes = gameState.nightActions.werewolfVotes || {};
    const voteCounts = {};
    
    // Count votes
    Object.values(votes).forEach(targetId => {
      if (targetId) {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
      }
    });
    
    // Find the target with most votes
    let maxVotes = 0;
    let targetId = null;
    
    Object.entries(voteCounts).forEach(([id, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        targetId = id;
      }
    });
    
    // Store the selected target for other roles (like Witch)
    gameState.currentWerewolfTarget = targetId;
    
    return { targetId };
  }
}

module.exports = Werewolf;