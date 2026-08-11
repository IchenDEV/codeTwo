//! The SQ/EQ interface between the core and any frontend (codex's Submission-Queue / Event-Queue
//! pattern). Frontends push [`Op`]s and consume a stream of [`Event`]s. The Tauri bridge forwards
//! Ops via `#[tauri::command]` and streams Events over an `ipc::Channel`; the ratatui TUI calls the
//! same core API in-process. One agent loop, two renderers.
//!
//! The engine that turns `Op`s into `Event`s (by driving [`crate::acp`]) lands in M1; these are the
//! stable types both sides code against.

use crate::memory::MemoryReceipt;
use crate::permission::ExecutionPolicy;
use crate::provider::ProviderId;
use crate::session::{SessionActivity, SessionId};
use crate::skill::DocBlock;
use crate::worktree::ResolvedWorktreeBaseline;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Submissions: what a frontend asks the core to do.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Op {
    NewSession {
        provider: ProviderId,
        cwd: String,
        use_worktree: bool,
        /// Explicit local commit source for the isolated checkout. `None` keeps old clients
        /// compatible: when `use_worktree` is true it means the current checkout.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        worktree_base: Option<crate::worktree::WorktreeBaseline>,
        /// SHA shown by a baseline picker. The core resolves the selected local ref again and
        /// rejects creation if it moved. Older clients may omit this to keep click-time resolution.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        worktree_base_sha: Option<String>,
        /// Correlates a broadcast `session_created`/terminal error with the initiating client.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        /// Optional draft policy chosen before the session exists. The core persists and installs
        /// it before emitting `session_created`, so it mediates permission requests from the very
        /// first prompt.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        initial_policy: Option<ExecutionPolicy>,
        /// Bind this new provider session as the next immutable Run of an existing Work Task.
        /// Omitted by Code clients, which retain one Task per legacy Session.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        task_id: Option<String>,
    },
    /// Submit the composed document as one prompt turn. The core compiles it (see [`crate::skill`]).
    Prompt {
        session: SessionId,
        doc: Vec<DocBlock>,
        /// Correlates prompt acceptance or rejection with the initiating client.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
    },
    Cancel {
        session: SessionId,
    },
    /// Answer an outstanding permission request. `option_id = None` means "cancelled".
    AnswerPermission {
        session: SessionId,
        request_id: String,
        option_id: Option<String>,
    },
    SetPermissionMode {
        session: SessionId,
        mode: crate::permission::PermissionMode,
    },
    /// Change the ACP tool-kind ceiling used by permission mediation. This does not install an
    /// operating-system or container sandbox.
    SetSandbox {
        session: SessionId,
        sandbox: crate::permission::SandboxPolicy,
    },
    /// Change both execution-policy axes as one logical operation.
    SetExecutionPolicy {
        session: SessionId,
        mode: crate::permission::PermissionMode,
        sandbox: crate::permission::SandboxPolicy,
        /// Correlates the authoritative success event or a rejection with the initiating client.
        /// Older clients may omit it and still receive the broadcast projection.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
    },
    SetModel {
        session: SessionId,
        model: String,
    },
    /// Set an agent-reported session config option (model, reasoning effort, …) by id.
    SetConfigOption {
        session: SessionId,
        config_id: String,
        value: String,
    },
}

