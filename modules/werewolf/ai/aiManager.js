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