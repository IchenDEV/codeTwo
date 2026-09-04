---
id: "2026-08-31-replace-design-checker-with-lint"
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

# Spec: Replace the custom design checker with standard lint tooling

## Requirements

Use mature lint packages rather than recreating the deleted scanner in configuration code. ESLint
owns TypeScript, React Hooks, and Tailwind class restrictions; Stylelint owns maintained CSS and the
semantic radius declaration contract. The renderer build runs lint before TypeScript and Vite.
CI exposes lint as the named policy Gate and does not run the removed checker separately.

Rules that require a custom parser, occurrence baseline, contrast math, or compiled-CSS inspection
are deleted rather than reimplemented as another bespoke checker. TypeScript and Vite remain the
authority for compilation and Tailwind generation. Existing rendered tests remain the behavioral
authority. Historical change records keep their original command evidence unchanged.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request accepts Intent and the deletion-first direction. Mature
lint dependencies are permitted because no suitable linter is currently installed. The user
accepted the human review Gate and authorized PR creation and merge on 2026-08-31. Publication and
release remain unapproved.

## Acceptance criteria

- [x] AC-1: The custom design checker, allowlist, and occurrence baseline are deleted with no active
      package, test, workflow, README, or current design-document reference remaining.
- [x] AC-2: `bun run lint` uses installed ESLint and Stylelint packages and rejects legacy radius classes,
      arbitrary radius utilities, direct inline `borderRadius`, raw product `<textarea>`, and
      non-semantic CSS radius declarations where standard lint rules can express them.
- [x] AC-3: The current desktop source passes lint without introducing a replacement custom scanner,
      generated suppression baseline, or broad new ignore list.
- [x] AC-4: Migration-focused desktop tests, renderer build, diff hygiene, and lifecycle validation pass;
      the full desktop suite is run and any unrelated failure is recorded explicitly.

## Decision

The user's direct implementation request accepts Intent and the deletion-first direction. Mature
lint dependencies are permitted because no suitable linter is currently installed. The user
accepted the human review Gate and authorized PR creation and merge on 2026-08-31. Publication and
release remain unapproved.
