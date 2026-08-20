# C2 Plugin Standard 1.0.0

Status: **normative for C2-owned plugin behavior**. The portable package format remains
[Agent Plugins 1.0.0](https://agent-plugins.org/specification); the process wire format is specified
separately in [The C2 Plugin Protocol](plugin-protocol.md).

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe requirements. A detected file is
not a supported capability until a host has an adapter for it and reports that support truthfully.

## 1. System model

C2 uses five distinct concepts. Calling all five “a plugin” hides the boundary that matters, so
code, UI, diagnostics, and documentation MUST use the precise term where ambiguity is possible.

| Term | Meaning | Stable interface |
| --- | --- | --- |
| **Bundle** | An installable, versioned directory of metadata, data, and optional code. Installation is data-only. | Agent Plugins manifest plus native overlays |
| **Contribution** | Declarative content such as a Skill, MCP definition, Scene, Pipeline, scaffold, or C2-owned UI descriptor. | Component-specific schema or file convention |
| **Runtime module** | Behavior loaded into the graph: a compiled `Plugin` or a trusted child process. | Commands, events, services, dependencies, and cleanup |
| **Host adapter** | The narrow implementation that connects a runtime module to Rust, Electrobun/Bun, TUI, server, or a native OS service. | Host capability profile and the typed `call` boundary |
| **Policy** | Durable user/project intent, trust, configuration, recovery, and lifecycle decisions. | `catalog -> plan_change -> apply_change`, plus `reset` |

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

New portable bundles MUST put identity in root `plugin.json` using Agent Plugins 1.0.0. C2-specific
data MUST live under the reverse-domain namespace `extensions.dev.codetwo`; it MUST NOT be added as
an unknown top-level Agent Plugins field.

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
      }
    }
  }
}
```

`extensions.dev.codetwo` has these fields in 1.0.0:

| Field | Required | Contract |
| --- | --- | --- |
| `standardVersion` | yes | Semantic version of this C2 extension. The host loads compatible major version 1 data and ignores unsupported majors with a diagnostic. |
| `runtime` | no | Declares one process runtime using the C2 Plugin Protocol. |

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

For native `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` overlays, C2 continues to
read the historical top-level `runtime` field. That compatibility form MUST NOT be copied into an
Agent Plugins root manifest. When both a portable C2 extension and a native overlay declare a
runtime, Agent Plugins, then Codex, then Claude Code precedence applies and lower-priority entries
are ignored with a diagnostic.

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
2. A C2 process runtime and native LSP remain stopped until the bundle is both **enabled** and
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
| Agent Skills | supported | Portable discovery, invalid-sibling isolation, inline fallback across providers |
| Subagents | supported with fallback | Native delegation when available; otherwise the same bounded contract is followed inline |
| MCP | supported | stdio, Streamable HTTP, and SSE are capability-checked; a changed MCP config applies to new sessions |
| Commands | supported as content | Native command Markdown compiles to the Skill fallback; runtime commands use the process protocol |
| Scenes and Pipelines | supported on Rust core hosts | Versioned schemas, library commands, assignment, hooks, scheduling, artifacts, and pipeline execution |
| Scaffolds | supported | Explicit project target, complete conflict check, no overwrite |
| LSP | stdio supported | Explicit trust, matching language mapping, owned lifecycle; socket definitions remain inventoried only |
| Hooks, workflows, monitors | inventoried | No C2 runtime adapter yet; MUST be displayed as unsupported |
| Apps, channels, dependencies, settings, bin, themes, output styles, user config | inventoried | Preserved as bundle data; MUST NOT be reported as active |
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
| Canvas | `canvas` + `document` | Component enablement does not bypass the production safety feature gate |
| Browser | host `browser` adapter | Manual sandboxed tabs and authenticated agent automation are different capabilities |

## 7. Host capability profiles

The Rust core is the reference C2 1.0 runtime. The TUI and server may intentionally omit UI or
host-native plugins through configuration while retaining the same graph and command semantics.

The current Pure Bun Electrobun desktop is an experimental compatibility host, not a conforming
full plugin runtime. It implements the renderer's typed command/event contract for the primary local
path, including projects, sessions/ACP, constrained workspace I/O, Git, PTY, LSP, memory CRUD,
automation CRUD, GitHub issue reads, and structured elicitation. It currently fails closed for:

- bundle installation and dynamic runtime lifecycle;
- user/project `plan_change -> apply_change` management;
- isolated worktree creation/discard;
- background automation execution;
- scenes, pipelines, and canvas persistence;
- native voice transcription, remote server/pairing, and the authenticated agent-browser MCP;
- provider quota queries and unsupported issue mutations.

A host MUST return an explicit unsupported state or error for an unavailable operation. Returning an
empty success value is permitted only for a genuine empty collection. Frontends SHOULD use catalog
metadata and operation results; command name presence alone is not sufficient because a compatibility
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

## 9. Versioning and compatibility

Three versions evolve independently:

| Version | Location | Compatibility |
| --- | --- | --- |
| Agent Plugins | root `$schema` | Only locally recognized schema versions load |
| C2 Plugin Standard | `extensions.dev.codetwo.standardVersion` | Same major is compatible; minor additions must be ignorable |
| C2 Plugin Protocol | manifest `runtime.protocol` and `initialize.protocolVersion` | Handshake major must match; the handshake is authoritative |

A standard or protocol major bump may remove or reinterpret behavior. Minor changes are additive.
Unknown C2 fields generate a diagnostic and are ignored; portable contributions continue loading
when the C2 standard version is unsupported or its runtime declaration is malformed. A malformed
portable manifest follows the stricter Agent Plugins failure boundary.

## 10. Conformance checklist

A change is plugin-conformant only when all applicable statements are true:

- The feature is owned by one runtime module and reached through `subsystem.verb` commands or typed
  events, not a new parallel bridge.
- Dependencies and optional dependencies are declared; owned resources are registered for cleanup.
- Catalog metadata names origin, category, supported scopes, essential state, and default state.
- Configuration has a schema when user-editable, and changes use revision-bound plan/apply.
- Executable bundle content is trust-gated and installation remains data-only.
- Project support has a real isolated instance and command realm, not a UI-only scope label.
- Unsupported components and host capabilities are visible and fail closed.
- Tests prove load, command registration, unload cleanup, dependency loss, invalid input boundaries,
  and any project-scope behavior.
- Documentation updates this standard, the protocol when wire behavior changes, and the compatibility
  ledger when external ecosystems or host profiles change.

Useful validation commands:

```sh
cargo test -p codetwo-core plugin --lib
cargo test -p codetwo-core --test plugin_protocol
cargo test -p codetwo-core --test project_bundle_runtime
cd apps/desktop && bun test && bun run build
cd website && bun run docs:build
```
