// modules/music/commands/play.js — search + ephemeral picker. No auto-add.
const { MessageFlags, PermissionsBitField } = require('discord.js');
const player = require('../player');
const state = require('../state');
const { searchEmbed } = require('../ui/embeds');
const { searchRows } = require('../ui/components');
const { musicEmojiStr } = require('../ui/icons');

async function runSearch(source, query, isLegacy) {
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

  // Defer (legacy uses a status message).
  let statusMsg = null;
  if (isLegacy) {
    statusMsg = await source.reply('🔍 Searching...');
  } else {
    await source.deferReply({ flags: MessageFlags.Ephemeral });
  }

  let tracks;
  try {
    tracks = await player.search(query);
  } catch (error) {
    console.error('[music] search error:', error.message);
    const content = `${musicEmojiStr('cancel', '✕')} Couldn't search: ${query}`;
    if (isLegacy) return statusMsg.edit(content);
    return source.editReply({ content });
  }

  if (!tracks || tracks.length === 0) {
    const content = `${musicEmojiStr('cancel', '✕')} No results for: ${query}`;
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
    tracks: trimmed,
    pageIndex: 0,
  };

  const embed = searchEmbed(query, 0, totalPages, trimmed);
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
  getCommand: () => ({
    name: 'play',
    description: 'Play a song from YouTube (shows a picker)',
    data: {
      name: 'play',
      description: 'Play a song from YouTube (shows a picker)',
      options: [
        { name: 'query', description: 'Song title or URL', type: 3, required: true },
      ],
    },
    slash: true,
    cooldown: 3,
    permissions: ['@everyone'],
    async execute(interaction, bot) {
      const query = interaction.options.getString('query');
      return runSearch(interaction, query, false);
    },
    legacy: true,
    async legacyExecute(message, args, bot) {
      const query = args.join(' ');
      if (!query) return message.reply(`${musicEmojiStr('cancel', '✕')} Provide a song name or URL.`);
      return runSearch(message, query, true);
    },
  }),
};