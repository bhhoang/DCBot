// modules/music/index.js — thin orchestrator. Logic lives in sibling files.
const router = require('./interactions/router');

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
    router.bind(client, bot);
    console.log('Music module initialized successfully!');
  },

  async shutdown() {
    console.log('Music module shutting down...');
    router.unbind();
    console.log('Music module shut down successfully!');
  },

  commands: [],  // populated by later tasks
  events: [],    // populated by later tasks
};
