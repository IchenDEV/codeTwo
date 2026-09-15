---
id: 2026-09-15-artifact-preview-and-download
schema: 5
stage: plan
status: accepted
owner: chenli
created: 2026-09-15
based_on: spec.md
scope: docs/sdlc/changes/2026-09-15-artifact-preview-and-download/intent.md, docs/sdlc/changes/2026-09-15-artifact-preview-and-download/spec.md, docs/sdlc/changes/2026-09-15-artifact-preview-and-download/plan.md, docs/sdlc/changes/2026-09-15-artifact-preview-and-download/verification.md, crates/core/src/artifact.rs, crates/core/src/plugins/app/plugins/workspace_io.rs, crates/server/src/lib.rs, crates/server/tests/artifact_download.rs, apps/desktop/src/bridge.ts, apps/desktop/src/session/ArtifactPreview.tsx, apps/desktop/src/session/TurnCard.tsx, apps/desktop/src/session/StageTrack.tsx, apps/desktop/src/session/turns.ts, apps/desktop/tests/artifactPreviewRendered.test.tsx
---

# Plan: Artifact preview and download

## Plan

1. `crates/core/src/artifact.rs` — widen the `save_document` mime allow-list, add
   `ArtifactStore::metadata`, `read_text` (with the `PreviewTooLarge` error and
   `MAX_ARTIFACT_PREVIEW_BYTES`), and `list_for_session`; update the widened/rejected-mime test and
   add read/list tests.
2. `crates/core/src/plugins/app/plugins/workspace_io.rs` — register `artifacts.read_text` and
   `artifacts.list`.
3. `crates/server/src/lib.rs` — add the device-authenticated `GET /api/artifacts/:id` route, its
   handler, and the `artifact_download_filename` sanitizer with a unit test.
4. `crates/server/tests/artifact_download.rs` — integration test over a file-backed store: 401
   without a bearer, 200 with stored `Content-Type` + sanitized `Content-Disposition` + exact bytes,
   and 404 for an unknown id.
5. `apps/desktop/src/bridge.ts` — add `listArtifacts` and `readArtifactText`.
6. `apps/desktop/src/session/ArtifactPreview.tsx` — the mime-dispatching preview surface with Save
   As and Reveal.
7. `apps/desktop/src/session/TurnCard.tsx` — render tool artifacts through `ArtifactPreview`,
   removing the image-only viewer and its now-unused imports.
8. `apps/desktop/src/session/StageTrack.tsx` — expand a stage artifact inline through
   `ArtifactPreview`.
9. `apps/desktop/src/session/turns.ts` — stop throwing on `artifact_produced`.
10. `apps/desktop/tests/artifactPreviewRendered.test.tsx` — classify mimes and render the download,
    markdown, and markup branches.

Checks by risk and affected behavior:

- Rust core (storage + validation): `cargo test -p codetwo-core --lib artifact`
- Rust server (protocol + sanitizer): `cargo test -p codetwo-server --lib tests::artifact_download_filenames_are_sanitized`
  and `cargo test -p codetwo-server --test artifact_download`
- Desktop: `bun run lint`, `bun run lint:styles`, `bunx tsc --noEmit`, `bun test`, `bunx vite build`
- Repository: `bun script/verify/sdlc.ts --worktree` and `bun script/verify/docs.ts` before handoff

The real-window observation for AC-5 remains outstanding because this environment has no display;
the component is exercised by the DOM harness, and the record marks that boundary explicitly.

Temporary resources: the integration test creates one `tempfile::TempDir` per run for the SQLite
file and artifact root, released when the test returns; no task-owned processes, ports, or
long-lived roots are created.

Rollback: revert the change commit and delete this record's directory. The mime allow-list is
additive, the new commands and route are new surfaces, and no stored data is migrated.
