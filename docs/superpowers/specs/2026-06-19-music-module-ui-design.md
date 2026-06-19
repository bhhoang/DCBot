# Music Module UI & Feature Expansion

## Problem

`modules/music/index.js` (235 lines) is a minimal music player: `/play <query>` and `/stop` only. It has no:

- Search-result picker (user has no way to pick which result plays).
- Persistent "Now Playing" UI (users have to remember slash commands).
- Transport controls beyond play/stop (no pause, resume, skip, loop, shuffle).
- Volume control.
- Queue visibility or editing.

Playback itself works (the prior fix to `discord-player-youtubei@2.0.0` with `useYoutubeDL` + `generateWithPoToken` resolved the immediate `EmptyQueue` bug). The module is structurally ready for growth but the UI is a flat text reply (`✅ Added to queue: ...`) with nothing else.

This spec covers the v1 feature set: search picker, persistent Now Playing, transport commands, volume, and queue management. Lyrics, filters/EQ, playlist import, autoplay, and vote-skip are explicitly out of scope.

## Goals & Non-Goals

**Goals**

- `/play <query>` returns a paginated ephemeral picker (5/page, Prev/Next + Select Menu). User picks one track.
- One persistent "Now Playing" message per guild, updated in place on every state change. Houses transport buttons.
- Transport: pause, resume, skip, stop, loop (off/track/queue), shuffle.
- Volume: inline `−`/`+`/`mute` buttons on the Now Playing message + `🎚 Volume` modal for precise values + `/volume [0-200]` slash command shortcut.
- Queue visibility & editing: `/queue` (ephemeral, paginated 10/page) with per-track Remove button.
- Self-contained module: hot-reloadable via existing `modules/reload.js`.

**Non-Goals (defer to later iterations)**

- Vote-skip, autoplay, seek.
- Lyrics display.
- Filters / EQ (bass boost, nightcore, vaporwave, 8D).
- YouTube playlist import.
- DJ role system (permission scoping beyond `@everyone`).
- Per-user personal queues / favorites.
- Bot presence/activity showing the current track.
- Slider component for volume (modal covers the precise-value case; `−`/`+`/`mute` covers common cases).

## Module Structure

Convert `modules/music/` from a single-file directory module (`modules/music/index.js` only) into a directory module following the established `modules/tts/` and `modules/werewolf/` patterns:

```
modules/music/
  package.json         # Already declares all deps; no changes needed
  index.js             # Module entry: meta, init/shutdown, command defs, event wiring
  state.js             # Per-guild ephemeral state (Now Playing message refs, pickers, vol/loop)
  player.js            # discord-player wrapper: player singleton, queue helpers, voice helpers
  ui/
    embeds.js          # Pure builders for Now Playing / Search / Queue / Error embeds
    components.js      # Reusable ButtonBuilder / ActionRowBuilder factories
  interactions/
    router.js          # Routes interactionCreate by customId prefix
    buttons.js         # Button handlers (transport, queue remove, picker nav)
    selects.js         # StringSelectMenu handlers (search pick, queue remove-by-id)
  commands/
    play.js            # /play command (search + picker)
    transport.js       # /pause, /resume, /skip, /stop, /loop, /shuffle
    queue.js           # /queue, /volume, /nowplaying
```

`index.js` stays thin: declares the 9 commands and one `events: [{ name: 'interactionCreate', execute }]` handler that delegates to `interactions/router.js`. UI logic never lives in `index.js`.

## State Model

In-memory only. No DB persistence for ephemeral UI state.

```
GuildMusicState {
  nowPlayingMessage: { channelId: string, messageId: string } | null
  searchPickers:      Map<userId, SearchPicker>      // ephemeral per-user picker
  volume:             number (0-200, default 100)
  loopMode:           'off' | 'track' | 'queue'
}

SearchPicker {
  userId, guildId, channelId, messageId         // for edits/deletes
  query, tracks[], pageIndex                     // 5 tracks per page
  createdAt                                      // TTL 5 min, then discarded
}
```

