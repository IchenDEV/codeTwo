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

/// The agent capabilities we act on, lifted out of the raw `agentCapabilities` object. Everything
/// defaults to "not supported" — an agent earns a capability by advertising it, never by omission.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AgentCaps {
    /// `session/load`: the agent can re-attach a previous session, replaying its history and
    /// restoring the conversation context. This is the provider-native resume cursor — the only
    /// way an agent's context survives its process.
    pub load_session: bool,
    /// Remote MCP transports are optional; stdio is the ACP baseline.
    pub mcp_http: bool,
    pub mcp_sse: bool,
}

impl InitializeResponse {
    pub fn caps(&self) -> AgentCaps {
        AgentCaps {
            load_session: self
                .agent_capabilities
                .get("loadSession")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            mcp_http: self
                .agent_capabilities
                .pointer("/mcpCapabilities/http")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            mcp_sse: self.agent_capabilities.pointer("/mcpCapabilities/sse").and_then(Value::as_bool).unwrap_or(false),
        }
    }
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
    /// The agent's selectable models, when it reports any. Marked UNSTABLE in the ACP spec and
    /// absent from most adapters today, so this stays optional and its absence is a normal state —
    /// the engine then offers [`crate::models::builtin_models`] for the provider instead.
    #[serde(default)]
    pub models: Option<SessionModelState>,
    /// Session config options (UNSTABLE) — where current adapters report the model selector and
    /// the thought/reasoning level. Newer than (and superseding) the `models` field above; both
    /// are read so either generation of adapter works.
    #[serde(rename = "configOptions", default)]
    pub config_options: Option<Vec<SessionConfigOption>>,
}

// ---- session/load --------------------------------------------------------------------------

/// Re-attach a previous session (`session/load`). Gated on [`AgentCaps::load_session`]. The agent
/// replays the whole conversation as `session/update` notifications before answering, then the
/// session accepts prompts with its context intact.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadSessionRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub cwd: String,
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: Vec<Value>,
}

/// `session/load` reports models/config the same way `session/new` does; agents that predate those
/// (UNSTABLE) fields answer with nothing at all, so every field — and the response itself — is
/// optional at the call site.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LoadSessionResponse {
    #[serde(default)]
    pub models: Option<SessionModelState>,
    #[serde(rename = "configOptions", default)]
    pub config_options: Option<Vec<SessionConfigOption>>,
}

// ---- models (ACP: UNSTABLE) ------------------------------------------------------------------

/// One model the agent can be switched to.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    #[serde(rename = "modelId")]
    pub model_id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// The models an agent offers, and which one is live.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionModelState {
    #[serde(rename = "availableModels", default)]
    pub available_models: Vec<ModelInfo>,
    #[serde(rename = "currentModelId", default)]
    pub current_model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetModelRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "modelId")]
    pub model_id: String,
}

// ---- session config options (ACP: UNSTABLE) --------------------------------------------------

/// One selectable value of a config option.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigSelectChoice {
    pub value: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// A session configuration selector (`category` distinguishes model / mode / thought_level).
///
/// Only `type: "select"` carries choices we can render; anything else still parses (lenient, like
/// the rest of this module) but exposes an empty choice list. `options` stays a raw `Value`
/// because the spec allows both a flat list and a grouped one — [`Self::choices`] flattens either.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfigOption {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(rename = "type", default)]
    pub option_type: Option<String>,
    #[serde(rename = "currentValue", default)]
    pub current_value: Option<Value>,
    #[serde(default)]
    pub options: Option<Value>,
}

impl SessionConfigOption {
    /// The currently selected value id, when this is a select option.
    pub fn current(&self) -> Option<String> {
        self.current_value.as_ref().and_then(|v| v.as_str()).map(str::to_string)
    }

    /// Flatten the select choices, accepting both wire shapes: a flat option list and a list of
    /// `{group, name, options: […]}` groups.
    pub fn choices(&self) -> Vec<ConfigSelectChoice> {
        let Some(Value::Array(items)) = &self.options else { return Vec::new() };
        let mut out = Vec::new();
        for item in items {
            if let Some(Value::Array(grouped)) = item.get("options") {
                for o in grouped {
                    if let Ok(c) = serde_json::from_value::<ConfigSelectChoice>(o.clone()) {
                        out.push(c);
                    }
                }
            } else if let Ok(c) = serde_json::from_value::<ConfigSelectChoice>(item.clone()) {
                out.push(c);
            }
        }
        out
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetConfigOptionRequest {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    #[serde(rename = "configId")]
    pub config_id: String,
    /// A `SessionConfigValueId` — the "value_id" request variant (no `type` field on the wire).
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetConfigOptionResponse {
    #[serde(rename = "configOptions", default)]
    pub config_options: Vec<SessionConfigOption>,
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
    /// The agent's config options changed (model switched, effort adjusted, …). Carries the full
    /// replacement set, same as `session/new` and `session/set_config_option` responses.
    ConfigOptionUpdate {
        #[serde(rename = "configOptions", default)]
        config_options: Vec<SessionConfigOption>,
    },
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn caps_default_to_unsupported() {
        // An agent earns a capability by advertising it — absence, null, and non-bool all mean no.
        let none: InitializeResponse =
            serde_json::from_value(json!({"protocolVersion": 1})).unwrap();
        assert!(!none.caps().load_session);
        assert!(!none.caps().mcp_http);
        assert!(!none.caps().mcp_sse);
        let odd: InitializeResponse = serde_json::from_value(
            json!({"protocolVersion": 1, "agentCapabilities": {"loadSession": "yes"}}),
        )
        .unwrap();
        assert!(!odd.caps().load_session);
    }

    #[test]
    fn caps_read_load_session() {
        let r: InitializeResponse = serde_json::from_value(json!({"protocolVersion": 1, "agentCapabilities": {
            "loadSession": true,
            "mcpCapabilities": {"http": true, "sse": true}
        }}))
        .unwrap();
        assert!(r.caps().load_session);
        assert!(r.caps().mcp_http);
        assert!(r.caps().mcp_sse);
    }
}
