# `codetwo-server`

The headless remote-control server. Runs the engine and exposes it over WebSocket behind a
t3code-style pairing flow; serves a mobile web client. See the [Remote control](/guide/remote)
guide for the walkthrough.

## Run

```sh
cargo run -p codetwo-server
```

## Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `CODETWO_HOST` | `0.0.0.0` | bind address |
| `CODETWO_PORT` | `4599` | port |
| `CODETWO_PAIR_TTL` | `900` | pairing-token lifetime (seconds) |

On start it prints the pairing URL (with the LAN IP), the one-time token, and a QR code.

## Auth model

Three credential tiers, so no long-lived secret ever travels in a URL:

1. **Pairing token** — one-time, short-TTL, carried in the pairing URL *fragment*
   (`/#token=…`, never sent in a request line). Exchanged exactly once at `POST /api/pair`.
2. **Device bearer** — long-lived and per-device, returned by pairing. Sent only in the
   `Authorization: Bearer …` header. Stored hashed (SHA-256) in `remote-devices.json`, so pairing
   survives restarts; revocable per device.
3. **WebSocket ticket** — five-minute, single-use, minted at `POST /api/ws-ticket`. The only
   credential that ever appears in a query string, and it dies on first use. Revoking a device
   also voids its unredeemed tickets.

## HTTP endpoints

| Route | Purpose |
| --- | --- |
| `GET /` | the mobile web client (pairs via `#token=…` in the fragment, then stores its bearer) |
| `GET /health` | returns `ok` |
| `POST /api/pair` | body `{"token":"…","device_name":"…"}` → `{"device_id":"…","bearer":"…"}`; 401 if invalid/expired/used |
| `POST /api/ws-ticket` | `Authorization: Bearer …` → `{"ticket":"…","expires_in":300}` |
| `GET /ws?ticket=…` | the WebSocket control channel (single-use ticket) |

## WebSocket protocol

After the client connects with a valid ticket:

- **server → client**, once: `{"kind":"sessions","sessions":[…]}`
- **server → client**, per event: `{"kind":"event","event":{…}}`
- **server → client**, on request: `{"kind":"transcript","session":"…","parts":[{"role":"…","part":{…}}]}`
- **server → client**, if the client fell behind: `{"kind":"lagged","missed":N}` — re-request the
  transcript to resync; the connection stays up.
- **client → server**: a raw [`Op`](/reference/protocol) object, e.g.
  `{"op":"prompt","session":"…","doc":[{"type":"text","text":"…"}]}`, or a request:
  `{"req":"transcript","session":"…"}` / `{"req":"sessions"}`

A missing, wrong, expired, or already-used ticket is rejected at the handshake.

## Storage

Opens the same `~/.codetwo/codetwo.db` as the desktop app, so it shares the session list and history.
Paired devices persist in `~/.codetwo/remote-devices.json` (bearer hashes only — raw credentials are
shown once and never stored). When started from the desktop (Command palette → Remote control), the
server shares the app's **live** engine and event stream, and devices persist in the app's data
directory instead.
