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

module.exports = { _parseEndpoint: parseEndpoint };
