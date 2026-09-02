---
id: "2026-08-31-remove-liquid-gooey"
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

# Spec: Remove the liquid interaction renderer

## Requirements

The desktop package and lockfile must not contain `liquid-gooey`. Source code must not retain a
liquid compatibility component or plugin-specific attribute. Tabs must express their selected
state directly on the tab trigger; the session rail must express the active state directly on the
row; run and stop buttons must render directly inside their tooltips. These paths must not create
DOM mutation or resize observers, read layout to place an indicator, or construct SVG goo filters.

Rollback is a repository revert of this change's package, lockfile, component, test, and Artifact
edits.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's implementation request approves Intent and deletion. Existing Base UI state attributes,
C2 color tokens, and CSS transitions are sufficient; no replacement animation dependency is
approved. Merge, release, deployment, and termination of a live C2 process remain separate human
Gates.

## Acceptance criteria

- [x] AC-1: The desktop manifest and lockfile contain no `liquid-gooey` package entry.
- [x] AC-2: Desktop source contains no liquid import, wrapper, compatibility flag, plugin attribute, or
  SVG goo-filter implementation.
- [x] AC-3: Tabs preserve visible default, line, and toolbar selected states using tokenized CSS only.
- [x] AC-4: The active session row preserves its visible selected state independently of observer support.
- [x] AC-5: Composer run and stop buttons preserve their enabled, disabled, loading, tooltip, keyboard,
  and Reduced Motion behavior without a liquid wrapper.
- [x] AC-6: Focused tests, the complete desktop suite, type checking, renderer build, lint, SDLC
  checks, diff checks, and rendered dark, light, and narrow-window verification pass.

## Decision

The user's implementation request approves Intent and deletion. Existing Base UI state attributes,
C2 color tokens, and CSS transitions are sufficient; no replacement animation dependency is
approved. Merge, release, deployment, and termination of a live C2 process remain separate human
Gates.
