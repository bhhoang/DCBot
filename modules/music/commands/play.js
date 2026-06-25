// modules/music/commands/play.js — search + ephemeral picker. No auto-add.
const { MessageFlags, PermissionsBitField } = require('discord.js');
const player = require('../player');
const state = require('../state');
const { searchEmbed } = require('../ui/embeds');
const { searchRows } = require('../ui/components');
const { musicEmojiStr } = require('../ui/icons');

// Pure: build the "queued" reply string for the URL fast-path. Single track vs
// playlist. Exported for tests.
function queuedReply(track, playlist) {
  const check = musicEmojiStr('check', '✓');
  if (playlist && playlist.title) {
    return `${check} Queued ${playlist.tracks?.length ?? '?'} tracks from **${playlist.title}**`;
  }
  return `${check} Queued: **${track.title}**`;
}

async function runSearch(source, query, isLegacy, provider = 'auto') {
  // Voice channel check
  const member = isLegacy ? source.member : source.member;
  const voiceChannel = member?.voice?.channel;
  if (!voiceChannel) {
    const content = `${musicEmojiStr('cancel', '✕')} Join a voice channel first.`;
    if (isLegacy) return source.reply(content);
    return source.reply({ content, flags: MessageFlags.Ephemeral });
  }
  const botMember = source.guild.members.me;
  const perms = voiceChannel.permissionsFor(botMember);
  if (!perms.has(PermissionsBitField.Flags.Connect) || !perms.has(PermissionsBitField.Flags.Speak)) {
    const content = `${musicEmojiStr('cancel', '✕')} I need Connect + Speak permissions in your voice channel.`;
    if (isLegacy) return source.reply(content);
    return source.reply({ content, flags: MessageFlags.Ephemeral });
  }

  // URL fast-path: a pasted media URL is an already-made decision, so skip the
  // picker and queue it (the whole playlist, if it is one). Text queries fall
  // through to the picker below.
  if (player.isUrlQuery(query)) {
    let statusMsg = null;
    if (isLegacy) statusMsg = await source.reply('🔍 Resolving...');
    else await source.deferReply({ flags: MessageFlags.Ephemeral });
    let resolved;
    try {
      resolved = await player.resolve(query, provider);
    } catch (error) {
      console.error('[music] resolve error:', error.message);
      const content = `${musicEmojiStr('cancel', '✕')} Couldn't load: ${query}`;
      if (isLegacy) return statusMsg.edit(content);
      return source.editReply({ content });
    }
    const { tracks, playlist } = resolved;
    if (!tracks || tracks.length === 0) {
      const content = `${musicEmojiStr('cancel', '✕')} No results for: ${query}`;
      if (isLegacy) return statusMsg.edit(content);
      return source.editReply({ content });
    }
    try {
      await player.addTracks(source.guild.id, voiceChannel, tracks, source.user);
      const first = tracks[0];
      await require('../ui/embeds').ensureNowPlayingMessage(source.channel, source.guild.id, first);
      const content = queuedReply(first, playlist);
      if (isLegacy) return statusMsg.edit(content);
      return source.editReply({ content });
    } catch (error) {
      console.error('[music] addTracks error:', error.message);
      const content = `${musicEmojiStr('cancel', '✕')} Could not queue that.`;
      if (isLegacy) return statusMsg.edit(content);
      return source.editReply({ content });
    }
  }

  // Defer (legacy uses a status message).
  let statusMsg = null;
  if (isLegacy) {
    statusMsg = await source.reply('🔍 Searching...');
  } else {
    await source.deferReply({ flags: MessageFlags.Ephemeral });
  }

  let tracks;
  try {
    tracks = await player.search(query, provider);
  } catch (error) {
    console.error('[music] search error:', error.message);
    const content = `${musicEmojiStr('cancel', '✕')} Couldn't search: ${query}`;
    if (isLegacy) return statusMsg.edit(content);
    return source.editReply({ content });
  }

  if (!tracks || tracks.length === 0) {
    let content = `${musicEmojiStr('cancel', '✕')} No results for: ${query}`;
    if (provider === 'spotify') {
      // Spotify's anonymous token endpoint is blocked by Cloudflare; search
      // returns 0 unless config.music.spotify.clientId/clientSecret are set.
      content = `${musicEmojiStr('cancel', '✕')} No Spotify results for: ${query}\n` +
        'Spotify search needs `config.music.spotify.clientId` and `clientSecret`. ' +
        'Get them at https://developer.spotify.com/dashboard and add them to config/config.json.';
    }
    if (isLegacy) return statusMsg.edit(content);
    return source.editReply({ content });
  }

  // Limit picker to 25 tracks (5 pages × 5). discord-player returns the full
  // match set; we trim the rest.
  const trimmed = tracks.slice(0, 25);
  const totalPages = Math.ceil(trimmed.length / 5);
  const picker = {
    userId: source.user.id,
    guildId: source.guild.id,
    channelId: source.channel.id,
    messageId: null, // filled below
    query,
    provider, // user-selected provider; 'auto' = no filter
    tracks: trimmed,
    pageIndex: 0,
  };

  const embed = searchEmbed(query, 0, totalPages, trimmed, provider);
  const rows = searchRows(picker, 0, totalPages);
  let sent;
  if (isLegacy) {
    sent = await source.channel.send({ embeds: [embed], components: rows });
  } else {
    sent = await source.editReply({ embeds: [embed], components: rows });
  }
  picker.messageId = sent.id;
  state.setPicker(source.user.id, picker);
}

module.exports = {
  _queuedReply: queuedReply,
  getCommand: () => ({
    name: 'play',
    description: 'Play a song from YouTube, Spotify, or SoundCloud (shows a picker)',
    data: {
      name: 'play',
      description: 'Play a song from YouTube, Spotify, or SoundCloud (shows a picker)',
      options: [
        { name: 'query', description: 'Song title, or URL from YouTube/Spotify/SoundCloud', type: 3, required: true },
        {
          name: 'provider',
          description: 'Which provider to search (default: auto)',
          type: 3,
          required: false,
          choices: [
            { name: 'Auto (all providers)', value: 'auto' },
            { name: 'YouTube', value: 'youtube' },
            { name: 'Spotify', value: 'spotify' },
            { name: 'SoundCloud', value: 'soundcloud' },
          ],
        },
      ],
    },
    slash: true,
    cooldown: 3,
    permissions: ['@everyone'],
    async execute(interaction, bot) {
      const query = interaction.options.getString('query');
      const provider = interaction.options.getString('provider') || 'auto';
      return runSearch(interaction, query, false, provider);
    },
    legacy: true,
    async legacyExecute(message, args, bot) {
      const query = args.join(' ');
      if (!query) return message.reply(`${musicEmojiStr('cancel', '✕')} Provide a song name or URL.`);
      return runSearch(message, query, true, 'auto');
    },
  }),
};