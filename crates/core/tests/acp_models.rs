//! Verifies the (UNSTABLE) ACP model surface: the models an agent advertises at `session/new` reach
//! the client, `session/set_model` carries the chosen id, and an agent that reports no models at all
//! is a normal outcome rather than a parse failure — which is the common case today, since most
//! adapters don't implement this part of the spec.

use std::sync::Arc;

use codetwo_core::acp::{AcpClient, Connection, RecordingHandler};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;

async fn write_line<W: AsyncWrite + Unpin>(w: &mut W, v: Value) {
    let mut s = v.to_string();
    s.push('\n');
    w.write_all(s.as_bytes()).await.unwrap();
    w.flush().await.unwrap();
}

/// A mock agent that advertises two models. `set_model` calls are reported back over `seen`.
async fn mock_agent<R, W>(reader: R, mut writer: W, with_models: bool, seen: mpsc::UnboundedSender<String>)
where
    R: tokio::io::AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        let v: Value = serde_json::from_str(&line).unwrap();
        match v.get("method").and_then(|m| m.as_str()) {
            Some("initialize") => {
                write_line(&mut writer, json!({"jsonrpc":"2.0","id":v["id"],"result":{"protocolVersion":1}}))
                    .await;
            }
            Some("session/new") => {
                let mut result = json!({ "sessionId": "sess-1" });
                if with_models {
                    result["models"] = json!({
                        "availableModels": [
                            { "modelId": "fast", "name": "Fast", "description": "Cheap and quick" },
                            { "modelId": "deep", "name": "Deep" }
                        ],
                        "currentModelId": "fast"
                    });
                }
                write_line(&mut writer, json!({"jsonrpc":"2.0","id":v["id"],"result":result})).await;
            }
            Some("session/set_model") => {
                let _ = seen.send(v["params"]["modelId"].as_str().unwrap_or_default().to_string());
                write_line(&mut writer, json!({"jsonrpc":"2.0","id":v["id"],"result":{}})).await;
            }
            _ => {}
        }
    }
}

async fn connect(with_models: bool) -> (AcpClient, mpsc::UnboundedReceiver<String>) {
    let (client_end, agent_end) = tokio::io::duplex(64 * 1024);
    let (cr, cw) = tokio::io::split(client_end);
    let (ar, aw) = tokio::io::split(agent_end);
    let (tx, rx) = mpsc::unbounded_channel();
    tokio::spawn(mock_agent(ar, aw, with_models, tx));

    let conn = Connection::new(cr, cw, Arc::new(RecordingHandler::default()));
    let client = AcpClient::new(conn, None);
    client.initialize(json!({})).await.unwrap();
    (client, rx)
}

#[tokio::test]
async fn new_session_reports_available_models() {
    let (client, _rx) = connect(true).await;
    let resp = client.new_session_full("/tmp", vec![]).await.unwrap();

    let models = resp.models.expect("agent advertised models");
    assert_eq!(models.current_model_id, "fast");
    assert_eq!(models.available_models.len(), 2);
    assert_eq!(models.available_models[0].model_id, "fast");
    assert_eq!(models.available_models[0].name, "Fast");
    assert_eq!(models.available_models[0].description.as_deref(), Some("Cheap and quick"));
    // `description` is optional in the spec; a model without one must still parse.
    assert_eq!(models.available_models[1].description, None);
}

#[tokio::test]
async fn agent_without_models_is_not_an_error() {
    let (client, _rx) = connect(false).await;
    let resp = client.new_session_full("/tmp", vec![]).await.unwrap();
    assert_eq!(resp.session_id, "sess-1");
    assert!(resp.models.is_none(), "no models is a normal answer, not a failure");
}

#[tokio::test]
async fn set_model_sends_the_chosen_id() {
    let (client, mut rx) = connect(true).await;
    client.new_session_full("/tmp", vec![]).await.unwrap();

    client.set_model("sess-1", "deep").await.unwrap();
    assert_eq!(rx.recv().await.as_deref(), Some("deep"));
}
