// modules/music/ytStream.js
// Custom createStream for YoutubeiExtractor. discord-player-youtubei's built-in
// useYoutubeDL path hardcodes its yt-dlp options (only cookies/format/output/
// noWarnings/noProgress) and forwards neither proxy nor extractor-args. Supplying
// createStream replaces that spawn entirely, giving us full control: PO token
// provider (bgutil) + player_client=mweb + rotating proxy + cookies.

// Build the youtube-dl-exec options object (camelCase keys -> yt-dlp flags).
function buildExecOptions({ cookiesFile, proxyUrl, poToken }) {
  const extractorArgs = [];
  const pot = poToken || {};
  const client = pot.playerClient || 'mweb';
  // player_client + POT live under the same "youtube:" namespace; bgutil uses its
  // own "youtubepot-bgutilhttp:" namespace. Pass as two separate --extractor-args.
  extractorArgs.push(`youtube:player_client=${client}`);
  if (pot.enabled && pot.baseUrl) {
    extractorArgs.push(`youtubepot-bgutilhttp:base_url=${pot.baseUrl}`);
  }
  const opts = {
    jsRuntimes: 'node',
    format: 'bestaudio',
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
  return cp.stdout;
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
