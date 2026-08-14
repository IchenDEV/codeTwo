//! A minimal JSON-RPC 2.0 peer over any async byte streams (child stdio in prod, an in-memory
//! duplex in tests). It multiplexes: outbound requests matched to responses by id, inbound
//! notifications and requests dispatched to a [`ClientHandler`].
//!
//! Generic over the reader/writer so the whole prompt-turn loop is testable offline against a mock
//! agent — no provider binary required.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

use super::handler::ClientHandler;
use super::wire::{SessionNotification, SessionUpdate};
use crate::error::{AcpError, RpcError};

pub struct Connection {
    tx_out: mpsc::UnboundedSender<String>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, RpcError>>>>,
    next_id: AtomicU64,
}

impl Connection {
    /// Wire a connection over the given byte streams, dispatching agent callbacks to `handler`.
    /// Spawns a reader task and a writer task; the returned handle sends requests/notifications.
    pub fn new<R, W>(reader: R, writer: W, handler: Arc<dyn ClientHandler>) -> Arc<Connection>
    where
        R: AsyncRead + Unpin + Send + 'static,
        W: AsyncWrite + Unpin + Send + 'static,
    {
        let (tx_out, rx_out) = mpsc::unbounded_channel::<String>();
        let conn = Arc::new(Connection {
            tx_out,
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        });
        tokio::spawn(writer_task(writer, rx_out));
        tokio::spawn(reader_task(reader, conn.clone(), handler));
        conn
    }

    /// Send a request and await the typed response.
    pub async fn request<P, R>(&self, method: &str, params: P) -> Result<R, AcpError>
    where
        P: Serialize,
        R: DeserializeOwned,
    {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        let msg = json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params});
        self.tx_out.send(msg.to_string()).map_err(|_| AcpError::Closed)?;
        match rx.await.map_err(|_| AcpError::Closed)? {
            Ok(v) => serde_json::from_value(v).map_err(AcpError::Decode),
            Err(e) => Err(AcpError::Rpc(e)),
        }
    }

    /// Fire-and-forget notification.
    pub fn notify<P: Serialize>(&self, method: &str, params: P) -> Result<(), AcpError> {
        let msg = json!({"jsonrpc": "2.0", "method": method, "params": params});
        self.tx_out.send(msg.to_string()).map_err(|_| AcpError::Closed)
    }

    fn resolve(&self, id: u64, result: Result<Value, RpcError>) {
        if let Some(tx) = self.pending.lock().unwrap().remove(&id) {
            let _ = tx.send(result);
        }
    }
}

async fn writer_task<W>(mut writer: W, mut rx: mpsc::UnboundedReceiver<String>)
where
    W: AsyncWrite + Unpin + Send + 'static,
{
    while let Some(mut line) = rx.recv().await {
        line.push('\n');
        if writer.write_all(line.as_bytes()).await.is_err() {
            break;
        }
        if writer.flush().await.is_err() {
            break;
        }
    }
}

async fn reader_task<R>(reader: R, conn: Arc<Connection>, handler: Arc<dyn ClientHandler>)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    let mut lines = BufReader::new(reader).lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                if line.trim().is_empty() {
                    continue;
                }
                let val: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(e) => {
                        tracing::warn!("acp: dropping non-JSON line: {e}");
                        continue;
                    }
                };
                dispatch(&conn, &handler, val).await;
            }
            Ok(None) => break,
            Err(e) => {
                tracing::warn!("acp: read error: {e}");
                break;
            }
        }
    }
    // Stream closed: fail every outstanding request so callers don't hang forever.
    let mut pending = conn.pending.lock().unwrap();
    for (_, tx) in pending.drain() {
        let _ = tx.send(Err(RpcError::new(-1, "connection closed")));
    }
}

/// Route one decoded message. Responses resolve pending requests; notifications are handled inline
/// (to preserve update ordering); inbound requests are spawned (so a slow permission prompt doesn't
/// stall the read loop).
async fn dispatch(conn: &Arc<Connection>, handler: &Arc<dyn ClientHandler>, val: Value) {
    // A response has an id and no method.
    if val.get("method").is_none() {
        if let Some(id) = val.get("id").and_then(|v| v.as_u64()) {
            if let Some(err) = val.get("error") {
                let rpc = serde_json::from_value(err.clone())
                    .unwrap_or_else(|_| RpcError::new(-1, "malformed error object"));
                conn.resolve(id, Err(rpc));
            } else {
                conn.resolve(id, Ok(val.get("result").cloned().unwrap_or(Value::Null)));
            }
        }
        return;
    }

    let method = val.get("method").and_then(|m| m.as_str()).unwrap_or("").to_string();
    let params = val.get("params").cloned().unwrap_or(Value::Null);

    match val.get("id").cloned() {
        Some(id) => {
            // Inbound request: handle off-thread, reply with the matching id.
            let conn = conn.clone();
            let handler = handler.clone();
            tokio::spawn(async move {
                let resp = match handle_request(handler.as_ref(), &method, params).await {
                    Ok(v) => json!({"jsonrpc": "2.0", "id": id, "result": v}),
                    Err(e) => json!({"jsonrpc": "2.0", "id": id,
                        "error": {"code": e.code, "message": e.message, "data": e.data}}),
                };
                let _ = conn.tx_out.send(resp.to_string());
            });
        }
        None => handle_notification(handler.as_ref(), &method, params).await,
    }
}

async fn handle_request(
    handler: &dyn ClientHandler,
    method: &str,
    params: Value,
) -> Result<Value, RpcError> {
    match method {
        "session/request_permission" => {
            let req = serde_json::from_value(params).map_err(RpcError::invalid_params)?;
            let resp = handler.request_permission(req).await;
            serde_json::to_value(resp).map_err(RpcError::invalid_params)
        }
        "elicitation/create" => {
            let req = serde_json::from_value(params).map_err(RpcError::invalid_params)?;
            let resp = handler.create_elicitation(req).await;
            serde_json::to_value(resp).map_err(RpcError::invalid_params)
        }
        "fs/read_text_file" => {
            let req = serde_json::from_value(params).map_err(RpcError::invalid_params)?;
            let resp = handler.read_text_file(req).await?;
            serde_json::to_value(resp).map_err(RpcError::invalid_params)
        }
        "fs/write_text_file" => {
            let req = serde_json::from_value(params).map_err(RpcError::invalid_params)?;
            handler.write_text_file(req).await?;
            Ok(Value::Null)
        }
        other => Err(RpcError::method_not_found(other)),
    }
}

async fn handle_notification(handler: &dyn ClientHandler, method: &str, params: Value) {
    match method {
        "session/update" => {
            let session_id = params
                .get("sessionId")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let update_val = params.get("update").cloned().unwrap_or(Value::Null);
            match serde_json::from_value::<SessionUpdate>(update_val) {
                Ok(update) => handler.session_update(SessionNotification { session_id, update }).await,
                // Unknown update variant: log and continue (code to the common denominator).
                Err(e) => tracing::debug!("acp: unhandled session update: {e}"),
            }
        }
        other => tracing::debug!("acp: ignoring notification {other}"),
    }
}
