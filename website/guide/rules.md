# Project rules

Repos increasingly ship instructions for coding agents — but each tool reads a different file.
C2 loads **all of them** and prepends them to every compiled prompt, so your conventions travel
with the session no matter which provider runs it.

## Files it looks for

Searched in the session's working directory, in this order:

| File | Convention from |
| --- | --- |
| `AGENTS.md` | Codex |
| `CLAUDE.md` | Claude Code |
| `.cursorrules` | Cursor (classic) |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.codetwo/rules.md` | C2 |
| `.cursor/rules/*.md` / `*.mdc` | Cursor (current) |

Every file that exists is included. Empty files are skipped, and each is capped so an enormous rules
file can't swamp the prompt.

## What it looks like

The loaded rules become a section at the top of the compiled prompt:

```md
## Project rules

### AGENTS.md
Use tabs. Prefer small functions.

### .cursor/rules/style.md
No `unwrap()` in production code.
```

## Seeing exactly what's sent

Hit **Preview** (or the command palette → “Preview compiled prompt”) to see the fully compiled
prompt — rules included, skills expanded, macros substituted, and `@`-mentioned files inlined.
That's byte-for-byte what goes to the agent.

::: tip
Because rules are applied at compile time by the core, the [TUI](/guide/tui) and
[remote](/guide/remote) sessions get them too — not just the desktop app.
:::
