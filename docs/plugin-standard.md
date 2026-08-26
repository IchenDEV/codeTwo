# C2 Plugin Standard 1.0.0

Status: **normative for every C2 plugin bundle**. The root package schema is
[Agent Plugins 1.0.0](https://agent-plugins.org/specification), extended by the mandatory
`extensions.dev.codetwo` object defined here. The process wire format is specified separately in
[The C2 Plugin Protocol](plugin-protocol.md).

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe requirements. A detected file is
not a supported capability until a host has an adapter for it and reports that support truthfully.

## 1. System model

C2 uses the following distinct concepts. Calling all of them “a plugin” hides the boundary that
matters, so code, UI, diagnostics, and documentation MUST use the precise term where ambiguity is
possible.

| Term | Meaning | Stable interface |
| --- | --- | --- |
| **Bundle** | An installable, versioned directory of metadata, data, and optional code. Installation is data-only. | One root `plugin.json` |
| **Contribution** | Declarative content such as a Skill, MCP definition, Scene, Pipeline, scaffold, or C2-owned UI descriptor. | Component-specific schema or file convention |
| **Runtime module** | Behavior loaded into the graph: a compiled `Plugin` or a trusted child process. | Commands, events, services, dependencies, and cleanup |
| **Host adapter** | The narrow implementation that connects a runtime module to Rust, Electrobun/Bun, TUI, server, or a native OS service. | Host capability profile and the typed `call` boundary |
| **Policy** | Durable user/project intent, trust, configuration, recovery, and lifecycle decisions. | `catalog -> plan_change -> apply_change`, plus `reset` |

Runtime modules also have a product role: **Core** is host-owned and not controlled by extension
policy; a **built-in feature** is optional behavior shipped by C2 or a host; an **extension** is a
separately installed Bundle. Sharing `codetwo_kernel::Plugin` lifecycle plumbing does not grant an
extension access to Core's private services or commands. The normative boundary is recorded in
[ADR 0002](adr/0002-core-extension-boundary.md).

The plugin manager is a deep module. Its public seam is small—catalog, plan, apply, reset, commands,
and events—while discovery, configuration storage, dependency ordering, process supervision, project
realms, rollback, and UI projection remain internal. A host adapter MUST NOT create a second plugin
lifecycle or expose subsystem-specific bridge wrappers.

```text
Bundle ──discovery──▶ Contributions
   │
   └── trusted runtime declaration ──▶ Runtime module ──▶ command/event seam
                                                 │
Policy ──catalog / plan / apply / reset──────────┤
                                                 │
Host adapter ──capabilities and native services──┘
```

## 2. Bundle manifest

Every bundle MUST put identity in root `plugin.json` using Agent Plugins 1.0.0. C2-specific data
MUST live under the reverse-domain namespace `extensions.dev.codetwo`; the namespace and
`standardVersion: "1.0.0"` are required even for data-only bundles. Unknown top-level or C2 fields
invalidate the bundle.

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "One sentence describing the user value.",
  "extensions": {
    "dev.codetwo": {
      "standardVersion": "1.0.0",
      "runtime": {
        "protocol": "1.0.0",
        "command": "node",
        "args": ["dist/plugin.js"],
        "env": { "MY_PLUGIN_MODE": "release" },
        "inject": ["store"],
        "optionalInject": ["engine"],
        "scopeSupport": ["user", "project"]
      },
      "ui": [{
        "id": "review",
        "slot": "composer.above",
        "label": "Review workspace",
        "description": "Run the plugin's review command.",
        "command": "review.run",
        "input": { "mode": "working-tree" },
        "order": 10
      }],
      "languageServers": [{
        "id": "zls",
        "languages": ["zig"],
        "command": "zls",
        "args": [],
        "env": {}
      }]
    }
  }
}
```

`extensions.dev.codetwo` has these fields in 1.0.0:

| Field | Required | Contract |
| --- | --- | --- |
| `standardVersion` | yes | MUST equal `1.0.0`. Any other value invalidates the bundle. |
| `runtime` | no | Declares one process runtime using the C2 Plugin Protocol. |
| `ui` | no | Declares host-rendered action descriptors. A UI action requires `runtime` and may invoke only a command registered by that runtime. |
| `languageServers` | no | Declares trusted stdio language-server processes selected by Monaco language ID. |

The `runtime` object has these fields:

| Field | Required | Contract |
| --- | --- | --- |
| `command` | yes | Non-empty executable name or bundle-relative executable; `..` is forbidden. |
| `protocol` | no | Declared wire version. The `initialize` result remains the authoritative compatibility check. |
| `args` | no | Ordered string arguments. |
| `env` | no | Additional string environment variables for the child. |
| `inject` | no | Required service names. The runtime remains pending until all exist and reloads when they change. |
| `optionalInject` | no | Optional service names whose arrival or departure reloads the runtime. |
| `scopeSupport` | no | `user` by default. `project` is honored only when explicitly declared. |

The `ui` array contains action descriptors. Every entry requires a bundle-local `id`, one supported
`slot`, a non-empty `label` of at most 80 characters, and a namespaced `command`. `description` (at
most 300 characters), JSON `input`, and integer `order` from -100 through 100 are optional.

| Slot | Host placement |
| --- | --- |
| `rail.features` | Primary feature list in the session rail. |
| `session.header` | Session header actions. |
| `transcript.before` | Inside the transcript scroll area, before the conversation. |
| `composer.above` | Full-width action card above the composer. |
| `composer.toolbar` | Compact action in the composer control row. |

The host chooses the markup, component, spacing, focus behavior, and accessibility semantics. On
activation it invokes the declared command with `{ context, input }`, after verifying that the
contribution belongs to the bundle, the selected realm is active, and that same runtime registered
the command. A descriptor cannot invoke another plugin's command.

The `languageServers` array contains stdio server descriptors:

| Field | Required | Contract |
| --- | --- | --- |
| `id` | yes | Bundle-local stable identifier. |
| `languages` | yes | One to sixteen Monaco language IDs. Matching is case-insensitive. |
| `command` | yes | Executable name or bundle-relative executable; `..` is forbidden. |
| `args` | no | Ordered string arguments passed verbatim. The server working directory is the project root. |
| `env` | no | Additional string environment variables for the server process. |

Exactly one active plugin may provide a language in a project. Multiple active providers fail that
language closed until policy removes the conflict. Plugin mappings take precedence over C2's
built-in executable mapping. Disabling, untrusting, replacing, or uninstalling a bundle terminates
its live language servers; the editor reconnects only after the active contribution catalog changes.

The selected bundle directory is the manifest root. C2 does not search parent or child directories,
merge manifests, or infer a bundle from component folders. Authors of monorepos distribute each
plugin directory independently or link directly to its GitHub `/tree/<ref>/<path>` location.

### Validate and distribute

The bundle root is the distribution unit: one `plugin.json` owns its runtime, safe UI descriptors,
language servers, and canonical Agent Plugins content. Do not publish UI descriptors as a second
package or ship renderer code. Validate the same directory that will be committed or released:

```sh
cd apps/desktop
bun run plugin:validate ../../packs/hello-runtime
cargo run -p codetwo-core --example validate_bundle -- ../../packs/hello-runtime
```

The Bun command is a fast manifest preflight. The Rust command uses the desktop installer's
authoritative bounded bundle collector and package parser: it checks the Agent Plugins identity,
exact C2 standard version, supported contributions, unique IDs, UI/runtime ownership,
bundle-relative executable paths, symlinks, and file/count/size limits. A valid bundle can be
installed directly from a GitHub repository or `/tree/<ref>/<path>` URL, so a repository folder is
the preferred distribution artifact. Releases MAY additionally attach an archive of that exact
folder; extracting it MUST produce `plugin.json` at the selected root.

Use stable bundle-local contribution IDs. C2 derives policy identities from the installed bundle
and contribution ID, so upgrades can preserve per-component user and project choices without an
author coordinating generated installation IDs.

A distributable catalog is a root `marketplace.json` with `standardVersion: "1.0.0"`. Every entry
requires a `name` and semantic `version` that both match its bundle manifest, plus one explicit
source object with `kind` equal to `local`, `github`, `git`, `npm`, or `archive`. Catalog, entry,
and source objects are closed; unknown fields invalidate that object rather than falling through
to another source shape. The canonical `IchenDEV/c2-plugins` community catalog points to
author-owned repositories at exact commit SHAs; catalog inclusion is not a security, quality, or
maintenance endorsement.

## 3. Identity and names

- Bundle manifest names MUST follow the Agent Plugins 1.0.0 name rules.
- Installed bundle IDs are content-source identities assigned by C2; authors MUST NOT depend on
  their generated suffix.
- Managed process runtimes are named `bundle:<installed-id>`.
- Commands MUST be `namespace.verb`, for example `review.run`. A plugin MUST NOT claim another
  subsystem's namespace.
- C2-owned contribution IDs use `<plugin-id>:<kind>:<local-id>` where a persisted global identity is
  needed. Display names are never identifiers.
- Project identities MUST be normalized before use as policy keys, command realms, or data keys.

## 4. Lifecycle and policy

The lifecycle is one transaction across configuration and runtime state:

1. Installation validates and atomically stores a bundle. It MUST NOT run repository scripts or the
   declared runtime.
2. A C2 process runtime and plugin LSP remain stopped until the bundle is both **enabled** and
   **trusted**. MCP starts only through separate, explicit session composition; installation alone
   never starts it.
3. `plugins.plan_change` validates scope, configuration schema, graph/config revisions, dependents,
   and active resources. It returns the exact impact to confirm.
4. `plugins.apply_change` accepts that single-use plan only while its revisions are current.
5. The loader starts, reloads, or unloads affected scopes. All commands, listeners, tasks, services,
   child processes, and cleanup effects owned by the scope MUST disappear on unload.
6. Policy becomes last-known-good only after the requested runtime state is reached. Failure rolls
   back policy and runtime together.

The essential management plane MUST remain available. If primary policy is corrupt, the host uses
the last-known-good snapshot without overwriting evidence; if both are unusable, it enters safe mode
with only essential management plugins. `plugins.reset` is the recovery operation.

### User and project scopes

- User policy is the default. A project may inherit, enable, or disable a project-capable runtime.
- `scopeSupport` is a capability declaration, not an installation location.
- A project runtime MUST have an independent graph instance, command realm, process, and data
  directory. It MUST NOT expose another project's commands.
- Project processes run with a normalized `projectPath` and data under
  `.data/<bundle-id>/projects/<project-hash>`.
- An active command or resource lease MUST prevent idle reclamation while work is in flight.
- Skills and other data-only bundle contributions are currently user-wide. Project runtime policy
  MUST NOT be presented as isolation for those contributions.

## 5. Contribution conformance

| Contribution | C2 1.0 status | Required behavior |
| --- | --- | --- |
| Agent Skills | supported | `skills/<name>/SKILL.md`; inline fallback across providers |
| Subagents | supported with fallback | `agents/*.md`; provider delegation when available, otherwise the same bounded contract is followed inline |
| MCP | supported | Root `mcp.json` using Agent Plugins 1.0.0; stdio, Streamable HTTP, and SSE are capability-checked |
| Commands | supported as content | `commands/*.md` compiles to the Skill fallback; runtime commands use the process protocol |
| Scenes and Pipelines | supported on Rust core hosts | Versioned schemas, library commands, assignment, hooks, scheduling, artifacts, and pipeline execution |
| Scaffolds | supported | Explicit project target, complete conflict check, no overwrite |
| LSP | stdio supported | Declared only in `extensions.dev.codetwo.languageServers`; explicit trust, matching language mapping, owned lifecycle |
| Hooks and monitors | inventoried | Only `hooks/hooks.json` and `monitors/monitors.json`; no runtime adapter yet, so they MUST be displayed as unsupported |
| Other files | stored, inactive | Preserved as bundle data but MUST NOT be inferred or reported as contributions |
| UI contributions | C2-owned descriptors only | Third-party React, HTML, or arbitrary web code MUST NOT execute in the renderer in 1.0 |

An MCP server is session composition, not a live graph runtime: installing does not start it, and an
already-created ACP session does not silently change when its MCP set changes. A process `runtime`,
by contrast, is reconciled live as `bundle:<id>`.

## 6. Recent product capabilities

Plugin boundaries for current features are fixed as follows:

| Product capability | Owning boundary | Additional rule |
| --- | --- | --- |
| Provider models and reasoning effort | `providers` + `engine` | Render only efforts advertised by the selected provider; never invent parity |
| Structured elicitation | `engine` / ACP host adapter | Validate answers against the offered form; unsupported clients must fail closed |
| Worktrees and checkpoints | `engine`, `workspace`, `git` | Project command realm and active-resource cleanup are required before disable |
| Automations | host `automation` adapter | CRUD and background execution are separate capabilities; a host may support one without the other |
| Issues and delegation | `issues` | Read, mutation, and durable delegation records are separate capabilities |
| Memory | `memory` | Retain project scope and provenance; component disable must reach the real runtime |
| Usage and provider quota | `usage` + provider adapter | `unsupported` and `query_failed` are first-class states, never zero usage |
| Voice | host `voice` adapter | Native permission, entitlement, and transcription remain host-owned |
| Remote/Tailscale | host `remote` adapter | No plugin enablement may implicitly expose a listener or hosted relay |
| Device synchronization | host `device-sync` adapter + Core document | Transport credentials stay host-owned; snapshot validation, merge, and deletion semantics stay in Core |
| Canvas | `canvas` + `document` | Component enablement does not bypass the production safety feature gate |
| Browser | host `browser` adapter | Manual sandboxed tabs and authenticated agent automation are different capabilities |

## 7. Host capability profiles

The Rust core is the reference C2 1.0 runtime. The TUI and server may intentionally omit UI or
host-native plugins through configuration while retaining the same graph and command semantics.

The Electrobun desktop packages the reference runtime as `codetwo-desktop-host`. That executable
boots the same `CoreApp` and managed plugin graph used by the TUI and server, then adds desktop-owned
automation, device-sync, language-server, event, and remote adapters. Electrobun owns windows,
dialogs, updates, manual webviews, and one versioned command/event relay; it does not implement
plugin lifecycle.

Installed records are reconciled by the Rust manager at startup. Portable bundles can be imported,
trust and enablement remain separate, commands register and disappear live, safe UI actions render
in the five supported slots, and plugin language servers use the existing LSP client and lifecycle.
User/project runtime policy uses the same revision-bound `plan_change -> apply_change` contract.
Project-capable bundles receive a separate process, command realm, and BLAKE3-keyed data directory
per project. UI invocation verifies the contribution, runtime realm, and owning bundle before the
process command is called.

The desktop currently fails closed for the authenticated agent-browser MCP adapter. Its manual
BrowserView tabs are a separate UI capability; the stable embedded webview surface does not expose
the screenshot and evaluation primitives required for authenticated agent automation.

A host MUST return an explicit unsupported state or error for an unavailable operation. Returning an
empty success value is permitted only for a genuine empty collection. Frontends SHOULD use catalog
metadata and operation results; command name presence alone is not sufficient because a partial
host may register a fail-closed placeholder to preserve the typed bridge.

## 8. Security and resource limits

- A trusted process has the user's OS permissions. C2 1.0 provides lifecycle isolation, not an OS
  sandbox, filesystem jail, network policy, or secret boundary.
- The JSON event bus is host-wide and MUST NOT be treated as project-confidential.
- Bundle discovery MUST reject traversal, escape through symlinks, oversized files/bundles, and
  unsafe component paths. Installation MUST remain bounded and atomic.
- Runtime stdout is protocol-only; logs belong on stderr. Handshake time is bounded, but
  `command/invoke` currently has no host timeout.
- On Unix, unload waits for the direct child and kills its process group. Other platforms MUST state
  their weaker process-tree guarantee rather than imply parity.
- UI surfaces MUST render trusted host descriptors. Arbitrary third-party renderer code is outside
  this standard.

## 9. Versioning

Three versions evolve independently:

| Version | Location | Loading rule |
| --- | --- | --- |
| Agent Plugins | root `$schema` | Only locally recognized schema versions load |
| C2 Plugin Standard | `extensions.dev.codetwo.standardVersion` | MUST equal `1.0.0` |
| C2 Plugin Protocol | manifest `runtime.protocol` and `initialize.protocolVersion` | Handshake major must match; the handshake is authoritative |

A different Agent Plugins schema or C2 standard version is a different package contract and does
not load. Unknown fields, malformed runtime/UI/LSP declarations, duplicate contribution IDs, and
missing required files invalidate the bundle. Protocol negotiation happens only after a valid,
trusted bundle has been enabled and its process starts.

## 10. Conformance checklist

A change is plugin-conformant only when all applicable statements are true:

- The feature is owned by one runtime module and reached through `subsystem.verb` commands or typed
  events, not a new parallel bridge.
- Dependencies and optional dependencies are declared; owned resources are registered for cleanup.
- Catalog metadata names role, origin, category, supported scopes, essential state, and default
  state.
- Configuration has a schema when user-editable, and changes use revision-bound plan/apply.
- Executable bundle content is trust-gated and installation remains data-only.
- Project support has a real isolated instance and command realm, not a UI-only scope label.
- Unsupported components and host capabilities are visible and fail closed.
- Tests prove load, command registration, unload cleanup, dependency loss, invalid input boundaries,
  and any project-scope behavior.
- Documentation updates this standard, the protocol when wire behavior changes, and host profile
  evidence when capabilities change.

Useful validation commands:

```sh
cargo test -p codetwo-core plugin --lib
cargo test -p codetwo-core --test plugin_protocol
cargo test -p codetwo-core --test project_bundle_runtime
cd apps/desktop && bun test && bun run build
cd website && bun run docs:build
```