`nowPlayingMessage` is the persistent message edited in place on every state change. Stored by `(channelId, messageId)` so player events can find and edit it.

`searchPickers` is keyed by `userId` (one picker per user at a time; new `/play` replaces the old). TTL via `setTimeout` at 5 min — the timeout handler removes the picker from the map AND deletes the ephemeral message so subsequent clicks fall through to the "Picker expired" error. New `/play` cancels any pending TTL for the prior picker (clears its `setTimeout`) before replacing the entry.

`volume` is per-guild. `loopMode` is per-guild.

## Custom-ID Convention

All interactive components use the prefix `music:`. The router strips it and dispatches by the next segment.

```
music:np:pause                                # Pause button
music:np:resume                               # Resume button
music:np:skip:1                               # Skip 1 (skip:N for N>1)
music:np:loop                                 # Cycle loop mode (off → track → queue → off)
music:np:shuffle                              # Shuffle queue
music:np:queue                                # Open ephemeral queue view
music:np:vol:down                             # Volume −10
music:np:vol:up                               # Volume +10
music:np:vol:mute                             # Toggle mute (preserves prior level for unmute)
music:vol:set:open                            # Opens the volume modal
music:search:page:prev:<userId>               # Picker page prev
music:search:page:next:<userId>               # Picker page next
music:search:cancel:<userId>                  # Picker cancel (delete ephemeral)
music:search:pick:<userId>                    # StringSelectMenu; value=trackIndex
music:queue:page:prev:<userId>                # Queue page prev
music:queue:page:next:<userId>                # Queue page next
music:queue:close:<userId>                    # Queue view close
music:queue:remove:<userId>                   # StringSelectMenu; value=queueIndex
```

`<userId>` embedded in ephemeral-related IDs lets handlers reject stale messages from other users' pickers/queues (defensive: ephemeral messages are user-private, so this is belt-and-suspenders against customId copy-paste).

## Commands

All commands are guild-only. Per-command cooldowns:

| Command | Options | Behavior | Cooldown |
|---|---|---|---|
| `/play` | `query: string (required)` | Search → ephemeral picker (does NOT auto-add) | 3s |
| `/pause` | — | Pause current track; ephemeral ack | 2s |
| `/resume` | — | Resume if paused; ephemeral ack | 2s |
| `/skip` | `count?: integer (1-25)` | Skip current + remove up to `count-1` next tracks from the queue (default 1 skips only current); ephemeral ack | 2s |
| `/stop` | — | Stop + disconnect + clear state | 2s |
| `/loop` | `mode: choice [off, track, queue]` | Set loop mode directly | 2s |
| `/shuffle` | — | Randomize queue order; ephemeral ack | 2s |
| `/queue` | — | Show ephemeral queue view (paginated) | 0s |
| `/volume` | `level?: integer (0-200)` | Show current (no arg) or set | 0s |

Voice-channel check: caller must be in the same voice channel as the bot, except for read-only `/queue` and `/volume` (no arg). Error messages are generic to the user; full error logs stay server-side (per `fix: return generic errors to users, keep details server-side`).

`/volume` shortcut exists alongside the inline buttons and modal — power users who prefer typing get a fast path. `/volume` with no arg shows the current level; with an arg sets it.

`/loop` takes an explicit `mode` choice rather than cycling. The persistent message's `🔁 Loop` button cycles (off → track → queue → off) because cycling is a natural button affordance. Slash users can pick a target state directly. Both paths write through the same `setLoop()` helper, so the embed's "Loop:" footer always reflects the current mode regardless of how it was changed.

## UI Layouts

### Persistent Now Playing message

Created on first `/play` that successfully queues a track. Lives in `state.nowPlayingMessage`. Updated in place by player events and by the `onQueueUpdate` hook (called by mutation commands).

