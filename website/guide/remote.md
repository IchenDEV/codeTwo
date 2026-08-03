# Remote control

Drive codeTwo from your phone, tablet, or another machine. A small headless server exposes the
engine over WebSocket behind a t3code-style pairing flow and serves a mobile-friendly web client.

## How pairing works

The remote device never needs a long-lived secret up front:

1. codeTwo mints a **one-time pairing token** (15-minute lifetime) and shows it as a URL + QR code.
   The token rides in the URL *fragment* (`/#token=…`), so it never appears in server logs.
2. The device opens the link once and exchanges the token for a **per-device bearer**, stored in the
   browser. The pairing link is now dead.
3. On every connect, the bearer buys a **five-minute single-use WebSocket ticket** — the only
   credential that ever appears in a socket URL.

Paired devices survive restarts (stored as hashes in `remote-devices.json`) and can be revoked at
any time. Treat pairing links like passwords while they're live.

## Two ways to start it

**From the desktop app** — open the command palette (`Mod+K`) → **Remote control** → **Turn on
network access**. This serves the app's live engine *in-process*, so the remote and your desktop
drive the **same running sessions**. The modal shows:

- the reachable endpoints (LAN and loopback),
- a one-time pairing link with a QR code (**Create pairing link** / **New link**),
- the paired devices, each with a **Revoke** button.

Turning network access off stops the server; paired devices reconnect next time you turn it on.

**Standalone server** — run it on the machine with your code:

```sh
cargo run -p codetwo-server
```

It prints a pairing panel: a one-time **URL** (with its auto-detected LAN IP), the **token**, and a
scannable **QR code**. Open the URL on another device on the same network, or scan the QR.

```
  codeTwo remote is live.

  Open on another device (link is one-time, expires in 15 minutes):
    http://192.168.1.42:4599/#token=…

  Pairing token: …

  █▀▀▀▀▀█ …  (QR)
```

Configure it with env vars:

| Var | Default | Meaning |
| --- | --- | --- |
| `CODETWO_HOST` | `0.0.0.0` | bind address |
| `CODETWO_PORT` | `4599` | port |
| `CODETWO_PAIR_TTL` | `900` | pairing-token lifetime (seconds) |

## The mobile client

The page served at `/` is a lightweight web client: it pairs itself from the link, reconnects on
its own afterwards (no re-pairing), lists sessions, replays the transcript of the session you pick,
lets you choose a provider and type a prompt, streams the agent's output, and shows permission
prompts with Allow/Reject buttons. No app install on the phone.

If the connection lags badly (slow cellular link), the client is told how many events it missed and
resyncs the transcript instead of silently dropping the socket.

## What's shared

The standalone server opens the same `~/.codetwo/codetwo.db`, so it sees the same session list and
history as the desktop. The in-process (desktop-started) server additionally shares the **live**
event stream, so a turn you start remotely streams to both.

## Managing access

- **Desktop**: the Remote control modal lists paired devices with pair date and last-seen time;
  **Revoke** cuts a device off immediately (including any unredeemed tickets).
- **Standalone**: delete an entry from `~/.codetwo/remote-devices.json` (or the whole file) and
  restart the server.
- A fresh pairing link never invalidates existing devices; revoke explicitly.

## Security

::: warning
The server binds `0.0.0.0`, so it's reachable by anything on your LAN. Access requires pairing, and
credentials are one-time (pairing token), header-only (bearer), or single-use (ws ticket) — but the
transport is plain HTTP. That's fine on a trusted home/office network. For untrusted networks,
front it with a TLS tunnel (e.g. an SSH tunnel or a mesh VPN) and restrict the bind address.
Hosted/tunneled access isn't built in yet.
:::
