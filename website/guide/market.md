# Features & Plugins

**Features & Plugins** is the package manager for C2. It combines optional built-in features,
installed GitHub plugins, their composable components, project scaffolds, and the component market.
Open it from the package button at the foot of the session rail, the
[command palette](/guide/keybindings), or with `Mod+Shift+M`.

> [!IMPORTANT]
> Desktop, TUI, and server use the same Rust bundle manager and live process runtime. The desktop
> supports installation, trust, enablement, project realms, UI actions, language servers, and live
> lifecycle changes through its bundled Rust host.

## Installing a GitHub plugin

Choose **Install from GitHub**, then enter one of these forms:

- `owner/repository`
- `https://github.com/owner/repository`
- `https://github.com/owner/repository/tree/ref/path` to select one plugin in a larger repository

C2 accepts one package contract: a root Agent Plugins 1.0.0 `plugin.json` with
`extensions.dev.codetwo.standardVersion` equal to current `1.1.0` or legacy `1.0.0`. The selected
GitHub directory is the bundle root; C2 neither searches nested directories nor infers a plugin
from component folders.

```text
my-plugin/
├── plugin.json                  # Agent Plugins 1.0.0 + C2 1.1.0 extension
├── skills/<name>/SKILL.md
├── agents/<name>.md
├── commands/<name>.md           # prompt commands
├── mcp.json                     # Agent Plugins 1.0.0 MCP schema
├── hooks/hooks.json             # inventoried, not executed
├── monitors/monitors.json       # inventoried, not executed
├── scenes/<name>.scene.json
├── scenes/<name>.pipeline.json
├── scaffolds/<name>/
│   ├── scaffold.json
│   └── ...project files
├── scripts/
└── assets/
```

Schema selection is local and deterministic: this release accepts Agent Plugins 1.0.0 and C2
Plugin Standard 1.1.0, plus the C2 1.0.0 compatibility contract, and never fetches a schema while
installing. Unknown manifest fields,
malformed declared contributions, duplicate IDs, unsafe paths, or missing bundle-relative commands
invalidate the bundle. Files outside the canonical locations above are stored but not inferred as
contributions.

## Components

Installed packages expose these composable or runtime component types:

- **Skills** — `skills/<name>/SKILL.md` instructions, with an inline cross-provider fallback.
- **Subagents** — Markdown specialist definitions from `agents/*.md`. C2 compiles a delegation
  contract that capable providers may hand to a focused worker; the same contract is followed
  inline when provider delegation is unavailable.
- **MCP** — local stdio or remote HTTP/SSE servers from root `mcp.json`. Adding one to the document
  attaches it during ACP `session/new`; merely installing a plugin does not launch the server.
  Remote transports require the corresponding capability from the selected Agent, and C2 reports
  an explicit error before the turn if it is absent.
- **Prompt commands** — `commands/*.md` is compiled into the same cross-provider inline form as a
  Skill.
- **Runtime commands** — `extensions.dev.codetwo.commands` declares a process Bundle's complete
  command surface so C2 can inspect and register it before code runs.
- **LSP** — stdio definitions in `extensions.dev.codetwo.languageServers` can replace the stock
  language server for matching language IDs after the plugin is explicitly trusted.
- **Scenes and Pipelines** — versioned declarative scene and pipeline files are composed into the
  Rust core's scene library. Their assignment, hooks, scheduling, artifacts, and execution require
  the corresponding host capability.
- **Scaffolds** — bounded project templates applied only after a complete overwrite conflict check.
- **C2 process runtime** — a child process that implements static Runtime commands and event
  subscriptions through the C2 Plugin Protocol. An enabled and trusted adapter appears as
  `bundle:<id>`; the child starts on the first command invocation and unloads with its commands and
  owned resources. It can call back only into commands Core has
  explicitly published through the Extension API; private Core commands are not exposed.

The compiled-prompt preview lists attached Skills, Subagents, and MCP servers before a turn runs.

## Declaring a C2 process runtime

