// test/music.ytStream.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const ytStream = require('../modules/music/ytStream');

test('buildExecOptions assembles cookies, proxy, mweb + POT extractor-args', () => {
  const opts = ytStream._buildExecOptions({
    cookiesFile: './config/cookies.txt',
    proxyUrl: 'http://u:p@1.2.3.4:80',
    poToken: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:4416',
      playerClient: 'mweb',
      pluginDirs: './config/yt-dlp-plugins',
    },
  });
  assert.strictEqual(opts.cookies, './config/cookies.txt');
  assert.strictEqual(opts.proxy, 'http://u:p@1.2.3.4:80');
  assert.strictEqual(opts.format, 'bestaudio');
  assert.strictEqual(opts.output, '-');
  assert.strictEqual(opts.pluginDirs, './config/yt-dlp-plugins');
  assert.ok(opts.extractorArgs.some((a) => a.includes('player_client=mweb')));
  assert.ok(opts.extractorArgs.some((a) => a.includes('youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416')));
});

test('buildExecOptions omits proxy when null and POT when disabled', () => {
  const opts = ytStream._buildExecOptions({
    cookiesFile: './c.txt', proxyUrl: null,
    poToken: { enabled: false },
  });
  assert.ok(!('proxy' in opts));
  assert.ok(opts.extractorArgs.every((a) => !a.includes('bgutilhttp')));
  // POT disabled: pin android_vr (no token needed, direct progressive stream —
  // avoids the slow HLS path). Must NOT pin a POT-requiring client (mweb/web/tv).
  assert.ok(opts.extractorArgs.some((a) => a.includes('player_client=android_vr')));
  assert.ok(opts.extractorArgs.every((a) => !a.includes('player_client=mweb')));
  // Progressive-https format preference so playback skips m3u8 fetch.
  assert.ok(opts.format.includes('protocol^=https'));
});

test('createStream calls exec with assembled opts and returns stdout', async () => {
  const calls = [];
  const fakeExec = (url, opts) => { calls.push({ url, opts }); return { stdout: 'STREAM' }; };
  const fakePm = { current: () => 'http://prox:80', reportSuccess() {}, reportBlock() {} };
  const stream = await ytStream._createStreamWith(
    { url: 'https://youtu.be/abc' },
    { cookiesFile: './c.txt', poToken: { enabled: true, baseUrl: 'http://127.0.0.1:4416', playerClient: 'mweb' } },
    fakePm, fakeExec,
  );
  assert.strictEqual(stream, 'STREAM');
  assert.strictEqual(calls[0].url, 'https://youtu.be/abc');
  assert.strictEqual(calls[0].opts.proxy, 'http://prox:80');
});
