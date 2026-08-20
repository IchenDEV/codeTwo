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
async fn mock_agent<R, W>(
    reader: R,
    mut writer: W,
    with_models: bool,
    seen: mpsc::UnboundedSender<String>,
) where
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
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","id":v["id"],"result":{"protocolVersion":1}}),
                )
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
                    // The newer config-options surface, as current adapters report it. The model
                    // option uses the *grouped* wire shape on purpose — both shapes must parse.
                    result["configOptions"] = json!([
                        {"id":"model","name":"Model","type":"select","category":"model",
                         "currentValue":"fast",
                         "options":[{"group":"main","name":"Models","options":[
                             {"value":"fast","name":"Fast","description":"Cheap and quick"},
                             {"value":"deep","name":"Deep"}
                         ]}]},
                        {"id":"effort","name":"Reasoning Effort","type":"select","category":"thought_level",
                         "currentValue":"medium",
                         "options":[{"value":"low","name":"Low"},{"value":"medium","name":"Medium"},{"value":"high","name":"High"}]}
                    ]);
                }
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","id":v["id"],"result":result}),
                )
                .await;
            }
            Some("session/set_model") => {
                let _ = seen.send(
                    v["params"]["modelId"]
                        .as_str()
                        .unwrap_or_default()
                        .to_string(),
                );
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","id":v["id"],"result":{}}),
                )
                .await;
            }
            Some("session/set_mode") => {
                let _ = seen.send(format!(
                    "mode={}",
                    v["params"]["modeId"].as_str().unwrap_or_default()
                ));
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","id":v["id"],"result":{}}),
                )
                .await;
            }
            Some("session/set_config_option") => {
                let _ = seen.send(format!(
                    "{}={}",
                    v["params"]["configId"].as_str().unwrap_or_default(),
                    v["params"]["value"].as_str().unwrap_or_default()
                ));
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","id":v["id"],"result":{"configOptions":[
                        {"id":"effort","name":"Reasoning Effort","type":"select","category":"thought_level",
                         "currentValue":"high",
                         "options":[{"value":"low","name":"Low"},{"value":"high","name":"High"}]}
                    ]}}),
                )
                .await;
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
    assert_eq!(
        models.available_models[0].description.as_deref(),
        Some("Cheap and quick")
    );
    // `description` is optional in the spec; a model without one must still parse.
    assert_eq!(models.available_models[1].description, None);
}

#[tokio::test]
async fn agent_without_models_is_not_an_error() {
    let (client, _rx) = connect(false).await;
    let resp = client.new_session_full("/tmp", vec![]).await.unwrap();
    assert_eq!(resp.session_id, "sess-1");
    assert!(
        resp.models.is_none(),
        "no models is a normal answer, not a failure"
    );
}

#[tokio::test]
async fn new_session_reports_config_options() {
    let (client, _rx) = connect(true).await;
    let resp = client.new_session_full("/tmp", vec![]).await.unwrap();

    let options = resp
        .config_options
        .expect("agent advertised config options");
    assert_eq!(options.len(), 2);

    let model = &options[0];
    assert_eq!(model.category.as_deref(), Some("model"));
    assert_eq!(model.current().as_deref(), Some("fast"));
    // Grouped options flatten to the same list a flat report would give.
    let choices = model.choices();
    assert_eq!(choices.len(), 2);
    assert_eq!(choices[0].value, "fast");
    assert_eq!(choices[0].description.as_deref(), Some("Cheap and quick"));

    let effort = &options[1];
    assert_eq!(effort.category.as_deref(), Some("thought_level"));
    assert_eq!(effort.choices().len(), 3);
    assert_eq!(effort.current().as_deref(), Some("medium"));
}

#[tokio::test]
async fn set_config_option_sends_id_and_value_and_returns_new_set() {
    let (client, mut rx) = connect(true).await;
    client.new_session_full("/tmp", vec![]).await.unwrap();

    let options = client
        .set_config_option("sess-1", "effort", "high")
        .await
        .unwrap();
    assert_eq!(rx.recv().await.as_deref(), Some("effort=high"));
    assert_eq!(options.len(), 1);
    assert_eq!(options[0].current().as_deref(), Some("high"));
}

#[tokio::test]
async fn set_model_sends_the_chosen_id() {
    let (client, mut rx) = connect(true).await;
    client.new_session_full("/tmp", vec![]).await.unwrap();

    client.set_model("sess-1", "deep").await.unwrap();
    assert_eq!(rx.recv().await.as_deref(), Some("deep"));
}

#[tokio::test]
async fn set_mode_sends_the_chosen_legacy_mode_id() {
    let (client, mut rx) = connect(true).await;
    client.new_session_full("/tmp", vec![]).await.unwrap();

    client.set_mode("sess-1", "xhigh").await.unwrap();
    assert_eq!(rx.recv().await.as_deref(), Some("mode=xhigh"));
}
