# Repository scripts

Use the directory that matches the job:

| Directory | Commands |
| --- | --- |
| [`dev/`](dev) | Build and launch the local macOS desktop app |
| [`build/`](build) | Build distributable Rust hosts and the tool broker |
| [`verify/`](verify) | Check documentation and SDLC repository contracts |
| [`devflow`](devflow) | Create single change records and run lifecycle Gates |

Build and launch instructions live in the [contributor guide](../.agents/skills/codetwo-develop/references/development.md).
Change-record commands and verification requirements live in the [workflow](../.agents/skills/codetwo-develop/references/workflow.md).
Packaging operations live in the [release guide](../.agents/skills/codetwo-release/references/releasing.md).

These are direct repository entry points. Add another script only when an existing command cannot
own the behavior without mixing unrelated concerns.
