// modules/werewolf/game.js
const { EmbedBuilder } = require('discord.js');
const { STATE, NIGHT_PHASE, TEAM } = require('./constants');
const { getRole, getAllRoles } = require('./roles');
const messageUtils = require('./utils/messageUtils');

class WerewolfGame {
  constructor(channel, host) {
    this.channel = channel;
    this.host = host;
    this.players = {};
    this.state = STATE.LOBBY;
    this.day = 0;
    this.nightPhase = null;
    this.votes = {};
    this.nightActions = {}; // Current night's actions
    this.actionHistory = []; // Persistent record of all actions by day
    this.deaths = [];
    this.protected = null;
    this.messageId = null;
    this.lastUpdated = Date.now();
    this.countdownMessage = null;
    this.currentWerewolfTarget = null;
    this.werewolfIds = [];
    this.winner = null;
    this.roleDistribution = this._getDefaultRoleDistribution();
  }

  /**
   * Get the default role distribution
   */
  _getDefaultRoleDistribution() {
    return {
      WEREWOLF: 1,
      VILLAGER: 2,
      SEER: 1,
      BODYGUARD: 0,
      WITCH: 0,
      HUNTER: 0
    };
  }

  /**
   * Add a player to the game
   * @param {Object} user - Discord user
   * @returns {boolean} Success or failure
   */
  addPlayer(user) {
    if (this.state !== STATE.LOBBY) {
      return false;
    }
    
    if (this.players[user.id]) {
      return false;
    }
    
    // Get the display name if in a guild, otherwise use username
    let displayName = user.username;
    
    // Try to get guild member display name
    try {
      if (user.member) {
        displayName = user.member.displayName || user.username;
      } else if (this.channel.guild) {
        const member = this.channel.guild.members.cache.get(user.id);
        if (member) {
          displayName = member.displayName || user.username;
        }
      }
    } catch (error) {
      console.error("Error getting display name:", error);
    }
    
    this.players[user.id] = {
      id: user.id,
      user: user,
      name: displayName,
      username: user.username,
      role: null,
      isAlive: true,
      voteCount: 0,
      hasVoted: false
    };
    
    return true;
  }
  
  /**
   * Remove a player from the game
   * @param {string} userId - Discord user ID
   * @returns {boolean} Success or failure
   */
  removePlayer(userId) {
    if (this.state !== STATE.LOBBY) {
      return false;
    }
    
    if (this.players[userId]) {
      delete this.players[userId];
      return true;
    }
    
    return false;
  }
  
  /**
   * Start the game
   * @param {number} aiPlayerCount - Number of AI players to add if needed
   * @returns {Object} Success/failure and message
   */
  async start(aiPlayerCount = 0) {
    if (this.state !== STATE.LOBBY) {
      return {
        success: false,
        message: "Trò chơi đã bắt đầu."
      };
    }
    
    let playerCount = Object.keys(this.players).length;
    
    // Check if we need to add AI players
    if (aiPlayerCount > 0 && playerCount < aiPlayerCount) {
      await this._addAIPlayers(aiPlayerCount);
      playerCount = Object.keys(this.players).length;
    }
    
    if (playerCount < 4) {
      return {
        success: false,
        message: "Cần ít nhất 4 người chơi để bắt đầu trò chơi."
      };
    }
    
    // Fetch guild member data for all human players if needed
    await this._fetchMemberData();
    
    // Assign roles to players
    this._assignRoles();
    
    // Send role DMs to all human players
    await this._sendRoleDMs();
    
    // Start the first night
    this.state = STATE.NIGHT;
    this.day = 1;
    await this.startNight();
    
    return {
      success: true,
      message: null
    };
  }
  
  /**
   * Add AI players to reach desired player count
   * @param {number} targetCount - Desired total player count
   */
  async _addAIPlayers(targetCount) {
    const aiManager = require('./ai/aiManager');
    
    // Create AI players
    const aiPlayers = aiManager.createAIPlayers(this, targetCount);
    
    // Add AI players to the game
    for (const aiPlayer of aiPlayers) {
      this.players[aiPlayer.id] = aiPlayer;
    }
    
    // Notify about AI players being added
    if (aiPlayers.length > 0) {
      const aiNames = aiPlayers.map(p => p.name).join(', ');
      
      const embed = new EmbedBuilder()
        .setTitle(`🤖 Bot Tham Gia`)
        .setDescription(`${aiPlayers.length} bot đã tham gia trò chơi: ${aiNames}`)
        .setColor("#3498db");
      
      await this.channel.send({ embeds: [embed] });
    }
  }
  
