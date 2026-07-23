//! The engine's hardest bit, tested offline: an ACP `session/request_permission` in `Ask` mode is
//! *parked* (an `Event::PermissionRequest` is emitted, the turn stays open) until the frontend
//! answers via the router — after which the turn completes. Streamed text becomes `Event::AgentText`.

use std::sync::{Arc, Mutex};

use codetwo_core::acp::wire::PermissionOutcome;
use codetwo_core::acp::{AcpClient, Connection, ContentBlock, StopReason};
use codetwo_core::event::Event;
use codetwo_core::permission::PermissionPolicy;
use codetwo_core::{PermissionRouter, SessionHandler};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;

async fn write_line<W: AsyncWrite + Unpin>(w: &mut W, v: Value) {
    let mut s = v.to_string();
    s.push('\n');
    w.write_all(s.as_bytes()).await.unwrap();
    w.flush().await.unwrap();
}

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
                write_line(&mut writer, json!({"jsonrpc":"2.0","id":v["id"],"result":{"protocolVersion":1}})).await;
            }
            Some("session/new") => {
                write_line(&mut writer, json!({"jsonrpc":"2.0","id":v["id"],"result":{"sessionId":"sess-1"}})).await;
            }
            Some("session/prompt") => {
                prompt_id = Some(v["id"].clone());
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","method":"session/update","params":{
                        "sessionId":"sess-1",
                        "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"working"}}}}),
                )
                .await;
                write_line(
                    &mut writer,
                    json!({"jsonrpc":"2.0","id":42,"method":"session/request_permission","params":{
                        "sessionId":"sess-1",
                        "toolCall":{"toolCallId":"tc1","title":"rm build/","kind":"execute"},
                        "options":[{"optionId":"allow","name":"Allow","kind":"allow_once"},
                                   {"optionId":"reject","name":"Reject","kind":"reject_once"}]}}),
                )
                .await;
            }
            Some(_) => {}
            None => {
                if let Some(pid) = prompt_id.take() {
                    write_line(&mut writer, json!({"jsonrpc":"2.0","id":pid,"result":{"stopReason":"end_turn"}})).await;
                }
            }
        }
    }
}

#[tokio::test]
async fn permission_is_parked_then_answered() {
    let (events_tx, mut events_rx) = mpsc::unbounded_channel::<Event>();
    let router = PermissionRouter::default();
    // Ask mode → the permission must be surfaced, not auto-answered.
    let policy = Arc::new(Mutex::new(PermissionPolicy::default()));
    let handler = Arc::new(SessionHandler::new("s1".into(), events_tx, policy, router.clone(), None));

    let (client_end, agent_end) = tokio::io::duplex(64 * 1024);
    let (cr, cw) = tokio::io::split(client_end);
    let (ar, aw) = tokio::io::split(agent_end);
    tokio::spawn(mock_agent(ar, aw));

    let conn = Connection::new(cr, cw, handler);
    let client = AcpClient::new(conn, None);
    client.initialize(json!({})).await.unwrap();
    let sid = client.new_session("/tmp", vec![]).await.unwrap();

    // Run the turn concurrently; it will block inside request_permission until we answer.
    let turn = tokio::spawn(async move { client.prompt(&sid, vec![ContentBlock::text("go")]).await });

    // Collect events until the permission ask surfaces.
    let mut saw_text = false;
    let mut request_id = None;
    while let Some(ev) = events_rx.recv().await {
        match ev {
            Event::AgentText { text, .. } => {
                assert_eq!(text, "working");
                saw_text = true;
            }
            Event::PermissionRequest { request_id: rid, title, options, .. } => {
                assert_eq!(title, "rm build/");
                assert_eq!(options.len(), 2);
                request_id = Some(rid);
                break;
            }
            _ => {}
        }
    }
    assert!(saw_text, "agent text should stream before the permission ask");
    let request_id = request_id.expect("permission request should have surfaced");

    // The turn must still be pending (parked on our answer).
    assert!(!turn.is_finished(), "turn must wait for the permission decision");

    // Answer allow → the turn completes.
    assert!(router.answer(&request_id, PermissionOutcome::Selected { option_id: "allow".into() }));
    let stop = turn.await.unwrap().unwrap();
    assert_eq!(stop, StopReason::EndTurn);
}
