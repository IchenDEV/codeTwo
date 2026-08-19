# Your first session

This walks through composing and running a prompt in the desktop app.

## 1. Pick a provider and working directory

Use the individual chips along the bottom of the composer to choose the **provider**, access mode,
plan mode, and worktree baseline. A green dot next to a provider means its CLI is on your `PATH`.

The worktree chip is an explicit three-way choice:

- **No worktree** runs in the selected project checkout.
- **Current checkout** creates an isolated branch from the local commit at `HEAD`.
- **Local origin default** creates it from the commit targeted by the local symbolic
  `refs/remotes/origin/HEAD`.

Each available baseline shows the ref and short SHA that will be used. C2 never fetches, guesses
`main` / `master`, or silently falls back to another choice; a missing, dangling, or locally stale
origin ref is shown as that local fact. The created session remembers the actual ref and full SHA.
When you press Run, C2 pins creation to the full SHA from the settled preview and fails closed if
that local ref moved meanwhile. A newly opened draft therefore does not create a branch or checkout
until its first Run succeeds.
See [Git](/guide/git).

## 2. Compose your prompt as a document

A new session opens as a **full page** with the caret in it — it *is* a document editor, not a text
field. Write your request in plain prose. Then type `/` to open the **skill picker** and insert
skills:

- `Skill: Code Reviewer` — a reviewer persona (a fragment).
- `Skill: Test Writer`, `Security Audit`, and anything you've installed from the
  [market](/guide/market).

Inserted skills appear as inline chips. You can combine several and interleave them with your own
text — the whole document is compiled into one prompt when you run it. Details:
[Document editor & skills](/guide/editor).

Because this is a document, `Enter` starts a new paragraph — send with `Mod+Enter` (the composer
says so while the document is empty). Sending collapses the page into a composer docked under the
transcript; `Mod+Shift+E` (the ⤢ button) takes you back to the full page whenever a brief needs the
room, and the draft survives either way.

Once the session exists, a **model chip** appears beside the provider if the agent reports models.
See [Models](/guide/providers#models).

Use `Mod+Shift+F` at any point to search text across the current workspace. The search supports
case-sensitive, whole-word, and regular-expression modes. Results show the workspace-relative
path and exact line/column; choosing one opens that file in the side dock's Monaco editor and puts
the caret on the match. Searches are time/output/result bounded, skip generated and oversized
content, and say when the returned set is incomplete. Starting a newer query or closing the dialog
cancels and reaps the previous `rg` process.

## 3. Run

Press the **send** button (or `Mod+Enter`). C2:

1. Auto-checkpoints your workspace (a hidden git ref) so you can revert later.
2. Compiles the document — text + skill fragments + macro substitutions — into the prompt, and
   attaches any MCP servers from MCP skills.
3. Starts (or reuses) the session and streams the agent's work into the transcript above the
   composer.

Each prompt becomes one **turn** in the transcript: your prompt, the agent's answer, and — collapsed
underneath — its **tools**, **thinking**, and **plan**. When the provider exposes structured
delegation tool calls, an **Agents** disclosure separates spawned agents and workflows into a
compact status roster with their role and task. This is capability-detected: providers that do not
emit that ACP metadata keep the ordinary tool view. A badge shows `running`, the stop reason, and
how long the turn took.

The first transcript load contains at most the latest 20 complete user turns. Use **Load earlier**
to page backward without splitting a turn; one request can never exceed 50 user turns. Referencing
another conversation with `@chat` uses the same latest-20-turn window and an additional hard limit
of 16,000 Unicode scalar values, with an omission marker when older context was left out.

In the session rail, pin an active chat to keep it above the recency-sorted list. Archiving a chat
also removes its pin; restoring it returns it to the ordinary active list until you pin it again.
The rail also reflects the core-owned **Running**, **Awaiting Input**, and **Failed** states. Their
revisioned snapshot survives a renderer reload and stays consistent across Desktop, TUI, and remote
clients. If C2 itself restarts during a running or waiting turn, the unrecoverable task becomes
**Failed (interrupted)** instead of leaving a stale permission control behind.

## 4. Answer permission prompts

By default C2 is in **Ask** mode: when the agent wants to run a command or edit files, a
permission dialog appears. Allow or reject it. Switch to **Accept edits** or **YOLO** in the config
popover to reduce prompts — see [Permissions & YOLO](/guide/permissions).

An unanswered request remains visible as **Awaiting Input** after a renderer reload. Answering it
from any connected client updates the others; duplicate, wrong-session, and invalid-option answers
are ignored by the core.

## 5. Review and ship

Open the side dock's **Git** tab (or `Mod+Shift+G` for the full Source Control dialog) to:

- see changed files and a colored **diff**,
- **diff/revert** against any checkpoint,
- write a message and **Commit** / **Push**.

That's a full loop. Explore [Git & checkpoints](/guide/git), the
[command palette](/guide/keybindings), and [remote control](/guide/remote) next.
