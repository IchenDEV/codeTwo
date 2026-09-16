---
id: 2026-09-16-lint-ignore-build-output
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-16
source: user
risk: low
approved_by: chenli
approved_at: 2026-09-16
approval_source: "Direct request: pr, answering the offer to fix the lint hang caused by build output."
next_trigger: chenli reviews the verified work.
---

# Intent: Keep the lint run away from build output

## Intent

`bun run lint` (`ultracite check`) hangs or crashes whenever `apps/desktop/dist/` exists. The dev
watcher rebuilds that directory on every source edit, so the failure appears at random during
ordinary development: the run burns CPU for minutes and then reports an error over the bundled
renderer's embedded xterm banner.

Cause, verified on the live checkout: ultracite runs `oxlint .` and `oxfmt --check .`; `oxlint`
honours this repo's `ignorePatterns` (`dist/**`, `build/**`, `artifacts/**`, `node_modules/**`) and
finishes in seconds, while `apps/desktop/oxfmt.config.ts` only ignores `src-tauri/gen`, `src-host`,
asset JSON and `artifacts`. So the formatter walks the ~48 MB bundled renderer (including a 5 MB
vendor bundle) on every lint run.

Outcome: `bun run lint` and `bun run build:renderer` stay fast and green whether or not a build
output directory exists.

Constraints: the ignore list grows only by the project's own build directories; no rule, file list,
or formatting behaviour changes for maintained source.

Non-goals: changing what ultracite checks, adding a lint configuration, or removing build output
cleanup from any script.

## Non-goals

No new lint rule, no change to the maintained file set, and no product code.
