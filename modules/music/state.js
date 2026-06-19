// modules/music/state.js — in-memory per-guild ephemeral state. No persistence.
const PICKER_TTL_MS = 5 * 60 * 1000;

const guildStates = new Map();   // guildId -> GuildMusicState
const searchPickers = new Map(); // userId -> SearchPicker

function defaultState(guildId) {
  return {
    guildId,
    nowPlayingMessage: null,
    volume: 100,
    loopMode: 'off',
    preMuteVolume: null,
  };
}

function get(guildId) {
  return guildStates.get(guildId) || null;
}

function getOrCreate(guildId) {
  let s = guildStates.get(guildId);
  if (!s) {
    s = defaultState(guildId);
    guildStates.set(guildId, s);
  }
  return s;
}

function clear(guildId) {
  const s = guildStates.get(guildId);
  if (!s) return;
  // Clear ref to Now Playing message (do NOT delete the message here — player.js
  // may want to edit it first to show "Disconnected" before clearing).
  s.nowPlayingMessage = null;
  s.volume = 100;
  s.loopMode = 'off';
  s.preMuteVolume = null;
}

function setPicker(userId, picker) {
  // Cancel any prior picker's TTL before replacing.
  const prior = searchPickers.get(userId);
  if (prior && prior.ttlTimer) clearTimeout(prior.ttlTimer);

  picker.createdAt = Date.now();
  picker.ttlTimer = setTimeout(() => {
    const cur = searchPickers.get(userId);
    if (cur === picker) {
      searchPickers.delete(userId);
      // The ephemeral message stays but is now stale — any click hits the
      // stale-check handler in buttons.js/selects.js and gets a friendly reply.
    }
  }, PICKER_TTL_MS);
  searchPickers.set(userId, picker);
}

function getPicker(userId) {
  return searchPickers.get(userId) || null;
}

function clearPicker(userId) {
  const p = searchPickers.get(userId);
  if (!p) return;
  if (p.ttlTimer) clearTimeout(p.ttlTimer);
  searchPickers.delete(userId);
}

function getAllPickers() {
  return searchPickers.entries();
}

// Periodic GC — expires stale pickers (defense in depth in case setTimeout misses).
function gc() {
  const now = Date.now();
  for (const [userId, picker] of searchPickers) {
    if (now - picker.createdAt > PICKER_TTL_MS) {
      if (picker.ttlTimer) clearTimeout(picker.ttlTimer);
      searchPickers.delete(userId);
    }
  }
}

let gcInterval = null;
function startGc() {
  if (gcInterval) return;
  gcInterval = setInterval(gc, 30 * 1000);
}
function stopGc() {
  if (gcInterval) { clearInterval(gcInterval); gcInterval = null; }
}

module.exports = {
  get, getOrCreate, clear,
  setPicker, getPicker, clearPicker, getAllPickers,
  gc, startGc, stopGc,
  PICKER_TTL_MS,
};