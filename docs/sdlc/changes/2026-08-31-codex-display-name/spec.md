---
id: "2026-08-31-codex-display-name"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: intent.md
risk: low
approved_by: "[user via the 2026-08-31 direct copy request]"
approved_at: "2026-08-31"
---

# Spec: Use Codex as the product display name

## Requirements

Every active product-owned exact occurrence of `OpenAI Codex` becomes `Codex`. The internal
provider id remains `codex`, and the Codex ACP command and login/runtime requirements remain
unchanged. Historical archive material retains its source-faithful wording.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user directly accepted this low-risk copy change on 2026-08-31. No security, data-migration,
release, or production Gate applies. Human review remains required before merge, and no external
delivery action is authorized.

## Acceptance criteria

- [x] AC-1: Desktop and Core provider registries expose `Codex`, and product-name tests expect the
      concise label without changing provider identity or behavior.
- [x] AC-2: Active English and Chinese website/reference copy uses `Codex`; the only remaining exact
      `OpenAI Codex` occurrence is in an archived research record.
- [x] AC-3: Focused tests, desktop and website builds, rendered Provider-picker inspection, and
      repository lifecycle checks pass.

## Decision

The user directly accepted this low-risk copy change on 2026-08-31. No security, data-migration,
release, or production Gate applies. Human review remains required before merge, and no external
delivery action is authorized.
