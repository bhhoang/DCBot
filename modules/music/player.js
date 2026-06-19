// modules/music/player.js — thin facade over discord-player. The init() body
// is the same as the current modules/music/index.js init() but split into
// helpers so the rest of the module can call into the player.
const { Player, QueryType, GuildQueueEvent, useMainPlayer } = require('discord-player');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const { DefaultExtractors } = require('@discord-player/extractor');
const { Log } = require('youtubei.js');
const state = require('./state');
const { refreshNowPlaying } = require('./ui/embeds'); // created in Task 4

let player = null;
let client_ref = null;
let bot_ref = null;

async function init(client, bot) {
  client_ref = client;
  bot_ref = bot;

  // youtubei.js logs non-fatal parser warnings (missing view types, signature
  // decipher fallbacks) at WARNING level. Clamp to ERROR to keep boot logs clean.
  Log.setLevel(Log.Level.ERROR);

  player = new Player(client);

  // See modules/music (prior fix): useYoutubeDL routes audio streaming through
  // yt-dlp (youtubei.js cannot produce a playable URL without server PO token).
  // generateWithPoToken keeps search and metadata current via BotGuard.
  const yt = await player.extractors.register(YoutubeiExtractor, {
    useYoutubeDL: true,
    generateWithPoToken: true,
  });
  if (!yt) console.warn('[music] YoutubeiExtractor failed to register — YouTube playback will be unavailable.');

  await player.extractors.loadMulti(DefaultExtractors);
  const failed = DefaultExtractors.filter((ext) => !player.extractors.isRegistered(ext.identifier));
  if (failed.length) {
    console.warn(`[music] ${failed.length} default extractor(s) failed to register:`,
      failed.map((e) => e.identifier).join(', '));
  }

  // Subscribe to events — each handler resolves the GuildQueue to a GuildMusicState
  // via state.get(guildId) and refreshes the Now Playing message.
  player.events.on(GuildQueueEvent.PlayerStart, async (queue, track) => {
    await refreshNowPlaying(queue, track, 'playing');
  });

  player.events.on(GuildQueueEvent.PlayerPause, async (queue) => {
    await refreshNowPlaying(queue, queue.currentTrack, 'paused');
  });

  player.events.on(GuildQueueEvent.PlayerResume, async (queue) => {
    await refreshNowPlaying(queue, queue.currentTrack, 'playing');
  });

  player.events.on(GuildQueueEvent.EmptyQueue, async (queue) => {
    await refreshNowPlaying(queue, null, 'empty');
  });

  player.events.on(GuildQueueEvent.Error, (queue, error) => {
    console.error('[music] queue error:', error.message);
    // Keep playing if more tracks queued; refresh to show error footer.
    refreshNowPlaying(queue, queue.currentTrack, 'error').catch(() => {});
  });

  player.events.on(GuildQueueEvent.PlayerError, (queue, error) => {
    console.error('[music] player error:', error.message);
    refreshNowPlaying(queue, queue.currentTrack, 'error').catch(() => {});
  });

  player.events.on(GuildQueueEvent.Disconnect, (queue) => {
    state.clear(queue.id);
  });

  // Expose for hot-reload + cross-module access.
  client.player = player;
  bot.player = player;
  state.startGc();
}

async function shutdown() {
  state.stopGc();
  if (player) {
    try { await player.destroy(); } catch (error) { console.error('[music] destroy error:', error.message); }
    player = null;
  }
}

function getQueue(guildId) {
  if (!player) return null;
  return player.nodes.get(guildId) || null;
}

async function search(query) {
  if (!player) throw new Error('Player not initialized');
  const result = await player.search(query, { searchEngine: QueryType.AUTO });
  return result.tracks;
}

