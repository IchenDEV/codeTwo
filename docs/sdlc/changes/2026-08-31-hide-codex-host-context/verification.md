---
id: "2026-08-31-hide-codex-host-context"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-09-01"
release_target: none
release_identity: "not applicable until released."
---

# Verification: Hide C2 host context from Codex user prompts

## Automated checks

Verdict: verified.

This verdict includes the 2026-09-01 review correction and the follow-up removal of Auto Scene copy
from Codex developer instructions.

The 2026-09-01 review found three compatibility gaps: Codex lost C2-supported non-`AGENTS.md`
rules, transient Codex chats lost inherited recall, and the Scene MCP initialization instructions
still required a prompt marker that Codex no longer receives.

All three focused regressions went red before correction: the mock wire reported
`prompt_portable_rule=false`, the transient-policy test failed because no Codex-specific policy
function existed, and the Scene MCP assertion failed because its initialization text did not name
the returned `enabled` status. The same exact commands passed after the three boundary fixes.

The first red-capable run of
`cargo test -p codetwo-core --test provider_tools codex_host_context_does_not_appear_as_user_prompt_text -- --exact --nocapture`
failed deterministically with `prompt_rules=true`, `prompt_scene=true`, and `prompt_memory=true`
while all three developer-configuration markers were false. The same command passed after the
provider-specific boundary change.

An additional `cargo fmt --all -- --check` reported repository-wide formatting differences across
many untouched Rust files. No bulk formatter rewrite was applied because it would expand this
change beyond its explicit scope; the changed Rust compiled in the full Core run and `git diff
--check` remained clean.

### Acceptance evidence

- AC-1: PASS — `cargo test -p codetwo-core --test provider_tools` passed 8 tests, including the
  exact mock Codex wire assertion that omits native `AGENTS.md`, retains a non-native `CLAUDE.md`,
  hides inherited memory and Auto Scene text, and retains explicit Memory `allow` with one receipt.
- AC-2: PASS — `cargo test -p codetwo-core` passed all Core unit, integration, and doc-test targets;
  the developer-configuration regressions preserved existing configuration, Sites safety, host
  tools, and browser gating while asserting that Auto Scene copy is absent.
- AC-3: PASS — `cargo test -p codetwo-core` passed all Core unit, integration, and doc-test targets;
  `cargo test -p codetwo-desktop-host scene_mcp::tests --lib` passed all 5 Scene MCP tests; and the
  focused Side Chat and memory-preset run passed 23 tests.
