// modules/music/index.js — thin orchestrator. Logic lives in sibling files.
const player = require('./player');
const router = require('./interactions/router');
const playCmd = require('./commands/play');
const transportCmds = require('./commands/transport');
const queueCmds = require('./commands/queue');

module.exports = {
  meta: {
    name: 'music',
    type: 'entertainment',
    version: '3.0.0',
    description: 'Play music from YouTube with search picker, transport controls, queue management',
    dependencies: [],
  },

  async init(client, bot) {
    console.log('Music module initializing...');
    await player.init(client, bot);
    console.log('Music module initialized successfully!');
  },

  async shutdown() {
    console.log('Music module shutting down...');
    await player.shutdown();
    console.log('Music module shut down successfully!');
  },

  commands: [
    playCmd.getCommand(),
    ...transportCmds.getCommands(),
    ...queueCmds.getCommands(),
  ],

  events: [
    { name: 'interactionCreate', execute: router.handleInteraction },
  ],
};