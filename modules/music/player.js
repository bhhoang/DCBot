// modules/music/player.js — thin facade over discord-player. The init() body
// is the same as the current modules/music/index.js init() but split into
// helpers so the rest of the module can call into the player.
//
// Registered providers (extractors):
//   YouTube (YoutubeiExtractor, custom), Spotify (SpotifyExtractor, needs
//   config.music.spotify.* for playback), and DefaultExtractors from
//   @discord-player/extractor — SoundCloud, Apple Music, Vimeo, Reverbnation,
//   Attachment (no credentials required).
const { Player, QueryType, GuildQueueEvent, Track, Util } = require('discord-player');
const { YoutubeiExtractor } = require('discord-player-youtubei');
const { DefaultExtractors, SpotifyExtractor } = require('@discord-player/extractor');
const { youtubeDl } = require('youtube-dl-exec');
const { Log } = require('youtubei.js');
const fs = require('fs');
const path = require('path');
const { providerLabel } = require('./providers');
const soundcloudSearch = require('./soundcloudSearch');
const spotifySearch = require('./spotifySearch');
const state = require('./state');
const proxyManager = require('./proxyManager');
const ytStream = require('./ytStream');
const { refreshNowPlaying } = require('./ui/embeds'); // created in Task 4

let player = null;
let botConfig = null;

