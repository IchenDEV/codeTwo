---
id: change-2026-08-31-hide-codex-host-context
kind: change
schema: 2
status: verified
risk: medium
owner: codex
approvers: [user]
approved_at: 2026-08-31
created: 2026-08-31
updated: 2026-09-01
source: direct user feedback on 2026-08-31 that default C2 injection is excessive and remains visible in Codex
inputs: current Codex ACP prompt composition, provider developer configuration, project rules, C2 memory recall, and Auto Scene routing
outputs: bounded host-owned context that does not appear as user-authored Codex prompt text
scope: apps/desktop/src/session/config.ts, apps/desktop/src/session/config.test.ts, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/SideChatPanel.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/sideChatPanelRendered.test.tsx, apps/desktop/src-host/src/scene_mcp.rs, crates/core/src/engine.rs, crates/core/tests/provider_tools.rs, crates/core/tests/engine_memory.rs, docs/reference/memory.md, docs/sdlc/changes/2026-08-31-hide-codex-host-context
next_trigger: human review decides whether to deliver the corrected change
verification_mode: owner
verified_by: codex
verified_at: 2026-09-01
---

# Hide C2 host context from Codex user prompts

## Intent

The user reported that C2's default injected context is too large and remains visible in Codex.
The affected surface is the provider-owned Codex conversation: host routing, project rules,
recalled memory, and Auto Scene control data must not masquerade as text authored by the user.

The desired outcome is a concise Codex task whose visible user turn contains the user's document
and explicitly attached content only. C2 may still provide required host policy through a
provider-supported non-user instruction channel, rely on Codex-native project instruction loading,
or expose optional context through an explicit feature boundary. Other providers retain their
existing prompt transport unless the same boundary can be changed without weakening behavior.

Changing permission policy, Sites deployment safety, memory storage, scene permissions, the ACP
protocol, provider packages, or transcript history is out of scope.

## Spec

For Codex sessions, C2-owned routing and safety rules use the existing developer configuration and
must not be repeated in `session/prompt`. `AGENTS.md` is not duplicated into the Codex user turn
because Codex loads it from the session working directory; C2-supported formats that Codex does not
load natively remain in the prompt so their instructions are not lost.
Auto Scene uses only the authenticated Scene MCP initialization, status, and selection tools; C2
does not duplicate its routing copy into Codex developer instructions or a visible user-text
suffix. Default inherited C2 memory recall is not added to Codex user text; the composer labels
that behavior **Codex default**, while **Memory on**
and **Recall only** remain explicit per-session `allow` opt-ins with normal receipts. Codex Quick
Chat and Side Chat also use explicit recall-only policy. Native provider commands remain exact,
attachment-free documents.

Existing non-Codex providers keep their current first-turn routing, rule, scene, and memory
behavior. Rollback is a revert of the provider-specific prompt boundary and focused regressions.

### Acceptance criteria

- [x] AC-1: A mock Codex turn with repository rules, recalled memory, and Auto Scene enabled sends
      no C2-owned default block as user-authored ACP prompt text.
- [x] AC-2: Codex still receives required static host and Sites safety rules through developer
      configuration without overwriting user configuration.
- [x] AC-3: Codex preserves C2-supported non-native project rules and transient-chat recall, while
      non-Codex project rules, memory recall, Auto Scene behavior, and first-turn routing remain
      unchanged.
- [x] AC-4: Focused Core tests and repository documentation and lifecycle checks pass.
- [x] AC-5: Codex developer configuration contains no C2 Auto Scene routing copy; Scene MCP status,
      selection, and fail-closed permission behavior remain covered by focused tests.

## Decision and gates

The user's direct product feedback approves this Intent, implementation, and local verification.
The user is the named Intent approver and Codex is the implementation owner. No deployment,
release, merge, production mutation, provider-package publication, or user-data migration is
authorized.

## Plan

1. Extend the existing mock Codex provider test to capture project-rule, memory, and Auto Scene
   markers in developer configuration and in the actual ACP prompt.
2. Move or suppress only Codex-duplicated host context at the narrow engine seam while preserving
   non-Codex behavior and explicit optional-feature provenance.
3. Run focused prompt, memory, and lifecycle verification; retain any failed iteration here before
   recording a verdict.
4. Remove the remaining Auto Scene developer-instruction copy after user feedback and reverify the
   authenticated Scene MCP boundary before updating the existing pull request.

## Build

Codex now removes only `AGENTS.md` from C2's compiled project-rule prefix and relies on Codex's
native loading for that file. `CLAUDE.md`, `.cursorrules`, Copilot instructions, C2 rules, and
`.cursor/rules/*` remain provider-neutral prompt context. Sites, host-tool, and browser routing stay
in the existing Codex developer configuration. Auto Scene no longer adds a visible suffix to Codex
turns; `scene_list` returns a bounded `enabled: false` status instead of an error when the feature is
off, while selection still fails closed and the Scene MCP initialization uses the returned
`enabled` status. Follow-up user feedback on 2026-09-01 rejected duplicating Auto Scene routing copy
into Codex developer instructions, so Core no longer adds that copy or carries a launch parameter
for it.

Inherited C2 memory recall is no longer appended to Codex user text. An explicit session read
policy of `allow`, produced by **Memory on** or **Recall only**, keeps the existing bounded recall
and durable receipt behavior. The composer exposes the inherited, non-injecting state as **Codex
default** so the visible control matches the provider-specific transport behavior. Non-Codex prompt
composition is unchanged. Codex transient chats explicitly select `allow`/`deny`, preserving their
recall-without-learning contract instead of being mistaken for the non-injecting default.

## Verification

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
