// Tests for the win-condition fix: cursed werewolves must count as werewolves.
const { test } = require('node:test');
const assert = require('node:assert');

const WerewolfGame = require('../modules/werewolf/game');

// checkGameEnd only reads this.players and sets this.winner/this.state,
// so a bare prototype instance with a players map is enough to exercise it.
function makeGame(players) {
  const game = Object.create(WerewolfGame.prototype);
  game.players = players;
  return game;
}

test('cursed werewolf alive with 2 villagers: villagers do not win', () => {
  const game = makeGame({
    w1: { role: 'CURSED_WEREWOLF', isAlive: true },
    v1: { role: 'VILLAGER', isAlive: true },
    v2: { role: 'VILLAGER', isAlive: true }
  });

  game.checkGameEnd();

  assert.notStrictEqual(game.winner, 'DÂN LÀNG');
});

test('only villagers and seer alive: villagers win', () => {
  const game = makeGame({
    v1: { role: 'VILLAGER', isAlive: true },
    v2: { role: 'VILLAGER', isAlive: true },
    s1: { role: 'SEER', isAlive: true }
  });

  game.checkGameEnd();

  assert.strictEqual(game.winner, 'DÂN LÀNG');
});
