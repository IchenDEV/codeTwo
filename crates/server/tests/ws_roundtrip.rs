//! The remote-control server, tested offline against the real engine: the full pairing flow
//! (one-time token → bearer → single-use ws ticket), revocation, and an Op-in → Event-out
//! round-trip over a real WebSocket.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use codetwo_core::event::Event;
use codetwo_core::permission::{PermissionMode, SandboxPolicy};
use codetwo_core::provider::{default_registry, LaunchSpec, Provider, ProviderId};
use codetwo_core::skill::{builtin_skills, SkillLibrary};
use codetwo_core::Engine;
use codetwo_server::{bind_and_serve, fanout, AuthState, DEFAULT_PAIRING_TTL};
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::tungstenite::Message;

const SLOW_SETUP_AGENT: &str = r#"
import json, sys, time

def send(message):
    print(json.dumps(message), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    message = json.loads(line)
    method = message.get("method")
    mid = message.get("id")
    if method == "initialize":
        send({"jsonrpc":"2.0","id":mid,"result":{"protocolVersion":1}})
    elif method == "session/new":
        # Yield one provider notification while the core is still awaiting setup. A disconnected
        # socket must not be allowed to cancel the already accepted prompt at this point.
        time.sleep(0.2)
        send({"jsonrpc":"2.0","method":"session/update","params":{
            "sessionId":"agent-session",
            "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"setup progress"}}
        }})
        time.sleep(0.2)
        send({"jsonrpc":"2.0","id":mid,"result":{"sessionId":"agent-session"}})
    elif method == "session/prompt":
        send({"jsonrpc":"2.0","id":mid,"result":{"stopReason":"end_turn"}})
"#;

/// Minimal HTTP/1.1 request over a raw socket — enough for the tiny JSON API, no client dep.
async fn http(
    addr: SocketAddr,
    method: &str,
    path: &str,
    auth: Option<&str>,
    body: &str,
) -> (u16, String) {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let auth_header = auth
        .map(|b| format!("Authorization: Bearer {b}\r\n"))
        .unwrap_or_default();
    let req = format!(
        "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\n{auth_header}Content-Length: {}\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(req.as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let text = String::from_utf8_lossy(&raw).to_string();
    let status: u16 = text
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let body = text
        .split_once("\r\n\r\n")
        .map(|(_, b)| b.to_string())
        .unwrap_or_default();
    (status, body)
}

fn json_field(body: &str, field: &str) -> String {
    let v: serde_json::Value = serde_json::from_str(body).unwrap_or_default();
    v.get(field)
        .and_then(|x| x.as_str())
        .unwrap_or_default()
        .to_string()
}

#[tokio::test]
async fn pairing_ticket_and_op_event_roundtrip() {
    let (engine, rx) = Engine::new(default_registry(), SkillLibrary::new(builtin_skills()));
    let events = fanout(rx);
    let auth = Arc::new(AuthState::load(None));
    let pairing_token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
    let (addr, _handle) = bind_and_serve(
        Arc::new(engine),
        events,
        "127.0.0.1:0".parse().unwrap(),
        auth.clone(),
    )
    .await
    .unwrap();

    // Bad pairing token → 401.
    let (status, _) = http(
        addr,
        "POST",
        "/api/pair",
        None,
        r#"{"token":"nope","device_name":"x"}"#,
    )
    .await;
    assert_eq!(status, 401);

    // Good pairing token → bearer. Second use of the same token → 401 (single use).
    let body = format!(r#"{{"token":"{pairing_token}","device_name":"Test phone"}}"#);
    let (status, reply) = http(addr, "POST", "/api/pair", None, &body).await;
    assert_eq!(status, 200, "pairing failed: {reply}");
    let bearer = json_field(&reply, "bearer");
    assert!(!bearer.is_empty());
    let (status, _) = http(addr, "POST", "/api/pair", None, &body).await;
    assert_eq!(status, 401, "pairing token must be single use");

    // Bad bearer → 401; good bearer → ticket.
    let (status, _) = http(addr, "POST", "/api/ws-ticket", Some("wrong"), "").await;
    assert_eq!(status, 401);
    let (status, reply) = http(addr, "POST", "/api/ws-ticket", Some(&bearer), "").await;
    assert_eq!(status, 200);
    let ticket = json_field(&reply, "ticket");

    // No/stale ticket → handshake rejected.
    let bad = format!("ws://{addr}/ws?ticket=nope");
    assert!(tokio_tungstenite::connect_async(bad.as_str())
        .await
        .is_err());

    // Fresh ticket → welcome, then an Op that yields an Event.
    let good = format!("ws://{addr}/ws?ticket={ticket}");
    let (mut ws, _) = tokio_tungstenite::connect_async(good.as_str())
        .await
        .unwrap();

    // The ticket is consumed — reusing it must fail.
    assert!(
        tokio_tungstenite::connect_async(good.as_str())
            .await
            .is_err(),
        "ws ticket must be single use"
    );

    let first = ws.next().await.unwrap().unwrap().into_text().unwrap();
    assert!(
        first.contains("\"kind\":\"sessions\""),
        "expected welcome, got: {first}"
    );

    // A transcript request round-trips (empty transcript for an unknown session).
    ws.send(Message::Text(
        r#"{"req":"transcript","session":"none","limit":20,"request_id":"page-1"}"#.into(),
    ))
    .await
    .unwrap();
    let reply = ws.next().await.unwrap().unwrap().into_text().unwrap();
    assert!(
        reply.contains("\"kind\":\"transcript\""),
        "expected transcript, got: {reply}"
    );
    let page: serde_json::Value = serde_json::from_str(&reply).unwrap();
    assert_eq!(page["request_id"], "page-1");
    assert_eq!(page["entries"], serde_json::json!([]));

    // Unknown provider → the engine emits Event::Error synchronously.
    let op = serde_json::json!({
        "op": "new_session",
        "provider": { "custom": "nope" },
        "cwd": ".",
        "use_worktree": false,
        "request_id": "ws-create"
    });
    ws.send(Message::Text(op.to_string())).await.unwrap();

    let mut got_error = false;
    for _ in 0..10 {
        if let Some(Ok(m)) = ws.next().await {
            if let Ok(t) = m.into_text() {
                if t.contains("\"kind\":\"event\"")
                    && t.contains("unknown provider")
                    && t.contains("\"terminal\":true")
                    && t.contains("\"request_id\":\"ws-create\"")
                {
                    got_error = true;
                    break;
                }
            }
        }
    }
    assert!(
        got_error,
        "expected an error event for the unknown provider"
    );

    // Revoking the device kills its bearer.
    let device_id = auth.list_devices()[0].id.clone();
    assert!(auth.revoke_device(&device_id));
    let (status, _) = http(addr, "POST", "/api/ws-ticket", Some(&bearer), "").await;
    assert_eq!(status, 401, "revoked device must not get tickets");
}

#[tokio::test]
async fn disconnect_does_not_cancel_an_accepted_prompt() {
    let provider_id = ProviderId::Custom("slow-setup".into());
    let provider = Provider {
        id: provider_id.clone(),
        display_name: "Slow setup test agent".into(),
        launch: LaunchSpec::new("python3", ["-u", "-c", SLOW_SETUP_AGENT]),
        needs_node: false,
    };
    let (engine, rx) = Engine::new(vec![provider], SkillLibrary::new(vec![]));
    let engine = Arc::new(engine);
    let events = fanout(rx);
    let mut observer = events.subscribe();
    let auth = Arc::new(AuthState::load(None));
    let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
    let paired = auth
        .pair(&token, "Disconnect test")
        .expect("pairing succeeds");
    let ticket = auth.issue_ws_ticket(&paired.device_id);
    let (addr, _handle) =
        bind_and_serve(engine.clone(), events, "127.0.0.1:0".parse().unwrap(), auth)
            .await
            .unwrap();

    let url = format!("ws://{addr}/ws?ticket={ticket}");
    let (mut ws, _) = tokio_tungstenite::connect_async(url).await.unwrap();
    let _welcome = ws.next().await.expect("welcome frame").unwrap();

    ws.send(Message::Text(
        serde_json::json!({
            "op": "new_session",
            "provider": { "custom": "slow-setup" },
            "cwd": ".",
            "use_worktree": false,
            "request_id": "disconnect-create"
        })
        .to_string(),
    ))
    .await
    .unwrap();

    let session = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Event::SessionCreated {
                session,
                request_id: Some(request_id),
                ..
            } = observer.recv().await.expect("event stream remains open")
            {
                if request_id == "disconnect-create" {
                    break session;
                }
            }
        }
    })
    .await
    .expect("session creation before timeout");

    ws.send(Message::Text(
        serde_json::json!({
            "op": "set_execution_policy",
            "session": session.clone(),
            "mode": "accept_edits",
            "sandbox": "read_only"
        })
        .to_string(),
    ))
    .await
    .unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let projected = engine
                .list_sessions()
                .unwrap()
                .into_iter()
                .find(|candidate| candidate.id == session)
                .expect("remote-created session stays live");
            if projected.permission_mode == PermissionMode::AcceptEdits
                && projected.sandbox_policy == SandboxPolicy::ReadOnly
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("combined execution policy before timeout");

    ws.send(Message::Text(
        serde_json::json!({
            "op": "prompt",
            "session": session,
            "doc": [{ "type": "text", "text": "keep running after disconnect" }],
            "request_id": "disconnect-prompt"
        })
        .to_string(),
    ))
    .await
    .unwrap();

    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Event::TurnStarted {
                request_id: Some(request_id),
                ..
            } = observer.recv().await.expect("event stream remains open")
            {
                if request_id == "disconnect-prompt" {
                    break;
                }
            }
        }
    })
    .await
    .expect("prompt acceptance before timeout");

    // The accepted operation now belongs to the core, not to this transport connection.
    drop(ws);

    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match observer.recv().await.expect("event stream remains open") {
                Event::TurnEnded { session: ended, .. } if ended == session => break,
                Event::Error {
                    session: Some(failed),
                    terminal: true,
                    message,
                    ..
                } if failed == session => {
                    panic!("accepted prompt failed after disconnect: {message}")
                }
                _ => {}
            }
        }
    })
    .await
    .expect("accepted prompt reaches a terminal event after disconnect");
}
