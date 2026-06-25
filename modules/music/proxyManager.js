// modules/music/proxyManager.js
// Owns the active outbound proxy for the yt-dlp audio path and a two-tier
// state machine: free pool (default) -> residential (on-failure-sticky).
// Consumed by ytStream.js at stream time (NOT via process env — that never
// reaches discord-player-youtubei's yt-dlp child).

// Convert a "host:port:user:pass" reseller endpoint (or an already-formed
// proxy URL) into a URL yt-dlp/undici accept. Returns null if unusable.
function parseEndpoint(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (/^[a-z0-9]+:\/\//i.test(raw)) return raw; // already a URL
  const parts = raw.split(':');
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `http://${user}:${pass}@${host}:${port}`;
  }
  if (parts.length === 2) {
    const [host, port] = parts;
    return `http://${host}:${port}`;
  }
  return null;
}

const BLOCK_SIGNATURES = [
  /sign in to confirm/i,
  /not a bot/i,
  /HTTP Error 429/i,
  /\b429\b/,
  /HTTP Error 403/i,
  /\b403\b/,
  /Proxy response 400/i,
  /no video formats found/i,
  /requested format is not available/i,
];

function isBlockError(err) {
  const msg = (err && (err.message || String(err))) || '';
  return BLOCK_SIGNATURES.some((re) => re.test(msg));
}

// Factory so tests can inject a fake clock + config without touching globals.
function create({ now = Date.now, config = {} } = {}) {
  const residentialUrl = parseEndpoint(config.residential?.endpoint);
  const cooldownMs = (config.residential?.cooldownMinutes ?? 30) * 60 * 1000;
  let freePool = [];          // [{url, validatedAt}]
  let cooldownUntil = 0;

  function pick() {
    if (now() < cooldownUntil && residentialUrl) return residentialUrl;
    if (freePool.length) return freePool[0].url;
    if (residentialUrl) return residentialUrl;
    return null; // direct
  }

  return {
    current: pick,
    reportBlock(err) {
      if (!isBlockError(err)) return;
      if (residentialUrl) cooldownUntil = now() + cooldownMs;
    },
    reportSuccess() { /* drift back to free is automatic once cooldown expires */ },
    getStatus() {
      const remaining = Math.max(0, cooldownUntil - now());
      const cur = pick();
      const redacted = cur && cur.includes('@')
        ? cur.replace(/\/\/[^@]+@/, '//***@') : cur;
      return {
        tier: now() < cooldownUntil ? 'residential' : (freePool.length ? 'free' : (residentialUrl ? 'residential' : 'direct')),
        current: redacted,
        poolSize: freePool.length,
        cooldownRemaining: Math.round(remaining / 1000),
      };
    },
    _setFreePool(list) { freePool = list.slice(); },
    _residentialUrl: () => residentialUrl,
  };
}

module.exports = {
  _parseEndpoint: parseEndpoint,
  _isBlockError: isBlockError,
  _create: create,
};
