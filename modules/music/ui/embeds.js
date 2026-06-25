// modules/music/ui/embeds.js — pure embed builders + the refreshNowPlaying
// helper that player events call. No side effects except the edit in
// refreshNowPlaying itself.
const { EmbedBuilder, Colors } = require('discord.js');
const { trackSourceLabel, providerDisplayName } = require('../providers');
const state = require('../state');
const { nowPlayingRows, emptyNowPlayingRows, disconnectedNowPlayingRows } = require('./components');
const { musicEmojiStr } = require('./icons');

function formatDuration(input) {
  if (input === undefined || input === null || input === '') return 'unknown';
  if (input === 'live' || input === 'LIVE') return 'live';

  // 1) Number: milliseconds (the conventional shape via durationMS).
  if (typeof input === 'number') {
    if (Number.isNaN(input) || input <= 0) return 'live';
    return formatHMS(Math.floor(input / 1000));
  }

  if (typeof input !== 'string') return 'unknown';

  // 2) ISO 8601 duration: PT3M33S, PT1H2M3S, PT0S, ...
  if (/^P(T.*)?$/.test(input)) {
    const m = input.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return 'live';
    const h = parseInt(m[1] || '0', 10);
    const min = parseInt(m[2] || '0', 10);
    const s = parseInt(m[3] || '0', 10);
    const totalSec = h * 3600 + min * 60 + s;
    if (totalSec === 0) return 'live';
    return formatHMS(totalSec);
  }

  // 3) H:MM:SS / MM:SS / HH:MM:SS (the conventional Track.duration string).
  if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(input)) {
    const parts = input.split(':').map((p) => parseInt(p, 10));
    if (parts.some(Number.isNaN)) return 'unknown';
    let totalSec = 0;
    for (const p of parts) totalSec = totalSec * 60 + p;
    if (totalSec === 0) return 'live';
    return formatHMS(totalSec);
  }

  return 'unknown';
}

