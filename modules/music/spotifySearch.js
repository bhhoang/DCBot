// modules/music/spotifySearch.js — direct Spotify Web API via fetch().
// Bypasses @discord-player/extractor's SpotifyExtractor, which sends
// the OAuth token request with `Content-Type: application/json` and an
// empty body — Spotify returns 415 — and whose anonymous-token fallback
// is Cloudflare-blocked. With this module the bot uses the correct
// x-www-form-urlencoded Client Credentials flow.
//
// Public API:
//   search(query, clientId, clientSecret) -> Promise<Array<rawTrack>>

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';
const TOKEN_TTL_S = 3500; // Spotify tokens are 3600s; refresh slightly early
const MAX_RETRIES = 3;   // for 429 / 5xx

let _cachedToken = null;
let _cachedTokenFor = null;
let _cachedTokenAt = 0;

// Single fetch wrapper. Reads JSON; on 429 honours Retry-After with
// exponential backoff (per Spotify Developer Terms); surfaces a clear
// error on other failures so callers can show the user a useful message.
async function spotifyFetch(url, { method = 'GET', headers = {}, body } = {}, attempt = 1) {
  const res = await fetch(url, { method, headers, body });
  if (res.status === 429 && attempt <= MAX_RETRIES) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
    const waitMs = Math.max(retryAfter * 1000, 500 * Math.pow(2, attempt - 1));
    await new Promise((r) => setTimeout(r, waitMs));
    return spotifyFetch(url, { method, headers, body }, attempt + 1);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Spotify request failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  return await res.json();
}

async function getAccessToken(clientId, clientSecret) {
  const tag = `${clientId}:${clientSecret}`;
  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedTokenFor === tag && (now - _cachedTokenAt) < TOKEN_TTL_S) {
    return _cachedToken;
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = await spotifyFetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!body.access_token) throw new Error('Spotify token response missing access_token');
  _cachedToken = body.access_token;
  _cachedTokenFor = tag;
  _cachedTokenAt = now;
  return _cachedToken;
}

// Omit `limit` and `market` — Spotify returns "Invalid limit" on some apps
// even for documented valid values; defaults are the most compatible.
async function searchTracks(query, token) {
  const data = await spotifyFetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&type=track`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(data.tracks?.items) ? data.tracks.items : [];
}

async function resolveTrack(url, token) {
  // open.spotify.com/track/{id} | open.spotify.com/intl-xx/track/{id} | spotify:track:{id}
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)|^spotify:track:([A-Za-z0-9]+)/);
  if (!m) return null;
  const id = m[1] || m[2];
  try {
    return await spotifyFetch(`${API_BASE}/tracks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    // 404 returns null; other errors propagate.
    if (/Spotify request failed: 404/.test(String(e.message))) return null;
    throw e;
  }
}

function looksLikeTrackUrl(query) {
  return /open\.spotify\.com\/.*\/track\/|^spotify:track:/i.test(query);
}

async function search(query, clientId, clientSecret) {
  const token = await getAccessToken(clientId, clientSecret);
  if (looksLikeTrackUrl(query)) {
    try {
      const t = await resolveTrack(query, token);
      return t ? [t] : [];
    } catch {
      // Fall through to text search if the URL is malformed.
    }
  }
  return await searchTracks(query, token);
}

module.exports = { getAccessToken, searchTracks, resolveTrack, search };