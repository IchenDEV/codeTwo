//! M0 de-risking spike, as a test: drive a full ACP prompt turn against an in-process mock agent.
//! Exercises request/response matching, streamed `session/update` notifications, an agent→client
//! `session/request_permission` request + our response, and the final `StopReason` — with no
//! provider binary (grok/Node) required.

use std::sync::Arc;

use codetwo_core::acp::{AcpClient, Connection, ContentBlock, RecordingHandler, StopReason};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader};

async fn write_line<W: AsyncWrite + Unpin>(w: &mut W, v: Value) {
    let mut s = v.to_string();
    s.push('\n');
    w.write_all(s.as_bytes()).await.unwrap();
    w.flush().await.unwrap();
}

/// A tiny ACP agent: answers initialize/new, and on a prompt streams a message chunk, requests a
/// permission, and only completes the turn after the client answers that permission.
async fn mock_agent<R, W>(reader: R, mut writer: W)
where
    R: tokio::io::AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    let mut prompt_id: Option<Value> = None;

    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        let v: Value = serde_json::from_str(&line).unwrap();
        match v.get("method").and_then(|m| m.as_str()) {
            Some("initialize") => {
                let id = v["id"].clone();
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","id":id,"result":
                        {"protocolVersion":1,"agentCapabilities":{},"authMethods":[]}}),
                )
                .await;
            }
            Some("session/new") => {
                let id = v["id"].clone();
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","id":id,"result":{"sessionId":"sess-1"}}),
                )
                .await;
            }
            Some("session/prompt") => {
                prompt_id = Some(v["id"].clone());
                // Stream an assistant chunk...
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","method":"session/update","params":{
                        "sessionId":"sess-1",
                        "update":{"sessionUpdate":"agent_message_chunk",
                                  "content":{"type":"text","text":"Hello from agent"}}}}),
                )
                .await;
                // ...then ask for permission before finishing the turn.
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","id":1000,"method":"session/request_permission","params":{
                        "sessionId":"sess-1",
                        "toolCall":{"toolCallId":"tc1","title":"Run ls"},
                        "options":[{"optionId":"allow","name":"Allow","kind":"allow_once"},
                                   {"optionId":"reject","name":"Reject","kind":"reject_once"}]}}),
                )
                .await;
            }
            Some(_) => {}
            None => {
                // A response from the client (its answer to our permission request): finish the turn.
                if let Some(pid) = prompt_id.take() {
                    write_line(
                        &mut writer,
                        json!({"jsonrpc":"2.0","id":pid,"result":{"stopReason":"end_turn"}}),
                    )
                    .await;
                }
            }
        }
    }
}

async fn internally_failing_session_agent<R, W>(reader: R, mut writer: W)
where
    R: tokio::io::AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    let mut session_attempts = 0;
    while let Ok(Some(line)) = lines.next_line().await {
        let v: Value = serde_json::from_str(&line).unwrap();
        if v.get("method").and_then(Value::as_str) != Some("session/new") {
            continue;
        }
        session_attempts += 1;
        let id = v["id"].clone();
        if session_attempts == 1 {
            write_line(
                &mut writer,
                json!({"jsonrpc":"2.0","id":id,"error":{"code":-32603,"message":"Internal error"}}),
            )
            .await;
        } else {
            write_line(
                &mut writer,
                json!({"jsonrpc":"2.0","id":id,"result":{"sessionId":"sess-retried"}}),
            )
            .await;
        }
    }
}

#[tokio::test]
async fn drives_a_full_prompt_turn() {
    let (client_end, agent_end) = tokio::io::duplex(64 * 1024);
    let (cr, cw) = tokio::io::split(client_end);
    let (ar, aw) = tokio::io::split(agent_end);
    tokio::spawn(mock_agent(ar, aw));

    let handler = Arc::new(RecordingHandler::default());
    let conn = Connection::new(cr, cw, handler.clone());
    let client = AcpClient::new(conn, None);

    let init = client.initialize(json!({})).await.unwrap();
    assert_eq!(init.protocol_version, 1);

    let sid = client.new_session("/tmp", vec![]).await.unwrap();
    assert_eq!(sid, "sess-1");

    let stop = client.prompt(&sid, vec![ContentBlock::text("hi")]).await.unwrap();
    assert_eq!(stop, StopReason::EndTurn);

    assert!(handler.text().contains("Hello from agent"));
    assert_eq!(handler.permission_count(), 1);
}

#[tokio::test]
async fn retries_one_internal_error_while_creating_a_session() {
    let (client_end, agent_end) = tokio::io::duplex(64 * 1024);
    let (cr, cw) = tokio::io::split(client_end);
    let (ar, aw) = tokio::io::split(agent_end);
    tokio::spawn(internally_failing_session_agent(ar, aw));

    let conn = Connection::new(cr, cw, Arc::new(RecordingHandler::default()));
    let client = AcpClient::new(conn, None);

    let sid = client.new_session("/tmp", vec![]).await.unwrap();
    assert_eq!(sid, "sess-retried");
}
