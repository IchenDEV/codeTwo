---
id: 2026-09-08-simplify-sdlc
schema: 4
status: passed
owner: Codex
created: 2026-09-08
source: chenli current task; Roleva PR 738 and the two supplied Skills
risk: medium
scope: AGENTS.md, .github/pull_request_template.md, .github/workflows/sdlc.yml, docs/README.md, docs/catalog.json, docs/sdlc/workflow.md, docs/sdlc/development-workflow.md, docs/sdlc/references/artifact-contracts.md, docs/sdlc/templates/change.md, docs/sdlc/evals/ai-native-sdlc-gates.md, script/README.md, script/devflow.ts, script/devflow.test.ts, script/verify/sdlc.ts, script/verify/stage-bundle.ts, script/verify/docs.ts, script/verify/checks.test.ts, script/sdlc/migrate-bundles.ts
approved_by: chenli
approved_at: 2026-09-08
approval_source: Current task explicitly requests “参考这些重做这个项目的SDLC” with Roleva PR 738 and the Astra audit and AI-native SDLC Skills; bounded local redesign and verification are authorized.
next_trigger: chenli reviews the locally verified repository change; PR and release actions require their own authorization.
revision: worktree based on 28de80fc160fac1351d55a85651c36a91db40e72
verification_mode: owner
verified_by: Codex
verified_at: 2026-09-08
release_target: none
---

# Simplify CodeTwo's development lifecycle

## Intent

Replace repeated stage paperwork and local approval rounds with one authoritative change record,
while retaining observable acceptance, changed-path scope, high-risk decisions, release approval,
and Incident-to-Eval traceability. Local implementation and PR delivery are authorized by chenli’s follow-up “pr”. Merge,
production operations, releases, and external messages remain outside that authorization.

[Roleva PR #738](https://github.com/VecEcho/role-mono/pull/738) was observed merged at
`53b51b42be7433076e053769b68873c088716db4`. Apply its consolidation and risk-based verification
principles within CodeTwo's existing directories. No Linear integration, global Skill installation,
runtime change, signing change, or bulk history migration is needed.

## Acceptance criteria

- [x] AC-1: A change runs from draft through authorized work, failed verification, correction, and Ready review in one file; historical stage records still validate.
- [x] AC-2: Missing authorization, uncovered edits/deletions/renames, unverified Ready PRs, missing independent high-risk design/verification, and missing release approval are blocked.
- [x] AC-3: CI uses one lifecycle pass per event, checks PR edits and draft transitions, and exercises devflow; PR text stays data.
- [x] AC-4: One workflow owns guidance, old links resolve, history stays intact, and Core launch safety rules remain unchanged.
- [x] AC-5: Incident creation produces one linked follow-up; recovery and regression-Eval Gates remain checked in disposable fixtures.

## Plan

Use schema 4 for new records and reuse existing acceptance, scope, verifier, and release checks
through section views. Keep schema-3 history. Replace stage-creation and approval commands with
one editable record. Consolidate duplicate operator/format pages, retaining link pointers. Connect
Ready PR validation to CI. Remove the obsolete migration script, which would treat new records as
legacy input and delete them.

The Astra audit identified these instruction conflicts:

| File and former instruction | Applied decision | Authority impact |
| --- | --- | --- |
| `AGENTS.md`: “Implementation requires accepted Intent, Spec, and Plan” | One request authorization covers bounded local design and implementation. | Deliberately removes redundant low/medium local approvals; high-risk and external-action Gates remain. |
| `development-workflow.md`: “Intent/Spec/Plan 必须依次批准后才能实现与合并” | Remove the separate three-round recipe; use the workflow. | No merge authorization inferred. |
| `references/artifact-contracts.md`: Low required “四 stage 文件” | One record by default; retain historical formats. | No acceptance or evidence waived. |
| `sdlc.yml`: plain validation followed by `--base` validation | One event-specific pass, plus the previously disconnected Ready Gate. | Strengthens review readiness; no platform setting changed. |

Run the affected Bun contract/CLI suites, documentation/worktree Gates, and inspect CI and
instruction routing. Contract tests prove enforcement, not model behavior or fewer Astra pauses.
No runtime build or UI launch is warranted by this tooling-only change.

## Verification

- AC-1: PASS — `npx --yes --package=bun@1.3.10 bun test script/verify/checks.test.ts script/devflow.test.ts` passed 14 tests and 111 assertions, including one-file request-to-Ready dry-run and legacy compatibility.
- AC-2: PASS — The same `bun test script/verify/checks.test.ts script/devflow.test.ts` run rejected missing request/design approval, owner-only high-risk verification, missing release approval, stale scope, and uncovered deletion/rename paths.
- AC-3: PASS — The same `bun test script/devflow.test.ts` coverage exercised GitHub event input, missing base SHA, all changed record links, Draft/Ready transitions, and shell-like PR text without execution. Inspection of [the workflow at the verified revision](https://github.com/IchenDEV/codeTwo/blob/c6daaf25453b3111614e9b8d121ea991779d7025/.github/workflows/sdlc.yml) confirms metadata/draft events and one lifecycle branch per event; remote Actions was not run.
- AC-4: PASS — `bun script/verify/docs.ts`, `bun script/verify/sdlc.ts --worktree`, and `git diff --check` passed. Core launch requirements are preserved in the [instance reference](../../../../.agents/skills/codetwo-operations/references/desktop-instances.md), as checked by the subsequent [documentation cleanup](../2026-09-08-organize-documentation/change.md); `git diff --name-only -- docs/sdlc/changes` showed no tracked history edits.
- AC-5: PASS — `bun test script/devflow.test.ts` created one Incident-linked follow-up in an isolated repository; `bun test script/verify/checks.test.ts` retained recovery and regression-Eval rejection cases in the same 14-test run.

Verdict: verified.
Residual risk: Local contract enforcement and the CI configuration were verified; no remote CI,
merge, release, or production smoke was run. GitHub merge protection and monitor-to-Incident
integration remain unconnected. Deterministic fixtures do not measure Astra behavior. The
[active Eval](../../evals/ai-native-sdlc-gates.md) records the actual runtime and coverage.

## Review and release

Approval: pending.
Rollback: Revert this scoped repository diff; historical records and runtime data are unchanged.
PR delivery: chenli authorized commit, branch push, and PR creation with “pr”; remote results belong to the PR.
Release: none requested; merge and publication remain unauthorized.
Platform evidence: On 2026-09-08, `gh api repos/IchenDEV/codeTwo/branches/main/protection` returned
HTTP 404 “Branch not protected”; `gh api repos/IchenDEV/codeTwo/rulesets` returned an empty list.
The file changes do not enable external merge protection.
Operation: Production monitor-to-Incident automation remains unconnected; no recurring job was created.
Feedback: Extend the existing [lifecycle Eval](../../evals/ai-native-sdlc-gates.md) for these regressions.
