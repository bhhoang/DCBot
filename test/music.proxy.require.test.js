// Mirrors test/gemini.require.test.js: verify the new music submodules load and
// expose their public surface, so a missing dep or syntax error fails CI loudly.
const { test } = require('node:test');
const assert = require('node:assert');

test('proxyManager exposes its public interface', () => {
  const pm = require('../modules/music/proxyManager');
  for (const fn of ['init', 'shutdown', 'current', 'reportBlock', 'reportSuccess', 'getStatus']) {
    assert.strictEqual(typeof pm[fn], 'function', `missing ${fn}`);
  }
});

test('ytStream exposes make()', () => {
  const ytStream = require('../modules/music/ytStream');
  assert.strictEqual(typeof ytStream.make, 'function');
});
