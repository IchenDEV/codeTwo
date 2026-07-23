//! Shared error types.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// Errors surfaced while driving a provider over ACP.
#[derive(Debug, Error)]
pub enum AcpError {
    #[error("acp connection closed")]
    Closed,
    #[error("failed to spawn provider: {0}")]
    Spawn(#[source] std::io::Error),
    #[error("decode error: {0}")]
    Decode(#[source] serde_json::Error),
    #[error("rpc error {}: {}", .0.code, .0.message)]
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
        Self { code, message: message.into(), data: None }
    }
    pub fn method_not_found(method: &str) -> Self {
        Self::new(-32601, format!("method not found: {method}"))
    }
    pub fn invalid_params(err: impl std::fmt::Display) -> Self {
        Self::new(-32602, format!("invalid params: {err}"))
    }
}

impl std::fmt::Display for RpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "rpc error {}: {}", self.code, self.message)
    }
}

impl std::error::Error for RpcError {}
