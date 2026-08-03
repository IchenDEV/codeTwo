# Permissions & YOLO

When an agent wants to run a command or edit files, ACP asks the client for permission. Code2
decides how to respond based on the session's **permission mode** and any rules.

## Modes

Set the mode in the config popover — the provider chip at the bottom of the composer reads
`provider · mode` and opens it — or cycle it with `Mod+Shift+P`:

| Mode | Behavior |
| --- | --- |
| **Ask** | Prompt for anything not explicitly allowed. The default. |
| **Accept edits** | Auto-approve edit-class tools (edit/delete/move) in the working dir; still ask for the rest. |
| **YOLO** | Bypass everything — auto-approve all requests. |

## Sandbox — a second, independent axis

The permission mode decides *who approves*; the **sandbox** decides *what's possible at all*. Pick it
in the config popover, next to the approval mode — the composer's left-hand chip shows the current
one, and turns amber on **Danger full access**:

| Sandbox | Effect |
| --- | --- |
| **Read-only** | No mutations. Edits, deletes, moves, and commands are denied outright. |
| **Workspace write** | Edits in the workspace are permitted; commands still follow the approval mode. The default. |
| **Danger full access** | No sandbox restrictions (approvals still apply unless the mode bypasses them). |

The sandbox is checked **first and wins**: a read-only sandbox denies a file edit *even in YOLO mode*.
That combination — auto-approve everything, but physically can't mutate — is a genuinely useful way to
let an agent explore a repo fast without any risk.

This mirrors Codex's approval-policy × sandbox split.

## The permission prompt

In Ask mode, a modal appears with the tool's summary and the agent's offered options (e.g. *Allow* /
*Reject*). The turn stays paused until you answer — Code2 parks the request and resumes the moment
you decide.

## How decisions are made

The engine resolves each request as `(action ∈ ask | allow | deny) × (tool + input pattern)`:

1. Explicit rules are checked first — a matching **deny** always wins.
2. Otherwise the mode's default applies (YOLO → allow; Accept-edits → allow for edits; else ask).

## YOLO safely

::: danger
**YOLO auto-approves everything**, including shell commands. Only use it when the session is
isolated — for example in a [git worktree](/guide/git#worktree-isolation) or a throwaway checkout —
so a mistake can't touch anything you care about.
:::
