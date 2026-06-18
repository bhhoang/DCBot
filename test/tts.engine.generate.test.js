// test/tts.engine.generate.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const engine = require('../modules/tts/ttsEngine');

test('generate fetches each chunk and concatenates buffers in order', async () => {
  const calls = [];
  const deps = {
    getAudioUrl: (chunk) => { calls.push(chunk); return `https://tts/${encodeURIComponent(chunk)}`; },
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from(decodeURIComponent(url.split('/').pop())),
    }),
  };
  const text = 'A'.repeat(150) + '. ' + 'B'.repeat(150) + '. ';
  const out = await engine.generate(text, 'en-US', deps);
  assert.ok(Buffer.isBuffer(out));
  assert.strictEqual(calls.length, 2);                 // two chunks fetched
  assert.strictEqual(out.toString(), calls.join(''));  // concatenated in order
});

test('generate throws when a fetch responds non-ok', async () => {
  const deps = {
    getAudioUrl: () => 'https://tts/x',
    fetchImpl: async () => ({ ok: false, status: 503, arrayBuffer: async () => Buffer.alloc(0) }),
  };
  await assert.rejects(() => engine.generate('hello', 'en-US', deps), /503/);
});

test('generate passes an abort signal so a hung fetch cannot block forever', async () => {
  let sawSignal = false;
  const deps = {
    getAudioUrl: () => 'https://tts/x',
    fetchImpl: async (_url, opts) => {
      sawSignal = !!(opts && opts.signal);
      return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('z') };
    },
  };
  await engine.generate('hi', 'en-US', deps);
  assert.strictEqual(sawSignal, true);
});

test('FETCH_TIMEOUT_MS is exported', () => {
  assert.strictEqual(engine.FETCH_TIMEOUT_MS, 10000);
});
