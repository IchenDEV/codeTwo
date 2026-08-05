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

/// Render a stored transcript as markdown context for `@`-mentioning a past chat from a new
/// prompt. Only the conversation's words travel: reasoning and tool chatter are omitted, plans
/// ride along as bullet lists. Long chats keep their tail — the end of a planning conversation
/// is where the conclusions live.
pub fn transcript_context(title: &str, transcript: &[(Role, Part)]) -> String {
    /// Rough context budget for one referenced chat (~4k tokens); beyond it, older turns drop.
    const MAX_BODY: usize = 16_000;

    // Collapse consecutive same-role parts into one turn, so a streamed answer that landed as
    // many parts reads as one "Agent:" block.
    let mut turns: Vec<(Role, String)> = Vec::new();
    for (role, part) in transcript {
        let text = match part {
            Part::Text { text } => text.trim().to_string(),
            Part::Plan { entries } => {
                entries.iter().map(|e| format!("- {e}")).collect::<Vec<_>>().join("\n")
            }
            Part::Reasoning { .. } | Part::ToolCall { .. } => continue,
        };
        if text.is_empty() {
            continue;
        }
        match turns.last_mut() {
            Some((r, buf)) if *r == *role => {
                buf.push_str("\n\n");
                buf.push_str(&text);
            }
            _ => turns.push((*role, text)),
        }
    }

    let mut body: Vec<String> = turns
        .iter()
        .map(|(role, text)| {
            let who = match role {
                Role::User => "User",
                Role::Agent => "Agent",
            };
            format!("**{who}:**\n{text}")
        })
        .collect();
    // An empty chat contributes nothing; compile reports it as unresolved instead.
    if body.is_empty() {
        return String::new();
    }
    let mut total: usize = body.iter().map(|s| s.len()).sum();
    let mut dropped = false;
    while body.len() > 1 && total > MAX_BODY {
        total -= body.remove(0).len();
        dropped = true;
    }

    let mut out = format!("**Referenced chat** — {title}\n");
    if dropped {
        out.push_str("\n_(earlier messages omitted)_\n");
    }
    for turn in &body {
        out.push('\n');
        out.push_str(turn);
        out.push('\n');
    }
    out.trim_end().to_string()
}

/// Unix time in milliseconds. Fine for ordering the session list.
pub fn now_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
