// modules/music/soundcloudSearch.js — direct SoundCloud v2 search using the
// built-in fetch API. Bypasses the soundcloud.ts library bundled in
// @discord-player/extractor, which calls undici.Pool.request() with the
// deprecated `maxRedirections` option and throws under newer undici
// versions (the one pulled in by discord.js). The error is silently
// swallowed by .catch(noop) in the discord-player SoundCloudExtractor,
// which is why the search returns 0 tracks with no visible failure.
//
// Public API:
//   getClientId()                  -> Promise<string>
//   searchTracks(query, limit?)    -> Promise<Array<rawTrack>>
//   resolveTrack(url)              -> Promise<rawTrack | null>   (URLs only)
//   search(query, limit?)          -> Promise<Array<rawTrack>>   (auto-detects URL vs text)

let _cachedClientId = null;
let _cachedClientIdAt = 0;
const CLIENT_ID_TTL_MS = 30 * 60 * 1000;

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5_1 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/99.0.4844.47 Mobile/15E148 Safari/604.1';

async function getClientId(forceRefresh = false) {
  if (!forceRefresh && _cachedClientId && (Date.now() - _cachedClientIdAt) < CLIENT_ID_TTL_MS) {
    return _cachedClientId;
  }
  const res = await fetch('https://m.soundcloud.com/', { headers: { 'User-Agent': MOBILE_UA } });
  if (!res.ok) throw new Error(`SoundCloud client_id fetch failed: ${res.status}`);
  const html = await res.text();
  const m = html.match(/"clientId":"(\w+?)"/);
  if (!m) throw new Error('Could not find SoundCloud client_id in m.soundcloud.com response');
  _cachedClientId = m[1];
  _cachedClientIdAt = Date.now();
  return _cachedClientId;
}

async function searchTracks(query, limit = 25) {
  const clientId = await getClientId();
  const url = `https://api-v2.soundcloud.com/search?q=${encodeURIComponent(query)}` +
    `&client_id=${clientId}&limit=${Math.max(1, Math.min(limit, 50))}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`SoundCloud search failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.collection) ? data.collection : [];
}

async function resolveTrack(url) {
  const clientId = await getClientId();
  const api = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`;
  const res = await fetch(api, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SoundCloud resolve failed: ${res.status}`);
  const data = await res.json();
  if (data.kind !== 'track') return null;
  return data;
}

// Heuristic: anything with a slash that isn't obviously a free-text query is
// treated as a URL/permalink. Free-text queries with no slash go to text
// search. This is the same shape discord-player's QueryResolver uses.
function looksLikeUrl(query) {
  return /soundcloud\.com\//i.test(query) || /^[^\s/]+\/[^\s/]+$/.test(query);
}

async function search(query, limit = 25) {
  if (looksLikeUrl(query)) {
    try {
      const resolved = await resolveTrack(query);
      return resolved ? [resolved] : [];
    } catch {
      // Fall through to text search if the URL is malformed.
    }
  }
  return await searchTracks(query, limit);
}

module.exports = { getClientId, searchTracks, resolveTrack, search };
