---
id: "2026-08-30-feishu-document-component"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-08-30
source: user request in this task, "云文档的渲染考虑使用飞书云文档组件或者说是 iframe 来接"
risk: high
approved_by: "chenli"
approved_at: "2026-08-30"
---

# Intent: Embed Feishu documents with the official component

## Problem

The current C2 document detail fetches raw document text and renders it as Markdown. The user asked
whether the official Feishu Docs Component or a direct iframe should become the richer document
surface. The preferred path must preserve Feishu permissions and live collaboration without exposing
the app secret or user token to the renderer, while retaining a usable result when the component
cannot load.

## Proposed outcome

The current C2 document detail fetches raw document text and renders it as Markdown. The user asked

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, permission approval, or release is authorized.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct implementation request approves this Intent and Spec, with chenli as the named
approver. The user later authorized PR #185 and explicitly authorized its merge on 2026-08-31.
No publication, deployment, permission approval, or release is authorized.
