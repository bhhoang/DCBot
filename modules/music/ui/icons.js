// modules/music/ui/icons.js — shared icon resolution for the music module.
//
// Two flavors of helper live here:
//   musicEmoji(key, fallback)     → { id, name } for ButtonBuilder#setEmoji
//   musicEmojiStr(key, fallback)   → <:name:id> string for inline text/embeds
//
// Both load config/music-icons.json once per process and cache the result.
// The cache is rebuilt only on hot-reload of this module.

const fs = require('fs');
const path = require('path');

const ICONS_CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'config', 'music-icons.json');

let _iconCache = null;
function loadIconMapping() {
  if (_iconCache !== null) return _iconCache;
  try {
    const parsed = JSON.parse(fs.readFileSync(ICONS_CONFIG_PATH, 'utf8'));
    const out = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key !== '_' && value) out[key] = String(value);
    }
    _iconCache = out;
  } catch {
    _iconCache = {};
  }
  return _iconCache;
}

// Mirror of the naming scheme in scripts/upload-music-icons.js — Discord's
// application-emoji names must be 2-32 chars of [a-z0-9_], so we collapse
// each semantic key to a lowercase snake-case token and prepend the prefix.
function emojiNameFor(key) {
  return `music_${key.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
}

function musicEmoji(key, fallback) {
  const id = loadIconMapping()[key];
  if (id) return { id, name: emojiNameFor(key) };
  return fallback;
}

function musicEmojiStr(key, fallback) {
  const id = loadIconMapping()[key];
  if (id) return `<:${emojiNameFor(key)}:${id}>`;
  return fallback;
}

module.exports = { musicEmoji, musicEmojiStr };