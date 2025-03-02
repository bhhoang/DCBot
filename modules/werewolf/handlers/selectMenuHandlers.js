// modules/werewolf/handlers/selectMenuHandlers.js
const { MessageFlags } = require('discord.js');
const { CUSTOM_ID } = require('../constants');
const { getRole } = require('../roles');
const interactionsInProgress = new Map();

/**
 * Handle night action select menu
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} activeGames - Map of active games
 */
async function handleNightActionSelect(interaction, activeGames) {
  // Check if this user already has an interaction in progress
  if (interactionsInProgress.has(interaction.user.id)) {
    try {
      await interaction.reply({
        content: "Đang xử lý tương tác trước đó, vui lòng đợi.",
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("Error replying to duplicate interaction:", error);
    }
    return;
  }
  
  // Mark this user as having an interaction in progress
  interactionsInProgress.set(interaction.user.id, Date.now());
  
  try {
    // Immediately defer the reply to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Extract player ID from custom ID
    const playerId = interaction.customId.replace(CUSTOM_ID.ACTION_PREFIX, '');
    
    // Find the game this player is in
    let playerGame = null;
    for (const [channelId, game] of activeGames.entries()) {
      if (game.players[playerId]) {
        playerGame = game;
        break;
      }
    }
    
    if (!playerGame || playerGame.state !== 'NIGHT') {
      await interaction.editReply({ 
        content: "Không thể thực hiện hành động trong lúc này." 
      });
      return;
    }
    
    // Get selected target/action
    const targetId = interaction.values[0];
    
    // Get player and their role
    const player = playerGame.players[playerId];
    if (!player) {
      await interaction.editReply({ 
        content: "Không tìm thấy thông tin người chơi." 
      });
      return;
    }
    
    // Log the action for debugging
    console.log(`[DEBUG] ${player.name} (${player.role}) selected target: ${targetId}`);
    
    // Special handling for Cursed Werewolf
    if (player.role === 'CURSED_WEREWOLF') {
      console.log(`[DEBUG-CURSED] Cursed Werewolf ${player.name} selected: ${targetId}`);
      
      // Check if this is an attack or curse action
      const isCurseAction = targetId.startsWith('curse_');
      const isAttackAction = targetId.startsWith('attack_');
      
      if (isCurseAction) {
        console.log(`[DEBUG-CURSED] This is a CURSE action`);
        
        // Check if curse has already been used
        if (playerGame.cursedWerewolfState && 
            playerGame.cursedWerewolfState[playerId] &&
            playerGame.cursedWerewolfState[playerId].curseUsed) {
          
          await interaction.editReply({ 
            content: "Bạn đã sử dụng khả năng nguyền rủa rồi." 
          });
          return;
        }
      }
      
      if (isAttackAction) {
        console.log(`[DEBUG-CURSED] This is an ATTACK action`);
      }
    }
    
    // Special handling for witch kill potion - send another menu to select target
    if (targetId === "kill_select" && player.role === "WITCH") {
      // Create kill potion target selection menu
      const role = getRole(player.role);
      const { embed, components } = role.createKillPotionPrompt(playerGame, player);
      
      // Send the kill target selection menu
      await interaction.editReply({ 
        embeds: [embed], 
        components 
      });
      
      // Don't register the action yet, wait for target selection
      return;
    }
    
    // For witch cancel action, send the original prompt again
    if (targetId === "cancel" && player.role === "WITCH") {
      // Create a new witch action prompt
      const role = getRole(player.role);
      const { embed, components } = role.createNightActionPrompt(playerGame, player);
      
      await interaction.editReply({ 
        embeds: [embed], 
        components 
      });
      return;
    }
    
    // Register night action
    const result = playerGame.handleNightAction(playerId, targetId);
    
    if (result.success) {
      await interaction.editReply({ content: result.message });
    } else {
      await interaction.editReply({ 
        content: result.message || "Không thể thực hiện hành động trong lúc này." 
      });
    }
  } catch (error) {
    console.error("Error handling night action select:", error);
    // Try to respond if we haven't already
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "Có lỗi xảy ra khi thực hiện hành động đêm.",
          flags: MessageFlags.Ephemeral
        });
      } catch (e) {
        console.error("Failed to respond to interaction after error:", e);
      }
    }
  } finally {
    // Remove the interaction lock after a delay
    setTimeout(() => {
      interactionsInProgress.delete(interaction.user.id);
    }, 2000);
  }
}

/**
 * Handle witch kill target selection
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} activeGames - Map of active games
 */
async function handleWitchKillSelect(interaction, activeGames) {
  // Check if this user already has an interaction in progress
  if (interactionsInProgress.has(interaction.user.id)) {
    try {
      await interaction.reply({
        content: "Đang xử lý tương tác trước đó, vui lòng đợi.",
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("Error replying to duplicate interaction:", error);
    }
    return;
  }
  
  // Mark this user as having an interaction in progress
  interactionsInProgress.set(interaction.user.id, Date.now());
  
  try {
    // Immediately defer the reply to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Extract player ID from custom ID
    const playerId = interaction.customId.replace(CUSTOM_ID.WITCH_KILL_PREFIX, '');
    
    // Find the game this player is in
    let playerGame = null;
    for (const [channelId, game] of activeGames.entries()) {
      if (game.players[playerId]) {
        playerGame = game;
        break;
      }
    }
    
    if (!playerGame || playerGame.state !== 'NIGHT' || playerGame.nightPhase !== 'WITCH') {
      await interaction.editReply({ 
        content: "Không thể thực hiện hành động trong lúc này." 
      });
      return;
    }
    
    // Get selected target
    const targetId = interaction.values[0];
    
    // Handle cancel action
    if (targetId === "cancel") {
      const player = playerGame.players[playerId];
      const role = getRole(player.role);
      const { embed, components } = role.createNightActionPrompt(playerGame, player);
      
      await interaction.editReply({ 
        embeds: [embed], 
        components 
      });
      return;
    }
    
    // Register the kill action
    const result = playerGame.handleNightAction(playerId, targetId);
    
    if (result.success) {
      await interaction.editReply({ content: result.message });
    } else {
      await interaction.editReply({ content: result.message || "Không thể thực hiện hành động trong lúc này." });
    }
  } catch (error) {
    console.error("Error handling witch kill select:", error);
    // Try to respond if we haven't already
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "Có lỗi xảy ra khi thực hiện hành động đêm.",
          flags: MessageFlags.Ephemeral
        });
      } catch (e) {
        console.error("Failed to respond to interaction after error:", e);
      }
    }
  } finally {
    // Remove the interaction lock after a delay
    setTimeout(() => {
      interactionsInProgress.delete(interaction.user.id);
    }, 2000);
  }
}

