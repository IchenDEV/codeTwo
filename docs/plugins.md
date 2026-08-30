# Runtime modules and plugins

C2's host runtime is implemented as a runtime-module graph in `codetwo-plugins`. This document
explains that internal mechanism, how plugin-independent Core capabilities become runtime modules,
and where the public extension boundary begins.

For the normative package, naming, lifecycle, scope, security, versioning, and host-capability
rules, see the [C2 Plugin Standard 1.2.0](plugin-standard.md). This document focuses on the graph's
implementation and rationale.

The internal model is [cordis](https://github.com/cordiverse/cordis)', ported to Rust in
[`crates/kernel`](../crates/kernel). Cordis' claim is that an application is not a program with
extension points bolted on; it is a graph of plugins that happens to boot. We agree, and this is
what taking that seriously looks like in a Rust codebase.

The crate seam is deliberate: `codetwo-core` owns product behavior, `codetwo-kernel` owns generic
lifecycle machinery, and `codetwo-plugins` is the shared composition crate that depends on both.
Host binaries may also depend on both when they contribute platform-specific runtime modules;
shared composition still belongs in `codetwo-plugins`. Built-in runtime modules are adapters over
Core; Bundle parsing, policy, process supervision, and the public protocol do not leak back into
Core.

In product language, `codetwo_kernel::Plugin` is a **runtime module**, not automatically an
installable plugin. The catalog assigns one of three roles:

- **Core** — host-owned infrastructure that extension policy cannot disable;
- **Built-in feature** — optional C2/host behavior compiled with the product;
- **Extension** — a separately installed bundle restricted to the public Extension API.

See [ADR 0002](adr/0002-core-extension-boundary.md) for the boundary and migration rules.

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
| `providers` | `providers` | `providers.list`, `computer_use.*`, `browser_use.*` |
| `plugin-hub` | `plugin-hub` | install, import, trust, enable, uninstall, scaffold, and discovery commands |
| `skills` | `skills` | `skills.*` |
| `scenes` | `scenes` | scene-library and pipeline-library commands |
| `engine` | `engine` | `engine.*`, `sessions.*`, `worktrees.*` |
| `handoff` | `handoff` | durable task transfer, target activation, and rollback commands |
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
use codetwo_plugins::{AppConfig, CoreApp};

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

## Writing an internal runtime module

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

Register it in `crates/plugins/src/app/plugins/mod.rs` (`builtin_registry`) and add its name to
`BUILTIN`. Add it to `CORE` only when host ownership is required to preserve a product, data, or
security invariant. That is the whole integration.

### Rules of thumb

- **Anything a plugin starts, it must hand back.** Spawned task → `ctx.spawn` (aborted on unload).
  Anything else → `ctx.effect(…)`. If the kernel cannot see it, unloading the plugin leaks it.
- **Do not hold a dependency you did not inject.** Fetching a service without declaring it means
  you will not be reloaded when it changes, and you will be holding a corpse.
- **Commands are `subsystem.verb`.** The name is stable inside C2 hosts. It is available to process
  extensions only when explicitly exported through the versioned Extension API.
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

`call` is the host transport, not an automatic public extension surface. Internal commands are
callable by C2 hosts. Process extensions can discover and invoke only commands explicitly exported
through the versioned Extension API. There is no native command wrapper or second dispatch table.

## The unified plugin manager

Every registered factory has catalog metadata: provenance (`built_in`, `host`, or `third_party`),
category, supported configuration scopes, default state, and whether it is essential. A factory
may declare this metadata or receive it centrally through `PluginRegistry::set_metadata`; this
keeps reusable plugin implementations free of desktop product policy.

The desktop's Features & Plugins page is a data-only view over that catalog. It shows optional
built-in features, host features, installed bundles, C2-owned UI contributions, and marketplace
entries in one place. Common bundle administration—GitHub import, source and trust review,
install-wide enablement, diagnostics, and removal—also lives on this page. Local marketplace files,
scaffold generation, and skill actions use the same catalog and details surface instead of opening
a second manager. Bundle code never supplies a React renderer. Third-party contributions are
descriptors that C2 renders with its own components, which preserves the webview's trust boundary
and design system.

State changes use a two-step protocol:

1. `plugins.plan_change` validates the target, scope and JSON Schema, binds the request to the
   current graph/config revisions, and reports affected dependents and active resources.
2. After confirmation, `plugins.apply_change` consumes that exact plan. A stale or already-used
   plan is rejected. The loader unloads or reloads the relevant scopes immediately; no application
   restart is involved.

An installed bundle with `extensions.dev.codetwo.runtime` joins this same catalog as a dynamically
registered third-party integration named `bundle:<id>`. Its managed runtime controls use `plugins.catalog`,
`plugins.plan_change`, and `plugins.apply_change` for user or project policy just as compiled
factories do; they do not maintain a second process-lifecycle state machine. Importing, installing,
removing, changing trust, or replacing the installed record reconciles the dynamic factory set
immediately. A removed runtime is unloaded and its commands disappear; a changed runtime is
rebuilt even when its stable `bundle:<id>` name did not change.

The same installed record may contribute safe UI actions, external-system connectors, and stdio
language servers. UI actions
render only in the C2-owned `rail.features`, `session.header`, `transcript.before`,
`composer.above`, or `composer.toolbar` slots and route back to a command owned by the bundle's
active process runtime; bundles never inject React or HTML into the renderer. LSP
descriptors add language routing to the existing editor client, while the desktop host owns process
startup, standard LSP framing, project cwd, conflict rejection, and teardown when bundle policy or
trust changes.

Connector descriptors use the same trust, policy, realm, and ownership checks as UI actions but
route a host-rendered integration through one bundle-owned runtime command. The desktop discovers
the descriptor from the active catalog; it does not recognize a bundle name or call
provider-specific commands directly. Provider authentication and data access remain inside the
bundle adapter.

That unification currently applies to the bundle's **process runtime**. Skills and other data-only
extension components shipped in the same bundle remain user-wide contributions. The unified page
lists their component descriptors as read-only and uses the existing bundle command for their
install-wide enabled state; it does not route that switch through `plugins.plan_change`. The bundle
switch gates every contribution and supplies the initial runtime state. Explicit user/project
runtime policy belongs to the unified manager. Project policy for `bundle:<id>` must not be
presented as if it isolated those data contributions.

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

## External process extensions

The Rust `Plugin` trait is an internal runtime-module interface for code compiled with a C2 host.
User-installed extensions instead run as supervised child processes and speak JSON-RPC over stdio.
Their declared commands and event subscriptions use the same lifecycle and cleanup machinery, so
extension-owned commands appear in `kernel.commands`, are callable through `call()`, and vanish on
unload.

That shared machinery does not expose the internal Rust interface. An extension may call back only
into commands explicitly published through the versioned Extension API. The existing `inject` and
`optionalInject` fields are a migration surface for known services, not general access to Core.

A C2 bundle opts in with `extensions.dev.codetwo.runtime` in `plugin.json`, and the process
becomes eligible only once the user marks the bundle **trusted**. Its static Manifest commands are
then ready, while the process starts on the first invocation — installing still executes nothing. See
[`docs/plugin-protocol.md`](plugin-protocol.md) for the spec and a working plugin in forty lines.
Runtime, safe UI actions, and language servers are distributed together from that same bundle root;
run `cargo run -p codetwo-plugins --example validate_bundle -- <bundle-root>` before publishing it or
installing it from GitHub. The Bun `plugin:validate` command remains a faster manifest-only
preflight.

### Developing an installed bundle

Open **Settings → Developer** and enable **Developer mode** to watch C2's installed plugin
directory with the platform-native file watcher. The setting persists as
`<data-dir>/plugins/.developer-mode`, so the watcher returns after an app restart. It ignores
private top-level directories such as `.data` and installer staging or backup directories.

Changes are collected for 250 ms and mapped to the affected top-level Bundle ids. C2 then forces
only those `bundle:<id>` factories through the existing loader in every live user/project realm;
the ordinary `plugins-changed` event refreshes skills, scenes, descriptors, and renderer state.
The Developer page shows the watched directory and the latest successful reload or watcher error.
**Reload plugins** performs the same reconciliation for every installed Bundle without requiring
Developer mode, which is useful after a generator or build step replaces several files at once.

The watcher observes the **installed copy** under `<data-dir>/plugins/<id>`. It does not link an
arbitrary source checkout or run a compiler. Build or copy generated runtime files into that
installed directory, then let the watcher reload them. Native Rust plugins remain part of the app
binary and still require recompilation and an app restart. **Open WebView DevTools** opens the
existing renderer inspector for DOM, console, network, and performance debugging.

The runtime appears in the managed catalog as `bundle:<id>`. Runtimes are user-only by default:
omitting `runtime.scopeSupport` is equivalent to `["user"]`. A bundle must explicitly declare
`["user", "project"]` before the manager will create project-scoped process instances. Those
instances use the ordinary project child graph, command realm, policy inheritance, lifecycle, and
idle reclamation described above. Trust remains a hard execution gate in every scope; neither an
enabled policy nor a project override can start an untrusted runtime.

That leaves exactly one thing compile-time: native code. The graph, wiring, lifecycle, and config
surface are decided at runtime. External command surfaces are static Manifest contributions rather
than process-discovered UI, while a host can register compiled modules of its own at boot:

```rust
let mut registry = codetwo_plugins::builtins::builtin_registry();
registry.register(|| MyPlugin);                 // add
registry.register_arc(Box::new(|| my_engine));  // or replace a built-in by name
CoreApp::boot_with(config, registry).await?;
```

A full desktop adapter adds only host-owned automation, event, language-server, browser, voice, and
remote modules; product commands remain behind the same command seam as the TUI and server. C2's
Electrobun adapter packages that Rust graph as `codetwo-desktop-host`; Bun owns only shell-native
window, dialog, update, and process-lifecycle operations.

## Runtime modules and installed extensions

They meet in `plugin-hub`, and the terms remain separate:

- **Runtime module** — code that runs under the internal graph lifecycle and contributes commands
  or services. Compiled modules implement `codetwo_kernel::Plugin`; external extensions use the
  [plugin protocol](plugin-protocol.md) and only the public Extension API.
- **Installed bundle** (`codetwo_plugins::bundle::InstalledPlugin`) — a package users install from
  GitHub. Installing it executes nothing; it contributes skills, subagent definitions, MCP server
  definitions, scenes, and scaffolds. See `docs/architecture.md`.

`plugin-hub` manages bundles; `extensions` turns the ones that ship a C2 process runtime into
runtime modules. Both managers use the same internal lifecycle, but neither fact expands the public
Extension API.

## Migration status

The application migration is complete:

- `codetwo-plugins` boots the built-in graph through `CoreApp::boot(AppConfig)`. Worktrees,
  workspace I/O and search, projects, artifacts, canvas/document compilation, terminal/PTY/tmux,
  usage, voice, issues/delegation, scene commands, pipelines, memory, Git, market, skills and the
  engine all adapt `codetwo-core` capabilities into commands from plugin scopes.
- `codetwo-tui` boots that graph and consumes its typed event and engine services. It trims plugins
  it does not need through `AppConfig` rather than constructing a separate application.
- The standalone `codetwo-server` also boots `CoreApp`, then gives the graph's engine, store,
  event-bus and canvas services to its streaming protocol adapter.
- The Electrobun desktop boots that same graph in `codetwo-desktop-host`, adding individually owned
  automation, device-sync, LSP, event, and remote plugins. `device-sync` publishes the Core-backed
  snapshot/merge service; `remote` optionally injects it to add C2 pairing without coupling T3 or
  browser control to synchronization. The manager reads installed Bundle records, makes only
  trusted and enabled extension adapters ready, registers their static commands into the same
  command seam, and lazily creates isolated child processes and command realms for project-capable
  Bundles.
- Renderer content reaches Electrobun only through `src/container.ts`. Its one typed `call` request
  is relayed to one versioned JSON-lines `call` method on the bundled Rust host; host events return
  over the same connection. A protocol mismatch or failed Kernel startup stops desktop startup
  instead of falling back to another implementation.

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
let mut registry = codetwo_plugins::builtins::builtin_registry();
let events = events.clone();
registry.register(move || HostEventsPlugin::new(events.clone()));
let config = AppConfig::new(&data_dir).with("desktop-events", PluginEntry::default());
let app = CoreApp::boot_with(config, registry).await?;
```
