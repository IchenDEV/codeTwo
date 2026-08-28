---
id: eval-legacy-workflow-single-source
kind: eval
status: active
owner: repository maintainers
created: 2026-08-29
updated: 2026-08-29
next_trigger: any development-lifecycle or repository-workflow change
---

# Reject a second lifecycle source

## Provenance

This Eval comes from the 2026-08-29 user request to remove old lifecycle material and prevent two
systems from conflicting. The concrete legacy source was `docs/superpowers/specs` plus
`docs/superpowers/plans`.

## Fixed input and environment

Run `python3 -m unittest script/test_check_sdlc.py` and `python3 script/check_sdlc.py` from a C2
checkout with Python 3 standard library support. Unit fixtures use isolated temporary Git
repositories and do not touch C2 runtime data.

## Allowed actions

The Eval reads the checkout and creates only temporary-directory fixtures. It must not modify the
working tree, invoke providers, start C2, access production, or perform GitHub mutations.

## Observable acceptance

- The live repository passes with one `docs/sdlc` source and unique valid Artifact ids.
- A fixture containing `docs/superpowers` fails with a legacy-path error.
- A fixture with duplicate Artifact ids or missing required sections fails.
- A material PR diff without a changed file under `docs/sdlc/changes` fails.
- Adding a valid changed Artifact makes the same PR-diff fixture pass.
- A versioned release rejects missing or non-`ready-to-release` change ids and accepts the named
  ready Artifact.

## Scoring and failure classes

All assertions are deterministic. Any false pass is a contract regression; a false failure is a
checker compatibility defect. Environment or Git setup failure is reported separately.

## Last result

Passed locally on 2026-08-29 at the current checkout. Seven unit tests accepted the canonical
source and rejected the legacy tree, duplicate ids, missing sections, pending verified evidence,
invalid release state, and a material Git diff without a changed change Artifact; the same Git
fixture passed after its canonical Artifact changed. The live repository then returned
`[sdlc] contract valid`. GitHub run
[`33198244379`](https://github.com/IchenDEV/codeTwo/actions/runs/33198244379) repeated the checker,
repository validation, and base-diff Gate successfully for PR #178.
