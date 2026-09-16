---
id: 2026-09-16-quiet-shell-chrome
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-16
based_on: spec.md
scope: apps/desktop/src/App.tsx, apps/desktop/src/session/SessionHeaderActions.tsx, apps/desktop/src/session/Composer.tsx, apps/desktop/src/sidebar/SessionRail.tsx, apps/desktop/src/projects/ProjectIcon.tsx, apps/desktop/src/styles.css, apps/desktop/tests/shellChromeContract.test.ts, apps/desktop/tests/sessionRailRendered.test.tsx, apps/desktop/tests/sessionHeaderActionsRendered.test.tsx, apps/desktop/tests/windowChromeContract.test.ts, apps/desktop/tests/composerGeometryContract.test.ts, docs/sdlc/changes/2026-09-16-quiet-shell-chrome
---

# Plan: Quiet the app shell chrome

## Plan

1. `apps/desktop/src/App.tsx` — `.session-header-toolbar` `gap-4` → `gap-inline`. (AC-1)
2. `apps/desktop/src/session/SessionHeaderActions.tsx` — the action group `gap-2` → `gap-inline`;
   the overflow trigger keeps its `size-7` control so the group stays on one 28px baseline. (AC-1)
3. `apps/desktop/src/styles.css` — remove the two `@container session-header` gap overrides so the
   toolbar rhythm never widens with the window; keep the label-collapse rules. (AC-1)
4. `apps/desktop/src/projects/ProjectIcon.tsx` — drop the tile fill and the ring. (AC-2)
5. `apps/desktop/src/sidebar/SessionRail.tsx` — the checkout and pull-request badges drop
   `bg-fill-quiet`, `rounded-micro`, and `px-1`. (AC-3)
6. `apps/desktop/src/session/Composer.tsx` — move `<SessionControls>` into the `controls` fragment
   before the flex spacer and collapse the footer to one `flex items-center` row. (AC-4)
7. `apps/desktop/tests/shellChromeContract.test.ts` — new source contract for the four fixes.
8. `apps/desktop/tests/sessionRailRendered.test.tsx` — extend the provenance case to assert the
   badges carry no fill/pill classes and that the workspace line shares `data-session-content` with
   the title line. (AC-3)
9. `apps/desktop/tests/sessionHeaderActionsRendered.test.tsx` and
   `apps/desktop/tests/composerGeometryContract.test.ts` — update only if their existing assertions
   cover the changed classes.
10. Review follow-ups, all inside the paths above plus `shellChromeContract`:
    `apps/desktop/src/sidebar/SessionRail.tsx` carries the pull-request state by colour only and
    drops the selected row's `before:` bar (AC-6, AC-8);
    `apps/desktop/src/App.tsx` and `apps/desktop/src/styles.css` drop the header's leading project
    mark and its narrow-window rule (AC-7); `apps/desktop/src/session/Composer.tsx` moves the
    checkout and branch chip labels to the muted foreground (AC-9).

11. Review follow-up (AC-10): `apps/desktop/src/sidebar/SessionRail.tsx` gives the project trigger
    the shared `row` size and drops the session content's extra left padding, with the two rail tests
    updated to the one-edge contract. Verified through the web server (see the checks below).

Checks by risk and affected behavior:

- Desktop: `bun run lint`, `bunx tsc --noEmit`, `bun test`, `bun run build:renderer` from
  `apps/desktop`.
- Rendered (AC-1, AC-2, AC-4, AC-5): the renderer runs from this worktree (`bun run dev:renderer`,
  port 1420) and the agent's collaborative browser measures the toolbar gaps, the project-mark
  styles, and the composer's control rows before and after. The rail's badge alignment is structural
  (same container, no badge padding) and asserted through the rendered rail test because the
  Core-less renderer has no session fixture for the rail; the running dev window the user opened
  carries the same code and is left for their visual check.
- Repository: `bun script/verify/sdlc.ts --worktree` and `bun script/verify/docs.ts` before handoff.

Temporary resources: the task-owned renderer log at
`/var/folders/nl/47s4vtc92m74_j8pmm7d0chh0000gn/T/opencode/renderer-1420.log`, the Vite dev server on
port 1420, and the ignored `apps/desktop/dist/` output from the build check. The server is stopped and
the log removed before handoff; screenshots are retained as Verification evidence. The user's running
dev window (C2-dev, data dir `dev.codetwo.app.dev`) is theirs and is left running.

Rollback: `git revert` of the single commit; every edit is a class, markup, or CSS change with no
data, protocol, or persistence surface.
