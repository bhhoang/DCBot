// modules/music/interactions/modals.js — volume modal handlers.
const { MessageFlags } = require('discord.js');
const player = require('../player');
const { volumeModal } = require('../ui/components');
const { musicEmojiStr } = require('../ui/icons');

async function openVolumeModal(interaction) {
  return interaction.showModal(volumeModal());
}

async function handleVolumeSubmit(interaction, bot) {
  const guildId = interaction.guildId;
  const raw = interaction.fields.getTextInputValue('music:vol:set:value').trim();
  const level = parseInt(raw, 10);
  if (Number.isNaN(level) || level < 0 || level > 200) {
    // Discord modals always close on submit; we reply with an ephemeral error
    // and the user can re-open via the Now Playing button.
    return interaction.reply({
      content: `${musicEmojiStr('cancel', '✕')} Invalid volume "${raw}". Must be an integer 0-200.`,
      flags: MessageFlags.Ephemeral,
    });
  }
  try {
    player.setVolume(guildId, level);
    // Refresh the persistent Now Playing message so the embed footer shows
    // the new volume. setVolume has no player event we can subscribe to, so
    // we trigger the refresh from the caller.
    await player.onQueueUpdate(guildId);
    return interaction.reply({ content: `🔊 Volume: ${level}%`, flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('[music] volume set error:', error.message);
    return interaction.reply({ content: `${musicEmojiStr('cancel', '✕')} Could not set volume.`, flags: MessageFlags.Ephemeral });
  }
}

module.exports = { openVolumeModal, handleVolumeSubmit };