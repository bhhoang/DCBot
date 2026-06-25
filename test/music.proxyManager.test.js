// test/music.proxyManager.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const pm = require('../modules/music/proxyManager');

test('parseEndpoint converts host:port:user:pass to a proxy URL', () => {
  assert.strictEqual(
    pm._parseEndpoint('171.236.164.11:42996:muaproxy63d4f:vU2B6UG8'),
    'http://muaproxy63d4f:vU2B6UG8@171.236.164.11:42996'
  );
});

test('parseEndpoint passes through an already-formed URL', () => {
  assert.strictEqual(
    pm._parseEndpoint('http://u:p@1.2.3.4:8080'),
    'http://u:p@1.2.3.4:8080'
  );
});

test('parseEndpoint returns null for empty/garbage', () => {
  assert.strictEqual(pm._parseEndpoint(''), null);
  assert.strictEqual(pm._parseEndpoint('nope'), null);
});

test('pick: free pool used when available and no cooldown', () => {
  const mgr = pm._create({
    now: () => 1000,
    config: { residential: { endpoint: '1.1.1.1:80:u:p', cooldownMinutes: 30 } },
  });
  mgr._setFreePool([{ url: 'http://free1:80', validatedAt: 0 }]);
  assert.strictEqual(mgr.current(), 'http://free1:80');
});

test('reportBlock escalates to residential and sticks for cooldown', () => {
  let t = 1000;
  const mgr = pm._create({
    now: () => t,
    config: { residential: { endpoint: '1.1.1.1:80:u:p', cooldownMinutes: 30 } },
  });
  mgr._setFreePool([{ url: 'http://free1:80', validatedAt: 0 }]);
  mgr.reportBlock(new Error('Sign in to confirm you’re not a bot'));
  assert.strictEqual(mgr.current(), 'http://u:p@1.1.1.1:80'); // on residential now
  t += 29 * 60 * 1000; // still inside cooldown
  assert.strictEqual(mgr.current(), 'http://u:p@1.1.1.1:80');
  t += 2 * 60 * 1000;  // cooldown expired -> back to free
  assert.strictEqual(mgr.current(), 'http://free1:80');
});

test('reportBlock ignores non-block errors', () => {
  const mgr = pm._create({
    now: () => 1000,
    config: { residential: { endpoint: '1.1.1.1:80:u:p', cooldownMinutes: 30 } },
  });
  mgr._setFreePool([{ url: 'http://free1:80', validatedAt: 0 }]);
  mgr.reportBlock(new Error('ECONNRESET random network blip'));
  assert.strictEqual(mgr.current(), 'http://free1:80'); // unchanged
});

test('isBlockError matches known signatures', () => {
  assert.ok(pm._isBlockError(new Error('Sign in to confirm you’re not a bot')));
  assert.ok(pm._isBlockError(new Error('HTTP Error 429: Too Many Requests')));
  assert.ok(pm._isBlockError(new Error('HTTP Error 403: Forbidden')));
  assert.ok(pm._isBlockError(new Error('Proxy response 400')));
  assert.ok(!pm._isBlockError(new Error('ECONNRESET')));
});
