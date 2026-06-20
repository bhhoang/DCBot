// scripts/delete-music-emojis.js — wipe cached music_* emojis so the next
// icons:upload run gets fresh IDs that bypass Discord's edge cache.
const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'config.json');
const ICONS_PATH = path.join(ROOT, 'config', 'music-icons.json');

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const token = config.bot?.token;
  const appId = config.bot?.clientId;
  if (!token || token.startsWith('YOUR_DISCORD') || !appId) {
    console.error('❌ bot.token / bot.clientId not configured');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const all = await rest.get(Routes.applicationEmojis(appId));
  const list = Array.isArray(all) ? all : (all.items || []);
  const music = list.filter((e) => e.name && e.name.startsWith('music_'));

  console.log(`Deleting ${music.length} cached music_* emojis...`);
  let deleted = 0;
  let failed = 0;
  for (const e of music) {
    try {
      await rest.delete(Routes.applicationEmoji(appId, e.id));
      deleted++;
      console.log(`  🗑  ${e.name}`);
    } catch (err) {
      console.log(`  ❌ ${e.name}: ${err.message}`);
      failed++;
    }
    await delay(300);
  }
  console.log(`\n📊 deleted ${deleted}, failed ${failed}`);

  fs.writeFileSync(ICONS_PATH, '{}\n');
  console.log(`✅ mapping cleared → ${path.relative(ROOT, ICONS_PATH)}`);
  console.log('   Now run: npm run icons:upload');
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });