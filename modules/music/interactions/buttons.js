// modules/music/interactions/buttons.js — all button handlers, dispatched
// from the router by customId.
const { EmbedBuilder, MessageFlags } = require('discord.js');
const { IDS } = require('../ui/components');
const { nowPlayingEmbed } = require('../ui/embeds');
const { musicEmoji, musicEmojiStr } = require('../ui/icons');
const player = require('../player');
const state = require('../state');
const { sendQueueView } = require('./selects'); // defined in Task 8; forward-declared as export
const { openVolumeModal } = require('./modals'); // defined in Task 9

const interactionsInProgress = new Map();
const LOCK_MS = 1000;

// Per-user "Clear All" confirmations. First click sets a timestamp; second click
// within CLEAR_CONFIRM_MS performs the clear. Mirrors the picker TTL pattern in
// state.js but lives here because it is purely interaction-local.
const pendingConfirms = new Map();
const CLEAR_CONFIRM_MS = 10_000;

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

// Build the embed + components for the persistent Now Playing message in its
// CURRENT state. Reads the queue + state directly so the caller can use this
// for either `interaction.update()` (updating the persistent message in place)
// or `channel.send()` (creating it for the first time).
function renderNowPlaying(guildId) {
  const q = player.getQueue(guildId);
  if (!q) return null;
  const s = state.get(guildId) || state.getOrCreate(guildId);
  const isPaused = q.node.isPaused();
  const isMuted = s.preMuteVolume !== null;
  const track = q.currentTrack;
  const embeds = [nowPlayingEmbed(track, track?.requestedBy?.username, s.loopMode, s.volume, isPaused)];
  const { nowPlayingRows } = require('../ui/components');
  const components = nowPlayingRows(s.loopMode, s.volume, false, isPaused, isMuted);
  return { embeds, components };
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
    //
    // These buttons live on the persistent Now Playing message. We use
    // `interaction.update()` to update THAT message in place — the new
    // button label (Pause↔Resume, volume in footer, etc.) IS the user
    // feedback. This is the canonical Discord.js pattern for buttons-on-
    // a-shared-message: the interaction reply IS the message edit.
    if (id === IDS.NP_PAUSE) {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, `${musicEmojiStr('cancel', '✕')} Join the same voice channel to control playback.`);
      }
      await player.pause(guildId);
      await player.onQueueUpdate(guildId).catch(() => {});
      const rendered = renderNowPlaying(guildId);
      if (!rendered) return ephemeral(interaction, `${musicEmojiStr('cancel', '✕')} Nothing to pause.`);
      return interaction.update(rendered);
    }
    if (id === IDS.NP_RESUME) {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, `${musicEmojiStr('cancel', '✕')} Join the same voice channel to control playback.`);
      }
      await player.resume(guildId);
      await player.onQueueUpdate(guildId).catch(() => {});
      const rendered = renderNowPlaying(guildId);
      if (!rendered) return ephemeral(interaction, `${musicEmojiStr('cancel', '✕')} Nothing to resume.`);
      return interaction.update(rendered);
    }
    if (id === IDS.NP_SKIP_1) {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, `${musicEmojiStr('cancel', '✕')} Join the same voice channel to control playback.`);
      }
      await player.skip(guildId, 1);
      const rendered = renderNowPlaying(guildId);
      if (!rendered) return ephemeral(interaction, '⏹ Queue empty.');
      return interaction.update(rendered);
    }
    if (id === 'music:np:stop') {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, `${musicEmojiStr('cancel', '✕')} Join the same voice channel to stop playback.`);
      }
      await player.stop(guildId);
      // stop() deletes the queue and clears state; the EmptyQueue event
      // will render the empty embed and update the persistent message.
      // For the button click response, send a minimal ack with the new
      // (empty) state — we need at least one embed for Discord to accept
      // the update.
      return interaction.update({
        embeds: [new EmbedBuilder().setTitle(`${musicEmojiStr('stop', '🎵')} Nothing playing`).setDescription('Use `/play <query>` to start a new session.').setColor(0x95a5a6)],
        components: [],
      });
    }
    if (id === IDS.NP_LOOP) {
      const s = state.getOrCreate(guildId);
      const next = s.loopMode === 'off' ? 'track' : s.loopMode === 'track' ? 'queue' : 'off';
      player.setLoop(guildId, next);
      const rendered = renderNowPlaying(guildId);
      if (!rendered) return ephemeral(interaction, `🔁 Loop: ${next}`);
      return interaction.update(rendered);
    }
    if (id === IDS.NP_SHUFFLE) {
      if (!inSameVoice(interaction.member, interaction.guild.members.me)) {
        return ephemeral(interaction, `${musicEmojiStr('cancel', '✕')} Join the same voice channel to shuffle.`);
      }
      await player.shuffle(guildId);
      const rendered = renderNowPlaying(guildId);
      if (!rendered) return ephemeral(interaction, '🔀 Queue shuffled.');
      return interaction.update(rendered);
    }
    if (id === IDS.NP_QUEUE) {
      return sendQueueView(interaction, 0);
    }
    if (id === IDS.NP_VOL_DOWN) {
      const s = state.getOrCreate(guildId);
      const next = Math.max(0, s.volume - 10);
      player.setVolume(guildId, next);
      const rendered = renderNowPlaying(guildId);
      if (!rendered) return ephemeral(interaction, `🔉 Volume: ${next}%`);
      return interaction.update(rendered);
    }
    if (id === IDS.NP_VOL_UP) {
      const s = state.getOrCreate(guildId);
      const next = Math.min(200, s.volume + 10);
      player.setVolume(guildId, next);
      const rendered = renderNowPlaying(guildId);
      if (!rendered) return ephemeral(interaction, `🔊 Volume: ${next}%`);
      return interaction.update(rendered);
    }
    if (id === IDS.NP_VOL_MUTE) {
      const r = player.toggleMute(guildId);
      const rendered = renderNowPlaying(guildId);
      if (!rendered) return ephemeral(interaction, r.isMuted ? '🔇 Muted.' : `🔊 Volume: ${r.level}%`);
      return interaction.update(rendered);
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
        embeds: [searchEmbed(picker.query, picker.pageIndex, totalPages, picker.tracks, picker.provider)],
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
        embeds: [searchEmbed(picker.query, picker.pageIndex, totalPages, picker.tracks, picker.provider)],
        components: searchRows(picker, picker.pageIndex, totalPages),
      });
      return;
    }
    if (id.startsWith(IDS.SEARCH_CANCEL)) {
      const ownerId = id.slice(IDS.SEARCH_CANCEL.length);
      if (ownerId !== userId) return;
      state.clearPicker(userId);
      // Delete the ephemeral search-picker message rather than replacing
      // it with empty content. Discord rejects empty updates with code 50006.
      return interaction.message.delete().catch(() => {
        return interaction.update({
          content: '✖ Search cancelled.',
          embeds: [],
          components: [],
        });
      });
    }

    // === Queue view (userId in customId) ===
    if (id.startsWith(IDS.QUEUE_PAGE_PREV)) {
      const [ownerId, page] = id.slice(IDS.QUEUE_PAGE_PREV.length).split(':');
      if (ownerId !== userId) return;
      return sendQueueView(interaction, parseInt(page, 10) || 0);
    }
    if (id.startsWith(IDS.QUEUE_PAGE_NEXT)) {
      const [ownerId, page] = id.slice(IDS.QUEUE_PAGE_NEXT.length).split(':');
      if (ownerId !== userId) return;
      return sendQueueView(interaction, parseInt(page, 10) || 0);
    }
    if (id.startsWith(IDS.QUEUE_CLOSE)) {
      const ownerId = id.slice(IDS.QUEUE_CLOSE.length);
      if (ownerId !== userId) return;
      // Delete the ephemeral queue-view message. Discord rejects empty
      // updates ({content, embeds: [], components: []}), so we must
      // actually delete the message instead of replacing it with nothing.
      return interaction.message.delete().catch(() => {
        // Fallback: if delete fails (e.g., missing permissions), at least
        // acknowledge the click so the user doesn't see "interaction failed".
        return interaction.update({
          content: '✖ Queue view closed.',
          embeds: [],
          components: [],
        });
      });
    }
    if (id.startsWith(IDS.QUEUE_CLEAR)) {
      const ownerId = id.slice(IDS.QUEUE_CLEAR.length);
      if (ownerId !== userId) return;
      const now = Date.now();
      const pending = pendingConfirms.get(userId);
      if (pending && now - pending < CLEAR_CONFIRM_MS) {
        // Confirmed within window — actually clear.
        pendingConfirms.delete(userId);
        const q = player.getQueue(guildId);
        if (!q) return ephemeral(interaction, 'Queue is already empty.');
        q.tracks.clear();
        return ephemeral(interaction, '🗑 Queue cleared.');
      }
      // First click (or window expired) — ask for confirmation.
      pendingConfirms.set(userId, now);
      setTimeout(() => {
        // Best-effort cleanup if the user never confirmed in time.
        if (pendingConfirms.get(userId) === now) pendingConfirms.delete(userId);
      }, CLEAR_CONFIRM_MS);
      return ephemeral(interaction, '⚠️ Are you sure? Click **Clear All** again within 10s to confirm.');
    }
  } catch (error) {
    console.error('[music] button handler error:', error.message);
    return ephemeral(interaction, `${musicEmojiStr('cancel', '✕')} Something went wrong.`);
  }
}

module.exports = { handle };