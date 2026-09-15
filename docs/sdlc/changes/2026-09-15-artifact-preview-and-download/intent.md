---
id: 2026-09-15-artifact-preview-and-download
schema: 5
stage: intent
status: accepted
owner: chenli
created: 2026-09-15
source: user
risk: medium
approved_by: chenli
approved_at: 2026-09-15
approval_source: "Direct request: 全面改造一下。ok — comprehensive overhaul of artifact preview and download (Batch 3 of the四个体验升级)."
next_trigger: chenli reviews verified work.
---

# Intent: Artifact preview and download

## Intent

The artifact store is content-addressed and already exposes `artifacts.get` / `artifacts.save_as` /
`artifacts.reveal` (`crates/core/src/plugins/app/plugins/workspace_io.rs:604-639`), but the delivery
experience is broken above it:

- **Only images can be stored or previewed.** `save_document` accepts exactly `text/markdown` and
  `text/plain` (`crates/core/src/artifact.rs:221-225`), and a test asserts `text/html` is rejected;
  images are limited to png/jpeg/webp/gif (`crates/core/src/artifact.rs:501-507`). An HTML page, an
  SVG, or a JSON/CSV deliverable has no artifact path.
- **Only images can be previewed.** `TurnCard`'s `ArtifactImage` is the only artifact viewer
  (`apps/desktop/src/session/TurnCard.tsx:227-314`); scene artifact content is dead code
  (`sceneArtifactContent` is referenced by no UI), and the `artifact_produced` event is swallowed
  (`apps/desktop/src/App.tsx:3458-3466`) and throws in turn projection
  (`apps/desktop/src/session/turns.ts:691-692`).
- **There is no listing command** (`artifacts.list` does not exist), and **no download route** for
  a paired web/remote client: the only byte routes are canvas-scoped and omit
  `Content-Disposition` (`crates/server/src/lib.rs:1322-1384`).

Outcome: a single `ArtifactPreview` surface renders any delivered artifact (image, markdown, HTML or
SVG, structured text, plain text) with download and reveal, tool artifacts use it instead of the
image-only viewer, artifacts can be listed for a session, and a paired client can download an
artifact by URL with its real filename.

Constraints: keep the content-addressed blob layer and its 20 MiB bound; no migration; the download
route reuses the existing device-authentication pattern and a strict filename/mime sanitizer;
`artifact_produced` stops throwing without claiming a transcript part. Non-goals: scene-artifact
preview inside the pipeline `StageTrack`, task-artifact recording, and streaming/virtualized preview
of very large documents.

## Related

Existing contracts: `crates/core/src/artifact.rs`, `crates/core/src/plugins/app/plugins/workspace_io.rs`,
`crates/server/src/lib.rs`, `apps/desktop/src/session/TurnCard.tsx`.
