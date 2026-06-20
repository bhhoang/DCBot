// Tests for the SQL column allowlist in DatabaseManager.setGuildSettings (sqlite).
const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DatabaseManager } = require('../src/core/databaseManager');

const dbPath = path.join(os.tmpdir(), `dcbot_allowlist_${process.pid}_${Date.now()}.sqlite`);

function makeDb() {
  return new DatabaseManager({ type: 'sqlite', path: dbPath });
}

test('rejects an unknown (injection-style) column key', async () => {
  const db = makeDb();
  await db.connect();
  try {
    await assert.rejects(
      () => db.setGuildSettings('g1', { 'evil; DROP TABLE guild_settings;--': 1 }),
      /Invalid guild_settings column/
    );
  } finally {
    await db.disconnect();
  }
});

test('accepts a known column key', async () => {
  const db = makeDb();
  await db.connect();
  try {
    const result = await db.setGuildSettings('g1', { prefix: '!' });
    assert.strictEqual(result.prefix, '!');
  } finally {
    await db.disconnect();
  }
});

after(() => {
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }
});
