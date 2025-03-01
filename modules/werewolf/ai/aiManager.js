// modules/werewolf/ai/aiManager.js
const AIPlayer = require('./aiPlayer');

// List of AI player names
const AI_NAMES = [
  "Bot-Tính", "Bot-Tuệ", "Bot-Minh", "Bot-Trí", "Bot-Thông", 
  "Bot-Anh", "Bot-Hào", "Bot-Dũng", "Bot-Khôi", "Bot-Quân",
  "Bot-Châu", "Bot-Linh", "Bot-Mai", "Bot-Thảo", "Bot-Quỳnh",
  "Bot-Hải", "Bot-Phong", "Bot-Dương", "Bot-Phúc", "Bot-Vinh"
];

class AIManager {
  constructor() {
    this.usedNames = new Set();
    this.aiCount = 0;
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
      aiPlayers.push(aiPlayer);
    }
    
    return aiPlayers;
  }

  /**
   * Process night actions for all AI players
   * @param {Object} gameState - Current game state
   * @param {string} currentPhase - Current night phase
   */
  async processAINightActions(gameState, currentPhase) {
    // Find all alive AI players with the current role
    const aiPlayers = Object.values(gameState.players)
      .filter(p => p.isAI && p.isAlive && p.role === currentPhase);
    
    console.log(`Processing night actions for ${aiPlayers.length} AI players with role ${currentPhase}`);
    
    // Have each AI player perform their night action
    for (const aiPlayer of aiPlayers) {
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
    
    // Add a slight delay between votes to make it seem more natural
    for (const aiPlayer of aiPlayers) {
      // Random delay between 1-3 seconds
      const delay = 1000 + Math.floor(Math.random() * 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const voteTarget = aiPlayer.makeVotingDecision(gameState);
      console.log(`AI ${aiPlayer.name} voting for: ${voteTarget}`);
      
      gameState.handleVote(aiPlayer.id, voteTarget);
    }
  }

  /**
   * Reset the manager for a new game
   */
  reset() {
    this.usedNames = new Set();
    this.aiCount = 0;
  }
}

// Export singleton instance
module.exports = new AIManager();