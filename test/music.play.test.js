// test/music.play.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const player = require('../modules/music/player');
const play = require('../modules/music/commands/play');

test('isUrlQuery detects media URLs and rejects plain text', () => {
  // Full http(s) URLs.
  assert.ok(player.isUrlQuery('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
  assert.ok(player.isUrlQuery('http://youtu.be/dQw4w9WgXcQ'));
  assert.ok(player.isUrlQuery('https://open.spotify.com/track/abc'));
  assert.ok(player.isUrlQuery('https://soundcloud.com/artist/track'));
  // Bare-domain forms (no scheme).
  assert.ok(player.isUrlQuery('youtu.be/dQw4w9WgXcQ'));
  assert.ok(player.isUrlQuery('www.youtube.com/watch?v=x'));
  // Plain text searches must NOT be treated as URLs.
  assert.ok(!player.isUrlQuery('never gonna give you up'));
  assert.ok(!player.isUrlQuery('rick astley'));
  assert.ok(!player.isUrlQuery(''));
  assert.ok(!player.isUrlQuery(null));
});

test('queuedReply formats single track vs playlist', () => {
  const single = play._queuedReply({ title: 'Song Title' }, null);
  assert.ok(single.includes('Queued: **Song Title**'));
  assert.ok(!single.includes('tracks from'));

  const list = play._queuedReply({ title: 'First' }, { title: 'My Mix', tracks: [1, 2, 3] });
  assert.ok(list.includes('Queued 3 tracks from **My Mix**'));

  // Playlist with no track array still formats (count unknown).
  const unknown = play._queuedReply({ title: 'First' }, { title: 'Mix' });
  assert.ok(unknown.includes('Queued ? tracks from **Mix**'));
});
