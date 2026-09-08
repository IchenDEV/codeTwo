---
id: 2026-09-08-desktop-dev-profiles
schema: 5
stage: spec
status: accepted
owner: codex
created: 2026-09-08
based_on: intent.md
design_approved_by: chenli
design_approved_at: 2026-09-08
design_approval_source: "Session: user selected concurrent testing with isolation following the profile, complete resource isolation and data-directory OS lock proposal."
---

# Spec: Desktop Dev Profiles

## Design

Implement the existing [profile contract](../../../design/desktop-development-profiles.md). A validated profile plus canonical worktree determines runtime, build and app identity; explicit ports fail on collisions. Keep the default launch backward compatible. Acquire an OS-backed data-directory lock before desktop socket replacement and Core startup, and retain it for Core lifetime. Use platform build locks for same-profile build ownership. Native global input remains shared within one OS desktop.

## Acceptance criteria

- [x] AC-1: Profiles resolve distinct data, socket, bundle, build and temporary paths across profiles and worktrees; invalid names, channels and ports fail without shared fallback.
- [x] AC-2: Packaged nonblocking stdin is normalized for Tokio stdio and does not close Core unexpectedly. Concurrent Core A/B remain independently usable; duplicate A fails before mutation or socket replacement; A survives B shutdown and A can restart after exit or crash.
- [ ] AC-3: Profile builds use current source and isolated Rust, Swift, renderer and Electrobun outputs; two development bundles can run concurrently with distinct identities.
- [x] AC-4: Vite uses explicit strict profile ports and isolated caches/output; default configuration and data remain compatible.
- [x] AC-5: Launch and operational documentation describe supported configuration, ownership, recovery and verification limits accurately.

- [x] AC-6: Runtime logs, data and generated outputs never trigger a development rebuild; a real source change still rebuilds, and repeated same-profile starts do not retry or restart the existing owner.
