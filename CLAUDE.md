# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run the bot (node index.js)
npm install        # Install root dependencies
```

There is no test suite, linter, or build step — `npm test` is a stub that exits with an error.

Per-module npm dependencies are installed automatically at startup by the `DependencyManager` (see Architecture). You do not normally run `npm install` inside a module directory by hand; declare deps in the module's `package.json` (directory modules) or in `meta.npmDependencies` (single-file modules) and they get installed on next boot.

## Configuration

Config lives in `config/` and is loaded at startup. `index.js` creates default versions of these files if they are missing:
- `config/config.json` — bot token, clientId, ownerIds, prefix, command behavior, `database` (sqlite/mongodb), `logging`, `gemini.apiKey`, feature flags. The bot will not start without `bot.token`.
- `config/modules.json` — module enablement and per-module `settings`/`permissions`.

Note: the database is disabled by default (`database.enabled: false`). Guild-specific prefixes and `getGuildSettings`/`setModuleData` only work when a database is enabled.

Secrets (bot token, Gemini API key) are stored directly in `config/config.json`, which is currently tracked by git. Gemini key can alternatively come from `GEMINI_API_KEY` env var.

## Architecture

This is a **modular Discord bot** built on discord.js v14. The core (in `src/core/`) is a thin host that discovers, loads, and wires up self-contained feature modules in `modules/`. Almost all functionality lives in modules; the core knows nothing about specific features.

### Boot sequence (`index.js` → `Bot.initialize()` in `src/core/bot.js`)
1. Connect database (if enabled) — `DatabaseManager`
2. Check/install module npm dependencies — `DependencyManager`
3. Load modules (dependency-ordered) — `ModuleLoader`
4. Register commands from modules — `CommandHandler`
5. Register events from modules — `EventHandler`
6. Wire core Discord events, then `login()`

### The module contract
A module is **either** a single file `modules/<name>.js` **or** a directory `modules/<name>/index.js`. Each exports an object:

```js
module.exports = {
  meta: {
    name, type, version, description,
    dependencies: [],        // names of OTHER modules that must load first
    npmDependencies: { ... } // npm packages this module needs (single-file modules)
  },
  async init(client, bot) { ... },   // called once at load
  async shutdown() { ... },          // called on unload/reload/shutdown
  commands: [ /* see below */ ],
  events:   [ { name, once?, execute(...args, bot) } ]
};
```

> **Security boundary:** Any file placed in `modules/` is auto-`require`d at boot and
> executes immediately. Treat `modules/` as trusted code only — dropping a file there
> grants full code execution. npm installs run with `--ignore-scripts`; native deps are
> rebuilt from an explicit allowlist in `dependencyManager.js` (update it when adding
> native modules).

Commands declare both interaction styles and are dispatched by `CommandHandler`:
```js
{
  name, description,
  slash: true,  data: { /* Discord application command JSON */ },
  async execute(interaction, bot) { ... },
  legacy: true, async legacyExecute(message, args, bot) { ... },
  cooldown, requiredPermissions, permissions: ['@everyone' | roleName | roleId]
}
```

### Core components (`src/core/`)
- **`bot.js`** — owns the discord.js `Client`, holds references to all managers, sets presence, handles graceful shutdown.
- **`moduleLoader.js`** — discovers modules, topologically sorts by `meta.dependencies` (with cycle detection), loads each via a **custom per-module `require`** that resolves npm packages from the module's own `node_modules` first, then the shared `modules/node_modules`, then the root. Enablement is controlled by a `disabled` array in `modules.json` (a module is enabled unless listed there).
- **`commandHandler.js`** — collects commands from all modules, registers slash commands with Discord (to `development.testGuildId` if set, otherwise globally), and routes `interactionCreate` (slash) and `messageCreate` (legacy prefix) to the right handler. Enforces cooldowns and role/permission checks.
> **Known limitation:** command cooldowns are in-memory (`commandHandler.js`) and reset on restart. Not a security boundary; documented intentionally (no persistence planned).
- **`eventHandler.js`** — registers module `events` on the client. Always appends the `bot` instance as the last argument to each handler. Supports per-module unregistration (used by reload).
- **`dependencyManager.js`** — before modules load, runs `npm install` for directory modules with a `package.json` and missing/stale `node_modules`, and aggregates single-file modules' `meta.npmDependencies` into `modules/package.json` for a shared install.
- **`databaseManager.js`** — optional persistence; supports sqlite (default, `data/database.sqlite`) and mongodb behind one interface (`getGuildSettings`, `setGuildSettings`, `getModuleData`, `setModuleData`).

### Hot reload
The `reload` module (`modules/reload.js`) reloads modules without restarting: it shuts down a module, clears its `require` cache, re-loads it, then re-registers all commands/events. Useful during development.

### Notable modules
- **`modules/werewolf/`** — the largest module: a full Mafia/Werewolf game (Vietnamese UI). Game state per channel in an in-memory `activeGames` Map. Subfolders: `roles/` (one class per role, registered in `roles/index.js`), `handlers/` (button/select-menu/command), `ai/` (bot players + AI-driven discussion via Gemini), `utils/` (TTS, game history, message helpers). Interaction routing keys off `customId` prefixes defined in `constants.js`.
- **`modules/music/`** — voice playback via `@discordjs/voice` + `discord-player`; has its own `package.json`/`node_modules` and does runtime fallback between opus implementations.
- **`modules/gemini.js`** — Google Generative AI chat with per-user in-memory conversation history.

### Adding a feature
Create a new file or directory under `modules/`. Give it a `meta.name`, declare any npm deps, implement `init`, and add `commands`/`events`. It is picked up automatically on next start (no core changes needed) unless its name is in `modules.json`'s `disabled` array.
