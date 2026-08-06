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

Code2 understands `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json`. A repository with no
manifest is treated as a conventional plugin when it contains one of the supported folders below,
so existing skill-only repositories remain installable.

```text
my-plugin/
├── .codex-plugin/plugin.json
├── skills/<name>/SKILL.md
├── agents/<name>.md
├── .mcp.json
├── scaffolds/<name>/
│   ├── scaffold.json
│   └── ...project files
├── scripts/
└── assets/
```

The canonical manifest fields `name`, `version`, `description`, `author`, `skills`, `mcpServers`,
and `interface.displayName` are read. `skills` and `mcpServers` may point to custom relative paths;
Subagents and scaffolds use the conventional folders shown above.

## Components

Installed packages expose three composable component types in the **Components** tab and `/`
picker:

- **Skills** — standard `SKILL.md` instructions, with an inline cross-provider fallback.
- **Subagents** — Markdown specialist definitions from `agents/`, `subagents/`, `.codex/agents/`, or
  `.claude/agents/`. Code2 compiles a delegation contract that capable providers may hand to a
  focused worker; the same contract is followed inline when native delegation is unavailable.
- **MCP** — local stdio or remote HTTP/SSE servers from `.mcp.json`. Adding one to the document
  attaches it during ACP `session/new`; merely installing a plugin does not launch the server.
  Remote transports require the corresponding capability from the selected Agent, and Code2 reports
  an explicit error before the turn if it is absent.

The compiled-prompt preview lists attached Skills, Subagents, and MCP servers before a turn runs.

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
preserved for the package, but code runs only later when you explicitly use an MCP component. Read
the source and install only repositories you trust: Skills and Subagents become prompt instructions,
and MCP servers are executable integrations.

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