/**
 * Handle hunter ability select menu
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} activeGames - Map of active games
 */
async function handleHunterSelect(interaction, activeGames) {
  // Check if this user already has an interaction in progress
  if (interactionsInProgress.has(interaction.user.id)) {
    try {
      await interaction.reply({
        content: "Đang xử lý tương tác trước đó, vui lòng đợi.",
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("Error replying to duplicate interaction:", error);
    }
    return;
  }
  
  // Mark this user as having an interaction in progress
  interactionsInProgress.set(interaction.user.id, Date.now());
  
  try {
    // Immediately defer the reply to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Extract player ID from custom ID
    const hunterId = interaction.customId.replace(CUSTOM_ID.HUNTER_PREFIX, '');
    
    // Find the game this player is in
    let hunterGame = null;
    for (const [channelId, game] of activeGames.entries()) {
      if (game.players[hunterId]) {
        hunterGame = game;
        break;
      }
    }
    
    if (!hunterGame) {
      await interaction.editReply({ content: "Không thể tìm thấy trò chơi của bạn." });
      return;
    }
    
    // Verify hunter hasn't already used their ability
    if (!hunterGame.hunterAbilityUsed) {
      hunterGame.hunterAbilityUsed = {};
    }
    
    if (hunterGame.hunterShotFired && hunterGame.hunterShotFired[hunterId]) {
      await interaction.editReply({ content: "Bạn đã sử dụng khả năng của Thợ Săn rồi." });
      return;
    }
    
    // Get selected target
    const targetId = interaction.values[0];
    
    // Mark this hunter as having used their ability
    if (!hunterGame.hunterShotFired) {
      hunterGame.hunterShotFired = {};
    }
    hunterGame.hunterShotFired[hunterId] = true;
    
    if (targetId === "none") {
      await interaction.editReply({ content: "Bạn đã quyết định không bắn ai." });
      
      // Notify the game channel
      const embed = new EmbedBuilder()
        .setTitle(`🏹 Thợ Săn Quyết Định`)
        .setDescription(`**${hunterGame.players[hunterId].name}** đã quyết định không bắn ai.`)
        .setColor("#e67e22");
      
      await hunterGame.channel.send({ embeds: [embed] });
    } else {
      const target = hunterGame.players[targetId];
      
      if (!target) {
        await interaction.editReply({ content: "Không tìm thấy người chơi mục tiêu." });
        return;
      }
      
      console.log(`[DEBUG] Hunter ${hunterGame.players[hunterId].name} is shooting ${target.name}`);
      
      // Confirm to the hunter
      await interaction.editReply({ content: `Bạn đã bắn ${target.name}.` });
      
      // Mark target as dead - ENSURE THIS HAPPENS!
      target.isAlive = false;
      
      // Get role information
      const role = getRole(target.role);
      if (!role) {
        console.error(`[ERROR] Could not find role info for ${target.role}`);
      }
      
      // Notify the game channel with role information
      const embed = new EmbedBuilder()
        .setTitle(`🏹 Thợ Săn Đã Bắn!`)
        .setDescription(`**${hunterGame.players[hunterId].name}** đã bắn **${target.name}** (${role ? role.name + ' ' + role.emoji : target.role}).`)
        .setColor("#e67e22");
      
      await hunterGame.channel.send({ embeds: [embed] });
      
      console.log(`[DEBUG] Target ${target.name} marked as dead: isAlive = ${target.isAlive}`);
      
      // If the target is a Hunter, they get to use their ability too
      if (target.role === 'HUNTER' && !hunterGame.hunterAbilityUsed[target.id]) {
        console.log(`[DEBUG] Shot player ${target.name} is also a Hunter, activating their ability`);
        const hunterRole = getRole('HUNTER');
        if (hunterRole && typeof hunterRole.handleDeath === 'function') {
          await hunterRole.handleDeath(hunterGame, target);
        }
      }
      
      // Check game end after hunter shot
      if (hunterGame.checkGameEnd()) {
        await hunterGame.endGame();
      }
    }
  } catch (error) {
    console.error("Error handling hunter select:", error);
    // Try to respond if we haven't already
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "Có lỗi xảy ra khi sử dụng khả năng của Thợ Săn.",
          flags: MessageFlags.Ephemeral
        });
      } catch (e) {
        console.error("Failed to respond to interaction after error:", e);
      }
    }
  } finally {
    // Remove the interaction lock after a delay
    setTimeout(() => {
      interactionsInProgress.delete(interaction.user.id);
    }, 2000);
  }
}

module.exports = {
  handleNightActionSelect,
  handleWitchKillSelect,
  handleHunterSelect
};