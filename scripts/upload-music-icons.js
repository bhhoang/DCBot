#!/usr/bin/env node
// scripts/upload-music-icons.js — Upload icons as Discord application emojis.
// Reads token + clientId from config/config.json, writes the resulting ID
// mapping to config/music-icons.json so the music module can reference them
// via the { id, name } form of ButtonBuilder#setEmoji.
//
// Uses PATCH when an emoji ID already exists in music-icons.json so re-runs
// don't burn through Discord's 2000-emoji-per-application quota.
//
// Usage:
//   node scripts/upload-music-icons.js              # update changed, skip unchanged
//   node scripts/upload-music-icons.js --force     # PATCH every existing entry
//
// Requires: `sharp` (installed at root), valid bot token + clientId in
// config/config.json.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'config.json');
const ICONS_PATH = path.join(ROOT, 'config', 'music-icons.json');
const PHOSPHOR_CDN = 'https://cdn.jsdelivr.net/gh/phosphor-icons/core@main/assets/fill';
const PHOSPHOR_HOST = 'cdn.jsdelivr.net';
const BOOTSTRAP_CDN = 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/icons';
const BOOTSTRAP_HOST = 'cdn.jsdelivr.net';
const EMOJI_NAME_PREFIX = 'music_';
const FORCE = process.argv.includes('--force');
const UPLOAD_DELAY_MS = 750;

// Semantic key → icon source. Two libraries:
//   - 'phosphor' fill weight: transport buttons (rendered white via negate)
//   - 'bootstrap'           : status glyphs (bare filled shape, baked color)
const ICON_SOURCES = {
  pause:      'phosphor', play:       'phosphor', skip:       'phosphor',
  loop:       'phosphor', loopTrack:  'phosphor', shuffle:    'phosphor',
  queue:      'phosphor', volDown:    'phosphor', volUp:      'phosphor',
  volMute:    'phosphor', volSlider:  'phosphor', stop:       'phosphor',
  pagePrev:   'phosphor', pageNext:   'phosphor', cancel:     'bootstrap',
  trash:      'phosphor', check:      'bootstrap',
};

// Semantic key → source icon filename.
// Bootstrap icons are bare filled shapes (no surrounding box) so check/X
// land as just-the-glyph rather than glyph-in-rounded-square.
const ICON_MAP = {
  pause:      'pause-fill',
  play:       'play-fill',
  skip:       'skip-forward-fill',
  loop:       'repeat-fill',
  loopTrack:  'repeat-once-fill',
  shuffle:    'shuffle-fill',
  queue:      'playlist-fill',
  volDown:    'speaker-low-fill',
  volUp:      'speaker-high-fill',
  volMute:    'speaker-slash-fill',
  volSlider:  'sliders-horizontal-fill',
  stop:       'stop-fill',
  pagePrev:   'caret-left-fill',
  pageNext:   'caret-right-fill',
  cancel:     'x',
  trash:      'trash-fill',
  check:      'check',
};

// Baked color per icon. When set, the SVG's `currentColor` references are
// replaced with this hex before rasterizing. Unset icons default to white
// (rendered black then negated).
const ICON_COLORS = {
  check:  '#57F287',
  cancel: '#ED4245',
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchSvg(name, key, redirectsLeft = 5) {
  const source = ICON_SOURCES[key] || 'phosphor';
  const cdn = source === 'bootstrap' ? BOOTSTRAP_CDN : PHOSPHOR_CDN;
  const host = source === 'bootstrap' ? BOOTSTRAP_HOST : PHOSPHOR_HOST;
  return new Promise((resolve, reject) => {
    const req = https.get(`${cdn}/${name}.svg`, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          reject(new Error(`too many redirects fetching ${name}.svg`));
          return;
        }
        const target = new URL(res.headers.location, `https://${host}`);
        https.get(target, { timeout: 15000 }, (res2) => handleSvgResponse(res2, name, redirectsLeft - 1, resolve, reject))
          .on('error', reject)
          .on('timeout', function () { this.destroy(new Error(`timeout after 15s for ${name}.svg`)); });
        return;
      }
      handleSvgResponse(res, name, redirectsLeft, resolve, reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`timeout after 15s for ${name}.svg`)));
  });
}