  /**
   * Fetch guild member data for all players if needed
   */
  async _fetchMemberData() {
    const promises = [];
    
    for (const playerId in this.players) {
      const player = this.players[playerId];

      if (player.isAI) {
        continue;
      }
    
      if (!player.user.member && this.channel.guild) {
        try {
          const promise = this.channel.guild.members.fetch(playerId)
            .then(member => {
              if (member) {
                player.user.member = member;
                player.name = member.displayName || player.name;
              }
            })
            .catch(error => {
              console.error(`Error fetching member for player ${player.name}:`, error);
            });
            
          promises.push(promise);
        } catch (error) {
          console.error(`Error setting up fetch for player ${player.name}:`, error);
        }
      }
    }
    
    await Promise.all(promises);
  }
  
  /**
   * Adjust role distribution based on player count
   * @param {number} playerCount - Number of players
   */
  _adjustRoleDistribution(playerCount) {
    // Reset to default first
    this.roleDistribution = this._getDefaultRoleDistribution();
    
    // Add more roles as player count increases
    if (playerCount >= 6) {
      this.roleDistribution.BODYGUARD = 1;
    }
    
    if (playerCount >= 8) {
      this.roleDistribution.WEREWOLF += 1;
      this.roleDistribution.HUNTER = 1;
    }
    
    if (playerCount >= 10) {
      this.roleDistribution.WEREWOLF = 3;
    }
    
    if (playerCount >= 12) {
      this.roleDistribution.VILLAGER += 2;
    }
    
    // Ensure we have enough roles for all players
    const totalRoles = Object.values(this.roleDistribution).reduce((a, b) => a + b, 0);
    if (totalRoles < playerCount) {
      this.roleDistribution.VILLAGER += (playerCount - totalRoles);
    }
  }
  
  /**
   * Assign roles to players
   */
  _assignRoles() {
    // Get all players
    const playerIds = Object.keys(this.players);
    
    // Adjust role distribution based on player count
    this._adjustRoleDistribution(playerIds.length);
    
    // Create role pool
    const rolePool = [];
    for (const [roleId, count] of Object.entries(this.roleDistribution)) {
      for (let i = 0; i < count; i++) {
        rolePool.push(roleId);
      }
    }
    
    // Shuffle role pool
    this._shuffle(rolePool);
    
    // Clear werewolf ID array
    this.werewolfIds = [];
    
    // Assign roles
    playerIds.forEach((playerId, index) => {
      const player = this.players[playerId];
      if (index < rolePool.length) {
        player.role = rolePool[index];
        
        // If werewolf, add to werewolf ID array
        if (player.role === "WEREWOLF") {
          this.werewolfIds.push(playerId);
        }
      } else {
        // Default to villager if not enough roles
        player.role = "VILLAGER";
      }
    });
  }
  
  /**
   * Send role DMs to all players
   */
  async _sendRoleDMs() {
    const promises = [];
    
    for (const playerId in this.players) {
      const player = this.players[playerId];
      const role = getRole(player.role);

      if (player.isAI) {
        continue;
      }
      
      if (!role) {
        console.error(`Unknown role ${player.role} for player ${player.name}`);
        continue;
      }
      
      // Create embed for the role
      const embed = role.createRoleDMEmbed(this, player);
      
      // Try to send DM
      try {
        const dm = await player.user.send({ embeds: [embed] });
        promises.push(dm);
      } catch (error) {
        // If DM fails, notify in channel
        console.error(`Failed to send role DM to ${player.name}:`, error);
        const failEmbed = new EmbedBuilder()
          .setTitle(`⚠️ Không thể gửi tin nhắn riêng`)
          .setDescription(`${player.user}, cài đặt quyền riêng tư của bạn đang chặn tin nhắn. Vui lòng bật nhận tin nhắn riêng để nhận vai trò của bạn.`)
          .setColor("#ff9900");
        
        const failMsg = await this.channel.send({ embeds: [failEmbed] });
        promises.push(failMsg);
      }
    }
    
    await Promise.all(promises);
  }
  
