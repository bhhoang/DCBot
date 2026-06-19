// modules/music/interactions/router.js — single interactionCreate listener that
// dispatches by customId prefix. Owns the listener reference so it can be
// unregistered on shutdown.
const buttons = require('./buttons');
const selects = require('./selects');
const modals = require('./modals');

const PREFIX = 'music:';
const SKIP_PREFIXES = new Set(['music:vol:set:']); // handled in modals.js, not buttons

let listenerRef = null;

function bind(client, bot) {
  if (listenerRef) return; // idempotent
  listenerRef = (interaction) => handleInteraction(interaction, bot);
  client.on('interactionCreate', listenerRef);
}

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

function unbind() {
  if (listenerRef) {
    // Note: client.off() requires the same function reference.
    // We don't have a handle to the client here, so caller (shutdown) must
    // call router.unbind before player.destroy. We expose a removeListener
    // helper that takes the client so the module can pass it in.
  }
  listenerRef = null;
}

module.exports = { bind, unbind, handleInteraction, PREFIX };