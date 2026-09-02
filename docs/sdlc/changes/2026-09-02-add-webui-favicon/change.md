---
id: change-2026-09-02-add-webui-favicon
kind: change
schema: 2
status: verified
risk: low
owner: codex
approvers: user via the direct 2026-09-02 screenshot feedback
approved_at: 2026-09-02
created: 2026-09-02
updated: 2026-09-02
source: direct screenshot feedback that the CLI Web UI browser tab needs a C2 icon
inputs: the shared Web UI HTML entry and the existing C2 application icon asset
outputs: the browser tab resolves the existing C2 icon instead of the generic globe
scope: apps/desktop/index.html, docs/sdlc/changes/2026-09-02-add-webui-favicon
next_trigger: human review and an explicit merge or release decision
verification_mode: owner
verified_by: codex
verified_at: 2026-09-02
---

# Add the C2 icon to the Web UI browser tab

## Intent

The CLI Web UI browser tab currently falls back to the browser's generic globe because the shared
HTML entry does not declare an icon. The user asked for the tab to show a product icon. The desired
outcome is to reuse the repository's existing C2 application mark without creating a Web-only
brand asset or changing the application shell.

## Spec

The main HTML entry declares the existing SVG application icon as its favicon. Vite must include
the asset in its Web build and keep the generated URL valid under the CLI server's relative asset
base. The desktop pet entry, product title, runtime transport, and native application icon pipeline
are out of scope.

### Acceptance criteria

- [x] AC-1: The built and served CLI Web UI declares a reachable C2 favicon instead of relying on
      the browser's generic fallback, verified against the generated HTML, HTTP response, and a
      live Browser reload.
- [x] AC-2: The favicon reuses the existing C2 SVG asset and the desktop renderer still passes its
      lint, type, and production-build checks.

## Decision and gates

The user's direct screenshot feedback accepts this low-risk visual correction. Ponytail selected
one HTML metadata declaration at the shared entry and the existing app icon; no duplicated favicon,
new dependency, Web-only component, or configuration surface is justified.

Human review remains required before merge. Merge, release, deployment, and publication are not
authorized.

## Plan

1. Reference the existing C2 SVG icon from the shared main HTML entry.
2. Build the real Web bundle and verify the emitted icon URL is served successfully.
3. Reload the live CLI Web UI, inspect the icon declaration, and run repository lifecycle Gates.

Rollback removes the favicon declaration. There is no data or protocol rollback.

## Build

The shared main HTML entry now declares `assets/icon.svg` as an SVG favicon. Vite resolves that
existing source into its normal hashed Web asset, so the CLI server and desktop bundle keep the
same relative-asset contract. No new icon file, component, dependency, or runtime branch was added.

## Verification

Verdict: verified.

### Acceptance evidence

- AC-1: PASS — `bunx vite build --mode web --outDir ../../target/debug/web-ui --emptyOutDir`
  emitted `assets/icon-CjKlZ2fo.svg` and a relative icon link in `index.html`; `curl` against the
  running `http://127.0.0.1:4599/` returned that SVG with HTTP 200 and `image/svg+xml`. After a live
  in-app Browser reload, the complete `C2` document resolved the same absolute icon URL and MIME
  type.
- AC-2: PASS — `bun run lint`, `bunx tsc --noEmit`, and the actual Vite Web build passed with 6,604
  transformed modules; source inspection confirms the HTML entry directly references the existing
  `apps/desktop/assets/icon.svg`.

The first lifecycle Gate pass rejected the AC-2 evidence because its command was wrapped onto a
continuation line. The mapping above places the command on the evidence line; no product code or
verification result changed.

Residual risk: the safe Browser API verified the live document and icon request but cannot capture
the host application's tab chrome as pixels; Codex also blocks Computer Use from inspecting its own
window. Browser favicon caching may require one reload on an already-open tab. The favicon itself is
theme- and viewport-independent.

## Review and release

Approval: implementation approved by the user on 2026-09-02; merge and release are not approved.
Review: Draft PR [#219](https://github.com/IchenDEV/codeTwo/pull/219) contains this change.
Release target: none.
Release identity: not applicable until released.
Smoke evidence: not applicable until released.
Rollback: remove the favicon declaration from the shared HTML entry.
No release: merge, deployment, and release are not authorized.

## Feedback

This change is the direct follow-up to the user's browser-tab screenshot. No post-fix feedback
exists yet.
