// modules/music/interactions/modals.js — volume modal handlers.
const { MessageFlags } = require('discord.js');
const player = require('../player');
const { volumeModal } = require('../ui/components');

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
      content: `❌ Invalid volume "${raw}". Must be an integer 0-200.`,
      flags: MessageFlags.Ephemeral,
    });
  }
  try {
    player.setVolume(guildId, level);
    return interaction.reply({ content: `🔊 Volume: ${level}%`, flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('[music] volume set error:', error.message);
    return interaction.reply({ content: '❌ Could not set volume.', flags: MessageFlags.Ephemeral });
  }
}

module.exports = { openVolumeModal, handleVolumeSubmit };