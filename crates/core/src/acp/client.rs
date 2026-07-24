//! The high-level ACP client: the small set of calls a frontend/engine makes to drive a prompt turn.
//! Wraps a [`Connection`] and (in production) owns the provider child process.

use std::sync::{Arc, Mutex};

use serde_json::Value;
use tokio::process::Child;

use super::connection::Connection;
use super::wire::*;
use crate::error::AcpError;

pub struct AcpClient {
    conn: Arc<Connection>,
    // Wrapped in a std Mutex so `AcpClient` is `Sync` (needed to live in Tauri state / the engine's
    // shared session map). We only touch it to kill the child on drop.
    child: Option<Mutex<Child>>,
}

impl AcpClient {
    pub fn new(conn: Arc<Connection>, child: Option<Child>) -> Self {
        Self { conn, child: child.map(Mutex::new) }
    }

    /// The underlying connection, for advanced/unsupported calls.
    pub fn connection(&self) -> &Arc<Connection> {
        &self.conn
    }

    /// Negotiate protocol version and exchange capabilities.
    pub async fn initialize(&self, client_capabilities: Value) -> Result<InitializeResponse, AcpError> {
        self.conn
            .request(
                "initialize",
                InitializeRequest {
                    protocol_version: PROTOCOL_VERSION,
                    client_capabilities: Some(client_capabilities),
                },
            )
            .await
    }

    /// Create a new session and return the provider's ACP session id.
    pub async fn new_session(
        &self,
        cwd: impl Into<String>,
        mcp_servers: Vec<Value>,
    ) -> Result<String, AcpError> {
        Ok(self.new_session_full(cwd, mcp_servers).await?.session_id)
    }

    /// `session/new` with the whole response, including the models the agent offers (if any).
    pub async fn new_session_full(
        &self,
        cwd: impl Into<String>,
        mcp_servers: Vec<Value>,
    ) -> Result<NewSessionResponse, AcpError> {
        self.conn
            .request("session/new", NewSessionRequest { cwd: cwd.into(), mcp_servers })
            .await
    }

    /// Switch the session's model. `session/set_model` is UNSTABLE in the ACP spec and adapters
    /// that don't implement it answer with a method-not-found error — the caller is expected to
    /// surface that rather than treat it as fatal.
    pub async fn set_model(&self, session_id: &str, model_id: &str) -> Result<(), AcpError> {
        let _: serde_json::Value = self
            .conn
            .request(
                "session/set_model",
                SetModelRequest {
                    session_id: session_id.to_string(),
                    model_id: model_id.to_string(),
                },
            )
            .await?;
        Ok(())
    }

    /// Run one prompt turn. Streamed updates arrive via the [`super::handler::ClientHandler`];
    /// this resolves with the turn's stop reason.
    pub async fn prompt(
        &self,
        session_id: &str,
        blocks: Vec<ContentBlock>,
    ) -> Result<StopReason, AcpError> {
        let r: PromptResponse = self
            .conn
            .request(
                "session/prompt",
                PromptRequest { session_id: session_id.to_string(), prompt: blocks },
            )
            .await?;
        Ok(r.stop_reason)
    }

    /// Interrupt the current turn (fire-and-forget notification).
    pub fn cancel(&self, session_id: &str) -> Result<(), AcpError> {
        self.conn
            .notify("session/cancel", CancelNotification { session_id: session_id.to_string() })
    }
}

impl Drop for AcpClient {
    fn drop(&mut self) {
        // Don't leak provider subprocesses when a client is dropped.
        if let Some(child) = &self.child {
            if let Ok(mut child) = child.lock() {
                let _ = child.start_kill();
            }
        }
    }
}
