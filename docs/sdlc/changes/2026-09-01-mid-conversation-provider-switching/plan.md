---
id: "2026-09-01-mid-conversation-provider-switching"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-09-01
based_on: spec.md
risk: medium
scope: crates/core/src/engine.rs, crates/core/src/error.rs, crates/core/src/event.rs, crates/core/src/session.rs, crates/core/src/store.rs, crates/core/examples/exec.rs, crates/core/examples/live_demo.rs, crates/core/tests/engine_provider_switch.rs, crates/plugins/src/app/plugins/engine.rs, crates/tui/src/app.rs, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/config.ts, apps/desktop/tests/providerModelTransition.test.ts, apps/desktop/tests/sceneChip.test.tsx, docs/sdlc/changes/2026-09-01-mid-conversation-provider-switching
approved_by: "[user]"
approved_at: "2026-09-01"
---

# Plan: Continue one conversation across providers

## Files and ownership

crates/core/src/engine.rs, crates/core/src/error.rs, crates/core/src/event.rs, crates/core/src/session.rs, crates/core/src/store.rs, crates/core/examples/exec.rs, crates/core/examples/live_demo.rs, crates/core/tests/engine_provider_switch.rs, crates/plugins/src/app/plugins/engine.rs, crates/tui/src/app.rs, apps/desktop/src/App.tsx, apps/desktop/src/bridge.ts, apps/desktop/src/i18n/strings.ts, apps/desktop/src/session/Composer.tsx, apps/desktop/src/session/config.ts, apps/desktop/tests/providerModelTransition.test.ts, apps/desktop/tests/sceneChip.test.tsx, docs/sdlc/changes/2026-09-01-mid-conversation-provider-switching

## Order of work

1. Add a durable compare-and-set provider transition and a bounded provider-neutral continuation
   projection.
2. Initialize a replacement ACP runtime before commit, serialize switches against turn starts,
   fence detached callbacks, and retain the original runtime on every pre-commit failure.
3. Expose the switch command and authoritative event, then reconcile Composer and per-pane state.
4. Exercise successful continuation, unsafe-state rejection, failed candidate rollback, stale
   callback fencing, rendered picker locking, and repository Gates.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Core now owns a serialized provider-switch transition. It starts and initializes a detached target
runtime, verifies the original runtime generation again, fences old callbacks, compare-and-sets
only the provider-owned durable fields, installs the replacement, and terminates the old process.
Prompt claims and queued plugin prompts reject while that transition owns the Session.

The one-shot continuation contains at most 48 Ki characters of canonical user messages,
assistant-visible text, plans, and tool title/status. It is newest-preserving, labels truncation,
never transfers the old ACP cursor, reasoning, tool inputs, or tool outputs, and places the current
user request after the historical context. Failed target startup, initialization, persistence, or
races reactivate the original callback fence and leave the original runtime authoritative.

Desktop and TUI consumers now reconcile the authoritative provider event. Desktop pane-local
configuration reads each durable Session provider, disables the picker while a turn or switch is
active, and clears provider-owned model/config/capability/goal/context projections before Core
repopulates them. Canvas retries remain in the same conversation after a successful switch.

After merging current `origin/main`, the desktop retains its unified provider/model picker instead
of restoring the old standalone ProviderPicker. Selecting another provider for an active Session
now invokes the in-place Core switch with the selected model; selecting one for an unsent draft
updates only draft state. The obsolete helper and test that created a fresh Session for a foreign
provider were removed, and busy or switching Sessions lock the complete unified picker.

The opt-in live canary drives the same Engine against locally authenticated real CLIs with an
in-memory Store and supports per-provider model selection. It writes a runtime-random continuity
key in the first user turn, asserts that both the user prompt and streamed provider reply are
durable before every switch, and requires each later provider to recover the key without receiving
it in the current prompt. Headless `exec` now maps its advertised Amp and Droid names to their
built-in registry identities. ACP error display extracts bounded provider-supplied `detail` text
from structured error data while omitting raw request metadata, so Droid's quota boundary is
actionable instead of collapsing to a generic internal error.

## Decision

The user's direct implementation request accepts Intent and Spec for local implementation and
verification. Provider switching is medium risk because it changes runtime ownership and durable
session identity, but it does not change workspace files or database schema. Merge, release,
deployment, production mutation, and automatic provider failover remain separate human Gates.
