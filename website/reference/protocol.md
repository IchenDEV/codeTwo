# Op / Event protocol

Every frontend talks to the core through two JSON-serializable types: **Op** (submissions in) and
**Event** (events out). This is the contract the desktop bridge, the TUI, and the remote server all
use.

## Ops (client → core)

Tagged by `op`:

| Op | Fields | Purpose |
| --- | --- | --- |
| `new_session` | `provider`, `cwd`, `use_worktree` | create a session |
| `prompt` | `session`, `doc` | submit a document as a prompt turn |
| `cancel` | `session` | interrupt the current turn |
| `answer_permission` | `session`, `request_id`, `option_id` | answer a permission request (`option_id: null` = cancel) |
| `set_permission_mode` | `session`, `mode` | `ask` / `accept_edits` / `yolo` |
| `set_model` | `session`, `model` | set the session model |

`provider` is one of `claude_code`, `codex`, `grok`, `cursor`, `opencode`, `pi`, `kimi`, `zcode`, or
`{"custom":"…"}`.
`doc` is an array of blocks: `{"type":"text","text":"…"}` or
`{"type":"skill","skill_id":"…","params":{}}`.

### Example

```json
{ "op": "new_session", "provider": "grok", "cwd": ".", "use_worktree": false }
{ "op": "prompt", "session": "…", "doc": [
    { "type": "skill", "skill_id": "reviewer", "params": {} },
    { "type": "text", "text": "Refactor the login handler." }
] }
```

## Events (core → client)

Tagged by `event`:

| Event | Fields |
| --- | --- |
| `session_created` | `session` |
| `agent_text` | `session`, `message_id`, `text` |
| `agent_thought` | `session`, `text` |
| `tool_call` | `session`, `id`, `title`, `status` |
| `plan` | `session`, `entries` |
| `permission_request` | `session`, `request_id`, `title`, `options` (`[id, label]` pairs) |
| `usage` | `session`, `input_tokens`, `output_tokens` |
| `turn_ended` | `session`, `stop_reason` |
| `error` | `session`, `message` |

## Permission parking

When the engine can't auto-resolve a permission request, it parks the ACP request and emits a
`permission_request` event. The turn stays open until a client sends `answer_permission` with the
chosen `option_id` (or `null` to cancel), which unblocks the agent.
