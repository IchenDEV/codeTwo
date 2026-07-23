//! Session / message / part model.
//!
//! A session is one conversation with one provider, shown as a row in the left session list.
//! Persistence (SQLite) lands in M1; these are the in-memory shapes the store will mirror.

use crate::permission::PermissionMode;
use crate::provider::ProviderId;
use serde::{Deserialize, Serialize};

/// Our own session id (a UUID). Distinct from the provider's ACP session id, which we store
/// separately so we can resume via ACP `session/load`.
pub type SessionId = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    User,
    Agent,
}

/// A rendered piece of a message. The transcript is a flat list of these per message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Part {
    Text { text: String },
    Reasoning { text: String },
    ToolCall { id: String, title: String, status: String },
    Plan { entries: Vec<String> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub session_id: SessionId,
    pub role: Role,
    pub parts: Vec<Part>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: SessionId,
    pub title: String,
    pub provider: ProviderId,
    pub model: Option<String>,
    /// Working directory the provider runs in. Equals `worktree_path` when a worktree is used.
    pub cwd: String,
    pub worktree_path: Option<String>,
    pub permission_mode: PermissionMode,
    /// The provider's ACP session id, once `session/new` (or `session/load`) has run.
    pub acp_session_id: Option<String>,
    pub created_at: i64,
}

impl Session {
    pub fn new(provider: ProviderId, cwd: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            title: "Untitled session".into(),
            provider,
            model: None,
            cwd: cwd.into(),
            worktree_path: None,
            permission_mode: PermissionMode::Ask,
            acp_session_id: None,
            created_at: now_millis(),
        }
    }
}

/// Unix time in milliseconds. Fine for ordering the session list.
pub fn now_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
