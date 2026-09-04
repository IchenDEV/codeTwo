---
id: "2026-09-02-four-stage-sdlc"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-02
based_on: intent.md
risk: medium
approved_by: "user via chat"
approved_at: "2026-09-02"
---

# Spec: Four-stage SDLC with mandatory approval

## Requirements

- Each change bundle must contain `intent.md`, `spec.md`, `plan.md`, and `verification.md` with
  `schema: 3`.
- Legacy `change.md` is forbidden for new or modified bundles.
- `spec.md` requires accepted `intent.md`; `plan.md` requires accepted `spec.md`; PR implementation
  changes require accepted `plan.md` with covering `scope`.
- `devflow` exposes `new`, `design`, `plan`, `verify`, and `approve <stage>` commands.

## User experience

Maintainers run `./script/devflow new <slug>` then approve each stage after human confirmation.
Checker errors name the missing approval or scope gap.

## Technical design

- `script/verify/artifact-parse.ts` and `stage-bundle.ts` parse and validate stage bundles.
- `script/verify/sdlc.ts` enforces schema 3, approval chain, scope, release, incident, and eval Gates.
- `script/sdlc/migrate-bundles.ts` splits historical `change.md` into four files.
- `docs/catalog.json` classifies `intent.md` and sibling stage files.

## Security and privacy

No runtime or credential changes.

## Alternatives and non-goals

- Keeping compact schema-2 `change.md` — rejected per user request.
- Optional approval — rejected; Intent/Spec/Plan are mandatory Gates.

## Areas of concern

Large migration diff; worktree Gate must allow deleting legacy `change.md` during migration.

## Acceptance criteria

- [x] AC-1: Schema-3 checker rejects a bundle whose `spec.md` is accepted while `intent.md` is not.
- [x] AC-2: `devflow approve` records `approved_by` and `approved_at` on intent, spec, and plan.
- [x] AC-3: `bun script/verify/docs.ts` accepts migrated stage files under change bundles.
- [x] AC-4: Operator documentation describes four stages and the approval chain.

## Decision

Accepted per user request.
