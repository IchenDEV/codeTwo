//! codeTwo remote-control server.
//!
//! Exposes the shared [`Engine`] over WebSocket so another device can drive it: clients send `Op`
//! JSON, and the server streams `Event` JSON back. The same engine can be shared with the desktop
//! app (via the broadcast sender), so remote and local see one set of sessions.
//!
//! Access is gated t3code-style (see [`auth`]): a one-time pairing token (in the pairing URL's
//! fragment) is exchanged at `POST /api/pair` for a per-device bearer; the bearer buys short-lived
//! single-use WebSocket tickets at `POST /api/ws-ticket`; and `/ws?ticket=…` is the only place a
//! credential ever appears in a query string.
//!
//! Wire protocol (over the socket):
//! - client → server: a raw [`Op`] object, e.g. `{"op":"prompt","session":"…","doc":[…]}`, or a
//!   request like `{"req":"transcript","session":"…"}`.
//! - server → client: `{"kind":"sessions",…}` once on connect, `{"kind":"event",…}` per engine
//!   event, `{"kind":"transcript",…}` in reply to a transcript request, and `{"kind":"lagged",…}`
//!   if the client fell behind and events were dropped.

mod auth;

pub use auth::{AuthState, Device, DeviceInfo, Paired, DEFAULT_PAIRING_TTL, WS_TICKET_TTL};

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{any, get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc};

use codetwo_core::{Engine, Event, Op, Part, Role, Session, SessionId};

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Outbound {
    Sessions { sessions: Vec<Session> },
    Event { event: Event },
    Transcript { session: SessionId, parts: Vec<TranscriptEntry> },
    /// The event stream fell behind and `missed` events were dropped for this client. Re-request
    /// the transcript of the session you're watching to resync.
    Lagged { missed: u64 },
}

#[derive(Serialize)]
struct TranscriptEntry {
    role: Role,
    part: Part,
}

/// What a client may send besides a bare [`Op`].
#[derive(Deserialize)]
#[serde(tag = "req", rename_all = "snake_case")]
enum Req {
    /// Ask for a session's persisted transcript (replayed as one `transcript` frame).
    Transcript { session: SessionId },
    /// Ask for a fresh session-list snapshot.
    Sessions,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Inbound {
    Op(Op),
    Req(Req),
}

struct ServerState {
    engine: Arc<Engine>,
    events: broadcast::Sender<Event>,
    auth: Arc<AuthState>,
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
/// address and the serving task handle. `auth` carries pairing/session state; share one instance
/// with the host app so it can mint pairing tokens and manage devices while the server runs.
pub async fn bind_and_serve(
    engine: Arc<Engine>,
    events: broadcast::Sender<Event>,
    addr: SocketAddr,
    auth: Arc<AuthState>,
) -> std::io::Result<(SocketAddr, tokio::task::JoinHandle<()>)> {
    let state = Arc::new(ServerState { engine, events, auth });
    let app = Router::new()
        .route("/", get(index))
        .route("/health", get(|| async { "ok" }))
        .route("/api/pair", post(pair))
        .route("/api/ws-ticket", post(ws_ticket))
        .route("/ws", any(ws_handler))
        .with_state(state);

    let listener = TcpListener::bind(addr).await?;
    let local = listener.local_addr()?;
    let handle = tokio::spawn(async move {
        let _ = axum::serve(listener, app.into_make_service()).await;
    });
    Ok((local, handle))
}

#[derive(Deserialize)]
struct PairBody {
    token: String,
    #[serde(default)]
    device_name: String,
}

/// Exchange a one-time pairing token for a per-device bearer.
async fn pair(State(st): State<Arc<ServerState>>, Json(body): Json<PairBody>) -> Response {
    match st.auth.pair(&body.token, &body.device_name) {
        Some(paired) => Json(paired).into_response(),
        None => (StatusCode::UNAUTHORIZED, "invalid or expired pairing token").into_response(),
    }
}

fn bearer_from(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::trim)
}

#[derive(Serialize)]
struct WsTicketReply {
    ticket: String,
    expires_in: u64,
}

/// Mint a short-lived single-use WebSocket ticket for a paired device (bearer in the
/// `Authorization` header).
async fn ws_ticket(State(st): State<Arc<ServerState>>, headers: HeaderMap) -> Response {
    let Some(device_id) = bearer_from(&headers).and_then(|b| st.auth.authorize_bearer(b)) else {
        return (StatusCode::UNAUTHORIZED, "invalid bearer").into_response();
    };
    let ticket = st.auth.issue_ws_ticket(&device_id);
    Json(WsTicketReply { ticket, expires_in: WS_TICKET_TTL.as_secs() }).into_response()
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(q): Query<HashMap<String, String>>,
    State(st): State<Arc<ServerState>>,
) -> Response {
    let ok = q.get("ticket").is_some_and(|t| st.auth.take_ws_ticket(t).is_some());
    if !ok {
        return (StatusCode::UNAUTHORIZED, "invalid or expired ticket").into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, st))
}

