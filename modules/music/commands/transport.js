// modules/music/commands/transport.js — pause, resume, skip, stop, loop, shuffle.
const { MessageFlags } = require('discord.js');
const player = require('../player');

function inSameVoice(member, botMember) {
  if (!member?.voice?.channel) return false;
  if (!botMember?.voice?.channel) return false;
  return member.voice.channelId === botMember.voice.channelId;
}

function ephemeral(source, content, isLegacy) {
  if (isLegacy) return source.reply(content);
  if (source.replied || source.deferred) return source.followUp({ content, flags: MessageFlags.Ephemeral });
  return source.reply({ content, flags: MessageFlags.Ephemeral });
}

function requireQueue(source, isLegacy) {
  const guildId = isLegacy ? source.guild.id : source.guildId;
  const q = player.getQueue(guildId);
  if (!q) {
    return ephemeral(source, '❌ Nothing is playing right now.', isLegacy);
  }
  if (!inSameVoice(source.member, source.guild.members.me)) {
    return ephemeral(source, '❌ Join the same voice channel to control playback.', isLegacy);
  }
  return null;
}

function pauseCommand() {
  return {
    name: 'pause',
    description: 'Pause the current track',
    data: { name: 'pause', description: 'Pause the current track', options: [] },
    slash: true,
    cooldown: 2,
    permissions: ['@everyone'],
    async execute(interaction) {
      if (requireQueue(interaction, false) !== null) return;
      try { await player.pause(interaction.guildId); return ephemeral(interaction, '⏸ Paused.', false); }
      catch (e) { console.error('[music] pause:', e.message); return ephemeral(interaction, '❌ Could not pause.', false); }
    },
    legacy: true,
    async legacyExecute(message) {
      if (requireQueue(message, true) !== null) return;
      try { await player.pause(message.guild.id); return message.reply('⏸ Paused.'); }
      catch (e) { console.error('[music] pause:', e.message); return message.reply('❌ Could not pause.'); }
    },
  };
}

function resumeCommand() {
  return {
    name: 'resume',
    description: 'Resume the current track',
    data: { name: 'resume', description: 'Resume the current track', options: [] },
    slash: true,
    cooldown: 2,
    permissions: ['@everyone'],
    async execute(interaction) {
      if (requireQueue(interaction, false) !== null) return;
      try { await player.resume(interaction.guildId); return ephemeral(interaction, '▶ Resumed.', false); }
      catch (e) { console.error('[music] resume:', e.message); return ephemeral(interaction, '❌ Could not resume.', false); }
    },
    legacy: true,
    async legacyExecute(message) {
      if (requireQueue(message, true) !== null) return;
      try { await player.resume(message.guild.id); return message.reply('▶ Resumed.'); }
      catch (e) { console.error('[music] resume:', e.message); return message.reply('❌ Could not resume.'); }
    },
  };
}

function skipCommand() {
  return {
    name: 'skip',
    description: 'Skip the current track (and optionally more)',
    data: {
      name: 'skip',
      description: 'Skip the current track (and optionally more)',
      options: [
        { name: 'count', description: 'How many tracks to skip (1-25, default 1)', type: 4, required: false, min_value: 1, max_value: 25 },
      ],
    },
    slash: true,
    cooldown: 2,
    permissions: ['@everyone'],
    async execute(interaction) {
      if (requireQueue(interaction, false) !== null) return;
      const count = interaction.options.getInteger('count') ?? 1;
      try { await player.skip(interaction.guildId, count); return ephemeral(interaction, `⏭ Skipped ${count}.`, false); }
      catch (e) { console.error('[music] skip:', e.message); return ephemeral(interaction, '❌ Could not skip.', false); }
    },
    legacy: true,
    async legacyExecute(message, args) {
      if (requireQueue(message, true) !== null) return;
      const count = Math.max(1, Math.min(25, parseInt(args[0], 10) || 1));
      try { await player.skip(message.guild.id, count); return message.reply(`⏭ Skipped ${count}.`); }
      catch (e) { console.error('[music] skip:', e.message); return message.reply('❌ Could not skip.'); }
    },
  };
}

