//! codeTwo remote-control server.
//!
//! Exposes the shared [`Engine`] over WebSocket so another device can drive it: clients send `Op`
//! JSON, and the server streams `Event` JSON back. A pairing token gates access. The same engine can
//! be shared with the desktop app (via the broadcast sender), so remote and local see one set of
//! sessions.
//!
//! Wire protocol:
//! - client → server: a raw [`Op`] object, e.g. `{"op":"prompt","session":"…","doc":[…]}`.
//! - server → client: `{"kind":"sessions","sessions":[…]}` once on connect, then
//!   `{"kind":"event","event":{…}}` per engine event.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{any, get};
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc};

use codetwo_core::{Engine, Event, Op, Session};

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Outbound {
    Sessions { sessions: Vec<Session> },
    Event { event: Event },
}

struct ServerState {
    engine: Arc<Engine>,
    events: broadcast::Sender<Event>,
    token: String,
}

/// Forward the engine's single event receiver into a broadcast channel so multiple clients (and the
/// desktop) can each subscribe. Returns the broadcast sender.
pub fn fanout(mut rx: mpsc::UnboundedReceiver<Event>) -> broadcast::Sender<Event> {
    let (tx, _) = broadcast::channel::<Event>(1024);
    let out = tx.clone();
    tokio::spawn(async move {
        while let Some(ev) = rx.recv().await {
            let _ = out.send(ev);
        }
    });
    tx
}

/// Bind the server to `addr` (use port 0 for an ephemeral port) and start serving. Returns the bound
/// address and the serving task handle.
pub async fn bind_and_serve(
    engine: Arc<Engine>,
    events: broadcast::Sender<Event>,
    addr: SocketAddr,
    token: String,
) -> std::io::Result<(SocketAddr, tokio::task::JoinHandle<()>)> {
    let state = Arc::new(ServerState { engine, events, token });
    let app = Router::new()
        .route("/", get(index))
        .route("/health", get(|| async { "ok" }))
        .route("/ws", any(ws_handler))
        .with_state(state);

    let listener = TcpListener::bind(addr).await?;
    let local = listener.local_addr()?;
    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, app.into_make_service()).await;
    });
    Ok((local, handle))
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(q): Query<HashMap<String, String>>,
    State(st): State<Arc<ServerState>>,
) -> Response {
    if q.get("token").map(String::as_str) != Some(st.token.as_str()) {
        return (StatusCode::UNAUTHORIZED, "invalid token").into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, st))
}

async fn handle_socket(socket: WebSocket, st: Arc<ServerState>) {
    let (mut sender, mut receiver) = socket.split();

    // Welcome: a snapshot of sessions.
    let sessions = st.engine.list_sessions();
    let welcome = serde_json::to_string(&Outbound::Sessions { sessions }).unwrap_or_default();
    if sender.send(Message::Text(welcome)).await.is_err() {
        return;
    }

    // Forward engine events to this client.
    let mut ev_rx = st.events.subscribe();
    let mut send_task = tokio::spawn(async move {
        while let Ok(ev) = ev_rx.recv().await {
            let msg = serde_json::to_string(&Outbound::Event { event: ev }).unwrap_or_default();
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Client → engine: each text message is an Op.
    let recv_engine = st.engine.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                match serde_json::from_str::<Op>(&text) {
                    Ok(op) => {
                        let _ = recv_engine.submit(op).await;
                    }
                    Err(e) => tracing::debug!("remote: bad op: {e}"),
                }
            }
        }
    });

    // If either side ends, tear down the other.
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
}

async fn index() -> Html<&'static str> {
    Html(INDEX_HTML)
}

/// Best-effort LAN IP (via the classic "connect a UDP socket" trick — no packets are sent).
pub fn local_ip() -> Option<std::net::IpAddr> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    sock.local_addr().ok().map(|a| a.ip())
}

/// The pairing URL a device opens to connect.
pub fn pairing_url(port: u16, token: &str) -> String {
    let host = local_ip().map(|ip| ip.to_string()).unwrap_or_else(|| "127.0.0.1".into());
    format!("http://{host}:{port}/?token={token}")
}

/// Print a pairing panel (URL, token, and a scannable QR) to the terminal, t3code-style.
pub fn print_pairing(port: u16, token: &str) {
    let url = pairing_url(port, token);
    println!("\n  codeTwo remote is live.\n");
    println!("  Open on another device:");
    println!("    {url}\n");
    println!("  Pairing token: {token}\n");
    match qrcode::QrCode::new(url.as_bytes()) {
        Ok(code) => {
            let img = code
                .render::<qrcode::render::unicode::Dense1x2>()
                .quiet_zone(true)
                .build();
            println!("{img}\n");
        }
        Err(_) => {}
    }
}

const INDEX_HTML: &str = include_str!("client.html");

#[cfg(test)]
mod tests {
    #[test]
    fn pairing_url_has_token() {
        let u = super::pairing_url(4599, "abc");
        assert!(u.contains(":4599/?token=abc"));
    }
}
