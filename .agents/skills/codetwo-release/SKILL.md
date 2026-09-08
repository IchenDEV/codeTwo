---
name: codetwo-release
description: Package CodeTwo builds or prepare and execute an authorized versioned release.
---

# CodeTwo release

Read the matching parts of [releasing](references/releasing.md) for build channels, signing,
release preflight, artifact verification, and recovery. Use the actual workflows and requested
revision; successful local checks or nightly packaging do not grant release authority.

Prepare and verify the requested package within existing authorization. Publication, tag creation,
and recovery writes require explicit authorization for the target; reuse it for the same pending
action. Report observed artifacts and smoke results, distinguishing unrun or blocked checks.

Before handoff, apply the shared [cleanup contract](../codetwo-develop/references/workflow.md#cleanup-and-handoff) and record what was removed or retained, including when work fails or stops.
