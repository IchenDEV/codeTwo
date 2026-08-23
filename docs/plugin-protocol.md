# The C2 Plugin Protocol

Version **1.0.0**.

This document defines the process wire format. Bundle terminology, manifest namespacing, trust,
policy, contribution support, and host capability rules are normative in the
[C2 Plugin Standard 1.0.0](plugin-standard.md).

A plugin is a process. C2 speaks JSON-RPC 2.0 to it over stdio, and what the plugin declares —
commands, event subscriptions — is registered in the same kernel registries a built-in Rust plugin
uses. Installed runtimes have stable managed names of the form `bundle:<id>`. Their commands appear
in `kernel.commands`, are callable from a frontend in the matching command realm, and disappear the
instant the runtime unloads.

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
  "dataDir": "/home/me/.codetwo/plugins/.data/my-plugin/projects/09a7…",
  "projectPath": "/home/me/work/my-project"
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

Wire compatibility is by **major version**. Declaring `2.x` to a `1.x` host, or omitting
`protocolVersion`, is refused with a readable error.

`dataDir` is yours to write to and is created before you start. A user-scoped instance gets
`<plugins-dir>/.data/<id>`. A project-scoped instance gets
`<plugins-dir>/.data/<id>/projects/<blake3(normalized-project-path)>`, so two projects do not share
runtime files. `projectPath` is the normalized project identity for that instance and is omitted
for the user-scoped instance.

`host.commands` is the callable surface visible from this realm at initialization time. A
user-scoped instance sees global commands only. A project instance sees global commands plus
commands registered for the same normalized project; it never receives another project's command
list. `command/call` uses that same realm and its normal project fallback/blocking rules.

## Methods

### Host → plugin

| method | kind | params | result |
|---|---|---|---|
| `initialize` | request | see above | see above |
| `command/invoke` | request | `{ name, args }` | whatever your command returns |
| `event/emit` | notification | `{ name, payload }` | — |

`command/invoke` only ever names a command you declared. Returning a JSON-RPC error turns into a
readable failure at the caller — the frontend sees `my.greet: <your message>`.

When a user activates a manifest `ui` contribution, C2 first verifies bundle ownership, trust,
enablement, the selected user/project realm, and that the contribution's command was registered by
this process. The resulting `command/invoke` uses these args:

```json
{
  "context": { "cwd": "/repo", "projectPath": "/repo", "sessionId": "session-id" },
  "input": { "mode": "working-tree" }
}
```

`context` is host state for this activation; `input` is the descriptor's static JSON value. Neither
is a capability grant. Host commands remain accessible only through the ordinary realm-aware
`command/call` seam.

### Plugin → host

| method | kind | params | result |
|---|---|---|---|
| `command/call` | request | `{ name, args }` | the host command's result |
| `event/emit` | notification | `{ name, payload }` | — |
| `log` | notification | `{ level, message }` | — |

`command/call` reaches a command visible in the process's realm, by name, through the same registry
a Rust plugin uses. There is no privileged back door and no separate API: if `git.status` is
visible there, you can call it; if the `git` plugin is turned off or project fallback is blocked,
you cannot, and you get the same error everyone else does.

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
subscribe to it. The JSON bus is currently host-wide, not project-confidential: project process
isolation does not filter events by realm. Do not put project secrets on an event merely because
the sender or subscriber is a project-scoped runtime.

## Declaring a plugin

Every C2 bundle uses the Agent Plugins 1.0.0 root schema and the mandatory C2 extension. Add the
runtime under C2's client-extension namespace; a top-level `runtime` field invalidates the bundle:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "version": "1.0.0",
  "extensions": {
    "dev.codetwo": {
      "standardVersion": "1.0.0",
      "runtime": {
        "protocol": "1.0.0",
        "command": "node",
        "args": ["dist/plugin.js"],
        "env": { "MY_PLUGIN_MODE": "release" },
        "inject": ["store"],
        "optionalInject": ["engine"],
        "scopeSupport": ["user", "project"]
      }
    }
  }
}
```

The process starts with the bundle directory as its working directory.

`inject` gets you the same reactive contract a Rust plugin has: your process is not started until
those services exist, and is **restarted** if one is replaced. It is declared in the manifest rather
than at `initialize` because the host needs to know before deciding whether to start you at all.

`scopeSupport` is an explicit capability declaration. If it is omitted, the runtime supports only
`["user"]`. Include `"project"` only when the process is prepared for
one independently managed process, command realm, `dataDir`, and `projectPath` per active project.
The bundle's skills and other data-only extension components are not made project-scoped by this
field; they remain user-only and are managed through Bundle Tools.

A bundle whose only component is `extensions.dev.codetwo.runtime` is a valid bundle. UI action
descriptors are declared beside it under `extensions.dev.codetwo.ui`; they do not alter this wire
protocol or load third-party renderer code.

`extensions.dev.codetwo.languageServers` is a separate host-owned stdio LSP contribution. Language
servers use standard `Content-Length` LSP framing, not this newline-delimited plugin protocol. They
may exist without a C2 process runtime and still share bundle trust, enablement, and teardown.

## Trust

**Installing a bundle executes nothing.** That property of the Plugin Hub is not weakened by this
protocol — it is the reason the protocol is shaped this way.

A process starts only when its bundle is **enabled *and* trusted**. Trust is a separate, deliberate
user action, and installing a bundle that ships a C2 runtime raises a diagnostic saying so.
Until then the plugin is listed by `extensions.list` under `untrusted` and does not run.

Trust is a hard gate in every realm. No configuration setting can bypass it.

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

Installed runtimes are ordinary dynamically registered factories named `bundle:<id>`. Installing,
removing, enabling, trusting, or replacing a bundle reconciles that factory set and every live
eligible realm immediately. Add and remove do not require an application restart; replacing a
manifest or installed record rebuilds the same-named runtime because its factory revision changed.
User and project state changes go through `plugins.catalog`, `plugins.plan_change`, and
`plugins.apply_change`, including stale-plan protection and immediate unload.

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
  OS security boundary; project command/data/process isolation does not restrict filesystem,
  network, environment, or the host-wide JSON event bus. Treat it as such.
- **No timeout on `command/invoke`.** A plugin that never answers a command hangs that caller — not
  the graph. The handshake is the only bounded wait.
- **One process per active managed realm.** A project-capable runtime may have one global process
  and separate processes for multiple live projects. Fan out inside one realm if you need more.
- **Rust plugins are still compile-time.** This protocol is how a plugin gets added without
  rebuilding C2; it is not dynamic loading of native code, and deliberately so.
