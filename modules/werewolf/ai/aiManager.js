// modules/werewolf/ai/aiManager.js
const AIPlayer = require('./aiPlayer');

// List of AI player names
const AI_NAMES = [
  "Bot-Tính", "Bot-Tuệ", "Bot-Minh", "Bot-Trí", "Bot-Thông",
  "Bot-Anh", "Bot-Hào", "Bot-Dũng", "Bot-Khôi", "Bot-Quân",
  "Bot-Châu", "Bot-Linh", "Bot-Mai", "Bot-Thảo", "Bot-Quỳnh",
  "Bot-Hải", "Bot-Phong", "Bot-Dương", "Bot-Phúc", "Bot-Vinh"
];


// Personality traits to add variety to AI decision making
const PERSONALITY_TRAITS = [
  {
    type: "strategic",   // Makes more logical decisions
    suspicionThreshold: 65,
    skipVoteChance: 0.05,
    villagerStrategy: "logical",
    werewolfStrategy: "deceptive"
  },
  {
    type: "impulsive",   // Makes riskier decisions
    suspicionThreshold: 40,
    skipVoteChance: 0.02,
    villagerStrategy: "aggressive",
    werewolfStrategy: "aggressive"
  },
  {
    type: "cautious",    // Makes more conservative decisions
    suspicionThreshold: 75,
    skipVoteChance: 0.15,
    villagerStrategy: "defensive",
    werewolfStrategy: "blend-in"
  }
];

class AIManager {
  constructor() {
    this.usedNames = new Set();
    this.aiCount = 0;
    this.aiPlayers = {};
  }

  /**
   * Generate a unique AI player name
   * @returns {string} A unique AI name
   */
  generateAIName() {
    // Filter out already used names
    const availableNames = AI_NAMES.filter(name => !this.usedNames.has(name));

    // If all names are used, add a number suffix to reuse names
    if (availableNames.length === 0) {
      const randomIndex = Math.floor(Math.random() * AI_NAMES.length);
      const baseName = AI_NAMES[randomIndex];
      let newName = `${baseName}_${this.aiCount + 1}`;
      this.usedNames.add(newName);
      this.aiCount++;
      return newName;
    }

    // Pick a random available name
    const randomIndex = Math.floor(Math.random() * availableNames.length);
    const name = availableNames[randomIndex];
    this.usedNames.add(name);
    return name;
  }

  /**
   * Get a random personality trait for an AI
   * @returns {Object} Personality trait object
   */
  getRandomPersonality() {
    const index = Math.floor(Math.random() * PERSONALITY_TRAITS.length);
    return PERSONALITY_TRAITS[index];
  }

  /**
   * Create AI players to fill the game
   * @param {Object} gameState - Current game state
   * @param {number} targetCount - Desired total player count
   * @returns {Array} Array of created AI players
   */
  createAIPlayers(gameState, targetCount) {
    const currentCount = Object.keys(gameState.players).length;
    const aiCount = Math.max(0, targetCount - currentCount);

    console.log(`Creating ${aiCount} AI players to reach target of ${targetCount}`);

    const aiPlayers = [];

    for (let i = 0; i < aiCount; i++) {
      const aiName = this.generateAIName();
      const aiId = `ai-${Date.now()}-${i}`;

      // Role will be assigned later by the game
      const aiPlayer = new AIPlayer(aiId, aiName, null);

      // Assign a random personality to this AI
      aiPlayer.personality = this.getRandomPersonality();

      aiPlayers.push(aiPlayer);

      // Store reference to this AI player
      this.aiPlayers[aiId] = aiPlayer;
    }

    return aiPlayers;
  }

