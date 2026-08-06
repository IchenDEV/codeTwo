//! The SQ/EQ interface between the core and any frontend (codex's Submission-Queue / Event-Queue
//! pattern). Frontends push [`Op`]s and consume a stream of [`Event`]s. The Tauri bridge forwards
//! Ops via `#[tauri::command]` and streams Events over an `ipc::Channel`; the ratatui TUI calls the
//! same core API in-process. One agent loop, two renderers.
//!
//! The engine that turns `Op`s into `Event`s (by driving [`crate::acp`]) lands in M1; these are the
//! stable types both sides code against.

use crate::provider::ProviderId;
use crate::memory::MemoryReceipt;
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
    /// Change what the agent may touch at all (Codex-style sandbox axis).
    SetSandbox { session: SessionId, sandbox: crate::permission::SandboxPolicy },
    SetModel { session: SessionId, model: String },
    /// Set an agent-reported session config option (model, reasoning effort, …) by id.
    SetConfigOption { session: SessionId, config_id: String, value: String },
}

/// Events: what the core streams back for the UI to render.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Event {
    SessionCreated { session: SessionId },
    /// Exact, inspectable record of the recalled items injected into this turn. Emitted only after
    /// the matching user part is persisted, and never represented as user-authored transcript.
    MemoryContext { session: SessionId, receipt: MemoryReceipt },
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
    /// The models this session can run on: the agent's own list (reported at `session/new` and
    /// echoed after a switch), or [`crate::models::builtin_models`] for its provider — emitted as
    /// soon as the session exists — when the agent doesn't implement the (UNSTABLE) ACP model API.
    /// `current` is empty when nothing has been chosen yet.
    Models { session: SessionId, available: Vec<ModelChoice>, current: String },
    /// The agent's session config options (model selector, thought level, …), reported at
    /// `session/new`, echoed after every `set_config_option`, and pushed on agent-side changes.
    /// This is the newer ACP surface that superseded `Models`; sessions may emit either or both.
    ConfigOptions { session: SessionId, options: Vec<ConfigOptionInfo> },
    TurnEnded { session: SessionId, stop_reason: String },
    Error { session: Option<SessionId>, message: String },
}

/// One selectable model, flattened from ACP's `ModelInfo` for the frontends.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelChoice {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
}

/// One session config selector, flattened from ACP's `SessionConfigOption` for the frontends.
/// `category` is the spec's semantic hint ("model", "mode", "thought_level", …); `choices` reuses
/// [`ModelChoice`] since the shape (id, name, description) is identical.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigOptionInfo {
    pub id: String,
    pub name: String,
    pub category: Option<String>,
    pub current: String,
    pub choices: Vec<ModelChoice>,
}