/// Events: what the core streams back for the UI to render.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Event {
    SessionCreated {
        session: SessionId,
        /// Durable provider working directory, including the selected subdirectory inside a newly
        /// created worktree. Frontends can switch atomically without depending on a second list RPC.
        #[serde(default)]
        cwd: String,
        /// Source project provenance for the durable session. This receipt lets a frontend create
        /// another session safely even if its best-effort session-list refresh fails.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        project_path: Option<String>,
        /// Isolated checkout root, when this session owns one.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        worktree_path: Option<String>,
        /// Immutable local baseline used to create `worktree_path`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        worktree_baseline: Option<ResolvedWorktreeBaseline>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
    },
    /// Exact, inspectable record of the recalled items injected into this turn. Emitted only after
    /// the matching user part is persisted, and never represented as user-authored transcript.
    MemoryContext {
        session: SessionId,
        receipt: MemoryReceipt,
    },
    /// Durable automatic-title update; frontends can refresh a shell without reloading sessions.
    SessionTitleChanged { session: SessionId, title: String },
    /// Authoritative, revisioned session lifecycle projection.
    SessionActivityChanged {
        session: SessionId,
        activity: SessionActivity,
    },
    /// The core accepted a prompt and now owns the session's single live turn slot.
    TurnStarted {
        session: SessionId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        /// Sequence of the canonical persisted prompt, absent for non-persistent runs.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transcript_seq: Option<i64>,
    },
    AgentText {
        session: SessionId,
        message_id: String,
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transcript_seq: Option<i64>,
    },
    AgentThought {
        session: SessionId,
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transcript_seq: Option<i64>,
    },
    ToolCall {
        session: SessionId,
        id: String,
        title: String,
        status: String,
        /// Provider-neutral ACP category when the adapter supplied one.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        kind: Option<String>,
        /// Bounded launch metadata powers capability-detected subagent observability.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        agent_input: Option<Value>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transcript_seq: Option<i64>,
    },
    Plan {
        session: SessionId,
        entries: Vec<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        transcript_seq: Option<i64>,
    },
    /// A permission decision is needed from the user. `options` are `(option_id, label)` pairs.
    PermissionRequest {
        session: SessionId,
        request_id: String,
        title: String,
        options: Vec<(String, String)>,
    },
    Usage {
        session: SessionId,
        input_tokens: u64,
        output_tokens: u64,
    },
    /// Authoritative provider-reported context usage/capacity for the active session. This is
    /// deliberately separate from [`Event::Usage`], which remains the legacy rolling quota shape.
    ContextWindow {
        session: SessionId,
        used_tokens: u64,
        context_window: u64,
    },
    /// The models this session can run on: the agent's own list (reported at `session/new` and
    /// echoed after a switch), or [`crate::models::builtin_models`] for its provider — emitted as
    /// soon as the session exists — when the agent doesn't implement the (UNSTABLE) ACP model API.
    /// `current` is empty when nothing has been chosen yet.
    Models {
        session: SessionId,
        available: Vec<ModelChoice>,
        current: String,
    },
    /// The agent's session config options (model selector, thought level, …), reported at
    /// `session/new`, echoed after every `set_config_option`, and pushed on agent-side changes.
    /// This is the newer ACP surface that superseded `Models`; sessions may emit either or both.
    ConfigOptions {
        session: SessionId,
        options: Vec<ConfigOptionInfo>,
    },
    /// Authoritative execution policy after the durable store and live permission handler have
    /// both committed the same pair. A rejected write emits a correlated [`Event::Error`] instead
    /// and never emits this success receipt.
    ExecutionPolicyChanged {
        session: SessionId,
        policy: ExecutionPolicy,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
    },
    TurnEnded {
        session: SessionId,
        stop_reason: String,
    },
    Error {
        session: Option<SessionId>,
        message: String,
        /// Warnings use `false`; only terminal errors end a running turn or creation request.
        #[serde(default)]
        terminal: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
    },
}

/// One selectable model, flattened from ACP's `ModelInfo` for the frontends.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelChoice {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

/// One session config selector, flattened from ACP's `SessionConfigOption` for the frontends.
/// `category` is the spec's semantic hint ("model", "mode", "thought_level", …); `choices` reuses
/// [`ModelChoice`] since the shape (id, name, description) is identical.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConfigOptionInfo {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub current: String,
    pub choices: Vec<ModelChoice>,
}

#[cfg(test)]
mod tests {
    use super::{Event, Op};
    use crate::permission::{ExecutionPolicy, PermissionMode, SandboxPolicy};
    use crate::session::{PendingInput, PendingInputKind, SessionActivity, SessionRunState};

    #[test]
    fn turn_started_uses_the_public_wire_shape() {
        let value = serde_json::to_value(Event::TurnStarted {
            session: "session-1".into(),
            request_id: Some("prompt-1".into()),
            transcript_seq: Some(42),
        })
        .unwrap();

        assert_eq!(value["event"], "turn_started");
        assert_eq!(value["session"], "session-1");
        assert_eq!(value["request_id"], "prompt-1");
        assert_eq!(value["transcript_seq"], 42);
    }

