---
id: 2026-09-21-custom-acp-agents
schema: 5
stage: plan
status: accepted
owner: codex
created: 2026-09-21
based_on: spec.md
scope: crates/core/src/provider_lifecycle.rs, crates/core/src/plugins/app/service.rs, crates/core/src/plugins/app/plugins/foundation.rs, apps/desktop/src/bridge.ts, apps/desktop/src/settings/ProviderSettings.tsx, apps/desktop/src/settings/SettingsPage.tsx, apps/desktop/src/i18n/strings.ts, apps/desktop/tests/providerSettingsRendered.test.tsx, website/guide/providers.md, website/zh/guide/providers.md, docs/sdlc/changes/2026-09-21-custom-acp-agents
---

# Plan: Custom ACP agents

## Plan

1. Extend `ProviderLifecycleManager` persistence and validation with custom definitions; append them to
   the existing registry and cover durable registration, editing, removal, invalid input, and secret
   non-persistence with focused Rust tests.
2. Project a `custom` discriminator through `ProviderSummary`, add register/remove provider commands,
   and keep all launches in the current Engine/ACP path.
3. Add typed desktop bridge calls and the smallest Settings UI: inline add form, existing runtime
   editor, existing enable switch, and confirmed remove action. Cover the interactions with the
   rendered Settings test.
4. Update English and Chinese provider guides with the actual flow and boundaries.

Checks by risk: run focused core provider lifecycle tests, affected desktop rendered tests, desktop
type/lint/build checks, docs/link validation, `git diff --check`, and
`bun script/verify/sdlc.ts --worktree`. Inspect the real rendered Providers page because this adds
interactive layout. Independent verification remains required before the high-risk record can pass.
No protocol-wire, database, package, or release check applies because the ACP implementation and
session schema are unchanged.

Temporary resources: a renderer-only local preview and its generated build output may be created for
visual inspection; stop the task-owned preview and remove task-only screenshots after inspection.
Standard ignored dependency/build caches may remain under their existing owners.

Rollback: revert the source/UI/docs changes. Existing schema-1 files remain readable because the new
custom collection is optional; reverting simply ignores that field. Removing one custom entry through
Settings deletes only its C2 launch definition, not sessions, credentials, or provider-owned files.
