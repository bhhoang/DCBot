// modules/werewolf/handlers/buttonHandlers.js
const { MessageFlags } = require('discord.js');
const { CUSTOM_ID } = require('../constants');
const messageUtils = require('../utils/messageUtils');
const interactionsInProgress = new Map();

/**
 * Handle join button interaction
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} game - Game instance
 * @param {Map} activeGames - Map of active games
 */
async function handleJoinButton(interaction, game) {
  // Check if this user already has an interaction in progress
  if (interactionsInProgress.has(interaction.user.id)) {
    await interaction.reply({ 
      content: "Đang xử lý tương tác trước đó, vui lòng đợi.",
      flags: MessageFlags.Ephemeral 
    });
    return;
  }
  
  // Mark this user as having an interaction in progress
  interactionsInProgress.set(interaction.user.id, Date.now());
  
  try {
    if (!game) {
      interactionsInProgress.delete(interaction.user.id);
      return;
    }
    
    // Get the user with member data included
    let user = interaction.user;
    user.member = interaction.member;  // Add member to user for display name
    
    // Add player to the game
    const success = game.addPlayer(user);
    
    if (success) {
      await interaction.reply({ 
        content: `${interaction.user} đã tham gia trò chơi Ma Sói!`, 
        flags: MessageFlags.Ephemeral 
      });
      
      // Update the game lobby message
      await updateLobbyMessage(game);
    } else {
      await interaction.reply({ 
        content: "Bạn đã tham gia trò chơi này hoặc trò chơi đã bắt đầu.", 
        flags: MessageFlags.Ephemeral 
      });
    }
  } catch (error) {
    console.error("Error in handleJoinButton:", error);
  } finally {
    // Remove the interaction lock after a short delay
    setTimeout(() => {
      interactionsInProgress.delete(interaction.user.id);
    }, 1000);
  }
}


/**
 * Handle start button interaction
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} game - Game instance
 */
async function handleStartButton(interaction, game) {
  // Check if this user already has an interaction in progress
  if (interactionsInProgress.has(interaction.user.id)) {
    await interaction.reply({ 
      content: "Đang xử lý tương tác trước đó, vui lòng đợi.",
      flags: MessageFlags.Ephemeral 
    });
    return;
  }
  
  // Mark this user as having an interaction in progress
  interactionsInProgress.set(interaction.user.id, Date.now());
  
  try {
    if (!game) {
      interactionsInProgress.delete(interaction.user.id);
      return;
    }
    
    // Check if user is the host
    if (game.host.id !== interaction.user.id) {
      await interaction.reply({ 
        content: "Chỉ người tạo trò chơi mới có thể bắt đầu!", 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }
    
    // Check if game is in lobby state
    if (game.state !== 'LOBBY') {
      await interaction.reply({ 
        content: "Trò chơi đã bắt đầu!", 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }
    
    try {
      // Acknowledge the interaction immediately
      await interaction.deferReply();
      
      // Start the game
      const result = await game.start();
      
      if (result.success) {
        await interaction.editReply("Trò chơi Ma Sói đã bắt đầu! Mỗi người chơi sẽ nhận được tin nhắn riêng với vai trò của mình.");
        
        // Disable the lobby buttons
        try {
          const message = await interaction.channel.messages.fetch(game.messageId);
          if (message) {
            await message.edit({ components: [] });
          }
        } catch (error) {
          console.error("Error disabling lobby buttons:", error);
        }
      } else {
        await interaction.editReply({
          content: result.message
        });
      }
    } catch (error) {
      console.error("Error handling start button:", error);
      // Try to respond if we haven't already
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "Có lỗi xảy ra khi bắt đầu trò chơi.",
          flags: MessageFlags.Ephemeral
        });
      }
    }
  } finally {
    // Remove the interaction lock after a short delay
    setTimeout(() => {
      interactionsInProgress.delete(interaction.user.id);
    }, 1000);
  }
}

/**
 * Handle vote button interaction
 * @param {Interaction} interaction - Discord interaction
 * @param {Object} game - Game instance
 */
async function handleVoteButton(interaction, game) {
  // Check if this user already has an interaction in progress
  if (interactionsInProgress.has(interaction.user.id)) {
    await interaction.reply({ 
      content: "Đang xử lý tương tác trước đó, vui lòng đợi.",
      flags: MessageFlags.Ephemeral 
    });
    return;
  }
  
  // Mark this user as having an interaction in progress
  interactionsInProgress.set(interaction.user.id, Date.now());
  
  try {
    if (!game || game.state !== 'VOTING') {
      await interaction.reply({ 
        content: "Không thể bỏ phiếu trong lúc này.", 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }
    
    // Extract target ID from button custom ID
    const customId = interaction.customId;
    let targetId;
    
    if (customId === CUSTOM_ID.VOTE_SKIP) {
      targetId = 'skip';
    } else {
      targetId = customId.replace(CUSTOM_ID.VOTE_PREFIX, '');
    }
    
    // Register vote
    const result = game.handleVote(interaction.user.id, targetId);
    
    if (result.success) {
      await interaction.reply({ 
        content: result.message, 
        flags: MessageFlags.Ephemeral 
      });
    } else {
      await interaction.reply({ 
        content: result.message || "Bạn không thể bỏ phiếu trong lúc này.", 
        flags: MessageFlags.Ephemeral 
      });
    }
  } catch (error) {
    console.error("Error in handleVoteButton:", error);
    // Try to reply if we haven't already
    if (!interaction.replied) {
      await interaction.reply({ 
        content: "Có lỗi xảy ra khi xử lý phiếu bầu.", 
        flags: MessageFlags.Ephemeral 
      });
    }
  } finally {
    // Remove the interaction lock after processing
    setTimeout(() => {
      interactionsInProgress.delete(interaction.user.id);
    }, 1000);
  }
}

/**
 * Update the lobby message with current players
 * @param {Object} game - Game instance
 */
async function updateLobbyMessage(game) {
  if (game.messageId) {
    try {
      const message = await game.channel.messages.fetch(game.messageId);
      
      const { embed } = messageUtils.createLobbyMessage(game);
      
      await message.edit({ embeds: [embed] });
    } catch (error) {
      console.error("Error updating lobby message:", error);
    }
  }
}

module.exports = {
  handleJoinButton,
  handleStartButton,
  handleVoteButton,
  updateLobbyMessage
};