//! Shared error types.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// Errors surfaced while driving a provider over ACP.
#[derive(Debug, Error)]
pub enum AcpError {
    #[error("acp connection closed")]
    Closed,
    /// The launch command isn't on PATH. Carries the command so the UI can name it.
    #[error("{0} isn't installed or on your PATH. Install its CLI, or pick another provider in the config popover.")]
    CommandNotFound(String),
    #[error("failed to spawn provider: {0}")]
    Spawn(#[source] std::io::Error),
    #[error("decode error: {0}")]
    Decode(#[source] serde_json::Error),
    #[error("{0}")]
    Rpc(RpcError),
}

/// A JSON-RPC 2.0 error object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl RpcError {
    pub fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }
    pub fn method_not_found(method: &str) -> Self {
        Self::new(-32601, format!("method not found: {method}"))
    }
    pub fn invalid_params(err: impl std::fmt::Display) -> Self {
        Self::new(-32602, format!("invalid params: {err}"))
    }

    fn provider_detail(&self) -> Option<String> {
        let detail = detail_from_value(self.data.as_ref()?)?;
        (detail != self.message).then_some(detail)
    }
}

impl std::fmt::Display for RpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "rpc error {}: {}", self.code, self.message)?;
        if let Some(detail) = self.provider_detail() {
            write!(f, " — {detail}")?;
        }
        Ok(())
    }
}

impl std::error::Error for RpcError {}

fn detail_from_value(value: &Value) -> Option<String> {
    match value {
        Value::Object(fields) => ["detail", "message", "title"]
            .into_iter()
            .find_map(|key| fields.get(key).and_then(Value::as_str))
            .map(compact_detail)
            .or_else(|| fields.get("error").and_then(detail_from_value)),
        Value::String(text) => {
            if let Some(start) = text.find('{') {
                if let Ok(structured) = serde_json::from_str::<Value>(&text[start..]) {
                    if let Some(detail) = detail_from_value(&structured) {
                        return Some(detail);
                    }
                }
            }
            (!text.contains("requestId")).then(|| compact_detail(text))
        }
        _ => None,
    }
}

fn compact_detail(detail: &str) -> String {
    let compact = detail.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = compact.chars();
    let shortened = chars.by_ref().take(800).collect::<String>();
    if chars.next().is_some() {
        format!("{shortened}…")
    } else {
        shortened
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rpc_error_surfaces_structured_provider_detail_without_request_metadata() {
        let error = AcpError::Rpc(RpcError {
            code: -32603,
            message: "Internal error: Agent error".into(),
            data: Some(Value::String(
                r#"402 {"detail":"Weekly usage limit reached; choose another model.","requestId":"private-request-id"}"#.into(),
            )),
        });

        let rendered = error.to_string();
        assert!(
            rendered.contains("Weekly usage limit reached"),
            "{rendered}"
        );
        assert!(!rendered.contains("private-request-id"), "{rendered}");
    }
}
