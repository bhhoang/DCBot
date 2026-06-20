// modules/music/interactions/router.js — single interactionCreate handler
// that dispatches by customId prefix. Listener registration is owned by the
// module's `events` array; this file only exports the handler function.
const buttons = require('./buttons');
const selects = require('./selects');
const modals = require('./modals');

const PREFIX = 'music:';

async function handleInteraction(interaction, bot) {
  if (!interaction.customId || !interaction.customId.startsWith(PREFIX)) return;
  if (interaction.isModalSubmit() && interaction.customId === 'music:vol:set:submit') {
    return modals.handleVolumeSubmit(interaction, bot);
  }
  if (interaction.isButton()) {
    return buttons.handle(interaction, bot);
  }
  if (interaction.isStringSelectMenu()) {
    return selects.handle(interaction, bot);
  }
}

module.exports = { handleInteraction, PREFIX };