function handleSvgResponse(res, name, redirectsLeft, resolve, reject) {
  if (res.statusCode !== 200) {
    reject(new Error(`HTTP ${res.statusCode} fetching ${name}.svg`));
    return;
  }
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => resolve(Buffer.concat(chunks)));
  res.on('error', reject);
}

async function svgToPng(svgBuffer, key) {
  let svgStr = svgBuffer.toString('utf8');
  const color = ICON_COLORS[key];
  if (color) {
    svgStr = svgStr.replace(/currentColor/g, color);
    return sharp(Buffer.from(svgStr), { density: 384 })
      .resize(128, 128)
      .png()
      .toBuffer();
  }
  svgStr = svgStr.replace(/currentColor/g, '#000000');
  return sharp(Buffer.from(svgStr), { density: 384 })
    .resize(128, 128)
    .png()
    .negate({ alpha: false })
    .toBuffer();
}

function sanitizeKey(key) {
  return key.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function loadJson(path_, fallback) {
  if (!fs.existsSync(path_)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(path_, 'utf8'));
  } catch (err) {
    throw new Error(`failed to parse ${path_}: ${err.message}`);
  }
}

async function listAppEmojis(rest, appId) {
  try {
    const result = await rest.get(Routes.applicationEmojis(appId));
    return Array.isArray(result) ? result : (result.items || []);
  } catch (err) {
    console.warn(`⚠️  could not list existing application emojis: ${err.message}`);
    return [];
  }
}

async function postEmoji(rest, appId, name, pngBuffer) {
  const image = `data:image/png;base64,${pngBuffer.toString('base64')}`;
  return rest.post(Routes.applicationEmojis(appId), { body: { name, image } });
}

async function patchEmoji(rest, appId, emojiId, name, pngBuffer) {
  const image = `data:image/png;base64,${pngBuffer.toString('base64')}`;
  return rest.patch(Routes.applicationEmoji(appId, emojiId), { body: { name, image } });
}

async function main() {
  const config = loadJson(CONFIG_PATH, {});
  const token = config.bot?.token;
  const appId = config.bot?.clientId;

  if (!token || token.startsWith('YOUR_DISCORD')) {
    console.error('❌ bot.token not configured in config/config.json');
    process.exit(1);
  }
  if (!appId || appId.startsWith('YOUR_BOT')) {
    console.error('❌ bot.clientId not configured in config/config.json');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  const existing = loadJson(ICONS_PATH, {});
  delete existing._;
  const mapping = { ...existing };

  const appEmojis = await listAppEmojis(rest, appId);
  const byName = new Map(appEmojis.map((e) => [e.name, e]));

  const total = Object.keys(ICON_MAP).length;
  let updated = 0;
  let created = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`📦 ${total} icons in manifest. Mode: ${FORCE ? 'force update all' : 'update changed only'}\n`);

  for (const [key, iconName] of Object.entries(ICON_MAP)) {
    const emojiName = `${EMOJI_NAME_PREFIX}${sanitizeKey(key)}`;
    const existingId = existing[key];
    const remote = existingId ? byName.get(emojiName) : null;

    if (!FORCE && existingId && remote) {
      console.log(`⏭️  ${key.padEnd(10)} unchanged (${existingId})`);
      skipped++;
      continue;
    }

    process.stdout.write(`⬆️  ${key.padEnd(10)} fetching ${iconName}.svg ... `);
    try {
      const svg = await fetchSvg(iconName, key);
      const png = await svgToPng(svg, key);
      let result;
      if (existingId) {
        result = await patchEmoji(rest, appId, existingId, emojiName, png);
        console.log(`🔁 updated ${emojiName} → ${result.id}`);
        updated++;
      } else {
        result = await postEmoji(rest, appId, emojiName, png);
        console.log(`✅ created ${emojiName} → ${result.id}`);
        created++;
      }
      mapping[key] = result.id;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed++;
    }

    await delay(UPLOAD_DELAY_MS);
  }

  const out = { ...mapping };
  fs.writeFileSync(ICONS_PATH, JSON.stringify(out, null, 2) + '\n');

  console.log(`\n📊 summary: ${updated} updated, ${created} created, ${skipped} skipped, ${failed} failed`);
  console.log(`✅ mapping written to ${path.relative(ROOT, ICONS_PATH)}`);
  if (updated + created > 0) {
    console.log('   Restart the bot to use the new icons.');
  }
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});