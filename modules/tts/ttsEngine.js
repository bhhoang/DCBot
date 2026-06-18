// modules/tts/ttsEngine.js — Google TTS engine. Pure helpers carry no eager heavy
// imports so this file is unit-testable without npm deps installed; google-tts-api
// and ffmpeg-static are lazy-required / injectable.

const CHUNK_SIZE = 200;       // Google TTS per-request character ceiling
const MAX_INPUT_LENGTH = 1000; // hard cap on user input
const FETCH_TIMEOUT_MS = 10000;

// Single source of truth for language code -> display name.
const LANGUAGES = {
  'en-US': 'English (US)',
  'vi-VN': 'Vietnamese',
  'fr-FR': 'French',
  'es-ES': 'Spanish',
  'de-DE': 'German',
  'zh-CN': 'Chinese (Mandarin)',
};

function getSupportedLanguages() {
  return LANGUAGES;
}

function isSupportedLanguage(code) {
  return Object.prototype.hasOwnProperty.call(LANGUAGES, code);
}

// Split text into <=maxLength chunks on sentence boundaries. A single sentence
// longer than maxLength becomes its own oversized chunk (Google still accepts it).
function chunkText(text, maxLength = CHUNK_SIZE) {
  if (text.length <= maxLength) return [text];
  const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > maxLength) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

// Generate concatenated MP3 audio for `text` in `language`. deps is an injection
// seam for tests; production uses google-tts-api (lazy-required) + global fetch.
async function generate(text, language, deps = {}) {
  const getAudioUrl = deps.getAudioUrl || require('google-tts-api').getAudioUrl;
  const fetchImpl = deps.fetchImpl || fetch;

  const chunks = chunkText(text);
  const buffers = [];
  for (const chunk of chunks) {
    const url = getAudioUrl(chunk, { lang: language, slow: false, host: 'https://translate.google.com' });
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`TTS fetch failed: ${res.status}`);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  return Buffer.concat(buffers);
}

// Resolve true if ffmpeg is available (static package preferred, else system ffmpeg).
// Awaitable so init() can complete detection before any command runs.
function checkFfmpeg() {
  return new Promise((resolve) => {
    try {
      const ffmpegStatic = require('ffmpeg-static');
      if (ffmpegStatic) return resolve(true);
    } catch { /* fall through to system check */ }
    require('child_process').exec('ffmpeg -version', (error) => resolve(!error));
  });
}

module.exports = {
  CHUNK_SIZE,
  MAX_INPUT_LENGTH,
  FETCH_TIMEOUT_MS,
  getSupportedLanguages,
  isSupportedLanguage,
  chunkText,
  generate,
  checkFfmpeg,
};