function stopCommand() {
  return {
    name: 'stop',
    description: 'Stop playback and leave the voice channel',
    data: { name: 'stop', description: 'Stop playback and leave the voice channel', options: [] },
    slash: true,
    cooldown: 2,
    permissions: ['@everyone'],
    async execute(interaction) {
      const guildId = interaction.guildId;
      if (!player.getQueue(guildId)) return ephemeral(interaction, '❌ Nothing is playing right now.', false);
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, '❌ Join the same voice channel to stop playback.', false);
      }
      try { await player.stop(guildId); return ephemeral(interaction, '⏹ Stopped.', false); }
      catch (e) { console.error('[music] stop:', e.message); return ephemeral(interaction, '❌ Could not stop.', false); }
    },
    legacy: true,
    async legacyExecute(message) {
      const guildId = message.guild.id;
      if (!player.getQueue(guildId)) return message.reply('❌ Nothing is playing right now.');
      if (!inSameVoice(message.member, message.guild.members.me)) {
        return message.reply('❌ Join the same voice channel to stop playback.');
      }
      try { await player.stop(guildId); return message.reply('⏹ Stopped.'); }
      catch (e) { console.error('[music] stop:', e.message); return message.reply('❌ Could not stop.'); }
    },
  };
}

function loopCommand() {
  return {
    name: 'loop',
    description: 'Set the loop mode',
    data: {
      name: 'loop',
      description: 'Set the loop mode',
      options: [
        {
          name: 'mode', description: 'Loop mode', type: 3, required: true,
          choices: [
            { name: 'Off', value: 'off' },
            { name: 'Track', value: 'track' },
            { name: 'Queue', value: 'queue' },
          ],
        },
      ],
    },
    slash: true,
    cooldown: 2,
    permissions: ['@everyone'],
    async execute(interaction) {
      const mode = interaction.options.getString('mode');
      try {
        player.setLoop(interaction.guildId, mode);
        return ephemeral(interaction, `🔁 Loop: ${mode}`, false);
      } catch (e) { console.error('[music] loop:', e.message); return ephemeral(interaction, '❌ Could not set loop mode.', false); }
    },
    legacy: true,
    async legacyExecute(message, args) {
      const mode = (args[0] || '').toLowerCase();
      if (!['off', 'track', 'queue'].includes(mode)) return message.reply('Usage: `!loop <off|track|queue>`');
      try { player.setLoop(message.guild.id, mode); return message.reply(`🔁 Loop: ${mode}`); }
      catch (e) { console.error('[music] loop:', e.message); return message.reply('❌ Could not set loop mode.'); }
    },
  };
}

function shuffleCommand() {
  return {
    name: 'shuffle',
    description: 'Shuffle the queue',
    data: { name: 'shuffle', description: 'Shuffle the queue', options: [] },
    slash: true,
    cooldown: 2,
    permissions: ['@everyone'],
    async execute(interaction) {
      if (requireQueue(interaction, false) !== null) return;
      try { await player.shuffle(interaction.guildId); return ephemeral(interaction, '🔀 Queue shuffled.', false); }
      catch (e) { console.error('[music] shuffle:', e.message); return ephemeral(interaction, '❌ Could not shuffle.', false); }
    },
    legacy: true,
    async legacyExecute(message) {
      if (requireQueue(message, true) !== null) return;
      try { await player.shuffle(message.guild.id); return message.reply('🔀 Queue shuffled.'); }
      catch (e) { console.error('[music] shuffle:', e.message); return message.reply('❌ Could not shuffle.'); }
    },
  };
}

module.exports = {
  getCommands: () => [pauseCommand(), resumeCommand(), skipCommand(), stopCommand(), loopCommand(), shuffleCommand()],
};
