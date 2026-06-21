// modules/music/providers.js — per-provider metadata and label helpers.
// Extracted from player.js to break a circular dep: embeds.js needs
// providerLabel/trackSourceLabel but player.js also needs them, and
// player.js requires embeds.js (for refreshNowPlaying). Keeping these
// pure helpers here means embeds.js depends on this module (no cycle)
// and player.js depends on both this module and embeds.js (no cycle).
const PROVIDER_META = {
  youtubei: { label: 'YouTube', needsCredentials: false, note: 'Streams via yt-dlp' },
  youtube:  { label: 'YouTube', needsCredentials: false, note: 'Streams via yt-dlp' },
  spotify:  { label: 'Spotify', needsCredentials: true,  note: 'Search and playback need config.music.spotify.clientId/clientSecret' },
  soundcloud:    { label: 'SoundCloud', needsCredentials: false, note: 'No credentials required' },
  applemusic:    { label: 'Apple Music', needsCredentials: false, note: 'No credentials required' },
  vimeo:         { label: 'Vimeo', needsCredentials: false, note: 'No credentials required' },
  reverbnation:  { label: 'ReverbNation', needsCredentials: false, note: 'No credentials required' },
  attachment:    { label: 'Attachment', needsCredentials: false, note: 'Plays Discord attachments' },
};

// Handles both "com.discord-player.soundcloudextractor" and bare
// "soundcloudextractor" identifier forms; falls back to the stripped
// form if no label is known.
function providerLabel(identifier) {
  if (!identifier) return 'Unknown';
  const short = String(identifier).replace(/^com\.discord-player\./, '').toLowerCase();
  const clean = short.replace(/extractor?$/, '');
  const meta = PROVIDER_META[clean];
  if (meta) return meta.label;
  return clean || String(identifier);
}

function trackSourceLabel(track) {
  return providerLabel(track?.source);
}

function providerDisplayName(short) {
  const meta = PROVIDER_META[short];
  if (meta) return meta.label;
  return short;
}

module.exports = { PROVIDER_META, providerLabel, trackSourceLabel, providerDisplayName };