  /**
   * Start the night phase
   */
  async startNight() {
    this.state = STATE.NIGHT;
    this.nightPhase = null;
    this.nightActions = {};
    
    await this.advanceNightPhase();
  }
  
  /**
   * Advance to the next night phase
   */
  async advanceNightPhase() {
    console.log(`Current phase: ${this.nightPhase}`);
    const phases = Object.values(NIGHT_PHASE);
    
    // If no phase set, start with the first one
    if (!this.nightPhase) {
      this.nightPhase = phases[0];
      console.log(`Starting first night phase: ${this.nightPhase}`);
    } else {
      // Move to the next phase
      const currentIndex = phases.indexOf(this.nightPhase);
      console.log(`Current phase index: ${currentIndex}, total phases: ${phases.length}`);
      
      if (currentIndex === phases.length - 1 || currentIndex === -1) {
        // All phases completed, process night results
        console.log("All night phases complete, processing results");
        await this.processNightResults();
        return;
      }
      
      this.nightPhase = phases[currentIndex + 1];
      console.log(`Advancing to next phase: ${this.nightPhase}`);
      
      // If moving to WITCH phase and we don't have a current werewolf target yet,
      // process werewolf voting to get their target
      if (this.nightPhase === "WITCH" && !this.currentWerewolfTarget) {
        console.log("Processing werewolf votes to inform the witch (from advanceNightPhase)");
        const werewolfRole = getRole("WEREWOLF");
        if (werewolfRole) {
          const werewolfResult = werewolfRole.executeNightResults(this);
          if (!this.currentWerewolfTarget) {
            this.currentWerewolfTarget = werewolfResult.targetId;
          }
          console.log(`Current werewolf target for witch: ${this.currentWerewolfTarget}`);
        }
      }
    }
    
    // Check if there are any players with this role
    const playersWithRole = this.getAlivePlayersWithRole(this.nightPhase);
    console.log(`Players with role ${this.nightPhase}: ${playersWithRole.length}`);
    
    if (playersWithRole.length === 0) {
      // Skip to the next phase if no players have this role
      console.log(`No players with role ${this.nightPhase}, skipping to next phase`);
      await this.advanceNightPhase();
      return;
    }
    
    // Send night action prompt to players with this role
    await this.promptNightAction();
  }
  