  /**
   * Process night actions for all AI players
   * @param {Object} gameState - Current game state
   * @param {string} currentPhase - Current night phase
   */
  /**
 * Process night actions for all AI players
 * @param {Object} gameState - Current game state
 * @param {string} currentPhase - Current night phase
 */
  async processAINightActions(gameState, currentPhase) {
    // Find all alive AI players with the current role
    // FIXED: Special handling for werewolf phase to include cursed werewolves
    let aiPlayers;

    if (currentPhase === 'WEREWOLF') {
      // Include both regular and cursed werewolves in werewolf phase
      aiPlayers = Object.values(gameState.players)
        .filter(p => p.isAI && p.isAlive && (p.role === 'WEREWOLF' || p.role === 'CURSED_WEREWOLF'));

      console.log(`[DEBUG-AI] Processing night actions for ${aiPlayers.length} werewolf AI players (including cursed werewolves)`);
    } else {
      // Normal case for other roles
      aiPlayers = Object.values(gameState.players)
        .filter(p => p.isAI && p.isAlive && p.role === currentPhase);

      console.log(`Processing night actions for ${aiPlayers.length} AI players with role ${currentPhase}`);
    }

    // Have each AI player perform their night action
    for (const aiPlayer of aiPlayers) {
      // Add realistic delay between AI decisions (varies by personality)
      const baseDelay = aiPlayer.personality?.type === 'impulsive' ? 1000 : 2000;
      const randomFactor = Math.floor(Math.random() * 2000);
      const delay = baseDelay + randomFactor;

      // Wait before making a decision
      await new Promise(resolve => setTimeout(resolve, delay));

      const actionResult = await aiPlayer.performNightAction(gameState);

      if (actionResult.success) {
        // Directly call the game's handleNightAction with the AI's decision
        const targetId = actionResult.targetId || actionResult.action;

        if (targetId) {
          console.log(`AI ${aiPlayer.name} (${aiPlayer.role}) choosing target: ${targetId}`);
          gameState.handleNightAction(aiPlayer.id, targetId);
        }
      }
    }
  }



  /**
   * Process voting for all AI players
   * @param {Object} gameState - Current game state
   */
  async processAIVoting(gameState) {
    // Find all alive AI players
    const aiPlayers = Object.values(gameState.players)
      .filter(p => p.isAI && p.isAlive);

    console.log(`Processing votes for ${aiPlayers.length} AI players`);

    // Split voting into multiple rounds to make it more realistic
    // Some AIs vote quickly, others take time to think
    const quickVoters = aiPlayers.filter(p => p.personality?.type === 'impulsive');
    const normalVoters = aiPlayers.filter(p => p.personality?.type === 'strategic');
    const slowVoters = aiPlayers.filter(p => p.personality?.type === 'cautious');

    // Process quick voters first (1-2 seconds)
    for (const aiPlayer of quickVoters) {
      const delay = 1000 + Math.floor(Math.random() * 1000);
      await new Promise(resolve => setTimeout(resolve, delay));

      const voteTarget = aiPlayer.makeVotingDecision(gameState);
      console.log(`AI ${aiPlayer.name} (quick) voting for: ${voteTarget}`);

      gameState.handleVote(aiPlayer.id, voteTarget);
    }

    // Process normal voters next (2-4 seconds)
    for (const aiPlayer of normalVoters) {
      const delay = 2000 + Math.floor(Math.random() * 2000);
      await new Promise(resolve => setTimeout(resolve, delay));

      const voteTarget = aiPlayer.makeVotingDecision(gameState);
      console.log(`AI ${aiPlayer.name} (normal) voting for: ${voteTarget}`);

      gameState.handleVote(aiPlayer.id, voteTarget);
    }

    // Process slow voters last (3-6 seconds)
    for (const aiPlayer of slowVoters) {
      const delay = 3000 + Math.floor(Math.random() * 3000);
      await new Promise(resolve => setTimeout(resolve, delay));

      const voteTarget = aiPlayer.makeVotingDecision(gameState);
      console.log(`AI ${aiPlayer.name} (slow) voting for: ${voteTarget}`);

      gameState.handleVote(aiPlayer.id, voteTarget);
    }
  }


  /**
   * Process and update AI reactions to discussions
   * @param {Object} gameState - Current game state
   * @param {Array} messages - Discussion messages that were sent
   */
  async processAIDiscussionReactions(gameState, messages) {
    if (!messages || messages.length === 0) return;

    // Find all alive AI players
    const aiPlayers = Object.values(gameState.players)
      .filter(p => p.isAI && p.isAlive);

    if (aiPlayers.length === 0) return;

    console.log(`[DEBUG-AI] Processing ${aiPlayers.length} AI reactions to ${messages.length} discussion messages`);

    // For each AI player, process how they react to these messages
    for (const aiPlayer of aiPlayers) {
      // Process each message
      for (const message of messages) {
        // Skip processing the AI's own messages
        if (message.playerId === aiPlayer.id) continue;

        const speaker = gameState.players[message.playerId];
        if (!speaker) continue;

        // Extract content from message to analyze
        const content = message.message;

        // Basic analysis of message content to update suspicion
        await this._updateSuspicionFromMessage(aiPlayer, speaker, content, gameState);
      }
    }
  }

