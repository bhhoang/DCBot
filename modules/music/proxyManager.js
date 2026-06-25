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
    // Cooldown window after a block: stick to residential.
    if (now() < cooldownUntil && residentialUrl) return residentialUrl;
    // Prefer the free pool when one has been built.
    if (freePool.length) return freePool[0].url;
    // Otherwise use the configured residential proxy as the steady-state route.
    // Required for hosts whose IP YouTube blocks outright (e.g. Oracle/most VPS
    // ranges): direct streaming connects then gets cut mid-playback, so there is
    // no usable "direct" tier — the proxy is the default, not just a fallback.
    if (residentialUrl) return residentialUrl;
    return null; // direct (only when no proxy is configured at all)
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
        tier: now() < cooldownUntil && residentialUrl ? 'residential' : (freePool.length ? 'free' : (residentialUrl ? 'residential' : 'direct')),
        current: redacted,
        poolSize: freePool.length,
        cooldownRemaining: Math.round(remaining / 1000),
      };
    },
    _setFreePool(list) { freePool = list.slice(); },
    _residentialUrl: () => residentialUrl,
  };
}

const https = require('https');

// Editable list of public free-proxy sources. These rot over time — keep small.
const FREE_PROXY_SOURCES = [
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
];

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error(`timeout fetching ${url}`)));
  });
}

// Default scraper: fetch sources, return ["http://host:port", ...].
async function scrapeFreeProxies() {
  const out = [];
  for (const src of FREE_PROXY_SOURCES) {
    try {
      const body = await httpGet(src);
      for (const line of body.split(/\r?\n/)) {
        const m = line.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})$/);
        if (m) out.push(`http://${m[1]}:${m[2]}`);
      }
    } catch { /* source down; skip */ }
  }
  return out;
}

// Default validator: run bundled yt-dlp through the proxy in simulate mode and
// require a real stream URL within the speed bar (undici ~10s connect headroom).
async function validateProxy(proxyUrl, testUrl, cookiesFile, maxSecs = 12) {
  const { exec } = require('youtube-dl-exec');
  const t0 = Date.now();
  try {
    const cp = exec(testUrl, {
      proxy: proxyUrl,
      simulate: true,
      getUrl: true,
      noWarnings: true,
      noPlaylist: true,
      socketTimeout: 15,
      timeout: maxSecs * 1000,
      ...(cookiesFile ? { cookies: cookiesFile } : {}),
    });
    const result = await cp;
    const elapsed = (Date.now() - t0) / 1000;
    const stdout = (result.stdout || '').trim();
    return stdout.startsWith('http') && elapsed <= maxSecs;
  } catch {
    return false;
  }
}

let singleton = null;
let refreshTimer = null;

async function buildPool(cfg, scraper, validator) {
  if (!cfg.freePool?.enabled) return [];
  const want = cfg.freePool.validateCount ?? 5;
  const maxAttempts = want * 20;
  const candidates = await scraper();
  const live = [];
  let attempts = 0;
  for (const url of candidates) {
    if (live.length >= want || attempts >= maxAttempts) break;
    attempts++;
    const ok = await validator(url, cfg.freePool.testUrl, cfg.cookiesFile);
    if (ok) live.push({ url, validatedAt: Date.now() });
  }
  return live;
}

async function _initCommon(cfg, scraper, validator) {
  singleton = create({ config: cfg });
  const pool = await buildPool(cfg, scraper, validator);
  singleton._setFreePool(pool);
  return singleton;
}

// Production init: kicks the first pool build in the BACKGROUND (never blocks
// boot or playback). Schedules periodic refresh.
function init(cfg) {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  singleton = create({ config: cfg });
  if (cfg.enabled && cfg.freePool?.enabled) {
    const refresh = async () => {
      try {
        const pool = await buildPool(cfg, scrapeFreeProxies, (u, t, c) =>
          validateProxy(u, t, c));
        if (pool.length) singleton._setFreePool(pool);
      } catch (e) { console.warn('[music] proxy pool refresh failed:', e.message); }
    };
    refresh(); // fire-and-forget
    const everyMs = (cfg.freePool.refreshMinutes ?? 30) * 60 * 1000;
    refreshTimer = setInterval(refresh, everyMs);
    if (refreshTimer.unref) refreshTimer.unref();
  }
  return singleton;
}

function shutdown() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  singleton = null;
}

// Test helper: deterministic init with injected scraper/validator, awaited.
async function _initForTest({ config, scraper, validator }) {
  return _initCommon(config, scraper, validator);
}

module.exports = {
  init,
  shutdown,
  current: () => (singleton ? singleton.current() : null),
  reportBlock: (e) => singleton && singleton.reportBlock(e),
  reportSuccess: () => singleton && singleton.reportSuccess(),
  getStatus: () => (singleton ? singleton.getStatus() : { tier: 'uninit' }),
  _parseEndpoint: parseEndpoint,
  _isBlockError: isBlockError,
  _create: create,
  _initForTest,
};
