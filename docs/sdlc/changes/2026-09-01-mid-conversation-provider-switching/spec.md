---
id: "2026-09-01-mid-conversation-provider-switching"
stage: spec
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: intent.md
risk: medium
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Spec: Continue one conversation across providers

## Requirements

An idle, active Session may replace its provider without creating a new Session id. The new
provider must initialize successfully before durable state changes. The commit clears the old ACP
cursor, model, provider-owned configuration, capabilities, goal, context-window projection, and
memory-injection receipts, while retaining provider-neutral Session policy and workspace state.

The first prompt after a switch starts a fresh ACP session and receives a bounded continuation
projection made from canonical user prompts, assistant text, plan status, and tool title/status.
Provider reasoning and raw tool outputs are excluded. Oldest context may be truncated, but the
newest complete conversation records and an explicit truncation marker remain. The continuation is
cleared only after the new provider accepts its first prompt.

Switching is rejected while a turn or user-input request is active, while another switch owns the
Session, when the selected provider is unknown or unchanged, or when a managed Task lease fixes the
runtime compatibility identity. Candidate startup, initialization, persistence, or race failures
leave the old durable and live provider usable. Events from a detached provider are fenced before
its process is terminated.

The desktop picker reflects the provider owned by each Session, disables mutation during a turn or
switch, and reconciles all session shells from the authoritative switch event. Provider-specific
model/config/capability/context state is cleared before the selected provider's new state is
published.

Rollback is a revert of the switch command, Core transition, continuation projection, callback
fence, desktop reconciliation, and tests. Existing databases need no schema migration.

## User experience

Not separately recorded in legacy change.md.

## Technical design

See Requirements and legacy Git history.

## Security and privacy

See migrated Decision and gates.

## Alternatives and non-goals

Not separately recorded in legacy change.md.

## Areas of concern

The user's direct implementation request accepts Intent and Spec for local implementation and
verification. Provider switching is medium risk because it changes runtime ownership and durable
session identity, but it does not change workspace files or database schema. Merge, release,
deployment, production mutation, and automatic provider failover remain separate human Gates.

## Acceptance criteria

- [x] AC-1: An idle durable conversation switches providers in place, persists the new provider,
  clears the old ACP cursor/model, and keeps the Session id, transcript, policies, and workspace.
- [x] AC-2: The first turn on the new provider receives a bounded provider-neutral continuation,
  never attempts the old provider cursor, excludes reasoning/raw tool output, and clears the
  one-shot context after success.
- [x] AC-3: Running, awaiting-input, Task-leased, unavailable, failed-startup, and concurrent/racing
  switch paths fail safely while the original provider remains authoritative and usable.
- [x] AC-4: Focused and background desktop panes show the durable Session provider, lock the picker
  during unsafe states, and reset/repopulate provider-owned model, config, capability, goal, and
  context projections from Core events.
- [x] AC-5: Focused Core, plugin, rendered picker, renderer build, documentation, lifecycle, and
  worktree checks pass with actual evidence.
- [x] AC-6: An opt-in live canary starts with a durable user message and provider reply, then keeps
  that non-empty Session and recalls an unpredictable continuity key while switching across at
  least three locally authenticated real providers; every built-in named by the headless runner
  maps to its actual registry identity, and structured provider error data exposes an actionable
  cause without raw request metadata.

## Decision

The user's direct implementation request accepts Intent and Spec for local implementation and
verification. Provider switching is medium risk because it changes runtime ownership and durable
session identity, but it does not change workspace files or database schema. Merge, release,
deployment, production mutation, and automatic provider failover remain separate human Gates.
