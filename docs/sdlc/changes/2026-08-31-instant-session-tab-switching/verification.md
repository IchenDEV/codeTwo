---
id: "2026-08-31-instant-session-tab-switching"
stage: verification
schema: 3
status: passed
owner: codex
created: 2026-08-31
based_on: plan.md
commit: ""
verification_mode: owner
verified_by: "codex"
verified_at: "2026-08-31"
release_target: none
release_identity: ""
---

# Verification: Make session tab switching immediate

## Automated checks

Verdict: verified.

- `bun test apps/desktop/tests/sessionRailRendered.test.tsx`: 19 tests passed with 195 assertions,
  including immediate row-local selection and existing keyboard, context-menu, archive, and Section
  behavior. Existing Base UI `act(...)` warnings remain non-failing and are unrelated to this change.
- The first renderer-build attempt from the repository root failed with `Script not found
  "build:renderer"`. Running the package-owned command from `apps/desktop` passed design checks,
  TypeScript, Vite production build in 27.84 seconds, and generated-output checks with 35 semantic
  selectors.
- The in-app Browser reported no open browser tabs and cannot attach to the Electrobun
  `views://main/index.html` WebView. The built renderer was therefore copied into the already-running
  C2-dev bundle and reloaded without starting a second Core process.
- In the real CodeTwo window, consecutive task selections updated the active row and content
  directly in light and dark appearance. The selected surface remained neutral, row actions stayed
  available, and no liquid indicator travelled between rows. The same switch was repeated at the
  supported 230-pixel rail minimum without clipping; the original light appearance and 347-pixel
  rail width were restored afterward.
- The first lifecycle check rejected the new Artifact because its required `Feedback` section was
  missing. The section was added, after which `bun script/check-sdlc.ts` passed.
- `git diff --check` passed.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: desktop observation is frame-level rather than a recorded high-frame-rate capture;
the absence of the shared animated component and background transition is also protected by source
and rendered assertions.

## Behavioral evidence

Verdict: verified.

- `bun test apps/desktop/tests/sessionRailRendered.test.tsx`: 19 tests passed with 195 assertions,
  including immediate row-local selection and existing keyboard, context-menu, archive, and Section
  behavior. Existing Base UI `act(...)` warnings remain non-failing and are unrelated to this change.
- The first renderer-build attempt from the repository root failed with `Script not found
  "build:renderer"`. Running the package-owned command from `apps/desktop` passed design checks,
  TypeScript, Vite production build in 27.84 seconds, and generated-output checks with 35 semantic
  selectors.
- The in-app Browser reported no open browser tabs and cannot attach to the Electrobun
  `views://main/index.html` WebView. The built renderer was therefore copied into the already-running
  C2-dev bundle and reloaded without starting a second Core process.
- In the real CodeTwo window, consecutive task selections updated the active row and content
  directly in light and dark appearance. The selected surface remained neutral, row actions stayed
  available, and no liquid indicator travelled between rows. The same switch was repeated at the
  supported 230-pixel rail minimum without clipping; the original light appearance and 347-pixel
  rail width were restored afterward.
- The first lifecycle check rejected the new Artifact because its required `Feedback` section was
  missing. The section was added, after which `bun script/check-sdlc.ts` passed.
- `git diff --check` passed.

### Acceptance evidence

- AC-1: PASS — `Verification record above` preserves the original passing evidence.
- AC-2: PASS — `Verification record above` preserves the original passing evidence.
- AC-3: PASS — `Verification record above` preserves the original passing evidence.
- AC-4: PASS — `Verification record above` preserves the original passing evidence.

Residual risk: desktop observation is frame-level rather than a recorded high-frame-rate capture;
the absence of the shared animated component and background transition is also protected by source
and rendered assertions.

## Visual evidence

See bundle evidence/ when present.

## Security and privacy evidence

Not separately recorded unless present in legacy Verification.

## Deviations and residual risk

Residual risk: desktop observation is frame-level rather than a recorded high-frame-rate capture;

## Verdict

Verdict: verified..

## Review and release

Human review and merge approval for PR #185 were explicitly granted by chenli on 2026-08-31.
No release was requested.

## Feedback

The user removed motion that made ordinary task navigation feel indirect. This change keeps motion
scoped to interactions where it explains a local transition, such as disclosure and archival,
instead of applying it to routine session selection.