```
┌─────────────────────────────────────────────┐
│ 🎵 Now Playing                              │
│ Rick Astley — Never Gonna Give You Up       │
│ [thumbnail 80x80]                           │
│ Duration: 3:33   Requested by: @alice       │
│ Loop: off   Volume: 100%                    │
├─────────────────────────────────────────────┤
│ [⏸ Pause] [⏭ Skip] [🔁 Loop] [🔀 Shuffle]  │ ← ActionRow 1
│ [📜 Queue] [🔉−] [🔊+] [🔇 Mute] [🎚 Volume]│ ← ActionRow 2
└─────────────────────────────────────────────┘
```

Two ActionRows, 5 buttons each (Discord limit).

When the queue is empty (after `EmptyQueue`): embed becomes "Nothing playing" with a single `▶ Play something` button that opens an ephemeral hint suggesting `/play <query>`.

When the bot is disconnected from voice (e.g. connection lost): embed becomes "Disconnected — use `/play` to start a new session" and all transport buttons render as disabled (`ButtonStyle` doesn't have a disabled flag — handlers short-circuit with an ephemeral reply instead).

### Ephemeral search picker

Sent by `/play` after search resolves. Embed shows the current page:

```
┌─────────────────────────────────────────────┐
│ 🔍 Search results for: "lofi hip hop"       │
│ Page 1 of 4                                 │
│                                             │
│ 1. Title — Channel — Duration               │
│ 2. Title — Channel — Duration               │
│ ...                                         │
├─────────────────────────────────────────────┤
│ [Select Menu: pick a track 1-5]             │
├─────────────────────────────────────────────┤
│ [◀ Prev] [Next ▶] [Cancel]                  │
└─────────────────────────────────────────────┘
```

`StringSelectMenu` with up to 5 options (label truncated to 100 chars, value = track index). On selection: discord-player queues the track, the ephemeral deletes itself, the persistent Now Playing message is created (first time) or updated.

If a query returns ≤5 tracks, Prev/Next buttons are hidden (only Cancel shown).

### Ephemeral queue view

Sent by `/queue` or by clicking `📜 Queue` on the persistent message. 10 tracks per page.

```
┌─────────────────────────────────────────────┐
│ 📜 Queue (12 tracks) — Page 1 of 2          │
│                                             │
│ 1. Song A — 3:33 — @alice                   │
│ 2. Song B — 4:12 — @bob                     │
│ ...                                         │
├─────────────────────────────────────────────┤
│ [Select Menu: remove a track 1-10]          │
├─────────────────────────────────────────────┤
│ [◀ Prev] [Next ▶] [Clear All] [Close]       │
└─────────────────────────────────────────────┘
```

Tracks render in queue order. The Select Menu lets the user pick one to remove (ephemeral ack on selection; the persistent view re-renders to drop that track). `Clear All` is a confirmation button (uses a second confirm ephemeral to avoid accidental clears).

`Close` deletes the ephemeral message.

## Player Wrapper

`player.js` exposes a thin facade over discord-player:

```
player.js
  init(client)                              // creates Player singleton, registers extractors
                                            // (useYoutubeDL: true, generateWithPoToken: true),
                                            // wires player.events → state updates
  getQueue(guildId)                         // returns GuildQueue | null
  search(query)                             // returns Track[] (does NOT add to queue)
  addTrack(guildId, track, requestedBy)     // adds to queue, returns the new track
  pause(guildId) / resume(guildId) / skip(guildId, count=1)
  stop(guildId)                             // queue.delete() + state cleanup
  shuffle(guildId)
  setLoop(guildId, mode)                    // 'off' | 'track' | 'queue'
  setVolume(guildId, level)                 // 0-200
  getVolume(guildId)                        // returns { level, isMuted }
  toggleMute(guildId)
  onQueueUpdate(guildId)                    // refresh Now Playing message
  getNowPlaying(guildId)                    // returns Track | null
```

`search()` returns an array — the picker shows up to 5 at a time. `addTrack()` is what `/play`'s picker callback calls. The picker does NOT pre-add the picked track — `addTrack()` is called explicitly on user selection.

`init()` subscribes to:

- `GuildQueueEvent.PlayerStart` → update Now Playing (new track info, buttons enabled)
- `GuildQueueEvent.PlayerPause` → update buttons (Pause → Resume)
- `GuildQueueEvent.PlayerResume` → update buttons (Resume → Pause)
- `GuildQueueEvent.PlayerFinish` → no UI update needed; the next PlayerStart fires if queue has more
- `GuildQueueEvent.EmptyQueue` → clear Now Playing message + state
- `GuildQueueEvent.Error` / `PlayerError` → edit Now Playing with error footer; keep playing if queue has more
- `GuildQueueEvent.Disconnect` → clear Now Playing message + state

Each handler resolves the `GuildQueue` to a `GuildMusicState` via `state.get(guildId)` and edits the persistent message if present.

## Error Handling

| Failure | Surface |
|---|---|
| Search throws | Ephemeral: "Couldn't search: {query}". Server log: full error. |
| `addTrack` throws | Ephemeral: "Couldn't queue that track". Server log: full error. |
| Modal submit with non-integer or out-of-range | Ephemeral validation, modal stays open. |
| CustomId belongs to another user's picker/queue | Silently ignore (return without replying). |
| Stale picker (TTL expired) | Ephemeral: "Picker expired — please /play again." |
| User not in voice channel | Ephemeral: existing message (already in current code). |
| Bot missing perms | Ephemeral: existing message. |
| Voice connection lost | Now Playing updated; transport buttons short-circuit to ephemeral "Reconnect via /play". |

Per-user interaction lock (prevents double-click race on rapid page navigation): `interactionsInProgress.set(userId, Date.now())` with 1s timeout. Same pattern as `modules/werewolf/handlers/buttonHandlers.js:5`.

## Permissions

All commands default to `['@everyone']` matching the current behavior. DJ role scoping is deferred (non-goal).

## Testing

No tests required for v1 (matches the codebase's general approach — only some modules have tests, and the existing music module has none). The code should be structured to be testable later: `player.js` and `state.js` are pure logic, only `interactions/*` touches Discord.js types.

## Dependencies

No new packages. Existing deps cover everything:

- `discord-player@^7.2.0` (playback, queue, events)
- `discord-player-youtubei@^2.0.0` (search via youtubei.js)
- `@discord-player/extractor@^7.1.0` (other extractors)
- `youtubei.js@^16.0.1` (Innertube client)
- `youtube-dl-exec@^3.0.10` (stream extraction)
- `discord.js` (components, embeds)

The existing `package.json` already declares all of these (from the prior fix work).

## Migration / Backward Compatibility

- All slash commands are **new**; no existing command is renamed or removed.
- `stop` command behavior changes slightly: it now also clears `GuildMusicState` (nowPlayingMessage ref, picker, vol/loop — though vol/loop are typically retained across sessions, spec keeps them simple for v1).
  - **Open question:** keep `volume`/`loopMode` across `/stop` or reset? Default in v1: reset to defaults (100, off) on `/stop`. Future iteration could persist.
- Legacy prefix commands (`!play`, `!stop`) keep working but show ephemeral picker for `!play` (no auto-add from prefix either).
- No DB schema changes.

## Out of Scope (Explicit)

These are documented in the Goals section but listed here for clarity:

- Vote-skip
- Autoplay / radio
- Seek (jump to timestamp)
- Lyrics display
- Filters / EQ
- Playlist import (`/play <playlist-url>`)
- DJ role / per-user queues / favorites
- Bot presence showing current track
- Slider component for volume (modal is sufficient for v1)

Each can be added in its own focused iteration; the modular structure here is designed to absorb them without major refactor.