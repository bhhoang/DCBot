// modules/werewolf/roles/cursedWerewolf.js - Fixed version

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const Werewolf = require('./werewolf');
const { NIGHT_PHASE, TEAM, CUSTOM_ID } = require('../constants');

class CursedWerewolf extends Werewolf {
  constructor() {
    super();
    this.id = 'CURSED_WEREWOLF';
    this.name = 'Sói Nguyền';
    this.description = 'Bạn có thể biến một người thành sói một lần duy nhất trong trò chơi';
    this.team = TEAM.WEREWOLF;
    this.nightAction = true;
    this.emoji = '🧟‍♂️';
    this.nightPhase = NIGHT_PHASE.WEREWOLF; // Uses same phase as normal werewolf
  }

  createRoleDMEmbed(gameState, player) {
    const embed = super.createRoleDMEmbed(gameState, player);
    
    // Add information about the curse ability
    embed.addFields({ 
      name: "Khả Năng Đặc Biệt", 
      value: "Bạn có thể biến một người thành Ma Sói **một lần duy nhất**. Người bị nguyền sẽ trở thành Ma Sói từ đêm tiếp theo." 
    });
    
    return embed;
  }

  createNightActionPrompt(gameState, player) {
    console.log(`[DEBUG] Creating night action prompt for Cursed Werewolf ${player.name}`);
    
    // Initialize state if needed
    if (!gameState.cursedWerewolfState) {
      gameState.cursedWerewolfState = {};
    }
    
    if (!gameState.cursedWerewolfState[player.id]) {
      gameState.cursedWerewolfState[player.id] = {
        curseUsed: false
      };
      console.log(`[DEBUG] Initialized curse state for ${player.name}`);
    }
    
    const playerState = gameState.cursedWerewolfState[player.id];
    const curseUsed = playerState.curseUsed;
    console.log(`[DEBUG] Curse used status: ${curseUsed}`);
    
    const embed = new EmbedBuilder()
      .setTitle(`🌙 Đêm ${gameState.day} - Hành Động Của ${this.name}`)
      .setDescription(curseUsed ?
        `Bạn đã sử dụng khả năng nguyền rủa của mình. Hãy chọn một người để tấn công cùng với các Sói khác.` :
        `Đã đến lượt hành động của bạn. Bạn có thể tấn công một người cùng với các Sói khác, hoặc nguyền một người khác để biến họ thành Ma Sói.`
      )
      .setColor("#800000"); // Dark red color
    
    // Get all alive non-werewolf players
    const targets = Object.values(gameState.players).filter(p => 
      p.isAlive && p.role !== "WEREWOLF" && p.role !== "CURSED_WEREWOLF"
    );
    
    console.log(`[DEBUG] Found ${targets.length} possible targets for Cursed Werewolf`);
    targets.forEach(t => console.log(`- ${t.name} (${t.role})`));
    
    if (targets.length === 0) {
      console.log(`[DEBUG] No targets available for Cursed Werewolf`);
      return { embed, components: [] };
    }
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`${CUSTOM_ID.ACTION_PREFIX}${player.id}`)
      .setPlaceholder('Chọn hành động...');
    
    // If curse hasn't been used, add both attack and curse options
    if (!curseUsed) {
      console.log(`[DEBUG] Adding attack and curse options`);
      
      // Add attack options
      targets.forEach(target => {
        selectMenu.addOptions({
          label: `Tấn công ${target.name}`,
          value: `attack_${target.id}`,
          description: `Tấn công ${target.name} cùng với Sói khác`,
          emoji: "🐺"
        });
      });
      
      // Add curse options
      targets.forEach(target => {
        selectMenu.addOptions({
          label: `Nguyền ${target.name}`,
          value: `curse_${target.id}`,
          description: `Biến ${target.name} thành Ma Sói`,
          emoji: "🧟‍♂️"
        });
      });
    } else {
      console.log(`[DEBUG] Adding only attack options (curse already used)`);
      // If curse has been used, only offer attack options - FIXED: Use attack_ prefix consistently
      targets.forEach(target => {
        selectMenu.addOptions({
          label: `Tấn công ${target.name}`,
          value: `attack_${target.id}`, // FIXED: Added attack_ prefix for consistency
          description: `Tấn công ${target.name}`,
          emoji: "🐺"
        });
      });
    }
    
