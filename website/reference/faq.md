# FAQ

### Do I need all five provider CLIs?

No — you need **one** on your `PATH` to run a real turn. Grok is the simplest (native ACP, no Node).
See [Providers](/guide/providers).

### Where does C2 store data?

Sessions and transcripts live in a SQLite database under `~/.codetwo/` (a platform data dir); skills
under `~/.config/codetwo/skills/`; keybindings in `~/.config/codetwo/keymap.json`.

### Is my code sent anywhere by C2 itself?

C2 drives provider CLIs locally over stdio; whatever those providers do with your code is up to
them and your model/API settings. The remote server only exposes the engine on your own network,
gated by a pairing token.

### How is this different from a chat-based agent UI?

You compose the prompt as a **document** and combine reusable **skills** inline, rather than typing
into a chat box. See [Document editor & skills](/guide/editor).

### Can I add my own provider?

Yes — any ACP-speaking command works. The provider registry is just a launch spec (`command`, `args`,
`env`); a `custom` provider id lets you point at your own.

### What's not built yet?

- A C2-branded native **mobile app** (use T3 Code mobile or the built-in mobile web client).
- A C2-hosted **relay** (today it's direct LAN or Tailscale + token).
- A **visual browser element-picker** (annotate captures the URL + your note instead).
- **Packaged installers** / notarization — you run from source for now.

### Does the desktop app open a window headlessly?

No — the desktop app needs a display. On a server, use the [TUI](/guide/tui) or
[remote control](/guide/remote).

### How do I run the tests?

```sh
cargo test -p codetwo-core -p codetwo-tui -p codetwo-server
```

They're offline: a mock ACP agent, real `git`, and a real PTY — no provider or network needed.
