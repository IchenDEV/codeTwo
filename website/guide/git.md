# Git, checkpoints & worktrees

codeTwo treats git as a first-class safety net and review surface. It shells out to the `git` CLI.

## Quick-view status

The side dock's **Git** tab shows the current branch, ahead/behind counts, and changed files (with a
staged/unstaged badge and a one-letter status: **M**odified, **A**dded, **D**eleted, **R**enamed,
untracked). Refresh with the **Refresh** button or `Mod+G`. It refreshes automatically when you
switch sessions.

The status bar along the bottom of the window always shows the branch and a change count, so you can
see you have uncommitted work without opening anything.

## Checkpoints (per-turn snapshots)

Before **every** prompt turn, codeTwo auto-checkpoints your entire working tree — including untracked
files — into a hidden git ref (`refs/codetwo/checkpoints/…`). It does this without disturbing your
index (it uses a throwaway `GIT_INDEX_FILE`), so your staged changes are untouched.

Checkpoints give you a per-turn undo: if a turn makes a mess, revert to the checkpoint from just
before it.

## Source Control

Open **Source Control** from the dock's **Review & commit** button, the command palette, or
`Mod+Shift+G`:

- **Changed files** — click a file to see its diff; "All changes" shows the full working-tree diff
  against `HEAD`.
- **Diff viewer** — unified diff with added/removed/hunk coloring.
- **Checkpoints** — "Checkpoint now" to snapshot on demand; per checkpoint, **diff** (working tree vs
  that snapshot) and **revert** (restore tracked files to it).
- **Commit / Push / Create PR** — write a message (or hit **Suggest** for a Conventional-Commits
  message derived from the actual changed files), **Commit** stages everything and commits, **Push**
  pushes to the branch's upstream, and **Create PR** pushes the branch and opens a pull request via
  `gh`.

## Worktree isolation

When creating a session you can enable **worktree** mode. codeTwo runs the session in an isolated
`git worktree` (a separate checkout + branch sharing the repo's `.git`), so parallel sessions don't
step on each other. The session's working directory becomes the worktree path.

::: warning Notes & limits
- `revert` restores **tracked** files to the checkpoint; it doesn't delete files created after it.
- `diff since checkpoint` shows tracked changes; brand-new untracked files won't appear in that diff
  (they do show in the status panel).
- **Push** uses the branch's configured upstream — set one first if you haven't.
:::
