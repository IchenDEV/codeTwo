# CodeTwo development lifecycle

This development Skill reference is the lifecycle authority. Read the section relevant to the current
change; ordinary edits need only affected-area rules, code, and tests. The [devflow CLI](../../../../script/devflow) and
[checker](../../../../script/verify/sdlc.ts) implement this contract.

## Plan

A user request, Issue, or confirmed Incident starts a change. Record the outcome, constraints,
owner, observable acceptance, and smallest plan in
`docs/sdlc/changes/<date>-<slug>/`, using four templates: [Intent](../templates/intent.md),
[Spec](../templates/spec.md), [Plan](../templates/plan.md), and [Verification](../templates/verification.md).
A mechanical follow-up may update its existing record with the new scope and evidence. Read-only
work needs no change record or repository checks.

One fact has one owner: the request owns intent; the repository record owns acceptance, scope,
status, and evidence references; ADRs own lasting architecture; Git owns implementation; GitHub
owns review and CI runs; a Release owns published identity. Link between them. CodeTwo does not
require Linear or a second tracker. Product Scenes, Pipelines, task boards, and packs never store
this repository's development state.

```sh
./script/devflow new fix-task-selection user medium
./script/devflow status
```

`new` creates all four draft/pending files together. Preparing a draft does not grant execution
permission. Each fact has one home:

| File | Owns |
| --- | --- |
| `intent.md` | Request, outcome, constraints, source, risk, and existing implementation authorization |
| `spec.md` | Design decisions, unique `AC-N` criteria, and additional high/critical design approval |
| `plan.md` | Exact scope, implementation ownership, risk-selected checks, and rollback |
| `verification.md` | One result per criterion, checked revision, verifier, residual risk, review and release |

Do not copy authorization fields into Spec or Plan. Their `accepted` state records readiness under
the Intent authorization, not a new permission request. Historical schema-3 stage bundles and
schema-4 single records remain valid and auditable; new work uses schema 5. Do not mix formats
inside one bundle, bulk rewrite history, or create a parallel specs/plans registry.

### Authorization and design

A direct implementation request authorizes its bounded local work. Record the named requester,
date, original decision or session quote, and constraints in Intent as `approved_by`, `approved_at`, and
`approval_source`. For low/medium work, the owner may elaborate the local design and plan within
that authorization without additional approval rounds. Material scope changes or unresolved
security, data, or major design decisions require the corresponding human decision.

High/critical Specs additionally require `design_approved_by`, `design_approved_at`, and
`design_approval_source`; both intent and design approvers must differ from the Intent and Plan
implementation owners. Reuse an existing explicit decision for the same pending scope; never invent approval or
infer it from silence. Names and dates are auditable claims, not authentication.

| Risk | Design and verification |
| --- | --- |
| Low | Local prose, copy, or isolated reversible change; concise acceptance and affected checks |
| Medium | Product behavior or shared implementation; design in the record, affected tests/types/build |
| High | Security, migrations, persistence/protocol boundaries, release controls, major architecture; independent design decision, integration/rollback proof and independent verification |
| Critical | Destructive operations, credentials, possible private-data exposure; high-risk requirements plus explicit authorization for each affected operation |

The Plan `scope` field lists exact repository paths or directory prefixes, comma-separated. No globs,
traversal, or root-wide scope. Changed paths, deletions, and both rename endpoints must be covered
by a record added or updated in the same diff. Historical approval alone cannot cover new work.

## Build

Proceed through implementation, relevant checks, inspection, fixes, and rechecks until the requested
outcome is demonstrated. Reversible local work and disposable tests require no stepwise approval.
Read existing owner code and consumers before introducing another abstraction. Preserve unrelated
worktree state. Use the [instance preflight](../../codetwo-operations/references/desktop-instances.md)
before launching Core; one data directory has one live owner.

Each file stores only its own stage status. Drafts may coexist; accepted stages require accepted
predecessors. Accept Intent after capturing the existing request, then complete and accept Spec and
Plan within that authorization. High/critical Spec acceptance additionally requires the recorded
independent design decision. No stage-specific approval command or repeated confirmation is needed.

Intent, Spec, and Plan use `draft`, `in-review`, `accepted`, or `rejected`. Verification uses:

| Status | Fact and next trigger |
| --- | --- |
| `pending` | Evidence is not collected yet; drafts may still be prepared |
| `in-progress` | Accepted Plan is being implemented or verified |
| `failed` | Actual FAIL evidence; correct and reverify |
| `blocked` | Missing decision, dependency, or evidence; `next_trigger` names what must change |
| `passed` | Every Spec AC checked and backed by current PASS evidence; human review next |

