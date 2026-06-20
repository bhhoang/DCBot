// src/core/depStore/layout.js — pure path + name-encoding helpers, no IO.
const path = require('path');

// Split a store-entry key "name@version" on the LAST "@" so scoped names survive.
// "@discordjs/voice@0.16.1" -> { name: "@discordjs/voice", version: "0.16.1" }
function splitEntry(entry) {
  const at = entry.lastIndexOf('@');
  if (at <= 0) throw new Error(`Invalid store-entry key: ${entry}`);
  return { name: entry.slice(0, at), version: entry.slice(at + 1) };
}

// Make a store-entry key safe as a single directory segment: scope slash -> "+".
// "@discordjs/voice@0.16.1" -> "@discordjs+voice@0.16.1"
function entryDirName(entry) {
  return entry.replace('/', '+');
}

// Inverse of entryDirName: a store dir segment back to the "name@version" key.
// Kept here next to entryDirName so the encode/decode pair stays symmetric;
// callers must never hand-roll the reverse.
function decodeEntryDirName(dirName) {
  return dirName.replace('+', '/');
}

function storeRoot(modulesPath) {
  return path.join(modulesPath, '.store');
}

function storeEntryModulesPath(modulesPath, entry) {
  return path.join(storeRoot(modulesPath), entryDirName(entry), 'node_modules');
}

// Where the real package files live inside the entry (keeps the scoped subpath).
function storeEntryPackagePath(modulesPath, entry) {
  const { name } = splitEntry(entry);
  return path.join(storeEntryModulesPath(modulesPath, entry), ...name.split('/'));
}

function stagingPath(modulesPath, moduleName) {
  return path.join(storeRoot(modulesPath), '.staging', moduleName);
}

function closuresFile(modulesPath) {
  return path.join(storeRoot(modulesPath), 'closures.json');
}

function viewModulesPath(modulesPath, moduleName) {
  return path.join(modulesPath, '.views', moduleName, 'node_modules');
}

module.exports = {
  splitEntry,
  entryDirName,
  decodeEntryDirName,
  storeRoot,
  storeEntryModulesPath,
  storeEntryPackagePath,
  stagingPath,
  closuresFile,
  viewModulesPath,
};
