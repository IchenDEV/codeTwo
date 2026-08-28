# CodeTwo development lifecycle

This directory is the single machine- and human-readable state source for material repository
changes. Existing issues, ADRs, design documents, commits, pull requests, checks, releases, and
monitoring evidence remain authoritative for their own facts; the change artifact links them into
one lifecycle instead of copying them.

## Canonical locations

```text
docs/sdlc/
  workflow.md                  lifecycle and gate contract
  templates/change.md         compact Intent-to-Release artifact
  templates/incident.md       production or operational incident
  templates/eval.md           repeatable regression case
  changes/<date>-<slug>.md    authoritative state for a material change
  incidents/<date>-<slug>.md  created only for a real incident
  evals/<slug>.md             real-task or incident regression cases
```

Do not create a second specs/plans tree. `docs/superpowers` was retired when this contract was
introduced. Files under `docs/design`, `docs/adr`, GitHub issues, and PRs may provide Intent or Spec
evidence, but lifecycle status lives only in the canonical change artifact.

C2's product-level Scenes, Pipelines, task boards, and packs are application behavior and test
fixtures. They do not advance or replace this repository workflow.

## When a change artifact is required

A change artifact is required for every pull request that changes repository files. Keep a
low-risk or editorial change in one compact file; link a separate accepted design or ADR rather
than restating it.

A direct user instruction to implement counts as Intent approval when its source and constraints
are recorded. It does not grant permission to create a PR, merge, deploy, mutate production, or
perform other external actions.

## Lifecycle and legal transitions

```text
draft -> in-review -> accepted -> executing -> verified -> ready-to-release
      -> released -> closed
```

`blocked` and `superseded` may be entered from any non-final state. `failed` records a completed
verification attempt that did not meet acceptance; correction returns the same artifact to
`executing`, preserving the failed evidence in its Verification section.

| State | Required evidence | Next trigger |
|---|---|---|
| `draft` | problem, outcome, affected boundary | owner asks for review |
| `in-review` | testable acceptance and open decisions | owner accepts or blocks Intent/Spec |
| `accepted` | approval source and resolved blocking decisions | implementation starts |
| `executing` | linked Plan and owned implementation scope | observable verification runs |
| `failed` | actual failed command or symptom | correction is authorized |
| `verified` | actual result for every applicable criterion | human review accepts risk |
| `ready-to-release` | PR/review status, rollback and target environment | authorized release action |
| `released` | immutable version/build/environment and smoke evidence | observation window closes |
| `closed` | released outcome or explicit no-release disposition | new feedback or incident |

## Artifact chain

### Intent and Spec

Record the problem and source evidence before the proposed implementation. Acceptance criteria must
describe observable outcomes, including compatibility, failure, security, data, UX, and operations
only where applicable. An accepted ADR or design document can be linked as the Spec.

### Plan and Build

Map implementation steps to acceptance criteria, affected modules, tests, risks, and rollback. The
Plan is not a work diary. Use separate worktrees for concurrent revisions and follow `AGENTS.md`
for desktop process and data ownership.

### Verification

Run the narrow relevant checks first, then the broader checks proportional to risk. Record actual
commands and results. Desktop UI changes require real rendered-window evidence in the applicable
light, dark, and narrow states; successful compilation is not visual acceptance.

### Review and Release

The pull-request template is the review handoff. CI provides deterministic checks; a human accepts
product and release risk. Current repository automation is:

| Concern | Deterministic mechanism |
|---|---|
| Artifact contract and single-source rule | `.github/workflows/sdlc.yml` |
| Desktop policy, tests, renderer | `.github/workflows/desktop-design-system.yml` |
| Windows package and focused compatibility | `.github/workflows/windows-desktop.yml` |
| Documentation build and Pages deploy | `.github/workflows/pages.yml` |
| Nightly macOS package | `.github/workflows/nightly-macos.yml` |
| Versioned macOS release | `.github/workflows/release-macos.yml` |

The versioned release workflow must be dispatched from `main` with a canonical change id in
`ready-to-release` state. The checker blocks every other state. The workflow validates immutable
SemVer tags, writes the change id into the staged release files, and publishes an ad-hoc-signed
Apple Silicon DMG. It is not Developer ID signing, notarization, or proof of a public production
distribution. After observed smoke verification, update the change Artifact to `released` or
`closed` through a normal reviewed repository change.

### Maintain and Evals

Create an Incident artifact only from a real operational event. Separate facts from hypotheses,
record approvals and recovery evidence, then link a new change Intent and a regression Eval. Evals
must come from real tasks or incidents and define fixed input, allowed actions, observable
acceptance, and a repeatable result.

This repository currently has no repository-owned production monitoring integration that can
automatically open Incident artifacts. Detection-to-Agent triggering is therefore `blocked` until
a real monitoring source and authorization path exist; do not simulate it in documentation.

## Local checks

```sh
python3 -m unittest script/test_check_sdlc.py
python3 script/check_sdlc.py
```

On pull requests, CI also compares the branch with its base and rejects material repository changes
that do not add or update a canonical change artifact. GitHub branch-protection settings are
external to this repository; maintainers must require the `SDLC contract` check before it becomes
a merge-blocking Gate.
