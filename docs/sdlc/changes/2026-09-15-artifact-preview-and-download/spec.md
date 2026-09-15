---
id: 2026-09-15-artifact-preview-and-download
schema: 5
stage: spec
status: accepted
owner: chenli
created: 2026-09-15
based_on: intent.md
---

# Spec: Artifact preview and download

## Design

### Storage: a wider, still-explicit document allow-list

`save_document` keeps its shape but maps a named allow-list to extensions:
`text/markdown`→`md`, `text/plain`→`txt`, `text/html`→`html`, `image/svg+xml`→`svg`,
`application/json`→`json`, `text/csv`→`csv`, `text/yaml`→`yaml`, `application/xml`→`xml`. Every
other mime still fails closed with `UnsupportedFormat`. Images keep the existing verified raster
allow-list; the 20 MiB `MAX_ARTIFACT_BYTES` bound and content-addressed dedupe are unchanged.

### Read and list

`ArtifactStore::read_text(id, max_bytes)` returns a bounded UTF-8 string for preview: it rejects a
non-UTF-8 body and anything over `max_bytes` (default 1 MiB) rather than truncating silently.
`ArtifactStore::list_for_session(session_id)` returns `Vec<ArtifactRef>` joined through
`artifact_refs`, newest first, so a client can enumerate what a session produced.

Commands: `artifacts.read_text {id, max_bytes?}` and `artifacts.list {session}`.

### Download route

`GET /api/artifacts/:id` mirrors the canvas asset route: `require_device` first, then
`ArtifactStore::get`, then `Content-Type` from the stored mime and
`Content-Disposition: attachment; filename="<sanitized>"`. The sanitizer keeps ASCII alphanumerics,
`.`, `-`, `_`, replaces every other character (including quotes, slashes, and newlines) with `_`,
caps the stem at 80 characters, and always yields a non-empty name.

### Desktop preview

`ArtifactPreview` dispatches on mime:
- `image/*` (raster) → the existing blob-URL `<img>` path.
- `image/svg+xml` → sandboxed `<iframe srcDoc>` (SVG is markup, not a raster image).
- `text/html` → sandboxed `<iframe srcDoc>` with scripts enabled, as `VisualizationFrame` already does.
- `text/markdown` → the shared `MarkdownContent` renderer.
- other `text/*` and `application/json|xml` → bounded monospace text via `read_text`.
- anything else → a metadata card with download only.

Every branch keeps a footer with the display name, size, Save As (`artifacts.save_as`), and Reveal
(`artifacts.reveal`). `TurnCard` uses `ArtifactPreview` for every tool artifact instead of the
image-only viewer. `turns.ts` treats `artifact_produced` as a scene-layer fact it ignores, instead
of throwing.

## Acceptance criteria

- [x] AC-1: `save_document` accepts the widened allow-list and still rejects an unknown mime; the
      stored ref carries the requested mime and a matching extension.
- [x] AC-2: `read_text` returns the stored UTF-8 body, rejects non-UTF-8 bytes, and rejects a body
      over its `max_bytes`.
- [x] AC-3: `list_for_session` returns the session's artifacts and no other session's.
- [x] AC-4: `GET /api/artifacts/:id` requires device auth, returns the stored bytes with the stored
      `Content-Type`, and always sends a sanitized `Content-Disposition` filename; an unknown id is
      `404`.
- [x] AC-5: `ArtifactPreview` renders markdown, sandboxed HTML/SVG, bounded text, and raster images
      by mime, and exposes download and reveal for each.
- [x] AC-6: `artifact_produced` no longer throws in turn projection.
