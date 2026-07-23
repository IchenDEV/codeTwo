# Permissions & YOLO

When an agent wants to run a command or edit files, ACP asks the client for permission. codeTwo
decides how to respond based on the session's **permission mode** and any rules.

## Modes

Set the mode in the toolbar (or cycle it with `Mod+Shift+P`):

| Mode | Behavior |
| --- | --- |
| **Ask** | Prompt for anything not explicitly allowed. The default. |
| **Accept edits** | Auto-approve edit-class tools (edit/delete/move) in the working dir; still ask for the rest. |
| **YOLO** | Bypass everything — auto-approve all requests. |

## The permission prompt

In Ask mode, a modal appears with the tool's summary and the agent's offered options (e.g. *Allow* /
*Reject*). The turn stays paused until you answer — codeTwo parks the request and resumes the moment
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
