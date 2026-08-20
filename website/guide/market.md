# Plugin Hub

**Plugin Hub** is the package manager for C2. It combines installed GitHub plugins, their
composable components, project scaffolds, and the built-in component market. Open it from the
package button at the foot of the session rail, the [command palette](/guide/keybindings), or with
`Mod+Shift+M`.

> [!IMPORTANT]
> The Rust core implements the complete bundle manager and live process runtime. The experimental
> Pure Bun Electrobun desktop currently shows the compatibility catalog but fails closed for bundle
> installation, marketplace operations, and dynamic plugin lifecycle. It does not pretend that an
> empty catalog is full support.

## Installing a GitHub plugin

Choose **Install from GitHub**, then enter one of these forms:

- `owner/repository`
- `https://github.com/owner/repository`
- `https://github.com/owner/repository/tree/ref/path` to select one plugin in a larger repository

C2 understands the portable Agent Plugins 1.0.0 root `plugin.json`,
`.codex-plugin/plugin.json`, and `.claude-plugin/plugin.json`. Coexisting manifests are merged with
deterministic metadata precedence: Agent Plugins, then Codex, then Claude Code. A repository with no
manifest is treated as a conventional plugin when it contains one of the supported folders below,
so existing skill-only repositories remain installable.

```text
my-plugin/
├── plugin.json                  # Agent Plugins 1.0.0, when present
├── .codex-plugin/plugin.json
├── .claude-plugin/plugin.json
├── skills/<name>/SKILL.md
├── agents/<name>.md
├── commands/<name>.md
├── mcp.json                     # Agent Plugins portable MCP
├── .mcp.json
├── .lsp.json
├── scenes/<name>.scene.json
├── scenes/<name>.pipeline.json
├── scaffolds/<name>/
│   ├── scaffold.json
│   └── ...project files
├── scripts/
└── assets/
```

Agent Plugins schema selection is local and versioned: this release accepts 1.0.0 and never fetches
a schema while installing. Invalid portable Skills and MCP entries are isolated and reported in the
plugin detail instead of hiding valid siblings. Native `skills`, `commands`, `agents`, `mcpServers`,
and `lspServers` paths may be declared with `./`-relative paths. Unsupported native components are
preserved and shown explicitly; detection alone is not reported as runtime support.

## Components

Installed packages expose these composable or runtime component types:

- **Skills** — standard `SKILL.md` instructions, with an inline cross-provider fallback.
- **Subagents** — Markdown specialist definitions from `agents/`, `subagents/`, `.codex/agents/`, or
  `.claude/agents/`. C2 compiles a delegation contract that capable providers may hand to a
  focused worker; the same contract is followed inline when native delegation is unavailable.
- **MCP** — local stdio or remote HTTP/SSE servers from `.mcp.json`. Adding one to the document
  attaches it during ACP `session/new`; merely installing a plugin does not launch the server.
  Remote transports require the corresponding capability from the selected Agent, and C2 reports
  an explicit error before the turn if it is absent.
- **Commands** — native command Markdown is compiled into the same cross-provider inline form as a
  Skill.
- **LSP** — valid stdio definitions from `.lsp.json` or inline `lspServers` can replace the stock
  language server for matching language ids after the plugin is explicitly trusted. Socket LSP is
  inventoried but not run.
- **Scenes and Pipelines** — versioned declarative scene and pipeline files are composed into the
  Rust core's scene library. Their assignment, hooks, scheduling, artifacts, and execution require
  the corresponding host capability.
- **Scaffolds** — bounded project templates applied only after a complete overwrite conflict check.
- **C2 process runtime** — a trusted child process that contributes live commands and event
  subscriptions through the C2 Plugin Protocol. It appears in the manager as `bundle:<id>` and is
  unloaded with its commands and owned resources.

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
      "standardVersion": "1.0.0",
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
[C2 Plugin Standard 1.0.0](https://github.com/IchenDEV/codeTwo/blob/main/docs/plugin-standard.md);
the stdio JSON-RPC messages are documented in the
[C2 Plugin Protocol](https://github.com/IchenDEV/codeTwo/blob/main/docs/plugin-protocol.md).

## Live management and project scope

The reference manager lists built-in modules, host adapters, installed process bundles, C2-owned UI
descriptors, and marketplace entries in one catalog. A state change is always planned first: the
plan reports dependencies and active resources and is bound to the current graph/config revision.
Only that confirmed, unused plan can be applied. Disable, configuration changes, trust revocation,
replacement, and uninstall reconcile live without an app restart.

A runtime is user-only unless it explicitly declares `scopeSupport: ["user", "project"]`. Project
support creates an independent process, command realm, and data directory for each live project.
Skills and other data-only components in the same bundle remain user-wide; the UI does not present
project runtime policy as isolation for them. If policy cannot boot, C2 restores the last-known-good
state or exposes safe mode and reset through the essential management plane.

## Opening a marketplace

Choose **Open marketplace** and select either `.agents/plugins/marketplace.json` or
`.claude-plugin/marketplace.json`. C2 lists valid entries even when sibling entries are invalid.
Relative local sources, public GitHub sources, and GitHub `git-subdir` sources are installable;
branch, tag, and exact SHA pins are preserved. npm, archive, private/authenticated repositories, and
non-GitHub Git sources are currently shown with an explicit unsupported diagnostic rather than
silently falling back to another source.

## Installing a scaffold

Each direct child of `scaffolds/` or `templates/` is an installable project scaffold. An optional
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
remove its prompt/runtime components from new sessions, or revoke trust to block executable native
components. Uninstall can delete the package-owned persistent data or retain it for a later reinstall.

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