async function init(client, bot) {
  // youtubei.js logs non-fatal parser warnings (missing view types, signature
  // decipher fallbacks) at WARNING level. Clamp to ERROR to keep boot logs clean.
  Log.setLevel(Log.Level.ERROR);

  player = new Player(client);
  botConfig = bot?.config || null;

  // YouTube increasingly blocks datacenter/VPS IPs with "Sign in to confirm
  // you're not a bot". Passing cookies from a logged-in account defeats this.
  // Cookie file path resolves from config.music.youtube.cookiesFile, else the
  // default below. Netscape cookies.txt format (yt-dlp --cookies).
  const cookiesFile = bot.config?.music?.youtube?.cookiesFile
    || path.join(__dirname, '..', '..', 'config', 'youtube-cookies.txt');
  const hasCookies = fs.existsSync(cookiesFile);
  if (hasCookies) {
    console.log(`[music] using YouTube cookies from ${cookiesFile}`);
  } else {
    console.warn(`[music] no YouTube cookies file at ${cookiesFile} — playback may fail with bot-detection. See docs.`);
  }

  // Proxy + PO-token config. The proxy is applied per-stream inside ytStream's
  // createStream hook (NOT via process env — discord-player-youtubei's hardcoded
  // yt-dlp path ignores env and registration proxy options on the audio path).
  const ytCfg = bot.config?.music?.youtube || {};
  const proxyCfg = ytCfg.proxyRotation || {};
  // Legacy single static proxy still honored: fold it into the residential slot.
  if (ytCfg.proxy && !proxyCfg.residential?.endpoint) {
    proxyCfg.residential = { endpoint: ytCfg.proxy, cooldownMinutes: 30 };
  }
  proxyCfg.cookiesFile = cookiesFile;
  proxyManager.init(proxyCfg);
  const proxyUrl = proxyCfg.residential?.endpoint
    ? proxyManager._parseEndpoint(proxyCfg.residential.endpoint) : null;

  // useYoutubeDL routes audio streaming through yt-dlp (youtubei.js cannot
  // produce a playable URL without a server PO token). The extractor's yt-dlp
  // path reads the `cookie` option (a cookies.txt file path passed to yt-dlp
  // --cookies) — NOT overrideDownloadOptions, which only applies to the native
  // youtubei streaming path. Cookies defeat YouTube's bot-detection on
  // datacenter IPs; yt-dlp solves the signature/n-challenge using node.
  const ytOptions = {
    useYoutubeDL: true,
    generateWithPoToken: true,
    createStream: ytStream.make(
      { cookiesFile, poToken: ytCfg.poToken || { enabled: false } },
      proxyManager,
    ),
  };
  if (hasCookies) {
    ytOptions.cookie = cookiesFile;
  }
  if (proxyUrl) {
    try {
      const { ProxyAgent } = require('undici');
      ytOptions.proxy = new ProxyAgent(proxyUrl);
    } catch (error) {
      console.warn('[music] could not build undici ProxyAgent for metadata fetches:', error.message);
    }
  }
  const yt = await player.extractors.register(YoutubeiExtractor, ytOptions);
  if (!yt) console.warn('[music] YoutubeiExtractor failed to register — YouTube playback will be unavailable.');

  const spotifyConfig = bot.config?.music?.spotify || {};
  const spotifyOptions = {};
  if (spotifyConfig.clientId && spotifyConfig.clientSecret) {
    spotifyOptions.clientId = spotifyConfig.clientId;
    spotifyOptions.clientSecret = spotifyConfig.clientSecret;
  }
  const spotify = await player.extractors.register(SpotifyExtractor, spotifyOptions);
  if (spotifyConfig.clientId && spotifyConfig.clientSecret) {
    console.log('[music] Spotify credentials present — search will use the custom Client Credentials flow.');
  } else {
    console.warn('[music] Spotify credentials not set in config.music.spotify — Spotify search will return 0. See docs/SPOTIFY-SETUP.md.');
  }

  await player.extractors.loadMulti(DefaultExtractors);
  const failed = DefaultExtractors.filter((ext) => !player.extractors.isRegistered(ext.identifier));
  if (failed.length) {
    console.warn(`[music] ${failed.length} default extractor(s) failed to register:`,
      failed.map((e) => e.identifier).join(', '));
  }

  // Log every registered provider so operators can verify multi-provider
  // support at boot without grepping logs or trial-and-error'ing queries.
  const registered = player.extractors.store?.size ?? 0;
  if (registered > 0) {
    const names = [];
    for (const ext of player.extractors.store.values()) {
      names.push(providerLabel(ext.identifier));
    }
    console.log(`[music] providers loaded (${registered}): ${names.join(', ')}`);
  }

  // Subscribe to events — each handler resolves the GuildQueue to a GuildMusicState
  // via state.get(guildId) and refreshes the Now Playing message.
  player.events.on(GuildQueueEvent.PlayerStart, async (queue, track) => {
    proxyManager.reportSuccess();
    await refreshNowPlaying(queue, track, 'playing');
  });

  // NOTE: We intentionally do NOT subscribe to PlayerPause / PlayerResume
  // events here. The button handler (modules/music/interactions/buttons.js)
  // and slash command handler (modules/music/commands/transport.js) both
  // explicitly call player.onQueueUpdate() after pause/resume, which is
  // the sole source of UI refresh for user-initiated pause/resume.
  //
  // Subscribing here would cause two concurrent refreshNowPlaying() calls
  // per pause/resume action (one from the event, one from the explicit
  // onQueueUpdate call), racing on the same Discord message. Discord.js
  // rate-limits duplicate message edits within a short window and the
  // .catch(() => {}) in refreshNowPlaying swallows the error silently,
  // so the user would see no UI update at all. The explicit calls are
  // authoritative.

  player.events.on(GuildQueueEvent.EmptyQueue, async (queue) => {
    await refreshNowPlaying(queue, null, 'empty');
  });

  player.events.on(GuildQueueEvent.Error, (queue, error) => {
    proxyManager.reportBlock(error);
    console.error('[music] queue error:', error.message);
    // Keep playing if more tracks queued; refresh to show error footer.
    refreshNowPlaying(queue, queue.currentTrack, 'error').catch(() => {});
  });

  player.events.on(GuildQueueEvent.PlayerError, (queue, error) => {
    proxyManager.reportBlock(error);
    console.error('[music] player error:', error.message);
    refreshNowPlaying(queue, queue.currentTrack, 'error').catch(() => {});
  });

  player.events.on(GuildQueueEvent.Disconnect, async (queue) => {
    // Render the disconnected embed first (state.clear() would null the
    // nowPlayingMessage ref that refreshNowPlaying needs to find the message).
    await refreshNowPlaying(queue, null, 'disconnected');
    state.clear(queue.id);
  });

  // Expose for hot-reload + cross-module access.
  client.player = player;
  bot.player = player;
  // Warn loudly if PO tokens are enabled but the bgutil sidecar is unreachable.
  if (ytCfg.poToken?.enabled && ytCfg.poToken.baseUrl) {
    require('http').get(ytCfg.poToken.baseUrl + '/ping', (res) => res.resume())
      .on('error', () => console.warn(
        `[music] PO-token sidecar unreachable at ${ytCfg.poToken.baseUrl} — `
        + 'YouTube playback will fall back to cookie-only and may hit 403s. '
        + 'Start bgutil-ytdlp-pot-provider.'));
  }
  state.startGc();
}

async function shutdown() {
  state.stopGc();
  proxyManager.shutdown();
  if (player) {
    try { await player.destroy(); } catch (error) { console.error('[music] destroy error:', error.message); }
    player = null;
  }
}

function getQueue(guildId) {
  if (!player) return null;
  return player.nodes.get(guildId) || null;
}

