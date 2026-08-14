# Plugins

Code2 is a plugin graph. This document explains what that means, how to write a plugin, and what
is left to migrate.

The model is [cordis](https://github.com/cordiverse/cordis)', ported to Rust in
[`crates/kernel`](../crates/kernel). Cordis' claim is that an application is not a program with
extension points bolted on; it is a graph of plugins that happens to boot. We agree, and this is
what taking that seriously looks like in a Rust codebase.

## The problem it replaces

Before: `apps/desktop/src-tauri/src/lib.rs` had a 200-line `setup()` that constructed twenty
subsystems in one fixed order into an `AppState` struct with twenty fields, and 185 hand-written
`#[tauri::command]` wrappers that reached into it. Three consequences, all of them structural:

- **Adding a feature meant editing the middle of the app** — the state struct, the setup function,
  the handler table, and the frontend bridge, before writing a line of the feature.
- **Nothing could be removed.** "What happens without a store?" was not a configuration, it was an
  unreachable code path that each of nine memory commands answered separately with
  `"memory store unavailable"`.
- **Nothing could be replaced.** The desktop needed one different engine constructor, so it forked
  the whole boot sequence.

## The three rules

1. **A plugin only touches the world through its `Context`.** Services, listeners, commands, child
   plugins, and raw cleanup closures all register on `ctx` — and all of them are undone when the
   scope resets. That is what makes hot-swapping honest rather than hopeful.
2. **Dependencies are declared, not fetched.** A plugin that injects `store` does not run until
   `store` exists, and is torn down and re-applied if `store` is ever replaced. Availability is
   reactive state, not a boot-order puzzle.
3. **Loading is asynchronous and never re-entrant.** Mutations queue on a single driver task, so a
   plugin can load children and provide services from inside `apply` without fighting a lock.

## The graph

```
paths ──┬─→ store ──┬─→ scenes ──┬─→ engine ──┬─→ scene-runtime
        │           ├─→ memory   │            └─→ bus
        │           └────────────┴─→ cost
        ├─→ plugin-hub ─┬─→ skills ┘
        │               └─→ extensions ──→ out-of-process plugins
        ├─→ keymap        providers ┘
        └─→ (git, market: no dependencies at all)
```

The arrows are `inject` declarations, not a sequence. `engine` listed first in the config loads
exactly as well as `engine` listed last.

| plugin | provides | contributes |
|---|---|---|
| `paths` | `paths` | — |
| `store` | `store` | `store.sessions`, `store.session` |
| `bus` | `bus` | — |
| `providers` | `providers` | `providers.list` |
| `plugin-hub` | `plugin-hub` | `plugins.list`, `plugins.set_enabled`, `plugins.set_trusted`, `plugins.uninstall`, `plugins.scene_dirs` |
| `skills` | `skills` | `skills.list`, `skills.save`, `skills.delete` |
| `scenes` | `scenes` | `scenes.list`, `scenes.reload` |
| `engine` | `engine` | `engine.submit`, `sessions.*` |
| `git` | — | `git.status`, `git.diff`, `git.commit`, … (13) |
| `memory` | — | `memory.list`, `memory.search`, `memory.add`, … (9) |
| `market` | — | `market.catalog`, `market.parse` |
| `scene-runtime` | `scene-runtime` | — (dispatches scene hooks and scheduled transitions) |
| `cost` | `cost` | `cost.session` |
| `keymap` | `keymap` | `keymap.get`, `keymap.set` |
| `kernel` | — | `kernel.scopes`, `kernel.services`, `kernel.commands`, `kernel.plugins`, `kernel.set_enabled`, `kernel.configure` |
| `extensions` | — | `extensions.list` — runs installed bundles that ship a process, over the [plugin protocol](plugin-protocol.md) |

`kernel` is the reflexive one: the plugin manager is not privileged infrastructure, it is a plugin
that injects `loader` like anything else, and it can be turned off.

## Booting

```rust
use codetwo_core::app::{AppConfig, CoreApp};

let app = CoreApp::boot(AppConfig::new("~/.codetwo")).await?;
let status = app.call("git.status", json!({ "cwd": "/repo" })).await?;
```

`AppConfig` is data. Trim the app by editing it — the TUI does exactly this, because a terminal
frontend has no use for scenes, key bindings, or the market:

```rust
let config = AppConfig::new(&dir).without("scenes").without("keymap").without("market");
```

`AppConfig::bare()` starts from nothing. A headless host that wants `git` and `market` and no agent
loop is a two-line config, and the commands it does not load simply do not exist.

## Writing a plugin

```rust
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginResult};
use serde_json::Value;

pub struct IssuesPlugin;

#[async_trait]
impl Plugin for IssuesPlugin {
    fn name(&self) -> &str { "issues" }

    fn description(&self) -> Option<&str> { Some("GitHub issue import and delegation.") }

    // Required services gate the plugin; optional ones only trigger a reload.
    fn inject(&self) -> Injection {
        Injection::required(["store"]).with_optional(["engine"])
    }

    // A JSON Schema here means the settings form is generated, not written.
    fn schema(&self) -> Option<Value> {
        Some(serde_json::json!({
            "type": "object",
            "properties": { "host": { "type": "string", "default": "github.com" } }
        }))
    }

    async fn apply(&self, ctx: Context, config: Value) -> PluginResult {
        let store = ctx.expect::<StoreService>()?;   // guaranteed by `inject`

        ctx.command("issues.list", move |args| {
            let store = store.clone();
            async move { /* … */ Ok(Value::Null) }
        })?;

        ctx.effect(|| { /* undo anything the kernel cannot see */ });
        Ok(())
    }
}
```

Register it in `crates/core/src/app/plugins/mod.rs` (`builtin_registry`) and add its name to
`BUILTIN`. That is the whole integration.

### Rules of thumb

- **Anything a plugin starts, it must hand back.** Spawned task → `ctx.spawn` (aborted on unload).
  Anything else → `ctx.effect(…)`. If the kernel cannot see it, unloading the plugin leaks it.
- **Do not hold a dependency you did not inject.** Fetching a service without declaring it means
  you will not be reloaded when it changes, and you will be holding a corpse.
- **Commands are `subsystem.verb`.** The name is the public API; it is what the frontend, the TUI,
  the remote server, and other plugins all use.
- **Announce, do not reach.** The engine does not know the skill library exists; it listens for
  `SkillsChanged`. Delete either plugin and the other keeps working.
- **Capture `ctx.weak()` in anything the runtime stores.** This is the one wrinkle Rust adds to the
  cordis model: a command handler or listener lives *inside* the runtime, so capturing a strong
  `Context` in one makes a cycle that outlives the app. Most handlers only need the services they
  closed over, which is fine.

## Talking to it from a frontend

```ts
import { call, kernelScopes, listCorePlugins } from "./bridge";

const status = await call("git.status", { cwd });
const graph = await kernelScopes();       // what is loaded, and why something is pending
```

`call` is the extension surface. A plugin that registers `foo.bar` is callable the moment it loads
— no `#[tauri::command]`, no entry in `generate_handler!`, no new function in `bridge.ts`.

## Plugins that are not Rust

A Rust host can only load Rust plugins it was compiled with. If that were the end of it, "plugin"
would describe how *we* organise our code rather than something a user can add.

So a plugin can also be a **process**. Code2 speaks JSON-RPC over its stdio, and what it declares —
commands, event subscriptions — lands in the same kernel registries a built-in uses: its commands
show up in `kernel.commands`, are callable through `call()`, and vanish when it unloads. It
declares `inject` in its manifest and gets the same reactive contract. It is not a lesser citizen.

A bundle opts in with a `runtime` block in `plugin.json`, and the process starts only once the user
marks the bundle **trusted** — installing still executes nothing. See
[`docs/plugin-protocol.md`](plugin-protocol.md) for the spec and a working plugin in forty lines.

That leaves exactly one thing compile-time: native code. The graph, the wiring, the lifecycle, the
config surface, and the whole command API are decided at runtime, and a host can register plugins
of its own at boot:

```rust
let mut registry = codetwo_core::app::plugins::builtin_registry();
registry.register(|| MyPlugin);                 // add
registry.register_arc(Box::new(|| my_engine));  // or replace a built-in by name
CoreApp::boot_with(config, registry).await?;
```

The desktop uses the second form: it needs one different engine constructor (its authenticated
browser MCP), so it replaces the `engine` plugin's construction step and keeps everything else.

## Two senses of "plugin"

They meet in `plugin-hub`, and it is worth keeping them apart:

- **Kernel plugin** (`codetwo_kernel::Plugin`) — code that runs in the graph, publishes services,
  and contributes commands. This document. Written in Rust, or in any language over the
  [plugin protocol](plugin-protocol.md).
- **Installed bundle** (`codetwo_core::plugin::InstalledPlugin`) — a package users install from
  GitHub. Installing it executes nothing; it contributes skills, subagent definitions, MCP server
  definitions, scenes, and scaffolds. See `docs/architecture.md`.

`plugin-hub` manages bundles; `extensions` turns the ones that ship a `runtime` block into kernel
plugins. Both are themselves kernel plugins.

## Migration status

**Migrated** — the fifteen plugins above, plus the boot path for all three hosts.

- `codetwo-core` — `CoreApp::boot(AppConfig)`.
- `codetwo-tui` — fully plugin-booted, and trims itself (`.without("scenes")`, `"keymap"`,
  `"market"`) because a terminal frontend does not need them.
- The **desktop** — `setup()` boots the graph and takes `store`, `engine`, `skills`, `scenes`,
  `plugin-hub`, `providers`, `bus`, `keymap`, `scene-runtime`, `cost` and `paths` out of it. The
  ~180 lines that constructed them, the scene-hook and cost pumps, and `feed_cost_tracker` are
  gone. Its one genuine difference — the authenticated browser MCP on Codex sessions — is a
  replacement `engine` plugin registered at boot (`EnginePlugin::with_builder`), not a forked boot
  sequence. `reload_scenes` announces `ScenesChanged` and the engine and hook runtime follow;
  nothing updates them by hand.

The 185 `#[tauri::command]` wrappers still exist and still work; new surface should go through
`call()` instead.

**Not yet migrated** — one plugin per row, each a mechanical move of an existing module plus its
wrappers:

| subsystem | module | rough command surface | notes |
|---|---|---|---|
| worktrees | `worktree.rs` | 12 | core plugin |
| canvas | `canvas.rs` | 14 | core plugin |
| terminal / pty | `term.rs`, `pty.rs`, `tmux.rs` | 10 | core plugin |
| usage | `usage.rs` | 6 | core plugin; `cost` is done |
| workspace & search | `workspace.rs`, `workspace_search.rs` | 8 | core plugin |
| issues & delegation | `issues.rs`, `delegate.rs` | 6 | core plugin |
| voice | `voice/` | 3 | core plugin |
| automation | desktop `automation.rs` | 7 | desktop plugin (needs `AppHandle`) |
| browser | desktop `browser.rs` | 9 | desktop plugin (needs `AppHandle`) |
| LSP | desktop `lsp.rs` | 4 | desktop plugin |
| remote control | `crates/server` | 6 | desktop plugin |

### The recipe

1. Add `crates/core/src/app/plugins/<name>.rs` with a `Plugin` impl.
2. Move the state into a `Service` in `app/service.rs`; declare what it needs in `inject`.
3. Move each `#[tauri::command]` body into a `ctx.command("<name>.<verb>", …)`. Most are two lines.
4. Register in `builtin_registry()` and add the name to `BUILTIN`.
5. Point the frontend at `call("<name>.<verb>", …)` and delete the wrapper, the handler-table
   entry, and the `AppState` field.
6. Add a test to `crates/core/tests/app_graph.rs`: it loads, it contributes its commands, and
   turning its dependency off takes it down cleanly.

Desktop-only subsystems (browser, LSP, automation, remote control) become plugins registered by the
desktop into the same graph, not core plugins — same recipe, different registry:

```rust
let mut registry = codetwo_core::app::plugins::builtin_registry();
registry.register_arc(Box::new(move || Arc::new(BrowserPlugin::new(app_handle.clone()))));
CoreApp::boot_with(AppConfig::new(&data_dir).with("browser", PluginEntry::default()), registry)
```

They can hold an `AppHandle` and still be ordinary members of the graph: their services are
ordinary services, and their commands are reachable through `call()` like every other.
