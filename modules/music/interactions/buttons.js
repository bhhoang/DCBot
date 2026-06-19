// modules/music/interactions/buttons.js — all button handlers, dispatched
// from the router by customId.
const { MessageFlags, PermissionsBitField } = require('discord.js');
const { IDS } = require('../ui/components');
const player = require('../player');
const state = require('../state');
const { sendQueueView } = require('./selects'); // defined in Task 8; forward-declared as export
const { openVolumeModal } = require('./modals'); // defined in Task 9

const interactionsInProgress = new Map();
const LOCK_MS = 1000;

function locked(userId) {
  if (interactionsInProgress.has(userId)) return true;
  interactionsInProgress.set(userId, Date.now());
  setTimeout(() => interactionsInProgress.delete(userId), LOCK_MS);
  return false;
}

function inSameVoice(member, botMember) {
  if (!member?.voice?.channel) return false;
  if (!botMember?.voice?.channel) return false;
  return member.voice.channelId === botMember.voice.channelId;
}

async function ephemeral(interaction, content) {
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  return interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
}

async function handle(interaction, bot) {
  const id = interaction.customId;
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (locked(userId)) {
    return ephemeral(interaction, '⌛ Processing previous action, please wait.');
  }

  try {
    // === Now Playing transport buttons (no userId in customId) ===
    if (id === IDS.NP_PAUSE) {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, '❌ Join the same voice channel to control playback.');
      }
      await player.pause(guildId);
      return ephemeral(interaction, '⏸ Paused.');
    }
    if (id === IDS.NP_RESUME) {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, '❌ Join the same voice channel to control playback.');
      }
      await player.resume(guildId);
      return ephemeral(interaction, '▶ Resumed.');
    }
    if (id === IDS.NP_SKIP_1) {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, '❌ Join the same voice channel to control playback.');
      }
      await player.skip(guildId, 1);
      return ephemeral(interaction, '⏭ Skipped.');
    }
    if (id === 'music:np:stop') {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, '❌ Join the same voice channel to stop playback.');
      }
      await player.stop(guildId);
      return ephemeral(interaction, '⏹ Stopped.');
    }
    if (id === IDS.NP_LOOP) {
      const s = state.getOrCreate(guildId);
      const next = s.loopMode === 'off' ? 'track' : s.loopMode === 'track' ? 'queue' : 'off';
      player.setLoop(guildId, next);
      return ephemeral(interaction, `🔁 Loop: ${next}`);
    }
    if (id === IDS.NP_SHUFFLE) {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, '❌ Join the same voice channel to shuffle.');
      }
      await player.shuffle(guildId);
      return ephemeral(interaction, '🔀 Queue shuffled.');
    }
    if (id === IDS.NP_QUEUE) {
      return sendQueueView(interaction, 0);
    }
    if (id === IDS.NP_VOL_DOWN) {
      const s = state.getOrCreate(guildId);
      const next = Math.max(0, s.volume - 10);
      player.setVolume(guildId, next);
      return ephemeral(interaction, `🔉 Volume: ${next}%`);
    }
    if (id === IDS.NP_VOL_UP) {
      const s = state.getOrCreate(guildId);
      const next = Math.min(200, s.volume + 10);
      player.setVolume(guildId, next);
      return ephemeral(interaction, `🔊 Volume: ${next}%`);
    }
    if (id === IDS.NP_VOL_MUTE) {
      const r = player.toggleMute(guildId);
      return ephemeral(interaction, r.isMuted ? '🔇 Muted.' : `🔊 Volume: ${r.level}%`);
    }
    if (id === IDS.NP_VOL_OPEN) {
      return openVolumeModal(interaction);
    }
    if (id === 'music:np:play_hint') {
      return ephemeral(interaction, 'Use `/play <query>` to start a session.');
    }

    // === Search picker (userId in customId) ===
    if (id.startsWith(IDS.SEARCH_PAGE_PREV)) {
      const ownerId = id.slice(IDS.SEARCH_PAGE_PREV.length);
      if (ownerId !== userId) return; // silent
      const picker = state.getPicker(userId);
      if (!picker) return ephemeral(interaction, '⏰ Picker expired — please /play again.');
      if (picker.pageIndex === 0) return;
      picker.pageIndex -= 1;
      const { searchEmbed } = require('../ui/embeds');
      const { searchRows } = require('../ui/components');
      const totalPages = Math.ceil(picker.tracks.length / 5);
      await interaction.update({
        embeds: [searchEmbed(picker.query, picker.pageIndex, totalPages, picker.tracks)],
        components: searchRows(picker, picker.pageIndex, totalPages),
      });
      return;
    }
    if (id.startsWith(IDS.SEARCH_PAGE_NEXT)) {
      const ownerId = id.slice(IDS.SEARCH_PAGE_NEXT.length);
      if (ownerId !== userId) return;
      const picker = state.getPicker(userId);
      if (!picker) return ephemeral(interaction, '⏰ Picker expired — please /play again.');
      const totalPages = Math.ceil(picker.tracks.length / 5);
      if (picker.pageIndex >= totalPages - 1) return;
      picker.pageIndex += 1;
      const { searchEmbed } = require('../ui/embeds');
      const { searchRows } = require('../ui/components');
      await interaction.update({
        embeds: [searchEmbed(picker.query, picker.pageIndex, totalPages, picker.tracks)],
        components: searchRows(picker, picker.pageIndex, totalPages),
      });
      return;
    }
    if (id.startsWith(IDS.SEARCH_CANCEL)) {
      const ownerId = id.slice(IDS.SEARCH_CANCEL.length);
      if (ownerId !== userId) return;
      state.clearPicker(userId);
      return interaction.update({ content: '✖ Search cancelled.', embeds: [], components: [] });
    }

    // === Queue view (userId in customId) ===
    if (id.startsWith(IDS.QUEUE_PAGE_PREV)) {
      const ownerId = id.slice(IDS.QUEUE_PAGE_PREV.length);
      if (ownerId !== userId) return;
      // Page is encoded in the next segment by the handler; simpler: use a per-user
      // page tracker. For now, re-render at page 0 and let the user navigate.
      // The full implementation uses music:queue:page:prev:<userId>:<page>.
      return sendQueueView(interaction, 0);
    }
    if (id.startsWith(IDS.QUEUE_PAGE_NEXT)) {
      const ownerId = id.slice(IDS.QUEUE_PAGE_NEXT.length);
      if (ownerId !== userId) return;
      return sendQueueView(interaction, 0);
    }
    if (id.startsWith(IDS.QUEUE_CLOSE)) {
      const ownerId = id.slice(IDS.QUEUE_CLOSE.length);
      if (ownerId !== userId) return;
      return interaction.update({ embeds: [], components: [] });
    }
    if (id.startsWith(IDS.QUEUE_CLEAR)) {
      const ownerId = id.slice(IDS.QUEUE_CLEAR.length);
      if (ownerId !== userId) return;
      const q = player.getQueue(guildId);
      if (!q) return ephemeral(interaction, 'Queue is already empty.');
      q.tracks.clear();
      return ephemeral(interaction, '🗑 Queue cleared.');
    }
  } catch (error) {
    console.error('[music] button handler error:', error.message);
    return ephemeral(interaction, '❌ Something went wrong.');
  }
}

module.exports = { handle };