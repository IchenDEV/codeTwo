---
id: 2026-09-15-artifact-preview-and-download
schema: 5
stage: verification
status: blocked
owner: chenli
created: 2026-09-15
based_on: plan.md
revision: 9de1ebb12e833ebfdfc07a725f65a4ecf31de5b7 + uncommitted worktree changes
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
next_trigger: A human opens the desktop on a session with a delivered artifact and confirms the preview, Save As, Reveal, the stage-artifact expansion, and a browser download from a paired device; then set AC-5 to passed and this stage to passed.
---

# Verification: Artifact preview and download

## Verification

- AC-1: PASS — `cargo test -p codetwo-core --lib artifact` ran
  `save_document_accepts_the_widened_allow_list_and_rejects_the_rest`: html, svg, json, csv, yaml,
  and xml each store with their mime and derived extension and read back, while `application/pdf`
  is rejected with `UnsupportedFormat`.
- AC-2: PASS — the same run's `read_text_rejects_binary_and_oversized_bodies`: a text body reads
  back, a 3-byte preview bound yields `PreviewTooLarge`, and a stored PNG is refused with
  `InvalidData` instead of being lossily decoded.
- AC-3: PASS — the same run's `list_for_session_returns_only_that_sessions_artifacts` returns the two
  artifacts referenced by `s1`, not `s2`'s, and an unknown session is empty.
- AC-4: PASS — `cargo test -p codetwo-server --lib tests::artifact_download_filenames_are_sanitized`
  proves the header sanitizer, and `cargo test -p codetwo-server --test artifact_download` runs a
  live server over a file-backed store: 401 without a bearer, 200 with `Content-Type: text/plain`
  and `Content-Disposition: attachment; filename="note.txt"` and the exact body, and 404 for an
  unknown id.
- AC-5: BLOCKED — `bun test tests/artifactPreviewRendered.test.tsx` renders the component through the
  DOM harness and asserts all five mime branches (download, markdown, markup with
  `sandbox="allow-scripts"`, text, image) plus the Save As and Reveal controls; `bun run lint`,
  `bun run lint:styles`, `bunx tsc --noEmit`, the full `bun test` (904 pass, 3 pre-existing
  `pluginBridgeContract` failures from the absent `crates/plugins`), and `bunx vite build` all pass.
  The workflow requires an actual rendered window for UI acceptance; no display or instance was
  available, so that observation was not performed.
- AC-6: PASS — `apps/desktop/src/session/turns.ts` no longer throws for `artifact_produced`; the
  desktop type-check and test suite still pass.

Verdict: blocked — storage, listing, the download route, and the preview component are verified by
unit, integration, and DOM-render tests, but AC-5's real-window observation is outstanding.
Residual risk: a preview reads at most 1 MiB of text, so a larger document shows its bounded head
only; the sandboxed markup frame allows scripts (matching `VisualizationFrame`) but no same-origin,
and the route serves only artifacts already present in the local content-addressed store.

## Cleanup

Removed: none — no task-owned scratch roots were created.
Retained: none.
Retention owner: not applicable.
Cleanup trigger: not applicable.
Processes: the integration test aborts its own server task and its `tempfile::TempDir` is released
on return; no desktop instance, daemon, or port was left running.
Evidence: `git status --porcelain` lists only the intended source, test, and record edits;
`git check-ignore apps/desktop/dist` confirms the renderer build output is ignored.

## Review and release

Approval: pending — merge and external actions require their own authorization.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
