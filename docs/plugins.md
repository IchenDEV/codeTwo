# Plugins

Code2 is a plugin graph. This document explains what that means, how to write a plugin, and how
the core and host-specific plugins fit together.

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
paths ──┬─→ store ──┬─→ scenes ──────┬─→ scene-commands
        │           ├─→ engine ──────┤
        │           ├─→ memory       ├─→ scene-runtime
        │           ├─→ projects     └─→ cost
        │           ├─→ canvas ────────→ document
        │           └─→ (artifacts, workspace-search, issues)
        ├─→ plugin-hub ─→ (skills, extensions)
        └─→ keymap
providers ─→ engine       skills ─→ (engine, market, document)
(git, workspace, usage, voice, terminal: no dependencies)
```

The arrows are `inject` declarations, not a sequence. `engine` listed first in the config loads
exactly as well as `engine` listed last.

| plugin | provides | contributes |
|---|---|---|
| `paths` | `paths` | — |
| `store` | `store` | `store.sessions`, `store.session` |
| `bus` | `bus` | — |
| `providers` | `providers` | `providers.list` |
| `plugin-hub` | `plugin-hub` | install, import, trust, enable, uninstall, scaffold, and discovery commands |
| `skills` | `skills` | `skills.*` |
| `scenes` | `scenes` | scene-library and pipeline-library commands |
| `engine` | `engine` | `engine.*`, `sessions.*`, `worktrees.*` |
| `git` | — | `git.*` |
| `memory` | — | `memory.*` |
| `market` | — | `market.*` |
| `workspace` | — | filesystem, project rules, scripts, and worktree baselines |
| `projects` | — | `projects.*` |
| `artifacts` | — | `artifacts.*` |
| `workspace-search` | — | `workspace.search`, `workspace.cancel_search` |
| `usage` | — | `usage.*` |
| `voice` | — | `voice.*` |
| `issues` | — | issue and delegation commands |
| `canvas` | `canvas` | `canvas.*` |
| `document` | — | `document.compile` |
| `scene-runtime` | `scene-runtime` | — (dispatches scene hooks and scheduled transitions) |
| `scene-commands` | — | scene application, artifacts, scheduling, and pipeline execution |
| `terminal` | `terminal` | `terminal.*` |
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

The application migration is complete:

- `codetwo-core` boots the built-in graph through `CoreApp::boot(AppConfig)`. Worktrees,
  workspace I/O and search, projects, artifacts, canvas/document compilation, terminal/PTY/tmux,
  usage, voice, issues/delegation, scene commands, pipelines, memory, Git, market, skills and the
  engine all contribute commands from plugin scopes.
- `codetwo-tui` boots that graph and consumes its typed event and engine services. It trims plugins
  it does not need through `AppConfig` rather than constructing a separate application.
- The standalone `codetwo-server` also boots `CoreApp`, then gives the graph's engine, store,
  event-bus and canvas services to its streaming protocol adapter.
- The desktop registers five host plugins — `automation`, `browser`, `desktop-events`, `lsp` and
  `remote` — beside the core registry. Its authenticated browser MCP remains a replacement
  `engine` builder, the one host-specific construction seam. That engine also declares the browser
  host service as a requirement, so disabling `browser` unloads the engine and its
  automation/remote dependents instead of leaving a tool pointed at a dead socket.
- The Tauri command table contains one entry, `call`. The TypeScript bridge has one native
  `invoke`, which calls it. There are no compatibility business wrappers or duplicated
  `AppState` service handles.

The `desktop-events` plugin is deliberately host plumbing rather than a business API: it turns
core broadcast events into Tauri window events and reloads with either source service. Browser
persistence remains native host state because it backs Tauri webviews, while the authenticated
broker task, socket cleanup, native webviews, and public command surface are all owned by the
`browser` plugin scope.

### Adding another subsystem

1. Add a `Plugin` implementation and declare every service it consumes in `inject`.
2. Register all commands, tasks and cleanup on the supplied `Context`.
3. Add it to the core registry, or to the relevant host registry when it requires host-native
   types such as `AppHandle`.
4. Call its `subsystem.verb` commands through `CoreApp::call`; do not add another bridge wrapper.
5. Test that its commands exist while active and disappear when the plugin or a required
   dependency is disabled.

Desktop-only registration follows the same loader contract:

```rust
let mut registry = codetwo_core::app::plugins::builtin_registry();
registry.register(move || {
    BrowserPlugin::new(app_handle.clone(), socket_path.clone(), master_key.clone())
});
let config = AppConfig::new(&data_dir).with("browser", PluginEntry::default());
let app = CoreApp::boot_with(config, registry).await?;
```