- AC-4: PASS — `bun test` passed the full 797-test desktop suite, including the Codex transient
  recall regression and 2 memory-preset regressions. `bun run build:renderer` passed full desktop
  lint, TypeScript, and a 6,427-module production Vite build. The first direct
  type/lint attempt exposed the worktree's missing locked dependencies; `bun install
  --frozen-lockfile` restored them before the unchanged checks passed. `bun script/verify/docs.ts`,
  `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree` passed; `git diff --check`
  was clean.
- AC-5: PASS — `cargo test -p codetwo-core --lib
  codex_static_context_uses_developer_config_without_overwriting_user_config -- --nocapture` and
  `cargo test -p codetwo-core --test provider_tools
  codex_host_context_does_not_appear_as_user_prompt_text -- --exact --nocapture` passed with
  `config_scene=false` and `prompt_scene=false`; `cargo test -p codetwo-desktop-host
  scene_mcp::tests --lib` passed all 5 Scene MCP status, discovery, selection, and fail-closed
  permission tests. The follow-up `cargo test -p codetwo-core` run passed 485 unit tests and every
  Core integration and doc-test target.

Residual risk: the regression proves the exact ACP wire boundary with a mock Codex adapter but does
not create a real user-owned Codex thread for acceptance. Codex has no per-turn hidden dynamic
instruction field in the ACP prompt used here, so explicit C2 memory `allow` remains visible by
design. Auto Scene now depends on Codex honoring Scene MCP initialization and tool metadata, and a
selection may appear as a folded tool call even though C2 no longer duplicates its routing copy in
the user prompt or developer configuration.

## Behavioral evidence

Verdict: verified.

This verdict includes the 2026-09-01 review correction and the follow-up removal of Auto Scene copy
from Codex developer instructions.

The 2026-09-01 review found three compatibility gaps: Codex lost C2-supported non-`AGENTS.md`
rules, transient Codex chats lost inherited recall, and the Scene MCP initialization instructions
still required a prompt marker that Codex no longer receives.

All three focused regressions went red before correction: the mock wire reported
`prompt_portable_rule=false`, the transient-policy test failed because no Codex-specific policy
function existed, and the Scene MCP assertion failed because its initialization text did not name
the returned `enabled` status. The same exact commands passed after the three boundary fixes.

The first red-capable run of
`cargo test -p codetwo-core --test provider_tools codex_host_context_does_not_appear_as_user_prompt_text -- --exact --nocapture`
failed deterministically with `prompt_rules=true`, `prompt_scene=true`, and `prompt_memory=true`
while all three developer-configuration markers were false. The same command passed after the
provider-specific boundary change.

An additional `cargo fmt --all -- --check` reported repository-wide formatting differences across
many untouched Rust files. No bulk formatter rewrite was applied because it would expand this
change beyond its explicit scope; the changed Rust compiled in the full Core run and `git diff
--check` remained clean.

### Acceptance evidence

- AC-1: PASS — `cargo test -p codetwo-core --test provider_tools` passed 8 tests, including the
  exact mock Codex wire assertion that omits native `AGENTS.md`, retains a non-native `CLAUDE.md`,
  hides inherited memory and Auto Scene text, and retains explicit Memory `allow` with one receipt.
- AC-2: PASS — `cargo test -p codetwo-core` passed all Core unit, integration, and doc-test targets;
  the developer-configuration regressions preserved existing configuration, Sites safety, host
  tools, and browser gating while asserting that Auto Scene copy is absent.
- AC-3: PASS — `cargo test -p codetwo-core` passed all Core unit, integration, and doc-test targets;
  `cargo test -p codetwo-desktop-host scene_mcp::tests --lib` passed all 5 Scene MCP tests; and the
  focused Side Chat and memory-preset run passed 23 tests.
- AC-4: PASS — `bun test` passed the full 797-test desktop suite, including the Codex transient
  recall regression and 2 memory-preset regressions. `bun run build:renderer` passed full desktop
  lint, TypeScript, and a 6,427-module production Vite build. The first direct
  type/lint attempt exposed the worktree's missing locked dependencies; `bun install
  --frozen-lockfile` restored them before the unchanged checks passed. `bun script/verify/docs.ts`,
  `bun script/verify/sdlc.ts`, and `bun script/verify/sdlc.ts --worktree` passed; `git diff --check`
  was clean.
- AC-5: PASS — `cargo test -p codetwo-core --lib
  codex_static_context_uses_developer_config_without_overwriting_user_config -- --nocapture` and
  `cargo test -p codetwo-core --test provider_tools
  codex_host_context_does_not_appear_as_user_prompt_text -- --exact --nocapture` passed with
  `config_scene=false` and `prompt_scene=false`; `cargo test -p codetwo-desktop-host
  scene_mcp::tests --lib` passed all 5 Scene MCP status, discovery, selection, and fail-closed
  permission tests. The follow-up `cargo test -p codetwo-core` run passed 485 unit tests and every
  Core integration and doc-test target.

Residual risk: the regression proves the exact ACP wire boundary with a mock Codex adapter but does
not create a real user-owned Codex thread for acceptance. Codex has no per-turn hidden dynamic
instruction field in the ACP prompt used here, so explicit C2 memory `allow` remains visible by
design. Auto Scene now depends on Codex honoring Scene MCP initialization and tool metadata, and a
selection may appear as a folded tool call even though C2 no longer duplicates its routing copy in
the user prompt or developer configuration.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: the regression proves the exact ACP wire boundary with a mock Codex adapter but does

## Verdict

Verdict: verified..

## Review and release

Review: [pull request #209](https://github.com/IchenDEV/codeTwo/pull/209).
Approval: local implementation and verification authorized; human review remains pending.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: revert the Codex-specific prompt-boundary changes and their focused tests.
No release: no release, deployment, merge, or production mutation is authorized by this change.

Preparing this section does not authorize merge, deployment, release, or production mutation.

## Feedback

The initiating feedback is that default injection is too large and visible in Codex. Further
rendered-provider feedback will be linked here if the transport-level regression does not match the
live symptom. On 2026-09-01 the user also rejected moving Auto Scene into hidden developer copy;
that copy was removed in favor of the authenticated Scene MCP contract.