Agent Plugins 1.0.0 has a closed top-level manifest. Put C2 behavior under the client-extension
namespace rather than adding a top-level `runtime` field:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "version": "1.0.0",
  "extensions": {
    "dev.codetwo": {
      "standardVersion": "1.1.0",
      "commands": [{
        "id": "review.run",
        "title": "Review workspace",
        "description": "Review the current workspace.",
        "argsSchema": { "type": "object", "additionalProperties": false }
      }],
      "runtime": {
        "protocol": "1.0.0",
        "command": "node",
        "args": ["dist/plugin.js"],
        "inject": ["store"],
        "optionalInject": ["engine"],
        "scopeSupport": ["user", "project"]
      }
    }
  }
}
```

The complete normative contract is the
[C2 Plugin Standard 1.1.0](https://github.com/IchenDEV/codeTwo/blob/main/docs/reference/plugin-standard.md);
the stdio JSON-RPC messages are documented in the
[C2 Plugin Protocol](https://github.com/IchenDEV/codeTwo/blob/main/docs/reference/plugin-protocol.md).

## Live management and project scope

The manager lists optional built-in/host features, installed process bundles, C2-owned UI
descriptors, and marketplace entries. Core runtime modules remain available to diagnostics but are
not user plugin toggles. A state change is always planned first: the plan reports dependencies and
active resources and is bound to the current graph/config revision. Only that confirmed, unused
plan can be applied. Disable, configuration changes, trust revocation, replacement, and uninstall
reconcile live without an app restart.

A runtime is user-only unless it explicitly declares `scopeSupport: ["user", "project"]`. Project
support creates an independent process, command realm, and data directory for each live project.
Skills and other data-only components in the same bundle remain user-wide; the UI does not present
project runtime policy as isolation for them. If policy cannot boot, C2 restores the last-known-good
state or exposes safe mode and reset through the essential management plane.

## Opening a marketplace

Choose **Open marketplace** and select a C2 `marketplace.json` whose `standardVersion` is `1.0.0`.
C2 lists valid entries even when sibling entries are invalid. Relative local sources, public GitHub
sources, and GitHub HTTPS `git` sources are installable. The public `c2-plugins` catalog requires an
exact commit SHA; local team catalogs may also preserve a branch or tag reference. npm, archive,
private/authenticated repositories, and non-GitHub Git sources are currently shown with an explicit
unsupported diagnostic rather than silently falling back to another source.

```json
{
  "standardVersion": "1.0.0",
  "name": "team-tools",
  "displayName": "Team Tools",
  "plugins": [{
    "name": "review-tools",
    "version": "1.2.0",
    "installationPolicy": "AVAILABLE",
    "authenticationPolicy": "NONE",
    "defaultEnabled": true,
    "source": {
      "kind": "github",
      "repository": "acme/review-tools",
      "reference": "v1.2.0",
      "sha": "0123456789abcdef0123456789abcdef01234567"
    }
  }]
}
```

Marketplace and bundle names and versions must match at installation. Unknown catalog, entry, or
source fields are rejected; sources never fall through to another kind.

## Installing a scaffold

Each direct child of `scaffolds/` is an installable project scaffold. An optional
`scaffold.json` supplies its display name and description:

```json
{
  "name": "React app",
  "description": "Minimal Vite project"
}
```

Choose **Add to project** on the installed plugin. C2 performs a complete conflict check first
and refuses the operation if any target file already exists; it never silently overwrites the
workspace. `scaffold.json` is metadata and is not copied into the project.

## Installation and trust boundary

Plugin installation shallow-clones the repository into a temporary directory, validates bounded
relative paths, skips symlinks, and limits component count, file count, individual file size, total
bundle size, traversal depth, and clone time. The validated package is then atomically installed in
C2's application-data `plugins/` directory. Updating the same repository and plugin path replaces
that package; uninstalling removes the package and all of its components.

Installation never executes repository scripts. Plugin files, including scripts and assets, are
preserved for the package. MCP starts only when composed into a session; plugin LSP starts only when
the package is enabled, explicitly trusted, and a matching file is opened. Disable a package to
remove its prompt/runtime components from new sessions, or revoke trust to block executable
components. A 1.1 process remains dormant after trust until its first Runtime command invocation.
Uninstall can delete the package-owned persistent data or retain it for a later reinstall.

Trust is not an OS sandbox. A trusted process has the user's filesystem, environment, and network
permissions, and the current JSON event bus is host-wide rather than project-confidential. Review
runtime bundles as executable software.

## Built-in market and local skills

The **Market** tab retains C2's curated offline components. **Install** adds a component to the
local library, **Use** inserts it into the current document, and **Trash** removes it. You can also
use **New skill** or drop compatible JSON into the application-data `skills/` directory.

```json
{
  "id": "my-reviewer",
  "name": "My Reviewer",
  "description": "House style review",
  "icon": "🔍",
  "payload": { "kind": "fragment", "text": "Review against our house style: …" }
}
```
