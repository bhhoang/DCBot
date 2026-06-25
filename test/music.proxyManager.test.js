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
