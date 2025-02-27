// modules/masoi.js
const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  ButtonStyle,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  MessageFlags
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
  WEREWOLF: 'WEREWOLF',
  SEER: 'SEER',
  BODYGUARD: 'BODYGUARD',
  WITCH: 'WITCH'
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
    this.countdownMessage = null; // Message for countdown timer
    this.currentWerewolfTarget = null; // Track werewolf target for witch
    this.werewolfTargetSaved = false; // Track if target was saved
    this.werewolfIds = []; // Array to track werewolf player IDs
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
    
    this.players.set(user.id, {
      id: user.id,
      user: user,
      name: displayName,
      username: user.username,
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
    
    // Make sure all players have their member data
    for (const [playerId, player] of this.players) {
      if (!player.user.member && this.channel.guild) {
        try {
          const member = await this.channel.guild.members.fetch(playerId);
          if (member) {
            player.user.member = member;
            player.name = member.displayName || player.name;
          }
        } catch (error) {
          console.error(`Error fetching member for player ${player.name}:`, error);
        }
      }
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
    
    // Clear werewolf ID array
    this.werewolfIds = [];
    
    // Assign roles
    playerIds.forEach((playerId, index) => {
      const player = this.players.get(playerId);
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
  
  // Adjust role distribution based on player count
  adjustRoleDistribution(playerCount) {
    // Reset to default first
    this.roleDistribution = {
      WEREWOLF: 1,
      VILLAGER: 2,
      SEER: 1,
      BODYGUARD: 0,
      WITCH: 1,
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
    
    // First, identify all werewolves
    const werewolves = Array.from(this.players.values())
      .filter(player => player.role === "WEREWOLF")
      .map(player => player.name);
    
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
      
      // Add extra field for werewolves showing their teammates
      if (player.role === "WEREWOLF" && werewolves.length > 1) {
        // Filter out this player from the werewolf list
        const otherWerewolves = werewolves.filter(name => name !== player.name);
        
        if (otherWerewolves.length > 0) {
          embed.addFields({ 
            name: "Đồng Đội Ma Sói", 
            value: otherWerewolves.join(", ")
          });
        }
      }
      
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
      
      // If moving to WITCH phase, get and store the werewolf target for the witch
      if (this.nightPhase === NIGHT_PHASE.WITCH) {
        this.currentWerewolfTarget = this.getWerewolfTarget();
      }
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
    
    // For each player with the role, send them a prompt
    for (const player of playersWithRole) {
      const role = ROLES[player.role];
      
      // Create embed for night action
      let embed = new EmbedBuilder()
        .setTitle(`🌙 Đêm ${this.day} - Hành Động Của ${role.name}`)
        .setColor("#2f3136");
        
      // Special description for Witch to show werewolf target
      if (this.nightPhase === NIGHT_PHASE.WITCH && this.currentWerewolfTarget) {
        const targetPlayer = this.players.get(this.currentWerewolfTarget);
        if (targetPlayer) {
          embed.setDescription(`Người chơi **${targetPlayer.name}** hôm nay bị sói cắn, hãy chọn hành động của bạn không?`);
          embed.setColor("#ff9900"); // Orange color to indicate urgency
        } else {
          embed.setDescription(`Đêm nay không ai bị sói cắn. Hãy chọn hành động của bạn.`);
        }
      } else {
        embed.setDescription(`Đã đến lượt hành động của bạn. Hãy chọn một người chơi.`);
      }
      
      // Create select menu for target selection
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`masoi_action_${player.id}`)
        .setPlaceholder('Chọn hành động...');
      
      // Add options based on role
      if (this.nightPhase === NIGHT_PHASE.WITCH) {
        // Witch-specific options
        if (this.witch.healPotion && this.currentWerewolfTarget) {
          const targetPlayer = this.players.get(this.currentWerewolfTarget);
          selectMenu.addOptions({
            label: `Cứu ${targetPlayer ? targetPlayer.name : "người bị tấn công"}`,
            value: "heal",
            description: "Sử dụng bình thuốc cứu người bị Ma Sói tấn công",
            emoji: "💖"
          });
        }
        
        if (this.witch.killPotion) {
          selectMenu.addOptions({
            label: "Giết một người",
            value: "kill_select",
            description: "Sử dụng bình thuốc độc",
            emoji: "☠️"
          });
        }
        
        selectMenu.addOptions({
          label: "Không làm gì",
          value: "none",
          description: "Bỏ qua lượt này",
          emoji: "➖"
        });
      } else {
        // Normal target selection for other roles
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
        
        // For Bodyguard, add "self" option if they didn't protect themselves last night
        if (this.nightPhase === NIGHT_PHASE.BODYGUARD && this.protected !== player.id) {
          selectMenu.addOptions({
            label: "Bảo vệ bản thân",
            value: "self",
            description: "Bảo vệ chính bạn đêm nay",
          });
        }
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
    
    // Start countdown timer for discussion phase
    const discussionTime = 90; // 1.5 minutes in seconds
    await this.startCountdown(discussionTime, "Thảo luận", () => {
      if (this.state === STATE.DAY) {
        this.startVoting();
      }
    });
  }
  
  // Start a countdown timer that updates in real-time
  async startCountdown(seconds, phase, callback) {
    // Create initial countdown message
    const embed = new EmbedBuilder()
      .setTitle(`⏱️ ${phase} - Còn lại: ${seconds} giây`)
      .setColor("#f1c40f")
      .setDescription(`Thời gian ${phase.toLowerCase()} sẽ kết thúc sau ${seconds} giây.`);
    
    // Send and store the countdown message
    this.countdownMessage = await this.channel.send({ embeds: [embed] });
    
    // Calculate end time
    const endTime = Date.now() + (seconds * 1000);
    
    // Start countdown
    const countdownInterval = setInterval(async () => {
      const remainingTime = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      
      // Update the countdown message every 5 seconds or for the last 10 seconds
      if (remainingTime % 5 === 0 || remainingTime <= 10) {
        const updatedEmbed = new EmbedBuilder()
          .setTitle(`⏱️ ${phase} - Còn lại: ${remainingTime} giây`)
          .setColor(remainingTime <= 10 ? "#e74c3c" : "#f1c40f")  // Red for last 10 seconds
          .setDescription(`Thời gian ${phase.toLowerCase()} sẽ kết thúc sau ${remainingTime} giây.`);
        
        try {
          await this.countdownMessage.edit({ embeds: [updatedEmbed] });
        } catch (error) {
          console.error("Error updating countdown message:", error);
        }
      }
      
      // When countdown finishes
      if (remainingTime <= 0) {
        clearInterval(countdownInterval);
        
        // Execute callback function when timer ends
        if (callback) callback();
      }
    }, 1000);
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
    
    // First check if seer has used their ability by checking seerTarget property
    // This is more reliable than checking nightActions
    const targetId = seer.seerTarget || this.nightActions.get(seer.id);
    
    if (!targetId) {
      console.log("Seer did not select a target");
      return;
    }
    
    const target = this.players.get(targetId);
    if (!target) {
      console.log("Seer's target not found:", targetId);
      return;
    }
    
    // Create embed for seer result
    const embed = new EmbedBuilder()
      .setTitle(`👁️ Kết Quả Tiên Tri`)
      .setDescription(`Bạn đã tiên tri **${target.name}**`)
      .setColor("#9b59b6");
    
    // Check if target is a werewolf (using the werewolfIds array)
    const isWerewolf = target.role === "WEREWOLF";
    
    if (isWerewolf) {
      embed.addFields({ name: "Kết Quả", value: "Người chơi này là **Ma Sói**! 🐺" });
    } else {
      embed.addFields({ name: "Kết Quả", value: "Người chơi này **không phải** Ma Sói. ✅" });
    }
    
    try {
      await seer.user.send({ embeds: [embed] });
      console.log(`Sent seer result to ${seer.name} about ${target.name} (Werewolf: ${isWerewolf})`);
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
    
    // Start countdown timer for voting phase
    const votingTime = 60; // 1 minute in seconds
    await this.startCountdown(votingTime, "Bỏ phiếu", () => {
      if (this.state === STATE.VOTING) {
        this.endVoting(voteMsg);
      }
    });
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
  
  // Module initialization with improved interaction handling
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
          } else if (interaction.customId.startsWith('masoi_witch_kill_')) {
            await this.handleWitchKillSelect(interaction);
          }
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
        // Try to respond to the interaction if we haven't already
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content: "Có lỗi xảy ra khi xử lý tương tác.",
              flags: MessageFlags.Ephemeral
            });
          } catch (e) {
            console.error("Failed to respond to interaction after error:", e);
          }
        }
      }
    });
  },
  
  // Module shutdown
  async shutdown() {
    console.log("Module Ma Sói đang tắt!");
    // Clean up any active games
    activeGames.clear();
  },
  
  // Handle join button interaction
  async handleJoinButton(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game) return;
    
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
      await this.updateLobbyMessage(game);
    } else {
      await interaction.reply({ 
        content: "Bạn đã tham gia trò chơi này hoặc trò chơi đã bắt đầu.", 
        flags: MessageFlags.Ephemeral 
      });
    }
  },
  
  // Handle start button interaction
  async handleStartButton(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game) return;
    
    // Check if user is the host
    if (game.host.id !== interaction.user.id) {
      await interaction.reply({ 
        content: "Chỉ người tạo trò chơi mới có thể bắt đầu!", 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }
    
    // Check if game is in lobby state
    if (game.state !== STATE.LOBBY) {
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
  },
  
  // Handle vote button interaction
  async handleVoteButton(interaction) {
    const game = activeGames.get(interaction.channelId);
    if (!game || game.state !== STATE.VOTING) {
      await interaction.reply({ 
        content: "Không thể bỏ phiếu trong lúc này.", 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }
    
    // Get target ID from button
    const targetId = interaction.customId.replace('masoi_vote_', '');
    
    // Register vote
    const success = game.handleVote(interaction.user.id, targetId);
    
    if (success) {
      if (targetId === 'skip') {
        await interaction.reply({ 
          content: `Bạn đã quyết định không bỏ phiếu.`, 
          flags: MessageFlags.Ephemeral 
        });
      } else {
        const target = game.players.get(targetId);
        await interaction.reply({ 
          content: `Bạn đã bỏ phiếu cho ${target.name}.`, 
          flags: MessageFlags.Ephemeral 
        });
      }
    } else {
      await interaction.reply({ 
        content: "Bạn không thể bỏ phiếu trong lúc này.", 
        flags: MessageFlags.Ephemeral 
      });
    }
  },
  
  // Handle night action select menu interaction
  async handleNightActionSelect(interaction) {
    try {
      // Immediately defer the reply to prevent timeout
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
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
        await interaction.editReply({ 
          content: "Không thể thực hiện hành động trong lúc này." 
        });
        return;
      }
      
      // Get selected target/action
      const targetId = interaction.values[0];
      
      // Log night action for debugging
      console.log(`Night action from ${playerId} (${playerGame.players.get(playerId).role}) selecting ${targetId}`);
      
      // Special handling for witch kill potion - send another menu to select target
      if (targetId === "kill_select" && playerGame.players.get(playerId).role === "WITCH") {
        // Create new embed for target selection
        const killEmbed = new EmbedBuilder()
          .setTitle(`🧪 Sử Dụng Bình Thuốc Độc`)
          .setDescription(`Chọn một người chơi để đầu độc:`)
          .setColor("#800000"); // Dark red for kill action
        
        // Create select menu for kill target selection
        const killMenu = new StringSelectMenuBuilder()
          .setCustomId(`masoi_witch_kill_${playerId}`)
          .setPlaceholder('Chọn người chơi để giết...');
        
        // Add all alive players as options
        const targets = playerGame.getAlivePlayersExcept([playerId]);
        targets.forEach(target => {
          killMenu.addOptions({
            label: target.name,
            value: target.id,
            description: `Đầu độc ${target.name}`,
            emoji: "☠️"
          });
        });
        
        // Add cancel option
        killMenu.addOptions({
          label: "Hủy",
          value: "cancel",
          description: "Quay lại lựa chọn trước",
          emoji: "❌"
        });
        
        const killRow = new ActionRowBuilder().addComponents(killMenu);
        
        // Send the kill target selection menu
        await interaction.editReply({ 
          embeds: [killEmbed], 
          components: [killRow] 
        });
        
        // Don't register the action yet, wait for target selection
        return;
      }
      
      // For witch cancel action, send the original prompt again
      if (targetId === "cancel" && playerGame.players.get(playerId).role === "WITCH") {
        playerGame.promptNightActionForPlayer(playerId);
        await interaction.editReply({ 
          content: "Đã hủy hành động, vui lòng chọn lại." 
        });
        return;
      }
      
      // Register night action
      const success = playerGame.handleNightAction(playerId, targetId);
      
      if (success) {
        // Determine response based on role and target
        let responseMessage = "Bạn đã thực hiện hành động của mình.";
        
        const player = playerGame.players.get(playerId);
        
        if (player.role === "SEER") {
          responseMessage = `Bạn đã chọn tiên tri ${playerGame.players.get(targetId)?.name || targetId}.`;
          // Store seer action separately for reliable tracking
          player.seerTarget = targetId;
        } else if (player.role === "BODYGUARD") {
          if (targetId === "self") {
            responseMessage = "Bạn đã chọn bảo vệ chính mình đêm nay.";
          } else {
            responseMessage = `Bạn đã chọn bảo vệ ${playerGame.players.get(targetId)?.name || targetId}.`;
          }
        } else if (player.role === "WITCH") {
          if (targetId === "heal") {
            const targetPlayer = playerGame.players.get(playerGame.currentWerewolfTarget);
            responseMessage = `Bạn đã sử dụng bình thuốc cứu ${targetPlayer ? targetPlayer.name : "người bị tấn công"}.`;
          } else if (targetId === "none") {
            responseMessage = "Bạn đã quyết định không sử dụng thuốc.";
          } else {
            responseMessage = `Bạn đã chọn đầu độc ${playerGame.players.get(targetId)?.name || targetId}.`;
          }
        } else if (player.role === "WEREWOLF") {
          responseMessage = `Bạn đã chọn tấn công ${playerGame.players.get(targetId)?.name || targetId}.`;
        }
        
        await interaction.editReply({ content: responseMessage });
      } else {
        await interaction.editReply({ content: "Không thể thực hiện hành động trong lúc này." });
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
  },

  // Add a new method to send night action prompt to a specific player
  async promptNightActionForPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.isAlive || player.role !== this.nightPhase) {
      return false;
    }
    
    const role = ROLES[player.role];
    const targets = this.getAlivePlayersExcept([]);
    
    // Create embed for night action
    let embed = new EmbedBuilder()
      .setTitle(`🌙 Đêm ${this.day} - Hành Động Của ${role.name}`)
      .setColor("#2f3136");
      
    // Special description for Witch to show werewolf target
    if (this.nightPhase === NIGHT_PHASE.WITCH && this.currentWerewolfTarget) {
      const targetPlayer = this.players.get(this.currentWerewolfTarget);
      if (targetPlayer) {
        embed.setDescription(`Người chơi **${targetPlayer.name}** hôm nay bị sói cắn, hãy chọn hành động của bạn không?`);
        embed.setColor("#ff9900"); // Orange color for urgency
      } else {
        embed.setDescription(`Đêm nay không ai bị sói cắn. Hãy chọn hành động của bạn.`);
      }
    } else {
      embed.setDescription(`Đã đến lượt hành động của bạn. Hãy chọn một người chơi.`);
    }
    
    // Create select menu for target selection
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`masoi_action_${player.id}`)
      .setPlaceholder('Chọn hành động...');
    
    // Add options based on role
    if (this.nightPhase === NIGHT_PHASE.WITCH) {
      // Witch-specific options
      if (this.witch.healPotion && this.currentWerewolfTarget) {
        const targetPlayer = this.players.get(this.currentWerewolfTarget);
        selectMenu.addOptions({
          label: `Cứu ${targetPlayer ? targetPlayer.name : "người bị tấn công"}`,
          value: "heal",
          description: "Sử dụng bình thuốc cứu người bị Ma Sói tấn công",
          emoji: "💖"
        });
      }
      
      if (this.witch.killPotion) {
        selectMenu.addOptions({
          label: "Giết một người",
          value: "kill_select",
          description: "Sử dụng bình thuốc độc",
          emoji: "☠️"
        });
      }
      
      selectMenu.addOptions({
        label: "Không làm gì",
        value: "none",
        description: "Bỏ qua lượt này",
        emoji: "➖"
      });
    }
    // ... other roles logic
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    try {
      await player.user.send({ embeds: [embed], components: [row] });
      return true;
    } catch (error) {
      console.error(`Failed to send night action prompt to ${player.name}:`, error);
      return false;
    }
  },
  
  // Handle Hunter ability select menu interaction
  async handleHunterSelect(interaction) {
    try {
      // Immediately defer the reply to prevent timeout
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
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
          .setDescription(`**${hunterGame.players.get(hunterId).name}** đã quyết định không bắn ai.`)
          .setColor("#e67e22");
        
        await hunterGame.channel.send({ embeds: [embed] });
      } else {
        const target = hunterGame.players.get(targetId);
        
        // Mark target as dead
        if (target) {
          target.isAlive = false;
          
          await interaction.editReply({ content: `Bạn đã bắn ${target.name}.` });
          
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
  },
  
  // Add a handler for witch kill target selection
  async handleWitchKillSelect(interaction) {
    try {
      // Immediately defer the reply to prevent timeout
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      // Extract player ID from custom ID
      const playerId = interaction.customId.replace('masoi_witch_kill_', '');
      
      // Find the game this player is in
      let playerGame = null;
      for (const [channelId, game] of activeGames.entries()) {
        if (game.players.has(playerId)) {
          playerGame = game;
          break;
        }
      }
      
      if (!playerGame || playerGame.state !== STATE.NIGHT || playerGame.nightPhase !== NIGHT_PHASE.WITCH) {
        await interaction.editReply({ 
          content: "Không thể thực hiện hành động trong lúc này." 
        });
        return;
      }
      
      // Get selected target
      const targetId = interaction.values[0];
      
      // Handle cancel action
      if (targetId === "cancel") {
        playerGame.promptNightActionForPlayer(playerId);
        await interaction.editReply({ 
          content: "Đã hủy hành động, vui lòng chọn lại." 
        });
        return;
      }
      
      // Register the kill action
      const success = playerGame.handleNightAction(playerId, targetId);
      
      if (success) {
        const targetPlayer = playerGame.players.get(targetId);
        await interaction.editReply({ 
          content: `Bạn đã chọn đầu độc ${targetPlayer ? targetPlayer.name : targetId}.` 
        });
      } else {
        await interaction.editReply({ 
          content: "Không thể thực hiện hành động trong lúc này." 
        });
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
  },

  // Update the module initialization to handle the witch kill selection
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
          } else if (interaction.customId.startsWith('masoi_witch_kill_')) {
            await this.handleWitchKillSelect(interaction);
          }
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
        // Try to respond to the interaction if we haven't already
        if (!interaction.replied && !interaction.deferred) {
          try {
            await interaction.reply({
              content: "Có lỗi xảy ra khi xử lý tương tác.",
              flags: MessageFlags.Ephemeral
            });
          } catch (e) {
            console.error("Failed to respond to interaction after error:", e);
          }
        }
      }
    });
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
  
  // Get players list as a string
  getPlayersList(game) {
    if (game.players.size === 0) {
      return "Chưa có người chơi nào tham gia.";
    }
    
    return Array.from(game.players.values())
      .map(player => `• ${player.name}`)
      .join('\n');
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
              flags: MessageFlags.Ephemeral
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
              flags: MessageFlags.Ephemeral
            });
          }
          
          if (game.state !== STATE.LOBBY) {
            return interaction.reply({
              content: "Trò chơi đã bắt đầu, không thể tham gia lúc này!",
              flags: MessageFlags.Ephemeral
            });
          }
          
          const success = game.addPlayer(interaction.user);
          
          if (success) {
            await interaction.reply(`${interaction.user} đã tham gia trò chơi Ma Sói!`);
            await this.updateLobbyMessage(game);
          } else {
            await interaction.reply({
              content: "Bạn đã tham gia trò chơi này!",
              flags: MessageFlags.Ephemeral
            });
          }
          
        } else if (action === "start") {
          // Start an existing game
          const game = activeGames.get(interaction.channelId);
          
          if (!game) {
            return interaction.reply({
              content: "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!",
              flags: MessageFlags.Ephemeral
            });
          }
          
          if (game.host.id !== interaction.user.id) {
            return interaction.reply({
              content: "Chỉ người tạo trò chơi mới có thể bắt đầu!",
              flags: MessageFlags.Ephemeral
            });
          }
          
          if (game.state !== STATE.LOBBY) {
            return interaction.reply({
              content: "Trò chơi đã bắt đầu!",
              flags: MessageFlags.Ephemeral
            });
          }
          
          const result = await game.start();
          
          if (result.success) {
            await interaction.reply("Trò chơi Ma Sói đã bắt đầu! Mỗi người chơi sẽ nhận được tin nhắn riêng với vai trò của mình.");
          } else {
            await interaction.reply({
              content: result.message,
              flags: MessageFlags.Ephemeral
            });
          }
          
        } else if (action === "cancel") {
          // Cancel an existing game
          const game = activeGames.get(interaction.channelId);
          
          if (!game) {
            return interaction.reply({
              content: "Không có trò chơi Ma Sói nào đang diễn ra trong kênh này!",
              flags: MessageFlags.Ephemeral
            });
          }
          
          if (game.host.id !== interaction.user.id) {
            return interaction.reply({
              content: "Chỉ người tạo trò chơi mới có thể hủy!",
              flags: MessageFlags.Ephemeral
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
            flags: MessageFlags.Ephemeral
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
        // Use the same logic as the main command
        const masoiCommand = this.commands.find(cmd => cmd.name === "masoi");
        if (masoiCommand) {
          await masoiCommand.execute(interaction, bot);
        }
      },
      
      // Legacy command
      legacy: true,
      async legacyExecute(message, args, bot) {
        // Use the same logic as the main command
        const masoiCommand = this.commands.find(cmd => cmd.name === "masoi");
        if (masoiCommand) {
          await masoiCommand.legacyExecute(message, args, bot);
        }
      }
    }
  ]
};
