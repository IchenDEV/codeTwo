---
layout: home
hero:
  name: Code2
  text: A document-first coding agent
  tagline: Compose prompts as documents, weave in skills, and drive Claude Code, Codex, Grok, Cursor, OpenCode, Pi, Kimi, and GLM over one protocol — desktop app, TUI, and remote.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Why Code2?
      link: /guide/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/IchenDEV/codeTwo
features:
  - icon: 📝
    title: Document-first prompts
    details: Compose in a Notion-style block editor, not a chat box. Insert and combine reusable skills inline with a “/” picker, then submit the whole document as one turn.
    link: /guide/editor
  - icon: 🔌
    title: Eight agent CLIs, one interface
    details: Claude Code, OpenAI Codex, Grok, Cursor, OpenCode, Pi, Kimi, and ZCode/GLM — all driven over the Agent Client Protocol (ACP). Add your own.
    link: /guide/providers
  - icon: 🛒
    title: Complete plugins from GitHub
    details: Browse a curated catalog and install skills in one click — personas, macros, and MCP tools (browser, filesystem). Author your own.
    link: /guide/market
  - icon: ⏱️
    title: Checkpoints, diffs & revert
    details: Every turn is auto-checkpointed to a hidden git ref. Review the diff, revert to any point, and commit/push from the UI.
    link: /guide/git
  - icon: 🌐
    title: Built-in browser
    details: An embedded browser panel with quick annotate — send the page and your note to the agent as prompt context.
    link: /guide/browser
  - icon: 📱
    title: Remote control
    details: Run a headless server and drive Code2 from your phone or another machine. Pairing token + QR; the remote shares your live sessions.
    link: /guide/remote
  - icon: ⌨️
    title: Command palette & keybindings
    details: A Mod+K palette over every action and session, with fully customizable, persisted keybindings.
    link: /guide/keybindings
  - icon: 🖥️
    title: Desktop and TUI
    details: One Rust core drives both a Tauri desktop app (React + BlockNote) and a ratatui terminal UI. Same sessions, same store.
    link: /guide/tui
---

## One core, many surfaces

Code2 is a single Rust core that speaks the **Agent Client Protocol** to real coding CLIs, exposed
through a desktop app, a terminal UI, and a remote WebSocket server. You compose prompts as
structured documents, drop in skills, and keep the agent honest with permission modes, git
checkpoints, and per-turn diffs.

```
                       core  (Rust — ACP client, engine, sessions, skills, git, pty)
   ┌──────────────────────────────────────────────────────────────────────┐
   │  ACP over stdio → Claude Code · Codex · Grok · Cursor · OpenCode · Pi · Kimi · GLM │
   └───────────▲───────────────────▲──────────────────────▲────────────────┘
        Tauri desktop           ratatui TUI          codetwo-server (remote)
```

Ready to try it? Head to [Install & run](/guide/getting-started).
