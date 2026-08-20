# Plugins

C2 is a plugin graph. This document explains what that means, how to write a plugin, and how
the core and host-specific plugins fit together.

For the normative package, naming, lifecycle, scope, security, compatibility, and host-capability
rules, see the [C2 Plugin Standard 1.0.0](plugin-standard.md). This document focuses on the graph's
implementation and rationale.

The model is [cordis](https://github.com/cordiverse/cordis)', ported to Rust in
[`crates/kernel`](../crates/kernel). Cordis' claim is that an application is not a program with
extension points bolted on; it is a graph of plugins that happens to boot. We agree, and this is
what taking that seriously looks like in a Rust codebase.

## The problem it replaces

Before the plugin graph, the desktop host had a 200-line setup that constructed twenty subsystems
in one fixed order into an `AppState` struct with twenty fields, plus 185 hand-written command
wrappers that reached into it. Three consequences, all of them structural:

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

`engine` also watches the optional `memory` service. Unloading `memory` revokes recall, receipts,
capture, and delayed maintenance immediately while leaving session persistence and the engine
online; unloading `engine` cancels live provider work and terminates its owned processes.

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
| `memory` | `memory` | `memory.*` |
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
| `kernel` | — | graph inspection plus `plugins.catalog`, `plugins.plan_change`, `plugins.apply_change`, and `plugins.reset` |
| `extensions` | `extensions-runtime` | `extensions.list`, the public JSON event bridge, and lifecycle ownership for installed process bundles |

`kernel` is the reflexive one: its commands are contributed through an ordinary plugin scope, but
its factory is marked `essential`. The loader rejects attempts to turn off this final recovery
surface. The durable policy store and `PluginManager` service live at the root for the same reason:
disabling `paths` or another foundation plugin cannot strand the user without a way back.

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
— no native command wrapper, no dispatch-table entry, no new function in `bridge.ts`.

## The unified plugin manager

Every registered factory has catalog metadata: provenance (`built_in`, `host`, or `third_party`),
category, supported configuration scopes, default state, and whether it is essential. Existing
plugins that do not declare metadata keep backwards-compatible defaults. Hosts may classify a
factory centrally with `PluginRegistry::set_metadata`; this keeps reusable plugin implementations
free of desktop product policy.

The desktop's Plugins page is a data-only view over that catalog. It can show built-in plugins,
desktop host plugins, installed bundles, C2-owned UI contributions, and marketplace entries in one
place. Bundle code never supplies a React renderer. Third-party contributions are descriptors that
C2 renders with its own components, which preserves the webview's trust boundary and design
system.

State changes use a two-step protocol:

1. `plugins.plan_change` validates the target, scope and JSON Schema, binds the request to the
   current graph/config revisions, and reports affected dependents and active resources.
2. After confirmation, `plugins.apply_change` consumes that exact plan. A stale or already-used
   plan is rejected. The loader unloads or reloads the relevant scopes immediately; no application
   restart is involved.

`kernel.set_enabled` and `kernel.configure` remain compatibility commands, but they route through
the same durable manager rather than mutating an unrelated in-memory switch.

An installed bundle with `extensions.dev.codetwo.runtime` joins this same catalog as a dynamically
registered third-party integration named `bundle:<id>`. Its managed runtime controls use `plugins.catalog`,
`plugins.plan_change`, and `plugins.apply_change` for user or project policy just as compiled
factories do; they do not maintain a second process-lifecycle state machine. Importing, installing,
removing, changing trust, or replacing the installed record reconciles the dynamic factory set
immediately. A removed runtime is unloaded and its commands disappear; a changed runtime is
rebuilt even when its stable `bundle:<id>` name did not change.

That unification currently applies to the bundle's **process runtime**. Skills and other data-only
extension components shipped in the same bundle remain user-wide contributions. The unified page
may list them for visibility, but they are read-only there and their install-wide enabled state is
still managed by Bundle Tools. That install-wide switch also remains a compatibility/default input
for a process runtime, while explicit managed runtime policy belongs to the unified manager.
Project policy for `bundle:<id>` must not be presented as if it isolated those data contributions.

### User and project policy

Plugin intent is stored as a versioned `plugin-config.json` beside the rest of C2's private app
data. The user scope has `enabled` or `disabled`; a project may explicitly enable/disable a plugin
or inherit the user state. Project paths are normalized before they become configuration keys or
command realms.

Project-capable factories run in a real child graph, not just a filtered catalog. C2 creates that
graph lazily on the first project call, registers its commands in `CommandRealm::Project(path)`,
and falls back to the global command only for factories that do not support project scope. If a
project-owned plugin is disabled, pending, or failed, its commands stay blocked instead of silently
running the global implementation. A user change reconciles every live project graph; a project
change touches only that project. Idle child graphs are reclaimed after their lease window, and
unloading removes their commands, services and tasks through the same `Context` undo log. A
background reaper handles genuinely idle graphs; an in-flight project command or live terminal
holds an activity lease so it cannot be collected mid-use.

### Recovery

Runtime policy is recorded as last-known-good only after the affected scope actually reaches the
requested state. If an asynchronous plugin apply fails or remains pending, C2 rolls the runtime and
primary policy back together and preserves the previous snapshot. Boot likewise never replaces a
good snapshot with a graph whose enabled plugins failed to become active. If the primary document
is corrupt, boot uses the snapshot without overwriting the bad file; if neither document can be
read, C2 starts in safe mode with only essential management-plane plugins. The catalog reports the
recovery state, and `plugins.reset` rewrites a valid primary document even when resetting safe mode
to an otherwise identical default policy.

## Plugins that are not Rust

A Rust host can only load Rust plugins it was compiled with. If that were the end of it, "plugin"
would describe how *we* organise our code rather than something a user can add.

So a plugin can also be a **process**. C2 speaks JSON-RPC over its stdio, and what it declares —
commands, event subscriptions — lands in the same kernel registries a built-in uses: its commands
show up in `kernel.commands`, are callable through `call()`, and vanish when it unloads. It
declares `inject` in its manifest and gets the same reactive contract. It is not a lesser citizen.

A portable bundle opts in with `extensions.dev.codetwo.runtime` in `plugin.json`, and the process
starts only once the user marks the bundle **trusted** — installing still executes nothing. See
[`docs/plugin-protocol.md`](plugin-protocol.md) for the spec and a working plugin in forty lines.

The runtime appears in the managed catalog as `bundle:<id>`. Existing manifests are user-only:
omitting `runtime.scopeSupport` is equivalent to `["user"]`. A bundle must explicitly declare
`["user", "project"]` before the manager will create project-scoped process instances. Those
instances use the ordinary project child graph, command realm, policy inheritance, lifecycle, and
idle reclamation described above. Trust remains a hard execution gate in every scope; neither an
enabled policy nor a project override can start an untrusted runtime.

That leaves exactly one thing compile-time: native code. The graph, the wiring, the lifecycle, the
config surface, and the whole command API are decided at runtime, and a host can register plugins
of its own at boot:

```rust
let mut registry = codetwo_core::app::plugins::builtin_registry();
registry.register(|| MyPlugin);                 // add
registry.register_arc(Box::new(|| my_engine));  // or replace a built-in by name
CoreApp::boot_with(config, registry).await?;
```

A full desktop adapter adds only host-owned automation, event, language-server, browser, voice, and
remote modules; product commands remain behind the same command seam as the TUI and server. The
current Pure Bun compatibility host implements that seam directly and reports its missing adapters
explicitly rather than claiming the Rust graph is present.

## Two senses of "plugin"

They meet in `plugin-hub`, and it is worth keeping them apart:

- **Kernel plugin** (`codetwo_kernel::Plugin`) — code that runs in the graph, publishes services,
  and contributes commands. This document. Written in Rust, or in any language over the
  [plugin protocol](plugin-protocol.md).
- **Installed bundle** (`codetwo_core::plugin::InstalledPlugin`) — a package users install from
  GitHub. Installing it executes nothing; it contributes skills, subagent definitions, MCP server
  definitions, scenes, and scaffolds. See `docs/architecture.md`.

`plugin-hub` manages bundles; `extensions` turns the ones that ship a C2 process runtime into
kernel plugins. Both are themselves kernel plugins.

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
- The experimental Electrobun desktop registers one in-process `pure-bun` compatibility host. It
  preserves the renderer's typed command/event contract, but it is intentionally not full
  plugin-graph parity. Its exact supported and fail-closed capabilities are recorded in the
  [standard's host profiles](plugin-standard.md#7-host-capability-profiles).
- The renderer exposes one typed `call` request. Electrobun dispatches it directly to the Bun host;
  no Rust sidecar is built or bundled by the desktop package.

Desktop event envelopes remain host plumbing rather than a business API. Manual browser tabs
persist in the renderer and render as sandboxed `<electrobun-webview>` elements.
The former authenticated agent-browser MCP is not registered because Electrobun's stable
BrowserView API does not yet supply the screenshot and evaluated-value primitives that contract
requires; restoring it requires an upstream-capable adapter, not a pretend partial tool.

### Adding another subsystem

1. Add a `Plugin` implementation and declare every service it consumes in `inject`.
2. Register all commands, tasks and cleanup on the supplied `Context`.
3. Add it to the core registry, or to the sidecar registry when it requires desktop-host services.
4. Call its `subsystem.verb` commands through `CoreApp::call`; do not add another bridge wrapper.
5. Test that its commands exist while active and disappear when the plugin or a required
   dependency is disabled.

Desktop-only registration follows the same loader contract:

```rust
let mut registry = codetwo_core::app::plugins::builtin_registry();
let events = events.clone();
registry.register(move || HostEventsPlugin::new(events.clone()));
let config = AppConfig::new(&data_dir).with("desktop-events", PluginEntry::default());
let app = CoreApp::boot_with(config, registry).await?;
```