  /**
   * Prompt players for their night action
   */
  async promptNightAction() {
    const playersWithRole = this.getAlivePlayersWithRole(this.nightPhase);
    
    // Skip if no players with this role
    if (playersWithRole.length === 0) {
      console.log(`No players with role ${this.nightPhase}, advancing to next phase`);
      await this.advanceNightPhase();
      return;
    }
    
    console.log(`Prompting ${playersWithRole.length} players with role ${this.nightPhase}`);
    
    // Split players into human and AI
    const humanPlayers = playersWithRole.filter(p => !p.isAI);
    const aiPlayers = playersWithRole.filter(p => p.isAI);
    
    console.log(`Human players: ${humanPlayers.length}, AI players: ${aiPlayers.length}`);
    
    // For each human player with the role, send them a prompt
    const promises = [];
    const dmFailures = [];
    
    for (const player of humanPlayers) {
      const role = getRole(player.role);
      
      if (!role || !role.createNightActionPrompt) {
        console.error(`Role ${player.role} for player ${player.name} is not properly initialized`);
        // Mark as processed so we don't get stuck
        if (!this.nightActions.processedPlayers) {
          this.nightActions.processedPlayers = new Set();
        }
        this.nightActions.processedPlayers.add(player.id);
        continue;
      }
      
      // Get night action prompt from the role
      const { embed, components } = role.createNightActionPrompt(this, player);
      
      // Send the prompt to the player
      try {
        const message = await player.user.send({ 
          embeds: [embed], 
          components: components || [] 
        });
        promises.push(message);
      } catch (error) {
        console.error(`Failed to send night action prompt to ${player.name}:`, error);
        dmFailures.push(player);
        
        // For players we couldn't DM, immediately process a null action
        this.handleNightAction(player.id, null);
      }
    }
    
    // Process AI player actions immediately
    if (aiPlayers.length > 0) {
      const aiManager = require('./ai/aiManager');
      await aiManager.processAINightActions(this, this.nightPhase);
    }
    
    // Update game status in the main channel
    const statusEmbed = messageUtils.createNightStatusEmbed(this);
    const statusMessage = await this.channel.send({ embeds: [statusEmbed] });
    promises.push(statusMessage);
    
    // If there were DM failures, notify in the channel
    if (dmFailures.length > 0) {
      const failureNames = dmFailures.map(p => p.name).join(", ");
      const failureEmbed = new EmbedBuilder()
        .setTitle("⚠️ Không thể gửi tin nhắn hành động đêm")
        .setDescription(`Không thể gửi tin nhắn tới: ${failureNames}. Hành động của họ sẽ được bỏ qua.`)
        .setColor("#ff9900");
      
      const failureMessage = await this.channel.send({ embeds: [failureEmbed] });
      promises.push(failureMessage);
    }
    
    await Promise.all(promises);
    
    // Auto-advance night phase after timeout (only needed for human players)
    if (humanPlayers.length > 0) {
      setTimeout(() => {
        // Check if we're still in the same phase
        if (this.state === STATE.NIGHT && this.nightPhase) {
          console.log(`Timeout for ${this.nightPhase} phase reached`);
          
          // Check if all human players have acted
          const pendingPlayers = humanPlayers.filter(p => {
            if (!this.nightActions.processedPlayers) return true;
            return !this.nightActions.processedPlayers.has(p.id);
          });
          
          console.log(`Pending human players: ${pendingPlayers.length}`);
          
          if (pendingPlayers.length > 0) {
            // Auto-submit null actions for pending players
            for (const player of pendingPlayers) {
              console.log(`Auto-submitting action for ${player.name}`);
              this.handleNightAction(player.id, null);
            }
          } else if (this.nightPhase) {
            // Force advance if we're still stuck somehow
            console.log("Forcing phase advancement");
            this.advanceNightPhase();
          }
        }
      }, 60000); // 1 minute timeout for night actions
    }
  }

