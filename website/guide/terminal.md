# Terminal

codeTwo has an embedded terminal so you can run commands next to the agent. Toggle it from the
toolbar or `Mod+J`.

It's a real PTY: codeTwo spawns your login shell (`$SHELL`) through a pseudo-terminal and streams its
output to an xterm.js view. Keystrokes go back to the shell, and the terminal resizes with the panel.

The terminal opens in the session's working directory, so it's already where the agent is working —
handy for running tests, checking `git status`, or inspecting what a turn changed.

::: tip
Under the hood the PTY is managed by the Rust core (via `portable-pty`), and output is streamed to
the frontend over a Tauri channel — the same PTY machinery is available to the remote server too.
:::
