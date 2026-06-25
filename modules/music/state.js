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
    progressTimer: null,
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
  // Stop any live progress ticker before dropping refs.
  stopProgressTimer(guildId);
  // Clear ref to Now Playing message (do NOT delete the message here — player.js
  // may want to edit it first to show "Disconnected" before clearing).
  s.nowPlayingMessage = null;
  s.volume = 100;
  s.loopMode = 'off';
  s.preMuteVolume = null;
}

// Per-guild live progress ticker. Owns the setInterval lifecycle: clears any
// prior timer before setting a new one, and unrefs so it never holds the process
// open. fn is invoked on each tick.
function startProgressTimer(guildId, fn, intervalMs = 7000) {
  const s = getOrCreate(guildId);
  if (s.progressTimer) clearInterval(s.progressTimer);
  s.progressTimer = setInterval(fn, intervalMs);
  if (s.progressTimer.unref) s.progressTimer.unref();
}

function stopProgressTimer(guildId) {
  const s = guildStates.get(guildId);
  if (s && s.progressTimer) {
    clearInterval(s.progressTimer);
    s.progressTimer = null;
  }
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
  // Stop every per-guild progress ticker too, so module shutdown leaves no timers.
  for (const guildId of guildStates.keys()) stopProgressTimer(guildId);
}

module.exports = {
  get, getOrCreate, clear,
  setPicker, getPicker, clearPicker, getAllPickers,
  startProgressTimer, stopProgressTimer,
  gc, startGc, stopGc,
  PICKER_TTL_MS,
};