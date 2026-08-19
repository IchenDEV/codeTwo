# The C2 Plugin Protocol

Version **1.0.0**.

A plugin is a process. C2 speaks JSON-RPC 2.0 to it over stdio, and what the plugin declares —
commands, event subscriptions — is registered in the same kernel registries a built-in Rust plugin
uses. Its commands appear in `kernel.commands`, are callable from any frontend through
`call("name", args)`, and disappear the instant it unloads.

Write one in any language that can read stdin and write stdout.

## Why a protocol at all

[`docs/plugins.md`](plugins.md) made C2 a plugin graph, but a Rust host can only load Rust
plugins it was compiled with. That ceiling means "plugin" describes how *we* organise our code, not
something a user can add. This removes it, using the transport the app already speaks twice over
(ACP to provider CLIs, MCP to tool servers) rather than inventing a third.

## Transport

- **Framing** — one JSON object per line, UTF-8, `\n`-terminated. No `Content-Length` header.
- **stdout** is the protocol channel. Anything on it that is not JSON is dropped with a warning, so
  a stray `print()` degrades to noise rather than a crash.
- **stderr** is your log channel. C2 routes it into its own tracing output.
- The process is killed when the plugin unloads, and it never outlives the app.

## Handshake

The host sends `initialize` first, and waits **10 seconds**. Answer it promptly: loading runs on the
kernel's single driver task, so a plugin that starts and then says nothing would stall the whole
graph. A plugin that misses the window is marked failed, by name, and everything else keeps running.

**Host → plugin**

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
  "protocolVersion": "1.0.0",
  "host": { "name": "code2", "version": "0.0.0", "commands": ["git.status", "memory.list", "…"] },
  "config": { "…": "your entry from the plugin config, verbatim" },
  "dataDir": "/home/me/.codetwo/plugins/.data/my-plugin"
}}
```

**Plugin → host**

```json
{"jsonrpc":"2.0","id":1,"result":{
  "name": "my-plugin",
  "version": "0.1.0",
  "protocolVersion": "1.0.0",
  "commands": [
    { "name": "my.greet", "description": "Say hello.", "schema": { "type": "object" } }
  ],
  "events": ["engine/event"]
}}
```

Compatibility is by **major version**. Declaring `2.x` to a `1.x` host is refused with a readable
error; omitting `protocolVersion` is tolerated.

`dataDir` is yours to write to and is created before you start. `host.commands` is the host's
surface at that moment — useful for feature-detecting rather than assuming.

## Methods

### Host → plugin

| method | kind | params | result |
|---|---|---|---|
| `initialize` | request | see above | see above |
| `command/invoke` | request | `{ name, args }` | whatever your command returns |
| `event/emit` | notification | `{ name, payload }` | — |

`command/invoke` only ever names a command you declared. Returning a JSON-RPC error turns into a
readable failure at the caller — the frontend sees `my.greet: <your message>`.

### Plugin → host

| method | kind | params | result |
|---|---|---|---|
| `command/call` | request | `{ name, args }` | the host command's result |
| `event/emit` | notification | `{ name, payload }` | — |
| `log` | notification | `{ level, message }` | — |

`command/call` reaches *any* command in the running graph, by name, through the same registry a
Rust plugin uses. There is no privileged back door and no separate API: if `git.status` is loaded,
you can call it; if the `git` plugin is turned off, you cannot, and you get the same "no command
named…" error everyone else does.

`level` is one of `error`, `warn`, `info`, `debug`, `trace`.

## Events

You receive only the events you name in `events`. The host publishes:

| name | payload |
|---|---|
| `engine/event` | one agent-loop `Event` (agent text, tool call, permission request, turn ended, …) |
| `skills/changed` | `null` — the skill library was rebuilt |
| `scenes/changed` | `null` — the scene library was re-resolved |

This list is the contract. Typed Rust events do not cross a pipe, so each entry is a deliberate
decision to expose one — see `publish_host_events` in
`crates/core/src/app/plugins/extensions.rs`.

Your own `event/emit` goes onto the host's JSON bus, where other plugins (in or out of process) can
subscribe to it.

## Declaring a plugin

Add a `runtime` block to your bundle's `plugin.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "runtime": {
    "protocol": "1.0.0",
    "command": "node",
    "args": ["dist/plugin.js"],
    "env": { "MY_PLUGIN_MODE": "release" },
    "inject": ["store"],
    "optionalInject": ["engine"]
  }
}
```

The process starts with the bundle directory as its working directory.

`inject` gets you the same reactive contract a Rust plugin has: your process is not started until
those services exist, and is **restarted** if one is replaced. It is declared in the manifest rather
than at `initialize` because the host needs to know before deciding whether to start you at all.

A bundle whose only component is a `runtime` block is a valid bundle.

## Trust

**Installing a bundle executes nothing.** That property of the Plugin Hub is not weakened by this
protocol — it is the reason the protocol is shaped this way.

A process starts only when its bundle is **enabled *and* trusted**. Trust is a separate, deliberate
user action, and installing a bundle that ships a `runtime` block raises a diagnostic saying so.
Until then the plugin is listed by `extensions.list` under `untrusted` and does not run.

For development, `extensions` takes `{ "allow_untrusted": true }`. Do not ship that.

## Lifecycle

```
enabled + trusted ──▶ spawn ──▶ initialize ──▶ register commands & subscriptions ──▶ active
                                    │
                                    ├─ timeout / bad version / crash ──▶ failed (process killed)
                                    │
     unload, dependency lost, ──────┴──▶ process killed, registrations removed
     bundle disabled or removed
```

Unloading is exact: the process is killed and every command it contributed is gone. Nothing has to
remember to clean up, because the plugin's scope owns all of it.

Installing, removing, enabling, or trusting a bundle makes the `extensions` plugin rebuild itself,
which restarts exactly the set that should be running.

A complete, runnable example lives in [`packs/hello-runtime/`](../packs/hello-runtime): it
contributes a command, calls `git.status` back through the host from inside it, feature-detects the
host's surface, and listens for a host event — in one file with no dependencies.

## A minimal plugin

```js
#!/usr/bin/env node
const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");

rl.on("line", async (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: {
      name: "hello", version: "1.0.0", protocolVersion: "1.0.0",
      commands: [{ name: "hello.status", description: "Repo status, via the host." }],
      events: ["skills/changed"],
    }});
  } else if (msg.method === "command/invoke") {
    // Call a host command and answer with what it said.
    send({ jsonrpc: "2.0", id: 1000, method: "command/call",
           params: { name: "git.status", args: { cwd: msg.params.args.cwd } } });
    // (a real plugin would correlate the response by id)
  } else if (msg.method === "event/emit") {
    console.error(`host event: ${msg.params.name}`);   // stderr is the log channel
  }
});
```

## Limits, stated plainly

- **No sandbox.** A trusted plugin is a process with your user's permissions. Trust is the whole
  boundary; treat it as such.
- **No timeout on `command/invoke`.** A plugin that never answers a command hangs that caller — not
  the graph. The handshake is the only bounded wait.
- **One process per bundle.** Fan-out inside your plugin if you need more.
- **Rust plugins are still compile-time.** This protocol is how a plugin gets added without
  rebuilding C2; it is not dynamic loading of native code, and deliberately so.
