//! Remote terminal access over WebSocket, tested against a real PTY: ticket-gated attach, live
//! input/output, reattach-with-restore from a second connection, and kill.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use codetwo_core::provider::default_registry;
use codetwo_core::skill::{builtin_skills, SkillLibrary};
use codetwo_core::Engine;
use codetwo_server::{bind_and_serve, fanout, AuthState, DEFAULT_PAIRING_TTL};
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::tungstenite::Message;

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

type Ws = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// Read frames until `predicate` matches one, panicking on timeout. Returns the matched frame.
async fn frame_matching(
    ws: &mut Ws,
    what: &str,
    predicate: impl Fn(&serde_json::Value) -> bool,
) -> serde_json::Value {
    tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            let msg = ws
                .next()
                .await
                .unwrap_or_else(|| panic!("socket closed while waiting for {what}"))
                .unwrap();
            if let Ok(text) = msg.into_text() {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                    if predicate(&value) {
                        break value;
                    }
                }
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("timed out waiting for {what}"))
}

#[tokio::test]
async fn terminal_attach_io_reattach_and_kill() {
    let (engine, rx) = Engine::new(default_registry(), SkillLibrary::new(builtin_skills()));
    let events = fanout(rx);
    let auth = Arc::new(AuthState::load(None));
    let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
    let paired = auth.pair(&token, "Terminal test").expect("pairing succeeds");
    let (addr, _handle) = bind_and_serve(
        Arc::new(engine),
        events,
        "127.0.0.1:0".parse().unwrap(),
        auth.clone(),
    )
    .await
    .unwrap();

    // The embedded xterm bundle is served from compile-time assets; traversal never resolves.
    let (status, xterm) = http(addr, "GET", "/term/xterm.min.js", None, "").await;
    assert_eq!(status, 200);
    assert!(!xterm.is_empty());
    let (status, _) = http(addr, "GET", "/term/%2e%2e/client.html", None, "").await;
    assert_eq!(status, 404);

    // The listing needs a bearer, and starts empty.
    let (status, _) = http(addr, "GET", "/api/terminals", None, "").await;
    assert_eq!(status, 401);
    let (status, body) = http(addr, "GET", "/api/terminals", Some(&paired.bearer), "").await;
    assert_eq!(status, 200);
    assert_eq!(body.trim(), "[]");

    // No ticket / a bad ticket → handshake rejected.
    let bad = format!("ws://{addr}/ws/terminal?ticket=nope");
    assert!(tokio_tungstenite::connect_async(bad.as_str()).await.is_err());

    // Attach with a fresh ticket: the shell is created and greets us.
    let ticket = auth.issue_ws_ticket(&paired.device_id);
    let url = format!("ws://{addr}/ws/terminal?ticket={ticket}");
    let (mut ws, _) = tokio_tungstenite::connect_async(url.as_str()).await.unwrap();
    ws.send(Message::Text(
        r#"{"op":"attach","id":"test-1","rows":24,"cols":80}"#.into(),
    ))
    .await
    .unwrap();
    let attached = frame_matching(&mut ws, "attached", |v| v["kind"] == "attached").await;
    assert_eq!(attached["id"], "test-1");
    assert_eq!(attached["created"], true);

    // Type a command whose output cannot appear in the echoed keystrokes.
    ws.send(Message::Text(
        r#"{"op":"input","data":"echo codetwo-$((1+1))-term\r"}"#.into(),
    ))
    .await
    .unwrap();
    frame_matching(&mut ws, "command output", |v| {
        v["kind"] == "data"
            && v["data"]
                .as_str()
                .is_some_and(|data| data.contains("codetwo-2-term"))
    })
    .await;

    // Resize round-trips without killing the shell.
    ws.send(Message::Text(r#"{"op":"resize","rows":30,"cols":100}"#.into()))
        .await
        .unwrap();

    // The terminal now shows up in the listing.
    let (status, body) = http(addr, "GET", "/api/terminals", Some(&paired.bearer), "").await;
    assert_eq!(status, 200);
    assert!(body.contains("test-1"), "listing: {body}");

    // A second viewer attaches to the same id: not created, and the restore dump replays the
    // earlier output.
    let ticket2 = auth.issue_ws_ticket(&paired.device_id);
    let url2 = format!("ws://{addr}/ws/terminal?ticket={ticket2}");
    let (mut ws2, _) = tokio_tungstenite::connect_async(url2.as_str()).await.unwrap();
    ws2.send(Message::Text(
        r#"{"op":"attach","id":"test-1","rows":24,"cols":80}"#.into(),
    ))
    .await
    .unwrap();
    let reattached = frame_matching(&mut ws2, "reattach", |v| v["kind"] == "attached").await;
    assert_eq!(reattached["created"], false);
    assert!(
        reattached["restore"]
            .as_str()
            .is_some_and(|restore| restore.contains("codetwo-2-term")),
        "restore dump should replay earlier output"
    );

    // Killing via REST removes it from the registry and notifies attached viewers.
    let (status, _) = http(
        addr,
        "POST",
        "/api/terminals/test-1/kill",
        Some(&paired.bearer),
        "",
    )
    .await;
    assert_eq!(status, 204);
    frame_matching(&mut ws2, "exit after kill", |v| v["kind"] == "exit").await;
    let (status, body) = http(addr, "GET", "/api/terminals", Some(&paired.bearer), "").await;
    assert_eq!(status, 200);
    assert_eq!(body.trim(), "[]");
}

#[tokio::test]
async fn terminal_socket_rejects_non_attach_first_frames_and_bad_ids() {
    let (engine, rx) = Engine::new(default_registry(), SkillLibrary::new(builtin_skills()));
    let events = fanout(rx);
    let auth = Arc::new(AuthState::load(None));
    let token = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
    let paired = auth.pair(&token, "Terminal test").expect("pairing succeeds");
    let (addr, _handle) = bind_and_serve(
        Arc::new(engine),
        events,
        "127.0.0.1:0".parse().unwrap(),
        auth.clone(),
    )
    .await
    .unwrap();

    // Input before attach is refused.
    let ticket = auth.issue_ws_ticket(&paired.device_id);
    let url = format!("ws://{addr}/ws/terminal?ticket={ticket}");
    let (mut ws, _) = tokio_tungstenite::connect_async(url.as_str()).await.unwrap();
    ws.send(Message::Text(r#"{"op":"input","data":"ls\r"}"#.into()))
        .await
        .unwrap();
    let error = frame_matching(&mut ws, "error", |v| v["kind"] == "error").await;
    assert!(
        error["message"]
            .as_str()
            .is_some_and(|m| m.contains("attach")),
        "got: {error}"
    );

    // A traversal-shaped terminal id never reaches the PTY layer.
    let ticket = auth.issue_ws_ticket(&paired.device_id);
    let url = format!("ws://{addr}/ws/terminal?ticket={ticket}");
    let (mut ws, _) = tokio_tungstenite::connect_async(url.as_str()).await.unwrap();
    ws.send(Message::Text(
        r#"{"op":"attach","id":"../etc","rows":24,"cols":80}"#.into(),
    ))
    .await
    .unwrap();
    let error = frame_matching(&mut ws, "error", |v| v["kind"] == "error").await;
    assert_eq!(error["message"], "invalid terminal id");
}
