// modules/masoi.js
const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  ButtonStyle,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');

// Game roles with Vietnamese names and descriptions
const ROLES = {
  WEREWOLF: {
    name: "Ma Sói",
    description: "Đêm tối, bạn có thể chọn một người chơi để giết",
    team: "MA SÓI",
    nightAction: true,
    emoji: "🐺"
  },
  VILLAGER: {
    name: "Dân Làng",
    description: "Bạn không có khả năng đặc biệt, hãy biểu quyết sáng suốt",
    team: "DÂN LÀNG",
    nightAction: false,
    emoji: "👨‍🌾"
  },
  SEER: {
    name: "Tiên Tri",
    description: "Mỗi đêm, bạn có thể nhìn thấy vai trò của một người chơi khác",
    team: "DÂN LÀNG",
    nightAction: true,
    emoji: "👁️"
  },
  BODYGUARD: {
    name: "Bảo Vệ",
    description: "Mỗi đêm, bạn có thể bảo vệ một người chơi khỏi bị tấn công",
    team: "DÂN LÀNG",
    nightAction: true,
    emoji: "🛡️"
  },
  WITCH: {
    name: "Phù Thủy",
    description: "Bạn có hai bình thuốc: một để cứu sống, một để giết chết",
    team: "DÂN LÀNG",
    nightAction: true,
    emoji: "🧙‍♀️"
  },
  HUNTER: {
    name: "Thợ Săn",
    description: "Khi bạn chết, bạn có thể bắn chết một người khác",
    team: "DÂN LÀNG",
    nightAction: false,
    emoji: "🏹"
  }
};

// Game states
const STATE = {
  LOBBY: 'LOBBY',
  NIGHT: 'NIGHT',
  DAY: 'DAY',
  VOTING: 'VOTING',
  ENDED: 'ENDED'
};

// Game phases for the night
const NIGHT_PHASE = {
  SEER: 'SEER',
  BODYGUARD: 'BODYGUARD',
  WITCH: 'WITCH',
  WEREWOLF: 'WEREWOLF'
};

class WerewolfGame {
  constructor(channel, host) {
    this.channel = channel;
    this.host = host;
    this.players = new Map();
    this.state = STATE.LOBBY;
    this.day = 0;
    this.nightPhase = null;
    this.votes = new Map();
    this.nightActions = new Map();
    this.deaths = [];
    this.protected = null;
    this.messageId = null;
    this.lastUpdated = Date.now();
    this.witch = {
      healPotion: true,
      killPotion: true
    };
    this.roleDistribution = {
      WEREWOLF: 2,
      VILLAGER: 3,
      SEER: 1,
      BODYGUARD: 1,
      WITCH: 0,
      HUNTER: 0
    };
  }

  // Add a player to the game
  addPlayer(user) {
    if (this.state !== STATE.LOBBY) {
      return false;
    }
    
    if (this.players.has(user.id)) {
      return false;
    }
    
    this.players.set(user.id, {
      id: user.id,
      user: user,
      name: user.username,
      role: null,
      isAlive: true,
      voteCount: 0,
      hasVoted: false,
      hasActed: false
    });
    
    return true;
  }
  
  // Remove a player from the game
  removePlayer(userId) {
    if (this.state !== STATE.LOBBY) {
      return false;
    }
    
    return this.players.delete(userId);
  }
  
  // Start the game
  async start(channel) {
    if (this.state !== STATE.LOBBY) {
      return false;
    }
    
    if (this.players.size < 4) {
      return {
        success: false,
        message: "Cần ít nhất 4 người chơi để bắt đầu trò chơi."
      };
    }
    
    // Assign roles to players
    this.assignRoles();
    
    // Send role DMs to all players
    await this.sendRoleDMs();
    
    // Start the first night
    this.state = STATE.NIGHT;
    this.day = 1;
    this.startNight();
    
    return {
      success: true,
      message: null
    };
  }
  
  // Assign roles to players
  assignRoles() {
    // Get all players
    const playerIds = Array.from(this.players.keys());
    
    // Adjust role distribution based on player count
    this.adjustRoleDistribution(playerIds.length);
    
    // Create role pool
    const rolePool = [];
    for (const [roleId, count] of Object.entries(this.roleDistribution)) {
      for (let i = 0; i < count; i++) {
        rolePool.push(roleId);
      }
    }
    
    // Shuffle role pool
    this.shuffle(rolePool);
    
    // Assign roles
    playerIds.forEach((playerId, index) => {
      const player = this.players.get(playerId);
      if (index < rolePool.length) {
        player.role = rolePool[index];
      } else {
        // Default to villager if not enough roles
        player.role = "VILLAGER";
      }
    });
  }
  