  /**
   * Update AI suspicion levels based on discussion message content
   * @param {Object} aiPlayer - The AI player processing the message
   * @param {Object} speaker - The player who sent the message
   * @param {string} content - The message content
   * @param {Object} gameState - Current game state
   * @private
   */
  async _updateSuspicionFromMessage(aiPlayer, speaker, content, gameState) {
    // Initialize suspicion record for this player if needed
    if (!aiPlayer.memory.suspiciousPlayers[speaker.id]) {
      aiPlayer.memory.suspiciousPlayers[speaker.id] = {
        id: speaker.id,
        name: speaker.name,
        suspicionLevel: 50, // Default to medium suspicion
        notes: []
      };
    }

    // Extract important keywords from message
    const lowerContent = content.toLowerCase();

    // Check for role claims
    const roleClaims = {
      'tiên tri': 'SEER',
      'bảo vệ': 'BODYGUARD',
      'thợ săn': 'HUNTER',
      'phù thủy': 'WITCH'
    };

    // Track if this message contains role claims
    let roleClaimed = null;

    // Process role claims
    for (const [keyword, roleId] of Object.entries(roleClaims)) {
      // Check for phrases like "tôi là tiên tri" or "với tư cách là tiên tri"
      if (lowerContent.includes(`tôi là ${keyword}`) ||
        lowerContent.includes(`là ${keyword}`) ||
        lowerContent.includes(`với tư cách là ${keyword}`) ||
        lowerContent.includes(`với vai trò ${keyword}`)) {

        roleClaimed = roleId;

        // If AI knows the real role (for werewolves or when AI is that role)
        if ((aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') &&
          (speaker.role !== roleId)) {
          // They're lying about their role - highly suspicious
          this.increaseSuspicion(aiPlayer, speaker.id, 25, `Nói dối là ${keyword}`);

          // Record fake role claim
          if (!aiPlayer.memory.roleClaims) {
            aiPlayer.memory.roleClaims = {};
          }
          aiPlayer.memory.roleClaims[speaker.id] = roleId;

          console.log(`[DEBUG-AI] ${aiPlayer.name} detected ${speaker.name} lying about being ${keyword}`);
        }
        // If AI is the role being claimed
        else if (aiPlayer.role === roleId) {
          // Someone else is claiming the AI's role - they're likely an impostor
          this.increaseSuspicion(aiPlayer, speaker.id, 40, `Giả dạng ${keyword} khi tôi là ${keyword} thật`);
          console.log(`[DEBUG-AI] ${aiPlayer.name} (real ${roleId}) detected ${speaker.name} falsely claiming to be ${keyword}`);
        }
      }
    }

    // Check for werewolf accusations
    if (lowerContent.includes('là sói') || lowerContent.includes('chắc chắn là sói')) {
      // Extract who they're accusing by checking for player names
      for (const player of Object.values(gameState.players)) {
        if (player.isAlive && content.includes(player.name)) {
          // If they're accusing an actual werewolf and AI is a werewolf
          if ((player.role === 'WEREWOLF' || player.role === 'CURSED_WEREWOLF') &&
            (aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF')) {
            // They're dangerous to the werewolf team
            this.increaseSuspicion(aiPlayer, speaker.id, 15, `Đang nghi ngờ đúng một Sói (${player.name})`);
            console.log(`[DEBUG-AI] ${aiPlayer.name} (wolf) concerned that ${speaker.name} suspects ${player.name} (also wolf)`);
          }
          // If they're accusing someone AI knows is innocent (as Seer)
          else if (aiPlayer.role === 'SEER' &&
            aiPlayer.memory.seenRoles[player.id] === 'villager') {
            // They're accusing an innocent, suspicious
            this.increaseSuspicion(aiPlayer, speaker.id, 10, `Đang nghi ngờ sai một dân làng (${player.name})`);
            console.log(`[DEBUG-AI] ${aiPlayer.name} (seer) detected ${speaker.name} wrongly suspecting innocent ${player.name}`);
          }
          // If they're falsely accusing a fellow innocent (as wolf)
          else if ((aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') &&
            player.role !== 'WEREWOLF' && player.role !== 'CURSED_WEREWOLF') {
            // Good for wolves - someone is misdirecting
            this.decreaseSuspicion(aiPlayer, speaker.id, 5, `Đang nghi ngờ sai một dân làng, có lợi cho phe Sói`);
          }
        }
      }
    }

    // For werewolves, track suspicion differently
    if (aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') {
      // Werewolves are more suspicious of active accusers
      if (lowerContent.includes('nghi ngờ') ||
        lowerContent.includes('đáng ngờ') ||
        lowerContent.includes('là sói')) {
        this.increaseSuspicion(aiPlayer, speaker.id, 5, "Đang tích cực truy tìm Sói");
      }

      // Werewolves like people who defend other wolves
      for (const wolf of Object.values(gameState.players).filter(p =>
        p.role === 'WEREWOLF' || p.role === 'CURSED_WEREWOLF')) {
        if (lowerContent.includes(wolf.name) &&
          (lowerContent.includes('không phải sói') ||
            lowerContent.includes('không đáng ngờ'))) {
          this.decreaseSuspicion(aiPlayer, speaker.id, 10, `Đang bảo vệ một Sói (${wolf.name})`);
        }
      }
    }

    // For villagers (including special roles)
    if (aiPlayer.role !== 'WEREWOLF' && aiPlayer.role !== 'CURSED_WEREWOLF') {
      // Villagers appreciate people who actively participate
      if (lowerContent.length > 100) { // Long, thoughtful messages
        this.decreaseSuspicion(aiPlayer, speaker.id, 2, "Tham gia tích cực vào thảo luận");
      }

      // Villagers are suspicious of people who change the subject
      if (lowerContent.includes('chuyển chủ đề') ||
        lowerContent.includes('nói về việc khác')) {
        this.increaseSuspicion(aiPlayer, speaker.id, 5, "Cố gắng chuyển hướng cuộc thảo luận");
      }
    }

    // Track seer results being shared
    if (roleClaimed === 'SEER' &&
      (lowerContent.includes('không phải sói') || lowerContent.includes('là sói'))) {

      // Track who the claimed seer checked
      for (const player of Object.values(gameState.players)) {
        if (player.isAlive && content.includes(player.name)) {
          // Initialize claimed results object if needed
          if (!aiPlayer.memory.claimedResults) {
            aiPlayer.memory.claimedResults = {};
          }

          if (!aiPlayer.memory.claimedResults[speaker.id]) {
            aiPlayer.memory.claimedResults[speaker.id] = [];
          }

          // Record the claimed result
          const isWerewolf = lowerContent.includes('là sói');
          aiPlayer.memory.claimedResults[speaker.id].push({
            checkedId: player.id,
            checkedName: player.name,
            claimedWerewolf: isWerewolf,
            day: gameState.day
          });

          console.log(`[DEBUG-AI] ${aiPlayer.name} recorded claimed seer result from ${speaker.name}: ${player.name} ${isWerewolf ? 'IS' : 'IS NOT'} werewolf`);

          // If AI is Seer and knows this is wrong, highly suspicious
          if (aiPlayer.role === 'SEER' && aiPlayer.memory.seenRoles[player.id]) {
            const actualIsWerewolf = aiPlayer.memory.seenRoles[player.id] === 'werewolf';
            if (actualIsWerewolf !== isWerewolf) {
              this.increaseSuspicion(aiPlayer, speaker.id, 50, `Nói dối về kết quả Tiên Tri: ${player.name} ${actualIsWerewolf ? 'LÀ' : 'KHÔNG PHẢI'} Sói`);
              console.log(`[DEBUG-AI] ${aiPlayer.name} detected ${speaker.name} lying about seer result for ${player.name}`);
            }
          }
        }
      }
    }

    // Generic suspicion adjustments
    if (lowerContent.includes('tôi không phải là sói')) {
      // Unprompted denial is suspicious
      this.increaseSuspicion(aiPlayer, speaker.id, 5, "Tự biện minh khi không bị buộc tội");
    }

    // Record this for debugging
    console.log(`[DEBUG-AI] ${aiPlayer.name} processed message from ${speaker.name}, suspicion now: ${aiPlayer.memory.suspiciousPlayers[speaker.id].suspicionLevel}`);
  }

  /**
   * Analyze voting patterns based on discussions
   * This helps AI players detect coordination between wolves
   * @param {Object} gameState - Current game state
   */
  async analyzeVotingPatterns(gameState) {
    const aiPlayers = Object.values(gameState.players).filter(p => p.isAI && p.isAlive);
    if (aiPlayers.length === 0) return;

    // Can only analyze if there are previous voting rounds
    if (!gameState.votingHistory || Object.keys(gameState.votingHistory).length === 0) {
      return;
    }

    console.log(`[DEBUG-AI] Analyzing voting patterns for ${aiPlayers.length} AI players`);

    // Look at previous day's votes
    const previousDay = gameState.day - 1;
    if (previousDay < 1 || !gameState.votingHistory[previousDay]) {
      return;
    }

    const previousVotes = gameState.votingHistory[previousDay];

    // Convert to array of [voterId, targetId]
    const voteArray = Object.entries(previousVotes);

    // Skip if not enough votes
    if (voteArray.length < 3) return;

    // For each AI, analyze the voting patterns
    for (const aiPlayer of aiPlayers) {
      // Get all players who voted the same way
      const myVote = previousVotes[aiPlayer.id];
      if (!myVote || myVote === 'skip') continue;

      // Find players who voted the same
      const sameVoters = voteArray
        .filter(([voter, target]) =>
          voter !== aiPlayer.id && // Not self
          target === myVote && // Voted for same target
          gameState.players[voter]?.isAlive // Still alive
        )
        .map(([voter]) => voter);

      // Find players who voted differently than the majority
      const allVoteTargets = voteArray.map(([_, target]) => target);
      const voteFrequency = {};

      allVoteTargets.forEach(target => {
        if (target !== 'skip') {
          voteFrequency[target] = (voteFrequency[target] || 0) + 1;
        }
      });

      // Find the most common vote target
      let mostVotedTarget = null;
      let maxVotes = 0;

      for (const [target, count] of Object.entries(voteFrequency)) {
        if (count > maxVotes) {
          maxVotes = count;
          mostVotedTarget = target;
        }
      }

      // Find players who voted against the majority
      const contraryVoters = mostVotedTarget ? voteArray
        .filter(([voter, target]) =>
          target !== mostVotedTarget &&
          target !== 'skip' &&
          gameState.players[voter]?.isAlive
        )
        .map(([voter]) => voter) : [];

      // Apply suspicion adjustments based on voting patterns
      if (aiPlayer.role === 'WEREWOLF' || aiPlayer.role === 'CURSED_WEREWOLF') {
        // Werewolves are suspicious of those who voted with them (might be tracking them)
        for (const voter of sameVoters) {
          this.increaseSuspicion(aiPlayer, voter, 3, "Bỏ phiếu giống tôi, có thể đang theo dõi");
        }

        // Werewolves like contrary voters who don't follow the crowd
        for (const voter of contraryVoters) {
          this.decreaseSuspicion(aiPlayer, voter, 5, "Bỏ phiếu ngược với đám đông, gây nhiễu cho dân làng");
        }
      } else {
        // Villagers trust those who vote with them
        for (const voter of sameVoters) {
          this.decreaseSuspicion(aiPlayer, voter, 5, "Bỏ phiếu giống tôi, có thể cùng phe");
        }

        // Villagers are suspicious of contrary voters, especially when there's clear consensus
        if (maxVotes > allVoteTargets.length / 2) { // Clear majority
          for (const voter of contraryVoters) {
            this.increaseSuspicion(aiPlayer, voter, 7, "Bỏ phiếu ngược với đa số một cách đáng ngờ");
          }
        }
      }
    }

    console.log(`[DEBUG-AI] Completed voting pattern analysis`);
  }

  /**
   * Enhanced AI memory update after each game phase
   * @param {Object} gameState - Current game state 
   */
  updateAIKnowledge(gameState) {
    // Find all AI players
    const aiPlayers = Object.values(gameState.players)
      .filter(p => p.isAI);

    if (aiPlayers.length === 0) return;

    console.log(`[DEBUG-AI] Updating memory for ${aiPlayers.length} AI players`);

    // Update each AI's memory with game events
    for (const aiPlayer of aiPlayers) {
      try {
        aiPlayer.updateMemory(gameState);

        // Added analysis of discussion-based suspicion
        if (gameState.state === 'DAY' || gameState.state === 'VOTING') {
          // Analyze voting patterns when voting phase begins
          this.analyzeVotingPatterns(gameState);
        }
      } catch (error) {
        console.error(`[ERROR-AI] Failed to update memory for ${aiPlayer.name}:`, error);
      }
    }

    console.log(`[DEBUG-AI] AI knowledge update completed`);
  }

  /**
   * Update AI knowledge after each phase
   * @param {Object} gameState - Current game state 
   */
  updateAIKnowledge(gameState) {
    // Find all AI players
    const aiPlayers = Object.values(gameState.players)
      .filter(p => p.isAI);

    // Update each AI's memory with game events
    for (const aiPlayer of aiPlayers) {
      aiPlayer.updateMemory(gameState);
    }
  }

  /**
   * Reset the manager for a new game
   */
  reset() {
    this.usedNames = new Set();
    this.aiCount = 0;
    this.aiPlayers = {};
  }
}

// Export singleton instance
module.exports = new AIManager();