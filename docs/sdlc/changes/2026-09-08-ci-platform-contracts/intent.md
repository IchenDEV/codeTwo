---
id: 2026-09-08-ci-platform-contracts
schema: 5
stage: intent
status: accepted
owner: codex
created: 2026-09-08
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-08
approval_source: "User: 开始修复; 升级 bun 1.4; consolidate CI tests and keep packaging out of routine PR checks."
---
# Intent: CI platform contracts

## Intent

Restore desktop CI contracts after profile build changes: tolerate command formatting, apply socket limits only on Unix, exclude generated watcher paths on both separator conventions, and bound composer source matching. Align Windows with the existing CI test timeout. Preserve the prior profile record's unresolved native acceptance and Ready PR gate.

Upgrade all CI Bun installations to 1.4.2, the locally installed and tested 1.4 patch, including Pages, and document the matching development prerequisite.

Consolidate desktop/design and SDLC checks into one CI/Test job. User follow-up “nightly 合入main自动打包” retains nightly on main pushes, its existing schedule and manual dispatch; Windows and versioned releases are manual. PRs do not package. Preserve existing validation and release authorization.
