// modules/tts/ttsEngine.js — Google TTS engine. Pure helpers carry no eager heavy
// imports so this file is unit-testable without npm deps installed; google-tts-api
// and ffmpeg-static are lazy-required / injectable.

const CHUNK_SIZE = 200;       // Google TTS per-request character ceiling
const MAX_INPUT_LENGTH = 1000; // hard cap on user input

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

module.exports = {
  CHUNK_SIZE,
  MAX_INPUT_LENGTH,
  getSupportedLanguages,
  isSupportedLanguage,
  chunkText,
};
