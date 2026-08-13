# Git, checkpoints & worktrees

Code2 treats git as a first-class safety net and review surface. It shells out to the `git` CLI.

## Quick-view status

The side dock's **Git** tab shows the current branch, ahead/behind counts, and changed files (with a
staged/unstaged badge and a one-letter status: **M**odified, **A**dded, **D**eleted, **R**enamed,
untracked). Refresh with the **Refresh** button or `Mod+G`. It refreshes automatically when you
switch sessions.

The status bar along the bottom of the window always shows the branch and a change count, so you can
see you have uncommitted work without opening anything.

## Checkpoints (per-turn snapshots)

Before **every** prompt turn, Code2 auto-checkpoints your entire working tree — including untracked
files — into a hidden git ref (`refs/codetwo/checkpoints/…`). It does this without disturbing your
index (it uses a throwaway `GIT_INDEX_FILE`), so your staged changes are untouched.

Checkpoints give you a per-turn undo: if a turn makes a mess, revert to the checkpoint from just
before it.

## Source Control

Open **Source Control** from the dock's **Review & commit** button, the command palette, or
`Mod+Shift+G`:

- **Staged changes / Changes** — use the `+` / `−` controls to move literal files into or out of the
  index. A partially staged file appears in both sections, and renames update both paths together.
  Click a row to review only its staged or unstaged patch; **All changes** combines both scopes.
- **Diff viewer** — unified diff with added/removed/hunk coloring. Preview commands disable external
  diff and text-conversion helpers and enforce byte, file-count, stderr, and time limits. A truncated
  result is labelled as partial rather than displayed as a complete patch.
- **Checkpoints** — "Checkpoint now" to snapshot on demand; per checkpoint, **diff** (working tree vs
  that snapshot) and **revert** (restore tracked files to it).
- **Hosted remote** — reports the selected push remote, detected provider, and credential-free host.
  The change-request action uses provider-native wording (**PR**, **MR**, or **change request**) and
  shows why it is unavailable instead of sending an unsupported remote to the wrong provider CLI.
- **Commit / Push / Create PR** — write a message (or hit **Suggest** for a Conventional-Commits
  message derived from the staged files). **Commit staged** commits only the index; **Stage all** is
  a separate explicit action. **Push** remains an independent Git operation using the branch's
  upstream. Change-request creation is currently enabled only for a detected GitHub remote when the
  `gh` CLI is on `PATH`; it pushes the branch, invokes `gh`, and returns a focusable URL that opens in
  the system browser. Each initiating control shows its in-progress phase, while a failed commit
  does not clear the message or reset the index, so you can inspect and retry.

## Worktree isolation

When creating a session, the worktree picker makes both isolation and its exact baseline explicit:

- **No worktree** — run in the selected project checkout.
- **Current checkout** — resolve the selected checkout's local `HEAD` commit. The picker shows its
  symbolic branch when attached, or `HEAD` when detached, plus the short SHA.
- **Local origin default** — read the local symbolic `refs/remotes/origin/HEAD`, resolve its target
  to a commit already present on this machine, and show that target ref plus the short SHA.

Code2 never runs `fetch` while listing or creating these choices. It never guesses `main` or
`master`, and it never falls back from the requested baseline to another commit. A missing
`refs/remotes/origin/HEAD`, a dangling symbolic target, or a target that is not a commit makes
**Local origin default** unavailable with the Git error visible. A valid-but-stale local
origin-tracking ref remains visibly local and resolves to its existing SHA; Code2 does not imply
that it matches the network remote.

For either enabled baseline, Code2 runs the session in an isolated `git worktree` (a separate
checkout + branch sharing the repo's `.git`), so parallel sessions don't step on each other. It
creates `codetwo/<session-id>` from the resolved immutable SHA and persists the baseline kind,
actual ref, full SHA, and display label with the session. Later UI therefore reports what created
the checkout instead of re-resolving a moving ref. New clients send that previewed full SHA back on
Run; if the chosen ref moved between preview and submission, creation stops before mutating Git.

The checkout root is a persistent sibling under `.codetwo-worktrees/`. If the selected project is
a repository subdirectory, Code2 preserves that relative path in the isolated checkout, keeps the
session grouped under the original project, and runs project hooks marked
`run_on_worktree_create` from that corresponding subdirectory before announcing the session.

Code2 also records the repository's common Git directory and the exact per-worktree Git directory.
Resume validates those identities, the registry path, branch, baseline commit, and selected
subdirectory before starting a provider. This prevents a different checkout copied or swapped into
the same pathname from being accepted as the original worktree. Sessions created before these
identity fields existed remain visible as **Legacy**, use a narrower path/registry check, and do not
claim a baseline identity that was never recorded.

If creation fails after Git has made the checkout, Code2 deliberately retains the checkout path,
Git worktree registration, and branch and reports them for manual cleanup. Supported filesystems
and Git provide no atomic compare-identity-and-rename/remove primitive, so an automatic path-based
cleanup could move or delete a directory installed concurrently by another process. If the directory
identity already changed, Code2 likewise leaves the replacement untouched and reports the failure
instead of recursively deleting by pathname.

## Discarding worktrees

Automatic deletion never happens; permanent cleanup is an explicit, confirmed action. A session's
**Discard worktree** removes its isolated checkout (including uncommitted changes), drops the Git
registration, and deletes its `codetwo/<session-id>` branch. The session itself stays as readable
history — its transcript remains, but it can no longer run prompts and reports that its worktree
was discarded.

Discard applies the same fail-closed receipts that gate running a provider in the checkout, and a
few more:

- It refuses while the session is running or awaiting input.
- It refuses when the recorded directory identity no longer matches — a directory swapped onto the
  same pathname is never removed.
- It only ever deletes branches inside the `codetwo/` namespace, only at their observed SHA, and
  only while no other checkout still uses them.
- If the checkout was already deleted externally, discard still prunes the stale registration and
  removes the leftover branch, so nothing accumulates.

The project's worktree management list shows every checkout associated with the repository:
session-owned checkouts (active or archived), **orphaned** registrations on `codetwo/` branches
that no session claims (for example after a deleted database), and **stale** directories left in
`.codetwo-worktrees/` that Git no longer registers. Orphans and stale directories can be cleaned up
from there; a checkout that a session still records is refused and must be discarded from that
session, so the two flows can never race each other.

::: warning Notes & limits
- `revert` restores **tracked** files to the checkpoint; it doesn't delete files created after it.
- `diff since checkpoint` shows tracked changes; brand-new untracked files won't appear in that diff
  (they do show in the status panel).
- Diff previews are deliberately bounded. If a repository exceeds a preview limit, review the
  labelled partial result in smaller file scopes or use Git directly before committing.
- **Push** uses the branch's configured upstream — set one first if you haven't.
- Detecting `gh` checks executable availability, not authentication. Authentication and provider
  errors remain visible runtime failures, and do not disable the separate **Push** action.
- Archiving or quitting does not delete a worktree: either action is reversible and the checkout may
  contain uncommitted work. Permanent removal only happens through the explicit discard flow above.
- Baseline resolution uses local refs only. If a selected choice later becomes unavailable, Code2
  reports that state and refuses creation instead of silently substituting **Current checkout**.
:::
