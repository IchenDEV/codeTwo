---
id: "2026-09-02-cli-webui-entry"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-09-02
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-02"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Open the shared Web UI from the server CLI

## Automated checks

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `./script/build/hosts.sh debug` produced `target/debug/codetwo-server` and its
  adjacent 850-file `web-ui` build. Running `CODETWO_HOST=127.0.0.1 CODETWO_PORT=4602
  ./target/debug/codetwo-server webui --data-dir <isolated> --no-open` booted one Core and served
  pairing, React assets, authenticated Core calls, and events from the same listener.
- AC-2: PASS — `cargo test -p codetwo-server --test web_ui_commands` verified that Web assets
  replace the root and `/pair` SPA routes only when supplied, while the no-assets server still
  returns the embedded compact C2 client and retains `/health` independently.
- AC-3: PASS — `cargo test -p codetwo-server --bin codetwo-server`, `bash -n
  script/build/hosts.sh`, `./target/debug/codetwo-server --help`, and a missing-assets CLI probe
  verified precedence, adjacent packaging, actionable errors, and that invalid assets fail before
  the requested data directory is created.
- AC-4: PASS — `cargo test -p codetwo-server --lib
  browser_renderer_has_one_bounded_core_capability_set`, `cargo test -p codetwo-desktop-host
  remote::tests`, and source inspection verified one shared adapter and allowlist. The live
  `--no-open` run opened no system browser; its printed URL contained only the one-time pairing
  token in the fragment, never a durable bearer.
- AC-5: PASS — `cargo test -p codetwo-server` passed 50 unit/integration tests; the desktop-host
  Remote tests, three Bun transport tests, full renderer lint and TypeScript checks, actual Vite
  Web build, changed-file rustfmt, `git diff --check`, and repository documentation/lifecycle
  worktree Gates passed. In the in-app browser, the packaged CLI page resolved to `/pair` with its
  token fragment cleared, rendered the C2 React UI, reported no console warnings/errors, and
  changed from Collapse to Expand after the sidebar interaction.

Residual risk: Web UI assets remain a generated adjacent directory rather than bytes embedded in
the Rust executable. Moving only `codetwo-server` without its sibling `web-ui` directory makes the
new mode fail closed with a repair command; the compact mode still works. The current renderer
bundle is about 47 MiB and retains its existing large-chunk warnings. The live smoke used
`--no-open` to avoid surprising the user's default browser; platform browser command construction
is a small standard-library branch, while actual automatic opening remains platform-dependent.

## Behavioral evidence

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `./script/build/hosts.sh debug` produced `target/debug/codetwo-server` and its
  adjacent 850-file `web-ui` build. Running `CODETWO_HOST=127.0.0.1 CODETWO_PORT=4602
  ./target/debug/codetwo-server webui --data-dir <isolated> --no-open` booted one Core and served
  pairing, React assets, authenticated Core calls, and events from the same listener.
- AC-2: PASS — `cargo test -p codetwo-server --test web_ui_commands` verified that Web assets
  replace the root and `/pair` SPA routes only when supplied, while the no-assets server still
  returns the embedded compact C2 client and retains `/health` independently.
- AC-3: PASS — `cargo test -p codetwo-server --bin codetwo-server`, `bash -n
  script/build/hosts.sh`, `./target/debug/codetwo-server --help`, and a missing-assets CLI probe
  verified precedence, adjacent packaging, actionable errors, and that invalid assets fail before
  the requested data directory is created.
- AC-4: PASS — `cargo test -p codetwo-server --lib
  browser_renderer_has_one_bounded_core_capability_set`, `cargo test -p codetwo-desktop-host
  remote::tests`, and source inspection verified one shared adapter and allowlist. The live
  `--no-open` run opened no system browser; its printed URL contained only the one-time pairing
  token in the fragment, never a durable bearer.
- AC-5: PASS — `cargo test -p codetwo-server` passed 50 unit/integration tests; the desktop-host
  Remote tests, three Bun transport tests, full renderer lint and TypeScript checks, actual Vite
  Web build, changed-file rustfmt, `git diff --check`, and repository documentation/lifecycle
  worktree Gates passed. In the in-app browser, the packaged CLI page resolved to `/pair` with its
  token fragment cleared, rendered the C2 React UI, reported no console warnings/errors, and
  changed from Collapse to Expand after the sidebar interaction.

Residual risk: Web UI assets remain a generated adjacent directory rather than bytes embedded in
the Rust executable. Moving only `codetwo-server` without its sibling `web-ui` directory makes the
new mode fail closed with a repair command; the compact mode still works. The current renderer
bundle is about 47 MiB and retains its existing large-chunk warnings. The live smoke used
`--no-open` to avoid surprising the user's default browser; platform browser command construction
is a small standard-library branch, while actual automatic opening remains platform-dependent.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: Web UI assets remain a generated adjacent directory rather than bytes embedded in

## Verdict

Verdict: verified..

## Review and release

Approval: implementation approved by the user on 2026-09-02; merge and release are not approved.
Review: Draft PR [#219](https://github.com/IchenDEV/codeTwo/pull/219) contains this change.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the CLI mode and static asset fallback; no data rollback is required.
No release: merge, deployment, and release are not authorized.

## Feedback

The user requested the CLI entry immediately after confirming that only a development script
existed. No post-implementation feedback exists yet.
