---
id: change-2026-09-02-browser-core-transport
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: user via the direct 2026-09-02 implementation request
approved_at: 2026-09-02
created: 2026-09-02
updated: 2026-09-02
source: direct user request to begin a browser Web UI mode while reusing existing modules and preventing future product-surface divergence
inputs: existing React renderer, Electrobun Core command transport, paired Axum remote server, and shared CoreApp command graph
outputs: first shared browser-to-Core transport slice for the existing React renderer
scope: Cargo.lock, apps/desktop/package.json, apps/desktop/src/bridge.ts, apps/desktop/src/coreTransport.ts, apps/desktop/tests/coreTransport.test.ts, apps/desktop/tests/pluginBridgeContract.test.ts, apps/desktop/vite.config.ts, apps/desktop/src-host/src/remote.rs, crates/plugins/src/app/mod.rs, crates/plugins/src/app/plugin_manager.rs, crates/server/Cargo.toml, crates/server/src/lib.rs, crates/server/tests/web_ui_commands.rs, docs/sdlc/changes/2026-09-02-browser-core-transport
next_trigger: human review and an explicit merge or release decision
verification_mode: owner
verified_by: codex
verified_at: 2026-09-02
---

# Reuse the desktop React renderer as a browser Web UI

## Intent

C2 already has one Rust Core shared by Desktop, TUI, and the paired remote server, but the complete
React renderer can reach product commands only through Electrobun. Plain-browser rendering therefore
falls back to fixtures and no-op event subscriptions, while the separate remote HTML client repeats
chat interaction logic. The user directly requested implementation of a browser mode that reuses the
existing modules and does not create another product surface that can drift during later iteration.

The desired first outcome is one shared React product tree with a small Core transport interface.
Electrobun and paired Web access are adapters at that seam; native window, dialog, updater, Appshot,
pet, and embedded-WebView capabilities remain owned by the desktop container. This request approves
implementation, but not a pull request, merge, release, deployment, or production mutation.

## Spec

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

### Acceptance criteria

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

## Decision and gates

The user accepted the browser direction and directly requested implementation on 2026-09-02.
Ponytail selected reuse of the existing React tree, CoreApp command seam, C2 bearer/ticket flow, and
remote engine event stream. Codebase-design review places one real seam between the renderer and its
two transport adapters; it does not introduce command-specific Web modules or another business
runtime.

This is medium risk because it adds an authenticated route to trusted local product commands. The
initial capability set is explicit and member devices are rejected. Human review remains required
before merge. Packaging, remote-wide capability expansion, release, and production remain closed
Gates.

## Plan

1. Add and test the renderer Core transport interface with Electrobun and paired-Web adapters.
2. Route only the first browser Session vertical slice through Core availability while preserving
   native desktop checks and unrelated browser fixtures.
3. Add an authenticated generic Web UI command route and a desktop-host caller that reuses Kernel
   global/project dispatch with an explicit capability set.
4. Add a Web Vite mode and same-origin proxy without changing the normal desktop build.
5. Run focused protocol/renderer checks, exercise the paired browser flow against one live Core,
   then run the repository lifecycle Gates.

Rollback removes the Web adapter, command route, and Vite Web mode and restores the selected bridge
guards to Electrobun-only checks. No persisted schema or user data is migrated.

## Build

`coreTransport.ts` now owns the renderer's two-operation Core seam and selects either the existing
Electrobun transport or the paired-Web adapter. `bridge.ts` remains the only typed product-command
projection; only the Session vertical slice tests Core availability rather than desktop-container
availability. `dev:web` reuses the normal Vite renderer and proxies authenticated HTTP and
WebSocket traffic to the existing paired Core listener.

The server adds one generic authenticated call route. Its desktop-host adapter applies an explicit
allowlist and delegates both root and project-scoped calls to `PluginManager`; `CoreApp` delegates
to that same seam. This centralizes lazy project graph creation, activity leasing, flushing, realm
selection, and global fallback instead of copying them into a Web implementation.

The first browser restart probe exposed one real failure: after a WebSocket closed, a transient
ticket-request failure stopped the old adapter's retry loop. The correction reschedules while a
reusable bearer or pairing token exists. Both the focused regression test and an outage longer than
multiple retry intervals then recovered without reloading the page.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bun test tests/coreTransport.test.ts`, `bunx tsc --noEmit`, and source inspection
  verified one `CoreTransport` interface, existing Electrobun delegation, explicit Web-mode
  selection, and unchanged fixture fallback outside Web mode.
- AC-2: PASS — `cargo test -p codetwo-server --test web_ui_commands`,
  `cargo test -p codetwo-desktop-host remote::tests`, and
  `cargo test -p codetwo-plugins --test project_plugin_graph` verified paired-personal auth,
  member rejection, missing-adapter rejection, preserved project call context, explicit host
  capability policy, and the shared lazy project-realm dispatch path.
- AC-3: PASS — a real `vite --mode web` renderer paired with one release desktop host on an
  isolated data directory loaded the existing React tree, providers, project and persisted
  Sessions, opened a transcript, created a durable Session from Core, received its live
  `session_created` event, and renamed it through the browser UI. Source/allowlist inspection
  verified the remaining prompt, prepare, cancel, permission, elicitation, policy, model, sandbox,
  archive, and pin calls use the same generic route rather than separate Web handlers.
- AC-4: PASS — `bun test tests/coreTransport.test.ts` verified explicit-token precedence over a
  stale bearer, single-flight pairing, concurrent command calls, bearer-free socket URLs, a fresh
  single-use ticket per connection, and retry after an intermediate ticket request failed. In the
  live browser, stopping Core for 6.5 seconds caused repeated ticket failures; after restart the
  same unreloaded tab received a newly created Session event.
- AC-5: PASS — `bun test` passed the full desktop suite with 864 tests and 5,122 expectations; the focused Core
  transport and bridge contract suite passed 6 tests with 53 expectations; task-board mutation
  testing scored 100%; and `bun run build:renderer` passed lint, TypeScript, and the 6,604-module
  Vite production build. Focused Rust tests, changed-file `rustfmt --check`, `git diff --check`, and
  the repository documentation/lifecycle/worktree Gates also passed.

Draft PR #219 `Desktop design system / validate` failed after 700 passing tests because the reconnect
test expected the second fake socket exactly 5ms after closing the first. The same test passed in
focused runs, identifying test scheduling under full-suite load rather than a product reconnect
failure.

The next full local desktop run passed that reconnect point and exposed the adjacent source
contract after 863 passing tests: it still required `bridge.ts` to call `desktopCall` directly.
The contract now verifies the intended single chain through `coreTransport.ts`, including its
desktop delegation, without weakening the one-boundary assertion.

Residual risk: this is intentionally a development Web mode. React assets are not yet embedded in
the Rust server, the compact phone remote remains separate, and desktop-container-only features
such as native windows, dialogs, updater, Appshots, pets, and embedded WebViews remain unavailable
in a browser. The live smoke test did not submit a prompt to an external provider; prompt transport
was checked at the shared command projection, allowlist, and authenticated generic route. The test
host used an isolated data directory and port because same-bundle desktop multi-instance identity
is a separate unresolved development limitation.

## Review and release

Approval: implementation approved by the user on 2026-09-02; merge and release are not approved.
Review: Draft PR [#219](https://github.com/IchenDEV/codeTwo/pull/219) contains this change.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the scoped Web transport and route; no data rollback is required.
No release: merge, deployment, and release are not authorized.

## Feedback

No post-implementation feedback exists yet.
