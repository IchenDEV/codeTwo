# CodeTwo development lifecycle

This development Skill reference is the lifecycle authority. Read the section relevant to the current
change; ordinary edits need only affected-area rules, code, and tests. The [devflow CLI](../../../../script/devflow) and
[checker](../../../../script/verify/sdlc.ts) implement this contract.

## Plan

A user request, Issue, or confirmed Incident starts a change. Record the outcome, constraints,
owner, observable acceptance, and smallest plan in
`docs/sdlc/changes/<date>-<slug>/change.md`, using the [single-file template](../templates/change.md).
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

`new` creates one draft containing Intent, Acceptance criteria, Plan, Verification, and Review and
release. Edit it directly. Do not create a file or run an approval command for every phase.
Historical schema-3 stage bundles remain valid and auditable; new work uses schema 4. Do not mix
formats inside one bundle, bulk rewrite history, or create a parallel specs/plans registry.

### Authorization and design

A direct implementation request authorizes its bounded local work. Record the named requester,
date, original decision or session quote, and constraints as `approved_by`, `approved_at`, and
`approval_source`. For low/medium work, the owner may elaborate the local design and plan within
that authorization without additional approval rounds. Material scope changes or unresolved
security, data, or major design decisions require the corresponding human decision.

High/critical records additionally require `design_approved_by`, `design_approved_at`, and
`design_approval_source`; both intent and design approvers must differ from the implementation
owner. Reuse an existing explicit decision for the same pending scope; never invent approval or
infer it from silence. Names and dates are auditable claims, not authentication.

| Risk | Design and verification |
| --- | --- |
| Low | Local prose, copy, or isolated reversible change; concise acceptance and affected checks |
| Medium | Product behavior or shared implementation; design in the record, affected tests/types/build |
| High | Security, migrations, persistence/protocol boundaries, release controls, major architecture; independent design decision, integration/rollback proof and independent verification |
| Critical | Destructive operations, credentials, possible private-data exposure; high-risk requirements plus explicit authorization for each affected operation |

The `scope` field lists exact repository paths or directory prefixes, comma-separated. No globs,
traversal, or root-wide scope. Changed paths, deletions, and both rename endpoints must be covered
by a record added or updated in the same diff. Historical approval alone cannot cover new work.

## Build

Proceed through implementation, relevant checks, inspection, fixes, and rechecks until the requested
outcome is demonstrated. Reversible local work and disposable tests require no stepwise approval.
Read existing owner code and consumers before introducing another abstraction. Preserve unrelated
worktree state. Use the [instance preflight](../../codetwo-operations/references/desktop-instances.md)
before launching Core; one data directory has one live owner.

Status is stored once:

| Status | Fact and next trigger |
| --- | --- |
| `draft` | Proposal; resolve acceptance and authorization before implementation |
| `accepted` | Authorized scope and design ready; start implementation |
| `in-progress` | Authorized implementation or verification running; inspect results and fix |
| `failed` | Actual FAIL evidence; correct and reverify |
| `blocked` | Missing decision, dependency, or evidence; `next_trigger` names what must change |
| `passed` | Every AC checked and backed by current PASS evidence; human review next |
| `rejected` / `superseded` | Record the decision and successor in `next_trigger`; do not execute |

Use `next_trigger` to identify the next owner/action or blocker. Merge, release, recovery, and
no-release closure are recorded with links in Review and release, after the real events occur;
`passed` alone only means verified work. Draft PRs may hold proposals and honest failures.

## Test

Choose checks by the changed behavior. Reuse evidence for the same diff and environment; broaden
or repeat only after relevant changes, failures, or unresolved concerns.

| Affected area | Local evidence |
| --- | --- |
| Repository files | `bun script/verify/sdlc.ts --worktree` once before handoff; includes structure and scope |
| Documentation, linked assets, catalog | `bun script/verify/docs.ts` plus `git diff --check` |
| Authorization/routing rules, lifecycle behavior, template structure, or checkers | `bun test script/verify/checks.test.ts script/devflow.test.ts`; this is also the active lifecycle Eval |
| Rust | Affected crate tests and applicable format/check commands in its existing workflow |
| Desktop | Affected tests/types/build from `apps/desktop/package.json`; actual window rendering for layout/interaction |
| Security, data, protocol, packaging | Applicable contract, integration, migration, package, or runtime checks; recovery proof |
| Agent instructions | Behavior/routing changes use the relevant real-task Eval; pure wording edits use documentation and scope checks |

UI acceptance uses the actual rendered app in affected light/dark/narrow states. Compilation or a
fixture image does not prove product behavior. Lifecycle-only work does not start Core or rerun
unrelated renderer, Rust, or packaging suites.

Acceptance uses unique `AC-N` checkboxes. Verification maps each id to exactly one current result:

```text
- AC-1: PASS — `relevant-command` passed in the named environment.
Verdict: verified.
Residual risk: concrete unchecked boundary or remaining limitation.
```

`passed` requires checked criteria, PASS evidence citing a command or linked artifact, verifier,
date, mode, and `revision` (commit or explicitly described worktree baseline). High/critical
verification must be independent of the owner. Failed results retain every criterion mapping and
at least one FAIL; record prior attempts separately. Skips state their reason. New relevant changes
invalidate the affected evidence: return to `in-progress` and recheck before `passed`.

## Review and release

Create/push a PR only when delivery includes it. Link each changed record from the
[PR template](../../../../.github/pull_request_template.md); do not copy the record's metadata into it.
Ready PRs require authorized scope and passing verification. The SDLC workflow runs the same
branch and metadata Gate when code, PR text, or draft status changes:

```sh
PR_BODY='Change: docs/sdlc/changes/<date>-<slug>/change.md' PR_IS_DRAFT=false \
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
