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
  templates/change.md         compact Intent-to-feedback Artifact
  templates/incident.md       real operational event and recovery
  templates/eval.md           repeatable real-task or Incident regression
  changes/<date>-<slug>.md    one state record per material change
  incidents/<date>-<slug>.md  created only after a real Incident
  evals/<slug>.md             fixed regression cases with actual results
```

Use one compact change file by default. For a high-risk or cross-system change, keep the lifecycle
state in that file and link accepted ADRs, design documents, migration plans, test reports, and
release evidence from their existing authoritative locations. Do not create global parallel
`specs`, `plans`, `docs/superpowers`, or another lifecycle registry.

Historical change Artifacts remain auditable evidence. Superseding the workflow never permits
deleting unrelated product history merely to make a new template look uniform.

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

A PR containing changes outside its canonical change Artifact must include a changed Artifact in
`executing` or a later execution state. An Artifact-only proposal may remain `draft` or
`in-review`; this lets Intent be reviewed without falsely treating implementation as authorized.

## Intent, Spec, Plan, and Build

Intent proves the problem is worth solving and records affected users/systems, constraints, and
non-goals. Spec defines observable behavior, failure paths, interfaces, compatibility, rollout,
rollback, and checkable acceptance criteria without duplicating an accepted ADR or design.

Plan maps the smallest implementation steps to acceptance criteria, affected modules, validation,
risks, rollback, and required Gates. Build links implementation commits or PRs and records only
material deviations; it is not a work diary. Concurrent code revisions use separate worktrees and
must follow the desktop ownership rules in [`AGENTS.md`](../../AGENTS.md).

## Verification loop

Verification records actual commands, environment, results, runtime or visual evidence, failed
iterations, and residual risk. A failed attempt remains visible; correction returns the same change
to `executing`, then produces new evidence.

- Desktop UI changes require real rendered-window evidence for applicable light, dark, and narrow
  states. Compilation is not visual acceptance.
- Service, data, protocol, and release changes require the corresponding contract, integration,
  migration, request/response, log, package, or smoke evidence.
- `verified` and later states require every acceptance checkbox checked, `Verdict: verified`, and a
  concrete `Residual risk:` statement.
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

The versioned macOS workflow accepts only a named `ready-to-release` change. The checker also
requires release approval, target, rollback, complete verification, and residual risk before
packaging starts. The workflow then records the change id beside the DMG. `released` is written only
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
bun test script/check-sdlc.test.ts
bun script/check-sdlc.ts
```

CI additionally runs `bun script/check-sdlc.ts --base "$BASE_SHA"`. A versioned release runs
`bun script/check-sdlc.ts --release-change "$CHANGE_ID"`. The checker uses only Bun and Node
built-ins and validates required fields and sections, unique ids, legal states, local links,
acceptance closure, verification evidence, release readiness, Incident/Eval feedback links,
forbidden parallel sources, and the branch-diff Gate.

These checks validate the repository-controlled lifecycle. They do not claim external branch
protection, deployment success, production monitoring, or release smoke evidence that was not
actually observed.
