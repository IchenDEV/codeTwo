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
Auto Scene uses hidden Codex developer instructions plus the authenticated scene MCP status and
selection tools rather than a visible user-text suffix. Default inherited C2 memory recall is not
added to Codex user text; the composer labels that behavior **Codex default**, while **Memory on**
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

## Build

Codex now removes only `AGENTS.md` from C2's compiled project-rule prefix and relies on Codex's
native loading for that file. `CLAUDE.md`, `.cursorrules`, Copilot instructions, C2 rules, and
`.cursor/rules/*` remain provider-neutral prompt context. Sites, host-tool, browser, and Auto Scene
routing stay in the existing Codex developer configuration. Auto Scene no longer adds a visible
suffix to Codex turns; `scene_list` returns a bounded `enabled: false` status instead of an error
when the feature is off, while selection still fails closed and both developer and MCP instructions
use the returned `enabled` status.

Inherited C2 memory recall is no longer appended to Codex user text. An explicit session read
policy of `allow`, produced by **Memory on** or **Recall only**, keeps the existing bounded recall
and durable receipt behavior. The composer exposes the inherited, non-injecting state as **Codex
default** so the visible control matches the provider-specific transport behavior. Non-Codex prompt
composition is unchanged. Codex transient chats explicitly select `allow`/`deny`, preserving their
recall-without-learning contract instead of being mistaken for the non-injecting default.

## Verification

Verdict: verified.

This verdict includes the 2026-09-01 review correction.

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

### Acceptance evidence

- AC-1: PASS — `cargo test -p codetwo-core --test provider_tools` passed 8 tests, including the
  exact mock Codex wire assertion that omits native `AGENTS.md`, retains a non-native `CLAUDE.md`,
  hides inherited memory and Auto Scene text, and retains explicit Memory `allow` with one receipt.
- AC-2: PASS — `cargo test -p codetwo-core` passed all Core unit, integration, and doc-test targets;
  the developer-configuration regressions preserved existing configuration, Sites safety, host
  tools, browser gating, and the new hidden Auto Scene rule.
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

Residual risk: the regression proves the exact ACP wire boundary with a mock Codex adapter but does
not create a real user-owned Codex thread for acceptance. Codex has no per-turn hidden dynamic
instruction field in the ACP prompt used here, so explicit C2 memory `allow` remains visible by
design and Auto Scene may appear as a folded tool call even though its instructions are no longer
user-authored prompt text.

## Review and release

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
live symptom.
