// modules/werewolf/handlers/selectMenuHandlers.js
const { MessageFlags } = require('discord.js');
const { CUSTOM_ID } = require('../constants');
const { getRole } = require('../roles');

/**
 * Handle night action select menu
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} activeGames - Map of active games
 */
async function handleNightActionSelect(interaction, activeGames) {
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
    
    // Log night action for debugging
    console.log(`Night action from ${playerId} (${playerGame.players[playerId].role}) selecting ${targetId}`);
    
    // Get player and their role
    const player = playerGame.players[playerId];
    const role = getRole(player.role);
    
    // Special handling for witch kill potion - send another menu to select target
    if (targetId === "kill_select" && player.role === "WITCH") {
      // Create kill potion target selection menu
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
      await interaction.editReply({ content: result.message || "Không thể thực hiện hành động trong lúc này." });
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
  }
}

/**
 * Handle witch kill target selection
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} activeGames - Map of active games
 */
async function handleWitchKillSelect(interaction, activeGames) {
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
  }
}

/**
 * Handle hunter ability select menu
 * @param {Interaction} interaction - Discord interaction
 * @param {Map} activeGames - Map of active games
 */
async function handleHunterSelect(interaction, activeGames) {
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
    
    // Get selected target
    const targetId = interaction.values[0];
    
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
      
      // Mark target as dead
      if (target) {
        target.isAlive = false;
        
        await interaction.editReply({ content: `Bạn đã bắn ${target.name}.` });
        
        // Notify the game channel
        const role = getRole(target.role);
        const embed = new EmbedBuilder()
          .setTitle(`🏹 Thợ Săn Đã Bắn!`)
          .setDescription(`**${hunterGame.players[hunterId].name}** đã bắn **${target.name}** (${role.name} ${role.emoji}).`)
          .setColor("#e67e22");
        
        await hunterGame.channel.send({ embeds: [embed] });
        
        // Check game end after hunter shot
        if (hunterGame.checkGameEnd()) {
          await hunterGame.endGame();
        }
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
  }
}

module.exports = {
  handleNightActionSelect,
  handleWitchKillSelect,
  handleHunterSelect
};