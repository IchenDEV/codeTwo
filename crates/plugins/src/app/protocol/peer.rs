//! A JSON-RPC 2.0 peer for the plugin protocol.
//!
//! Deliberately generic over the byte streams, like [`codetwo_core::acp::connection`]: in production the
//! reader/writer are a child process's stdout/stdin, and in tests they are an in-memory duplex, so
//! the whole handshake-and-dispatch loop is exercised offline with no plugin binary to install.

use crate::app::protocol::wire::{EventParams, InvokeParams, LogParams};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

/// What an extension process is allowed to ask the host for. Deliberately small: call an
/// extension-public command, publish an event, write a log line. Command authorization lives in
/// the registry seam rather than trusting a name received over stdio.
#[async_trait::async_trait]
pub trait HostHandler: Send + Sync + 'static {
    async fn call(&self, name: &str, args: Value) -> Result<Value, String>;
    async fn emit(&self, name: &str, payload: Value);
    fn log(&self, level: &str, message: &str);
}

#[derive(Debug, thiserror::Error)]
pub enum ProtocolError {
    #[error("the plugin process is not responding")]
    Closed,
    #[error("{0}")]
    Remote(String),
    #[error("the plugin sent something unreadable: {0}")]
    Decode(String),
}

pub struct Peer {
    outbound: mpsc::UnboundedSender<String>,
    pending: Mutex<HashMap<u64, oneshot::Sender<Result<Value, String>>>>,
    next_id: AtomicU64,
}

impl Peer {
    /// Wire a peer over the given streams. Spawns a reader and a writer task; dropping every
    /// `Arc<Peer>` closes the writer, which is what makes killing the child clean up the rest.
    pub fn new<R, W>(reader: R, writer: W, handler: Arc<dyn HostHandler>) -> Arc<Peer>
    where
        R: AsyncRead + Unpin + Send + 'static,
        W: AsyncWrite + Unpin + Send + 'static,
    {
        let (outbound, rx) = mpsc::unbounded_channel::<String>();
        let peer = Arc::new(Peer {
            outbound,
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        });
        tokio::spawn(writer_task(writer, rx));
        tokio::spawn(reader_task(reader, peer.clone(), handler));
        peer
    }

    pub async fn request<P, R>(&self, method: &str, params: P) -> Result<R, ProtocolError>
    where
        P: Serialize,
        R: DeserializeOwned,
    {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        let message = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        self.outbound
            .send(message.to_string())
            .map_err(|_| ProtocolError::Closed)?;
        match rx.await.map_err(|_| ProtocolError::Closed)? {
            Ok(value) => {
                serde_json::from_value(value).map_err(|e| ProtocolError::Decode(e.to_string()))
            }
            Err(message) => Err(ProtocolError::Remote(message)),
        }
    }

    pub fn notify<P: Serialize>(&self, method: &str, params: P) {
        let message = json!({ "jsonrpc": "2.0", "method": method, "params": params });
        let _ = self.outbound.send(message.to_string());
    }

    fn resolve(&self, id: u64, result: Result<Value, String>) {
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
        if writer.write_all(line.as_bytes()).await.is_err() || writer.flush().await.is_err() {
            break;
        }
    }
}

async fn reader_task<R>(reader: R, peer: Arc<Peer>, handler: Arc<dyn HostHandler>)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    let mut lines = BufReader::new(reader).lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) if line.trim().is_empty() => continue,
            Ok(Some(line)) => match serde_json::from_str::<Value>(&line) {
                Ok(value) => dispatch(&peer, &handler, value).await,
                // A plugin that prints to stdout is a common mistake, not a crash. Say so once
                // per line and keep the connection alive.
                Err(error) => tracing::warn!("plugin protocol: dropping non-JSON line: {error}"),
            },
            Ok(None) => break,
            Err(error) => {
                tracing::warn!("plugin protocol: read error: {error}");
                break;
            }
        }
    }
    // The process is gone; fail every outstanding request rather than leaving callers hanging.
    let mut pending = peer.pending.lock().unwrap();
    for (_, tx) in pending.drain() {
        let _ = tx.send(Err("the plugin process exited".into()));
    }
}

async fn dispatch(peer: &Arc<Peer>, handler: &Arc<dyn HostHandler>, value: Value) {
    if value.get("method").is_none() {
        // A response.
        if let Some(id) = value.get("id").and_then(Value::as_u64) {
            match value.get("error") {
                Some(error) => {
                    let message = error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("the plugin refused without a reason")
                        .to_string();
                    peer.resolve(id, Err(message));
                }
                None => peer.resolve(id, Ok(value.get("result").cloned().unwrap_or(Value::Null))),
            }
        }
        return;
    }

    let method = value
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let params = value.get("params").cloned().unwrap_or(Value::Null);

    match value.get("id").cloned() {
        // A request from the plugin. Handled off the read loop so a slow host command cannot
        // stall the plugin's own event stream.
        Some(id) => {
            let peer = peer.clone();
            let handler = handler.clone();
            tokio::spawn(async move {
                let response = match handle_request(handler.as_ref(), &method, params).await {
                    Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
                    Err(message) => json!({
                        "jsonrpc": "2.0", "id": id,
                        "error": { "code": -32000, "message": message }
                    }),
                };
                let _ = peer.outbound.send(response.to_string());
            });
        }
        None => handle_notification(handler.as_ref(), &method, params).await,
    }
}

async fn handle_request(
    handler: &dyn HostHandler,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    match method {
        "command/call" => {
            let params: InvokeParams =
                serde_json::from_value(params).map_err(|error| error.to_string())?;
            handler.call(&params.name, params.args).await
        }
        other => Err(format!("the host has no method `{other}`")),
    }
}

async fn handle_notification(handler: &dyn HostHandler, method: &str, params: Value) {
    match method {
        "event/emit" => {
            if let Ok(params) = serde_json::from_value::<EventParams>(params) {
                handler.emit(&params.name, params.payload).await;
            }
        }
        "log" => {
            if let Ok(params) = serde_json::from_value::<LogParams>(params) {
                handler.log(&params.level, &params.message);
            }
        }
        other => tracing::debug!("plugin protocol: ignoring notification {other}"),
    }
}
