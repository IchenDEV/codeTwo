# Op / Event protocol

Every frontend talks to the core through two JSON-serializable types: **Op** (submissions in) and
**Event** (events out). This is the contract the desktop bridge, the TUI, and the remote server all
use.

## Ops (client → core)

Tagged by `op`:

| Op | Fields | Purpose |
| --- | --- | --- |
| `new_session` | `provider`, `cwd`, `use_worktree`; optional `worktree_base`, `worktree_base_sha`, `initial_policy`, `request_id` | create a session; `worktree_base` is `current` or `origin_default`, `worktree_base_sha` pins the picker preview, `initial_policy` makes both execution-policy axes effective on the first turn, and `request_id` correlates the broadcast result with its initiating client |
| `prompt` | `session`, `doc`; optional `request_id` | submit a document as a prompt turn; `request_id` correlates acceptance or rejection |
| `cancel` | `session` | interrupt the current turn |
| `answer_permission` | `session`, `request_id`, `option_id` | answer a permission request (`option_id: null` = cancel) |
| `set_execution_policy` | `session`, `mode`, `sandbox`; optional `request_id` | atomically persist and apply both execution-policy axes; correlate the authoritative outcome |
| `set_permission_mode` | `session`, `mode` | `ask` / `accept_edits` / `yolo` |
| `set_sandbox` | `session`, `sandbox` | legacy single-axis ACP tool-kind ceiling; this is permission mediation, not OS containment |
| `set_model` | `session`, `model` | set the session model |
| `set_config_option` | `session`, `config_id`, `value` | set an agent-reported session config option |

`provider` is one of `claude_code`, `codex`, `grok`, `cursor`, `opencode`, `opencode2`, `pi`, `kimi`,
`zcode`, or `{"custom":"…"}`.
`doc` is an array of blocks: `{"type":"text","text":"…"}` or
`{"type":"skill","skill_id":"…","params":{}}`.

### Example

```json
{ "op": "new_session", "provider": "grok", "cwd": ".", "use_worktree": false, "initial_policy": { "mode": "ask", "sandbox": "workspace_write" }, "request_id": "client-uuid" }
{ "op": "new_session", "provider": "codex", "cwd": ".", "use_worktree": true, "worktree_base": "origin_default", "worktree_base_sha": "0123456789abcdef0123456789abcdef01234567", "request_id": "client-uuid-2" }
{ "op": "set_execution_policy", "session": "…", "mode": "accept_edits", "sandbox": "workspace_write", "request_id": "client-policy-uuid" }
{ "op": "prompt", "session": "…", "request_id": "client-prompt-uuid", "doc": [
    { "type": "skill", "skill_id": "reviewer", "params": {} },
    { "type": "text", "text": "Refactor the login handler." }
] }
```

`use_worktree: false` is the explicit **Off** state. With `use_worktree: true`, an omitted
`worktree_base` remains backward-compatible and means `current`; new clients should send their
explicit choice. `current` resolves the selected checkout's local `HEAD`. `origin_default` resolves
only the local symbolic ref `refs/remotes/origin/HEAD`. Resolution never fetches, guesses `main` or
`master`, or falls back to a different baseline. A missing or dangling origin ref therefore rejects
that choice; a locally stale but valid ref remains selectable and is not refreshed implicitly.
New picker clients also send the full `worktree_base_sha` they displayed. The core resolves the
selected local ref again immediately before mutation and rejects the request if it moved, so a
preview cannot silently turn into a checkout from another commit. Older clients may omit the field
and retain click-time resolution.

`initial_policy` is optional for older clients; omission uses the core default. New clients send
the entire pair so session creation, persistence, and the first provider turn share one policy.
`set_execution_policy` is the canonical update. The older single-axis `set_permission_mode` and
`set_sandbox` operations remain wire-compatible, but each is folded into an atomic two-axis write
using the session's other current axis. New clients include `request_id` and wait for the matching
`execution_policy_changed` event; successful submission to a transport is not proof that the
durable/live update committed.

Successful worktree sessions include the immutable baseline actually used in their session
snapshot, for example:

```json
{
  "worktree_baseline": {
    "kind": "origin_default",
    "ref": "refs/remotes/origin/main",
    "sha": "0123456789abcdef0123456789abcdef01234567",
    "display": "origin/main @ 01234567"
  }
}
```

This persisted `ref` + full `sha` is provenance, not a request to resolve the moving ref again.
Baseline pickers surface unavailable reasons and the locally resolved value as-is; they do not
silently replace a missing, dangling, or stale selection.

