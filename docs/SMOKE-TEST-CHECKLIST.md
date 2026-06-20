# Manual Smoke-Test Checklist

These checks cover stateful, runtime behaviors that the unit tests in `test/`
cannot reach (Discord gateway events, voice, timers, hot reload). Run them
against a live test bot after deploying the `security-remediation` changes.

Mark each box once verified. If any check fails, capture the bot console output
and stop — do not ship.

## 1. Commands fire exactly once (reload listener fix — Phase 3)

- [ ] Start the bot (`npm start`); confirm it logs in and registers commands.
- [ ] Run any slash command once. Confirm you get **exactly one** response.
- [ ] Run `/reload <module>` for the module that owns that command.
- [ ] Run the same slash command again. Confirm you still get **exactly one**
      response (not two, three, etc.). Duplicate responses mean the
      `interactionCreate` listener was re-bound on reload.
- [ ] If legacy/prefix commands are enabled, repeat the once-only check for a
      prefix command before and after `/reload`.

## 2. Permission gating is fail-closed (Phase 3)

- [ ] As a non-owner user with no special roles, invoke a command whose
      configured `permissions` is empty/unset. Confirm you are **denied**
      ("You don't have permission to use this command.").
- [ ] As the same user, invoke a command configured with `@everyone`. Confirm
      it runs.
- [ ] As an owner (`config.bot.ownerIds`), confirm owner-only commands run.

## 3. Werewolf game integrity (Phase 4)

Start a full game and play through at least one complete day/night cycle.

- [ ] **No double vote:** Cast a vote, then attempt to vote again. Confirm the
      second attempt is rejected or replaces (not double-counts) the first.
- [ ] **Last-voter skip ends voting:** When the final remaining voter skips,
      confirm the day phase resolves immediately rather than waiting out the
      timer.
- [ ] **Day does not skip:** Confirm the discussion/voting day phase runs its
      full duration and is not skipped or fast-forwarded.
- [ ] **No double night-result processing:** Confirm night actions (kill, save,
      seer check) are applied exactly once — deaths/protections are not doubled
      and `advanceNightPhase` is not scheduled twice.
- [ ] **Cursed werewolf win condition:** With a cursed werewolf and villagers
      alive, confirm villagers are NOT declared winners while a cursed werewolf
      remains.
- [ ] **Timers stop on game end:** End a game (win condition or manual stop) and
      confirm no further phase timers fire afterward (no stray night/day
      advancement messages in the channel).

## 4. Werewolf reload mid-game (Phase 3 + Phase 4)

- [ ] Start a werewolf game and reach a phase with interactive buttons/selects.
- [ ] Run `/reload werewolf` while the game is active.
- [ ] Click a button / use a select menu. Confirm the interaction still fires
      **exactly once** and the game continues correctly.

## 5. Voice / TTS (if voice is used)

- [ ] Start `/werewolf` with voice enabled. Confirm the bot **joins** the voice
      channel and narration audio is audible.
- [ ] Play to game end. Confirm the bot **disconnects** from voice after the
      end announcement (no lingering voice connection).

## 6. Database — guild prefix (Phase 2)

- [ ] Set `database.enabled: true` (sqlite) in `config/config.json` and confirm
      `sqlite3@6` is installed.
- [ ] Restart the bot; confirm it connects to the sqlite database without error.
- [ ] Set a guild-specific prefix (via the relevant command or `setGuildSettings`).
- [ ] Confirm the new prefix is honored for legacy commands in that guild, and
      that it persists across a bot restart (get returns the stored value).
