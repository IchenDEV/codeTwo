# Keybindings & command palette

## Command palette

Press `Mod+K` (⌘K on macOS, Ctrl+K elsewhere) to open the command palette. Fuzzy-search across:

- **actions** — Run, New session, Source control, Checkpoint now, Skill market, Remote control,
  Settings, Toggle terminal/browser, Refresh git…
- **sessions** — jump to any session.

Arrow keys to move, Enter to run, Esc to close.

## Default keybindings

"Mod" is ⌘ on macOS, Ctrl elsewhere.

| Action | Shortcut |
| --- | --- |
| Run prompt | `Mod+Enter` |
| New session | `Mod+N` |
| Cancel turn | `Mod+.` |
| Command palette | `Mod+K` |
| Source control | `Mod+Shift+G` |
| Toggle terminal | `Mod+J` |
| Toggle browser | `Mod+B` |
| Open skill picker | `Mod+/` |
| Open settings | `Mod+,` |
| Focus editor | `Mod+E` |
| Cycle permission mode | `Mod+Shift+P` |
| Refresh git status | `Mod+G` |

## Customizing

Open **Settings** (`Mod+,`). Every action is listed with its current shortcut. Click a shortcut, then
press the new chord to rebind it. Changes are saved to `~/.config/codetwo/keymap.json` (a data dir on
your platform) and layered over the defaults, so untouched actions keep theirs.

The keymap lives in the shared core, so it stays consistent across surfaces.
