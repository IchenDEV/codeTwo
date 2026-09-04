---
id: "2026-08-31-organize-change-docs"
stage: plan
schema: 3
status: accepted
owner: codex
created: 2026-08-31
based_on: spec.md
risk: medium
scope: docs, script/verify/sdlc.ts, script/verify/checks.test.ts, AGENTS.md, .github/pull_request_template.md, README.md
approved_by: "userthe current 2026-08-31 implementation request"
approved_at: "2026-08-31"
---

# Plan: Organize change bundles and project documentation

## Files and ownership

docs, script/verify/sdlc.ts, script/verify/checks.test.ts, AGENTS.md, .github/pull_request_template.md, README.md

## Order of work

1. Move every flat change file into a same-id directory as `change.md`, then repair relative links.
2. Update checker path discovery, id derivation, forbidden-flat-file enforcement, tests, workflow,
   root instructions, template guidance, and PR handoff.
3. Add the documentation index; remove the two explicitly superseded research inputs; repair live
   source links in retained research.
4. Run content/link inventories, lifecycle Evals, live worktree validation, and an isolated
   committed-diff dry-run.

Rollback is a repository revert that restores the flat files, prior checker path rules, and removed
research files from Git. No migration, generated asset, or external cleanup is required.

## Test-first proof

See legacy Verification section.

## Visual or integration proof

See legacy Verification section.

## Risks and mitigations

See legacy Decision and gates.

## Rollback

See legacy Review and release.

## Deviations

Fourteen existing flat Artifacts moved into same-id bundles. Eleven are exact `R100` moves; the
three whose relative links changed were also upgraded to schema 2 so edited historical records do
not bypass the stricter contract. The strict-SDLC and documentation-organization Artifacts were
created directly in bundle form. The checker now derives ids from bundle names, rejects flat files,
discovers `change.md`, and permits only unchanged legacy `R100` layout migrations without upgrade.

The rebase onto `origin/main` brought ten additional flat change records created by intervening
merged PRs. They were moved into the same bundle layout and upgraded to schema 2 while preserving
their status, approval, acceptance, verification, and residual-risk record. Two newly merged Feishu
research reports were placed directly in the research archive and added to its index.

[`docs/README.md`](../../../README.md) now separates current contracts, active designs, dated
research, assets, and development records. The root README routes through that map. The two
superseded 2026-08-06 t3code reports were deleted; the retained
[`expanded gap audit`](../../../archive/research/t3code-expanded-gap-audit-2026-08-07.md) records their
replacement and Git-history recovery boundary. Retained iCloud and t3code research links now point
to the Rust host and moved plugin module. [`scenes.md`](../../../reference/scenes.md) identifies 1.0 as the
implemented normative contract and links the accepted, pending 2.0 design. No product runtime,
website content, release automation, or external state changed.

## Decision

The current user request accepts this Intent and observable Spec. It authorizes in-repository moves,
document consolidation, deletion of proven superseded files, and applicable local validation. It
does not authorize commit, push, PR creation, merge, release, deployment, external settings, or
production mutation.

This is medium risk because it changes canonical paths and deletes documentation, but it does not
change application behavior or user data. The Gate is broken-link, content-preservation, checker,
and committed-diff verification before the change may become `verified`.
