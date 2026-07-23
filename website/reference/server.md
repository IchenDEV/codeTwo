# `codetwo-server`

The headless remote-control server. Runs the engine and exposes it over WebSocket with a pairing
token; serves a mobile web client. See the [Remote control](/guide/remote) guide for the walkthrough.

## Run

```sh
cargo run -p codetwo-server
```

## Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `CODETWO_HOST` | `0.0.0.0` | bind address |
| `CODETWO_PORT` | `4599` | port |
| `CODETWO_TOKEN` | random | pairing token |

On start it prints the pairing URL (with the LAN IP), the token, and a QR code.

## HTTP endpoints

| Route | Purpose |
| --- | --- |
| `GET /` | the mobile web client (reads `?token=` from the URL) |
| `GET /health` | returns `ok` |
| `GET /ws?token=…` | the WebSocket control channel (token-gated) |

## WebSocket protocol

After the client connects with a valid token:

- **server → client**, once: `{"kind":"sessions","sessions":[…]}`
- **server → client**, per event: `{"kind":"event","event":{…}}`
- **client → server**: a raw [`Op`](/reference/protocol) object, e.g.
  `{"op":"prompt","session":"…","doc":[{"type":"text","text":"…"}]}`

A wrong token is rejected at the handshake.

## Storage

Opens the same `~/.codetwo/codetwo.db` as the desktop app, so it shares the session list and history.
When started from the desktop (Command palette → Remote control), it additionally shares the app's
**live** engine and event stream.
