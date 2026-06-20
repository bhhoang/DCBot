// modules/music/commands/queue.js — /queue, /volume, /nowplaying.
const { MessageFlags } = require('discord.js');
const player = require('../player');
const state = require('../state');
const { sendQueueView } = require('../interactions/selects');
const { nowPlayingEmbed } = require('../ui/embeds');
const { nowPlayingRows } = require('../ui/components');
const { musicEmojiStr } = require('../ui/icons');

function queueCommand() {
  return {
    name: 'queue',
    description: 'Show the current queue',
    data: { name: 'queue', description: 'Show the current queue', options: [] },
    slash: true,
    cooldown: 0,
    permissions: ['@everyone'],
    async execute(interaction) {
      // Read-only — no voice channel check required.
      return sendQueueView(interaction, 0);
    },
    legacy: true,
    async legacyExecute(message) {
      return sendQueueView(message, 0);
    },
  };
}

function volumeCommand() {
  return {
    name: 'volume',
    description: 'Show or set the playback volume (0-200)',
    data: {
      name: 'volume',
      description: 'Show or set the playback volume (0-200)',
      options: [
        { name: 'level', description: 'Volume level (0-200)', type: 4, required: false, min_value: 0, max_value: 200 },
      ],
    },
    slash: true,
    cooldown: 0,
    permissions: ['@everyone'],
    async execute(interaction) {
      const guildId = interaction.guildId;
      const level = interaction.options.getInteger('level');
      if (level === null) {
        const v = player.getVolume(guildId);
        return interaction.reply({ content: `🔊 Volume: ${v.level}%${v.isMuted ? ' (muted)' : ''}`, flags: MessageFlags.Ephemeral });
      }
      // Setter path: requires queue + voice channel.
      const q = player.getQueue(guildId);
      if (!q) return interaction.reply({ content: `${musicEmojiStr('cancel', '✕')} Nothing is playing right now.`, flags: MessageFlags.Ephemeral });
      const member = interaction.member;
      const botMember = interaction.guild.members.me;
      if (!member?.voice?.channel || member.voice.channelId !== botMember?.voice?.channelId) {
        return interaction.reply({ content: `${musicEmojiStr('cancel', '✕')} Join the same voice channel to change volume.`, flags: MessageFlags.Ephemeral });
      }
      try {
        player.setVolume(guildId, level);
        await player.onQueueUpdate(guildId);
        return interaction.reply({ content: `🔊 Volume: ${level}%`, flags: MessageFlags.Ephemeral });
      } catch (e) {
        console.error('[music] volume:', e.message);
        return interaction.reply({ content: `${musicEmojiStr('cancel', '✕')} Could not set volume.`, flags: MessageFlags.Ephemeral });
      }
    },
    legacy: true,
    async legacyExecute(message, args) {
      if (!args[0]) {
        const v = player.getVolume(message.guild.id);
        return message.reply(`🔊 Volume: ${v.level}%${v.isMuted ? ' (muted)' : ''}`);
      }
      const level = parseInt(args[0], 10);
      if (Number.isNaN(level) || level < 0 || level > 200) return message.reply('Usage: `!volume [0-200]`');
      const q = player.getQueue(message.guild.id);
      if (!q) return message.reply(`${musicEmojiStr('cancel', '✕')} Nothing is playing right now.`);
      const botMember = message.guild.members.me;
      if (!message.member?.voice?.channel || message.member.voice.channelId !== botMember?.voice?.channelId) {
        return message.reply(`${musicEmojiStr('cancel', '✕')} Join the same voice channel to change volume.`);
      }
      try {
        player.setVolume(message.guild.id, level);
        await player.onQueueUpdate(message.guild.id);
        return message.reply(`🔊 Volume: ${level}%`);
      }
      catch (e) { console.error('[music] volume:', e.message); return message.reply(`${musicEmojiStr('cancel', '✕')} Could not set volume.`); }
    },
  };
}

function nowPlayingCommand() {
  return {
    name: 'nowplaying',
    description: 'Re-post the persistent Now Playing message',
    data: { name: 'nowplaying', description: 'Re-post the persistent Now Playing message', options: [] },
    slash: true,
    cooldown: 0,
    permissions: ['@everyone'],
    async execute(interaction) {
      const guildId = interaction.guildId;
      const q = player.getQueue(guildId);
      if (!q) return interaction.reply({ content: `${musicEmojiStr('cancel', '✕')} Nothing is playing right now.`, flags: MessageFlags.Ephemeral });
      const track = q.currentTrack;
      const s = state.getOrCreate(guildId);
      const embeds = [nowPlayingEmbed(track, track.requestedBy?.username, s.loopMode, s.volume)];
      const components = nowPlayingRows(s.loopMode, s.volume, false, q.node.isPaused(), s.preMuteVolume !== null);
      const channel = interaction.channel;
      // Try to edit the existing persistent message first; only post a new one
      // if there is no ref or the previous message was deleted.
      if (s.nowPlayingMessage) {
        try {
          await channel.messages.edit(s.nowPlayingMessage.messageId, { embeds, components });
          return interaction.reply({ content: `${musicEmojiStr('check', '✓')} Now Playing message updated.`, flags: MessageFlags.Ephemeral });
        } catch { /* fall through to create new */ }
      }
      const oldMessageId = s.nowPlayingMessage?.messageId;
      const sent = await channel.send({ embeds, components });
      s.nowPlayingMessage = { channelId: sent.channelId, messageId: sent.id };
      if (oldMessageId && oldMessageId !== sent.id) {
        channel.messages.delete(oldMessageId).catch(() => {});
      }
      return interaction.reply({ content: `${musicEmojiStr('check', '✓')} Now Playing message posted.`, flags: MessageFlags.Ephemeral });
    },
    legacy: true,
    async legacyExecute(message) {
      const guildId = message.guild.id;
      const q = player.getQueue(guildId);
      if (!q) return message.reply(`${musicEmojiStr('cancel', '✕')} Nothing is playing right now.`);
      const track = q.currentTrack;
      const s = state.getOrCreate(guildId);
      const embeds = [nowPlayingEmbed(track, track.requestedBy?.username, s.loopMode, s.volume)];
      const components = nowPlayingRows(s.loopMode, s.volume, false, q.node.isPaused(), s.preMuteVolume !== null);
      const channel = message.channel;
      if (s.nowPlayingMessage) {
        try {
          await channel.messages.edit(s.nowPlayingMessage.messageId, { embeds, components });
          return message.reply(`${musicEmojiStr('check', '✓')} Now Playing message updated.`);
        } catch { /* fall through to create new */ }
      }
      const oldMessageId = s.nowPlayingMessage?.messageId;
      const sent = await channel.send({ embeds, components });
      s.nowPlayingMessage = { channelId: sent.channelId, messageId: sent.id };
      if (oldMessageId && oldMessageId !== sent.id) {
        channel.messages.delete(oldMessageId).catch(() => {});
      }
      return message.reply(`${musicEmojiStr('check', '✓')} Now Playing message posted.`);
    },
  };
}

module.exports = {
  getCommands: () => [queueCommand(), volumeCommand(), nowPlayingCommand()],
};
