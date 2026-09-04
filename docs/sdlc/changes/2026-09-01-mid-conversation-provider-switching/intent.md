---
id: "2026-09-01-mid-conversation-provider-switching"
stage: intent
schema: 3
status: accepted
owner: codex
created: 2026-09-01
source: direct user request on 2026-09-01 to prioritize switching providers during an existing conversation and resolve compatibility problems
risk: medium
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Intent: Continue one conversation across providers

## Problem

An existing CodeTwo Session owns one provider process and one provider-specific ACP resume cursor,
while the desktop provider picker can visually change without replacing that runtime. The result is
an unsafe mismatch: the Composer may name one provider while the next turn still runs on another,
and simply moving an ACP cursor across providers would be invalid.

The requested outcome is an explicit mid-conversation switch that preserves the user-visible
Session and transcript, starts the selected provider with a provider-neutral continuation, and
fails without damaging the original runtime when the switch cannot be completed. Existing files,
worktree identity, execution policy, memory policy, scenes, and transcript ordering must remain
unchanged.

Provider account migration, cross-provider native tool-state migration, automatic failover,
provider selection during a running or awaiting-input turn, release, and deployment are out of
scope.

## Proposed outcome

An existing CodeTwo Session owns one provider process and one provider-specific ACP resume cursor,

## Affected users and systems

Migrated from legacy change.md.

## Constraints

The user's direct implementation request accepts Intent and Spec for local implementation and
verification. Provider switching is medium risk because it changes runtime ownership and durable
session identity, but it does not change workspace files or database schema. Merge, release,
deployment, production mutation, and automatic provider failover remain separate human Gates.

## Out of scope

Not recorded in the legacy single-file Artifact.

## Success signals

See Spec acceptance criteria.

## Open questions

None recorded in migration.

## Decision

The user's direct implementation request accepts Intent and Spec for local implementation and
verification. Provider switching is medium risk because it changes runtime ownership and durable
session identity, but it does not change workspace files or database schema. Merge, release,
deployment, production mutation, and automatic provider failover remain separate human Gates.
