# CodeTwo AI-native development lifecycle

This file is the single lifecycle authority for material repository changes. It connects existing
facts without copying them: a user request or issue owns the request, ADRs and design documents own
accepted design decisions, tests and CI own check results, pull requests own review, releases own
published identity, and monitoring owns operational detection. The canonical change Artifact links
those facts and owns lifecycle status and the next trigger.

## Canonical Artifact locations

```text
docs/sdlc/
  workflow.md                  lifecycle, states, Gates, and actual commands
  development-workflow.md        operator guide for daily devflow use
  templates/intent.md            Intent stage template (schema 3)
  templates/spec.md              Spec stage template
  templates/plan.md              Plan stage template
  templates/verification.md      Verification stage template
  templates/incident.md          real operational event and recovery
  templates/eval.md              repeatable real-task or Incident regression
  changes/<date>-<slug>/         one bundle per material change
    intent.md                    problem, outcome, constraints (Intent Gate)
    spec.md                      requirements and AC-N acceptance criteria (Spec Gate)
    plan.md                      scope, order of work, rollback (Plan Gate)
    verification.md              evidence, verdict, release handoff
    evidence/                    optional runtime or visual evidence
  incidents/<date>-<slug>.md     created only after a real Incident
  evals/<slug>.md                fixed regression cases with actual results
```

Use four stage files inside each change bundle. This aligns with the adjacent doubao-work-skin
model: one directory per change, explicit Intent → Spec → Plan approval before implementation,
and Verification as a separate evidence record. Binary or runtime evidence may live in the
bundle's `evidence/` directory. Do not create global parallel `specs`, `plans`, `docs/superpowers`,
or another lifecycle registry. Legacy single-file `change.md` bundles are forbidden under schema 3.

Historical change Artifacts remain auditable evidence. Superseding the workflow never permits
deleting unrelated product history merely to make a new template look uniform.

Each stage file uses `schema: 3` and declares its `stage`. Bundle directory names match the
shared `id` field (`<yyyy-mm-dd-slug>`). Repository `scope` lives in `plan.md` frontmatter as a
comma-separated list of exact repository files or directory prefixes. Root-wide paths, traversal,
backslashes, and globs are rejected.

## Mandatory stage approval

Intent, Spec, and Plan are separate Gates. Each stage must reach `status: accepted` with concrete
`approved_by` and `approved_at` before the next stage may be created or edited for merge:

```text
intent.md accepted  →  create/accept spec.md
spec.md accepted    →  create/accept plan.md
plan.md accepted    →  implementation and verification.md
```

Pull requests with repository implementation changes require all three stages accepted in at least
one covering bundle. An Artifact-only proposal may keep later stages in `draft` until review
completes; this must not be treated as authorization to merge code outside an accepted Plan scope.

## End-to-end chain

```text
Request / Idea / Incident
  -> Intent -> Spec -> Plan -> Build -> Verification
  -> Review / Release -> Production / Operation
  -> Incident / Feedback -> new Intent + regression Eval
```

Every transition has an owner, input, output, observable acceptance, evidence, and `next_trigger`.
Failure, blocking, rejection, supersession, rollback, and no-release closure are explicit states.
An Artifact does not advance because an Agent says work is done.

## Change states and Gates

| State | Required fact | Gate or next trigger |
|---|---|---|
| `draft` | problem, desired outcome, source, owner candidate | owner requests review |
| `in-review` | testable acceptance and open decisions | named approver accepts, blocks, or rejects |
| `accepted` | Intent/Spec approval and resolved blocking decisions | implementation owner starts work |
| `executing` | Plan mapped to criteria, affected scope, tests, risks, rollback | observable verification runs |
| `failed` | actual failed symptom or command retained in Verification | correction is authorized |
| `blocked` | concrete missing decision, authority, dependency, or evidence | blocker changes |
| `verified` | every criterion checked, actual evidence, verdict, residual risk | human review accepts risk |
| `ready-to-release` | verification, release approval, target, and rollback | authorized release action |
| `released` | immutable identity, environment, and smoke evidence | observation window closes |
| `closed` | released outcome or explicit no-release disposition | new feedback or Incident |
| `superseded` | replacement Artifact and rationale | replacement governs |

