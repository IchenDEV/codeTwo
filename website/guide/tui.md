# The TUI

C2 ships a terminal UI (built with ratatui) that links the same core as the desktop app — same
engine, same SQLite store, same sessions.

```sh
cargo run -p codetwo-tui
```

## Layout

- **Left** — the session list.
- **Right, top** — the transcript (streamed agent text, thoughts, tool calls, plans).
- **Right, bottom** — the compose area: skill chips you've added plus a text input.
- **Bottom bar** — status, current provider/mode, and the key hints.

## Keys

| Key | Action |
| --- | --- |
| type + `Enter` | submit the prompt (creates a session on first run) |
| `/` | open the skill picker (↑/↓, Enter to add, Esc to close) |
| `Tab` | cycle provider |
| `Ctrl+N` | new session |
| `Ctrl+K` | cycle permission mode |
| `Ctrl+C` / `Esc` | quit |

When a permission request arrives, a prompt overlay appears — press the number of the option to
choose it, or `Esc` to cancel.

## Notes

The document-style, block-based editing is a desktop feature; in the TUI you compose with a text
input plus inline skill chips (the same skills, compiled the same way). The rich Source Control and
browser panels are desktop-only today.
