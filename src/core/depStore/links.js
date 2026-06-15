// src/core/depStore/links.js — junction creation (loud failure) and safe removal. IO.
const fs = require('fs');
const path = require('path');

// Create a directory junction at linkPath pointing to targetDir.
// Idempotent: an existing correct junction is left as-is; a wrong/leftover entry
// is removed first. Throws loudly on failure (no silent copy fallback).
function ensureJunction(linkPath, targetDir) {
  if (!fs.existsSync(targetDir)) {
    throw new Error(`[DEP-STORE] junction target missing: ${targetDir}`);
  }
  if (fs.existsSync(linkPath)) {
    try {
      const current = fs.readlinkSync(linkPath);
      const resolved = path.resolve(path.dirname(linkPath), current);
      if (resolved === path.resolve(targetDir)) return; // already correct
    } catch {
      // Not a link (a real dir/file left behind) — fall through to replace it.
    }
    safeRemove(linkPath);
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  // 'junction' is the Windows-friendly mode: no admin rights, dir targets only.
  fs.symlinkSync(targetDir, linkPath, 'junction');
}

// Recursive remove that never throws (a locked native .node on Windows is logged
// and skipped so GC stays non-fatal). Returns true if the path is gone afterward.
function safeRemove(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`[DEP-STORE] could not remove ${targetPath}: ${error.message}`);
    return !fs.existsSync(targetPath);
  }
}

module.exports = { ensureJunction, safeRemove };
