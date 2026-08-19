# Issues & project scripts

## GitHub Issues

Command palette → **“GitHub issues”** lists the open issues for the repo in your working directory,
read through the authenticated `gh` CLI (so it reuses your existing login — C2 stores no token).

**Add to prompt** inserts the issue as a context block in your document:

```md
**github #42** — Fix login redirect loop (open)
https://github.com/you/repo/issues/42

Steps to reproduce…
```

That gives the agent the title, state, URL, and body without you copying anything.

## Linear

Linear works the same way through its GraphQL API, using a token you supply. Issues come back in the
same shape and insert the same way.

## Project scripts

Declare per-project commands in `.codetwo.json` and run them from the command palette:

```json
{
  "scripts": [
    { "id": "install", "name": "Install deps", "command": "bun install", "run_on_worktree_create": true },
    { "id": "test", "name": "Run tests", "command": "cargo test" }
  ]
}
```

- Every script shows up in the palette as **“Run script: …”**, with output appended to the transcript.
- Scripts marked `run_on_worktree_create` run automatically when a session creates a new
  [git worktree](/guide/git#worktree-isolation) — handy for installing dependencies or copying a
  `.env` into the fresh checkout.

This mirrors t3code's `t3.json`. A malformed config degrades to “no scripts” rather than breaking the
session.
