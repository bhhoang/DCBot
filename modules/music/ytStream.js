// modules/music/ytStream.js
// Custom createStream for YoutubeiExtractor. discord-player-youtubei's built-in
// useYoutubeDL path hardcodes its yt-dlp options (only cookies/format/output/
// noWarnings/noProgress) and forwards neither proxy nor extractor-args. Supplying
// createStream replaces that spawn entirely, giving us full control: PO token
// provider (bgutil) + player_client=mweb (only when POT is enabled) + rotating
// proxy + cookies.

// Build the youtube-dl-exec options object (camelCase keys -> yt-dlp flags).
function buildExecOptions({ cookiesFile, proxyUrl, poToken }) {
  const extractorArgs = [];
  const pot = poToken || {};
  if (pot.enabled && pot.baseUrl) {
    // POT enabled: pin the POT-requiring client (mweb default) + bgutil provider.
    // player_client + POT live under the same "youtube:" namespace; bgutil uses
    // its own "youtubepot-bgutilhttp:" namespace. Two separate --extractor-args.
    const client = pot.playerClient || 'mweb';
    extractorArgs.push(`youtube:player_client=${client}`);
    extractorArgs.push(`youtubepot-bgutilhttp:base_url=${pot.baseUrl}`);
  } else {
    // POT disabled: pin android_vr. It needs no PO token AND returns a direct
    // progressive stream URL, so we skip yt-dlp's default HLS/m3u8 path — which
    // costs several extra proxy round-trips (~14s vs ~6s to first byte through a
    // residential proxy). Leaving the client unset works but is much slower.
    extractorArgs.push('youtube:player_client=android_vr');
  }
  // Prefer a progressive https stream over HLS so playback starts without
  // fetching+parsing an m3u8 manifest (another proxy round-trip).
  const format = (pot.enabled && pot.baseUrl)
    ? 'bestaudio'
    : 'bestaudio[protocol^=https]/bestaudio';
  const opts = {
    jsRuntimes: 'node',
    format,
    output: '-',
    noWarnings: true,
    noProgress: true,
    extractorArgs,
  };
  if (cookiesFile) opts.cookies = cookiesFile;
  if (proxyUrl) opts.proxy = proxyUrl;
  if (pot.pluginDirs) opts.pluginDirs = pot.pluginDirs;
  return opts;
}

// Injectable core for testing.
async function createStreamWith(track, config, proxyManager, exec) {
  const proxyUrl = proxyManager.current();
  const opts = buildExecOptions({
    cookiesFile: config.cookiesFile,
    proxyUrl,
    poToken: config.poToken,
  });
  const cp = exec(track.url, opts);
  // Surface a block error to the proxy manager if the child fails.
  if (cp && typeof cp.then === 'function') {
    cp.then(() => proxyManager.reportSuccess())
      .catch((err) => proxyManager.reportBlock(err));
  }
  const raw = cp.stdout;
  // When the audio path runs through a proxy, the proxy adds latency jitter.
  // discord-player reads cp.stdout in real time through a small (~64KB) pipe, so
  // a momentary proxy stall starves ffmpeg and the audio stutters/garbles. Insert
  // a large read-ahead buffer: yt-dlp downloads far ahead into memory (a 3-4min
  // track is only ~3.5MB and arrives in seconds), and the consumer drains it at
  // playback pace — jitter no longer causes underruns. Skipped for test fakes
  // (raw is a string, has no .pipe).
  if (raw && typeof raw.pipe === 'function') {
    const { PassThrough } = require('stream');
    const buffered = new PassThrough({ highWaterMark: 1 << 25 }); // 32MB read-ahead
    raw.pipe(buffered);
    raw.on('error', (err) => buffered.destroy(err));
    const kill = () => { if (cp && typeof cp.kill === 'function' && !cp.killed) cp.kill(); };
    // Kill the yt-dlp child when playback ends/stops — discord-player-youtubei's
    // built-in path (which createStream replaces) does this; without it the child
    // lingers on skip/stop.
    buffered.on('close', kill);
    buffered.on('error', kill);
    raw.on('end', () => { /* child exits on its own once stdout ends */ });
    return buffered;
  }
  return raw;
}

// Factory: returns a createStream(track, extractor) bound to live config + pm.
function make(config, proxyManager) {
  const { exec } = require('youtube-dl-exec');
  return (track /*, extractor */) => createStreamWith(track, config, proxyManager, exec);
}

module.exports = {
  make,
  _buildExecOptions: buildExecOptions,
  _createStreamWith: createStreamWith,
};
