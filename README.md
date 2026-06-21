# DCBot

A modular Discord bot built on [discord.js](https://discord.js.org/) v14. The core is a thin host that discovers, loads, and wires up self-contained feature modules — almost all functionality lives in `modules/`, and adding a feature is just dropping a new file there.

The bot ships with music playback, text-to-speech, a Vietnamese-language Werewolf/Mafia game with AI-driven discussion, a Gemini chat command, plus utility commands (clear, help, invite, reload, logger).

---

## Features

- **Modular architecture** — every feature is a self-contained module under `modules/`. No core changes required to add one.
- **Slash and legacy prefix commands** — both interaction styles are dispatched from the same module definition.
- **Per-module npm dependencies** — modules declare their own `package.json` (or `meta.npmDependencies`) and are installed automatically on boot.
- **Hot reload** — the `reload` module exposes `/reload` and `/deploy` admin commands for development without restarting.
- **Optional persistence** — sqlite (default) or MongoDB behind a single interface.
- **Music** — YouTube, Spotify, SoundCloud, Apple Music, Vimeo, Reverbnation, and attachment playback via `@discordjs/voice` + `discord-player`.
- **Werewolf/Mafia game** — full game loop with roles (Werewolf, Seer, Bodyguard, Witch, Hunter, Cursed Werewolf, Villager), AI players, and Vietnamese UI.
- **Text-to-speech** — voice channel TTS with per-channel queueing.
- **Gemini chat** — per-user conversation history backed by Google Generative AI.

---

## Requirements

- **Node.js** 18+ (Node 20 LTS recommended)
- A Discord application + bot token — see the [Discord developer portal](https://discord.com/developers/applications)
- FFmpeg available on `PATH` for music playback and TTS
- Optional: Google Generative AI API key for the Gemini module

---

## Installation

```bash
git clone <repo-url> DCBot
cd DCBot
npm install
```

That's it for the root. Module-specific dependencies are installed automatically by the `DependencyManager` on first boot — you do not run `npm install` inside a module directory by hand.

The bot will not start without `config/config.json`. If the file is missing, `index.js` creates a default `config/config.json` and `config/modules.json` with placeholder values on first run. Edit `config/config.json` and set at minimum `bot.token`, `bot.clientId`, and `bot.ownerIds` before restarting.

---

## Configuration

### `config/config.json`

Loaded at startup. A working example lives at `config/config.example.json`.

| Key | Purpose |
| --- | --- |
| `bot.token` | Discord bot token. **Required.** |
| `bot.clientId` | Bot application client ID. |
| `bot.ownerIds` | User IDs granted owner-only command access. |
| `bot.prefix` | Legacy prefix command prefix (default: `!`). |
| `commands.registerSlashCommands` | Whether to register slash commands on boot. |
| `commands.enableLegacyCommands` | Whether legacy `!command` style works. |
| `commands.cooldown` | Per-user command cooldown in seconds. |
| `development.testGuildId` | If set, slash commands register to this guild only — instant dev updates, no global cache delay. |
| `database.enabled` | Enable persistence (off by default). Guild-specific prefixes and `getGuildSettings`/`setModuleData` require this. |
| `database.type` | `sqlite` (default, `./data/database.sqlite`) or `mongodb`. |
| `gemini.apiKey` | Google Generative AI key. Can also come from the `GEMINI_API_KEY` env var. |
| `music.spotify.clientId` / `clientSecret` | Required for Spotify playback. URL detection and search work without them; streaming does not. |
| `permissions.adminRoles` / `moderationRoles` / `djRoles` | Role names resolved per guild. |

### `config/modules.json`

Controls module enablement. A module is enabled unless its name appears in the top-level `disabled` array:

```json
{
  "disabled": ["werewolf"]
}
```

Modules can also carry per-module `settings` and `permissions` blocks here — see an enabled module's source for the shape it expects.

> **Security:** anything placed in `modules/` is auto-`require`d at boot and executes immediately. Treat the directory as trusted code only. Native dependency installs are blocked from running scripts unless the package is on the explicit allowlist in `src/core/dependencyManager.js` — add new native packages there before depending on them.

---

## Usage

```bash
npm start            # Run the bot
npm test             # Run the test suite (node --test)
npm run icons:upload # Upload the music module's UI icons to Discord
```

Logs go to `./logs/<YYYY-MM-DD>.log` and `./logs/<YYYY-MM-DD>-error.log` by default. Set `logging.fileOutput: false` to disable.

### Slash command updates during development

Discord caches global slash commands and updates can take up to an hour to propagate. For instant dev updates, either:

1. Set `development.testGuildId` in `config/config.json` to your dev guild's ID, or
2. Run `/deploy` in the target guild (requires Administrator).

Both register directly to the guild and bypass the global cache.

---

## Modules

Every module is either `modules/<name>.js` (single file) or `modules/<name>/index.js` (directory). Each exports:

```js
module.exports = {
  meta: {
    name, type, version, description,
    dependencies: [],         // other modules that must load first
    npmDependencies: { ... }  // for single-file modules
  },
  async init(client, bot) { ... },
  async shutdown() { ... },
  commands: [ /* see Module contract below */ ],
  events:   [ { name, once?, execute(...args, bot) } ]
};
```

### Bundled modules

| Module | What it does |
| --- | --- |
| `clear` | Bulk message deletion. |
| `gemini` | Google Generative AI chat with per-user conversation history. Requires `gemini.apiKey`. |
| `help` | `/help` command — lists available commands. |
| `invite` | `/invite` command — generates an OAuth invite link. |
| `logger` | Per-guild event logging to a configured channel. |
| `reload` | `/reload [module]` and `/deploy` — admin commands for hot-reloading modules and re-registering slash commands to the current guild. |
| `music` | Full voice playback. YouTube, Spotify (with creds), SoundCloud, Apple Music, Vimeo, Reverbnation, Attachment. Use `/providers` to inspect what's loaded. Has its own `package.json`/`node_modules`. |
| `tts` | Voice channel text-to-speech with per-channel queues. |
| `werewolf` | Vietnamese-language Werewolf/Mafia game. Roles in `roles/`, button/select-menu/command handlers in `handlers/`, AI players in `ai/`. |

### Adding a feature

Create a new file or directory under `modules/`. Give it a `meta.name`, declare any npm deps, implement `init`, and add `commands`/`events`. It is picked up automatically on next start (no core changes needed) unless its name is in `modules.json`'s `disabled` array.

---

## Architecture

### Boot sequence (`index.js` → `Bot.initialize()`)

1. Connect database (if enabled) — `DatabaseManager`
2. Check/install module npm dependencies — `DependencyManager`
3. Load modules (dependency-ordered) — `ModuleLoader`
4. Register commands from modules — `CommandHandler`
5. Register events from modules — `EventHandler`
6. Wire core Discord events, then `login()`

### Core components (`src/core/`)

- **`bot.js`** — owns the discord.js `Client`, holds references to all managers, sets presence, handles graceful shutdown.
- **`moduleLoader.js`** — discovers modules, topologically sorts by `meta.dependencies` (with cycle detection), loads each via a custom per-module `require` that resolves npm packages from the module's own `node_modules` first, then the shared `modules/node_modules`, then the root.
- **`commandHandler.js`** — collects commands from all modules, registers slash commands with Discord (to `development.testGuildId` if set, otherwise globally), and routes `interactionCreate` and `messageCreate` to the right handler. Enforces cooldowns and role/permission checks.
- **`eventHandler.js`** — registers module `events` on the client. Always appends the `bot` instance as the last argument to each handler.
- **`dependencyManager.js`** — runs `npm install` for directory modules with a `package.json` and missing/stale `node_modules`, and aggregates single-file modules' `meta.npmDependencies` into `modules/package.json` for a shared install. Runs with `--ignore-scripts`; native deps must be on the explicit allowlist (update the file when adding new native modules).
- **`databaseManager.js`** — optional persistence layer; supports sqlite (default) and MongoDB behind one interface (`getGuildSettings`, `setGuildSettings`, `getModuleData`, `setModuleData`).

### Module command contract

A command declares both interaction styles and is dispatched by `CommandHandler`:

```js
{
  name, description,
  slash: true,  data: { /* Discord application command JSON */ },
  async execute(interaction, bot) { ... },
  legacy: true, async legacyExecute(message, args, bot) { ... },
  cooldown,
  requiredPermissions,
  permissions: ['@everyone' | roleName | roleId]
}
```

---

## Known limitations

- **Command cooldowns are in-memory** (`commandHandler.js`) and reset on restart. Not a security boundary — this is intentional.
- **Global slash command cache delay.** When `development.testGuildId` is unset, slash commands register globally and Discord's cache can take up to ~1 hour to reflect new/updated commands (the API call succeeds, but clients see stale lists until the cache refreshes). Set `testGuildId` or use `/deploy` for instant visibility.
- **Database is disabled by default.** Guild-specific prefixes and `getGuildSettings`/`setModuleData` only work when a database is enabled.

---

## Contributing

1. Fork and create a feature branch.
2. Make your changes. Match existing module patterns — read one or two neighboring modules before adding a new one.
3. Run `npm test` to make sure the suite still passes.
4. Open a pull request with a clear description of what changed and why.

When adding a native dependency, update the allowlist in `src/core/dependencyManager.js`. When adding a new module, prefer a directory module with its own `package.json` if it pulls in heavy npm deps — the per-module install path is wired up for exactly this case.

---

## License

GNU GPLv3. See [`LICENSE`](LICENSE) for the full text.
