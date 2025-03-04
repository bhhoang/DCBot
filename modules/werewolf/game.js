// modules/werewolf/game.js
const { EmbedBuilder } = require('discord.js');
const { STATE, NIGHT_PHASE, TEAM } = require('./constants');
const { getRole, getAllRoles } = require('./roles');
const messageUtils = require('./utils/messageUtils');
const ttsUtils = require('./utils/ttsUtils');
const SeerResultTracker = require('./utils/seerTracker');

/**
 * Process any pending deaths including Hunter shots
 * @param {Object} gameState - Current game state
 */
async function processDeaths(gameState) {
  // Process any pending deaths from Hunter shots or other sources
  if (gameState.pendingDeaths && gameState.pendingDeaths.length > 0) {
    console.log(`[DEBUG-DEATHS] Processing ${gameState.pendingDeaths.length} pending deaths:`,
      gameState.pendingDeaths.map(d => `${d.playerId} (${gameState.players[d.playerId]?.name || 'unknown'}) by ${d.killer}`).join(', '));

    gameState.deaths.push(...gameState.pendingDeaths);
    gameState.pendingDeaths = []; // Clear after processing
  }

  // Log deaths before processing
  console.log(`[DEBUG-DEATHS] Processing ${gameState.deaths.length} deaths total:`,
    gameState.deaths.map(d => `${d.playerId} (${gameState.players[d.playerId]?.name || 'unknown'}) by ${d.killer}`).join(', '));

  // Apply deaths
  for (const death of gameState.deaths) {
    const player = gameState.players[death.playerId];
    if (player) {
      // Check if player is already dead to avoid double-processing
      if (!player.isAlive) {
        console.log(`[DEBUG-DEATHS] Player ${player.name} is already marked as dead, skipping`);
        continue;
      }

      // Mark player as dead and announce it
      player.isAlive = false;
      console.log(`[DEBUG-DEATHS] Marked player ${player.name} as dead from ${death.killer}`);

      // Process Hunter death ability for anyone killed by other means
      // This is critical - ensures the Hunter's death ability is handled immediately
      if (player.role === 'HUNTER' &&
        !gameState.hunterAbilityUsed?.[player.id] &&
        !gameState.hunterShotFired?.[player.id]) {

        console.log(`[DEBUG-DEATHS] Hunter ${player.name} died, queuing death ability`);

        // Initialize Hunter tracking if needed
        if (!gameState.hunterPendingAbility) {
          gameState.hunterPendingAbility = [];
        }

        // Add to the list of Hunters that need to use their ability
        gameState.hunterPendingAbility.push(player.id);
      }
    } else {
      console.log(`[DEBUG-DEATHS] Could not find player with ID ${death.playerId}`);
    }
  }

  // Log all alive players to verify game state
  const alivePlayers = Object.values(gameState.players).filter(p => p.isAlive);
  console.log(`[DEBUG-DEATHS] After processing deaths, alive players (${alivePlayers.length}):`,
    alivePlayers.map(p => `${p.name} (${p.role})`).join(', '));
}

/**
 * Convert players marked by Cursed Werewolf and notify all werewolves
 * @param {Object} gameState - Current game state
 */
