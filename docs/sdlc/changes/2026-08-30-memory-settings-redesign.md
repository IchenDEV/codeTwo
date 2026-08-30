---
id: change-2026-08-30-memory-settings-redesign
kind: change
status: verified
owner: codex
approvers: "#decision-and-gates"
created: 2026-08-30
updated: 2026-08-30
source: "#intent"
inputs: "#spec"
outputs: "#build"
next_trigger: PR #182 merge verification
---

# Redesign the Memory settings workspace

## Intent

The user supplied a rendered Memory settings screenshot and asked for the page to be redesigned
because its hierarchy is cluttered and inconsistent with adjacent settings pages. The desired
outcome is a restrained macOS settings surface that preserves the existing Memory workflows while
making the page header, behavior summary, filters, list, and inspector read as one coherent system.
The user explicitly requested an ImageGen design pass before implementation and rejected a
flamboyant visual direction.

## Spec

The task-session ImageGen concept `exec-7d022327-2e17-4113-bd6f-e80b78207060.png` is the visual
reference. Keep the repository's 768px settings content column and semantic design tokens. Reuse
the shared page-header anatomy, retain one flat behavior disclosure, and group status, views,
filters, list, and details inside one workbench surface. Use semantic hairlines for structure,
reserve blue for interactive emphasis, and give the list and inspector the same neutral surface.
Keep all eight existing view buttons and use compact spacing so the final Conflicts view remains
reachable without changing the filter contract.

At viewport widths at or below 1024px, keep the existing list-only layout and detail dialog. At
800px and below, stack the page header actions and use the existing compact two-column filter grid.

### Acceptance criteria

- [x] The Memory page uses the shared page header and aligns project selection with New memory.
- [x] Memory behavior remains expandable and visually subordinate to the main workbench.
- [x] Status, views, search, filters, list, and inspector form one flat grouped surface.
- [x] The empty inspector no longer uses a blue-tinted panel and both empty states are centered.
- [x] All existing filter modes remain reachable, including conflicts through Needs attention.
- [x] Standard, narrow, light, and dark rendered states have no clipping or horizontal overflow.
- [x] Focused behavior, layout, design-system, renderer, SDLC, and diff checks pass.

## Decision and gates

Intent and design direction are accepted by the user's 2026-08-30 implementation request and
attached screenshot. No permission to create a PR, merge, publish, or release is implied.

## Plan

Reuse the shared page header, introduce one workbench wrapper around the existing controls and
panes, express its geometry in the existing layout specification, and restyle only the Memory
surface. Preserve data loading, editing, batch actions, policy controls, and dialog behavior. Add a
focused layout contract, then verify the running renderer against the ImageGen concept in light,
dark, standard, and narrow states. Rollback is the inverse source change.

## Build

The Memory page now composes the shared `PageHeader`, a flat policy disclosure, and one workbench
containing status, views, filters, list, and inspector. The workbench uses semantic hairlines and a
neutral inspector surface. Standard width keeps all eight views on one row; at 800px and below,
status and view controls wrap while filters use two columns. Data loading, policy controls, batch
actions, editing, and the existing narrow detail dialog are unchanged.

## Verification

- `bun test tests/settingsLayoutContract.test.ts tests/settingsMemoryPolicyRendered.test.tsx` —
  20 passed, 0 failed. The existing Base UI harness emitted non-failing `act(...)` warnings.
- `bun run check:design` — passed with 0 new violations; legacy debt remains 657.
- `bun run build:renderer` — passed design-source checks, TypeScript, Vite production build, and
  generated-design checks. The existing large-chunk advisory remains non-failing.
- In-app Browser at `http://127.0.0.1:1420/` — verified meaningful Memory content, no framework
  overlay, and no console warnings or errors at 1280x720 light and dark, 800x600 narrow dark, and
  the ImageGen concept's native 1536x1024 size.
- At 1280px, the 704px workbench had zero internal or body overflow, all eight view buttons were
  visible, and the detail pane remained inline. At 800px, the 461px workbench, view row, and status
  row each had matching client and scroll widths; all eight views were inside the wrapper, filters
  rendered in two columns, and details moved to the existing dialog path.
- Selecting Pinned changed its `aria-pressed` state to `true`, cleared All to `false`, preserved the
  zero-result state, and produced no console errors. The browser appearance was restored to System
  and the temporary viewport override was reset after QA.
- After human review identified rounded ends on the selected-view underline, the inset button
  shadow was replaced by an independent 2px indicator. In-app Browser computed its `::after`
  radius as `0px` and the rendered 1280x720 screenshot showed square ends under All.
- ImageGen fidelity review covered copy, hierarchy, type, palette, icons, spacing, surface model,
  and responsive behavior. Above-the-fold copy is unchanged. The implementation intentionally
  retains the repository's 768px settings column and persisted sidebar width instead of the
  concept image's over-wide shell rendering; no other material visual mismatch remains.
- `bun script/check-sdlc.ts` — passed; task-scoped `git diff --check` — passed.

Verdict: verified.

Residual risk: verification covers the recorded desktop viewport matrix and repository design
contract; no versioned release or external production observation was requested.

## Review and release

PR [#182](https://github.com/IchenDEV/codeTwo/pull/182) contains the verified change. The user's
2026-08-30 request explicitly authorizes creating and merging the PR. No versioned release was
requested.

## Feedback

Human product review rejected the rounded selected-view underline. It followed the view button's
rounded geometry because the indicator was implemented as an inset shadow. The indicator now has
its own square-ended pseudo-element; the rounded keyboard focus outline remains intact for
accessibility. No additional layout, overflow, interaction, theme, or console defects were
observed in the corrected rendered review.
