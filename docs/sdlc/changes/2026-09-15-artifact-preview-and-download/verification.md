---
id: 2026-09-15-artifact-preview-and-download
schema: 5
stage: verification
status: passed
owner: chenli
created: 2026-09-15
based_on: plan.md
revision: 0bb373052113a2b57bad1005770fd580c1a36133
verification_mode: owner
verified_by: chenli
verified_at: 2026-09-15
release_target: none
cleanup_status: complete
next_trigger: chenli reviews verified work.
---

# Verification: Artifact preview and download

Accepted at the local/automated level on the requester's explicit instruction ("在本级验收"). The
storage, listing, and download route are verified by unit and live-server integration tests, and the
preview surface is rendered in a real browser in light, dark, and narrow states.

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
- AC-5: PASS — `bun test tests/artifactPreviewRendered.test.tsx` classifies the mime types and
  renders the download, markdown, markup (`sandbox="allow-scripts"`), text, and image branches with
  their Save As and Reveal controls; a real Chromium render of the same component in light and dark
  at 1440px and narrow at 430px confirms the card chrome, mime/size footer, download and reveal
  affordances, and the fallback card for an unknown binary:
  ![Artifact preview, light and dark](evidence/artifact-preview-light-dark.png)
  ![Artifact preview, narrow](evidence/artifact-preview-narrow.png)
- AC-6: PASS — `apps/desktop/src/session/turns.ts` no longer throws for `artifact_produced`; the
  desktop type-check and test suite still pass.

Verdict: verified.
Residual risk: a preview reads at most 1 MiB of text, so a larger document shows its bounded head
only; the sandboxed markup frame allows scripts (matching `VisualizationFrame`) but no same-origin;
and the browser render used representative artifacts rather than artifacts produced by a live agent
turn.

## Cleanup

Removed: the temporary verification harness (`apps/desktop/verify-ui.html`, `verify-ui.tsx`,
`vite.verify.config.ts`) and its `/tmp/verify-ui-dist` output, plus the transient HTTP server used
for the headless render; no listener remains on ports 1430/1431.
Retained: the two evidence PNGs under this record's `evidence/` directory.
Retention owner: this change record.
Cleanup trigger: remove with the change record if it is ever pruned.
Processes: none; the artifact integration test aborts its own server task, and the headless render
and its server exited within one command.
Evidence: `git status --porcelain` and `lsof -nP -iTCP:1430 -iTCP:1431` (empty).

## Review and release

Approval: pending — merge and external actions require their own authorization.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
