# Skill market

The **skill market** lets you browse a curated catalog and install skills into your library with one
click. Open it from the **🛒** button at the foot of the session rail, or the [command palette](/guide/keybindings)
("Open skill market").

## Browsing & installing

Each entry shows an icon, name, description, author, tags, and its kind. Search by name or tag.

- **Install** — copies the skill into your library. It's immediately available in the `/` picker and
  the prompt compiler.
- **Installed ✓** — click to uninstall.

Installing writes a JSON file to `~/.config/codetwo/skills/`; the live library reloads so the change
is reflected everywhere at once.

## What's in the catalog

The bundled catalog includes personas and macros such as **System Architect**, **Test Suite Author**,
**Docs Writer**, **Refactor Guru**, **SQL Optimizer**, **Rust Expert**, and **Accessibility Audit**,
plus workflow macros (**Conventional Commit**, **PR Description**) and **MCP tools**:

- **Browser Tool (MCP)** — gives the agent a browser via an MCP server.
- **Filesystem Tool (MCP)** — scoped filesystem access via an MCP server.

::: info
MCP entries attach a server at session start. The server binary must exist on your machine for the
provider to launch it — the catalog entry wires it up, but doesn't ship the server itself.
:::

## Authoring your own

You don't need the market to add skills. Use **＋** at the foot of the session rail to author a fragment, or
drop a JSON file into `~/.config/codetwo/skills/`. A skill file looks like:

```json
{
  "id": "my-reviewer",
  "name": "My Reviewer",
  "description": "House style review",
  "icon": "🔍",
  "payload": { "kind": "fragment", "text": "Review against our house style: …" }
}
```

Macro and MCP payloads:

```json
{ "payload": { "kind": "macro", "template": "Summarize {{scope}} in {{style}} style.", "slots": ["scope", "style"] } }
{ "payload": { "kind": "mcp", "server": { "name": "fs", "command": "mcp-server-filesystem", "args": ["."], "env": [] } } }
```