    #[test]
    fn prompt_request_ids_remain_optional_on_the_wire() {
        let prompt: Op = serde_json::from_value(serde_json::json!({
            "op": "prompt",
            "session": "session-1",
            "doc": []
        }))
        .unwrap();
        assert!(matches!(
            prompt,
            Op::Prompt {
                request_id: None,
                ..
            }
        ));

        let event = serde_json::to_value(Event::TurnStarted {
            session: "session-1".into(),
            request_id: None,
            transcript_seq: None,
        })
        .unwrap();
        assert!(event.get("request_id").is_none());
        assert!(event.get("transcript_seq").is_none());
    }

    #[test]
    fn usage_update_event_serializes_context_window_fields() {
        let value = serde_json::to_value(Event::ContextWindow {
            session: "session-1".into(),
            used_tokens: 53_000,
            context_window: 200_000,
        })
        .unwrap();

        assert_eq!(value["event"], "context_window");
        assert_eq!(value["session"], "session-1");
        assert_eq!(value["used_tokens"], 53_000);
        assert_eq!(value["context_window"], 200_000);
    }

    #[test]
    fn execution_policy_change_has_a_correlated_authoritative_wire_shape() {
        let op = serde_json::to_value(Op::SetExecutionPolicy {
            session: "session-1".into(),
            mode: PermissionMode::Yolo,
            sandbox: SandboxPolicy::DangerFullAccess,
            request_id: Some("policy-1".into()),
        })
        .unwrap();
        assert_eq!(op["op"], "set_execution_policy");
        assert_eq!(op["request_id"], "policy-1");

        let event = serde_json::to_value(Event::ExecutionPolicyChanged {
            session: "session-1".into(),
            policy: ExecutionPolicy {
                mode: PermissionMode::Yolo,
                sandbox: SandboxPolicy::DangerFullAccess,
            },
            request_id: Some("policy-1".into()),
        })
        .unwrap();
        assert_eq!(event["event"], "execution_policy_changed");
        assert_eq!(event["policy"]["mode"], "yolo");
        assert_eq!(event["policy"]["sandbox"], "danger_full_access");
        assert_eq!(event["request_id"], "policy-1");
    }

    #[test]
    fn legacy_policy_payloads_remain_compatible_but_invalid_enums_do_not_fallback() {
        let legacy: Op = serde_json::from_value(serde_json::json!({
            "op": "set_execution_policy",
            "session": "session-1",
            "mode": "ask",
            "sandbox": "workspace_write"
        }))
        .unwrap();
        assert!(matches!(
            legacy,
            Op::SetExecutionPolicy {
                request_id: None,
                ..
            }
        ));

        let legacy_create: Op = serde_json::from_value(serde_json::json!({
            "op": "new_session",
            "provider": "grok",
            "cwd": "/work",
            "use_worktree": false
        }))
        .unwrap();
        assert!(matches!(
            legacy_create,
            Op::NewSession {
                initial_policy: None,
                ..
            }
        ));

        for (field, value) in [("mode", "future_mode"), ("sandbox", "future_sandbox")] {
            let mut payload = serde_json::json!({
                "op": "set_execution_policy",
                "session": "session-1",
                "mode": "ask",
                "sandbox": "workspace_write"
            });
            payload[field] = value.into();
            assert!(serde_json::from_value::<Op>(payload).is_err());
        }
    }

    #[test]
    fn session_activity_changed_uses_the_public_wire_shape() {
        let value = serde_json::to_value(Event::SessionActivityChanged {
            session: "session-1".into(),
            activity: SessionActivity {
                revision: 2,
                state: SessionRunState::AwaitingInput {
                    turn_id: "turn-1".into(),
                    prompt_request_id: Some("prompt-1".into()),
                    pending: vec![PendingInput {
                        input_id: "permission-1".into(),
                        kind: PendingInputKind::Permission,
                        title: "Run command".into(),
                        options: vec![("allow".into(), "Allow".into())],
                        sequence: 1,
                    }],
                },
            },
        })
        .unwrap();

        assert_eq!(value["event"], "session_activity_changed");
        assert_eq!(value["session"], "session-1");
        assert_eq!(value["activity"]["revision"], 2);
        assert_eq!(value["activity"]["state"]["kind"], "awaiting_input");
        assert_eq!(
            value["activity"]["state"]["pending"][0]["input_id"],
            "permission-1"
        );
    }
}
