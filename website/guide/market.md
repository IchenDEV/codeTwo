# Plugin Hub

**Plugin Hub** is the package manager for Code2. It combines installed GitHub plugins, their
composable components, project scaffolds, and the built-in component market. Open it from the
package button at the foot of the session rail, the [command palette](/guide/keybindings), or with
`Mod+Shift+M`.

## Installing a GitHub plugin

Choose **Install from GitHub**, then enter one of these forms:

- `owner/repository`
- `https://github.com/owner/repository`
- `https://github.com/owner/repository/tree/ref/path` to select one plugin in a larger repository

Code2 understands the portable Agent Plugins 1.0.0 root `plugin.json`,
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
  `.claude/agents/`. Code2 compiles a delegation contract that capable providers may hand to a
  focused worker; the same contract is followed inline when native delegation is unavailable.
- **MCP** — local stdio or remote HTTP/SSE servers from `.mcp.json`. Adding one to the document
  attaches it during ACP `session/new`; merely installing a plugin does not launch the server.
  Remote transports require the corresponding capability from the selected Agent, and Code2 reports
  an explicit error before the turn if it is absent.
- **Commands** — native command Markdown is compiled into the same cross-provider inline form as a
  Skill.
- **LSP** — valid stdio definitions from `.lsp.json` or inline `lspServers` can replace the stock
  language server for matching language ids after the plugin is explicitly trusted. Socket LSP is
  inventoried but not run.

The compiled-prompt preview lists attached Skills, Subagents, and MCP servers before a turn runs.

## Opening a marketplace

Choose **Open marketplace** and select either `.agents/plugins/marketplace.json` or
`.claude-plugin/marketplace.json`. Code2 lists valid entries even when sibling entries are invalid.
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

Choose **Add to project** on the installed plugin. Code2 performs a complete conflict check first
and refuses the operation if any target file already exists; it never silently overwrites the
workspace. `scaffold.json` is metadata and is not copied into the project.

## Installation and trust boundary

Plugin installation shallow-clones the repository into a temporary directory, validates bounded
relative paths, skips symlinks, and limits component count, file count, individual file size, total
bundle size, traversal depth, and clone time. The validated package is then atomically installed in
Code2's application-data `plugins/` directory. Updating the same repository and plugin path replaces
that package; uninstalling removes the package and all of its components.

Installation never executes repository scripts. Plugin files, including scripts and assets, are
preserved for the package. MCP starts only when composed into a session; plugin LSP starts only when
the package is enabled, explicitly trusted, and a matching file is opened. Disable a package to
remove its prompt/runtime components from new sessions, or revoke trust to block executable native
components. Uninstall can delete the package-owned persistent data or retain it for a later reinstall.

## Built-in market and local skills

The **Market** tab retains Code2's curated offline components. **Install** adds a component to the
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