async function processConversions(gameState) {
  if (!gameState.playersToConvert || gameState.playersToConvert.length === 0) {
    return; // Nothing to convert
  }

  console.log(`[DEBUG-CURSED] Converting ${gameState.playersToConvert.length} players to werewolves...`);

  // Initialize the cursed players array if needed
  if (!gameState.cursedPlayers) {
    gameState.cursedPlayers = [];
  }

  // Track newly converted players for team notifications
  const newlyConvertedPlayers = [];

  // First pass: Convert all players
  for (const playerId of gameState.playersToConvert) {
    const player = gameState.players[playerId];
    if (!player || !player.isAlive) {
      console.log(`[DEBUG-CURSED] Player ${player?.name || playerId} is not available for conversion`);
      continue;
    }

    // Record the original role before conversion
    const originalRole = player.role;

    // Only add if not already converted
    const alreadyConverted = gameState.cursedPlayers.some(cp => cp.playerId === playerId);
    if (alreadyConverted) {
      console.log(`[DEBUG-CURSED] Player ${player.name} already converted, skipping`);
      continue;
    }

    // Add to conversion history
    gameState.cursedPlayers.push({
      playerId,
      originalRole: originalRole,
      day: gameState.day
    });

    console.log(`[DEBUG-CURSED] Converting player ${player.name} from ${originalRole} to WEREWOLF`);

    // Convert player to werewolf
    player.role = "WEREWOLF"; // IMPORTANT: Use WEREWOLF not CURSED_WEREWOLF for converted players

    // Add them to werewolf IDs array if needed
    if (!gameState.werewolfIds) {
      gameState.werewolfIds = [];
    }

    if (!gameState.werewolfIds.includes(playerId)) {
      gameState.werewolfIds.push(playerId);
    }

    // Add to newly converted list for notifications
    newlyConvertedPlayers.push(player);
  }

  // Get all werewolves for team notifications
  const allWerewolves = Object.values(gameState.players).filter(p =>
    p.isAlive && (p.role === "WEREWOLF" || p.role === "CURSED_WEREWOLF")
  );

  console.log(`[DEBUG-CURSED] All werewolves after conversion: ${allWerewolves.map(w => w.name).join(', ')}`);

  // Second pass: Notify all players about their teams
  // First, notify newly converted players
  for (const convertedPlayer of newlyConvertedPlayers) {
    if (convertedPlayer.isAI) continue; // Skip AI players

    try {
      // Get werewolf role info
      const werewolfRole = getRole("WEREWOLF");
      if (!werewolfRole) {
        console.error("[ERROR] Could not find WEREWOLF role info");
        continue;
      }

      // Get teammates (all other werewolves)
      const teammates = allWerewolves.filter(w => w.id !== convertedPlayer.id);
      const teammateNames = teammates.map(w => w.name).join(", ");

      console.log(`[DEBUG-CURSED] Notifying ${convertedPlayer.name} about conversion and teammates: ${teammateNames}`);

      // Create embed for the new role
      const embed = new EmbedBuilder()
        .setTitle(`🌙 Bạn Đã Bị Nguyền!`)
        .setDescription(`Bạn đã bị Sói Nguyền biến thành **${werewolfRole.name}** ${werewolfRole.emoji}`)
        .setColor("#ff0000")
        .addFields(
          { name: "Vai Trò Mới", value: werewolfRole.description },
          { name: "Phe", value: werewolfRole.team },
          { name: "Lưu ý", value: "Bạn đã bị nguyền và trở thành Ma Sói. Bây giờ bạn thuộc về phe Ma Sói và phải giúp họ chiến thắng." }
        );

      // Add teammate information
      if (teammateNames) {
        embed.addFields({ name: "Đồng Đội Ma Sói", value: teammateNames });
      } else {
        embed.addFields({ name: "Đồng Đội Ma Sói", value: "Bạn là Ma Sói duy nhất" });
      }

      // Send notification
      await convertedPlayer.user.send({ embeds: [embed] });
      console.log(`[DEBUG-CURSED] Successfully sent conversion notification to ${convertedPlayer.name}`);
    } catch (error) {
      console.error(`[ERROR] Failed to send conversion notification to ${convertedPlayer.name}:`, error);
    }
  }

  // Now notify existing werewolves about new teammates
  if (newlyConvertedPlayers.length > 0) {
    const existingWerewolves = allWerewolves.filter(w =>
      !newlyConvertedPlayers.some(c => c.id === w.id) && !w.isAI
    );

    for (const existingWolf of existingWerewolves) {
      try {
        // Skip if AI
        if (existingWolf.isAI) continue;

        // Create list of new teammates
        const newTeammateNames = newlyConvertedPlayers.map(p => p.name).join(", ");

        console.log(`[DEBUG-CURSED] Notifying existing werewolf ${existingWolf.name} about new teammates: ${newTeammateNames}`);

        // Create embed notification
        const embed = new EmbedBuilder()
          .setTitle(`🐺 Đồng Đội Ma Sói Mới!`)
          .setDescription(`Sói Nguyền đã biến đổi thêm dân làng thành Ma Sói.`)
          .setColor("#ff0000")
          .addFields(
            { name: "Đồng Đội Ma Sói Mới", value: newTeammateNames },
            { name: "Lưu ý", value: "Hãy hợp tác với họ để chiến thắng dân làng." }
          );

        // Send notification
        await existingWolf.user.send({ embeds: [embed] });
        console.log(`[DEBUG-CURSED] Successfully notified ${existingWolf.name} about new teammates`);
      } catch (error) {
        console.error(`[ERROR] Failed to notify ${existingWolf.name} about new teammates:`, error);
      }
    }
  }

  // Clear the conversion queue
  gameState.playersToConvert = [];
}

class WerewolfGame {
  constructor(channel, host) {
    this.channel = channel;
    this.host = host;
    this.players = {};
    this.state = STATE.LOBBY;
    this.day = 0;
    this.nightPhase = null;
    this.votes = {};
    this.nightActions = {};
    this.actionHistory = [];
    this.deaths = [];
    this.protected = null;
    this.messageId = null;
    this.lastUpdated = Date.now();
    this.countdownMessage = null;
    this.currentWerewolfTarget = null;
    this.werewolfIds = [];
    this.winner = null;
    this.roleDistribution = this._getDefaultRoleDistribution();
    this.voiceEnabled = false; // Add this flag to enable/disable TTS
    this.voiceChannel = null; // Store the voice channel for TTS
    this.enableAIDiscussions = true;
  }

