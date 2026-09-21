---
id: 2026-09-21-custom-acp-agents
schema: 5
stage: verification
status: passed
owner: codex
created: 2026-09-21
based_on: plan.md
revision: b8d325b7e229cf637b154bcb49f8733837b8e580
verification_mode: fresh-context
verified_by: github-actions-35567792230
verified_at: "2026-09-21"
release_target: none
cleanup_status: complete
next_trigger: Merge the authorized PR after its Ready-state CI remains green.
---

# Verification: Custom ACP agents

## Verification

- AC-1: PASS — `custom_acp_agents_are_durable_editable_and_removable` proves registration,
  schema-1 reload, registry projection, editing, and removal. The rendered Settings test proves the
  form sends exact ID, name, executable, argument vector, and forwarded environment names.
- AC-2: PASS — The lifecycle test projects the definition as `ProviderId::Custom`, deliberately
  reports no native subagent support, and the unchanged provider service feeds enabled registry
  entries into the existing Engine. The ACP regression group passes full prompt-turn, model/config,
  and MCP-forwarding contracts. Missing executables remain unavailable through the existing status
  calculation.
- AC-3: PASS — `cargo test -p codetwo-core provider_lifecycle` rejects duplicates, built-in collisions, malformed IDs, absent
  names/commands, too many arguments, and environment `NAME=value` input. A failed edit leaves the
  previous configuration intact; persisted JSON contains an environment name but not its rejected
  value. Evidence: `cargo test -p codetwo-core provider_lifecycle`.
- AC-4: PASS — `bun test tests/providerSettingsRendered.test.tsx tests/providerRegistry.test.ts` covers durable edit/enable/remove behavior. The rendered Settings
  interaction verifies confirmation before remove; the operation touches only provider settings.
  Evidence: `bun test tests/providerSettingsRendered.test.tsx tests/providerRegistry.test.ts`.
- AC-5: PASS — `bun script/verify/docs.ts` confirms the English and Chinese guides document direct stdio launch, exact arguments,
  environment-name forwarding, permission/capability boundaries, deferred process start, and safe
  removal. Evidence: `bun script/verify/docs.ts` passed during owner verification.
- AC-6: PASS — Owner checks included `cargo test -p codetwo-core provider_lifecycle` (9 passed), ACP integration
  tests (9 passed); rendered provider tests (6 passed); `bunx tsc --noEmit`; `bun run lint`; and
  `bun run build:renderer` all passed. The build emitted only the existing large-chunk warning. The
  Providers page was inspected in the real renderer in dark and light themes at full and 760-pixel
  widths; the add form, labels, controls, and list remained readable without overlap. Independent
  GitHub Actions run [35567792230](https://github.com/IchenDEV/codeTwo/actions/runs/35567792230)
  passed SDLC, desktop lint/typecheck/tests/build, Rust workspace check, and Rust workspace tests for
  revision `b8d325b7e229cf637b154bcb49f8733837b8e580`.

Verdict: verified.
Owner behavior/UI evidence and independent full-repository CI pass for the implementation revision.

Residual risk: no third-party ACP executable was launched during this change, so a particular
Agent's handshake, authentication, and provider-specific behavior remain that Agent's integration
responsibility. Production deployment and release were not requested or claimed.

## Cleanup

Removed: The renderer-only preview was stopped. The generated `apps/desktop/dist` directory was
moved to the macOS Trash; no screenshots were retained.
Retained: Existing Cargo build output and `apps/desktop/node_modules` dependency cache.
Retention owner: Repository tooling and the local developer environment.
Cleanup trigger: Normal dependency/build-cache maintenance; no change-specific cleanup remains.
Processes: No task-owned process remains. An unrelated Vite process in another worktree was observed
and left untouched.
Evidence: Build completed before cleanup; `apps/desktop/dist` is absent; task preview process is
absent from the process list.

## Review and release

Approval: User authorized PR creation and merge after checks pass with `pr & merge` on 2026-09-21.
Delivery authorization: User explicitly requested `pr & merge` on 2026-09-21, authorizing commit,
push, PR creation, and merge for this change after the recorded gates pass.
Rollback: See plan.md.
Release: No release requested; merge and external actions require their own authorization.
Feedback: Link an Incident and regression Eval when a real failure occurs.
