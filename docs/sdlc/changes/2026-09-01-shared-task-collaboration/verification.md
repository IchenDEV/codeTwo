---
id: "2026-09-01-shared-task-collaboration"
stage: verification
schema: 3
status: pending
owner: codex
created: 2026-09-01
based_on: plan.md
commit: ""
verification_mode: independent
verified_by: ""
verified_at: ""
release_target: none
release_identity: "not applicable until released."
---

# Verification: Add the first shared Task collaboration loop

## Automated checks

Verdict: implementation-owner evidence passes; independent high-risk verification remains pending.

### Acceptance evidence

- AC-1: PASS — the Server integration creates Alice and Bob, pairs server-bound identities, rejects
  unbound credentials, revokes Bob, and observes both HTTP denial and live socket closure.
- AC-2: PASS — Alice and Bob receive byte-equivalent Task snapshots; Bob's comment and Suggestion
  are attributed, and Alice alone receives the derived pending-Suggestion Attention item.
- AC-3: PASS — Store race coverage proves one durable approval claim and one replay receipt;
  integration coverage rejects Bob and replays Alice's command without another lease or prompt.
- AC-4: PASS — the offline real-Engine harness creates one Work Item, Executor, worktree, Session,
  and lease, writes one provider prompt, and does not depend on Bob's connection.
- AC-5: PASS — full Core and Server suites pass; legacy, T3, and C2 tests remain green. Unbound
  legacy clients cannot see or operate team Sessions, and team credentials cannot enter terminal or
  Canvas surfaces.
- AC-6: PASS — changed-file formatting and diff checks pass; documentation, SDLC contract, SDLC
  worktree, and Gate regression checks all pass.

Owner-run evidence:

- `cargo test -p codetwo-core -p codetwo-server` — PASS.
- `cargo test -p codetwo-desktop-host` — PASS, 20 tests.
- `cargo check --workspace` — PASS, including the TUI event consumer.
- `bun run build:renderer` from `apps/desktop` — PASS, including ESLint, Stylelint, TypeScript, and
  production Vite build.
- changed-Rust-file `rustfmt --check` plus `git diff --check` — PASS.
- `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree` — PASS.
- `bun test script/verify/checks.test.ts` — PASS, 5 tests.

Residual risk: the production TaskBoard/sidebar is still local and has no team interaction UI; this
slice is reachable through the Server contract and Desktop Host commands. Approval claim, Session
attachment, and provider submission span durable steps; setup failures become `execution_failed`
and are not automatically retried. Server deployment hardening, member deactivation management,
backups, TLS/Tailscale operation, and independent adversarial verification remain outside this
change.

## Behavioral evidence

Verdict: implementation-owner evidence passes; independent high-risk verification remains pending.

### Acceptance evidence

- AC-1: PASS — the Server integration creates Alice and Bob, pairs server-bound identities, rejects
  unbound credentials, revokes Bob, and observes both HTTP denial and live socket closure.
- AC-2: PASS — Alice and Bob receive byte-equivalent Task snapshots; Bob's comment and Suggestion
  are attributed, and Alice alone receives the derived pending-Suggestion Attention item.
- AC-3: PASS — Store race coverage proves one durable approval claim and one replay receipt;
  integration coverage rejects Bob and replays Alice's command without another lease or prompt.
- AC-4: PASS — the offline real-Engine harness creates one Work Item, Executor, worktree, Session,
  and lease, writes one provider prompt, and does not depend on Bob's connection.
- AC-5: PASS — full Core and Server suites pass; legacy, T3, and C2 tests remain green. Unbound
  legacy clients cannot see or operate team Sessions, and team credentials cannot enter terminal or
  Canvas surfaces.
- AC-6: PASS — changed-file formatting and diff checks pass; documentation, SDLC contract, SDLC
  worktree, and Gate regression checks all pass.

Owner-run evidence:

- `cargo test -p codetwo-core -p codetwo-server` — PASS.
- `cargo test -p codetwo-desktop-host` — PASS, 20 tests.
- `cargo check --workspace` — PASS, including the TUI event consumer.
- `bun run build:renderer` from `apps/desktop` — PASS, including ESLint, Stylelint, TypeScript, and
  production Vite build.
- changed-Rust-file `rustfmt --check` plus `git diff --check` — PASS.
- `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts`, and
  `bun script/verify/sdlc.ts --worktree` — PASS.
- `bun test script/verify/checks.test.ts` — PASS, 5 tests.

Residual risk: the production TaskBoard/sidebar is still local and has no team interaction UI; this
slice is reachable through the Server contract and Desktop Host commands. Approval claim, Session
attachment, and provider submission span durable steps; setup failures become `execution_failed`
and are not automatically retried. Server deployment hardening, member deactivation management,
backups, TLS/Tailscale operation, and independent adversarial verification remain outside this
change.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the production TaskBoard/sidebar is still local and has no team interaction UI; this

## Verdict

Verdict: implementation-owner evidence passes; independent high-risk verification remains pending..

## Review and release

Draft PR: [#218](https://github.com/IchenDEV/codeTwo/pull/218).
Approval: the user approved implementation on 2026-09-01.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the implementation; additive collaboration tables remain inert and existing data is
not migrated or deleted.
No release: implementation is not yet independently verified or approved for release.

## Feedback

No runtime feedback exists yet; the first observation boundary is the two-client integration harness.
