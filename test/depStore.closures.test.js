// test/depStore.closures.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const {
  hashDeclaredDeps,
  parseClosureFromLock,
  computeLiveSet,
  findOrphans,
  pruneClosures,
} = require('../src/core/depStore/closures');

test('hashDeclaredDeps is stable regardless of key order', () => {
  const a = hashDeclaredDeps({ lodash: '^4.0.0', axios: '1.2.3' });
  const b = hashDeclaredDeps({ axios: '1.2.3', lodash: '^4.0.0' });
  assert.strictEqual(a, b);
});

test('hashDeclaredDeps changes when a version range changes', () => {
  const a = hashDeclaredDeps({ lodash: '^4.0.0' });
  const b = hashDeclaredDeps({ lodash: '^4.1.0' });
  assert.notStrictEqual(a, b);
});

test('hashDeclaredDeps of empty deps is stable and non-empty', () => {
  assert.strictEqual(hashDeclaredDeps({}), hashDeclaredDeps({}));
  assert.ok(hashDeclaredDeps({}).length > 0);
});

test('parseClosureFromLock extracts name@version from a v3 lock, skipping the root', () => {
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'staging', version: '1.0.0' },
      'node_modules/lodash': { version: '4.17.21' },
      'node_modules/@discordjs/voice': { version: '0.16.1' },
      'node_modules/lodash/node_modules/nested': { version: '2.0.0' },
    },
  };
  assert.deepStrictEqual(
    parseClosureFromLock(lock).sort(),
    ['@discordjs/voice@0.16.1', 'lodash@4.17.21', 'nested@2.0.0'].sort()
  );
});

test('parseClosureFromLock returns [] for a lock with only the root package', () => {
  assert.deepStrictEqual(parseClosureFromLock({ packages: { '': { version: '1.0.0' } } }), []);
});

test('parseClosureFromLock tolerates a missing packages map', () => {
  assert.deepStrictEqual(parseClosureFromLock({}), []);
});

test('computeLiveSet unions closures of live modules only', () => {
  const closures = {
    tts: { deps: 'x', closure: ['a@1', 'b@1'] },
    gemini: { deps: 'y', closure: ['b@1', 'c@1'] },
    music: { deps: 'z', closure: ['d@1'] },
  };
  const live = computeLiveSet(closures, ['tts', 'gemini']);
  assert.deepStrictEqual([...live].sort(), ['a@1', 'b@1', 'c@1']);
});

test('computeLiveSet ignores live names that have no closure entry', () => {
  const closures = { tts: { deps: 'x', closure: ['a@1'] } };
  const live = computeLiveSet(closures, ['tts', 'ghost']);
  assert.deepStrictEqual([...live].sort(), ['a@1']);
});

test('findOrphans returns store entries not in the live set', () => {
  const entries = ['a@1', 'b@1', 'c@1', 'd@1'];
  const live = new Set(['a@1', 'c@1']);
  assert.deepStrictEqual(findOrphans(entries, live).sort(), ['b@1', 'd@1']);
});

test('findOrphans keeps a shared entry alive when any live module references it', () => {
  const closures = {
    tts: { deps: 'x', closure: ['shared@1', 'ttsonly@1'] },
    gemini: { deps: 'y', closure: ['shared@1'] },
  };
  const live = computeLiveSet(closures, ['gemini']); // tts disabled
  assert.deepStrictEqual(findOrphans(['shared@1', 'ttsonly@1'], live).sort(), ['ttsonly@1']);
});

test('pruneClosures drops keys for modules no longer present', () => {
  const closures = {
    tts: { deps: 'x', closure: ['a@1'] },
    gone: { deps: 'y', closure: ['b@1'] },
  };
  assert.deepStrictEqual(pruneClosures(closures, ['tts']), {
    tts: { deps: 'x', closure: ['a@1'] },
  });
});
