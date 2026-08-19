# Permissions & YOLO

When an ACP agent sends a permission request for a command or file operation, C2 decides how to
respond from the session's **permission mode**, tool scope, and any rules. This is permission
mediation, not an operating-system sandbox: a provider process that performs work without sending an
ACP permission request is outside this guard. Use a disposable checkout, container, VM, or provider
sandbox when the provider itself is not trusted.

## Modes

Set the mode in the config popover — the provider chip at the bottom of the composer reads
`provider · mode` and opens it — or cycle it with `Mod+Shift+P`:

| Mode | Behavior |
| --- | --- |
| **Ask** | Prompt for anything not explicitly allowed. The default. |
| **Accept edits** | Auto-approve provider-classified edit/delete/move requests; still ask for the rest. |
| **YOLO** | Auto-approve every request that the independent tool scope permits. |

## Tool scope — a second, independent axis

The permission mode decides *when C2 asks*; the **tool scope** is a fail-closed ceiling over the
ACP tool kinds C2 is willing to approve. The wire field remains named `sandbox` for compatibility.
Pick it in the config popover; the composer's chip turns amber on **Danger full access**:

| Tool scope | Effect on ACP permission requests |
| --- | --- |
| **Read-only** | Only standardized read/search/fetch/think kinds may continue; mutations and unknown or missing kinds are rejected. |
| **Workspace write** | Standardized tool kinds may continue to rules and the approval mode; unknown or missing kinds are rejected. The default. |
| **Danger full access** | Unknown kinds may also continue to rules and the approval mode. |

The scope is checked **first and wins**: Read-only rejects a reported edit even in YOLO mode, and
Workspace write never lets an unclassified request become an automatic approval. It does not prove
that a reported path is inside the workspace, intercept provider syscalls, or contain shell commands.

That distinction is why C2 does not describe this control as physical containment.

C2 persists the two choices as one execution policy. A new session sends the complete policy with
its creation request, so the first turn uses that pair. Later changes carry a request id; the core
publishes an authoritative policy event only after the durable row and live permission handler both
advance. Persistence failure emits a correlated error and leaves the old pair active. Reopening,
reviving, switching clients, or receiving a concurrent update therefore converges on the core's pair.
Older session databases migrate to their existing approval mode plus **Workspace write**, rather than
inventing full access.

## The permission prompt

In Ask mode, a modal appears with the tool's summary and the agent's offered options (e.g. *Allow* /
*Reject*). The turn stays paused until you answer — C2 parks the request and resumes the moment
you decide.

## How decisions are made

The engine resolves each request as `(action ∈ ask | allow | deny) × (tool + input pattern)`:

1. The tool scope rejects kinds it does not permit.
2. Explicit rules are checked — a matching **deny** always wins.
3. Otherwise the mode's default applies (YOLO → allow; Accept-edits → allow for edits; else ask).

## YOLO safely

::: danger
**YOLO auto-approves every request admitted by the selected tool scope**, including reported shell
commands. A Git worktree protects branch organization, not the rest of your filesystem. For untrusted
automation, use a throwaway checkout plus real process/filesystem isolation supplied by the provider,
container, VM, or operating system.
:::
