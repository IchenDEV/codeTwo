# Introduction

**codeTwo** is a coding-agent app with a different premise: instead of a chat box, you compose your
prompt as a **structured document** and weave in reusable **skills** with a `/` picker. It drives
existing coding CLIs — you keep your models, tools, and auth — behind one consistent interface.

## What makes it different

- **Document-first prompting.** Write a long, structured prompt in a Notion-style block editor.
  Insert skills as inline blocks and combine them, then submit the whole document as one turn. See
  [Document editor & skills](/guide/editor).
- **Skills, not snippets.** A skill is a typed, reusable building block — a persona/fragment, a
  parameterized macro, a reference to a provider-native Agent Skill, or an MCP tool. Browse and
  install more from the built-in [skill market](/guide/market).

## The layout

Four regions, each with one job:

| Region | Holds |
| --- | --- |
| **Session rail** (left) | Your sessions, grouped by recency and filterable. Skill-library management and the live provider sit at its foot. |
| **Transcript** (centre) | One **turn** per exchange — your prompt in a bubble, the answer full width, tools/thinking/plan collapsed underneath. |
| **Composer** (bottom) | The prompt you're composing. It sits where a chat box would, but it's the full document editor: `/` inserts a skill, `@` pulls in a file. Drag it taller, or expand it to the whole column (`Mod+Shift+E`) for a longer brief. |
| **Side dock** (right) | Terminal, browser, and git status — *beside* the document, not under it. Drag its edge to resize. |

Per-session setup (provider, working directory, approvals, sandbox, worktree, plan mode) lives in one
config popover, reached from the status chips along the bottom of the composer — so what this turn is
allowed to do is readable right where you fire it, and the header carries only per-moment actions.

## What it shares with the category

- One GUI (and TUI) over **five agent CLIs** — Claude Code, Codex, Grok, Cursor, OpenCode — via the
  [Agent Client Protocol](/guide/providers).
- **Git worktree** isolation per session, **checkpoints/diff/revert**, and commit/push from the UI.
  See [Git](/guide/git).
- Embedded **terminal**, **model/provider picker**, and **permission / YOLO** modes.
- A **command palette** and customizable **keybindings**.
- **Remote control** from another device.

## How it's built

One Rust core holds the whole brain — the ACP client, the engine, session persistence (SQLite),
skills, git, and the PTY. Three frontends link it:

| Surface | Stack |
| --- | --- |
| Desktop | Tauri v2 + React + BlockNote |
| Terminal | ratatui |
| Remote | `codetwo-server` (Axum WebSocket) + a mobile web client |

Read more in the [Architecture](/reference/architecture) reference.

## Status

codeTwo is early but functional and heavily tested (offline test suite across the core, TUI, and
server). Some things are intentionally out of scope today — a native mobile app, hosted/tunneled
remote access, and a visual browser element-picker. See the [FAQ](/reference/faq).
