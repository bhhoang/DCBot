// modules/tts/queueManager.js — per-guild FIFO serialization of TTS requests.
// A failing request advances the queue rather than stalling it.
class QueueManager {
  constructor() {
    this._queues = new Map();      // guildId -> Array<processFn>
    this._processing = new Set();  // guildIds currently draining
    this._drainCbs = new Map();    // guildId -> callback
  }

  isProcessing(guildId) {
    return this._processing.has(guildId);
  }

  onDrain(guildId, cb) {
    this._drainCbs.set(guildId, cb);
  }

  enqueue(guildId, processFn) {
    if (!this._queues.has(guildId)) this._queues.set(guildId, []);
    this._queues.get(guildId).push(processFn);
    if (!this._processing.has(guildId)) this._drain(guildId);
  }

  async _drain(guildId) {
    this._processing.add(guildId);
    const queue = this._queues.get(guildId);
    while (queue && queue.length > 0) {
      const fn = queue.shift();
      try {
        await fn();
      } catch (error) {
        console.error(`[TTS-QUEUE] request failed for guild ${guildId}:`, error.message);
      }
    }
    this._processing.delete(guildId);
    const cb = this._drainCbs.get(guildId);
    if (cb) cb();
  }
}

module.exports = { QueueManager };
