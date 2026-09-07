---
id: "2026-09-07-enforce-lifecycle-and-launch-boundaries"
stage: spec
schema: 3
status: accepted
owner: codex
created: "2026-09-07"
based_on: intent.md
risk: "medium"
approved_by: "Chen Li"
approved_at: 2026-09-07
---

# Spec: Enforce Lifecycle And Launch Boundaries

## Requirements

Prevent implicit process replacement and close the reproduced lifecycle false positives and false negatives.

## User experience

Normal launch reports an existing owner; logs attach without building or stopping it. Explicit restart is the only replacement action. Valid draft stages can be saved without claiming implementation approval.

## Technical design

Use the existing launcher and stage checker. Restrict scope coverage to changed bundles. Validate each available stage in sequence. Deduplicate identical evidence records, reject differing duplicates, and validate unfinished markers with JavaScript syntax.

## Security and privacy

Release and independent-verifier requirements remain enforced. Tests use disposable repositories and mocked launch operations; no user application state is used.

## Alternatives and non-goals

No new workflow registry, additional approval layers, full profile implementation, or mass rewrite of historical bundles.

## Areas of concern

The launcher guard covers its tracked owner; it does not replace the separately specified native OS ownership lock. Historical identical evidence must remain readable.

## Acceptance criteria

- [x] AC-1: Run, verify, and debug refuse a live tracked owner before building; logs and telemetry attach; explicit restart verifies identity and waits for exit before rebuilding.
- [x] AC-2: Worktree and branch Gates reject new implementation covered only by an unchanged historical bundle, including deletion and rename changes.
- [x] AC-3: Conflicting or differing evidence for one acceptance id fails; byte-equivalent parsed records count once without deleting historical evidence.
- [x] AC-4: Sequential drafts and documented review/progress states validate; gaps or advancement without predecessor approval fail; implementation and release still require accepted prerequisites.
- [x] AC-5: Accepted or passed stages reject unfinished markers; complete stages and ordinary words remain valid.
- [x] AC-6: Relevant regressions and repository checks pass; documentation describes the actual states and launch modes.

## Decision

Accepted under Chen Li’s 2026-09-07 “开始修复” instruction for the investigated five failures.
