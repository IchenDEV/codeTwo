//! The SQ/EQ interface between the core and any frontend (codex's Submission-Queue / Event-Queue
//! pattern). Frontends push [`Op`]s and consume a stream of [`Event`]s. The Tauri bridge forwards
//! Ops via `#[tauri::command]` and streams Events over an `ipc::Channel`; the ratatui TUI calls the
//! same core API in-process. One agent loop, two renderers.
//!
//! The engine that turns `Op`s into `Event`s (by driving [`crate::acp`]) lands in M1; these are the
//! stable types both sides code against.

use crate::provider::ProviderId;
use crate::session::SessionId;
use crate::skill::DocBlock;
use serde::{Deserialize, Serialize};

/// Submissions: what a frontend asks the core to do.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Op {
    NewSession { provider: ProviderId, cwd: String, use_worktree: bool },
    /// Submit the composed document as one prompt turn. The core compiles it (see [`crate::skill`]).
    Prompt { session: SessionId, doc: Vec<DocBlock> },
    Cancel { session: SessionId },
    /// Answer an outstanding permission request. `option_id = None` means "cancelled".
    AnswerPermission { session: SessionId, request_id: String, option_id: Option<String> },
    SetPermissionMode { session: SessionId, mode: crate::permission::PermissionMode },
    SetModel { session: SessionId, model: String },
}

/// Events: what the core streams back for the UI to render.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Event {
    SessionCreated { session: SessionId },
    AgentText { session: SessionId, message_id: String, text: String },
    AgentThought { session: SessionId, text: String },
    ToolCall { session: SessionId, id: String, title: String, status: String },
    Plan { session: SessionId, entries: Vec<String> },
    /// A permission decision is needed from the user. `options` are `(option_id, label)` pairs.
    PermissionRequest {
        session: SessionId,
        request_id: String,
        title: String,
        options: Vec<(String, String)>,
    },
    Usage { session: SessionId, input_tokens: u64, output_tokens: u64 },
    TurnEnded { session: SessionId, stop_reason: String },
    Error { session: Option<SessionId>, message: String },
}
