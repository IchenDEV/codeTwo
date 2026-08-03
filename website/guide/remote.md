# Remote control

Drive Code2 from your phone, tablet, or another machine. A small headless server exposes the engine
over WebSocket behind a pairing token and serves a mobile-friendly web client.

## Two ways to start it

**Standalone server** — run it on the machine with your code:

```sh
cargo run -p codetwo-server
```

It prints a pairing panel: a connection **URL** (with its auto-detected LAN IP), a **token**, and a
scannable **QR code**. Open the URL on another device on the same network, or scan the QR.

```
  Code2 remote is live.

  Open on another device:
    http://192.168.1.42:4599/?token=…

  Pairing token: …

  █▀▀▀▀▀█ …  (QR)
```

Configure it with env vars:

| Var | Default | Meaning |
| --- | --- | --- |
| `CODETWO_HOST` | `0.0.0.0` | bind address |
| `CODETWO_PORT` | `4599` | port |
| `CODETWO_TOKEN` | random | pairing token |

**From the desktop app** — open the command palette (`Mod+K`) → **Remote control** → **Start remote
server**. This starts the server *in-process, sharing the app's live engine*, so the remote and your
desktop drive the **same running sessions**. The modal shows the URL and token.

## The mobile client

The page served at `/` is a lightweight web client: it connects over WebSocket, lists sessions, lets
you pick a provider and type a prompt, streams the agent's output, and shows permission prompts with
Allow/Reject buttons. No app install on the phone.

## What's shared

The standalone server opens the same `~/.codetwo/codetwo.db`, so it sees the same session list and
history as the desktop. The in-process (desktop-started) server additionally shares the **live**
event stream, so a turn you start remotely streams to both.

## Security

::: warning
The server binds `0.0.0.0`, so it's reachable by anything on your LAN — the **pairing token is the
only gate**. That's fine on a trusted home/office network. For untrusted networks, front it with a
TLS tunnel (e.g. an SSH tunnel or a mesh VPN) and restrict the bind address. Hosted/tunneled access
isn't built in yet.
:::