  // Adjust role distribution based on player count
  adjustRoleDistribution(playerCount) {
    // Reset to default first
    this.roleDistribution = {
      WEREWOLF: 2,
      VILLAGER: 3,
      SEER: 1,
      BODYGUARD: 1,
      WITCH: 0,
      HUNTER: 0
    };
    
    // Add more roles as player count increases
    if (playerCount >= 6) {
      this.roleDistribution.WITCH = 1;
    }
    
    if (playerCount >= 8) {
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
  
  // Send role DMs to all players
  async sendRoleDMs() {
    const promises = [];
    
    for (const player of this.players.values()) {
      const role = ROLES[player.role];
      const embed = new EmbedBuilder()
        .setTitle(`🎮 Ma Sói - Vai Trò Của Bạn`)
        .setDescription(`Bạn là **${role.name}** ${role.emoji}`)
        .setColor(role.team === "MA SÓI" ? "#ff0000" : "#00b0f4")
        .addFields(
          { name: "Mô Tả", value: role.description },
          { name: "Phe", value: role.team }
        )
        .setFooter({ text: "Giữ bí mật vai trò của bạn!" });
      
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
  
  // Start the night phase
  startNight() {
    this.state = STATE.NIGHT;
    this.nightPhase = null;
    this.nightActions = new Map();
    this.advanceNightPhase();
  }
  
  // Advance to the next night phase
  advanceNightPhase() {
    const phases = Object.values(NIGHT_PHASE);
    
    // If no phase set, start with the first one
    if (!this.nightPhase) {
      this.nightPhase = phases[0];
    } else {
      // Move to the next phase
      const currentIndex = phases.indexOf(this.nightPhase);
      if (currentIndex === phases.length - 1) {
        // All phases completed, process night results
        this.processNightResults();
        return;
      }
      
      this.nightPhase = phases[currentIndex + 1];
    }
    
    // Check if there are any players with this role
    const playersWithRole = this.getAlivePlayersWithRole(this.nightPhase);
    
    if (playersWithRole.length === 0) {
      // Skip to the next phase if no players have this role
      this.advanceNightPhase();
      return;
    }
    
    // Send night action prompt to players with this role
    this.promptNightAction();
  }
  
  // Prompt players for their night action
  async promptNightAction() {
    const playersWithRole = this.getAlivePlayersWithRole(this.nightPhase);
    const targets = this.getAlivePlayersExcept([]);
    
    // Skip if no players with this role
    if (playersWithRole.length === 0) {
      this.advanceNightPhase();
      return;
    }
    
    // Clear previous night action messages
    // (in a real implementation you'd want to track and delete these)
    
    // For each player with the role, send them a prompt
    for (const player of playersWithRole) {
      const role = ROLES[player.role];
      
      // Create embed for night action
      const embed = new EmbedBuilder()
        .setTitle(`🌙 Đêm ${this.day} - Hành Động Của ${role.name}`)
        .setDescription(`Đã đến lượt hành động của bạn. Hãy chọn một người chơi.`)
        .setColor("#2f3136");
      
      // Create select menu for target selection
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`masoi_action_${player.id}`)
        .setPlaceholder('Chọn người chơi...');
      
      // Add options for each target
      targets.forEach(target => {
        if (this.nightPhase === NIGHT_PHASE.WEREWOLF && target.role === "WEREWOLF") {
          return; // Werewolves can't target other werewolves
        }
        
        selectMenu.addOptions({
          label: target.name,
          value: target.id,
          description: `Chọn ${target.name} làm mục tiêu`,
        });
      });
      
      // Add special options for Witch
      if (this.nightPhase === NIGHT_PHASE.WITCH) {
        // Add witch-specific options here
        if (this.witch.healPotion) {
          selectMenu.addOptions({
            label: "Sử dụng bình thuốc cứu",
            value: "heal",
            description: "Cứu người bị Ma Sói tấn công",
          });
        }
        
        if (this.witch.killPotion) {
          selectMenu.addOptions({
            label: "Sử dụng bình thuốc độc",
            value: "kill",
            description: "Giết một người chơi",
          });
        }
        
        selectMenu.addOptions({
          label: "Không làm gì",
          value: "none",
          description: "Bỏ qua lượt này",
        });
      }
      
      // For Bodyguard, add "self" option if they didn't protect themselves last night
      if (this.nightPhase === NIGHT_PHASE.BODYGUARD && this.protected !== player.id) {
        selectMenu.addOptions({
          label: "Bảo vệ bản thân",
          value: "self",
          description: "Bảo vệ chính bạn đêm nay",
        });
      }
      
      const row = new ActionRowBuilder().addComponents(selectMenu);
      
      // Send the prompt to the player
      try {
        await player.user.send({ embeds: [embed], components: [row] });
      } catch (error) {
        console.error(`Failed to send night action prompt to ${player.name}:`, error);
        // Auto-advance after a timeout in case the player doesn't respond
        setTimeout(() => {
          if (!this.nightActions.has(player.id)) {
            this.handleNightAction(player.id, null);
          }
        }, 60000); // 1 minute timeout
      }
    }
    
    // Update game status in the main channel
    const statusEmbed = new EmbedBuilder()
      .setTitle(`🌙 Đêm ${this.day}`)
      .setDescription(`Mọi người đi ngủ. Đang chờ ${this.getNightRoleName()} thực hiện hành động...`)
      .setColor("#2f3136");
    
    await this.channel.send({ embeds: [statusEmbed] });
    
    // Auto-advance night phase after timeout
    setTimeout(() => {
      // Check if we're still in the same phase
      if (this.state === STATE.NIGHT && this.nightPhase) {
        // Check if all players have acted
        const pendingPlayers = playersWithRole.filter(p => !this.nightActions.has(p.id));
        if (pendingPlayers.length > 0) {
          // Auto-submit null actions for pending players
          for (const player of pendingPlayers) {
            this.handleNightAction(player.id, null);
          }
        }
      }
    }, 90000); // 1.5 minute timeout for night actions
  }
  
  // Handle a night action from a player
  handleNightAction(playerId, targetId) {
    const player = this.players.get(playerId);
    
    // Check if player exists and is alive
    if (!player || !player.isAlive) {
      return false;
    }
    
    // Check if player has the correct role for the current phase
    if (player.role !== this.nightPhase) {
      return false;
    }
    
    // Check if player already acted
    if (this.nightActions.has(playerId)) {
      return false;
    }
    
    // Record the action
    this.nightActions.set(playerId, targetId);
    
    // Check if all players of the current role have acted
    const playersWithRole = this.getAlivePlayersWithRole(this.nightPhase);
    const pendingPlayers = playersWithRole.filter(p => !this.nightActions.has(p.id));
    
    if (pendingPlayers.length === 0) {
      // All players have acted, move to the next phase
      this.advanceNightPhase();
    }
    
    return true;
  }
  
  // Process the results of the night phase
  async processNightResults() {
    // Get werewolf target
    let werewolfTarget = this.getWerewolfTarget();
    
    // Get bodyguard protection
    const bodyguardTarget = this.getBodyguardTarget();
    if (bodyguardTarget) {
      this.protected = bodyguardTarget;
    }
    
    // Check if target was protected
    if (werewolfTarget && werewolfTarget === this.protected) {
      werewolfTarget = null; // Target was protected
    }
    
    // Process witch actions
    const witchKillTarget = this.getWitchKillTarget();
    const witchSaveTarget = this.getWitchSaveTarget();
    
    // Check if witch used heal potion
    if (werewolfTarget && witchSaveTarget === werewolfTarget) {
      werewolfTarget = null; // Target was saved by witch
      this.witch.healPotion = false;
    }
    
    // Compile list of deaths
    this.deaths = [];
    
    if (werewolfTarget) {
      this.deaths.push({
        playerId: werewolfTarget,
        killer: "WEREWOLF",
        message: "Bị Ma Sói cắn chết"
      });
    }
    
    if (witchKillTarget) {
      this.deaths.push({
        playerId: witchKillTarget,
        killer: "WITCH",
        message: "Bị đầu độc bởi Phù Thủy"
      });
      this.witch.killPotion = false;
    }
    
    // Apply deaths
    for (const death of this.deaths) {
      const player = this.players.get(death.playerId);
      if (player) {
        player.isAlive = false;
      }
    }
    
    // Start the day phase
    this.startDay();
  }
  
  // Get the target of the werewolves
  getWerewolfTarget() {
    const werewolves = this.getAlivePlayersWithRole("WEREWOLF");
    const votes = new Map();
    
    // Count votes from all werewolves
    for (const werewolf of werewolves) {
      const targetId = this.nightActions.get(werewolf.id);
      if (targetId) {
        votes.set(targetId, (votes.get(targetId) || 0) + 1);
      }
    }
    
    // Get the target with the most votes
    let maxVotes = 0;
    let target = null;
    
    for (const [targetId, voteCount] of votes.entries()) {
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        target = targetId;
      }
    }
    
    return target;
  }
  
  // Get the target of the bodyguard
  getBodyguardTarget() {
    const bodyguards = this.getAlivePlayersWithRole("BODYGUARD");
    if (bodyguards.length === 0) return null;
    
    // Just use the first bodyguard's action (there should be only one)
    const bodyguard = bodyguards[0];
    const targetId = this.nightActions.get(bodyguard.id);
    
    // Handle special "self" action
    if (targetId === "self") {
      return bodyguard.id;
    }
    
    return targetId;
  }
  
  // Get the kill target of the witch
  getWitchKillTarget() {
    const witches = this.getAlivePlayersWithRole("WITCH");
    if (witches.length === 0 || !this.witch.killPotion) return null;
    
    // Just use the first witch's action (there should be only one)
    const witch = witches[0];
    const action = this.nightActions.get(witch.id);
    
    // Check if the action was to kill someone
    if (action && action !== "heal" && action !== "none") {
      return action;
    }
    
    return null;
  }
  
  // Get the save target of the witch
  getWitchSaveTarget() {
    const witches = this.getAlivePlayersWithRole("WITCH");
    if (witches.length === 0 || !this.witch.healPotion) return null;
    
    // Just use the first witch's action (there should be only one)
    const witch = witches[0];
    const action = this.nightActions.get(witch.id);
    
    // Check if the action was to heal someone
    if (action === "heal") {
      // Get the werewolf target
      return this.getWerewolfTarget();
    }
    
    return null;
  }
  
  // Start the day phase
  async startDay() {
    this.state = STATE.DAY;
    this.votes = new Map();
    
    // Clear night actions
    this.nightActions = new Map();
    
    // Report night results
    await this.reportNightResults();
    
    // Check game end conditions
    if (this.checkGameEnd()) {
      await this.endGame();
      return;
    }
    
    // Set timer for voting phase
    setTimeout(() => {
      if (this.state === STATE.DAY) {
        this.startVoting();
      }
    }, 90000); // 1.5 minutes for discussion
  }
  
  // Report the results of the night
  async reportNightResults() {
    // Create embed for night results
    const embed = new EmbedBuilder()
      .setTitle(`☀️ Ngày ${this.day}`)
      .setColor("#f1c40f");
    
    if (this.deaths.length === 0) {
      embed.setDescription("Mọi người thức dậy an toàn. Không ai bị giết trong đêm qua.");
    } else {
      const deathMessages = this.deaths.map(death => {
        const player = this.players.get(death.playerId);
        return `**${player.name}** (${ROLES[player.role].name}) ${death.message}.`;
      });
      
      embed.setDescription(`Buổi sáng đến và làng làng phát hiện:\n\n${deathMessages.join('\n')}`);
    }
    
    // Add instructions for the day
    embed.addFields(
      { name: "Thảo Luận", value: "Bây giờ là lúc thảo luận. Ai là Ma Sói? Bạn có bằng chứng nào không?" },
      { name: "Thời Gian", value: "Bỏ phiếu sẽ bắt đầu sau 1.5 phút." }
    );
    
    await this.channel.send({ embeds: [embed] });
    
    // Send information to Seer if they used their ability
    await this.reportSeerResult();
  }
  
  // Report the result of the Seer's night action
  async reportSeerResult() {
    const seers = this.getAlivePlayersWithRole("SEER");
    if (seers.length === 0) return;
    
    // Just use the first seer's action (there should be only one)
    const seer = seers[0];
    const targetId = this.nightActions.get(seer.id);
    
    if (!targetId) return;
    
    const target = this.players.get(targetId);
    if (!target) return;
    
    // Create embed for seer result
    const embed = new EmbedBuilder()
      .setTitle(`👁️ Kết Quả Tiên Tri`)
      .setDescription(`Bạn đã tiên tri **${target.name}**`)
      .setColor("#9b59b6");
    
    if (target.role === "WEREWOLF") {
      embed.addFields({ name: "Kết Quả", value: "Người chơi này là **Ma Sói**! 🐺" });
    } else {
      embed.addFields({ name: "Kết Quả", value: "Người chơi này **không phải** Ma Sói. ✅" });
    }
    
    try {
      await seer.user.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Failed to send seer result to ${seer.name}:`, error);
    }
  }
  
  // Start the voting phase
  async startVoting() {
    this.state = STATE.VOTING;
    this.votes = new Map();
    
    // Reset player vote tracking
    for (const player of this.players.values()) {
      if (player.isAlive) {
        player.hasVoted = false;
        player.voteCount = 0;
      }
    }
    
    // Create voting embed
    const embed = new EmbedBuilder()
      .setTitle(`🗳️ Bỏ Phiếu - Ngày ${this.day}`)
      .setDescription("Đã đến lúc bỏ phiếu! Ai sẽ bị treo cổ hôm nay?")
      .setColor("#e74c3c");
    
    // Create voting buttons
    const rows = [];
    const alivePlayers = this.getAlivePlayers();
    let currentRow = new ActionRowBuilder();
    
    alivePlayers.forEach((player, index) => {
      const button = new ButtonBuilder()
        .setCustomId(`masoi_vote_${player.id}`)
        .setLabel(player.name)
        .setStyle(ButtonStyle.Primary);
      
      currentRow.addComponents(button);
      
      // Create a new row every 5 buttons (Discord limit)
      if ((index + 1) % 5 === 0 || index === alivePlayers.length - 1) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
      }
    });
    
    // Add a "Skip Vote" button
    if (rows[rows.length - 1].components.length < 5) {
      const skipButton = new ButtonBuilder()
        .setCustomId('masoi_vote_skip')
        .setLabel('Bỏ Qua')
        .setStyle(ButtonStyle.Secondary);
      
      rows[rows.length - 1].addComponents(skipButton);
    } else {
      const skipButton = new ButtonBuilder()
        .setCustomId('masoi_vote_skip')
        .setLabel('Bỏ Qua')
        .setStyle(ButtonStyle.Secondary);
      
      rows.push(new ActionRowBuilder().addComponents(skipButton));
    }
    
    // Send voting message
    const voteMsg = await this.channel.send({
      embeds: [embed],
      components: rows
    });
    
    // Set timeout for voting
    setTimeout(() => {
      if (this.state === STATE.VOTING) {
        this.endVoting(voteMsg);
      }
    }, 60000); // 1 minute for voting
  }
  
  // Handle a vote from a player
  handleVote(voterId, targetId) {
    const voter = this.players.get(voterId);
    
    // Check if voter exists and is alive
    if (!voter || !voter.isAlive) {
      return false;
    }
    
    // Check if voter already voted
    if (voter.hasVoted) {
      // Remove previous vote
      const previousVote = this.votes.get(voterId);
      if (previousVote) {
        const previousTarget = this.players.get(previousVote);
        if (previousTarget) {
          previousTarget.voteCount--;
        }
      }
    }
    
    // Skip vote
    if (targetId === 'skip') {
      voter.hasVoted = true;
      this.votes.set(voterId, null);
      return true;
    }
    
    // Check if target exists and is alive
    const target = this.players.get(targetId);
    if (!target || !target.isAlive) {
      return false;
    }
    
    // Register vote
    voter.hasVoted = true;
    this.votes.set(voterId, targetId);
    target.voteCount++;
    
    // Check if all players have voted
    const alivePlayers = this.getAlivePlayers();
    const votedPlayers = alivePlayers.filter(p => p.hasVoted);
    
    if (votedPlayers.length === alivePlayers.length) {
      // All players have voted, end voting immediately
      this.endVoting();
    }
    
    return true;
  }
  
  // End the voting phase
  async endVoting(voteMsg = null) {
    // Find player with most votes
    let maxVotes = 0;
    let executed = null;
    let tie = false;
    
    for (const player of this.players.values()) {
      if (player.voteCount > maxVotes) {
        maxVotes = player.voteCount;
        executed = player;
        tie = false;
      } else if (player.voteCount === maxVotes && maxVotes > 0) {
        tie = true;
      }
    }
    
    // Create result embed
    const embed = new EmbedBuilder()
      .setTitle(`📢 Kết Quả Bỏ Phiếu - Ngày ${this.day}`)
      .setColor("#e74c3c");
    
    // No one voted or tie
    if (!executed || tie || maxVotes === 0) {
      embed.setDescription("Không có ai bị treo cổ do không đủ biểu quyết thống nhất.");
    } else {
      // Someone was executed
      embed.setDescription(`**${executed.name}** (${ROLES[executed.role].name} ${ROLES[executed.role].emoji}) đã bị treo cổ với ${maxVotes} phiếu bầu.`);
      
      // Mark player as dead
      executed.isAlive = false;
      
      // Check for Hunter special ability
      if (executed.role === "HUNTER") {
        await this.handleHunterAbility(executed);
      }
    }
    
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
    
    // Check game end conditions
    if (this.checkGameEnd()) {
      await this.endGame();
      return;
    }
    
    // Start next night
    setTimeout(() => {
      if (this.state !== STATE.ENDED) {
        this.day++;
        this.startNight();
      }
    }, 10000); // 10 seconds before night starts
  }
  
  // Handle Hunter's special ability when they die
  async handleHunterAbility(hunter) {
    // Hunter can shoot someone when they die
    const embed = new EmbedBuilder()
      .setTitle(`🏹 Khả Năng Đặc Biệt Của Thợ Săn`)
      .setDescription(`Bạn đã bị treo cổ, nhưng có thể bắn một mũi tên cuối cùng. Hãy chọn người bạn muốn bắn.`)
      .setColor("#e67e22");
    
    // Create target selection menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`masoi_hunter_${hunter.id}`)
      .setPlaceholder('Chọn một người để bắn...');
    
    // Add all alive players as options
    const targets = this.getAlivePlayersExcept([hunter.id]);
    targets.forEach(target => {
      selectMenu.addOptions({
        label: target.name,
        value: target.id,
        description: `Bắn ${target.name}`,
      });
    });
    
    // Add "Don't shoot" option
    selectMenu.addOptions({
      label: "Không bắn ai",
      value: "none",
      description: "Quyết định không sử dụng khả năng đặc biệt",
    });
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    try {
      // Send the prompt to the Hunter
      await hunter.user.send({ embeds: [embed], components: [row] });
      
      // Notify the game channel
      const channelEmbed = new EmbedBuilder()
        .setTitle(`🏹 Khả Năng Đặc Biệt Của Thợ Săn`)
        .setDescription(`**${hunter.name}** là Thợ Săn! Thợ Săn đang chọn người để bắn...`)
        .setColor("#e67e22");
      
      await this.channel.send({ embeds: [channelEmbed] });
      
      // Add a timeout for Hunter's action
      setTimeout(async () => {
        // If game is still active and hunter hasn't shot
        // Auto-select "none" option
        // This would be implemented in a real bot through a collector
      }, 30000); // 30 seconds to decide
      
    } catch (error) {
      console.error(`Failed to send Hunter ability prompt to ${hunter.name}:`, error);
      // If we can't DM the hunter, just skip their ability
    }
  }
  
  // Check if the game has ended
  checkGameEnd() {
    // Count alive werewolves and villagers
    let aliveWerewolves = 0;
    let aliveVillagers = 0;
    
    for (const player of this.players.values()) {
      if (!player.isAlive) continue;
      
      if (player.role === "WEREWOLF") {
        aliveWerewolves++;
      } else {
        aliveVillagers++;
      }
    }
    
    // No werewolves left - villagers win
    if (aliveWerewolves === 0) {
      this.winner = "DÂN LÀNG";
      return true;
    }
    
    // Werewolves equal or outnumber villagers - werewolves win
    if (aliveWerewolves >= aliveVillagers) {
      this.winner = "MA SÓI";
      return true;
    }
    
    // Game continues
    return false;
  }
  
  // End the game and announce winners
  async endGame() {
    this.state = STATE.ENDED;
    
    // Create winner announcement embed
    const embed = new EmbedBuilder()
      .setTitle(`🏆 Trò Chơi Kết Thúc - ${this.winner} CHIẾN THẮNG!`)
      .setColor(this.winner === "MA SÓI" ? "#ff0000" : "#00b0f4");
    
    // Create description with all players and their roles
    const playersList = Array.from(this.players.values())
      .map(player => {
        const role = ROLES[player.role];
        const status = player.isAlive ? "Còn sống" : "Đã chết";
        return `**${player.name}** - ${role.name} ${role.emoji} (${status})`;
      })
      .join('\n');
    
    embed.setDescription(`**Danh sách người chơi:**\n${playersList}`);
    
    // Send winner announcement
    await this.channel.send({ embeds: [embed] });
  }
  
  // Helper methods
  
  // Get all alive players
  getAlivePlayers() {
    return Array.from(this.players.values()).filter(p => p.isAlive);
  }
  
  // Get all alive players with a specific role
  getAlivePlayersWithRole(role) {
    return Array.from(this.players.values()).filter(p => p.isAlive && p.role === role);
  }
  
  // Get all alive players except those with specific IDs
  getAlivePlayersExcept(excludeIds) {
    return Array.from(this.players.values()).filter(p => 
      p.isAlive && !excludeIds.includes(p.id)
    );
  }
  
  // Get the current night role name
  getNightRoleName() {
    switch(this.nightPhase) {
      case NIGHT_PHASE.SEER:
        return "Tiên Tri";
      case NIGHT_PHASE.BODYGUARD:
        return "Bảo Vệ";
      case NIGHT_PHASE.WITCH:
        return "Phù Thủy";
      case NIGHT_PHASE.WEREWOLF:
        return "Ma Sói";
      default:
        return "";
    }
  }
  
  // Shuffle an array (Fisher-Yates algorithm)
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// Map to store active games by channel ID
const activeGames = new Map();

module.exports = {
  meta: {
    name: "masoi",
    type: "game",
    version: "1.0.0",
    description: "Trò chơi Ma Sói trong Discord",
    dependencies: [],
    npmDependencies: {}
  },
  
  // Module initialization
  async init(client, bot) {
    console.log("Module Ma Sói đã khởi tạo!");
    
    // Set up button and select menu interaction handlers
    client.on('interactionCreate', async (interaction) => {
      try {
        // Handle button interactions for joining and voting
        if (interaction.isButton()) {
          if (interaction.customId === 'masoi_join') {
            await this.handleJoinButton(interaction);
          } else if (interaction.customId === 'masoi_start') {
            await this.handleStartButton(interaction);
          } else if (interaction.customId.startsWith('masoi_vote_')) {
            await this.handleVoteButton(interaction);
          }
        }
        
        // Handle select menu interactions for night actions
        if (interaction.isStringSelectMenu()) {
          if (interaction.customId.startsWith('masoi_action_')) {
            await this.handleNightActionSelect(interaction);
          } else if (interaction.customId.startsWith('masoi_hunter_')) {
            await this.handleHunterSelect(interaction);
          }
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
      }
    });
  },
  
  // Module shutdown
  async shutdown() {
    console.log("Module Ma Sói đang tắt!");
    // Clean up any active games
    activeGames.clear();
  },
  
  // Handle start button interaction
  async handleStartButton(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game) {
      await interaction.reply({ 
        content: "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!", 
        ephemeral: true 
      });
      return;
    }
    
    if (game.host.id !== interaction.user.id) {
      await interaction.reply({ 
        content: "Chỉ người tạo trò chơi mới có thể bắt đầu!", 
        ephemeral: true 
      });
      return;
    }
    
    if (game.state !== STATE.LOBBY) {
      await interaction.reply({ 
        content: "Trò chơi đã bắt đầu!", 
        ephemeral: true 
      });
      return;
    }
    
    await interaction.deferReply();
    
    const result = await game.start();
    
    if (result.success) {
      // Disable the join and start buttons
      try {
        const message = await interaction.channel.messages.fetch(game.messageId);
        await message.edit({ components: [] });
      } catch (error) {
        console.error("Error updating game message:", error);
      }
      
      await interaction.editReply("Trò chơi Ma Sói đã bắt đầu! Mỗi người chơi sẽ nhận được tin nhắn riêng với vai trò của mình.");
    } else {
      await interaction.editReply(result.message || "Không thể bắt đầu trò chơi.");
    }
  },
  
  // Handle join button interaction
  async handleJoinButton(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game) return;
    
    // Add player to the game
    const success = game.addPlayer(interaction.user);
    
    if (success) {
      await interaction.reply({ 
        content: `${interaction.user} đã tham gia trò chơi Ma Sói!`, 
        ephemeral: false 
      });
      
      // Update the game lobby message
      await this.updateLobbyMessage(game);
    } else {
      await interaction.reply({ 
        content: "Bạn đã tham gia trò chơi này hoặc trò chơi đã bắt đầu.", 
        ephemeral: true 
      });
    }
  },
  
  // Handle night action select menu interaction
  async handleNightActionSelect(interaction) {
    // Extract player ID from custom ID
    const playerId = interaction.customId.replace('masoi_action_', '');
    
    // Find the game this player is in
    let playerGame = null;
    for (const [channelId, game] of activeGames.entries()) {
      if (game.players.has(playerId)) {
        playerGame = game;
        break;
      }
    }
    
    if (!playerGame || playerGame.state !== STATE.NIGHT) {
      await interaction.reply({ 
        content: "Không thể thực hiện hành động trong lúc này.", 
        ephemeral: true 
      });
      return;
    }
    
    // Get selected target
    const targetId = interaction.values[0];
    
    // Register night action
    const success = playerGame.handleNightAction(playerId, targetId);
    
    if (success) {
      // Determine response based on role and target
      let responseMessage = "Bạn đã thực hiện hành động của mình.";
      
      const player = playerGame.players.get(playerId);
      
      if (player.role === "SEER") {
        responseMessage = `Bạn đã chọn tiên tri ${playerGame.players.get(targetId).name}.`;
      } else if (player.role === "BODYGUARD") {
        if (targetId === "self") {
          responseMessage = "Bạn đã chọn bảo vệ chính mình đêm nay.";
        } else {
          responseMessage = `Bạn đã chọn bảo vệ ${playerGame.players.get(targetId).name}.`;
        }
      } else if (player.role === "WITCH") {
        if (targetId === "heal") {
          responseMessage = "Bạn đã sử dụng bình thuốc cứu.";
        } else if (targetId === "kill") {
          responseMessage = `Bạn đã sử dụng bình thuốc độc lên ${playerGame.players.get(targetId).name}.`;
        } else if (targetId === "none") {
          responseMessage = "Bạn đã quyết định không sử dụng thuốc.";
        } else {
          responseMessage = `Bạn đã chọn ${playerGame.players.get(targetId).name}.`;
        }
      } else if (player.role === "WEREWOLF") {
        responseMessage = `Bạn đã chọn tấn công ${playerGame.players.get(targetId).name}.`;
      }
      
      await interaction.reply({ 
        content: responseMessage, 
        ephemeral: true 
      });
    } else {
      await interaction.reply({ 
        content: "Không thể thực hiện hành động trong lúc này.", 
        ephemeral: true 
      });
    }
  },
  
  // Handle Hunter ability select menu interaction
  async handleHunterSelect(interaction) {
    // Extract player ID from custom ID
    const hunterId = interaction.customId.replace('masoi_hunter_', '');
    
    // Find the game this player is in
    let hunterGame = null;
    for (const [channelId, game] of activeGames.entries()) {
      if (game.players.has(hunterId)) {
        hunterGame = game;
        break;
      }
    }
    
    if (!hunterGame) {
      await interaction.reply({ 
        content: "Không thể tìm thấy trò chơi của bạn.", 
        ephemeral: true 
      });
      return;
    }
    
    // Get selected target
    const targetId = interaction.values[0];
    
    if (targetId === "none") {
      await interaction.reply({ 
        content: "Bạn đã quyết định không bắn ai.", 
        ephemeral: true 
      });
      
      // Notify the game channel
      const embed = new EmbedBuilder()
        .setTitle(`🏹 Thợ Săn Quyết Định`)
        .setDescription(`**${hunterGame.players.get(hunterId).name}** đã quyết định không bắn ai.`)
        .setColor("#e67e22");
      
      await hunterGame.channel.send({ embeds: [embed] });
    } else {
      const target = hunterGame.players.get(targetId);
      
      // Mark target as dead
      if (target) {
        target.isAlive = false;
        
        await interaction.reply({ 
          content: `Bạn đã bắn ${target.name}.`, 
          ephemeral: true 
        });
        
        // Notify the game channel
        const embed = new EmbedBuilder()
          .setTitle(`🏹 Thợ Săn Đã Bắn!`)
          .setDescription(`**${hunterGame.players.get(hunterId).name}** đã bắn **${target.name}** (${ROLES[target.role].name} ${ROLES[target.role].emoji}).`)
          .setColor("#e67e22");
        
        await hunterGame.channel.send({ embeds: [embed] });
        
        // Check game end after hunter shot
        if (hunterGame.checkGameEnd()) {
          await hunterGame.endGame();
        }
      }
    }
  },
  
  // Handle vote button interaction
  async handleVoteButton(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game || game.state !== STATE.VOTING) return;
    
    // Get target ID from button
    const targetId = interaction.customId.replace('masoi_vote_', '');
    
    // Register vote
    const success = game.handleVote(interaction.user.id, targetId);
    
    if (success) {
      if (targetId === 'skip') {
        await interaction.reply({ 
          content: `Bạn đã quyết định không bỏ phiếu.`, 
          ephemeral: true 
        });
      } else {
        const target = game.players.get(targetId);
        await interaction.reply({ 
          content: `Bạn đã bỏ phiếu cho ${target.name}.`, 
          ephemeral: true 
        });
      }
    } else {
      await interaction.reply({ 
        content: "Bạn không thể bỏ phiếu trong lúc này.", 
        ephemeral: true 
      });
    }
  },
  
  // Update the lobby message with current players
  async updateLobbyMessage(game) {
    if (game.messageId) {
      try {
        const message = await game.channel.messages.fetch(game.messageId);
        
        const embed = new EmbedBuilder()
          .setTitle("🐺 Trò Chơi Ma Sói")
          .setDescription("Nhấn nút bên dưới để tham gia!")
          .setColor("#9b59b6")
          .addFields(
            { name: "Người Chơi", value: this.getPlayersList(game) },
            { name: "Cách Chơi", value: "Ma Sói là trò chơi mạo hiểm dựa trên tâm lý. Mỗi người chơi sẽ nhận một vai trò bí mật. Ma Sói sẽ âm thầm ăn thịt dân làng mỗi đêm, trong khi dân làng phải tìm ra và tiêu diệt Ma Sói." }
          );
        
        await message.edit({ embeds: [embed] });
      } catch (error) {
        console.error("Error updating lobby message:", error);
      }
    }
  },
  
  // Commands
  commands: [
    {
      name: "masoi",
      description: "Bắt đầu trò chơi Ma Sói",
      data: {
        name: "masoi",
        description: "Bắt đầu trò chơi Ma Sói",
        options: [
          {
            name: "action",
            description: "Hành động",
            type: 3, // STRING
            required: false,
            choices: [
              { name: "Tạo trò chơi mới", value: "create" },
              { name: "Tham gia", value: "join" },
              { name: "Bắt đầu", value: "start" },
              { name: "Hủy", value: "cancel" },
              { name: "Giúp đỡ", value: "help" }
            ]
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        const action = interaction.options.getString("action") || "create";
        
        if (action === "create") {
          // Check if there's already a game in this channel
          if (activeGames.has(interaction.channelId)) {
            return interaction.reply({
              content: "Đã có trò chơi Ma Sói đang diễn ra trong kênh này!",
              ephemeral: true
            });
          }
          
          // Create a new game
          const game = new WerewolfGame(interaction.channel, interaction.user);
          activeGames.set(interaction.channelId, game);
          
          // Add the host to the game
          game.addPlayer(interaction.user);
          
          // Create a lobby message with join button
          const embed = new EmbedBuilder()
            .setTitle("🐺 Trò Chơi Ma Sói")
            .setDescription("Nhấn nút bên dưới để tham gia!")
            .setColor("#9b59b6")
            .addFields(
              { name: "Người Chơi", value: `• ${interaction.user.username}` },
              { name: "Cách Chơi", value: "Ma Sói là trò chơi mạo hiểm dựa trên tâm lý. Mỗi người chơi sẽ nhận một vai trò bí mật. Ma Sói sẽ âm thầm ăn thịt dân làng mỗi đêm, trong khi dân làng phải tìm ra và tiêu diệt Ma Sói." }
            );
          
          const joinButton = new ButtonBuilder()
            .setCustomId('masoi_join')
            .setLabel('Tham Gia')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🐺');
          
          const startButton = new ButtonBuilder()
            .setCustomId('masoi_start')
            .setLabel('Bắt Đầu')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎮');
          
          const row = new ActionRowBuilder().addComponents(joinButton, startButton);
          
          const message = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
          });
          
          // Store the message ID for later updates
          game.messageId = message.id;
          
        } else if (action === "join") {
          // Join an existing game
          const game = activeGames.get(interaction.channelId);
          
          if (!game) {
            return interaction.reply({
              content: "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!",
              ephemeral: true
            });
          }
          
          if (game.state !== STATE.LOBBY) {
            return interaction.reply({
              content: "Trò chơi đã bắt đầu, không thể tham gia lúc này!",
              ephemeral: true
            });
          }
          
          const success = game.addPlayer(interaction.user);
          
          if (success) {
            await interaction.reply(`${interaction.user} đã tham gia trò chơi Ma Sói!`);
            await this.updateLobbyMessage(game);
          } else {
            await interaction.reply({
              content: "Bạn đã tham gia trò chơi này!",
              ephemeral: true
            });
          }
          
        } else if (action === "start") {
          // Start an existing game
          const game = activeGames.get(interaction.channelId);
          
          if (!game) {
            return interaction.reply({
              content: "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!",
              ephemeral: true
            });
          }
          
          if (game.host.id !== interaction.user.id) {
            return interaction.reply({
              content: "Chỉ người tạo trò chơi mới có thể bắt đầu!",
              ephemeral: true
            });
          }
          
          if (game.state !== STATE.LOBBY) {
            return interaction.reply({
              content: "Trò chơi đã bắt đầu!",
              ephemeral: true
            });
          }
          
          const result = await game.start();
          
          if (result.success) {
            await interaction.reply("Trò chơi Ma Sói đã bắt đầu! Mỗi người chơi sẽ nhận được tin nhắn riêng với vai trò của mình.");
          } else {
            await interaction.reply({
              content: result.message,
              ephemeral: true
            });
          }
          
        } else if (action === "cancel") {
          // Cancel an existing game
          const game = activeGames.get(interaction.channelId);
          
          if (!game) {
            return interaction.reply({
              content: "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!",
              ephemeral: true
            });
          }
          
          if (game.host.id !== interaction.user.id) {
            return interaction.reply({
              content: "Chỉ người tạo trò chơi mới có thể hủy!",
              ephemeral: true
            });
          }
          
          activeGames.delete(interaction.channelId);
          
          await interaction.reply("Trò chơi Ma Sói đã bị hủy.");
          
        } else if (action === "help") {
          // Show help information
          const embed = new EmbedBuilder()
            .setTitle("🐺 Trò Chơi Ma Sói - Trợ Giúp")
            .setColor("#9b59b6")
            .addFields(
              { name: "Tạo Trò Chơi", value: "/masoi create - Tạo trò chơi mới" },
              { name: "Tham Gia", value: "/masoi join - Tham gia trò chơi" },
              { name: "Bắt Đầu", value: "/masoi start - Bắt đầu trò chơi (chỉ người tạo)" },
              { name: "Hủy", value: "/masoi cancel - Hủy trò chơi (chỉ người tạo)" },
              { name: "Vai Trò", value: "Ma Sói 🐺, Dân Làng 👨‍🌾, Tiên Tri 👁️, Bảo Vệ 🛡️, Phù Thủy 🧙‍♀️, Thợ Săn 🏹" }
            );
          
          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
        }
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        const action = args[0] || "create";
        
        if (action === "create" || action === "tao") {
          // Check if there's already a game in this channel
          if (activeGames.has(message.channelId)) {
            return message.reply("Đã có trò chơi Ma Sói đang diễn ra trong kênh này!");
          }
          
          // Create a new game
          const game = new WerewolfGame(message.channel, message.author);
          activeGames.set(message.channelId, game);
          
          // Add the host to the game
          game.addPlayer(message.author);
          
          // Create a lobby message with join button
          const embed = new EmbedBuilder()
            .setTitle("🐺 Trò Chơi Ma Sói")
            .setDescription("Nhấn nút bên dưới để tham gia!")
            .setColor("#9b59b6")
            .addFields(
              { name: "Người Chơi", value: `• ${message.author.username}` },
              { name: "Cách Chơi", value: "Ma Sói là trò chơi mạo hiểm dựa trên tâm lý. Mỗi người chơi sẽ nhận một vai trò bí mật. Ma Sói sẽ âm thầm ăn thịt dân làng mỗi đêm, trong khi dân làng phải tìm ra và tiêu diệt Ma Sói." }
            );
          
          const joinButton = new ButtonBuilder()
            .setCustomId('masoi_join')
            .setLabel('Tham Gia')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🐺');
          
          const startButton = new ButtonBuilder()
            .setCustomId('masoi_start')
            .setLabel('Bắt Đầu')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎮');
          
          const row = new ActionRowBuilder().addComponents(joinButton, startButton);
          
          const sentMessage = await message.channel.send({
            embeds: [embed],
            components: [row]
          });
          
          // Store the message ID for later updates
          game.messageId = sentMessage.id;
          
        } else if (action === "join" || action === "thamgia") {
          // Join an existing game
          const game = activeGames.get(message.channelId);
          
          if (!game) {
            return message.reply("Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!");
          }
          
          if (game.state !== STATE.LOBBY) {
            return message.reply("Trò chơi đã bắt đầu, không thể tham gia lúc này!");
          }
          
          const success = game.addPlayer(message.author);
          
          if (success) {
            await message.reply(`${message.author} đã tham gia trò chơi Ma Sói!`);
            await this.updateLobbyMessage(game);
          } else {
            await message.reply("Bạn đã tham gia trò chơi này!");
          }
          
        } else if (action === "start" || action === "batdau") {
          // Start an existing game
          const game = activeGames.get(message.channelId);
          
          if (!game) {
            return message.reply("Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!");
          }
          
          if (game.host.id !== message.author.id) {
            return message.reply("Chỉ người tạo trò chơi mới có thể bắt đầu!");
          }
          
          if (game.state !== STATE.LOBBY) {
            return message.reply("Trò chơi đã bắt đầu!");
          }
          
          const result = await game.start();
          
          if (result.success) {
            await message.reply("Trò chơi Ma Sói đã bắt đầu! Mỗi người chơi sẽ nhận được tin nhắn riêng với vai trò của mình.");
          } else {
            await message.reply(result.message);
          }
          
        } else if (action === "cancel" || action === "huy") {
          // Cancel an existing game
          const game = activeGames.get(message.channelId);
          
          if (!game) {
            return message.reply("Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!");
          }
          
          if (game.host.id !== message.author.id) {
            return message.reply("Chỉ người tạo trò chơi mới có thể hủy!");
          }
          
          activeGames.delete(message.channelId);
          
          await message.reply("Trò chơi Ma Sói đã bị hủy.");
          
        } else if (action === "help" || action === "huongdan") {
          // Show help information
          const embed = new EmbedBuilder()
            .setTitle("🐺 Trò Chơi Ma Sói - Trợ Giúp")
            .setColor("#9b59b6")
            .addFields(
              { name: "Tạo Trò Chơi", value: "!masoi create hoặc !masoi tao - Tạo trò chơi mới" },
              { name: "Tham Gia", value: "!masoi join hoặc !masoi thamgia - Tham gia trò chơi" },
              { name: "Bắt Đầu", value: "!masoi start hoặc !masoi batdau - Bắt đầu trò chơi (chỉ người tạo)" },
              { name: "Hủy", value: "!masoi cancel hoặc !masoi huy - Hủy trò chơi (chỉ người tạo)" },
              { name: "Vai Trò", value: "Ma Sói 🐺, Dân Làng 👨‍🌾, Tiên Tri 👁️, Bảo Vệ 🛡️, Phù Thủy 🧙‍♀️, Thợ Săn 🏹" }
            );
          
          await message.reply({ embeds: [embed] });
        } else {
          // Unknown action
          await message.reply("Hành động không hợp lệ! Dùng `!masoi help` để xem các lệnh có sẵn.");
        }
      }
    },
    // Alias for the main command (shorter name)
    {
      name: "ms",
      description: "Alias cho lệnh Ma Sói (gõ tắt)",
      data: {
        name: "ms",
        description: "Alias cho lệnh Ma Sói (gõ tắt)",
        options: [
          {
            name: "action",
            description: "Hành động",
            type: 3, // STRING
            required: false,
            choices: [
              { name: "Tạo trò chơi mới", value: "create" },
              { name: "Tham gia", value: "join" },
              { name: "Bắt đầu", value: "start" },
              { name: "Hủy", value: "cancel" },
              { name: "Giúp đỡ", value: "help" }
            ]
          }
        ]
      },
      slash: true,
      async execute(interaction, bot) {
        // For the alias, directly call the masoi command from the bot's commands
        const masoiCommand = bot.commandHandler.commands.get("masoi");
        if (masoiCommand) {
          await masoiCommand.execute(interaction, bot);
        } else {
          await interaction.reply({
            content: "Lệnh Ma Sói không khả dụng!",
            ephemeral: true
          });
        }
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        // For the alias, directly call the masoi command from the bot's commands
        const masoiCommand = bot.commandHandler.commands.get("masoi");
        if (masoiCommand) {
          await masoiCommand.legacyExecute(message, args, bot);
        } else {
          await message.reply("Lệnh Ma Sói không khả dụng!");
        }
      }
    }
  ]
};