  /**
   * Get the default role distribution
   */
  _getDefaultRoleDistribution() {
    return {
      WEREWOLF: 1,
      CURSED_WEREWOLF: 0,
      VILLAGER: 3,
      SEER: 0,
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
  // Add a method to set the voice channel
  /**
   * Set the voice channel for TTS announcements
   * @param {Object} voiceChannel - Discord voice channel
   */
  setVoiceChannel(voiceChannel) {
    this.voiceChannel = voiceChannel;
    this.voiceEnabled = true;
    console.log(`Voice channel set to ${voiceChannel.name} (${voiceChannel.id})`);
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

  // Add this method to connect to voice
  /**
   * Try to join a voice channel for voice announcements
   * @param {VoiceChannel} voiceChannel - Discord voice channel
   */
  async connectVoice(voiceChannel) {
    if (!voiceChannel) {
      console.log('No voice channel specified');
      return false;
    }

    try {
      const success = await voiceUtils.joinVoice(voiceChannel, this.channel.id);
      if (success) {
        this.voiceEnabled = true;
        this.voiceChannel = voiceChannel;
        return true;
      }
    } catch (error) {
      console.error('Error connecting to voice channel:', error);
    }

    return false;
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
      this.roleDistribution.SEER = 1;
    }

    if (playerCount >= 8) {
      // Replace one werewolf with a cursed werewolf at 8+ players
      this.roleDistribution.VILLAGER = 2;
      this.roleDistribution.HUNTER = 1;
      this.roleDistribution.CURSED_WEREWOLF = 1;
    }

    if (playerCount >= 10) {
      this.roleDistribution.WITCH = 1;
    }

    if (playerCount >= 12) {
      this.roleDistribution.WEREWOLF += 1;
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

        // If werewolf or cursed werewolf, add to werewolf ID array
        if (player.role === "WEREWOLF" || player.role === "CURSED_WEREWOLF") {
          this.werewolfIds.push(playerId);
          console.log(`[DEBUG] Added ${player.name} (${player.role}) to werewolf IDs array`);
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
  
    // FIXED: Reset vote counts for all players at the start of night
    console.log(`[DEBUG-VOTING] Resetting all player vote counts at start of night for day ${this.day}`);
    for (const playerId in this.players) {
      const player = this.players[playerId];
      // Reset vote count to zero
      player.voteCount = 0;
      // Also reset hasVoted flag for alive players
      if (player.isAlive) {
        player.hasVoted = false;
      }
    }
  
    // TTS announcement for night start
    if (this.voiceEnabled && this.voiceChannel) {
      const nightText = ttsUtils.getGameAnnouncementText(this, 'night-start');
      await ttsUtils.speak(this.voiceChannel, nightText);
    }
  
    await this.advanceNightPhase();
  }

  /**
   * Advance to the next night phase
   */
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

    // FIXED: Only do TTS announcement if there are actually players with this role
    if (playersWithRole.length > 0 && this.voiceEnabled && this.voiceChannel) {
      const phaseText = ttsUtils.getGameAnnouncementText(this, 'night-phase');
      await ttsUtils.speak(this.voiceChannel, phaseText);

      // Add a small delay to let the announcement complete before sending prompts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (playersWithRole.length === 0) {
      // Skip to the next phase if no players have this role
      console.log(`No players with role ${this.nightPhase}, skipping to next phase`);
      await this.advanceNightPhase();
      return;
    }

    if (this.nightPhase === 'WEREWOLF') {
      // Log all werewolf types in game
      const werewolves = Object.values(this.players).filter(p =>
        p.isAlive && (p.role === 'WEREWOLF' || p.role === 'CURSED_WEREWOLF')
      );

      const normalWerewolves = werewolves.filter(p => p.role === 'WEREWOLF');
      const cursedWerewolves = werewolves.filter(p => p.role === 'CURSED_WEREWOLF');

      console.log(`[DEBUG-CURSED] Found ${normalWerewolves.length} regular werewolves and ${cursedWerewolves.length} cursed werewolves`);

      // Log the state of each cursed werewolf
      for (const wolf of cursedWerewolves) {
        const curseUsed = this.cursedWerewolfState?.[wolf.id]?.curseUsed || false;
        console.log(`[DEBUG-CURSED] Cursed werewolf ${wolf.name} has used curse: ${curseUsed}`);
      }
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
  /**
 * Handle a night action from a player
 * @param {string} playerId - Player ID
 * @param {string|null} targetId - Target ID or special action
 * @returns {Object} Result of the action
 */
  handleNightAction(playerId, targetId) {
    // Track actions in progress to prevent spam
    if (!this.actionsInProgress) {
      this.actionsInProgress = new Set();
    }

    // If this player already has an action in progress, reject new attempts
    if (this.actionsInProgress.has(playerId)) {
      return {
        success: false,
        message: "Đang xử lý hành động của bạn, vui lòng đợi."
      };
    }

    // Mark that this player has an action in progress
    this.actionsInProgress.add(playerId);

    try {
      const player = this.players[playerId];

      // Check if player exists and is alive
      if (!player || !player.isAlive) {
        this.actionsInProgress.delete(playerId); // Clear action lock
        return { success: false, message: "Người chơi không hợp lệ" };
      }

      // Check if player has the correct role for the current phase
      if (player.role !== this.nightPhase &&
        !(this.nightPhase === 'WEREWOLF' && player.role === 'CURSED_WEREWOLF')) {
        this.actionsInProgress.delete(playerId); // Clear action lock
        return { success: false, message: "Không phải lượt của vai trò này" };
      }

      // Get the role implementation
      const role = getRole(player.role);

      if (!role) {
        this.actionsInProgress.delete(playerId); // Clear action lock
        return { success: false, message: "Vai trò không hợp lệ" };
      }

      // Process the action using the role's implementation
      const result = role.processNightAction(this, playerId, targetId);

      // For werewolves specifically, we want to log each vote
      if (this.nightPhase === 'WEREWOLF') {
        console.log(`Werewolf ${player.name} voted for target: ${targetId} (${this.players[targetId]?.name || 'unknown'})`);
      }

      // Inside handleNightAction for better debugging:
      if (player.role === 'CURSED_WEREWOLF') {
        console.log(`[DEBUG] Cursed Werewolf ${player.name} is taking action: ${targetId}`);

        // Log the current state of cursedWerewolfState
        if (this.cursedWerewolfState && this.cursedWerewolfState[playerId]) {
          console.log(`[DEBUG] Current curse used state: ${this.cursedWerewolfState[playerId].curseUsed}`);
        } else {
          console.log(`[DEBUG] No curse state found for this player`);
        }
      }

      // Check if all players of the current role have acted
      if (result.success) {
        // Mark that this action has been processed
        if (!this.nightActions.processedPlayers) {
          this.nightActions.processedPlayers = new Set();
        }
        this.nightActions.processedPlayers.add(playerId);

        // Clear the action lock for this player
        this.actionsInProgress.delete(playerId);

        // Special handling for witch kill selection (don't advance yet)
        if (result.killSelect) {
          return result;
        }

        // Check if all players of this role have acted
        const playersWithRole = this.getAlivePlayersWithRole(this.nightPhase);

        // For werewolves, check werewolfVotes
        if (this.nightPhase === 'WEREWOLF') {
          // FIXED: Properly check if all werewolves (including cursed) have acted
          const allWerewolvesActed = playersWithRole.every(wolf => {
            // For cursed werewolf special handling in case of format issues
            if (wolf.role === 'CURSED_WEREWOLF') {
              return this.nightActions.processedPlayers.has(wolf.id) ||
                this.nightActions.werewolfVotes?.[wolf.id] !== undefined;
            }
            // Normal check for regular werewolves
            return this.nightActions.processedPlayers.has(wolf.id) ||
              this.nightActions.werewolfVotes?.[wolf.id] !== undefined;
          });

          if (allWerewolvesActed) {
            console.log("All werewolves have acted, advancing to next phase");
            console.log("[DEBUG] Werewolf votes:", JSON.stringify(this.nightActions.werewolfVotes || {}));

            // Process werewolf results immediately to set currentWerewolfTarget
            const werewolfRole = getRole('WEREWOLF');
            if (werewolfRole) {
              console.log("Processing werewolf votes immediately");
              const werewolfResult = werewolfRole.executeNightResults(this);
              this.currentWerewolfTarget = werewolfResult.targetId;
              console.log(`Set current werewolf target to: ${this.currentWerewolfTarget} (${this.players[this.currentWerewolfTarget]?.name || 'unknown'})`);
            }

            // Use a small delay to prevent race conditions when multiple actions are submitted simultaneously
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
      } else {
        // Clear the action lock if the action failed
        this.actionsInProgress.delete(playerId);
      }

      return result;
    } catch (error) {
      // Make sure to clear the lock if an error occurs
      this.actionsInProgress.delete(playerId);
      console.error(`Error processing night action for ${playerId}:`, error);
      return { success: false, message: "Có lỗi xảy ra khi xử lý hành động đêm." };
    }
  }

  /**
   * Process the results of the night phase
   */
  /**
 * Process the results of the night phase
 */
  async processNightResults() {
    // Reset deaths array
    this.deaths = [];

    // Process werewolf action
    const werewolfRole = getRole('WEREWOLF');
    const cursedWerewolfRole = getRole('CURSED_WEREWOLF');

    // Normal werewolf votes
    if (werewolfRole) {
      const werewolfResult = werewolfRole.executeNightResults(this);
      if (werewolfResult && werewolfResult.targetId) {
        this.currentWerewolfTarget = werewolfResult.targetId;
        console.log(`[DEBUG-CURSED] Set werewolf target to ${this.currentWerewolfTarget}`);
      }
    }

    // Process Cursed Werewolf's action separately
    if (cursedWerewolfRole) {
      const cursedWolves = Object.values(this.players)
        .filter(p => p.isAlive && p.role === 'CURSED_WEREWOLF');

      if (cursedWolves.length > 0) {
        console.log(`[DEBUG-CURSED] Processing ${cursedWolves.length} Cursed Werewolf actions`);
        const cursedResult = cursedWerewolfRole.executeNightResults(this);

        // Make sure not to overwrite the werewolf target if the cursed werewolf didn't vote
        if (cursedResult && cursedResult.targetId && !this.currentWerewolfTarget) {
          this.currentWerewolfTarget = cursedResult.targetId;
          console.log(`[DEBUG-CURSED] Set werewolf target to ${this.currentWerewolfTarget} from cursed werewolf`);
        }

        // Debug the curse information
        if (this.nightActions.cursedPlayer) {
          console.log(`[DEBUG-CURSED] Player ${this.nightActions.cursedPlayer} has been cursed`);
        }
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
      console.log(`[DEBUG-CURSED] Werewolf target ${this.currentWerewolfTarget} was protected`);
    }

    // Process witch action
    const witchRole = getRole('WITCH');
    if (witchRole) {
      const witchResult = witchRole.executeNightResults(this);

      // Check if witch saved the werewolf target
      if (witchResult.savedTarget && witchResult.savedTarget === this.currentWerewolfTarget) {
        werewolfTargetKilled = false;
        console.log(`[DEBUG-CURSED] Werewolf target ${this.currentWerewolfTarget} was saved by witch`);
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

    // Process Cursed Werewolf's curse (convert players)
    if (this.nightActions.cursedPlayer) {
      // Record the player to be converted
      if (!this.playersToConvert) {
        this.playersToConvert = [];
      }

      const cursedPlayerId = this.nightActions.cursedPlayer;

      // Only add if not already in the list
      if (!this.playersToConvert.includes(cursedPlayerId)) {
        this.playersToConvert.push(cursedPlayerId);
        console.log(`[DEBUG-CURSED] Added ${cursedPlayerId} to conversion list`);
      }
    }

    // Convert players marked by Cursed Werewolf
    await processConversions(this);

    // Add werewolf kill to deaths if not protected
    if (this.currentWerewolfTarget && werewolfTargetKilled) {
      this.deaths.push({
        playerId: this.currentWerewolfTarget,
        killer: "WEREWOLF",
        message: "Bị Ma Sói cắn chết"
      });
      console.log(`[DEBUG-CURSED] Added werewolf target ${this.currentWerewolfTarget} to deaths`);
    }

    // FIXED: Call the processDeaths function to handle all deaths including Hunter shots
    await processDeaths(this);

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
    
    // Process Hunter abilities at the start of day if any pending
    if (this.hunterPendingAbility && this.hunterPendingAbility.length > 0) {
      console.log(`[DEBUG-HUNTER] Processing ${this.hunterPendingAbility.length} pending Hunter abilities`);
      
      for (const hunterId of this.hunterPendingAbility) {
        const hunter = this.players[hunterId];
        
        if (hunter && !this.hunterAbilityUsed?.[hunterId]) {
          console.log(`[DEBUG-HUNTER] Processing Hunter ${hunter.name}'s death ability`);
          const hunterRole = getRole('HUNTER');
          if (hunterRole && typeof hunterRole.handleDeath === 'function') {
            await hunterRole.handleDeath(this, hunter);
          }
        }
      }
      
      // Clear pending abilities
      this.hunterPendingAbility = [];
      
      // Re-check game end after Hunter abilities
      if (this.checkGameEnd()) {
        await this.endGame();
        return;
      }
    }
  
    // FIXED: Report Seer results FIRST, before general night results
    // This ensures the Seer gets their information at the start of day
    console.log(`[DEBUG-SEER] Reporting Seer results at start of day ${this.day}`);
    await this.reportSeerResult();
  
    // Report night results
    await this.reportNightResults();
  
    // Send notifications to cursed players if any
    if (this.cursedPlayers && this.cursedPlayers.length > 0) {
      const cursedThisNight = this.cursedPlayers.filter(cp => cp.day === this.day - 1);
      for (const cursed of cursedThisNight) {
        const player = this.players[cursed.playerId];
        if (player && player.isAlive) {
          try {
            // Send DM to the player about their new role
            const werewolfRole = getRole("WEREWOLF");
            const embed = werewolfRole.createRoleDMEmbed(this, player);
  
            // Add a note about the curse
            embed.setDescription(`Bạn đã bị Sói Nguyền biến thành **${werewolfRole.name}** ${werewolfRole.emoji}`);
            embed.addFields({
              name: "Lưu ý",
              value: "Bạn đã bị nguyền và trở thành Ma Sói. Bây giờ bạn thuộc về phe Ma Sói và phải giúp họ chiến thắng."
            });
  
            await player.user.send({ embeds: [embed] });
          } catch (error) {
            console.error(`Failed to send role change DM to ${player.name}:`, error);
          }
        }
      }
    }
  
    // TTS announcement for day start
    if (this.voiceEnabled && this.voiceChannel) {
      const dayText = ttsUtils.getGameAnnouncementText(this, 'day-start');
      await ttsUtils.speak(this.voiceChannel, dayText);
    }
  
    // Check game end conditions
    if (this.checkGameEnd()) {
      await this.endGame();
      return;
    }
    
    await this.processAIDiscussions();
  
    // Start countdown timer for discussion phase
    const discussionTime = 90; // 1.5 minutes in seconds
    await this.startCountdown(discussionTime, "Thảo luận", async () => {
      if (this.state === STATE.DAY) {
        await this.startVoting();
      }
    });
    
    // Log cursed player information for debugging
    if (this.cursedPlayers && this.cursedPlayers.length > 0) {
      const cursedThisNight = this.cursedPlayers.filter(cp => cp.day === this.day - 1);
      console.log(`[DEBUG] Found ${cursedThisNight.length} players cursed last night`);
      
      for (const cursed of cursedThisNight) {
        const player = this.players[cursed.playerId];
        if (player) {
          console.log(`[DEBUG] Player ${player.name} was converted from ${cursed.originalRole} to ${player.role}`);
        }
      }
    }
  }

  // Updated processAIDiscussions method to use the enhanced discussion system
// Add this to the WerewolfGame class in modules/werewolf/game.js

/**
 * Process AI discussions during day phase
 * This should be called in the startDay method before the startCountdown call
 */
async processAIDiscussions() {
  // Skip if disabled
  if (!this.enableAIDiscussions) {
    console.log("[DEBUG-AI-DISCUSSION] AI discussions are disabled, skipping");
    return;
  }
  
  // Skip if no AI players
  const aiPlayers = Object.values(this.players).filter(p => p.isAI && p.isAlive);
  if (aiPlayers.length === 0) {
    console.log("[DEBUG-AI-DISCUSSION] No AI players alive, skipping discussions");
    return;
  }

  console.log(`[DEBUG-AI-DISCUSSION] Starting AI discussions with ${aiPlayers.length} AI players`);
  
  try {
    // Try to use Gemini API if available
    let useGemini = false;
    let geminiModule;
    try {
      geminiModule = require('./ai/geminiDiscussion');
      useGemini = true;
      console.log("[DEBUG-AI-DISCUSSION] Using Gemini API for enhanced discussions");
    } catch (error) {
      console.log("[DEBUG-AI-DISCUSSION] Gemini API module not available, using standard discussions");
      useGemini = false;
    }
    
    // Get the standard AI discussion module as fallback
    const aiDiscussion = require('./ai/aiDiscussion');
    
    // Reset discussion history at the start of each day
    if (typeof aiDiscussion.resetMessageHistory === 'function') {
      aiDiscussion.resetMessageHistory();
    }
    
    // Send introduction message
    await this.channel.send("**🔊 Cuộc thảo luận của dân làng bắt đầu:**");
    
    // Update AI knowledge based on discussions
    if (require('./ai/aiManager').updateAIKnowledge) {
      require('./ai/aiManager').updateAIKnowledge(this);
    }
    
    // Generate discussion messages
    let discussionMessages;
    
    // Try to use Gemini API if available
    if (useGemini && typeof geminiModule.createGeminiThreadedDiscussion === 'function') {
      discussionMessages = await geminiModule.createGeminiThreadedDiscussion(this);
    } 
    // Otherwise, use the standard discussion system
    else if (typeof aiDiscussion.createThreadedDiscussion === 'function') {
      discussionMessages = aiDiscussion.createThreadedDiscussion(this);
    } else {
      // Fallback to old system
      console.log("[DEBUG-AI-DISCUSSION] Using basic discussion system");
      
      // Determine how many discussion rounds based on player count
      const aliveCount = this.getAlivePlayers().length;
      
      // Calculate number of rounds (1-3 based on player count)
      const discussionRounds = Math.min(3, Math.max(1, Math.ceil(aliveCount / 4)));
      
      // Collect all messages from all rounds
      discussionMessages = [];
      
      // Process each round with a delay between
      for (let round = 1; round <= discussionRounds; round++) {
        // Generate messages for all AI players
        const roundMessages = aiDiscussion.generateAIDiscussions(this, round);
        discussionMessages = discussionMessages.concat(roundMessages);
      }
    }
    
    // If no messages were generated, skip
    if (!discussionMessages || discussionMessages.length === 0) {
      console.log("[DEBUG-AI-DISCUSSION] No discussion messages generated");
      return;
    }
    
    console.log(`[DEBUG-AI-DISCUSSION] Generated ${discussionMessages.length} total discussion messages`);
    
    // Send messages with delay between each
    for (const msg of discussionMessages) {
      const player = this.players[msg.playerId];
      if (!player || !player.isAlive) continue;
      
      // Skip if game is no longer in day phase
      if (this.state !== 'DAY') {
        console.log("[DEBUG-AI-DISCUSSION] Game state changed, stopping discussions");
        break;
      }
      
      // Get message and player info
      const { message, playerName, isResponse, responseToId } = msg;
      
      try {
        // Add formatting for responses to make conversation more clear
        let formattedMessage;
        if (isResponse) {
          if (responseToId && this.players[responseToId]) {
            const respondingTo = this.players[responseToId].name;
            formattedMessage = `**${playerName}** *(đáp lại ${respondingTo})*: ${message}`; 
          } else {
            formattedMessage = `**${playerName}**: *${message}*`; // Italics for responses
          }
        } else {
          formattedMessage = `**${playerName}**: ${message}`;
        }
        
        await this.channel.send(formattedMessage);
        
        // Random delay between messages based on length and type
        // Responses are quicker, longer messages take more time
        const baseDelay = isResponse ? 1000 : 2000;
        const lengthFactor = Math.min(2000, message.length * 20);
        const randomFactor = Math.floor(Math.random() * 1000);
        const delay = baseDelay + (lengthFactor / 20) + randomFactor;
        
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error) {
        console.error("[ERROR-AI-DISCUSSION] Failed to send message:", error);
      }
    }
    
    // Send a conclusion message
    if (this.state === 'DAY') {
      await this.channel.send("**🔊 Cuộc thảo luận kết thúc, chuẩn bị bỏ phiếu...**");
    }
    
    console.log("[DEBUG-AI-DISCUSSION] AI discussions completed");
    
  } catch (error) {
    console.error("[ERROR-AI-DISCUSSION] Error in AI discussions:", error);
  }
}

  /**
   * Start a countdown timer that updates in real-time
   * @param {number} seconds - Duration in seconds
   * @param {string} phase - Name of the phase
   * @param {Function} callback - Function to call when countdown ends
   */
  // In the startCountdown method, add this check to prevent duplicate timers

  async startCountdown(seconds, phase, callback) {
    // Clear any existing countdown timers first
    if (this.activeTimers) {
      Object.values(this.activeTimers).forEach(timerData => {
        if (timerData.interval) {
          clearInterval(timerData.interval);
        }
      });
    }

    // Create initial countdown message
    const embed = messageUtils.createCountdownEmbed(seconds, phase);

    // Send and store the countdown message
    this.countdownMessage = await this.channel.send({ embeds: [embed] });

    // Calculate end time
    const endTime = Date.now() + (seconds * 1000);

    // Create timer ID to track this countdown
    const countdownId = `countdown_${Date.now()}`;
    if (!this.activeTimers) this.activeTimers = {};

    // Define the update function that will run in the interval
    const updateCountdown = async () => {
      try {
        const remainingTime = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        // console.log(`Countdown update: ${remainingTime} seconds remaining for ${phase}`);

        // Store countdown time for TTS
        this.countdown = remainingTime;

        // TTS announcement for final countdown
        if (this.voiceEnabled && this.voiceChannel && remainingTime <= 10 && remainingTime > 0) {
          const countdownText = ttsUtils.getGameAnnouncementText(this, 'phase-countdown');
          await ttsUtils.speak(this.voiceChannel, countdownText);
        }

        // Update the countdown message every 5 seconds or for the last 10 seconds
        if (remainingTime % 5 === 0 || remainingTime <= 10) {
          const updatedEmbed = messageUtils.createCountdownEmbed(remainingTime, phase);

          // Check if the message still exists before trying to edit it
          if (this.countdownMessage && !this.countdownMessage.deleted) {
            await this.countdownMessage.edit({ embeds: [updatedEmbed] });
          }
        }

        // When countdown finishes
        if (remainingTime <= 0) {
          if (this.activeTimers[countdownId]) {
            clearInterval(this.activeTimers[countdownId].interval);
            delete this.activeTimers[countdownId];
          }

          // Execute callback function when timer ends, but only if game is still active
          if (callback && this.state !== STATE.ENDED) {
            callback();
          }
        }
      } catch (error) {
        console.error("Error updating countdown:", error);
        // If we can't update, stop the interval to prevent further errors
        if (this.activeTimers[countdownId]) {
          clearInterval(this.activeTimers[countdownId].interval);
          delete this.activeTimers[countdownId];
        }
      }
    };

    // Start countdown interval
    const countdownInterval = setInterval(updateCountdown, 1000);

    // Store the interval and timer info
    this.activeTimers[countdownId] = {
      phase: phase,
      startTime: Date.now(),
      endTime: endTime,
      interval: countdownInterval
    };

    // Run the update function once immediately to ensure it starts working right away
    await updateCountdown();
  }


  /**
   * Report the results of the night
   */
  // Add this to the reportNightResults method in game.js
  async reportNightResults() {
    // Use a message tracking property to prevent duplicate announcements
    if (this._lastMessageTimestamp && Date.now() - this._lastMessageTimestamp < 5000) {
      console.log("Preventing duplicate day announcement (too soon after last message)");
      return; // Skip if we recently sent a message (within 5 seconds)
    }

    // Create embed for night results
    const embed = messageUtils.createDayResultsEmbed(this);

    // Track this message timestamp
    this._lastMessageTimestamp = Date.now();

    await this.channel.send({ embeds: [embed] });

    // Send information to Seer if they used their ability
    // await this.reportSeerResult();
  }

  /**
   * Report the result of the Seer's night action
   */
  async reportSeerResult() {
    // Initialize tracker if needed
    if (!this.seerTracker) {
      this.seerTracker = new SeerResultTracker();
      console.log(`[SEER] Initialized new SeerTracker`);
    }
    
    // Debug current state
    this.seerTracker.debugState();
    
    // Find all seers (both alive and those who died last night)
    const aliveSeers = this.getAlivePlayersWithRole("SEER");
    const recentlyDeadSeers = Object.values(this.players).filter(p => 
      !p.isAlive && p.role === "SEER" && 
      this.deaths.some(d => d.playerId === p.id) // Died in the most recent night
    );
    
    const allSeers = [...aliveSeers, ...recentlyDeadSeers];
    
    if (allSeers.length === 0) {
      console.log(`[SEER] No seers found in the game`);
      return;
    }
    
    console.log(`[SEER] Found ${aliveSeers.length} alive seers and ${recentlyDeadSeers.length} recently dead seers`);
    
    // For each seer, check if they have a result from the previous night
    for (const seer of allSeers) {
      // Skip AI seers
      if (seer.isAI) {
        console.log(`[SEER] Skipping AI seer ${seer.name}`);
        continue;
      }
      
      // CHANGE THIS LINE: Use current day instead of previous day
      const targetDay = this.day;
      
      // Get the target from the current night
      const targetId = this.seerTracker.getTarget(targetDay, seer.id);
      
      if (!targetId) {
        console.log(`[SEER] No target found for seer ${seer.name} from night ${targetDay}`);
        continue;
      }
      
      const target = this.players[targetId];
      if (!target) {
        console.log(`[SEER] Target ${targetId} not found in players list`);
        continue;
      }
      
      console.log(`[SEER] Reporting result for seer ${seer.name}, night ${targetDay}, target: ${target.name} (${target.role})`);
      
      try {
        // Send the result to the seer
        const seerRole = getRole("SEER");
        if (seerRole && typeof seerRole.sendSeerResult === 'function') {
          await seerRole.sendSeerResult(this, seer, target);
          
          // Mark as delivered so we don't send it again
          this.seerTracker.markDelivered(this.day, seer.id);
          console.log(`[SEER] Successfully sent result to ${seer.name} for target ${target.name}`);
        } else {
          // Fallback implementation if the role method isn't available
          const embed = new EmbedBuilder()
            .setTitle(`👁️ Kết Quả Tiên Tri`)
            .setDescription(`Bạn đã tiên tri **${target.name}**`)
            .setColor("#9b59b6");
  
          // Check if target is a werewolf
          const isWerewolf = target.role === "WEREWOLF" || target.role === "CURSED_WEREWOLF";
  
          if (isWerewolf) {
            embed.addFields({ name: "Kết Quả", value: "Người chơi này là **Ma Sói**! 🐺" });
          } else {
            embed.addFields({ name: "Kết Quả", value: "Người chơi này **không phải** Ma Sói. ✅" });
          }
  
          await seer.user.send({ embeds: [embed] });
          
          // Mark as delivered
          this.seerTracker.markDelivered(this.day, seer.id);
          console.log(`[SEER] Successfully sent result to ${seer.name} (fallback method)`);
        }
      } catch (error) {
        console.error(`[SEER] Failed to send result to ${seer.name}:`, error);
      }
    }
  }

  /**
   * Start the voting phase
   */
  async startVoting() {
    this.state = STATE.VOTING;
    
    // FIXED: Clear all existing votes completely
    this.votes = {};
  
    // FIXED: Reset all player vote counts and voting status
    console.log(`[DEBUG-VOTING] Resetting all player vote counts and voting status for day ${this.day}`);
    for (const playerId in this.players) {
      const player = this.players[playerId];
      // Reset vote count to zero for ALL players (alive and dead)
      player.voteCount = 0;
      
      // Only reset voting flags for alive players
      if (player.isAlive) {
        player.hasVoted = false;
      }
    }
  
    // TTS announcement for voting start
    if (this.voiceEnabled && this.voiceChannel) {
      const votingText = ttsUtils.getGameAnnouncementText(this, 'voting-start');
      await ttsUtils.speak(this.voiceChannel, votingText);
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
    // Track voting transactions to prevent spam
    if (!this.votingInProgress) {
      this.votingInProgress = new Set();
    }

    // If this player already has a vote in progress, reject new vote attempts
    if (this.votingInProgress.has(voterId)) {
      return {
        success: false,
        message: "Đang xử lý lượt bỏ phiếu của bạn, vui lòng đợi."
      };
    }

    // Mark that this player has a vote in progress
    this.votingInProgress.add(voterId);

    try {
      const voter = this.players[voterId];

      // Check if voter exists and is alive
      if (!voter || !voter.isAlive) {
        this.votingInProgress.delete(voterId); // Clear voting lock
        return { success: false, message: "Bạn không thể bỏ phiếu" };
      }

      // FIXED: Better duplicate vote check - check both flag and votes record
      if (voter.hasVoted || this.votes[voterId]) {
        this.votingInProgress.delete(voterId); // Clear voting lock

        // Get the current vote to show in the message
        const currentVote = this.votes[voterId];
        const currentTarget = currentVote === 'skip' ?
          'bỏ qua' :
          this.players[currentVote]?.name || currentVote;

        // Return a clear message that they've already voted
        return {
          success: false,
          message: `Bạn đã bỏ phiếu cho ${currentTarget} rồi. Mỗi người chỉ được bỏ phiếu một lần.`
        };
      }

      // If voter had previously voted (shouldn't happen with the new check, but just in case)
      // Remove previous vote
      if (this.votes[voterId]) {
        const previousVote = this.votes[voterId];
        if (previousVote && previousVote !== 'skip') {
          const previousTarget = this.players[previousVote];
          if (previousTarget) {
            previousTarget.voteCount--;
          }
        }
      }

      // Process the vote
      if (targetId === 'skip') {
        // Skip vote
        voter.hasVoted = true;
        this.votes[voterId] = 'skip';
        this.votingInProgress.delete(voterId); // Clear voting lock
        return { success: true, message: "Bạn đã quyết định không bỏ phiếu." };
      } else {
        // Check if target exists and is alive
        const target = this.players[targetId];
        if (!target || !target.isAlive) {
          this.votingInProgress.delete(voterId); // Clear voting lock
          return { success: false, message: "Mục tiêu không hợp lệ" };
        }

        // Register vote
        voter.hasVoted = true;
        this.votes[voterId] = targetId;
        target.voteCount++;

        // Clear the voting lock for this player
        this.votingInProgress.delete(voterId);

        // Check if all players have voted
        const alivePlayers = this.getAlivePlayers();
        const votedPlayers = alivePlayers.filter(p => p.hasVoted);

        if (votedPlayers.length === alivePlayers.length) {
          // All players have voted, end voting immediately
          // Use setTimeout to avoid race conditions with concurrent vote processing
          setTimeout(() => this.endVoting(), 1000);
        }

        return { success: true, message: `Bạn đã bỏ phiếu cho ${target.name}.` };
      }
    } catch (error) {
      // Make sure to clear the lock if an error occurs
      this.votingInProgress.delete(voterId);
      console.error("Error processing vote:", error);
      return { success: false, message: "Có lỗi xảy ra khi xử lý phiếu bầu." };
    }
  }

  /**
   * End the voting phase
   * @param {Message} voteMsg - Discord message with voting buttons
   */
  // Modify endVoting method to add voice announcement
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
    
    // FIXED: Debug log before finding the executed player
    console.log(`[DEBUG-VOTING] End voting for day ${this.day}, current vote counts:`);
    for (const playerId in this.players) {
      const player = this.players[playerId];
      if (player.isAlive || player.voteCount > 0) {
        console.log(`- ${player.name}: ${player.voteCount} votes, alive=${player.isAlive}`);
      }
    }
    
    // Find player with most votes
    let maxVotes = 0;
    let executed = null;
    let tie = false;
    
    for (const playerId in this.players) {
      const player = this.players[playerId];
      // Only count votes for alive players
      if (player.isAlive && player.voteCount > maxVotes) {
        maxVotes = player.voteCount;
        executed = player;
        tie = false;
      } else if (player.isAlive && player.voteCount === maxVotes && maxVotes > 0) {
        tie = true;
      }
    }
    
    console.log(`[DEBUG-VOTING] Execution result: ${executed?.name || 'None'} (${maxVotes} votes, tie=${tie})`);
    
    // Save executed player for TTS
    this.executedPlayer = executed && !tie && maxVotes > 0 ? executed : null;
    
    // Store execution results by day
    if (!this.executionHistory) {
      this.executionHistory = {};
    }
    
    this.executionHistory[this.day] = {
      executed: this.executedPlayer ? { ...this.executedPlayer } : null,
      votes: maxVotes,
      tie: tie
    };
    
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
    
    // TTS announcement for voting results
    if (this.voiceEnabled && this.voiceChannel) {
      const votingResultsText = ttsUtils.getGameAnnouncementText(this, 'voting-result');
      await ttsUtils.speak(this.voiceChannel, votingResultsText);
    }
    
    // Check if a Hunter was executed
    let hunterExecuted = null;
    
    // If someone was executed, mark them as dead
    if (executed && !tie && maxVotes > 0) {
      // FIXED: Mark them as dead FIRST so handleDeath sees them as dead
      executed.isAlive = false;
      
      console.log(`[DEBUG-HUNTER] Player ${executed.name} executed and marked as dead: isAlive=${executed.isAlive}`);
      
      // Check if the executed player is a Hunter
      if (executed.role === 'HUNTER') {
        console.log(`[DEBUG-HUNTER] Executed player ${executed.name} is a Hunter`);
        hunterExecuted = executed;
        
        // FIXED: Initialize Hunter ability tracking on first Hunter death
        if (!this.hunterAbilityUsed) {
          this.hunterAbilityUsed = {};
        }
        if (!this.hunterShotFired) {
          this.hunterShotFired = {};
        }
        
        // CRITICAL: Do NOT mark the Hunter as having used their ability YET!
        // This will happen after they choose a target
      } else {
        // Check for special role effects on death for non-Hunters
        const role = getRole(executed.role);
        if (role && typeof role.handleDeath === 'function') {
          console.log(`[DEBUG-HUNTER] Processing death ability for non-Hunter ${executed.name} (${executed.role})`);
          await role.handleDeath(this, executed);
        }
      }
    }
    
    // FIXED: Reset vote counts after execution is processed
    console.log(`[DEBUG-VOTING] Resetting all vote counts after execution`);
    for (const playerId in this.players) {
      const player = this.players[playerId];
      player.voteCount = 0;
      if (player.isAlive) {
        player.hasVoted = false;
      }
    }
    
    // Check game end conditions
    if (this.checkGameEnd()) {
      await this.endGame();
      return;
    }
    
    // Process Hunter execution separately (after game end check)
    if (hunterExecuted) {
      console.log(`[DEBUG-HUNTER] Processing Hunter ${hunterExecuted.name}'s death ability after execution`);
      
      // Double-check if hunter has already used ability (shouldn't happen here)
      if (this.hunterAbilityUsed[hunterExecuted.id]) {
        console.log(`[DEBUG-HUNTER] Warning: Hunter ${hunterExecuted.name} has already used ability`);
      } else {
        const hunterRole = getRole('HUNTER');
        if (hunterRole && typeof hunterRole.handleDeath === 'function') {
          console.log(`[DEBUG-HUNTER] Calling handleDeath for Hunter ${hunterExecuted.name}`);
          await hunterRole.handleDeath(this, hunterExecuted);
          
          // FIXED: Wait a bit for the Hunter to make their choice
          // This gives the player time to select their target
          console.log(`[DEBUG-HUNTER] Waiting for Hunter ${hunterExecuted.name} to choose target...`);
          
          // NOTE: We don't block the game here; the Hunter's choice will be processed
          // asynchronously through the handleHunterSelect function
        }
      }
      
      // After Hunter ability has been processed, check game end again
      // (but don't wait for the player to make their choice)
      if (this.checkGameEnd()) {
        await this.endGame();
        return;
      }
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

    // TTS announcement for game end
    if (this.voiceEnabled && this.voiceChannel) {
      const gameEndText = ttsUtils.getGameAnnouncementText(this, 'game-end');
      await ttsUtils.speak(this.voiceChannel, gameEndText);

      // Disconnect from voice channel after a delay
      setTimeout(() => {
        if (this.voiceChannel) {
          ttsUtils.disconnect(this.voiceChannel.guild.id);
        }
      }, 5000);
    }

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

    // Disconnect from voice channel if connected
    if (this.voiceEnabled && this.voiceChannel) {
      ttsUtils.disconnect(this.voiceChannel.guild.id);
      this.voiceEnabled = false;
      this.voiceChannel = null;
    }
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
    // Special case for WEREWOLF to include both regular and cursed werewolves
    if (role === 'WEREWOLF') {
      return Object.values(this.players).filter(p =>
        p.isAlive && (p.role === 'WEREWOLF' || p.role === 'CURSED_WEREWOLF')
      );
    }

    // Normal case for other roles
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