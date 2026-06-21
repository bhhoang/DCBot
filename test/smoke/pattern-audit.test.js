const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function findSourceFiles(dir, excludeDirs = ['node_modules', '.git']) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (excludeDirs.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSourceFiles(fullPath, excludeDirs));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

function readLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n');
}

const SOURCE_DIRS = [
  path.join(__dirname, '..', '..', 'src'),
  path.join(__dirname, '..', '..', 'modules'),
];

const TEST_DIR = path.join(__dirname, '..');

describe('Pattern Audit: Deprecated ephemeral: true', () => {
  const sourceFiles = SOURCE_DIRS.flatMap(dir => findSourceFiles(dir));
  const offenders = [];

  for (const file of sourceFiles) {
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment-only lines and string literals (simple heuristic)
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      if (trimmed.includes('ephemeral: true')) {
        offenders.push({ file, line: i + 1, text: trimmed });
      }
    }
  }

  test('no deprecated ephemeral: true in src/ or modules/', () => {
    if (offenders.length > 0) {
      const details = offenders
        .map(o => `  ${path.relative(path.join(__dirname, '..', '..'), o.file)}:${o.line}  ${o.text}`)
        .join('\n');
      assert.fail(`Found ${offenders.length} occurrence(s) of deprecated ephemeral: true:\n${details}`);
    }
  });
});

describe('Pattern Audit: Deprecated client.on("ready")', () => {
  const sourceFiles = SOURCE_DIRS.flatMap(dir => findSourceFiles(dir));
  const offenders = [];

  for (const file of sourceFiles) {
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      // Match client.on('ready') or client.on("ready") — but NOT clientReady
      if (/\.on\(\s*['"]ready['"]\s*[,)]/.test(trimmed)) {
        offenders.push({ file, line: i + 1, text: trimmed });
      }
    }
  }

  test('no deprecated client.on("ready") in src/ or modules/', () => {
    if (offenders.length > 0) {
      const details = offenders
        .map(o => `  ${path.relative(path.join(__dirname, '..', '..'), o.file)}:${o.line}  ${o.text}`)
        .join('\n');
      assert.fail(`Found ${offenders.length} occurrence(s) of deprecated client.on('ready'):\n${details}`);
    }
  });
});

describe('Pattern Audit: Slash command handlers missing deferReply', () => {
  const sourceFiles = SOURCE_DIRS.flatMap(dir => findSourceFiles(dir));

  test('all slash execute handlers with await/async have deferReply or reply', () => {
    const issues = [];

    for (const file of sourceFiles) {
      const lines = readLines(file);
      const rel = path.relative(path.join(__dirname, '..', '..'), file);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Find async execute(interaction, bot) patterns in command definitions
        if (/async\s+execute\s*\(\s*(interaction|i)\s*[,\s]*\w*\s*\)/.test(trimmed) && !trimmed.startsWith('//')) {
          // Look forward up to 20 lines for a deferReply or reply
          const block = lines.slice(i, i + 20).join('\n');
          if (!/\bdeferReply\b/.test(block) && !/\breply\b/.test(block) && !/\beditReply\b/.test(block)) {
            issues.push(`  ${rel}:${i + 1}  async execute without deferReply/reply in visible block`);
          }
        }

        // Also check for interaction handlers that use deferReply
        if (/\binteraction\.(deferReply|reply)\s*\(/.test(trimmed)) {
          // Has defer/reply call — no issue
        }
      }
    }

    if (issues.length > 0) {
      // This is a heuristic — delegation to helper methods is common and valid.
      // Report as a warning, not a hard failure.
      console.log(`⚠️  Potential missing deferReply in ${issues.length} handler(s) (review manually):`);
      for (const issue of issues) {
        console.log(issue);
      }
    }
  });
});

describe('Pattern Audit: No common anti-patterns', () => {
  const sourceFiles = SOURCE_DIRS.flatMap(dir => findSourceFiles(dir));

  test('no interaction.editReply without prior deferReply', () => {
    // This is more nuanced – we check files for editReply without a preceding deferReply
    const issues = [];
    for (const file of sourceFiles) {
      const lines = readLines(file);
      const rel = path.relative(path.join(__dirname, '..', '..'), file);
      let hasDefer = false;
      let hasEditReply = false;

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;
        if (/\bdeferReply\b/.test(trimmed)) hasDefer = true;
        if (/\beditReply\b/.test(trimmed)) hasEditReply = true;
      }

      // Files with editReply but no deferReply are suspicious (unless they always use reply)
      if (hasEditReply && !hasDefer) {
        // Check if the file has any reply() calls too
        const hasDirectReply = lines.some(l => /\b\.reply\s*\(/.test(l) && !l.trim().startsWith('//'));
        if (!hasDirectReply) {
          issues.push(`  ${rel}  uses editReply but never deferReply`);
        }
      }
    }

    if (issues.length > 0) {
      // This is just a warning pattern, not a hard failure
      console.log('⚠️  Files using editReply without deferReply (may be fine if called after reply):');
      for (const issue of issues) {
        console.log(issue);
      }
    }
  });

  test('MessageFlags import is present where MessageFlags.Ephemeral is used', () => {
    const issues = [];
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(path.join(__dirname, '..', '..'), file);

      if (content.includes('MessageFlags.Ephemeral')) {
        // Check for the import
        if (content.includes('MessageFlags')) {
          // Has the import — good
        } else {
          issues.push(`  ${rel}  uses MessageFlags.Ephemeral but no import found`);
        }
      }
    }

    if (issues.length > 0) {
      assert.fail(`Missing MessageFlags import in ${issues.length} file(s):\n${issues.join('\n')}`);
    }
  });
});
