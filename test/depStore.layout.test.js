// test/depStore.layout.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const layout = require('../src/core/depStore/layout');

const MODS = '/bot/modules';

test('splitEntry splits unscoped name@version on the last @', () => {
  assert.deepStrictEqual(layout.splitEntry('lodash@4.17.21'), { name: 'lodash', version: '4.17.21' });
});

test('splitEntry splits scoped @scope/name@version on the last @', () => {
  assert.deepStrictEqual(
    layout.splitEntry('@discordjs/voice@0.16.1'),
    { name: '@discordjs/voice', version: '0.16.1' }
  );
});

test('entryDirName encodes the scope slash as +', () => {
  assert.strictEqual(layout.entryDirName('@discordjs/voice@0.16.1'), '@discordjs+voice@0.16.1');
  assert.strictEqual(layout.entryDirName('lodash@4.17.21'), 'lodash@4.17.21');
});

test('decodeEntryDirName is the inverse of entryDirName', () => {
  assert.strictEqual(layout.decodeEntryDirName('@discordjs+voice@0.16.1'), '@discordjs/voice@0.16.1');
  assert.strictEqual(layout.decodeEntryDirName('lodash@4.17.21'), 'lodash@4.17.21');
});

test('storeEntryPackagePath points at node_modules/<realName> inside the entry', () => {
  assert.strictEqual(
    layout.storeEntryPackagePath(MODS, '@discordjs/voice@0.16.1'),
    path.join(MODS, '.store', '@discordjs+voice@0.16.1', 'node_modules', '@discordjs', 'voice')
  );
});

test('storeEntryModulesPath points at the entry node_modules dir', () => {
  assert.strictEqual(
    layout.storeEntryModulesPath(MODS, 'lodash@4.17.21'),
    path.join(MODS, '.store', 'lodash@4.17.21', 'node_modules')
  );
});

test('viewModulesPath returns the single-file module view node_modules', () => {
  assert.strictEqual(
    layout.viewModulesPath(MODS, 'gemini'),
    path.join(MODS, '.views', 'gemini', 'node_modules')
  );
});

test('stagingPath returns a per-module staging dir under .store/.staging', () => {
  assert.strictEqual(layout.stagingPath(MODS, 'tts'), path.join(MODS, '.store', '.staging', 'tts'));
});

test('closuresFile returns .store/closures.json', () => {
  assert.strictEqual(layout.closuresFile(MODS), path.join(MODS, '.store', 'closures.json'));
});

test('storeRoot returns .store', () => {
  assert.strictEqual(layout.storeRoot(MODS), path.join(MODS, '.store'));
});
