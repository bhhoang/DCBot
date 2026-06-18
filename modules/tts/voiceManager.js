// modules/tts/voiceManager.js — voice connection + player lifecycle for TTS.
// Runtime-only (needs a live Discord voice gateway); verified via manual smoke tests.
const fs = require('fs');
const {
  createAudioPlayer, createAudioResource, joinVoiceChannel,
  AudioPlayerStatus, VoiceConnectionStatus, entersState, NoSubscriberBehavior,
} = require('@discordjs/voice');

const isLinux = process.platform === 'linux';

class VoiceManager {
  constructor() {
    this._conns = new Map();          // guildId -> { connection, listeners: Array<[event, fn]> }
    this._disconnectTimers = new Map(); // guildId -> Timeout
  }

  _track(guildId, connection, event, fn) {
    connection.on(event, fn);
    this._conns.get(guildId).listeners.push([event, fn]);
  }

  async connect(voiceChannel) {
    const guildId = voiceChannel.guild.id;
    this.cancelIdleDisconnect(guildId);

    const existing = this._conns.get(guildId);
    if (existing && existing.connection.state.status === VoiceConnectionStatus.Ready) {
      return existing.connection;
    }
    if (existing) this.cleanup(guildId); // stale — tear down before recreating

    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      let connection;
      try {
        connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId,
          adapterCreator: voiceChannel.guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: false,
        });
        this._conns.set(guildId, { connection, listeners: [] });

        this._track(guildId, connection, 'error', (e) => console.error('Voice connection error:', e));
        this._track(guildId, connection, VoiceConnectionStatus.Disconnected, () => {
          Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
          ]).catch(() => this.cleanup(guildId));
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 15000);
        return connection;
      } catch (error) {
        lastError = error;
        if (connection) this.cleanup(guildId);
        if (attempt < 2) await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
      }
    }
    throw new Error(`Failed to join voice channel after 3 attempts: ${lastError.message}`);
  }

  // Resolves when the clip finishes (player reaches Idle) so the queue serializes:
  // the caller awaits one clip before the next is dequeued.
  async playFile(voiceChannel, filepath) {
    const connection = await this.connect(voiceChannel);

    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });

    const subscription = connection.subscribe(player);
    if (!subscription) throw new Error('Failed to subscribe connection to audio player');

    const resource = isLinux
      ? createAudioResource(filepath)
      : createAudioResource(filepath, { inputType: 'file', inlineVolume: true });
    if (resource.volume) resource.volume.setVolume(1.0);

    // Register completion handlers BEFORE play() so a short clip can't finish first.
    await new Promise((resolve) => {
      player.once('error', (e) => { console.error('Audio player error:', e); resolve(); });
      player.once(AudioPlayerStatus.Idle, () => resolve());
      player.play(resource);
    });
  }

  scheduleIdleDisconnect(guildId, ms = 10000) {
    this.cancelIdleDisconnect(guildId);
    this._disconnectTimers.set(guildId, setTimeout(() => this.cleanup(guildId), ms));
  }

  cancelIdleDisconnect(guildId) {
    const t = this._disconnectTimers.get(guildId);
    if (t) { clearTimeout(t); this._disconnectTimers.delete(guildId); }
  }

  cleanup(guildId) {
    this.cancelIdleDisconnect(guildId);
    const entry = this._conns.get(guildId);
    if (!entry) return;
    for (const [event, fn] of entry.listeners) {
      try { entry.connection.removeListener(event, fn); } catch { /* ignore */ }
    }
    try { entry.connection.destroy(); } catch { /* already destroyed */ }
    this._conns.delete(guildId);
  }

  cleanupAll() {
    for (const guildId of [...this._conns.keys()]) this.cleanup(guildId);
  }
}

module.exports = { VoiceManager };
