// test/tts.queue.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { QueueManager } = require('../modules/tts/queueManager');

const tick = () => new Promise((r) => setImmediate(r));

test('processes enqueued items in FIFO order', async () => {
  const q = new QueueManager();
  const order = [];
  q.enqueue('g', async () => { order.push(1); });
  q.enqueue('g', async () => { order.push(2); });
  q.enqueue('g', async () => { order.push(3); });
  while (q.isProcessing('g')) await tick();
  assert.deepStrictEqual(order, [1, 2, 3]);
});

test('a throwing item does not stall the queue', async () => {
  const q = new QueueManager();
  const order = [];
  q.enqueue('g', async () => { order.push('a'); throw new Error('boom'); });
  q.enqueue('g', async () => { order.push('b'); });
  while (q.isProcessing('g')) await tick();
  assert.deepStrictEqual(order, ['a', 'b']);
});

test('onDrain fires once when the queue empties', async () => {
  const q = new QueueManager();
  let drained = 0;
  q.onDrain('g', () => { drained += 1; });
  q.enqueue('g', async () => {});
  q.enqueue('g', async () => {});
  while (q.isProcessing('g')) await tick();
  assert.strictEqual(drained, 1);
});

test('queues are independent per guild', async () => {
  const q = new QueueManager();
  const seen = [];
  q.enqueue('g1', async () => { seen.push('g1'); });
  q.enqueue('g2', async () => { seen.push('g2'); });
  while (q.isProcessing('g1') || q.isProcessing('g2')) await tick();
  assert.deepStrictEqual(seen.sort(), ['g1', 'g2']);
});