Rejected stages also name a concrete `next_trigger`. New relevant changes invalidate affected
acceptance/evidence: update the owning files and return Verification to `in-progress`, or `pending`
while a revised predecessor is being decided. Keep old results clearly labeled as prior evidence.
Merge, release, recovery, and no-release closure live in Verification's Review and release section,
after the actual events occur; `passed` alone only means verified work. Draft PRs may hold proposals
and honest failures.

## Test

Choose checks by the changed behavior. Reuse evidence for the same diff and environment; broaden
or repeat only after relevant changes, failures, or unresolved concerns.

| Affected area | Local evidence |
| --- | --- |
| Repository files | `bun script/verify/sdlc.ts --worktree` once before handoff; includes structure and scope |
| Documentation, linked assets, catalog | `bun script/verify/docs.ts` plus `git diff --check` |
| Authorization/routing rules, lifecycle behavior, template structure, or checkers | `bun test script/verify/checks.test.ts script/verify/four-stage.test.ts script/devflow.test.ts`; this is also the active lifecycle Eval |
| Rust | Affected crate tests and applicable format/check commands in its existing workflow |
| Desktop | Affected tests/types/build from `apps/desktop/package.json`; actual window rendering for layout/interaction |
| Security, data, protocol, packaging | Applicable contract, integration, migration, package, or runtime checks; recovery proof |
| Agent instructions | Behavior/routing changes use the relevant real-task Eval; pure wording edits use documentation and scope checks |

UI acceptance uses the actual rendered app in affected light/dark/narrow states. Compilation or a
fixture image does not prove product behavior. Lifecycle-only work does not start Core or rerun
unrelated renderer, Rust, or packaging suites.

Spec acceptance uses unique `AC-N` checkboxes. Verification maps each id to exactly one current result:

```text
- AC-1: PASS — `relevant-command` passed in the named environment.
Verdict: verified.
Residual risk: concrete unchecked boundary or remaining limitation.
```

`passed` requires checked criteria, PASS evidence citing a command or linked artifact, verifier,
date, mode, and `revision` (commit or explicitly described worktree baseline). High/critical
verification must be independent of the Intent and Plan implementation owners. Failed results retain every criterion mapping and
at least one FAIL; record prior attempts separately. Skips state their reason. New relevant changes
invalidate the affected evidence: return to `in-progress` and recheck before `passed`.

## Cleanup and handoff

Cleanup is part of every work cycle: development, verification, review fixes, packaging and
runtime diagnosis. Perform it before handing work back, including failed, blocked or cancelled
work; do not wait for merge or a later user reminder. Clean obsolete retries during long tasks
instead of accumulating another complete build/profile for every attempt.

In Plan, name the task-owned scratch/output roots and processes. Prefer ignored
`.codex/run/<change-id>/<worker-id>/` roots or the existing desktop profile directories; keep
different workers' ownership explicit. Use `finally`/exit handlers for disposable test fixtures
and short-lived children, plus a final inventory because crashes can bypass handlers.

At each handoff:

1. Inspect the exact task-owned paths, processes, ports and locks. For substantial output, measure
   disk use before and after. A stopped shell is not proof that all children have exited.
2. Stop only task-owned test processes through their owner/launcher, then verify exit and released
   ownership. Never kill another worker or the user's running app to make cleanup succeed.
3. Remove obsolete test bundles, dedicated Cargo/Swift/renderer outputs, temporary worktrees,
   sockets, downloads, failed probes and redundant logs that this task created. Remove temporary
   worktrees only after their source changes are safely handed off and Git confirms they are clean.
   Preview the exact
   candidates before removal. Validate path boundaries and ownership; do not use broad recursive
   deletion or remove a live lock inode. Do not erase shared toolchain/package caches by default.
4. Keep user data, credentials, source edits, input files and requested deliverables. Consolidate
   necessary evidence into a small task-owned directory. For any retained temporary resource,
   record its path, purpose, responsible owner and the next cleanup checkpoint or expiry. Check
   those retained items on the next continuation; "keep for later" is not a retention policy.
5. Record the result in Verification's `## Cleanup`. No temporary output still requires an explicit
   "none" with the inspection evidence; do not mark cleanup complete without checking.

Use `cleanup_status: pending | complete | blocked` in Verification only. `complete` means every
owned resource was removed or deliberately retained with accountable follow-up. It does not mean
all acceptance criteria passed. If safe cleanup is impossible, use `blocked`, state the specific
Blocker and Cleanup trigger, preserve the resource, and report it; cleanup never grants new
permission to delete user data, terminate unrelated processes or dispose of release deliverables.
The current implementation request authorizes ordinary cleanup of its own disposable artifacts;
no additional approval round is needed for that bounded cleanup.

