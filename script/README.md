# Repository scripts

Use the directory that matches the job:

| Directory | Commands |
| --- | --- |
| [`dev/`](dev/) | Build and launch the local macOS desktop app |
| [`build/`](build/) | Build distributable Rust hosts and the tool broker |
| [`verify/`](verify/) | Check documentation and SDLC repository contracts |
| [`devflow`](devflow) | Create change bundles, record approvals, and run lifecycle helpers |

```bash
./script/devflow new <slug> [source] [risk]
./script/devflow validate --worktree
./script/dev/run.sh
./script/build/hosts.sh release
bun script/verify/docs.ts
bun script/verify/sdlc.ts --worktree
bun test script/verify/checks.test.ts
```

These are direct repository entry points. Add another script only when an existing command cannot
own the behavior without mixing unrelated concerns.
