---
id: 2026-09-08-desktop-dev-profiles
schema: 5
stage: intent
status: accepted
owner: codex
created: 2026-09-08
source: user
risk: high
approved_by: chenli
approved_at: 2026-09-08
approval_source: "Session: user requested simultaneous development and testing with isolation configuration after the concrete profile and ownership-lock proposal."
next_trigger: Complete the request and record its existing authorization.
---

# Intent: Desktop Dev Profiles

## Intent

Allow workers to develop and test concurrently using explicit isolated desktop profiles. The user selected isolation after review of separate data, ports, build outputs, application identities and OS-backed ownership. Preserve default data and launch behavior; never replace another live instance. Local implementation and disposable validation only.

The user subsequently reported a frozen window with "Kernel output stream closed unexpectedly". Packaged runtime validation reproduced inherited nonblocking stdin causing EAGAIN after host readiness; correcting the desktop executable stdio flags is included in restoring usable isolated instances.

The user requested final improvement and cleanup after closing the test windows. This authorizes bounded launcher cleanup and removal of assistant-created build caches/probes; retain test data and evidence, keep GUI instances closed, and preserve the unresolved desktop/CPU acceptance status.

The user requested verification of the CPU-contention hypothesis. A windowless probe using the installed Electrobun watcher reproduced runtime-log-triggered rebuilds with no source edits. Correct the profile output ignore patterns and retain focused regressions; this is within the existing isolation implementation scope.
