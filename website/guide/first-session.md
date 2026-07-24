# Your first session

This walks through composing and running a prompt in the desktop app.

## 1. Pick a provider and working directory

Click either **status chip** along the bottom of the composer — they read the sandbox (`Workspace
write`) and the provider and approval mode (`Grok · Ask first`). Both open the same popover, which
holds everything you set once per session: **provider**, **working directory**, approvals, sandbox,
worktree isolation, and plan mode. A green dot next to a provider means its CLI is on your `PATH`.

Optionally tick **Isolate in a git worktree** to run this session on a fresh branch and checkout.
See [Git](/guide/git).

## 2. Compose your prompt as a document

The composer sits at the foot of the transcript, where a chat box would be — but it *is* a document
editor, not a text field. Write your request in plain prose. Then type `/` to open the **skill
picker** and insert skills:

- `Skill: Code Reviewer` — a reviewer persona (a fragment).
- `Skill: Test Writer`, `Security Audit`, and anything you've installed from the
  [market](/guide/market).

Inserted skills appear as inline chips. You can combine several and interleave them with your own
text — the whole document is compiled into one prompt when you run it. Details:
[Document editor & skills](/guide/editor).

The composer grows as you write. Drag its top edge for more room, or press `Mod+Shift+E` (the ⤢
button) to hand the document the **whole column** for a longer brief — headings, lists, code blocks
and all. Sending collapses it again so you can watch the answer.

## 3. Run

Press the **send** button (or `Mod+Enter`). codeTwo:

1. Auto-checkpoints your workspace (a hidden git ref) so you can revert later.
2. Compiles the document — text + skill fragments + macro substitutions — into the prompt, and
   attaches any MCP servers from MCP skills.
3. Starts (or reuses) the session and streams the agent's work into the transcript above the
   composer.

Each prompt becomes one **turn** in the transcript: your prompt, the agent's answer, and — collapsed
underneath — its **tools**, **thinking**, and **plan**. Expand a disclosure when you want the detail;
otherwise the answer is the only thing at full weight. A badge shows `running`, the stop reason, and
how long the turn took.

## 4. Answer permission prompts

By default codeTwo is in **Ask** mode: when the agent wants to run a command or edit files, a
permission dialog appears. Allow or reject it. Switch to **Accept edits** or **YOLO** in the config
popover to reduce prompts — see [Permissions & YOLO](/guide/permissions).

## 5. Review and ship

Open the side dock's **Git** tab (or `Mod+Shift+G` for the full Source Control dialog) to:

- see changed files and a colored **diff**,
- **diff/revert** against any checkpoint,
- write a message and **Commit** / **Push**.

That's a full loop. Explore [Git & checkpoints](/guide/git), the
[command palette](/guide/keybindings), and [remote control](/guide/remote) next.
