//! The remote-control server, tested offline: token auth (wrong token rejected) and a full
//! Op-in → Event-out round-trip over a real WebSocket, driving the real engine.

use std::sync::Arc;

use codetwo_core::provider::default_registry;
use codetwo_core::skill::{builtin_skills, SkillLibrary};
use codetwo_core::Engine;
use codetwo_server::{bind_and_serve, fanout};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn ws_auth_and_op_event_roundtrip() {
    let (engine, rx) = Engine::new(default_registry(), SkillLibrary::new(builtin_skills()));
    let events = fanout(rx);
    let (addr, _handle) = bind_and_serve(
        Arc::new(engine),
        events,
        "127.0.0.1:0".parse().unwrap(),
        "secret".into(),
    )
    .await
    .unwrap();

    // Wrong token → handshake rejected.
    let bad = format!("ws://{addr}/ws?token=nope");
    assert!(tokio_tungstenite::connect_async(bad.as_str()).await.is_err());

    // Right token → welcome, then an Op that yields an Event.
    let good = format!("ws://{addr}/ws?token=secret");
    let (mut ws, _) = tokio_tungstenite::connect_async(good.as_str()).await.unwrap();

    let first = ws.next().await.unwrap().unwrap().into_text().unwrap();
    assert!(first.contains("\"kind\":\"sessions\""), "expected welcome, got: {first}");

    // Unknown provider → the engine emits Event::Error synchronously.
    let op = serde_json::json!({
        "op": "new_session",
        "provider": { "custom": "nope" },
        "cwd": ".",
        "use_worktree": false
    });
    ws.send(Message::Text(op.to_string())).await.unwrap();

    let mut got_error = false;
    for _ in 0..10 {
        if let Some(Ok(m)) = ws.next().await {
            if let Ok(t) = m.into_text() {
                if t.contains("\"kind\":\"event\"") && t.contains("unknown provider") {
                    got_error = true;
                    break;
                }
            }
        }
    }
    assert!(got_error, "expected an error event for the unknown provider");
}
