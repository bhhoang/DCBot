// modules/werewolf/utils/seerTracker.js
// Create this as a separate file first

class SeerResultTracker {
    constructor() {
      // Main storage for Seer actions and results
      this.actions = {};      // Format: {day: {playerId: targetId}}
      this.delivered = {};    // Format: {day: {playerId: true}}
      this.lastReported = {}; // Format: {playerId: {day, targetId}}
    }
  
    /**
     * Record a Seer's night action
     * @param {number} day - Current game day
     * @param {string} seerId - ID of the Seer
     * @param {string} targetId - ID of the target player
     */
    recordAction(day, seerId, targetId) {
      if (!this.actions[day]) {
        this.actions[day] = {};
      }
      this.actions[day][seerId] = targetId;
      console.log(`[SEER-TRACKER] Recorded action: Seer ${seerId} checked ${targetId} on night ${day}`);
    }
  
    /**
     * Get the target a Seer checked on a specific night
     * @param {number} day - Game day to check
     * @param {string} seerId - ID of the Seer
     * @returns {string|null} - Target ID or null if not found
     */
    getTarget(day, seerId) {
      return this.actions[day]?.[seerId] || null;
    }
  
    /**
     * Mark a result as delivered to prevent duplicate reporting
     * @param {number} day - Current game day (result is for previous night)
     * @param {string} seerId - ID of the Seer
     */
    markDelivered(day, seerId) {
      if (!this.delivered[day]) {
        this.delivered[day] = {};
      }
      this.delivered[day][seerId] = true;
      
      // Record this as the last reported result for this Seer
      const targetDay = day - 1;
      const targetId = this.getTarget(targetDay, seerId);
      if (targetId) {
        this.lastReported[seerId] = { day: targetDay, targetId };
      }
      
      console.log(`[SEER-TRACKER] Marked result as delivered: Seer ${seerId}, day ${day}, checked on night ${targetDay}`);
    }
  
    /**
     * Check if a result has already been delivered
     * @param {number} day - Current game day (result is for previous night)
     * @param {string} seerId - ID of the Seer
     * @returns {boolean} - Whether the result has been delivered
     */
    isDelivered(day, seerId) {
      return Boolean(this.delivered[day]?.[seerId]);
    }
    
    /**
     * Get the last reported result for a Seer
     * @param {string} seerId - ID of the Seer
     * @returns {Object|null} - Last reported result or null
     */
    getLastReported(seerId) {
      return this.lastReported[seerId] || null;
    }
  
    /**
     * Determine if the Seer has any pending results to report
     * @param {number} currentDay - Current game day
     * @param {string} seerId - ID of the Seer
     * @returns {boolean} - Whether there are pending results
     */
    hasPendingResults(currentDay, seerId) {
      // Check if there's an action from the previous night that hasn't been delivered
      const prevDay = currentDay - 1;
      return this.getTarget(prevDay, seerId) !== null && !this.isDelivered(currentDay, seerId);
    }
  
    /**
     * Debug the current state of the tracker
     */
    debugState() {
      console.log('[SEER-TRACKER] Current State:');
      console.log('- Actions:', JSON.stringify(this.actions));
      console.log('- Delivered:', JSON.stringify(this.delivered));
      console.log('- Last Reported:', JSON.stringify(this.lastReported));
    }
  }
  
  // Export the class
  module.exports = SeerResultTracker;