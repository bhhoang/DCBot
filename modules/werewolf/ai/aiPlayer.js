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
    
    // Memory of game events
    this.memory = {
      suspiciousPlayers: {},   // Track suspicion levels
      seenRoles: {},           // Only for Seer
      protectedTargets: [],    // Only for Bodyguard
      votingHistory: {},       // Who voted for whom
      seenWerewolfAttacks: [], // Deaths from werewolves
      seenWitchActions: [],    // Deaths from witch
      currentDay: 1            // Current game day
    };
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
   * Update AI memory with game events
   * @param {Object} gameState - Current game state
   */
  updateMemory(gameState) {
    // Update the current day
    this.memory.currentDay = gameState.day;
    
    // Record deaths from last night
    if (gameState.deaths && gameState.deaths.length > 0) {
      for (const death of gameState.deaths) {
        if (death.killer === "WEREWOLF") {
          this.memory.seenWerewolfAttacks.push({
            day: gameState.day,
            targetId: death.playerId
          });
        } else if (death.killer === "WITCH") {
          this.memory.seenWitchActions.push({
            day: gameState.day,
            targetId: death.playerId,
            action: "kill"
          });
        }
      }
    }

    // Update suspicion based on behavior
    this.updateSuspicion(gameState);
  }

  /**
   * Update suspicion levels based on game events
   * @param {Object} gameState - Current game state 
   */
  updateSuspicion(gameState) {
    const alivePlayers = Object.values(gameState.players).filter(p => p.isAlive);
    
    // Initialize suspicion for new players
    for (const player of alivePlayers) {
      if (player.id !== this.id && !this.memory.suspiciousPlayers[player.id]) {
        this.memory.suspiciousPlayers[player.id] = {
          id: player.id,
          name: player.name,
          suspicionLevel: 0, // 0 to 100
          notes: []
        };
      }
    }

    // Analyze voting patterns from last round
    if (gameState.votes && Object.keys(gameState.votes).length > 0) {
      // Track who voted for whom
      for (const [voterId, targetId] of Object.entries(gameState.votes)) {
        if (targetId !== 'skip') {
          if (!this.memory.votingHistory[gameState.day-1]) {
            this.memory.votingHistory[gameState.day-1] = {};
          }
          this.memory.votingHistory[gameState.day-1][voterId] = targetId;
          
          // If we're a villager and the voter voted for someone who died and was a villager, be suspicious
          if (this.isVillagerTeam() && this.memory.seenRoles[targetId] === "villager") {
            this.increaseSuspicion(voterId, 10, "Voted for confirmed villager");
          }
          
          // If werewolf, be suspicious of people voting for werewolves
          if (this.role === "WEREWOLF" || this.role === "CURSED_WEREWOLF") {
            const werewolfIds = this.getKnownWerewolves(gameState);
            if (werewolfIds.includes(targetId)) {
              this.increaseSuspicion(voterId, 15, "Voted for werewolf team member");
            }
          }
        }
      }
    }
  }

  /**
   * Increase suspicion for a player
   * @param {string} playerId - Player ID to be suspicious of
   * @param {number} amount - Amount to increase suspicion
   * @param {string} reason - Reason for suspicion
   */
  increaseSuspicion(playerId, amount, reason) {
    if (this.memory.suspiciousPlayers[playerId]) {
      const playerData = this.memory.suspiciousPlayers[playerId];
      playerData.suspicionLevel = Math.min(100, playerData.suspicionLevel + amount);
      playerData.notes.push({
        day: this.memory.currentDay,
        note: reason
      });
    }
  }

  /**
   * Decrease suspicion for a player
   * @param {string} playerId - Player ID to be less suspicious of
   * @param {number} amount - Amount to decrease suspicion
   * @param {string} reason - Reason for suspicion decrease
   */
  decreaseSuspicion(playerId, amount, reason) {
    if (this.memory.suspiciousPlayers[playerId]) {
      const playerData = this.memory.suspiciousPlayers[playerId];
      playerData.suspicionLevel = Math.max(0, playerData.suspicionLevel - amount);
      playerData.notes.push({
        day: this.memory.currentDay,
        note: reason
      });
    }
  }

  /**
   * Check if AI is on the villager team
   * @returns {boolean} True if on villager team
   */
  isVillagerTeam() {
    return this.role !== "WEREWOLF" && this.role !== "CURSED_WEREWOLF";
  }

  /**
   * Get known werewolves (for werewolf team members)
   * @param {Object} gameState - Current game state
   * @returns {Array} List of werewolf player IDs
   */
  getKnownWerewolves(gameState) {
    if (this.role !== "WEREWOLF" && this.role !== "CURSED_WEREWOLF") {
      return [];
    }
    
    return Object.values(gameState.players)
      .filter(p => (p.role === "WEREWOLF" || p.role === "CURSED_WEREWOLF") && p.isAlive)
      .map(p => p.id);
  }

  /**
   * Perform night action based on role
   * @param {Object} gameState - Current game state
   * @returns {Object} The action result
   */
  async performNightAction(gameState) {
    // Update AI's memory with game events
    this.updateMemory(gameState);

    // Wait a random amount of time (1-3 seconds) to simulate thinking
    const delay = 1000 + Math.floor(Math.random() * 2000);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Get the role implementation
    const role = getRole(this.role);
    if (!role) return { success: false };

    // Different strategies based on role
    switch(this.role) {
      case 'WEREWOLF':
      case 'CURSED_WEREWOLF':
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
      .filter(p => p.isAlive && p.role !== 'WEREWOLF' && p.role !== 'CURSED_WEREWOLF');
    
    if (possibleTargets.length === 0) return { success: true, targetId: null };
    
    // Check if we're a cursed werewolf with unused curse
    if (this.role === 'CURSED_WEREWOLF') {
      // Initialize cursed werewolf state if needed
      if (!gameState.cursedWerewolfState) {
        gameState.cursedWerewolfState = {};
      }
      
      if (!gameState.cursedWerewolfState[this.id]) {
        gameState.cursedWerewolfState[this.id] = {
          curseUsed: false
        };
      }
      
      const curseProbability = 0.7; // 70% chance to use curse if available
      const curseNotUsed = !gameState.cursedWerewolfState[this.id].curseUsed;
      
      console.log(`[DEBUG-AI] Cursed Werewolf ${this.name} making decision, curse used: ${!curseNotUsed}`);
      
      if (curseNotUsed && Math.random() < curseProbability) {
        // Choose strategic target for curse:
        // Prioritize players who seem "trusted" by the village
        let bestCurseTarget = null;
        let lowestSuspicion = 101; // Higher than max suspicion
        
        for (const target of possibleTargets) {
          const suspicion = this.memory.suspiciousPlayers[target.id]?.suspicionLevel || 0;
          if (suspicion < lowestSuspicion) {
            lowestSuspicion = suspicion;
            bestCurseTarget = target;
          }
        }
        
        if (bestCurseTarget) {
          console.log(`[DEBUG-AI] Cursed Werewolf ${this.name} using curse on ${bestCurseTarget.name}`);
          return { success: true, targetId: `curse_${bestCurseTarget.id}` };
        }
      } else if (curseNotUsed) {
        console.log(`[DEBUG-AI] Cursed Werewolf ${this.name} decided not to use curse this time`);
      } else {
        console.log(`[DEBUG-AI] Cursed Werewolf ${this.name} already used curse, making attack decision`);
      }
    }
    
    // Normal werewolf attack logic: prioritize the most dangerous players
    
    // Target Seer with high priority
    const possibleSeers = possibleTargets.filter(p => p.role === 'SEER');
    if (possibleSeers.length > 0) {
      const targetId = possibleSeers[0].id;
      
      // FIXED: Format output based on role
      if (this.role === 'CURSED_WEREWOLF') {
        return { success: true, targetId: `attack_${targetId}` };
      } else {
        return { success: true, targetId: targetId };
      }
    }
    
    // Target Bodyguard next
    const possibleBodyguards = possibleTargets.filter(p => p.role === 'BODYGUARD');
    if (possibleBodyguards.length > 0) {
      const targetId = possibleBodyguards[0].id;
      
      // FIXED: Format output based on role
      if (this.role === 'CURSED_WEREWOLF') {
        return { success: true, targetId: `attack_${targetId}` };
      } else {
        return { success: true, targetId: targetId };
      }
    }
    
    // Otherwise, target players with high suspicion of others (likely influential villagers)
    // Sort by suspicion levels (in the real game, AI wouldn't know roles but can track behavior)
    const targetsByThreatLevel = [...possibleTargets].sort((a, b) => {
      const aSuspicion = this.memory.suspiciousPlayers[a.id]?.suspicionLevel || 0;
      const bSuspicion = this.memory.suspiciousPlayers[b.id]?.suspicionLevel || 0;
      // Lower suspicion = more threat to werewolves
      return aSuspicion - bSuspicion;
    });
    
    // 70% chance to pick highest threat, 30% chance for random
    if (targetsByThreatLevel.length > 0 && Math.random() < 0.7) {
      const targetId = targetsByThreatLevel[0].id;
      
      // FIXED: Format output based on role
      if (this.role === 'CURSED_WEREWOLF') {
        return { success: true, targetId: `attack_${targetId}` };
      } else {
        return { success: true, targetId: targetId };
      }
    }
    
    // Fallback to random target
    const targetIndex = Math.floor(Math.random() * possibleTargets.length);
    const targetId = possibleTargets[targetIndex].id;
    
    // FIXED: Format output based on role
    if (this.role === 'CURSED_WEREWOLF') {
      return { success: true, targetId: `attack_${targetId}` };
    } else {
      return { success: true, targetId: targetId };
    }
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
    const uncheckedPlayers = possibleTargets.filter(p => 
      !this.memory.seenRoles[p.id]
    );
    
    // Then prioritize most suspicious players
    const targetsByThreatLevel = [...(uncheckedPlayers.length > 0 ? uncheckedPlayers : possibleTargets)]
      .sort((a, b) => {
        const aSuspicion = this.memory.suspiciousPlayers[a.id]?.suspicionLevel || 0;
        const bSuspicion = this.memory.suspiciousPlayers[b.id]?.suspicionLevel || 0;
        // Higher suspicion = higher priority to check
        return bSuspicion - aSuspicion;
      });
    
    // 80% chance to pick most suspicious, 20% chance for random
    if (targetsByThreatLevel.length > 0 && Math.random() < 0.8) {
      const target = targetsByThreatLevel[0];
      
      // Record that we're checking this player
      // (In a real game, the AI would get the result next morning)
      const isWerewolf = target.role === "WEREWOLF" || target.role === "CURSED_WEREWOLF";
      this.memory.seenRoles[target.id] = isWerewolf ? "werewolf" : "villager";
      
      // Update suspicion based on result
      if (isWerewolf) {
        this.increaseSuspicion(target.id, 100, "Confirmed as werewolf by seer ability");
      } else {
        this.decreaseSuspicion(target.id, 50, "Confirmed as not werewolf by seer ability");
      }
      
      return { success: true, targetId: target.id };
    }
    
    // Fallback to random target
    const targetIndex = Math.floor(Math.random() * possibleTargets.length);
    const target = possibleTargets[targetIndex];
    
    // Record that we're checking this player
    const isWerewolf = target.role === "WEREWOLF" || target.role === "CURSED_WEREWOLF";
    this.memory.seenRoles[target.id] = isWerewolf ? "werewolf" : "villager";
    
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
    
    // Check which players are on cooldown
    const onCooldown = new Set();
    if (gameState.bodyguardHistory) {
      for (const targetId in gameState.bodyguardHistory) {
        const lastProtectedDay = gameState.bodyguardHistory[targetId];
        const daysSinceProtection = gameState.day - lastProtectedDay;
        
        // Get the Bodyguard role to access cooldown value
        const bodyguardRole = getRole('BODYGUARD');
        const cooldown = bodyguardRole ? bodyguardRole.protectionCooldown : 2;
        
        if (daysSinceProtection < cooldown) {
          onCooldown.add(targetId);
        }
      }
    }
    
    // Filter out players on cooldown
    const validTargets = possibleTargets.filter(p => !onCooldown.has(p.id));
    
    if (validTargets.length === 0) return { success: true, targetId: null };
    
    // Strategy: protect players that seem valuable to village (low suspicion)
    // Or known special roles
    
    // Prioritize protecting self sometimes
    const selfProtectChance = 0.3; // 30% chance
    if (Math.random() < selfProtectChance && validTargets.some(p => p.id === this.id)) {
      return { success: true, targetId: this.id };
    }
    
    // Try to protect Seer if we somehow know who they are
    const possibleSeers = validTargets.filter(p => p.role === 'SEER');
    if (possibleSeers.length > 0 && Math.random() < 0.4) { // 40% chance to "guess" correctly
      return { success: true, targetId: possibleSeers[0].id };
    }
    
    // Protect players with low suspicion (likely valuable village members)
    const targetsByValue = [...validTargets].sort((a, b) => {
      const aSuspicion = this.memory.suspiciousPlayers[a.id]?.suspicionLevel || 50;
      const bSuspicion = this.memory.suspiciousPlayers[b.id]?.suspicionLevel || 50;
      // Lower suspicion = more valuable to protect
      return aSuspicion - bSuspicion;
    });
    
    // 70% chance to pick most valuable, 30% chance for random
    if (targetsByValue.length > 0 && Math.random() < 0.7) {
      const target = targetsByValue[0];
      
      // Record that we protected this player
      this.memory.protectedTargets.push({
        day: this.memory.currentDay,
        targetId: target.id
      });
      
      return { success: true, targetId: target.id };
    }
    
    // Choose random player to protect
    const targetIndex = Math.floor(Math.random() * validTargets.length);
    const target = validTargets[targetIndex];
    
    // Record the protection
    this.memory.protectedTargets.push({
      day: this.memory.currentDay,
      targetId: target.id
    });
    
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
      const targetPlayer = gameState.players[gameState.currentWerewolfTarget];
      
      // Higher chance to save early in the game
      const healProbability = Math.max(0.2, 0.8 - (gameState.day * 0.1));
      
      // Check if target is worth saving (not suspicious)
      const suspicion = this.memory.suspiciousPlayers[gameState.currentWerewolfTarget]?.suspicionLevel || 50;
      
      // Save if not suspicious or first night
      if (gameState.day <= 1 || suspicion < 40 || Math.random() < healProbability) {
        // Record the healing
        this.memory.seenWitchActions.push({
          day: this.memory.currentDay,
          targetId: gameState.currentWerewolfTarget,
          action: "heal"
        });
        
        return { success: true, action: "heal" };
      }
    }
    
    // Check if kill potion is available
    if (gameState.witch.killPotion) {
      // Chance to use kill potion increases as game progresses
      const killProbability = Math.min(0.8, 0.3 + (gameState.day * 0.1));
      
      if (Math.random() < killProbability) {
        // Get all alive players excluding self
        const possibleTargets = Object.values(gameState.players)
          .filter(p => p.isAlive && p.id !== this.id);
        
        if (possibleTargets.length === 0) return { success: true, action: "none" };
        
        // Target the most suspicious player
        const targetsByThreatLevel = [...possibleTargets].sort((a, b) => {
          const aSuspicion = this.memory.suspiciousPlayers[a.id]?.suspicionLevel || 0;
          const bSuspicion = this.memory.suspiciousPlayers[b.id]?.suspicionLevel || 0;
          return bSuspicion - aSuspicion;
        });
        
        if (targetsByThreatLevel.length > 0 && 
            targetsByThreatLevel[0].suspicionLevel > 60) {
          const target = targetsByThreatLevel[0];
          
          // Record the kill
          this.memory.seenWitchActions.push({
            day: this.memory.currentDay,
            targetId: target.id,
            action: "kill"
          });
          
          return { success: true, targetId: target.id };
        }
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
    
    // 90% chance to shoot someone (more decisive than previous 80%)
    if (Math.random() < 0.9) {
      // Target the most suspicious player
      const targetsByThreatLevel = [...possibleTargets].sort((a, b) => {
        const aSuspicion = this.memory.suspiciousPlayers[a.id]?.suspicionLevel || 0;
        const bSuspicion = this.memory.suspiciousPlayers[b.id]?.suspicionLevel || 0;
        return bSuspicion - aSuspicion;
      });
      
      // 80% choose highest suspicion, 20% random
      if (targetsByThreatLevel.length > 0 && Math.random() < 0.8) {
        return { success: true, targetId: targetsByThreatLevel[0].id };
      }
      
      // Random target
      const targetIndex = Math.floor(Math.random() * possibleTargets.length);
      const target = possibleTargets[targetIndex];
      return { success: true, targetId: target.id };
    } else {
      // 10% chance to not shoot
      return { success: true, targetId: "none" };
    }
  }

  /**
   * AI voting decision during day phase
   * @param {Object} gameState - Current game state
   * @returns {string} ID of the player to vote for, or 'skip'
   */
  makeVotingDecision(gameState) {
    // Update memory before deciding
    this.updateMemory(gameState);
    
    // Get all alive players excluding self
    const possibleTargets = Object.values(gameState.players)
      .filter(p => p.isAlive && p.id !== this.id);
    
    if (possibleTargets.length === 0) return 'skip';
    
    // If we're a werewolf, try to vote against villagers
    if (this.role === 'WEREWOLF' || this.role === 'CURSED_WEREWOLF') {
      // 90% chance to vote strategically for a villager
      if (Math.random() < 0.9) {
        // First priority: target confirmed non-werewolves (if we somehow know them)
        const knownVillagers = possibleTargets.filter(p => 
          p.role !== 'WEREWOLF' && p.role !== 'CURSED_WEREWOLF'
        );
        
        if (knownVillagers.length > 0) {
          // Target the most dangerous villager (lowest suspicion from others)
          const targetsByThreatLevel = [...knownVillagers].sort((a, b) => {
            const aSuspicion = this.memory.suspiciousPlayers[a.id]?.suspicionLevel || 50;
            const bSuspicion = this.memory.suspiciousPlayers[b.id]?.suspicionLevel || 50;
            // Lower suspicion = more threat to werewolves
            return aSuspicion - bSuspicion;
          });
          
          if (targetsByThreatLevel.length > 0) {
            return targetsByThreatLevel[0].id;
          }
        }
        
        // Alternative: vote for whoever other villagers seem to trust (low suspicion)
        const targetsByThreatLevel = [...possibleTargets].sort((a, b) => {
          const aSuspicion = this.memory.suspiciousPlayers[a.id]?.suspicionLevel || 50;
          const bSuspicion = this.memory.suspiciousPlayers[b.id]?.suspicionLevel || 50;
          // Lower suspicion = more threat to werewolves
          return aSuspicion - bSuspicion;
        });
        
        if (targetsByThreatLevel.length > 0) {
          return targetsByThreatLevel[0].id;
        }
      }
      
      // 5% chance to skip voting (to avoid being too obvious)
      if (Math.random() < 0.05) {
        return 'skip';
      }
    }
    
    // If we're a villager, try to vote against suspicious players
    if (this.isVillagerTeam()) {
      // 90% chance to vote strategically
      if (Math.random() < 0.9) {
        // First priority: vote for confirmed werewolves if we're the Seer
        if (this.role === 'SEER') {
          const confirmedWerewolves = possibleTargets.filter(p => 
            this.memory.seenRoles[p.id] === "werewolf"
          );
          
          if (confirmedWerewolves.length > 0) {
            return confirmedWerewolves[0].id;
          }
        }
        
        // Vote for most suspicious player
        const targetsBySuspicion = [...possibleTargets].sort((a, b) => {
          const aSuspicion = this.memory.suspiciousPlayers[a.id]?.suspicionLevel || 0;
          const bSuspicion = this.memory.suspiciousPlayers[b.id]?.suspicionLevel || 0;
          // Higher suspicion gets priority
          return bSuspicion - aSuspicion;
        });
        
        if (targetsBySuspicion.length > 0) {
          const highestSuspicion = this.memory.suspiciousPlayers[targetsBySuspicion[0].id]?.suspicionLevel || 0;
          if (highestSuspicion > 50) {
            return targetsBySuspicion[0].id;
          }
        }
      }
      
      // 5% chance to skip voting if nothing suspicious found
      if (Math.random() < 0.05) {
        return 'skip';
      }
    }
    
    // Default: random target
    const targetIndex = Math.floor(Math.random() * possibleTargets.length);
    return possibleTargets[targetIndex].id;
  }
}

module.exports = AIPlayer;