// Maps /play's provider choice + URL detection to a discord-player QueryType.
// URLs use URL-specific types (YOUTUBE_VIDEO etc.) so a pasted Spotify link
// with provider=spotify parses correctly; text uses the search type.
function mapProviderToQueryType(provider, query) {
  const isUrl = /^https?:\/\//i.test(query)
    || /^(www\.)?(youtube\.com|youtu\.be|open\.spotify\.com|soundcloud\.com)/i.test(query);
  const map = {
    youtube:    isUrl ? QueryType.YOUTUBE_VIDEO     : QueryType.YOUTUBE_SEARCH,
    spotify:    isUrl ? QueryType.SPOTIFY_SONG     : QueryType.SPOTIFY_SEARCH,
    soundcloud: isUrl ? QueryType.SOUNDCLOUD_TRACK : QueryType.SOUNDCLOUD_SEARCH,
  };
  return map[provider] || QueryType.AUTO;
}

// discord-player needs the Track to carry an `extractor` reference for
// stream resolution; reuse the registered one.
function buildSoundCloudTrack(raw) {
  const scExtractor = player?.extractors?.store?.get('com.discord-player.soundcloudextractor');
  const track = new Track(player, {
    title: raw.title,
    url: raw.permalink_url,
    duration: Util.buildTimeCode(Util.parseMS(raw.duration || 0)),
    description: raw.description || '',
    thumbnail: raw.artwork_url,
    views: raw.playback_count,
    author: raw.user?.username,
    source: 'soundcloud',
    engine: raw,
    metadata: raw,
    requestMetadata: async () => raw,
    cleanTitle: raw.title,
  });
  if (scExtractor) track.extractor = scExtractor;
  return track;
}

// Bypasses @discord-player/extractor's SoundCloudExtractor — it throws
// "maxRedirections is not supported" on newer undici (the .catch(noop)
// silently swallows it, returning 0 tracks). We hit the v2 API directly.
async function customSoundCloudSearch(query) {
  const raw = await soundcloudSearch.search(query, 25);
  return raw.map(buildSoundCloudTrack);
}

// Spotify: bypasses extractor's broken OAuth request (415 on empty JSON
// body) and its anonymous-token fallback (Cloudflare 403). Uses the
// correct x-www-form-urlencoded Client Credentials flow via fetch.
// Returns [] without credentials so play.js can show its error.
function buildSpotifyTrack(raw) {
  const spExtractor = player?.extractors?.store?.get('com.discord-player.spotifyextractor');
  const track = new Track(player, {
    title: raw.name,
    url: raw.external_urls?.spotify || (raw.id ? `https://open.spotify.com/track/${raw.id}` : ''),
    duration: Util.buildTimeCode(Util.parseMS(raw.duration_ms || 0)),
    description: (raw.artists || []).map((a) => a.name).join(', '),
    thumbnail: raw.album?.images?.[0]?.url || null,
    views: 0,
    author: (raw.artists || [])[0]?.name || 'Unknown Artist',
    source: 'spotify',
    engine: raw,
    metadata: { source: raw, bridge: null },
    requestMetadata: async () => ({ source: raw, bridge: null }),
    cleanTitle: raw.name,
  });
  if (spExtractor) track.extractor = spExtractor;
  return track;
}

async function customSpotifySearch(query) {
  const cfg = botConfig?.music?.spotify || {};
  const clientId = cfg.clientId || process.env.DP_SPOTIFY_CLIENT_ID;
  const clientSecret = cfg.clientSecret || process.env.DP_SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  const raw = await spotifySearch.search(query, clientId, clientSecret);
  return raw.map(buildSpotifyTrack);
}

async function search(query, provider = 'auto') {
  if (!player) throw new Error('Player not initialized');
  if (provider === 'soundcloud') return await customSoundCloudSearch(query);
  if (provider === 'spotify') return await customSpotifySearch(query);
  const result = await player.search(query, { searchEngine: mapProviderToQueryType(provider, query) });
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

// Provider helpers live in ./providers (extracted to break a cycle with ./ui/embeds).
const { PROVIDER_META } = require('./providers');

// List every extractor currently registered with the player. Returns an
// empty array before init() or after shutdown().
function listProviders() {
  if (!player || !player.extractors?.store) return [];
  const out = [];
  for (const ext of player.extractors.store.values()) {
    const short = String(ext.identifier || '').replace(/^com\.discord-player\./, '').toLowerCase().replace(/extractor?$/, '');
    const meta = PROVIDER_META[short] || {};
    out.push({
      id: ext.identifier,
      label: meta.label || short || String(ext.identifier),
      needsCredentials: !!meta.needsCredentials,
      note: meta.note || '',
    });
  }
  return out;
}

module.exports = {
  init, shutdown,
  getQueue, search, addTrack,
  pause, resume, skip, stop, shuffle,
  setLoop, setVolume, getVolume, toggleMute,
  getNowPlaying, onQueueUpdate,
  listProviders,
  // Re-exported for callers that already depend on player.js.
  providerLabel: require('./providers').providerLabel,
  trackSourceLabel: require('./providers').trackSourceLabel,
  // Expose for tests / handlers that need direct access.
  _player: () => player,
};