The Cleanup section uses `Removed`, `Retained`, `Processes` and `Evidence` labels. Evidence cites
an actual inspection/cleanup command or linked report. `Retained: none` needs no retention fields;
otherwise add `Retention owner` and `Cleanup trigger`. Blocked cleanup also needs `Blocker`.

New templates include these fields. Unchanged historical records remain readable. Worktree and
branch checks require cleanup metadata on changed schema-5 bundles, and schema-5 Ready PR/release
checks require it even without a diff. Pending cleanup cannot accompany failed/blocked handoff;
passed verification requires complete cleanup. The checker validates declarations and evidence
references, not filesystem deletion; the agent must still inspect and clean actual resources.
Do not change a failed/blocked product verdict just because cleanup is complete. Re-run the
existing scope/documentation checks after cleanup without recreating unrelated build outputs.

## Review and release

Create/push a PR only when delivery includes it. Link each changed record from the
[PR template](../../../../.github/pull_request_template.md); do not copy the record's metadata into it.
Ready PRs require authorized scope and passing verification. The SDLC workflow runs the same
branch and metadata Gate when code, PR text, or draft status changes:

```sh
PR_BODY='Change: docs/sdlc/changes/<date>-<slug>/intent.md' PR_IS_DRAFT=false \
  PR_BASE_SHA=<base-sha> ./script/devflow check-pr
```

Without `PR_BASE_SHA`, this command checks linked records only. In GitHub Actions it reads body,
draft flag, and base SHA directly from the event JSON; PR text is never interpolated into a shell.

Review assesses acceptance, scope, changed behavior and failure paths, privacy, rendered UI where
applicable, simplicity, and evidence. Agent review does not grant merge approval. Merge, production,
destructive actions, messages, and long-running automation require their corresponding explicit
authorization; reuse authorization for the same unexecuted target, never infer it from status.

| Repository mechanism | What it proves |
| --- | --- |
| [SDLC contract](../../../../.github/workflows/sdlc.yml) | Record, scope, PR readiness, documentation, and Gate regressions |
| [Desktop design](../../../../.github/workflows/desktop-design-system.yml) | Configured desktop tests and renderer build |
| [Windows desktop](../../../../.github/workflows/windows-desktop.yml) | Configured compatibility and package checks |
| [Pages](../../../../.github/workflows/pages.yml) | Documentation site build/deployment when triggered |
| [Nightly macOS](../../../../.github/workflows/nightly-macos.yml) | Scheduled development package; not a versioned release approval |
| [Versioned macOS](../../../../.github/workflows/release-macos.yml) | Named change passes release preflight before packaging and publication |

The [release reference](../../codetwo-release/references/releasing.md) owns packaging operations.
The versioned release command remains `bun script/verify/sdlc.ts --release-change <id>`: passing
verification, concrete release target, explicit `Approval:` and `Rollback:` are required. Dispatch
only for the authorized revision; after publication link immutable identity and observed smoke
results. These metadata checks cannot authenticate the approver or prove remote success.

macOS packages are ad-hoc signed, not Apple-notarized. Branch protection, rulesets, and deployment
approvals are external settings: a checked-in workflow does not prove merge blocking is enabled.
Keep remote CI, human review, publication, and smoke results distinct from local verification.

## Maintain

Use the [operations Skill](../../codetwo-operations/SKILL.md) for diagnosis, recovery authorization,
Incident evidence, and follow-up creation. It owns the [Incident template](../../codetwo-operations/templates/incident.md).
Packaging and publication use the [release Skill](../../codetwo-release/SKILL.md).

[Evals](../../../../docs/sdlc/evals/ai-native-sdlc-gates.md) derive from real tasks, defects, or Incidents. Active Evals
need fixed inputs, allowed actions, an oracle, provenance, and actual Result/Revision. Run relevant
cases when instruction, Skill, Hook, prompt, or lifecycle changes affect authorization, routing,
behavior, template structure, or enforcement; pure wording edits need only documentation and scope checks. Deterministic contract tests
prove Gate behavior; they do not prove the model pauses less or selects Skills better. Behavioral
claims require actual task replay. The existing `.agent-learning/ai-native-sdlc` history remains
proposal-only; do not auto-edit external Skills or create new recurring work.

## Basis

Adapted to this repository from [Roleva PR #738](https://github.com/VecEcho/role-mono/pull/738),
the AI-native SDLC Skill, and the Astra scaffold audit Skill: one authoritative record,
risk-scaled evidence, fewer repeated approvals, and unchanged external-action boundaries.
