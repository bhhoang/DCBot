// test/music.embeds.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const embeds = require('../modules/music/ui/embeds');
const state = require('../modules/music/state');

test('upNextLine formats empty / single / many', () => {
  assert.strictEqual(embeds.upNextLine([]), '');
  assert.strictEqual(embeds.upNextLine(null), '');
  assert.strictEqual(embeds.upNextLine([{ title: 'A' }]), '**A**');
  assert.strictEqual(embeds.upNextLine([{ title: 'A' }, { title: 'B' }, { title: 'C' }]), '**A** (+2 more)');
});

test('nowPlayingEmbed without a queue still builds a valid embed (no bar, no up-next)', () => {
  const em = embeds.nowPlayingEmbed({ title: 'Song', thumbnail: null }, 'user', 'off', 100, false);
  assert.strictEqual(em.data.description, '**Song**'); // no progress bar appended
  // Base fields only: Source, Duration, Volume, Requested by — no "Up next".
  assert.strictEqual(em.data.fields.length, 4);
  assert.ok(!em.data.fields.some((f) => f.name === 'Up next'));
});

test('nowPlayingEmbed with a queue adds progress bar + up-next', () => {
  const fakeQueue = {
    node: {
      getTimestamp: () => ({ current: { label: '1:24', value: 84000 }, total: { label: '3:33', value: 213000 } }),
      createProgressBar: () => '1:24 ┃BAR 3:33',
    },
    tracks: { data: [{ title: 'Next1' }, { title: 'Next2' }] },
  };
  const em = embeds.nowPlayingEmbed({ title: 'Song', thumbnail: null }, 'user', 'off', 100, false, fakeQueue);
  assert.ok(em.data.description.includes('1:24 ┃BAR 3:33'));
  const upNext = em.data.fields.find((f) => f.name === 'Up next');
  assert.ok(upNext && upNext.value === '**Next1** (+1 more)');
});

test('progress timer starts, ticks, and stops cleanly', async () => {
  let ticks = 0;
  state.startProgressTimer('test-guild', () => { ticks++; }, 30);
  await new Promise((r) => setTimeout(r, 100));
  state.stopProgressTimer('test-guild');
  const afterStop = ticks;
  assert.ok(ticks >= 2, `expected >=2 ticks, got ${ticks}`);
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(ticks, afterStop, 'timer kept firing after stop');
});
