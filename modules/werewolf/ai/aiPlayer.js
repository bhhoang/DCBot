// modules/werewolf/ai/aiPlayer.js
const { getRole } = require('../roles');
const { NIGHT_PHASE } = require('../constants');

class AIPlayer {
  constructor(id, name, role) {
    this.id = id;
    this.name = name;
    this.username = name;
    this.role = role;
    this.isAI = true;
    this.isAlive = true;
    this.voteCount = 0;
    this.hasVoted = false;
  }

  /**
   * Create a mock user object for AI players
   * to maintain compatibility with human player objects
   */
  get user() {
    return {
      id: this.id,
      username: this.username,
      send: async () => true, // Mock DM function
      toString: () => `AI-${this.name}`
    };
  }

  /**
   * Perform night action based on role
   * @param {Object} gameState - Current game state
   * @returns {Object} The action result
   */
  async performNightAction(gameState) {
    // Wait a random amount of time (1-3 seconds) to simulate thinking
    const delay = 1000 + Math.floor(Math.random() * 2000);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Get the role implementation
    const role = getRole(this.role);
    if (!role) return { success: false };

    // Different strategies based on role
    switch(this.role) {
      case 'WEREWOLF':
        return this.makeWerewolfDecision(gameState);
      case 'SEER':
        return this.makeSeerDecision(gameState);
      case 'BODYGUARD':
        return this.makeBodyguardDecision(gameState);
      case 'WITCH':
        return this.makeWitchDecision(gameState);
      case 'HUNTER':
        return this.makeHunterDecision(gameState);
      default:
        // For roles without night actions or not yet implemented
        return { success: true, targetId: null };
    }
  }

  /**
   * AI Werewolf decision logic
   * @param {Object} gameState - Current game state
   * @returns {Object} The action result
   */
  makeWerewolfDecision(gameState) {
    // Get all alive players who aren't werewolves
    const possibleTargets = Object.values(gameState.players)
      .filter(p => p.isAlive && p.role !== 'WEREWOLF');
    
    if (possibleTargets.length === 0) return { success: true, targetId: null };
    
    // Prioritize the Seer if we can identify them
    // This would require knowledge that AI shouldn't have, so we'll use randomization instead
    
    // AI will target random non-werewolf players
    const targetIndex = Math.floor(Math.random() * possibleTargets.length);
    const target = possibleTargets[targetIndex];
    
    return { success: true, targetId: target.id };
  }

  /**
   * AI Seer decision logic
   * @param {Object} gameState - Current game state
   * @returns {Object} The action result
   */
  makeSeerDecision(gameState) {
    // Get all alive players excluding self
    const possibleTargets = Object.values(gameState.players)
      .filter(p => p.isAlive && p.id !== this.id);
    
    if (possibleTargets.length === 0) return { success: true, targetId: null };
    
    // Prioritize players that haven't been checked yet
    // Since this is AI, we'll just pick randomly for simplicity
    const targetIndex = Math.floor(Math.random() * possibleTargets.length);
    const target = possibleTargets[targetIndex];
    
    return { success: true, targetId: target.id };
  }

  /**
   * AI Bodyguard decision logic
   * @param {Object} gameState - Current game state
   * @returns {Object} The action result
   */
  makeBodyguardDecision(gameState) {
    // Get all alive players
    const possibleTargets = Object.values(gameState.players)
      .filter(p => p.isAlive);
    
    // Remove last protected player (can't protect same person twice)
    const validTargets = possibleTargets.filter(p => 
      p.id !== gameState.lastProtected || gameState.day <= 1
    );
    
    if (validTargets.length === 0) return { success: true, targetId: null };
    
    // Choose random player to protect
    const targetIndex = Math.floor(Math.random() * validTargets.length);
    const target = validTargets[targetIndex];
    
    return { success: true, targetId: target.id };
  }

  /**
   * AI Witch decision logic
   * @param {Object} gameState - Current game state
   * @returns {Object} The action result
   */
  makeWitchDecision(gameState) {
    // Initialize witch state if needed
    if (!gameState.witch) {
      gameState.witch = {
        healPotion: true,
        killPotion: true
      };
    }
    
    // Check if werewolf target exists and heal potion is available
    if (gameState.currentWerewolfTarget && gameState.witch.healPotion) {
      // 70% chance to save the target
      if (Math.random() < 0.7) {
        return { success: true, action: "heal" };
      }
    }
    
    // Check if kill potion is available
    if (gameState.witch.killPotion) {
      // 50% chance to use kill potion
      if (Math.random() < 0.5) {
        // Get all alive players excluding self
        const possibleTargets = Object.values(gameState.players)
          .filter(p => p.isAlive && p.id !== this.id);
        
        if (possibleTargets.length === 0) return { success: true, action: "none" };
        
        // Choose random player to kill
        const targetIndex = Math.floor(Math.random() * possibleTargets.length);
        const target = possibleTargets[targetIndex];
        
        return { success: true, targetId: target.id };
      }
    }
    
    // Default: do nothing
    return { success: true, action: "none" };
  }

  /**
   * AI Hunter decision logic
   * @param {Object} gameState - Current game state
   * @returns {Object} The action result
   */
  makeHunterDecision(gameState) {
    // Only used when the hunter dies
    // Get all alive players
    const possibleTargets = Object.values(gameState.players)
      .filter(p => p.isAlive);
    
    if (possibleTargets.length === 0) return { success: true, targetId: "none" };
    
    // 80% chance to shoot someone
    if (Math.random() < 0.8) {
      const targetIndex = Math.floor(Math.random() * possibleTargets.length);
      const target = possibleTargets[targetIndex];
      return { success: true, targetId: target.id };
    } else {
      // 20% chance to not shoot
      return { success: true, targetId: "none" };
    }
  }

  /**
   * AI voting decision during day phase
   * @param {Object} gameState - Current game state
   * @returns {string} ID of the player to vote for, or 'skip'
   */
  makeVotingDecision(gameState) {
    // Get all alive players excluding self
    const possibleTargets = Object.values(gameState.players)
      .filter(p => p.isAlive && p.id !== this.id);
    
    if (possibleTargets.length === 0) return 'skip';
    
    // If we're a werewolf, try to vote against villagers
    if (this.role === 'WEREWOLF') {
      // 80% chance to vote against a non-werewolf
      if (Math.random() < 0.8) {
        const nonWerewolves = possibleTargets.filter(p => p.role !== 'WEREWOLF');
        if (nonWerewolves.length > 0) {
          const targetIndex = Math.floor(Math.random() * nonWerewolves.length);
          return nonWerewolves[targetIndex].id;
        }
      }
    }
    
    // If we're a villager, try to vote against suspicious players
    // This is simplified - in a real AI we'd track suspicion scores
    
    // 10% chance to skip voting
    if (Math.random() < 0.1) {
      return 'skip';
    }
    
    // Default: random target
    const targetIndex = Math.floor(Math.random() * possibleTargets.length);
    return possibleTargets[targetIndex].id;
  }
}

module.exports = AIPlayer;