// modules/music/interactions/selects.js — search-pick and queue-remove handlers.
const { MessageFlags } = require('discord.js');
const state = require('../state');
const player = require('../player');
const { queueEmbed } = require('../ui/embeds');
const { queueRows, IDS } = require('../ui/components');

async function sendQueueView(interaction, pageIndex) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const q = player.getQueue(guildId);
  if (!q) {
    const opts = { content: 'Queue is empty.', embeds: [], components: [], flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) return interaction.followUp(opts).catch(() => {});
    return interaction.update ? interaction.update(opts) : interaction.reply(opts);
  }
  const tracks = q.tracks.data;
  const totalPages = Math.max(1, Math.ceil(tracks.length / 10));
  const safePage = Math.max(0, Math.min(pageIndex, totalPages - 1));
  const embed = queueEmbed(tracks, safePage, totalPages);
  const rows = queueRows(tracks, safePage, totalPages, userId);
  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  return interaction.update
    ? interaction.update({ embeds: [embed], components: rows })
    : interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
}

async function handle(interaction, bot) {
  const id = interaction.customId;
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  // Search pick
  if (id.startsWith(IDS.SEARCH_PICK)) {
    const ownerId = id.slice(IDS.SEARCH_PICK.length);
    if (ownerId !== userId) return;
    const picker = state.getPicker(userId);
    if (!picker) return interaction.update({ content: '⏰ Picker expired.', embeds: [], components: [] });
    const trackIndex = parseInt(interaction.values[0], 10);
    const track = picker.tracks[trackIndex];
    if (!track) return interaction.update({ content: '❌ Invalid selection.', embeds: [], components: [] });

    // Need a voice channel to queue the track. Picker does not guarantee the user
    // is still in a voice channel — re-check.
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      return interaction.update({ content: '❌ Join a voice channel to play tracks.', embeds: [], components: [] });
    }

    try {
      await player.addTrack(guildId, voiceChannel, track, interaction.user);
      state.clearPicker(userId);
      // Create Now Playing message on first track.
      const s = state.getOrCreate(guildId);
      if (!s.nowPlayingMessage) {
        const sent = await interaction.channel.send({
          embeds: [require('../ui/embeds').nowPlayingEmbed(track, interaction.user.username, s.loopMode, s.volume)],
          components: require('../ui/components').nowPlayingRows(s.loopMode, s.volume, false, false),
        });
        s.nowPlayingMessage = { channelId: sent.channelId, messageId: sent.id };
      }
      return interaction.update({ content: `✅ Queued: **${track.title}**`, embeds: [], components: [] });
    } catch (error) {
      console.error('[music] addTrack error:', error.message);
      return interaction.update({ content: '❌ Could not queue that track.', embeds: [], components: [] });
    }
  }

  // Queue remove
  if (id.startsWith(IDS.QUEUE_REMOVE)) {
    const ownerId = id.slice(IDS.QUEUE_REMOVE.length);
    if (ownerId !== userId) return;
    const q = player.getQueue(guildId);
    if (!q) return interaction.update({ content: 'Queue is empty.', embeds: [], components: [] });
    const trackIndex = parseInt(interaction.values[0], 10);
    const tracks = q.tracks.data;
    if (trackIndex < 0 || trackIndex >= tracks.length) {
      return interaction.update({ content: '❌ Invalid selection.', embeds: [], components: [] });
    }
    const removed = tracks[trackIndex];
    q.tracks.remove(trackIndex);
    return interaction.update({
      embeds: [queueEmbed(q.tracks.data, 0, Math.max(1, Math.ceil(q.tracks.data.length / 10)))],
      components: queueRows(q.tracks.data, 0, Math.max(1, Math.ceil(q.tracks.data.length / 10)), userId),
      content: `🗑 Removed: **${removed.title}**`,
    });
  }
}

module.exports = { handle, sendQueueView };
