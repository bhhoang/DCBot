// modules/music/ui/embeds.js — pure embed builders + the refreshNowPlaying
// helper that player events call. No side effects except the edit in
// refreshNowPlaying itself.
const { EmbedBuilder, Colors } = require('discord.js');
const state = require('../state');
const { nowPlayingRows, emptyNowPlayingRows, disconnectedNowPlayingRows } = require('./components');

function formatDuration(ms) {
  if (!ms || ms === 'unknown') return 'unknown';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function nowPlayingEmbed(track, requestedBy, loopMode, volume) {
  const embed = new EmbedBuilder()
    .setTitle('🎵 Now Playing')
    .setDescription(`**${track.title}**`)
    .setColor(Colors.Green)
    .addFields(
      { name: 'Duration', value: formatDuration(track.duration), inline: true },
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
    return `${idx}. **${t.title}** — ${t.author || 'unknown'} — ${formatDuration(t.duration)}`;
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
    return `${idx}. **${t.title}** — ${formatDuration(t.duration)} — @${requester}`;
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
  await message.edit({ embeds: [embed], components: rows }).catch(() => {});
}

module.exports = {
  nowPlayingEmbed, emptyNowPlayingEmbed, disconnectedNowPlayingEmbed,
  searchEmbed, queueEmbed, errorEmbed,
  refreshNowPlaying,
  // Exported for tests:
  formatDuration,
};