---
id: 2026-09-08-four-stage-sdlc
schema: 5
stage: spec
status: accepted
owner: codex
created: 2026-09-08
based_on: intent.md
design_approved_by: chenli
design_approved_at: 2026-09-08
design_approval_source: "Session: user explicitly selected the four-file structure, risk-based authorization policy, and AC-N evidence contract after comparing Doubao and CodeTwo."
---

# Spec: Four-stage SDLC

## Design

Use schema 5 for new four-file bundles. The CLI creates all four draft/pending files together; file creation never grants permission. Intent alone owns request authorization and risk, Spec owns design approval and AC-N criteria, Plan owns implementation scope, and Verification owns evidence and release facts. Ordinary Spec and Plan acceptance records readiness under the Intent authorization without another approval ceremony. High/critical Spec requires independent design confirmation; passed verification requires an independent verifier for the same risk levels.

All four files must exist, use one schema, and follow based_on links. Drafts may coexist. Accepted stages require accepted predecessors, and active verification requires an accepted Plan. Reuse the existing scope, criterion evidence, and release validators through in-memory section views. Legacy formats keep their existing semantics; no bulk migration or additional tracker is introduced. Policy metadata records decisions but does not authenticate them.

## Acceptance criteria

- [x] AC-1: New changes and Incident follow-ups create exactly four linked stage files with valid drafts and no additional approval command.
- [x] AC-2: Ordinary changes reuse Intent authorization; high/critical design and verification enforce independence, and authority fields cannot be duplicated into another stage.
- [x] AC-3: Passed verification requires a checked Spec AC-N for each unique PASS mapping with command/link evidence, a verified revision, and risk-appropriate verifier metadata; failure evidence remains available in Draft PRs.
- [x] AC-4: Actual-diff scope, Ready and release gates, schema-3/4 compatibility, and documentation classification remain valid.
