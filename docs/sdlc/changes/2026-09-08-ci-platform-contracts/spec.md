---
id: 2026-09-08-ci-platform-contracts
schema: 5
stage: spec
status: accepted
owner: codex
created: 2026-09-08
based_on: intent.md
---
# Spec: CI platform contracts

## Design

Keep the existing build argv and profile socket policy. Make source contracts insensitive to whitespace and restrict composer matching to relevant attributes. Supply escaped Windows separator equivalents for Electrobun's existing ignore globs without modifying dependencies. Reuse test:ci for the Windows workflow.

## Acceptance criteria

- [x] AC-1: The plugin build contract accepts multiline argv and the profile contract respects platform-specific socket paths.
- [x] AC-2: Runtime and build outputs match exclusions with either separator while source edits remain visible; the installed watcher regression passes locally.
- [x] AC-3: Composer contracts use bounded matching and pass; Windows invokes the shared CI timeout.
- [x] AC-4: Desktop tests, lint, types and repository documentation/scope checks pass; native Windows verification limitations remain explicit.
- [x] AC-5: All CI Bun setup steps pin 1.4.2; frozen installs, website build and lifecycle tests work with that version.
- [x] AC-6: PR/main validation appears as one CI/Test job retaining existing checks; PRs do not package, nightly packages main pushes and retains scheduled/manual triggers, while Windows and versioned releases remain manual.
