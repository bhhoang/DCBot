// test/tts.reply.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { replyOrEdit } = require('../modules/tts/reply');

function stub() {
  const calls = [];
  return {
    calls,
    reply(p) { calls.push(['reply', p]); return Promise.resolve('reply'); },
    editReply(p) { calls.push(['editReply', p]); return Promise.resolve('editReply'); },
  };
}

test('deferred interaction uses editReply', async () => {
  const s = stub(); s.deferred = true;
  await replyOrEdit(s, { content: 'x' });
  assert.deepStrictEqual(s.calls, [['editReply', { content: 'x' }]]);
});

test('non-deferred interaction uses reply', async () => {
  const s = stub(); s.deferred = false;
  await replyOrEdit(s, { content: 'y' });
  assert.deepStrictEqual(s.calls, [['reply', { content: 'y' }]]);
});

test('legacy Message (deferred undefined) uses reply', async () => {
  const s = stub(); // no `deferred` property
  await replyOrEdit(s, { content: 'z' });
  assert.deepStrictEqual(s.calls, [['reply', { content: 'z' }]]);
});
