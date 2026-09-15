---
id: 2026-09-15-purge-tui-documentation
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-15
based_on: spec.md
scope: docs/sdlc/changes/2026-09-15-purge-tui-documentation/intent.md, docs/sdlc/changes/2026-09-15-purge-tui-documentation/spec.md, docs/sdlc/changes/2026-09-15-purge-tui-documentation/plan.md, docs/sdlc/changes/2026-09-15-purge-tui-documentation/verification.md, README.md, website/guide/tui.md, website/.vitepress/config.mts, website/index.md, website/guide/introduction.md, website/guide/getting-started.md, website/guide/rules.md, website/guide/market.md, website/guide/first-session.md, website/guide/editor.md, website/guide/providers.md, website/zh/guide/getting-started.md, website/zh/guide/providers.md, website/reference/faq.md, website/reference/protocol.md, website/reference/architecture.md, website/zh/reference/architecture.md, docs/reference/architecture.md, docs/reference/plugins.md, docs/reference/memory.md, docs/reference/plugin-standard.md, docs/design/scenes-v2-implementation-plan.md
---

# Plan: Purge the removed TUI from the documentation

## Plan

Apply the edits enumerated in the Spec: delete the TUI page and its nav entry, retarget the inbound
links, drop `codetwo-tui` from command examples, replace TUI surface mentions with the real
surviving surfaces in both language tracks, and correct the agent-CLI count. Each change is a
wording or navigation edit; none touches code, packaging, or protocol.

Checks by risk and affected behavior (documentation-only, low risk):

- `bun script/verify/docs.ts` for the documentation contract and links
- `bun run docs:build` from `website` for a real VitePress render of every edited page
- `bun script/verify/sdlc.ts --worktree` for scope coverage
- `rg` sweeps for `TUI`/`ratatui`/`codetwo-tui`/`/guide/tui` to prove the residue is gone

No UI acceptance or runtime check applies: nothing rendered in the product changes.

Temporary resources: the website build writes only its git-ignored `.vitepress/cache` and
`.vitepress/dist`; no task-owned roots or processes.

Rollback: revert the change commit and delete this record's directory; the deleted page returns with
the revert.
