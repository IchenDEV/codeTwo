---
id: 2026-09-21-custom-acp-agents
schema: 5
stage: intent
status: accepted
owner: codex
created: 2026-09-21
source: user
risk: high
approved_by: chenli
approved_at: 2026-09-21
approval_source: 'Direct request: "支持 用户自由配置 支持ACP 的Agent".'
next_trigger: Implement and independently verify the accepted design.
---

# Intent: Custom ACP agents

## Intent

C2 already models unknown provider IDs as `ProviderId::Custom` and can run an overridden command for
each built-in provider, but `provider-settings.json` discards unknown IDs and Settings cannot add or
remove one. The public provider guide therefore promises support that users cannot actually
configure.

Outcome: Settings lets a user register, edit, enable, select, and remove a local Agent command that
speaks ACP over stdio. Custom Agents use the existing provider registry, ACP client, session,
permission, transcript, and tool-broker paths; their durable configuration has one owner in the
existing provider settings file.

Constraints: registration requires a stable ID, display name, executable, optional one-argument-per-
line launch arguments, and names of host environment variables to forward. Forwarded environment
values never enter the durable configuration or return to the renderer. IDs cannot collide with
built-ins. A configured command is user-authorized local process execution but gains no extra ACP
permission, native-subagent, MCP, filesystem, deployment, or external-write authority.

Non-goals: remote ACP transports, shell command strings, automatic installation/upgrades for custom
Agents, per-project Agent definitions, capability claims that the Agent did not negotiate, or any new
ACP dialect.
