# Keybindings & command palette

## Command palette

Press `Mod+K` (⌘K on macOS, Ctrl+K elsewhere) to open the command palette. Fuzzy-search across:

- **actions** — Run, New session, Source control, Checkpoint now, Skill market, Insert a skill,
  Remote control, Settings, Toggle terminal/browser/git, Refresh git, Cycle approval mode…
- **project scripts** — anything defined in your project's setup config.
- **sessions** — jump to any session.

Each command shows its keyboard shortcut (from the live keymap) on the right. Arrow keys to move,
Enter to run, Esc to close.

## Default keybindings

"Mod" is ⌘ on macOS, Ctrl elsewhere. Every action in the app has a binding — there are no keys that
silently do nothing.

**Prompt**

| Action | Shortcut |
| --- | --- |
| Run prompt | `Mod+Enter` |
| Cancel turn | `Mod+.` |
| Open skill picker (`/`) | `Mod+/` |
| Focus editor | `Mod+E` |
| Expand document to full height | `Mod+Shift+E` |

**Sessions**

| Action | Shortcut |
| --- | --- |
| New session | `Mod+N` |
| Previous session | `Mod+Alt+↑` |
| Next session | `Mod+Alt+↓` |

**Panels**

| Action | Shortcut |
| --- | --- |
| Toggle terminal | `Mod+J` |
| Toggle browser | `Mod+B` |
| Toggle git panel | `Mod+Shift+B` |
| Close side panel | `Esc` |

**Open**

| Action | Shortcut |
| --- | --- |
| Command palette | `Mod+K` |
| Source control | `Mod+Shift+G` |
| Skill market | `Mod+Shift+M` |
| Browse workspace files | `Mod+P` |
| Issues (GitHub / Linear) | `Mod+Shift+I` |
| Usage | `Mod+Shift+U` |
| Settings | `Mod+,` |

**Other**

| Action | Shortcut |
| --- | --- |
| Cycle approval mode | `Mod+Shift+P` |
| Refresh git status | `Mod+G` |

Shortcut hints in tooltips, the command palette, and the composer are read from the live keymap —
rebind a key and the hint updates everywhere.

## Customizing

Open **Settings** (`Mod+,`). Actions are grouped (Prompt, Sessions, Panels, Open, Modes) with their
current shortcut. Click a shortcut, then press the new chord to rebind it; press **Esc** while
capturing to cancel, or the **↺** button to restore a default. If two actions share a chord, both are
flagged as a **conflict**. Changes are saved to `~/.config/codetwo/keymap.json` (a data dir on your
platform) and layered over the defaults, so untouched actions keep theirs.

The keymap lives in the shared core, so it stays consistent across surfaces.