  /**
   * Handle a night action from a player
   * @param {string} playerId - Player ID
   * @param {string|null} targetId - Target ID or special action
   * @returns {Object} Result of the action
   */
  handleNightAction(playerId, targetId) {
    const player = this.players[playerId];
    
    // Check if player exists and is alive
    if (!player || !player.isAlive) {
      return { success: false, message: "Người chơi không hợp lệ" };
    }
    
    // Check if player has the correct role for the current phase
    if (player.role !== this.nightPhase) {
      return { success: false, message: "Không phải lượt của vai trò này" };
    }
    
    // Get the role implementation
    const role = getRole(player.role);
    
    if (!role) {
      return { success: false, message: "Vai trò không hợp lệ" };
    }
    
    // Process the action using the role's implementation
    const result = role.processNightAction(this, playerId, targetId);
    
    // For werewolves specifically, we want to log each vote
    if (this.nightPhase === 'WEREWOLF') {
      console.log(`Werewolf ${player.name} voted for target: ${targetId} (${this.players[targetId]?.name || 'unknown'})`);
    }
    
    // Check if all players of the current role have acted
    if (result.success) {
      // Mark that this action has been processed
      if (!this.nightActions.processedPlayers) {
        this.nightActions.processedPlayers = new Set();
      }
      this.nightActions.processedPlayers.add(playerId);
      
      // Special handling for witch kill selection (don't advance yet)
      if (result.killSelect) {
        return result;
      }
      
      // Check if all players of this role have acted
      const playersWithRole = this.getAlivePlayersWithRole(this.nightPhase);
      
      // For werewolves, check werewolfVotes
      if (this.nightPhase === 'WEREWOLF') {
        const allWerewolvesActed = playersWithRole.every(wolf => 
          this.nightActions.processedPlayers.has(wolf.id) || 
          this.nightActions.werewolfVotes?.[wolf.id]
        );
        
        if (allWerewolvesActed) {
          console.log("All werewolves have acted, advancing to next phase");
          
          // Process werewolf results immediately to set currentWerewolfTarget
          const werewolfRole = getRole('WEREWOLF');
          if (werewolfRole) {
            console.log("Processing werewolf votes immediately");
            const werewolfResult = werewolfRole.executeNightResults(this);
            this.currentWerewolfTarget = werewolfResult.targetId;
            console.log(`Set current werewolf target to: ${this.currentWerewolfTarget} (${this.players[this.currentWerewolfTarget]?.name || 'unknown'})`);
          }
          
          setTimeout(() => this.advanceNightPhase(), 1000);
        }
      }
      // For witch, check if the action is complete (not just selecting kill target)
      else if (this.nightPhase === 'WITCH') {
        const allWitchesActed = playersWithRole.every(witch => 
          this.nightActions.processedPlayers.has(witch.id) || 
          this.nightActions.witchAction
        );
        
        if (allWitchesActed) {
          console.log("Witch action complete, advancing to next phase");
          setTimeout(() => this.advanceNightPhase(), 1000);
        }
      }
      // For other roles, simply check if all have acted
      else {
        const allPlayersActed = playersWithRole.every(p => 
          this.nightActions.processedPlayers.has(p.id)
        );
        
        if (allPlayersActed) {
          console.log(`All ${this.nightPhase} players have acted, advancing to next phase`);
          setTimeout(() => this.advanceNightPhase(), 1000);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Process the results of the night phase
   */
  async processNightResults() {
    // Reset deaths array
    this.deaths = [];
    
    // Process werewolf action
    const werewolfRole = getRole('WEREWOLF');
    if (werewolfRole) {
      const werewolfResult = werewolfRole.executeNightResults(this);
      if (werewolfResult.targetId) {
        this.currentWerewolfTarget = werewolfResult.targetId;
      }
    }
    
    // Process bodyguard action
    const bodyguardRole = getRole('BODYGUARD');
    if (bodyguardRole) {
      const bodyguardResult = bodyguardRole.executeNightResults(this);
      if (bodyguardResult.protectedId) {
        this.protected = bodyguardResult.protectedId;
      }
    }
    
    // Check if werewolf target was protected
    let werewolfTargetKilled = true;
    if (this.currentWerewolfTarget && this.currentWerewolfTarget === this.protected) {
      werewolfTargetKilled = false; // Target was protected
    }
    
    // Process witch action
    const witchRole = getRole('WITCH');
    if (witchRole) {
      const witchResult = witchRole.executeNightResults(this);
      
      // Check if witch saved the werewolf target
      if (witchResult.savedTarget && witchResult.savedTarget === this.currentWerewolfTarget) {
        werewolfTargetKilled = false;
      }
      
      // Add witch kill to deaths
      if (witchResult.killedTarget) {
        this.deaths.push({
          playerId: witchResult.killedTarget,
          killer: "WITCH",
          message: "Bị đầu độc bởi Phù Thủy"
        });
      }
    }
    
    // Add werewolf kill to deaths if not protected
    if (this.currentWerewolfTarget && werewolfTargetKilled) {
      this.deaths.push({
        playerId: this.currentWerewolfTarget,
        killer: "WEREWOLF",
        message: "Bị Ma Sói cắn chết"
      });
    }
    
    // Apply deaths
    for (const death of this.deaths) {
      const player = this.players[death.playerId];
      if (player) {
        player.isAlive = false;
      }
    }
    
    // Start the day phase
    await this.startDay();
  }
  
  /**
   * Start the day phase
   */
  async startDay() {
    this.state = STATE.DAY;
    this.votes = {};
    
    console.log(`Starting day ${this.day}, action history:`, JSON.stringify(this.actionHistory));
    
    // Save night actions before clearing
    if (!this.actionHistory[this.day - 1]) {
      this.actionHistory[this.day - 1] = {
        day: this.day,
        actions: JSON.parse(JSON.stringify(this.nightActions)),
        werewolfTarget: this.currentWerewolfTarget,
        protectedPlayer: this.protected
      };
    }
    
    // Report night results
    await this.reportNightResults();
    
    // Check game end conditions
    if (this.checkGameEnd()) {
      await this.endGame();
      return;
    }
    
    // Start countdown timer for discussion phase
    const discussionTime = 90; // 1.5 minutes in seconds
    await this.startCountdown(discussionTime, "Thảo luận", async () => {
      if (this.state === STATE.DAY) {
        await this.startVoting();
      }
    });
  }
  
  /**
   * Start a countdown timer that updates in real-time
   * @param {number} seconds - Duration in seconds
   * @param {string} phase - Name of the phase
   * @param {Function} callback - Function to call when countdown ends
   */
  async startCountdown(seconds, phase, callback) {
    // Create initial countdown message
    const embed = messageUtils.createCountdownEmbed(seconds, phase);
    
    // Send and store the countdown message
    this.countdownMessage = await this.channel.send({ embeds: [embed] });
    
    // Calculate end time
    const endTime = Date.now() + (seconds * 1000);
    
    // Create timer ID to track this countdown
    const countdownId = `countdown_${Date.now()}`;
    if (!this.activeTimers) this.activeTimers = {};
    
    // Start countdown
    const countdownInterval = setInterval(async () => {
      // Check if game has ended or countdown was canceled
      if (this.state === STATE.ENDED || !this.activeTimers[countdownId]) {
        clearInterval(countdownInterval);
        delete this.activeTimers[countdownId];
        return;
      }
      
      const remainingTime = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      
      // Update the countdown message every 5 seconds or for the last 10 seconds
      if (remainingTime % 5 === 0 || remainingTime <= 10) {
        const updatedEmbed = messageUtils.createCountdownEmbed(remainingTime, phase);
        
        try {
          // Check if the message still exists before trying to edit it
          if (this.countdownMessage && !this.countdownMessage.deleted) {
            await this.countdownMessage.edit({ embeds: [updatedEmbed] });
          }
        } catch (error) {
          console.error("Error updating countdown message:", error);
          // If we can't update, stop the interval to prevent further errors
          clearInterval(countdownInterval);
          delete this.activeTimers[countdownId];
        }
      }
      
      // When countdown finishes
      if (remainingTime <= 0) {
        clearInterval(countdownInterval);
        delete this.activeTimers[countdownId];
        
        // Execute callback function when timer ends, but only if game is still active
        if (callback && this.state !== STATE.ENDED) {
          callback();
        }
      }
    }, 1000);
    
    // Store the interval ID for cleanup
    this.activeTimers[countdownId] = countdownInterval;
  }
  
  /**
   * Report the results of the night
   */
  async reportNightResults() {
    // Create embed for night results
    const embed = messageUtils.createDayResultsEmbed(this);
    
    await this.channel.send({ embeds: [embed] });
    
    // Send information to Seer if they used their ability
    await this.reportSeerResult();
  }
  
  /**
   * Report the result of the Seer's night action
   */
  async reportSeerResult() {
    const seers = this.getAlivePlayersWithRole("SEER");
    if (seers.length === 0) return;
    
    // Get the current seer
    const seer = seers[0];
    
    // First check seerResults (persistent storage)
    let targetId = null;
    if (this.seerResults && this.seerResults[this.day-1] && this.seerResults[this.day-1][seer.id]) {
      targetId = this.seerResults[this.day-1][seer.id];
      console.log(`Found seer target from persistent storage: ${targetId}`);
    } 
    // Then check action history
    else if (this.actionHistory && this.actionHistory[this.day-1]) {
      const nightRecord = this.actionHistory[this.day-1];
      if (nightRecord.actions.seerTarget) {
        targetId = nightRecord.actions.seerTarget;
        console.log(`Found seer target from action history: ${targetId}`);
      }
    } 
    // Finally check nightActions (though it might be cleared already)
    else if (this.nightActions.seerTarget) {
      targetId = this.nightActions.seerTarget;
      console.log(`Found seer target from current night actions: ${targetId}`);
    }
    
    if (!targetId) {
      console.log("No seer target found in any storage");
      return;
    }
    
    const target = this.players[targetId];
    if (!target) {
      console.log(`Seer target ${targetId} not found in players list`);
      return;
    }
    
    console.log(`Reporting seer result for ${seer.name}, target: ${target.name} (${target.role})`);
    
    // Use the Seer role's sendSeerResult method to deliver the result
    try {
      const seerRole = getRole("SEER");
      if (seerRole && typeof seerRole.sendSeerResult === 'function') {
        await seerRole.sendSeerResult(this, seer, target);
      } else {
        // Fallback if the role method isn't available
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
        
        if (!seer.isAI) {
          await seer.user.send({ embeds: [embed] });
        }
      }
    } catch (error) {
      console.error(`Failed to send seer result to ${seer.name}:`, error);
    }
  }
  
  /**
   * Start the voting phase
   */
  async startVoting() {
    this.state = STATE.VOTING;
    this.votes = {};
    
    // Reset player vote tracking
    for (const playerId in this.players) {
      const player = this.players[playerId];
      if (player.isAlive) {
        player.hasVoted = false;
        player.voteCount = 0;
      }
    }
    
    // Create and send voting message
    const { embed, components } = messageUtils.createVotingMessage(this);
    
    const voteMsg = await this.channel.send({
      embeds: [embed],
      components
    });
    
    // Process AI voting after a small delay
    setTimeout(async () => {
      // Check if we're still in voting phase
      if (this.state === STATE.VOTING) {
        const aiManager = require('./ai/aiManager');
        await aiManager.processAIVoting(this);
      }
    }, 5000); // Wait 5 seconds before AI votes
    
    // Start countdown timer for voting phase
    const votingTime = 60; // 1 minute in seconds
    await this.startCountdown(votingTime, "Bỏ phiếu", async () => {
      if (this.state === STATE.VOTING) {
        await this.endVoting(voteMsg);
      }
    });
  }
  
  /**
   * Handle a vote from a player
   * @param {string} voterId - ID of voting player
   * @param {string} targetId - ID of voted player, or 'skip'
   * @returns {Object} Result of the vote
   */
  handleVote(voterId, targetId) {
    const voter = this.players[voterId];
    
    // Check if voter exists and is alive
    if (!voter || !voter.isAlive) {
      return { success: false, message: "Bạn không thể bỏ phiếu" };
    }
    
    // Check if voter already voted
    if (voter.hasVoted) {
      // Remove previous vote
      const previousVote = this.votes[voterId];
      if (previousVote && previousVote !== 'skip') {
        const previousTarget = this.players[previousVote];
        if (previousTarget) {
          previousTarget.voteCount--;
        }
      }
    }
    
    // Skip vote
    if (targetId === 'skip') {
      voter.hasVoted = true;
      this.votes[voterId] = 'skip';
      return { success: true, message: "Bạn đã quyết định không bỏ phiếu." };
    }
    
    // Check if target exists and is alive
    const target = this.players[targetId];
    if (!target || !target.isAlive) {
      return { success: false, message: "Mục tiêu không hợp lệ" };
    }
    
    // Register vote
    voter.hasVoted = true;
    this.votes[voterId] = targetId;
    target.voteCount++;
    
    // Check if all players have voted
    const alivePlayers = this.getAlivePlayers();
    const votedPlayers = alivePlayers.filter(p => p.hasVoted);
    
    if (votedPlayers.length === alivePlayers.length) {
      // All players have voted, end voting immediately
      setTimeout(() => this.endVoting(), 1000);
    }
    
    return { success: true, message: `Bạn đã bỏ phiếu cho ${target.name}.` };
  }
  
  /**
   * End the voting phase
   * @param {Message} voteMsg - Discord message with voting buttons
   */
  async endVoting(voteMsg = null) {
    // Clear any countdown messages
    if (this.countdownMessage) {
      try {
        await this.countdownMessage.delete();
      } catch (error) {
        console.error("Error deleting countdown message:", error);
      }
      this.countdownMessage = null;
    }
    
    // Find player with most votes
    let maxVotes = 0;
    let executed = null;
    let tie = false;
    
    for (const playerId in this.players) {
      const player = this.players[playerId];
      if (player.voteCount > maxVotes) {
        maxVotes = player.voteCount;
        executed = player;
        tie = false;
      } else if (player.voteCount === maxVotes && maxVotes > 0) {
        tie = true;
      }
    }
    
    // Create result embed
    const embed = messageUtils.createVotingResultsEmbed(this, executed, tie, maxVotes);
    
    // Disable voting buttons if message exists
    if (voteMsg) {
      try {
        await voteMsg.edit({ components: [] });
      } catch (error) {
        console.error("Failed to disable voting buttons:", error);
      }
    }
    
    // Send results
    await this.channel.send({ embeds: [embed] });
    
    // If someone was executed, mark them as dead
    if (executed && !tie && maxVotes > 0) {
      executed.isAlive = false;
      
      // Check for special role effects on death
      const role = getRole(executed.role);
      if (role && typeof role.handleDeath === 'function') {
        await role.handleDeath(this, executed);
      }
    }
    
    // Check game end conditions
    if (this.checkGameEnd()) {
      await this.endGame();
      return;
    }
    
    // Start next night
    setTimeout(async () => {
      if (this.state !== STATE.ENDED) {
        this.day++;
        await this.startNight();
      }
    }, 10000); // 10 seconds before night starts
  }
  
  /**
   * Check if the game has ended
   * @returns {boolean} True if game is over
   */
  checkGameEnd() {
    // Count alive werewolves and villagers
    let aliveWerewolves = 0;
    let aliveVillagers = 0;
    
    for (const playerId in this.players) {
      const player = this.players[playerId];
      if (!player.isAlive) continue;
      
      if (player.role === "WEREWOLF") {
        aliveWerewolves++;
      } else {
        aliveVillagers++;
      }
    }
    
    let isGameOver = false;
    
    // No werewolves left - villagers win
    if (aliveWerewolves === 0) {
      this.winner = "DÂN LÀNG";
      isGameOver = true;
    }
    
    // Werewolves equal or outnumber villagers - werewolves win
    if (aliveWerewolves >= aliveVillagers) {
      this.winner = "MA SÓI";
      isGameOver = true;
    }
    
    // Clean up resources if game is over
    if (isGameOver) {
      // Mark game as ending (will be fully ENDED after announcement)
      this.state = STATE.ENDED;
    }
    
    return isGameOver;
  }
  
  /**
   * End the game and announce winners
   */
  async endGame() {
    this.state = STATE.ENDED;
    
    // Create winner announcement embed
    const embed = messageUtils.createGameEndEmbed(this);
    
    // Send winner announcement
    await this.channel.send({ embeds: [embed] });
    
    // Clean up the game resources
    this.cleanup();
  }
  
  /**
   * Clean up game resources
   */
  cleanup() {
    console.log(`Cleaning up game in channel ${this.channel.id}`);
    
    // Send a message for players to wait for the game to be cleaned up
    const cleanupEmbed = new EmbedBuilder()
      .setTitle("🧹 Trò Chơi Kết Thúc")
      .setDescription("Trò chơi đã kết thúc. Vui lòng chờ để chúng tôi dọn dẹp.")
      .setColor("#2f3136"); 
      
    this.channel.send({ embeds: [cleanupEmbed] });

    // Clear all active timers
    if (this.activeTimers) {
      Object.values(this.activeTimers).forEach(timer => {
        clearInterval(timer);
      });
      this.activeTimers = {};
    }
    
    // Clear countdown message reference
    this.countdownMessage = null;
    
    // For automatic removal from activeGames map, the module needs to handle this
    // We'll implement this in the command handlers
  }
  
  /**
   * Get all alive players
   * @returns {Array} Array of alive players
   */
  getAlivePlayers() {
    return Object.values(this.players).filter(p => p.isAlive);
  }
  
  /**
   * Get all alive players with a specific role
   * @param {string} role - Role ID
   * @returns {Array} Array of alive players with the role
   */
  getAlivePlayersWithRole(role) {
    return Object.values(this.players).filter(p => p.isAlive && p.role === role);
  }
  
  /**
   * Get all alive players except those with specific IDs
   * @param {Array} excludeIds - Array of player IDs to exclude
   * @returns {Array} Array of alive players not in excludeIds
   */
  getAlivePlayersExcept(excludeIds) {
    return Object.values(this.players).filter(p => 
      p.isAlive && !excludeIds.includes(p.id)
    );
  }
  
  /**
   * Shuffle an array (Fisher-Yates algorithm)
   * @param {Array} array - Array to shuffle
   * @returns {Array} Shuffled array
   */
  _shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

module.exports = WerewolfGame;