A direct user implementation request may approve Intent when its source and constraints are
recorded. It does not authorize PR creation, merge, release, deployment, production mutation,
messages, or long-running automation. Security, data migration, major design, merge, and production
release remain human Gates unless separately authorized.

A PR containing changes outside its canonical bundle must include a schema-3 bundle whose
`intent.md`, `spec.md`, and `plan.md` are all `accepted`. Every changed path must fall under the
explicit `scope` in that bundle's `plan.md`. An Artifact-only proposal may keep later stages in
`draft` until review completes. Legacy `change.md` files are rejected; migrate with
`bun script/sdlc/migrate-bundles.ts` when splitting historical records.

## Intent, Spec, Plan, and Build

Intent proves the problem is worth solving and records affected users/systems, constraints, and
non-goals. Spec defines observable behavior, failure paths, interfaces, compatibility, rollout,
rollback, and checkable acceptance criteria without duplicating an accepted ADR or design.

Plan maps the smallest implementation steps to acceptance criteria, affected modules, validation,
risks, rollback, and required Gates. Build links implementation commits or PRs and records only
material deviations; it is not a work diary. Concurrent code revisions use separate worktrees and
must follow the desktop ownership rules in [`AGENTS.md`](../../AGENTS.md).

Schema-3 acceptance criteria live in `spec.md` and use stable, unique `AC-N` identifiers. Risk must
be `low`, `medium`, `high`, or `critical`. High and critical changes require Intent and Spec
approvers other than the implementation owner; their final verifier must also be independent. This deterministic identity
check supports human judgment but does not prove that a name corresponds to a real approval.

## Verification loop

Verification records actual commands, environment, results, runtime or visual evidence, failed
iterations, and residual risk. A failed attempt remains visible; correction returns the same change
to `executing`, then produces new evidence.

- Desktop UI changes require real rendered-window evidence for applicable light, dark, and narrow
  states. Compilation is not visual acceptance.
- Service, data, protocol, and release changes require the corresponding contract, integration,
  migration, request/response, log, package, or smoke evidence.
- `verification.md` with `status: passed` requires every acceptance checkbox checked, exactly one
  `PASS` evidence mapping per `AC-N`, a named verifier and date, `Verdict: verified`, and a concrete
  `Residual risk:` statement. Each mapping cites a command or linked artifact.
- Failed verification retains every criterion mapping and at least one concrete `FAIL` result.
- Skipped checks state why they are not applicable or what blocks them.

## Review and release

The pull-request template is the human review handoff. CI provides deterministic evidence; it does
not accept product or release risk. The live repository mechanisms are:

| Concern | Repository mechanism |
|---|---|
| Artifact shape, readiness, and feedback Gates | [`.github/workflows/sdlc.yml`](../../.github/workflows/sdlc.yml) |
| Desktop design, tests, and renderer build | [`.github/workflows/desktop-design-system.yml`](../../.github/workflows/desktop-design-system.yml) |
| Windows packaging and focused compatibility | [`.github/workflows/windows-desktop.yml`](../../.github/workflows/windows-desktop.yml) |
| Documentation build and Pages deployment | [`.github/workflows/pages.yml`](../../.github/workflows/pages.yml) |
| Nightly macOS package | [`.github/workflows/nightly-macos.yml`](../../.github/workflows/nightly-macos.yml) |
| Versioned macOS release | [`.github/workflows/release-macos.yml`](../../.github/workflows/release-macos.yml) |

The versioned macOS workflow accepts only a named bundle whose `verification.md` is `passed`. The
checker also requires release approval, target, rollback, complete verification, and residual risk
before packaging starts. The workflow then records the change id beside the DMG. `released` is written only
after an immutable tag/build/environment and observed smoke result exist.