## Events (core → client)

Tagged by `event`:

| Event | Fields |
| --- | --- |
| `session_created` | `session`, `cwd`; optional `project_path`, `worktree_path`, `worktree_baseline`, and `request_id` echoed from `new_session` |
| `session_title_changed` | `session`, `title` |
| `session_activity_changed` | `session`, revisioned `activity` snapshot |
| `turn_started` | `session`; optional `request_id` echoed from `prompt`; optional `transcript_seq` |
| `agent_text` | `session`, `message_id`, `text`; optional `transcript_seq` |
| `agent_thought` | `session`, `text`; optional `transcript_seq` |
| `tool_call` | `session`, `id`, `title`, `status`; optional `kind`, `agent_input`, `transcript_seq` |
| `plan` | `session`, `entries`; optional `transcript_seq` |
| `permission_request` | `session`, `request_id`, `title`, `options` (`[id, label]` pairs) |
| `usage` | `session`, `input_tokens`, `output_tokens` |
| `context_window` | `session`, authoritative `used_tokens`, `context_window` capacity |
| `models` | `session`, `available`, `current` |
| `config_options` | `session`, `options` |
| `execution_policy_changed` | `session`, authoritative `policy`; optional `request_id` echoed from `set_execution_policy` |
| `turn_ended` | `session`, `stop_reason` |
| `error` | `session`, `message`, `terminal`; optional `request_id` |

The optional `tool_call` fields are derived from ACP, and frontends must tolerate their absence.
`agent_input` is a size-bounded allowlist of agent/workflow launch fields, never an arbitrary tool
payload. The desktop uses it to recognize delegated activity without inventing a provider-specific
protocol; unrecognized calls remain ordinary tools. Providers may send later status-only updates
without repeating `kind`, `agent_input`, or even a useful title, so clients merge `tool_call` rows by
`id` and preserve previously observed metadata.

For transcript-backed events, `transcript_seq` is the durable row sequence committed before the
event is emitted. New clients use it to merge a transactional snapshot with live events without
content heuristics. It remains optional so older stored fixtures and clients stay wire-compatible.

`error.terminal` distinguishes a warning from an operation that actually stopped. Clients may show
both, but must only clear running state for a terminal error. Session-creation errors echo
`new_session.request_id`; prompt rejections and prompt-scoped errors echo `prompt.request_id`.
Clients must not claim another frontend's broadcast acceptance or consume a pending prompt without
an exact correlation match. Both request ids are optional for compatibility with older clients.
The remaining `session_created` fields form a durable creation receipt: a frontend can switch to
the exact provider cwd and source/worktree identity even when a best-effort session-list refresh
fails. Legacy producers may omit them; clients must not infer worktree provenance from `cwd` alone.

An `execution_policy_changed` event is broadcast only after the persisted row and live permission
handler both hold the same pair. A missing session or persistence failure emits a non-terminal
`error` with the policy request's `request_id` and no success event. Every client applies the
broadcast policy, including uncorrelated events produced by legacy single-axis ops, so session
switches and concurrent clients converge on the core rather than a local optimistic value.

`context_window` is translated from ACP's `session/update` `usage_update` and carries the provider's
current context tokens and effective model capacity. It is session-level state, is not persisted as
transcript content, and may be absent when an adapter cannot report a meaningful window. The legacy
`usage` event above remains the separate rolling account-usage shape.

`turn_started` is emitted exactly once after the core accepts a prompt for a known session, and
echoes that prompt's optional `request_id`. With a persistent store, the canonical user-authored
`Part::Prompt` is committed before this event; a failed write instead produces a correlated terminal
`error` and no `turn_started`. The event is the authoritative cross-client running signal and
remains in effect while a permission request is parked. A second prompt for that session is rejected
with a correlated, session-scoped, non-terminal `error`, so clients must not clear the already-running
turn. `turn_ended` or a terminal session error releases the core turn slot.

## Durable session activity

Every session snapshot carries a core-owned `activity` projection. Older serialized sessions that
lack the field read as revision `0` plus `idle`:

```json
{ "revision": 7, "state": { "kind": "running", "turn_id": "…", "prompt_request_id": "…" } }
{ "revision": 8, "state": { "kind": "awaiting_input", "turn_id": "…", "pending": [
  { "input_id": "…", "kind": "permission", "title": "Run command?", "options": [["allow", "Allow"]], "sequence": 12 }
] } }
{ "revision": 9, "state": { "kind": "failed", "turn_id": "…", "reason": "provider_error", "message": "…" } }
```

