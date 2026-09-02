---
id: "2026-09-02-browser-core-transport"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: intent.md
risk: medium
approved_by: "userthe direct 2026-09-02 implementation request"
approved_at: "2026-09-02"
---

# Spec: Reuse the desktop React renderer as a browser Web UI

## Requirements

The renderer gains a transport module whose complete product-facing interface is a generic command
call plus named event subscription. The existing Electrobun adapter remains the default in the
desktop webview. An explicit Web development mode uses the existing C2 pairing bearer, short-lived
single-use WebSocket ticket, paired remote event stream, and a new authenticated generic command
route. Product commands continue to be implemented and typed once in `bridge.ts`; the Web transport
does not add command-specific HTTP endpoints.

The desktop-host remote plugin supplies the generic command caller from its live Kernel context, so
the browser attaches to the already running Core and never opens the same SQLite database in a
second process. The first Web capability set is intentionally bounded to provider discovery,
project/session reads, transcript reads, session creation and management, prompts, execution policy,
permission/elicitation answers, and cancellation. Unpaired requests, member-scoped devices, missing
host support, and commands outside that capability set fail closed. Project-scoped dispatch retains
the existing project-realm lease and fallback semantics.

The first slice is a development Web UI reached through Vite's same-origin proxy. It does not yet
package the React assets inside the Rust server, replace the compact mobile remote page, add a hosted
relay, or claim parity for desktop-container features. Those steps require separate acceptance after
the shared transport has rendered and behaved correctly.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user accepted the browser direction and directly requested implementation on 2026-09-02.
Ponytail selected reuse of the existing React tree, CoreApp command seam, C2 bearer/ticket flow, and
remote engine event stream. Codebase-design review places one real seam between the renderer and its
two transport adapters; it does not introduce command-specific Web modules or another business
runtime.

This is medium risk because it adds an authenticated route to trusted local product commands. The
initial capability set is explicit and member devices are rejected. Human review remains required
before merge. Packaging, remote-wide capability expansion, release, and production remain closed
Gates.

## Acceptance criteria

- [x] AC-1: Desktop and Web adapters satisfy one small renderer Core transport interface (`call`
      and `listen`), while `bridge.ts` remains the single product-command projection and plain
      fixture preview behavior stays available outside explicit Web mode.
- [x] AC-2: A paired personal browser can call the bounded Web UI command set through the live
      desktop Kernel, including correct project-realm dispatch; unauthenticated, member-scoped,
      unavailable, and out-of-scope calls fail closed with actionable responses.
- [x] AC-3: Explicit Web mode can load providers, projects, active/archived Sessions, previews, and
      transcripts; create and prepare a Session; submit or cancel a prompt; answer permissions or
      elicitation; change execution policy; and receive the shared engine event stream without a
      second Core process.
- [x] AC-4: Pairing bootstrap is single-flight, bearer credentials remain outside URLs and
      WebSockets, calls remain concurrent, and reconnect uses fresh single-use WebSocket tickets.
- [x] AC-5: Focused TypeScript and Rust protocol tests, renderer type/build checks, real browser
      loading and interaction evidence, and repository documentation/SDLC Gates pass.

## Decision

The user accepted the browser direction and directly requested implementation on 2026-09-02.
Ponytail selected reuse of the existing React tree, CoreApp command seam, C2 bearer/ticket flow, and
remote engine event stream. Codebase-design review places one real seam between the renderer and its
two transport adapters; it does not introduce command-specific Web modules or another business
runtime.

This is medium risk because it adds an authenticated route to trusted local product commands. The
initial capability set is explicit and member devices are rejected. Human review remains required
before merge. Packaging, remote-wide capability expansion, release, and production remain closed
Gates.