async fn handle_socket(socket: WebSocket, st: Arc<ServerState>) {
    let (mut sender, mut receiver) = socket.split();

    // One outbound lane per client: engine events and request replies both go through it, so the
    // socket sender lives in exactly one task.
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Outbound>();

    // Welcome: a snapshot of sessions.
    let _ = out_tx.send(Outbound::Sessions { sessions: st.engine.list_sessions() });

    // Forward engine events into the outbound lane. A slow client that overflows the broadcast
    // buffer is told what it missed and stays connected, instead of being silently dropped.
    let mut ev_rx = st.events.subscribe();
    let ev_out = out_tx.clone();
    let event_task = tokio::spawn(async move {
        loop {
            match ev_rx.recv().await {
                Ok(ev) => {
                    if ev_out.send(Outbound::Event { event: ev }).is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(missed)) => {
                    let _ = ev_out.send(Outbound::Lagged { missed });
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Drain the outbound lane into the socket.
    let mut send_task = tokio::spawn(async move {
        while let Some(out) = out_rx.recv().await {
            let msg = serde_json::to_string(&out).unwrap_or_default();
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // Client → engine: each text message is an Op or a Req.
    let recv_engine = st.engine.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                match serde_json::from_str::<Inbound>(&text) {
                    Ok(Inbound::Op(op)) => {
                        // A submit error (e.g. provider binary missing) never reaches the event
                        // stream — the desktop sees it as the command result. Give the remote
                        // client the same courtesy instead of silence.
                        if let Err(e) = recv_engine.submit(op).await {
                            let _ = out_tx.send(Outbound::Event {
                                event: Event::Error { session: None, message: e.to_string() },
                            });
                        }
                    }
                    Ok(Inbound::Req(Req::Transcript { session })) => {
                        let parts = recv_engine
                            .transcript(&session)
                            .into_iter()
                            .map(|(role, part)| TranscriptEntry { role, part })
                            .collect();
                        let _ = out_tx.send(Outbound::Transcript { session, parts });
                    }
                    Ok(Inbound::Req(Req::Sessions)) => {
                        let _ = out_tx.send(Outbound::Sessions { sessions: recv_engine.list_sessions() });
                    }
                    Err(e) => tracing::debug!("remote: bad message: {e}"),
                }
            }
        }
    });

    // If either side ends, tear down the rest.
    tokio::select! {
        _ = &mut send_task => { recv_task.abort(); event_task.abort(); }
        _ = &mut recv_task => { send_task.abort(); event_task.abort(); }
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

/// The pairing URL a device opens to connect. The one-time token rides in the fragment so it never
/// appears in a request line or server log.
pub fn pairing_url(port: u16, pairing_token: &str) -> String {
    let host = local_ip().map(|ip| ip.to_string()).unwrap_or_else(|| "127.0.0.1".into());
    format!("http://{host}:{port}/#token={pairing_token}")
}

/// Print a pairing panel (URL, token, and a scannable QR) to the terminal, t3code-style.
pub fn print_pairing(port: u16, pairing_token: &str) {
    let url = pairing_url(port, pairing_token);
    println!("\n  codeTwo remote is live.\n");
    println!("  Open on another device (link is one-time, expires in 15 minutes):");
    println!("    {url}\n");
    println!("  Pairing token: {pairing_token}\n");
    if let Ok(code) = qrcode::QrCode::new(url.as_bytes()) {
        let img = code
            .render::<qrcode::render::unicode::Dense1x2>()
            .quiet_zone(true)
            .build();
        println!("{img}\n");
    }
}

/// A pairing QR code as an SVG document, for embedding in a UI.
pub fn pairing_qr_svg(url: &str) -> Option<String> {
    let code = qrcode::QrCode::new(url.as_bytes()).ok()?;
    Some(
        code.render::<qrcode::render::svg::Color>()
            .min_dimensions(192, 192)
            .quiet_zone(true)
            .build(),
    )
}

const INDEX_HTML: &str = include_str!("client.html");

#[cfg(test)]
mod tests {
    #[test]
    fn pairing_url_puts_token_in_fragment() {
        let u = super::pairing_url(4599, "abc");
        assert!(u.contains(":4599/#token=abc"), "got: {u}");
    }

    #[test]
    fn qr_svg_renders() {
        let svg = super::pairing_qr_svg("http://192.168.1.2:4599/#token=abc").unwrap();
        assert!(svg.starts_with("<?xml") || svg.starts_with("<svg"), "got: {}", &svg[..20.min(svg.len())]);
    }
}
