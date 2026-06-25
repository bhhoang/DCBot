// Regression: the gemini command's lazy-init path must resolve @google/genai via
// the injected moduleRequire (deps live in modules/.views/gemini/node_modules,
// which native require() never searches), not a bare require().
const { test } = require('node:test');
const assert = require('node:assert');

const geminiModule = require('../modules/gemini');
const geminiCommand = geminiModule.commands.find(c => c.name === 'gemini');

// Fake @google/genai: chats.create(...).sendMessage(...) -> { text }.
function fakeGenaiPkg() {
  return {
    GoogleGenAI: class {
      constructor() {
        this.chats = {
          create: () => ({ sendMessage: async () => ({ text: 'pong' }) })
        };
      }
    }
  };
}

// Stub slash interaction capturing the final reply.
function makeInteraction() {
  const state = { deferred: false, reply: null };
  return {
    state,
    user: { id: 'u1' },
    options: {
      getString: () => 'ping',
      getBoolean: () => false
    },
    async deferReply() { this.state.deferred = true; },
    async editReply(payload) { this.state.reply = payload; },
    async reply(payload) { this.state.reply = payload; }
  };
}

test('gemini execute resolves @google/genai via moduleRequire, not bare require', async () => {
  let requestedId = null;
  const moduleRequire = (id) => {
    requestedId = id;
    if (id === '@google/genai') return fakeGenaiPkg();
    return require(id);
  };

  // Mirror how CommandHandler invokes the command: `this` is the command object,
  // carrying moduleRequire (= module._require) and a fresh, uninitialized ai.
  const ctx = Object.assign(Object.create(geminiCommand), { moduleRequire, ai: null });
  const interaction = makeInteraction();
  const bot = { config: { gemini: { apiKey: 'test-key' } } };

  await geminiCommand.execute.call(ctx, interaction, bot);

  assert.strictEqual(requestedId, '@google/genai', 'expected lazy-init to call moduleRequire("@google/genai")');
  assert.ok(interaction.state.reply?.embeds, 'expected a successful embed reply, not an error');
});
