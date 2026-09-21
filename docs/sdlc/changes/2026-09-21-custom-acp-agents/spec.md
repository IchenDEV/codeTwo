---
id: 2026-09-21-custom-acp-agents
schema: 5
stage: spec
status: accepted
owner: codex
created: 2026-09-21
based_on: intent.md
design_approved_by: chenli
design_approved_at: 2026-09-21
design_approval_source: 'Direct request: "支持 用户自由配置 支持ACP 的Agent".'
---

# Spec: Custom ACP agents

## Design

Extend the existing provider lifecycle state with an ordered collection of custom Agent definitions.
Each definition owns its ID, display name, executable, argument vector, and forwarded environment
variable names. Loading validates the same bounds as writes, rejects built-in collisions and duplicate
IDs, and fails closed by omitting invalid definitions. Built-in runtime overrides remain unchanged.

`prepare_registry` appends valid custom definitions as `ProviderId::Custom` launch specs before the
existing `ProviderService` and Engine consume the registry. This preserves one engine and one ACP
stdio implementation. Custom Agents report no built-in models or native subagent support, expose no
automatic install/upgrade action, and are available only when their executable resolves.

The provider command surface adds explicit register and remove operations. Configure and enable
continue through the existing operations. Registration/removal persist atomically, then reload the
provider plugin so every new session and picker sees one coherent registry. Settings exposes a small
inline form and a remove action only for custom entries. Removal requires user confirmation and does
not delete provider-owned files, credentials, or past C2 sessions.

This design expands local process-launch authority only at the user's explicit registration action.
It does not use a shell, store environment values, auto-run on registration, alter ACP permission
mediation, or authorize external actions.

## Acceptance criteria

- [x] AC-1: A valid custom ACP Agent can be added in Settings with ID, name, command, arguments, and
      forwarded environment names; it survives manager reload and appears in the provider registry.
- [x] AC-2: The custom Agent is selectable for a new session and uses the existing ACP engine path;
      missing commands are shown as unavailable and no capability or native-subagent support is
      invented.
- [x] AC-3: Duplicate/built-in/invalid IDs, missing names or commands, unsafe environment names, and
      oversized inputs fail without corrupting the previous durable configuration; environment values
      are never persisted or returned.
- [x] AC-4: A custom Agent can be edited, enabled/disabled, and removed from Settings; removal is
      confirmed, affects future registry loads, and preserves historical sessions and external files.
- [x] AC-5: English and Chinese provider guidance describes the Settings flow and its local-command,
      credentials, permission, and ACP-compatibility boundaries.
- [x] AC-6: Affected Rust contracts, rendered Settings interactions, type/lint/build checks,
      documentation checks, and the repository SDLC check pass; actual Settings UI is inspected.
