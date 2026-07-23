//! ACP wire types (the subset we drive today).
//!
//! ACP is JSON-RPC 2.0, newline-delimited over stdio, with user-facing text as Markdown and a data
//! model that reuses MCP's content shapes. We model what the client needs for a prompt turn and stay
//! lenient about the rest (unknown `sessionUpdate` variants are dropped, not fatal) — the plan's
//! "code to the common denominator, feature-detect the rest" guidance.
//!
//! These hand-written serde types keep us independent of any single adapter's version churn; the
//! official `agent-client-protocol` crate can be swapped in later behind [`super::client::AcpClient`].

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// ACP stable protocol version.
pub const PROTOCOL_VERSION: i64 = 1;

// ---- initialize ----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeRequest {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: i64,
    #[serde(rename = "clientCapabilities", skip_serializing_if = "Option::is_none")]
    pub client_capabilities: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeResponse {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: i64,
    #[serde(rename = "agentCapabilities", default)]
    pub agent_capabilities: Value,
    #[serde(rename = "authMethods", default)]
    pub auth_methods: Value,
}

// ---- session/new ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSessionRequest {
    pub cwd: String,
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewSessionResponse {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

// ---- content blocks (MCP-shaped) -----------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text { text: String },
    Image {
        data: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    },
    Resource { resource: Value },
}

impl ContentBlock {
    pub fn text(s: impl Into<String>) -> Self {
        ContentBlock::Text { text: s.into() }
    }
}

// ---- session/prompt ------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub prompt: Vec<ContentBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptResponse {
    #[serde(rename = "stopReason")]
    pub stop_reason: StopReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    EndTurn,
    MaxTokens,
    MaxTurnRequests,
    Refusal,
    Cancelled,
    #[serde(other)]
    Unknown,
}

// ---- session/cancel ------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelNotification {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

// ---- session/update (agent → client notifications) -----------------------------------------

/// One streamed update within a prompt turn. Constructed by the reader from the raw `update` object.
#[derive(Debug, Clone)]
pub struct SessionNotification {
    pub session_id: String,
    pub update: SessionUpdate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "sessionUpdate", rename_all = "snake_case")]
pub enum SessionUpdate {
    UserMessageChunk { content: ContentBlock },
    AgentMessageChunk { content: ContentBlock },
    AgentThoughtChunk { content: ContentBlock },
    ToolCall(ToolCall),
    ToolCallUpdate(ToolCallUpdate),
    Plan { entries: Vec<PlanEntry> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    #[serde(rename = "toolCallId")]
    pub tool_call_id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub content: Option<Value>,
    #[serde(default, rename = "rawInput")]
    pub raw_input: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallUpdate {
    #[serde(rename = "toolCallId")]
    pub tool_call_id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub content: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanEntry {
    pub content: String,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

// ---- session/request_permission (agent → client request) -----------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestPermissionRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "toolCall", default)]
    pub tool_call: Value,
    pub options: Vec<PermissionOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionOption {
    #[serde(rename = "optionId")]
    pub option_id: String,
    pub name: String,
    /// One of: allow_once | allow_always | reject_once | reject_always.
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestPermissionResponse {
    pub outcome: PermissionOutcome,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum PermissionOutcome {
    Selected {
        #[serde(rename = "optionId")]
        option_id: String,
    },
    Cancelled,
}

// ---- fs/* (agent → client requests) --------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadTextFileRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub path: String,
    #[serde(default)]
    pub line: Option<u32>,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadTextFileResponse {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteTextFileRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub path: String,
    pub content: String,
}
