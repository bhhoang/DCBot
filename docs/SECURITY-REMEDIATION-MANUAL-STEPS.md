# Operator Manual Steps — Security Remediation

These steps require operator access and CANNOT be done by the implementer.

## 1. Rotate the exposed Gemini key (DO THIS FIRST)

The key `AIzaSyC_8K-M-K8coP37yyRnyjZ3YzIbiOCSVKc` was committed to git history
(commit `3a86c3b`) and must be treated as fully compromised.

1. Open Google Cloud Console → APIs & Services → Credentials.
2. Delete/revoke the leaked key.
3. Create a new key, restrict it to the Generative Language API.
4. Set it locally via env var `GEMINI_API_KEY` or `config/config.json` → `gemini.apiKey`.
   (config.json is now gitignored, so it will not be committed.)

## 2. Purge the key from git history (AFTER rotation)

Removing the line from the current file does NOT remove it from history. Rewrite
history only after the key is dead:

```bash
# Requires git-filter-repo (pip install git-filter-repo)
git filter-repo --replace-text <(echo 'AIzaSyC_8K-M-K8coP37yyRnyjZ3YzIbiOCSVKc==>REDACTED')
git push --force --all
git push --force --tags
```

WARNING: This is a destructive history rewrite + force-push. Every collaborator
must re-clone or hard-reset to the rewritten history afterward. Coordinate before running.

## Module Dependency Store — manual smoke tests

Run after deploying the dep-store change. Requires a bot token and a scratch guild.

1. **Cold boot from empty store.**
   - Delete `modules/.store/` and `modules/.views/` if present.
   - `npm start`. Expect `Checking module dependencies...` then `Running dependency store GC...` with no `[DEP-STORE-FAILED]` lines.
   - Confirm `modules/.store/` contains one dir per resolved `name@version`, and `modules/.views/gemini/node_modules` + `modules/.views/tts/node_modules` exist as junctions (`dir /AL modules\.views\tts\node_modules` in cmd shows `<JUNCTION>`).
   - Confirm shared packages (`@discordjs+voice@...`, `libsodium-wrappers@...`, `ffmpeg-static@...`) appear exactly once under `.store`.

2. **TTS actually plays audio.** In the scratch guild, join a voice channel and run the TTS command. Expect audible speech — proves junctioned `@discordjs/voice` + native opus resolve through the view.

3. **Gemini chat works.** Run the gemini command; expect a normal AI reply — proves `@google/genai` resolves through the view.

4. **Disable a module, reload, confirm reclaim.**
   - Add a single-file module's name (e.g. `tts`) to `disabled` in `config/modules.json`.
   - Run the `reload` command. Expect `[DEP-STORE] reclaimed ...` lines for packages exclusive to `tts`, while packages still referenced by `gemini`/`music` survive (`@discordjs/voice` should NOT be reclaimed if `music` is in the store).
   - Confirm `modules/.views/tts` is gone and other modules still respond.

5. **Opt-out path for music.** Set `"isolatedInstall": true` in `modules/music/package.json`, reboot.
   - Expect `modules/music/node_modules` populated as a normal install (not junctions) and music playback still works.
   - Expect `.store` to shrink (music-only packages reclaimed on the next GC).

6. **Corrupt closures.json self-heals.** Stop the bot, overwrite `modules/.store/closures.json` with `not json`, reboot. Expect `corrupt closures.json, rebuilding` and a clean boot with views rebuilt.

## TTS Module Redesign — manual smoke tests

Run after deploying the TTS redesign. Requires a bot token and a scratch guild with a voice channel.

1. **Boot + dependency install.** Start the bot. Expect `✅ TTS module initialized!`
   (not the FFmpeg warning). Confirm `modules/tts/` deps installed without
   `[DEP-STORE-FAILED]` / install errors.
2. **Basic playback.** Join a voice channel, run `/tts text:"hello world"`. Expect
   audible speech and the embed "Queued message from ... in Vietnamese" (default).
   Confirm the temp `.mp3` is deleted after playback (`temp/tts/` empties).
3. **Language selection.** Run `/tts text:"bonjour" language:French`. Expect French speech
   and the embed shows "French".
4. **Long text chunking.** Run `/tts` with >200 chars spanning multiple sentences.
   Expect the whole message plays as one continuous clip (chunks concatenated).
5. **Queue serialization.** Fire three `/tts` calls in quick succession. Expect them
   to play in order, one after another — not overlapping, no `activeConnections` clobber.
6. **Idle-disconnect.** After the queue drains, expect the bot to leave the channel
   ~10s later. Then run `/tts` again within the window (before it leaves) and confirm
   it reuses the live connection (no reconnect delay).
7. **Listener-leak check.** Run `/tts` ~10 times in the same guild over a few minutes.
   Expect no growing "MaxListenersExceededWarning" and stable memory — the per-guild
   connection reuse + listener removal should keep listener counts flat.
8. **FFmpeg-missing path.** Temporarily rename the ffmpeg-static binary (or test on a
   box without it), run `/tts`. Expect the install-hint message, not a crash.
9. **Diagnostic.** Run `/tts-diagnostic`. Expect correct FFmpeg ✅/❌ and voice-channel
   status reflecting whether you're in a channel.
10. **Legacy prefix path.** Run the prefix form (e.g. `!tts fr-FR bonjour`). Expect the
    same behavior as the slash command (confirms the non-deferred `replyOrEdit` branch).