The four states are `idle`, `running`, `awaiting_input`, and `failed`. Revisions increase on every
semantic transition. Clients merge session-list snapshots and `session_activity_changed` events by
revision, rebuild their running indicators and **Awaiting Input** permission queues after reload,
and never let a late list response from another client or request roll state backwards.
`pending.sequence` provides one global FIFO order when more than one session or request is waiting.

The canonical prompt and the first `running` revision commit in one database transaction.
Subsequent activity updates use revision-aware writes. On process startup, a persisted `running` or
`awaiting_input` state cannot still own a provider task or reply channel, so the core advances it to
`failed` with reason `interrupted`, clears pending input, and reports that C2 stopped before the
turn finished. It never exposes a stale permission button as actionable after restart.

## Over the wire (remote server)

The remote server speaks this same protocol over WebSocket, wrapped in a thin envelope: events
arrive as `{"kind":"event","event":{…}}`, and clients send bare `Op` objects. Clients can also send
`{"req":"transcript","session":"…","before":null,"limit":20,"request_id":"page-uuid"}` or
`{"req":"sessions"}` to fetch a bounded transcript page or a fresh session list. See
[`codetwo-server`](/reference/server) for the framing and pairing/auth flow. Parsed inbound messages
enter a bounded, ordered worker; closing the socket stops further input but does not cancel an
operation the core has already accepted. In particular, a prompt that emitted `turn_started` still
reaches `turn_ended` or a terminal `error` after its initiating remote client disconnects.

Session-list reads return `{"kind":"sessions","sessions":[…]}`. A storage or decode failure is
instead explicit as `{"kind":"sessions_error","message":"…"}` during the welcome snapshot or a
later refresh; clients must keep their last known-good list rather than treating the failure as a
successful empty list.

A transcript reply is:

```json
{
  "kind": "transcript",
  "session": "…",
  "request_id": "page-uuid",
  "entries": [
    { "seq": 41, "role": "user", "part": { "kind": "prompt", "text": "…", "display": "…" } }
  ],
  "next_before": 41,
  "snapshot_through": 62
}
```

Pages are aligned to complete user turns, not arbitrary rows. The default is 20 turns and the hard
maximum is 50; `before` is an exclusive cursor and must be the `seq` of a user row in the same
session. `next_before: null` means there is no older page. `snapshot_through` is the newest durable
sequence visible to the read transaction, allowing clients to buffer concurrent events and then
apply only those with a larger sequence. Invalid or cross-session cursors produce a correlated
`transcript_error` frame rather than silently changing the requested boundary.

`@chat` references use the same bounded latest page for both preview and the real prompt: at most
20 complete user turns, followed by an independent hard limit of 16,000 Unicode scalar values.
When older turns or characters do not fit, the compiled context includes an omission marker rather
than implying it contains the whole referenced chat.

Snapshot projection may remove an in-flight `tool_call` update only when a later `completed` or
`failed` update for the same tool id exists in the same user turn. Missing title, tool kind, and
bounded agent metadata are carried into that terminal row. Live `tool_call` events are never
suppressed, and later still-running updates, cross-turn id reuse, and histories without a terminal
update are preserved.

`part` is a tagged union:

| Part kind | Fields | Notes |
| --- | --- | --- |
| `prompt` | `text`, `display` | Canonical user-authored document plus a bounded list-preview projection. Rules, expanded skills, file contents, and referenced-chat bodies are excluded. |
| `text` | `text` | Agent text; legacy databases may also contain user prompts in this form. |
| `reasoning` | `text` | Agent reasoning detail. |
| `tool_call` | `id`, `title`, `status`; optional `tool_kind`, `agent_input` | Persisted form of tool activity; merge repeated ids as above. |
| `plan` | `entries` | Plan lines. |

`prompt` is a new durable/wire variant. The database migration is forward-compatible with older
rows, but writing a `prompt` row is not rollback-compatible with binaries that only understand the
older `text` variant; back up the application data before downgrading across this version.

## Permission parking

When the engine can't auto-resolve a permission request, it parks the ACP request and emits a
`permission_request` event. The turn stays open until a client sends `answer_permission` with the
chosen `option_id` (or `null` to cancel), which unblocks the agent. The core validates the session,
input id, and advertised option before touching the parked sender. Wrong-session, unknown,
duplicate, and invalid-option answers are no-ops. Answering one of several pending inputs keeps the
session in `awaiting_input`; only answering the last returns it to `running`. Cancel drains every
parked local input before forwarding the provider cancellation.
