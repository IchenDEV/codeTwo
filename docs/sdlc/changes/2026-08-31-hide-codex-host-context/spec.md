---
id: "2026-08-31-hide-codex-host-context"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-08-31"
---

# Spec: Hide C2 host context from Codex user prompts

## Requirements

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

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct product feedback approves this Intent, implementation, and local verification.
The user is the named Intent approver and Codex is the implementation owner. No deployment,
release, merge, production mutation, provider-package publication, or user-data migration is
authorized.

## Acceptance criteria

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

## Decision

The user's direct product feedback approves this Intent, implementation, and local verification.
The user is the named Intent approver and Codex is the implementation owner. No deployment,
release, merge, production mutation, provider-package publication, or user-data migration is
authorized.
