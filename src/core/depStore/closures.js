// src/core/depStore/closures.js — pure logic for the recomputed-refcount GC model. No IO.
const crypto = require('crypto');

// Stable hash of a module's declared deps ({ name: range }), order-independent.
// Used as the fast-path key: unchanged hash => skip the npm staging install.
function hashDeclaredDeps(deps) {
  const normalized = Object.keys(deps || {})
    .sort()
    .map((name) => `${name}@${deps[name]}`)
    .join('\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Extract every resolved "name@version" from an npm v3 package-lock, skipping the
// root ("") entry. Keys look like "node_modules/lodash" or
// "node_modules/a/node_modules/b"; the real package name is the segment after the
// LAST "node_modules/".
function parseClosureFromLock(lock) {
  const packages = (lock && lock.packages) || {};
  const out = [];
  for (const [key, info] of Object.entries(packages)) {
    if (key === '') continue; // root staging package
    const marker = 'node_modules/';
    const idx = key.lastIndexOf(marker);
    if (idx === -1) continue;
    const name = key.slice(idx + marker.length);
    if (!info || !info.version) continue;
    out.push(`${name}@${info.version}`);
  }
  return out;
}

// Union of closure arrays for the named live modules.
// closures: { moduleName: { deps, closure: string[] } }
function computeLiveSet(closures, liveModuleNames) {
  const live = new Set();
  for (const name of liveModuleNames) {
    const entry = closures[name];
    if (!entry || !Array.isArray(entry.closure)) continue;
    for (const dep of entry.closure) live.add(dep);
  }
  return live;
}

// Store entries (array of "name@version") not present in the live set.
function findOrphans(storeEntries, liveSet) {
  return storeEntries.filter((entry) => !liveSet.has(entry));
}

// New closures object containing only keys for currently-present modules.
function pruneClosures(closures, presentModuleNames) {
  const present = new Set(presentModuleNames);
  const out = {};
  for (const [name, value] of Object.entries(closures)) {
    if (present.has(name)) out[name] = value;
  }
  return out;
}

module.exports = {
  hashDeclaredDeps,
  parseClosureFromLock,
  computeLiveSet,
  findOrphans,
  pruneClosures,
};
