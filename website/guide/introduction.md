# Introduction

**C2** is a coding-agent app with a different premise: instead of a chat box, you compose your
prompt as a **structured document** and weave in reusable **skills** with a `/` picker. It drives
existing coding CLIs — you keep your models, tools, and auth — behind one consistent interface.

## What makes it different

- **Document-first prompting.** Write a long, structured prompt in a Notion-style block editor.
  Insert skills as inline blocks and combine them, then submit the whole document as one turn. See
  [Document editor & skills](/guide/editor).
- **Skills, not snippets.** A skill is a typed, reusable building block — a persona/fragment, a
  parameterized macro, a reference to a provider-native Agent Skill, or an MCP tool. Browse and
  install full packages or individual components from [Plugin Hub](/guide/market).
- **Inspectable project memory.** Stable rules and earlier outcomes can carry across sessions and
  providers through a bounded, local recall layer. Every derived item retains its source and can be
  pinned or forgotten. See [Project memory](/guide/memory).

## The layout

Four regions, each with one job:

| Region | Holds |
| --- | --- |
| **Session rail** (left) | Your sessions, with pinned work above the recency list and archived reference chats folded below it. Search spans actions and sessions; skill-library management and the live provider sit at the foot. |
| **Transcript** (centre) | One **turn** per exchange — your prompt in a bubble, the answer full width, tools/thinking/plan collapsed underneath. Recognizable subagents and workflows get their own read-only roster. |
| **Prompt** | The document you're composing: `/` inserts a skill, `@` pulls in a file. A new session opens it as a **full page**; sending docks it under the transcript, and `Mod+Shift+E` expands it again for a longer brief. |
| **Side dock** (right) | Terminal, browser, and git status — *beside* the document, not under it. Drag its edge to resize. |

Per-session setup (provider, working directory, approvals, ACP tool scope, worktree, plan mode) lives in one
config popover, reached from the status chips along the bottom of the composer — plus a
[model picker](/guide/providers#models) when the agent reports one. So what this turn is allowed to
do, and what it runs on, is readable right where you fire it; the header carries only per-moment
actions.

## What it shares with the category

- One GUI (and TUI) over **eight agent CLIs** — Claude Code, Codex, Grok, Cursor, OpenCode, Pi, Kimi,
  ZCode/GLM — via the
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
| Remote | Axum WebSocket + T3 Code mobile compatibility + a mobile web client |

Read more in the [Architecture](/reference/architecture) reference.

## Status

C2 is early but functional and heavily tested (offline test suite across the core, TUI, and
server). C2 does not ship its own native mobile binary; the remote listener works with T3 Code
mobile over a local LAN or Tailscale tailnet instead. Hosted relay access and a visual browser
element-picker remain out of scope. See the [FAQ](/reference/faq).
