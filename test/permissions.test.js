// Tests for fail-closed permission resolution in CommandHandler.userHasPermission.
const { test } = require('node:test');
const assert = require('node:assert');

const { CommandHandler } = require('../src/core/commandHandler');

// Minimal bot stub. The constructor builds a REST client with the token,
// so config.bot.token must be a non-empty string.
function makeHandler(ownerIds = []) {
  const bot = {
    config: {
      bot: { token: 'test-token', ownerIds }
    }
  };
  return new CommandHandler(bot);
}

// Member factory: roles.cache is an array (iterated with .some()).
function makeMember(roleNames = [], id = 'user-1') {
  return {
    user: { id },
    permissions: { has: () => true },
    roles: { cache: roleNames.map(n => ({ name: n, id: n })) }
  };
}

test('empty permissions array denies (fail closed)', () => {
  const handler = makeHandler();
  assert.strictEqual(handler.userHasPermission(makeMember(['Member']), { permissions: [] }), false);
});

test('@everyone permission allows', () => {
  const handler = makeHandler();
  assert.strictEqual(handler.userHasPermission(makeMember([]), { permissions: ['@everyone'] }), true);
});

test('member with matching role is allowed', () => {
  const handler = makeHandler();
  assert.strictEqual(handler.userHasPermission(makeMember(['Admin']), { permissions: ['Admin'] }), true);
});

test('member without matching role is denied', () => {
  const handler = makeHandler();
  assert.strictEqual(handler.userHasPermission(makeMember(['Member']), { permissions: ['Admin'] }), false);
});

test('DM (no member) is always allowed', () => {
  const handler = makeHandler();
  assert.strictEqual(handler.userHasPermission(null, { permissions: [] }), true);
});