    // Check if we've added any options
    if (selectMenu.options && selectMenu.options.length === 0) {
      console.log(`[DEBUG] No options were added to the select menu!`);
      return { embed, components: [] };
    }
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    console.log(`[DEBUG] Created action row with select menu containing ${selectMenu.options?.length || 0} options`);
    
    return { embed, components: [row] };
  }

  processNightAction(gameState, playerId, targetId) {
    // Initialize state if needed
    if (!gameState.cursedWerewolfState) {
      gameState.cursedWerewolfState = {};
    }
    
    if (!gameState.cursedWerewolfState[playerId]) {
      gameState.cursedWerewolfState[playerId] = {
        curseUsed: false
      };
    }
    
    const player = gameState.players[playerId];
    const playerState = gameState.cursedWerewolfState[playerId];
    let targetPlayerId;
    let actionType = "attack"; // Default to attack
    
    console.log(`Cursed Werewolf action received: ${targetId}`);
    
    // Check if this is a curse action
    if (targetId && targetId.startsWith("curse_")) {
      actionType = "curse";
      targetPlayerId = targetId.replace("curse_", "");
      
      console.log(`This is a curse action targeting ${targetPlayerId}`);
      
      // Mark the curse as used
      playerState.curseUsed = true;
      
      // Store the cursed player in game state
      if (!gameState.nightActions.cursedPlayer) {
        gameState.nightActions.cursedPlayer = targetPlayerId;
      }
      
      console.log(`Curse state updated for ${playerId}, marked as used`);
    } 
    // Check if this is an attack action - works for both prefixed and unprefixed versions
    else if (targetId && (targetId.startsWith("attack_") || !targetId.includes("_"))) {
      // Extract the target ID, removing the prefix if it exists
      targetPlayerId = targetId.startsWith("attack_") ? targetId.replace("attack_", "") : targetId;
      console.log(`This is an attack action targeting ${targetPlayerId}`);
      
      // Make sure we set action type to attack
      actionType = "attack";
    }
    // Fallback for any other format (though we shouldn't get here)
    else {
      targetPlayerId = targetId;
      console.log(`Processing as regular target ID: ${targetPlayerId}`);
    }
    
    // Store the werewolf's vote for a target
    if (!gameState.nightActions.werewolfVotes) {
      gameState.nightActions.werewolfVotes = {};
    }
    
    if (actionType === "attack") {
      // FIXED: Store just the targetPlayerId (without prefix) for attack
      gameState.nightActions.werewolfVotes[playerId] = targetPlayerId;
      
      const target = gameState.players[targetPlayerId];
      console.log(`[DEBUG] Stored werewolf vote from ${player.name} for ${target?.name || targetPlayerId}`);
      
      return { 
        success: true, 
        message: `Bạn đã chọn tấn công ${target ? target.name : targetPlayerId}.`
      };
    } else {
      // For curse action, don't vote for normal attack
      const target = gameState.players[targetPlayerId];
      console.log(`Cursed player set: ${targetPlayerId} (${target?.name || 'unknown'})`);
      
      return { 
        success: true, 
        message: `Bạn đã chọn nguyền ${target ? target.name : targetPlayerId}. Họ sẽ trở thành Ma Sói từ đêm tiếp theo.`
      };
    }
  }

  executeNightResults(gameState) {
    // First run the normal werewolf execute logic to count votes
    const werewolfResult = super.executeNightResults(gameState);
    
    // Process the curse effect if a player was cursed this night
    const cursedPlayerId = gameState.nightActions.cursedPlayer;
    if (cursedPlayerId) {
      const cursedPlayer = gameState.players[cursedPlayerId];
      if (cursedPlayer) {
        // Mark this player to be converted to werewolf after this night
        if (!gameState.playersToConvert) {
          gameState.playersToConvert = [cursedPlayerId];
        } else {
          gameState.playersToConvert.push(cursedPlayerId);
        }
        
        console.log(`Player ${cursedPlayer.name} marked for conversion to Werewolf`);
      }
    }
    
    return {
      ...werewolfResult,
      cursedPlayerId
    };
  }
}

module.exports = CursedWerewolf;