The macOS package is ad-hoc signed and not Apple-notarized. A GitHub Release is not proof of public
production adoption. GitHub branch-protection configuration is external to this repository; the
workflow exists, but maintainers must separately require the `SDLC contract` check for a guaranteed
merge-blocking Gate.

## Operation, Incidents, and feedback

Detection thresholds belong to deterministic monitoring. An Agent may diagnose after a trigger and
act only along an already authorized path. A confirmed Incident records detection, impact,
timeline, facts versus hypotheses, authorization, mitigation, recovery evidence, a follow-up change,
and a regression Eval. `resolved` or `closed` is rejected unless those links exist or a concrete
`Blocked:` reason explains why one cannot be created.

CodeTwo currently has no repository-owned production monitoring integration that automatically
opens Incident Artifacts. Detection-to-Agent triggering is `blocked` until a real source, threshold,
destination, and authorization path exist. Do not simulate an Incident or claim monitoring exists.

## Continuous Evals

Evals come from real tasks, defects, or Incidents. They fix input and environment, allowed actions,
observable acceptance, evidence, scoring, and failure classes. `active`, `failed`, or `retired`
Evals require linked provenance plus `Result:` and `Revision:` in the last result.

Run relevant Evals whenever project instructions, Skills, Hooks, prompts, models, Harness settings,
or lifecycle enforcement changes. Do not manufacture cases for a target count, and do not delete an
Incident Eval merely because its fixture is difficult; repair its isolation or scoring instead.

## Deterministic checks

Run from the repository root:

```sh
./script/devflow new <slug> [source] [risk]
./script/devflow approve <change-id> <intent|spec|plan> <approver>
./script/devflow design <change-id>
./script/devflow plan <change-id>
./script/devflow verify <change-id>
./script/devflow validate [--worktree]
bun test script/verify/checks.test.ts
bun script/verify/docs.ts
bun script/verify/sdlc.ts
bun script/verify/sdlc.ts --worktree
```

[`development-workflow.md`](development-workflow.md) is the operator guide for daily use.
[`references/artifact-contracts.md`](references/artifact-contracts.md) maps generic AI-native SDLC
contracts onto schema-3 stage files. Install the external [`sdlc-skill`](https://github.com/IchenDEV/sdlc-skill)
`ai-native-sdlc` skill for Bootstrap, audit, and incident-to-improvement modes; the repository
checker remains the enforcement source.

The documentation check enforces `docs/catalog.json`, archive boundaries, local links, schema-3
stage history, and asset ownership. The plain lifecycle check validates the full Artifact tree.
`--worktree` additionally applies the Gate to
staged, unstaged, and untracked files before handoff. CI runs
`bun script/verify/sdlc.ts --base "$BASE_SHA"` against committed PR differences. A versioned release
runs `bun script/verify/sdlc.ts --release-change "$CHANGE_ID"`. The checker uses only Bun and Node
built-ins and validates required fields and sections, unique ids, legal states, local links, risk,
explicit changed-path scope, acceptance-to-evidence mapping, verification identity, release
readiness, Incident/Eval feedback links, forbidden parallel sources, and branch/worktree Gates.

These checks validate the repository-controlled lifecycle. They do not claim external branch
protection, deployment success, production monitoring, or release smoke evidence that was not
actually observed.

## Operating metrics

Review monthly using Git and GitHub timestamps rather than self-reported estimates:

- time from change creation to Intent/Spec approval;
- time from approval to `verified`;
- first-pass CI rate and implementation-to-merge time;
- review cycles per PR and material Plan deviations;
- escaped defects, time to containment, and time until a permanent Eval exists;
- lifecycle or agent-rule regressions caught before merge.

When a metric worsens, change the smallest responsible policy, check, template, or devflow command,
then add or extend an Eval. Do not add a new process layer without a recurring failure that
justifies it.