function formatHMS(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Format the duration of a discord-player Track. Prefers the numeric
// `durationMS` field when present; falls back to the `duration` string
// (canonical H:MM:SS or ISO 8601).
function formatTrackDuration(track) {
  if (!track) return 'unknown';
  if (typeof track.durationMS === 'number' && track.durationMS > 0) {
    return formatDuration(track.durationMS);
  }
  return formatDuration(track.duration);
}

function nowPlayingEmbed(track, requestedBy, loopMode, volume, isPaused = false) {
  const embed = new EmbedBuilder()
    .setTitle(`${musicEmojiStr(isPaused ? 'pause' : 'play', isPaused ? '⏸' : '🎵')} Now Playing`)
    .setDescription(`**${track.title}**`)
    .setColor(isPaused ? Colors.Yellow : Colors.Green)
    .addFields(
      { name: 'Source', value: trackSourceLabel(track), inline: true },
      { name: 'Duration', value: formatTrackDuration(track), inline: true },
      { name: 'Volume', value: `${volume ?? 100}%`, inline: true },
      { name: 'Requested by', value: requestedBy || 'unknown', inline: true },
    );
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

function emptyNowPlayingEmbed() {
  return new EmbedBuilder()
    .setTitle(`${musicEmojiStr('play', '🎵')} Nothing playing`)
    .setDescription('Use `/play <query>` to start a session.')
    .setColor(Colors.Grey);
}

function disconnectedNowPlayingEmbed() {
  return new EmbedBuilder()
    .setTitle(`${musicEmojiStr('play', '🎵')} Disconnected`)
    .setDescription('Voice connection lost. Use `/play` to start a new session.')
    .setColor(Colors.Red);
}

function searchEmbed(query, pageIndex, totalPages, tracks, provider) {
  const lines = tracks.map((t, i) => {
    const idx = pageIndex * 5 + i + 1;
    const source = trackSourceLabel(t);
    return `${idx}. **${t.title}** — ${t.author || 'unknown'} — ${formatTrackDuration(t)} • ${source}`;
  }).join('\n');
  const titleSuffix = provider && provider !== 'auto' ? ` (${providerDisplayName(provider)})` : '';
  return new EmbedBuilder()
    .setTitle(`🔍 Search results${titleSuffix}`)
    .setDescription(`Query: "${query}"\nPage ${pageIndex + 1} of ${totalPages}\n\n${lines}`)
    .setColor(Colors.Blue);
}

function queueEmbed(tracks, pageIndex, totalPages) {
  // Render only this page's 10 tracks — matches queueRows' slice. Mapping the
  // full list overflows Discord's 4096-char description limit on large queues.
  const pageTracks = tracks.slice(pageIndex * 10, pageIndex * 10 + 10);
  const lines = pageTracks.map((t, i) => {
    const idx = pageIndex * 10 + i + 1;
    const requester = t.requestedBy?.username || 'unknown';
    return `${idx}. **${t.title}** — ${formatTrackDuration(t)} — @${requester}`;
  }).join('\n');
  return new EmbedBuilder()
    .setTitle(`${musicEmojiStr('queue', '📜')} Queue — Page ${pageIndex + 1} of ${totalPages}`)
    .setDescription(lines || 'Queue is empty.')
    .setColor(Colors.Blue);
}

function errorEmbed(title, detail) {
  return new EmbedBuilder()
    .setTitle(`${musicEmojiStr('cancel', '✕')} ${title}`)
    .setDescription(detail || 'Please try again.')
    .setColor(Colors.Red);
}

// Richer error for a failed stream: names the track and shows which proxy tier
// was in use, so a silent failure becomes legible instead of dead air. proxyStatus
// is proxyManager.getStatus() => { tier, current(redacted), poolSize, cooldownRemaining }.
function streamErrorEmbed(track, proxyStatus) {
  const title = track?.title ? `**${track.title}**` : 'the current track';
  const embed = new EmbedBuilder()
    .setTitle(`${musicEmojiStr('cancel', '✕')} Stream failed`)
    .setDescription(`Couldn't stream ${title}. Trying the next track if one is queued.`)
    .setColor(Colors.Red);
  if (proxyStatus && proxyStatus.tier) {
    const cd = proxyStatus.cooldownRemaining > 0 ? ` · cooldown ${proxyStatus.cooldownRemaining}s` : '';
    embed.addFields({
      name: 'Proxy',
      value: `tier: ${proxyStatus.tier}${proxyStatus.poolSize ? ` · pool ${proxyStatus.poolSize}` : ''}${cd}`,
      inline: false,
    });
  }
  return embed;
}

// Called by player events. Looks up state, finds the persistent message,
// edits it in place. Silent no-op if state has no message ref (bot may have
// been stopped before the event fires).
async function refreshNowPlaying(queue, track, mode) {
  const guildId = queue.id;
  const s = state.get(guildId);
  if (!s || !s.nowPlayingMessage) return;

  // queue.metadata is built in player.js as { channelId, guildId, volume, loopMode }
  // — no channel field, so always resolve the channel from the saved ref.
  let channel, message;
  try {
    channel = await queue.client?.channels?.fetch?.(s.nowPlayingMessage.channelId);
  } catch { return; }
  if (!channel) return;
  try {
    message = await channel.messages.fetch(s.nowPlayingMessage.messageId);
  } catch {
    // Message deleted — clear the ref so we don't try again.
    s.nowPlayingMessage = null;
    return;
  }

  let embed, rows;
  const isMuted = s.preMuteVolume !== null;
  if (mode === 'empty') {
    embed = emptyNowPlayingEmbed();
    rows = emptyNowPlayingRows();
  } else if (mode === 'disconnected') {
    embed = disconnectedNowPlayingEmbed();
    rows = disconnectedNowPlayingRows();
  } else   if (mode === 'error') {
    const proxyStatus = require('../proxyManager').getStatus();
    embed = streamErrorEmbed(track, proxyStatus);
    rows = nowPlayingRows(s.loopMode, s.volume, /*disabled=*/ true, /*isPaused=*/ false, /*isMuted=*/ isMuted);
  } else {
    // 'playing' or 'paused'
    const requestedBy = track?.requestedBy?.username || 'unknown';
    const isPaused = mode === 'paused';
    embed = nowPlayingEmbed(track, requestedBy, s.loopMode, s.volume, isPaused);
    rows = nowPlayingRows(s.loopMode, s.volume, /*disabled=*/ false, /*isPaused=*/ isPaused, /*isMuted=*/ isMuted);
  }
  await message.edit({ embeds: [embed], components: rows }).catch((err) => {
    // Log the failure so we can diagnose silent UI-update bugs. The channel-fetch
    // and message-fetch errors above are already swallowed intentionally (they
    // can fire if the bot was kicked or the message was deleted); this is the
    // edit call itself failing, which is the operation we care about.
    console.error('[music] refreshNowPlaying message.edit failed:', err.message);
  });
}

// Create the persistent Now Playing message for a guild if one does not already
// exist, storing the ref on state. No-op if a message ref is already set. Returns
// the state's nowPlayingMessage ref. Extracted from the duplicated inline blocks
// in selects.js and the /play URL fast-path.
async function ensureNowPlayingMessage(channel, guildId, track, isPaused = false) {
  const s = state.getOrCreate(guildId);
  if (s.nowPlayingMessage) return s.nowPlayingMessage;
  const sent = await channel.send({
    embeds: [nowPlayingEmbed(track, track.requestedBy?.username, s.loopMode, s.volume, isPaused)],
    components: nowPlayingRows(s.loopMode, s.volume, false, isPaused, s.preMuteVolume !== null),
  });
  s.nowPlayingMessage = { channelId: sent.channelId, messageId: sent.id };
  return s.nowPlayingMessage;
}

module.exports = {
  nowPlayingEmbed, emptyNowPlayingEmbed, disconnectedNowPlayingEmbed,
  searchEmbed, queueEmbed, errorEmbed, streamErrorEmbed,
  refreshNowPlaying, ensureNowPlayingMessage,
  // Exported for tests:
  formatDuration, formatTrackDuration,
};