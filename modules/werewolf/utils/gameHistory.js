// modules/werewolf/utils/gameHistory.js
const fs = require('fs');
const path = require('path');

/**
 * GameHistory class for tracking and saving game events
 */
class GameHistory {
  constructor() {
    this.gameHistories = new Map();
    this.historyDirectory = path.join(__dirname, '../game_history');
    
    // Create directory if it doesn't exist
    try {
      if (!fs.existsSync(this.historyDirectory)) {
        fs.mkdirSync(this.historyDirectory, { recursive: true });
      }
    } catch (error) {
      console.error('Error creating history directory:', error);
    }
  }
  
  /**
   * Initialize game history for a specific game
   * @param {string} gameId - Unique identifier for the game (typically channelId)
   * @param {Object} gameState - Initial game state
   */
  initGame(gameId, gameState) {
    if (!this.gameHistories.has(gameId)) {
      this.gameHistories.set(gameId, {
        gameId,
        startTimestamp: Date.now(),
        playerCount: Object.keys(gameState.players).length,
        aiPlayerCount: Object.values(gameState.players).filter(p => p.isAI).length,
        nights: [],
        days: [],
        votes: [],
        deaths: [],
        currentNightActions: {}
      });
    }
  }
  
  /**
   * Record a night action
   * @param {string} gameId - Game ID
   * @param {number} day - Current day number
   * @param {string} phase - Night phase (WEREWOLF, SEER, etc.)
   * @param {string} playerId - Player performing the action
   * @param {string} actionType - Type of action
   * @param {string} targetId - Target of the action
   */
  recordNightAction(gameId, day, phase, playerId, actionType, targetId) {
    const history = this.gameHistories.get(gameId);
    if (!history) return;
    
    if (!history.currentNightActions[day]) {
      history.currentNightActions[day] = {};
    }
    
    if (!history.currentNightActions[day][phase]) {
      history.currentNightActions[day][phase] = {};
    }
    
    history.currentNightActions[day][phase][playerId] = {
      actionType,
      targetId,
      timestamp: Date.now()
    };
  }
  
  /**
   * Complete a night and save its actions
   * @param {string} gameId - Game ID
   * @param {number} day - Day number
   * @param {Object} gameState - Current game state
   */
  completeNight(gameId, day, gameState) {
    const history = this.gameHistories.get(gameId);
    if (!history) return;
    
    // Finalize night record
    const nightRecord = {
      day,
      timestamp: Date.now(),
      actions: history.currentNightActions[day] || {},
      deaths: gameState.deaths.map(death => ({
        player: death.playerId,
        playerName: gameState.players[death.playerId]?.name || 'Unknown',
        role: gameState.players[death.playerId]?.role || 'Unknown',
        killer: death.killer,
        message: death.message
      }))
    };
    
    // Add to nights history
    history.nights.push(nightRecord);
    
    // Add deaths to cumulative record
    gameState.deaths.forEach(death => {
      history.deaths.push({
        day,
        phase: 'NIGHT',
        player: death.playerId,
        playerName: gameState.players[death.playerId]?.name || 'Unknown',
        role: gameState.players[death.playerId]?.role || 'Unknown',
        killer: death.killer,
        message: death.message,
        timestamp: Date.now()
      });
    });
    
    // Reset current night actions after saving
    history.currentNightActions[day] = {};
    
    // Save history to disk
    this.saveHistory(gameId);
  }
  
  /**
   * Complete a day and save its actions
   * @param {string} gameId - Game ID
   * @param {number} day - Day number
   * @param {Object} gameState - Current game state
   * @param {Object} executionResult - Result of the day's execution/vote
   */
  completeDay(gameId, day, gameState, executionResult) {
    const history = this.gameHistories.get(gameId);
    if (!history) return;
    
    // Capture voting results
    const votes = {};
    for (const [voterId, targetId] of Object.entries(gameState.votes)) {
      if (targetId && targetId !== 'skip') {
        votes[voterId] = {
          targetId,
          targetName: gameState.players[targetId]?.name || 'Unknown',
          voterName: gameState.players[voterId]?.name || 'Unknown'
        };
      }
    }
    
    // Record day information
    const dayRecord = {
      day,
      timestamp: Date.now(),
      votes,
      execution: executionResult ? {
        executed: executionResult.executed?.id,
        executedName: executionResult.executed?.name,
        executedRole: executionResult.executed?.role,
        voteCount: executionResult.voteCount,
        tie: executionResult.tie
      } : null
    };
    
    // Add to days history
    history.days.push(dayRecord);
    
    // Add execution to deaths if someone was executed
    if (executionResult && executionResult.executed) {
      history.deaths.push({
        day,
        phase: 'DAY',
        player: executionResult.executed.id,
        playerName: executionResult.executed.name,
        role: executionResult.executed.role,
        killer: 'VILLAGE',
        message: 'Bị dân làng treo cổ',
        timestamp: Date.now(),
        voteCount: executionResult.voteCount
      });
    }
    
    // Save recorded votes
    for (const [voterId, voteInfo] of Object.entries(votes)) {
      history.votes.push({
        day,
        voter: voterId,
        voterName: voteInfo.voterName,
        target: voteInfo.targetId,
        targetName: voteInfo.targetName,
        timestamp: Date.now()
      });
    }
    
    // Save history to disk
    this.saveHistory(gameId);
  }
  
  /**
   * Record the game's end
   * @param {string} gameId - Game ID
   * @param {Object} gameState - Final game state
   */
  completeGame(gameId, gameState) {
    const history = this.gameHistories.get(gameId);
    if (!history) return;
    
    // Add final game state information
    history.winner = gameState.winner;
    history.endTimestamp = Date.now();
    history.duration = history.endTimestamp - history.startTimestamp;
    history.finalState = {
      players: Object.entries(gameState.players).map(([id, player]) => ({
        id,
        name: player.name,
        role: player.role,
        isAI: player.isAI || false,
        survived: player.isAlive
      }))
    };
    
    // Save final history to disk
    this.saveHistory(gameId);
    
    // Generate a unique filename with timestamp
    const filename = `${gameId}-${Date.now()}.json`;
    const filePath = path.join(this.historyDirectory, filename);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf8');
      console.log(`Game history saved to ${filePath}`);
    } catch (error) {
      console.error('Error saving game history to disk:', error);
    }
    
    // Clear from memory
    this.gameHistories.delete(gameId);
  }
  
  /**
   * Save history to temporary file
   * @param {string} gameId - Game ID
   */
  saveHistory(gameId) {
    const history = this.gameHistories.get(gameId);
    if (!history) return;
    
    // Save to temporary file
    const tempFilePath = path.join(this.historyDirectory, `${gameId}-temp.json`);
    
    try {
      fs.writeFileSync(tempFilePath, JSON.stringify(history, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving temporary game history:', error);
    }
  }
  
  /**
   * Get night actions for a specific day
   * @param {string} gameId - Game ID
   * @param {number} day - Day number
   * @returns {Object} Night actions for that day
   */
  getNightActions(gameId, day) {
    const history = this.gameHistories.get(gameId);
    if (!history) return {};
    
    // Look in completed nights first
    const nightRecord = history.nights.find(n => n.day === day);
    if (nightRecord) {
      return nightRecord.actions;
    }
    
    // Otherwise return current night actions
    return history.currentNightActions[day] || {};
  }
  
  /**
   * Get current game history
   * @param {string} gameId - Game ID
   * @returns {Object} Game history
   */
  getGameHistory(gameId) {
    return this.gameHistories.get(gameId) || null;
  }
}

// Export singleton instance
module.exports = new GameHistory();