async function addTrack(guildId, voiceChannel, track, requestedBy) {
  if (!player) throw new Error('Player not initialized');
  const s = state.getOrCreate(guildId);
  const result = await player.play(voiceChannel, track, {
    requestedBy,
    nodeOptions: {
      metadata: {
        channelId: null,        // filled in by commands/queue.js when NP message is created
        guildId,
        volume: s.volume,
        loopMode: s.loopMode,
      },
      leaveOnEmpty: true,
      leaveOnEnd: true,
      leaveOnStop: true,
      // Apply persisted volume and loop on queue creation.
      initialVolume: s.volume,
      ...(s.loopMode !== 'off' ? { repeatMode: s.loopMode === 'track' ? 1 : 2 } : {}),
    },
  });
  return result.track;
}

async function pause(guildId) {
  const q = getQueue(guildId);
  if (!q) throw new Error('No active queue');
  await q.node.pause();
}

async function resume(guildId) {
  const q = getQueue(guildId);
  if (!q) throw new Error('No active queue');
  await q.node.resume();
}

async function skip(guildId, count = 1) {
  const q = getQueue(guildId);
  if (!q) throw new Error('No active queue');
  // discord-player: queue.skipTo(index) jumps to a specific position. To skip N
  // tracks we skipTo(currentIndex + N). For count=1, just skipTo(next).
  const currentIndex = q.tracks.data.findIndex((t) => t.id === q.currentTrack?.id);
  const target = currentIndex + count;
  if (target >= q.tracks.size) {
    // Skipping past the end stops playback.
    q.delete();
  } else {
    q.node.skipTo(target);
  }
}

async function stop(guildId) {
  const q = getQueue(guildId);
  if (q) q.delete();
  state.clear(guildId);
}

async function shuffle(guildId) {
  const q = getQueue(guildId);
  if (!q) throw new Error('No active queue');
  q.tracks.shuffle(); // discord-player exposes shuffle() on the TrackQueue
}

function setLoop(guildId, mode) {
  if (!['off', 'track', 'queue'].includes(mode)) throw new Error(`Invalid loop mode: ${mode}`);
  const s = state.getOrCreate(guildId);
  s.loopMode = mode;
  const q = getQueue(guildId);
  if (q) {
    // 0=off, 1=track, 2=queue
    q.setRepeatMode(mode === 'off' ? 0 : mode === 'track' ? 1 : 2);
  }
}

function setVolume(guildId, level) {
  if (level < 0 || level > 200) throw new Error('Volume out of range');
  const s = state.getOrCreate(guildId);
  s.volume = level;
  s.preMuteVolume = null; // any direct set clears the mute latch
  const q = getQueue(guildId);
  if (q) q.node.setVolume(level);
}

function getVolume(guildId) {
  const s = state.get(guildId);
  if (!s) return { level: 100, isMuted: false };
  return { level: s.volume, isMuted: s.preMuteVolume !== null };
}

function toggleMute(guildId) {
  const s = state.getOrCreate(guildId);
  if (s.preMuteVolume !== null) {
    // Currently muted → restore.
    s.volume = s.preMuteVolume;
    s.preMuteVolume = null;
  } else {
    // Currently unmuted → save and zero.
    s.preMuteVolume = s.volume;
    s.volume = 0;
  }
  const q = getQueue(guildId);
  if (q) q.node.setVolume(s.volume);
  return { level: s.volume, isMuted: s.preMuteVolume !== null };
}

function getNowPlaying(guildId) {
  const q = getQueue(guildId);
  return q?.currentTrack || null;
}

async function onQueueUpdate(guildId) {
  const q = getQueue(guildId);
  if (!q) return;
  await refreshNowPlaying(q, q.currentTrack, q.node.isPaused() ? 'paused' : 'playing');
}

module.exports = {
  init, shutdown,
  getQueue, search, addTrack,
  pause, resume, skip, stop, shuffle,
  setLoop, setVolume, getVolume, toggleMute,
  getNowPlaying, onQueueUpdate,
  // Expose for tests / handlers that need direct access.
  _player: () => player,
};
