# Your first session

This walks through composing and running a prompt in the desktop app.

## 1. Pick a provider and working directory

In the toolbar, choose a **provider** (e.g. Grok) and set the **working directory** — the folder the
agent runs in. A green dot next to a provider means its CLI is on your `PATH`.

Optionally tick **worktree** to run this session in an isolated git worktree. See [Git](/guide/git).

## 2. Compose your prompt as a document

The main pane is a document editor, not a chat box. Write your request in plain prose. Then type
`/` to open the **skill picker** and insert skills:

- `Skill: Code Reviewer` — a reviewer persona (a fragment).
- `Skill: Test Writer`, `Security Audit`, and anything you've installed from the
  [market](/guide/market).

Inserted skills appear as inline chips. You can combine several and interleave them with your own
text — the whole document is compiled into one prompt when you run it. Details:
[Document editor & skills](/guide/editor).

## 3. Run

Press **Run ▸** (or `Mod+Enter`). codeTwo:

1. Auto-checkpoints your workspace (a hidden git ref) so you can revert later.
2. Compiles the document — text + skill fragments + macro substitutions — into the prompt, and
   attaches any MCP servers from MCP skills.
3. Starts (or reuses) the session and streams the agent's work into the transcript below the editor.

## 4. Answer permission prompts

By default codeTwo is in **Ask** mode: when the agent wants to run a command or edit files, a
permission dialog appears. Allow or reject it. Switch to **Accept edits** or **YOLO** in the toolbar
to reduce prompts — see [Permissions & YOLO](/guide/permissions).

## 5. Review and ship

Open **Source Control** (toolbar or `Mod+Shift+G`) to:

- see changed files and a colored **diff**,
- **diff/revert** against any checkpoint,
- write a message and **Commit** / **Push**.

That's a full loop. Explore [Git & checkpoints](/guide/git), the
[command palette](/guide/keybindings), and [remote control](/guide/remote) next.
