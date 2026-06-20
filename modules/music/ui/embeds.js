// modules/music/ui/embeds.js — pure embed builders + the refreshNowPlaying
// helper that player events call. No side effects except the edit in
// refreshNowPlaying itself.
const { EmbedBuilder, Colors } = require('discord.js');
const state = require('../state');
const { nowPlayingRows, emptyNowPlayingRows, disconnectedNowPlayingRows } = require('./components');

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

function nowPlayingEmbed(track, requestedBy, loopMode, volume) {
  const embed = new EmbedBuilder()
    .setTitle('🎵 Now Playing')
    .setDescription(`**${track.title}**`)
    .setColor(Colors.Green)
    .addFields(
      { name: 'Duration', value: formatTrackDuration(track), inline: true },
      { name: 'Requested by', value: requestedBy || 'unknown', inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: 'Loop', value: loopMode || 'off', inline: true },
      { name: 'Volume', value: `${volume ?? 100}%`, inline: true },
    );
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

function emptyNowPlayingEmbed() {
  return new EmbedBuilder()
    .setTitle('🎵 Nothing playing')
    .setDescription('Use `/play <query>` to start a session.')
    .setColor(Colors.Grey);
}

function disconnectedNowPlayingEmbed() {
  return new EmbedBuilder()
    .setTitle('🎵 Disconnected')
    .setDescription('Voice connection lost. Use `/play` to start a new session.')
    .setColor(Colors.Red);
}

function searchEmbed(query, pageIndex, totalPages, tracks) {
  const lines = tracks.map((t, i) => {
    const idx = pageIndex * 5 + i + 1;
    return `${idx}. **${t.title}** — ${t.author || 'unknown'} — ${formatTrackDuration(t)}`;
  }).join('\n');
  return new EmbedBuilder()
    .setTitle('🔍 Search results')
    .setDescription(`Query: "${query}"\nPage ${pageIndex + 1} of ${totalPages}\n\n${lines}`)
    .setColor(Colors.Blue);
}

function queueEmbed(tracks, pageIndex, totalPages) {
  const lines = tracks.map((t, i) => {
    const idx = pageIndex * 10 + i + 1;
    const requester = t.requestedBy?.username || 'unknown';
    return `${idx}. **${t.title}** — ${formatTrackDuration(t)} — @${requester}`;
  }).join('\n');
  return new EmbedBuilder()
    .setTitle(`📜 Queue — Page ${pageIndex + 1} of ${totalPages}`)
    .setDescription(lines || 'Queue is empty.')
    .setColor(Colors.Blue);
}

function errorEmbed(title, detail) {
  return new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setDescription(detail || 'Please try again.')
    .setColor(Colors.Red);
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
  if (mode === 'empty') {
    embed = emptyNowPlayingEmbed();
    rows = emptyNowPlayingRows();
  } else if (mode === 'disconnected') {
    embed = disconnectedNowPlayingEmbed();
    rows = disconnectedNowPlayingRows();
  } else   if (mode === 'error') {
    embed = errorEmbed('Playback error', 'The current track failed. Skipping to next if available.');
    rows = nowPlayingRows(s.loopMode, s.volume, /*disabled=*/ true, /*isPaused=*/ false);
  } else {
    // 'playing' or 'paused'
    const requestedBy = track?.requestedBy?.username || 'unknown';
    embed = nowPlayingEmbed(track, requestedBy, s.loopMode, s.volume);
    rows = nowPlayingRows(s.loopMode, s.volume, /*disabled=*/ false, /*isPaused=*/ mode === 'paused');
  }
  await message.edit({ embeds: [embed], components: rows }).catch((err) => {
    // Log the failure so we can diagnose silent UI-update bugs. The channel-fetch
    // and message-fetch errors above are already swallowed intentionally (they
    // can fire if the bot was kicked or the message was deleted); this is the
    // edit call itself failing, which is the operation we care about.
    console.error('[music] refreshNowPlaying message.edit failed:', err.message);
  });
}

module.exports = {
  nowPlayingEmbed, emptyNowPlayingEmbed, disconnectedNowPlayingEmbed,
  searchEmbed, queueEmbed, errorEmbed,
  refreshNowPlaying,
  // Exported for tests:
  formatDuration, formatTrackDuration,
};