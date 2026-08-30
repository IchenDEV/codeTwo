---
id: change-2026-08-31-radius-compliance
kind: change
status: verified
owner: codex
approvers: [user]
created: 2026-08-31
updated: 2026-08-31
source: direct user request to correct every radius that does not follow the project standard
inputs: repository radius audit, current design tokens, design-system checks, rendered UI
outputs: desktop radius migration, strengthened design-system enforcement, tests, and rendered evidence
next_trigger: authorized pull request checks and repository merge; no product release is authorized
---

# Enforce the product radius scale everywhere

## Intent

The user asked for every noncompliant corner radius in the desktop product to be corrected, after
an audit found legacy Tailwind utilities, direct token escape hatches, undersized fallbacks, and
unrestricted fully rounded geometry. The desired result is one visible and enforceable product
scale: structural square edges use 0, controls and non-circular capsules use 12px, cards and panels
use 16px, and 24px remains exclusive to the Composer. Fully round geometry is reserved for actual
circles.

The affected systems are renderer components, embedded visualization and annotation surfaces,
radius tokens and documentation, design-system enforcement, and focused rendered contracts. Data,
desktop process ownership, provider behavior, release packaging, and unrelated in-progress UI work
are non-goals. The initial request authorized implementation and visual correction. The user
subsequently authorized PR creation and merge on 2026-08-31; release, deployment, and production
mutation remain out of scope.

## Spec

All production radius call sites must use semantic utilities or variables rather than legacy
`rounded`, size-named Tailwind radius utilities, direct `--ds-radius-*` arbitrary utilities, or
magic numeric values. Joined edges and straight indicators may use 0. True circular dots and
square icon controls may remain fully round; tracks, progress bars, switches, pills, badges, and
other non-square shapes use the 12px control radius and rely on CSS clamping at small heights.

Standalone renderer surfaces that cannot inherit the app token sheet define exact 12px control and
16px module fallbacks. Standard ESLint and Stylelint rules must detect legacy bare radius utilities
and non-semantic maintained CSS radius declarations so the cleaned debt cannot silently return.
Existing unrelated worktree changes remain intact.

### Acceptance criteria

- [x] Repository source contains no legacy size-named or bare Tailwind radius utilities, direct
      product radius escape hatches, undersized numeric fallbacks, or non-circular `rounded-full`
      uses in the maintained desktop UI.
- [x] App, Remote, Canvas, annotation, visualization, Side Chat/Quick Chat, and shared UI source
      contracts resolve to 0/12/16/24 according to their semantic role; the live app and shared
      primitive preview preserve that hierarchy in light and dark themes.
- [x] ESLint, Stylelint, and focused tests reject reintroduced legacy and maintained-CSS hardcoded
      radius values, with current radius-specific design debt reduced to zero.
- [x] Focused tests, renderer build, SDLC validation, diff hygiene, and real light/dark plus narrow
      rendered inspection pass without radius regressions or relevant console errors.

## Decision and gates

The user's direct implementation request accepts Intent and the visible radius hierarchy. The
repository's existing semantic token system and current UI documentation are the design source of
truth. Human review remained the next Gate after verification. The user accepted that Gate and
authorized PR creation and merge on 2026-08-31. Release, deployment, and production mutation remain
unauthorized.

## Plan

1. Clarify the 0/12/16/24 contract in tokens and design documentation, then remove obsolete radius
   compatibility aliases.
2. Migrate renderer components, standalone embedded surfaces, CSS fallbacks, and panel geometry to
   semantic radius roles while preserving unrelated worktree edits.
3. Tighten source enforcement and focused tests, regenerate the design-debt baseline, and prove the
   rendered result in light, dark, standard, and narrow states.

Rollback restores the affected semantic classes, token aliases, lint rules, and focused tests
from their eventual repository diff; no stored data or external state is changed.

## Build

- All maintained renderer call sites now use semantic radius utilities or local semantic variables.
  Bare and size-named Tailwind radius utilities, direct arbitrary radius token utilities, and
  non-circular full-round tracks, switches, badges, capsules, and progress bars were removed.
- Joined dock selection indicators use square edges; true circular dots and square icon controls
  retain full-round geometry. Quick Chat and ordinary panels use 16px, their controls use 12px,
  and the Composer remains the sole 24px content surface.
- Obsolete 4px/8px radius foundations, legacy Tailwind compatibility aliases, and the radius
  allowlist entry were removed. Canvas, visualization, and annotation islands now carry exact
  12px control and 16px module fallbacks.
- The design-system scanner now reads embedded CSS declarations, rejects unknown radius variables,
  legacy utilities, and non-square `rounded-full`, while allowing only documented semantic roles,
  structural zero, and true 50% circles. Focused tests protect those failure modes.

## Verification

Verdict: verified.

- Direct source scan reported `radiusViolations: 0`; the radius allowlist and radius-specific legacy
  baseline are empty. `bun run check:design` passed with 0 new violations and all contrast contracts
  passing; 485 unrelated pre-existing design-debt findings remain tracked.
- `bun test tests/designSystem.test.ts` passed 27 tests and 265 expectations. The full desktop suite
  passed 744 tests, 3,388 expectations, and 122 files with 0 failures; existing non-failing React
  `act(...)` warnings remained unchanged.
- `bun run build:renderer` passed the source design gate, TypeScript, the production Vite build with
  6,401 transformed modules, and the generated CSS check with all 35 required semantic selectors.
  Vite retained its existing large-chunk advisory.
- The live design preview at 1280x900 verified 12px controls/tracks and 16px cards/dialogs in both
  light and dark schemes. At 800x900 it retained the same values with zero horizontal overflow;
  the opened dialog computed to 16px. Browser console output was empty.
- The live app verified a 12px window shell, 16px Quick Chat panel, 12px Quick Chat controls, and
  24px Composer. Quick Chat remained inside an 800x720 viewport with zero horizontal overflow and
  no relevant console messages. The existing renderer-only Vite process was reused without
  starting or disturbing a native Core.
- Final `git diff --check` passed and `bun script/check-sdlc.ts` reported `[sdlc] contract valid`.

Residual risk: the standalone annotation overlay, generated visualization document, and Remote
Canvas were source-scanned, test-covered, and included in the successful renderer build, but were
not each opened inside a live remote host during this pass. Unrelated concurrent Quick Chat and
window-safe-area work remains in the shared worktree and is outside this change's release boundary.

## Review and release

Approval: the user approved PR creation and merge on 2026-08-31 after rendered verification.
Release target: none requested.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the scoped source, token, lint, and test changes or revert their eventual commit.
No release: PR creation and merge are authorized; no tag, publication, deployment, or product
release was requested.

## Feedback

No post-change feedback exists yet.
