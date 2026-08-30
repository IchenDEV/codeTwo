# CodeTwo documentation

Status: **current documentation map**.

The top level is organized by purpose. Start with the directory that matches the question:

| Directory | Contains |
| --- | --- |
| [`reference/`](reference/README.md) | Current architecture, runtime contracts, standards, and technical guides |
| [`design/`](design/README.md) | Current design system plus accepted future product designs |
| [`adr/`](adr/0001-scenes-v2-dynamic-task-orchestration.md) | Accepted architecture decisions |
| [`screenshots/`](screenshots/README.md) | Images used by the README and published documentation |
| [`sdlc/`](sdlc/workflow.md) | Development workflow, change records, templates, and Evals |
| [`archive/`](archive/README.md) | Historical research, completed plans, and old visual evidence |

The public user guide lives under [`../website`](../website/). Archived material is non-normative
and never overrides a current document in `reference/` or `design/`.

Every file under `docs/` must match exactly one rule in [`catalog.json`](catalog.json). Run
`bun script/verify/docs.ts` to reject unclassified files, legacy change records, broken local links,
dated research outside the archive, or images without an owning document.
