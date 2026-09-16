---
id: 2026-09-16-lint-ignore-build-output
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-16
based_on: intent.md
---

# Spec: Keep the lint run away from build output

## Design

`apps/desktop/oxfmt.config.ts` gains two ignore patterns beside the ones it already carries:
`**/dist/**` (the renderer build output, including the `dist-web` web build) and `**/build/**` (the
Electrobun app bundle tree). The comment beside them records why: the formatter walks the tree, so
an unignored bundle of tens of megabytes is formatted on every lint run. `oxlint.config.ts` already
ignores the same directories and is unchanged.

## Acceptance criteria

- [x] AC-1: With `apps/desktop/dist/` present, `bun run lint` finishes in seconds and reports the
  maintained files only.
- [x] AC-2: `bun run build:renderer` (lint + tsc + vite build) passes with a previous `dist/`
  present, which is the state the dev watcher leaves behind.
- [x] AC-3: No maintained source file's formatting verdict changes.
