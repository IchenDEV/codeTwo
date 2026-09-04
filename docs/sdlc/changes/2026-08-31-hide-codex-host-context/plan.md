---
id: "2026-08-31-hide-codex-host-context"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: apps/desktop/src/session/config.ts, apps/desktop/src/session/config.test.ts, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/SideChatPanel.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/sideChatPanelRendered.test.tsx, apps/desktop/src-host/src/scene_mcp.rs, crates/core/src/engine.rs, crates/core/tests/provider_tools.rs, crates/core/tests/engine_memory.rs, docs/reference/memory.md, docs/sdlc/changes/2026-08-31-hide-codex-host-context
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Plan: Hide C2 host context from Codex user prompts

## Files and ownership

apps/desktop/src/session/config.ts, apps/desktop/src/session/config.test.ts, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/SideChatPanel.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/sideChatPanelRendered.test.tsx, apps/desktop/src-host/src/scene_mcp.rs, crates/core/src/engine.rs, crates/core/tests/provider_tools.rs, crates/core/tests/engine_memory.rs, docs/reference/memory.md, docs/sdlc/changes/2026-08-31-hide-codex-host-context

## Order of work

1. Extend the existing mock Codex provider test to capture project-rule, memory, and Auto Scene
   markers in developer configuration and in the actual ACP prompt.
2. Move or suppress only Codex-duplicated host context at the narrow engine seam while preserving
   non-Codex behavior and explicit optional-feature provenance.
3. Run focused prompt, memory, and lifecycle verification; retain any failed iteration here before
   recording a verdict.
4. Remove the remaining Auto Scene developer-instruction copy after user feedback and reverify the
   authenticated Scene MCP boundary before updating the existing pull request.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

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

## Decision

The user's direct product feedback approves this Intent, implementation, and local verification.
The user is the named Intent approver and Codex is the implementation owner. No deployment,
release, merge, production mutation, provider-package publication, or user-data migration is
authorized.
