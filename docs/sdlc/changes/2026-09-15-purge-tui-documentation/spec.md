---
id: 2026-09-15-purge-tui-documentation
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-15
based_on: intent.md
---

# Spec: Purge the removed TUI from the documentation

## Design

- **Delete** `website/guide/tui.md` and its sidebar entry in `website/.vitepress/config.mts`; retarget
  the two inbound links (`website/reference/faq.md`, `website/guide/rules.md`) at the surviving
  surfaces.
- **Command examples** drop `-p codetwo-tui` (`website/guide/getting-started.md`,
  `website/zh/guide/getting-started.md`, `website/reference/faq.md`) and the "Run the TUI" section is
  removed from both getting-started pages.
- **Surface descriptions** replace the TUI with the real remaining surfaces: the landing page
  diagram, the surface table, and the protocol/architecture frontend lists name desktop, server,
  remote client, or the NAPI addon.
- **Cross-cutting prose** in `docs/reference/{architecture,plugins,memory,plugin-standard}.md`,
  `docs/design/scenes-v2-implementation-plan.md`, and `README.md` drops the TUI from host and
  consumer lists; the `codetwo-tui` crate citation becomes the NAPI addon.
- **Stale count** fix: `website/guide/introduction.md` says "nine agent CLIs"; the registry lists
  eleven, so it names all eleven.

## Acceptance criteria

- [x] AC-1: `website/guide/tui.md` is deleted, its sidebar entry is gone, and no document links to
      `/guide/tui`.
- [x] AC-2: no non-historical document contains a `codetwo-tui` command or crate citation.
- [x] AC-3: no non-historical document advertises a TUI surface (word-boundary `TUI`/`ratatui`), and
      the replaced prose names a real surviving surface.
- [x] AC-4: `website/guide/introduction.md` states the correct agent-CLI count and lists them.
- [x] AC-5: `bun script/verify/docs.ts`, `bun run docs:build` from `website`, and
      `bun script/verify/sdlc.ts --worktree` all pass.
