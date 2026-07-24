# Terminal

codeTwo has an embedded terminal so you can run commands next to the agent. It lives in the **side
dock** — open it with `Mod+J`, or the panel button in the header and pick the **Terminal** tab. The
dock sits beside the document rather than under it, so opening a terminal doesn't shrink the prompt
you're writing.

It's a real PTY: codeTwo spawns your login shell (`$SHELL`) through a pseudo-terminal and streams its
output to an xterm.js view. Keystrokes go back to the shell, and the terminal resizes with the panel.

The terminal opens in the session's working directory, so it's already where the agent is working —
handy for running tests, checking `git status`, or inspecting what a turn changed.

## Multiple terminals

Use the **＋** tab to open more terminals and click the tabs to switch. All of them stay mounted, so
switching away doesn't kill a running shell.

## tmux — persistent, attachable terminals

Tick **tmux** in the terminal header and codeTwo runs each terminal inside a named tmux session
(`codetwo-<session>-<n>`) using attach-or-create. That buys you two things:

- The shell **survives app restarts** — reopen the terminal and you're back where you were.
- You can **attach from a real terminal**:

  ```sh
  tmux attach -t codetwo-<session>-1
  ```

If tmux isn't installed the toggle simply falls back to a plain login shell.

::: tip
Under the hood the PTY is managed by the Rust core (via `portable-pty`), and output is streamed to
the frontend over a Tauri channel — the same PTY machinery is available to the remote server too.
:::
