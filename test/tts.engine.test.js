// test/tts.engine.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const engine = require('../modules/tts/ttsEngine');

test('getSupportedLanguages returns the six code->name pairs', () => {
  const langs = engine.getSupportedLanguages();
  assert.strictEqual(langs['vi-VN'], 'Vietnamese');
  assert.strictEqual(langs['en-US'], 'English (US)');
  assert.deepStrictEqual(
    Object.keys(langs).sort(),
    ['de-DE', 'en-US', 'es-ES', 'fr-FR', 'vi-VN', 'zh-CN']
  );
});

test('isSupportedLanguage accepts known codes and rejects unknown', () => {
  assert.strictEqual(engine.isSupportedLanguage('vi-VN'), true);
  assert.strictEqual(engine.isSupportedLanguage('xx-YY'), false);
});

test('chunkText returns a single chunk for short text', () => {
  assert.deepStrictEqual(engine.chunkText('hello world'), ['hello world']);
});

test('chunkText splits long multi-sentence text on sentence boundaries, each <= maxLength', () => {
  const text = 'A'.repeat(150) + '. ' + 'B'.repeat(150) + '. ';
  const chunks = engine.chunkText(text);
  assert.strictEqual(chunks.length, 2);
  for (const c of chunks) assert.ok(c.length <= 200, `chunk too long: ${c.length}`);
});

test('chunkText returns one oversized chunk when text exceeds maxLength with no sentence breaks', () => {
  const text = 'x'.repeat(500);
  assert.deepStrictEqual(engine.chunkText(text), [text]);
});

test('MAX_INPUT_LENGTH and CHUNK_SIZE are exported constants', () => {
  assert.strictEqual(engine.MAX_INPUT_LENGTH, 1000);
  assert.strictEqual(engine.CHUNK_SIZE, 200);
});
