//! Code2 remote-control server.
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
//!   if the client fell behind and events were dropped. Snapshot failures are explicit
//!   `{"kind":"sessions_error",…}` frames, never successful empty lists.

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

use codetwo_core::{
    Engine, Event, Op, Session, SessionId, TranscriptCursor, TranscriptEntry,
    DEFAULT_TRANSCRIPT_TURNS,
};

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Outbound {
    Sessions {
        sessions: Vec<Session>,
    },
    SessionsError {
        message: String,
    },
    Event {
        event: Event,
    },
    Transcript {
        session: SessionId,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        entries: Vec<TranscriptEntry>,
        next_before: Option<TranscriptCursor>,
        snapshot_through: Option<TranscriptCursor>,
    },
    TranscriptError {
        session: SessionId,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        message: String,
    },
    /// The event stream fell behind and `missed` events were dropped for this client. Re-request
    /// the transcript of the session you're watching to resync.
    Lagged {
        missed: u64,
    },
}

/// What a client may send besides a bare [`Op`].
#[derive(Deserialize)]
#[serde(tag = "req", rename_all = "snake_case")]
enum Req {
    /// Ask for a session's persisted transcript (replayed as one `transcript` frame).
    Transcript {
        session: SessionId,
        #[serde(default)]
        before: Option<TranscriptCursor>,
        #[serde(default)]
        limit: Option<usize>,
        #[serde(default)]
        request_id: Option<String>,
    },
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
    let state = Arc::new(ServerState {
        engine,
        events,
        auth,
    });
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
    Json(WsTicketReply {
        ticket,
        expires_in: WS_TICKET_TTL.as_secs(),
    })
    .into_response()
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(q): Query<HashMap<String, String>>,
    State(st): State<Arc<ServerState>>,
) -> Response {
    let ok = q
        .get("ticket")
        .is_some_and(|t| st.auth.take_ws_ticket(t).is_some());
    if !ok {
        return (StatusCode::UNAUTHORIZED, "invalid or expired ticket").into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, st))
}

async fn handle_socket(socket: WebSocket, st: Arc<ServerState>) {
    let (mut sender, mut receiver) = socket.split();

    // One outbound lane per client: engine events and request replies both go through it, so the
    // socket sender lives in exactly one task.
    let (out_tx, mut out_rx) = mpsc::channel::<Outbound>(256);

    // Welcome: a snapshot of sessions.
    let welcome = match st.engine.list_sessions() {
        Ok(sessions) => Outbound::Sessions { sessions },
        Err(error) => Outbound::SessionsError {
            message: error.to_string(),
        },
    };
    let _ = out_tx.send(welcome).await;

    // Forward engine events into the outbound lane. A slow client that overflows the broadcast
    // buffer is told what it missed and stays connected, instead of being silently dropped.
    let mut ev_rx = st.events.subscribe();
    let ev_out = out_tx.clone();
    let event_task = tokio::spawn(async move {
        loop {
            match ev_rx.recv().await {
                Ok(ev) => {
                    if ev_out.send(Outbound::Event { event: ev }).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(missed)) => {
                    let _ = ev_out.send(Outbound::Lagged { missed }).await;
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

    // Keep accepted inbound work independent of the socket's lifetime. `Engine::submit(Prompt)`
    // publishes TurnStarted before it may have to revive/create the provider session; cancelling
    // that future on disconnect would release the core turn lease without a terminal event and
    // strand every other connected frontend in a false running state. A bounded, ordered worker
    // preserves per-client message ordering and finishes already accepted work after disconnect.
    let (in_tx, mut in_rx) = mpsc::channel::<Inbound>(16);
    let work_engine = st.engine.clone();
    let work_out = out_tx.clone();
    let _work_task = tokio::spawn(async move {
        while let Some(inbound) = in_rx.recv().await {
            match inbound {
                Inbound::Op(op) => {
                    let (session, request_id) = match &op {
                        Op::NewSession { request_id, .. } => (None, request_id.clone()),
                        Op::Prompt {
                            session,
                            request_id,
                            ..
                        } => (Some(session.clone()), request_id.clone()),
                        _ => (None, None),
                    };
                    // A submit error (for example a missing provider binary) does not necessarily
                    // reach the engine event stream. Give the initiating remote client the same
                    // command-result feedback as Desktop while it remains connected.
                    if let Err(error) = work_engine.submit(op).await {
                        let _ = work_out
                            .send(Outbound::Event {
                                event: Event::Error {
                                    session,
                                    message: error.to_string(),
                                    terminal: true,
                                    request_id,
                                },
                            })
                            .await;
                    }
                }
                Inbound::Req(Req::Transcript {
                    session,
                    before,
                    limit,
                    request_id,
                }) => match work_engine.transcript_page(
                    &session,
                    before,
                    limit.unwrap_or(DEFAULT_TRANSCRIPT_TURNS),
                ) {
                    Ok(page) => {
                        let _ = work_out
                            .send(Outbound::Transcript {
                                session,
                                request_id,
                                entries: page.entries,
                                next_before: page.next_before,
                                snapshot_through: page.snapshot_through,
                            })
                            .await;
                    }
                    Err(error) => {
                        let _ = work_out
                            .send(Outbound::TranscriptError {
                                session,
                                request_id,
                                message: error.to_string(),
                            })
                            .await;
                    }
                },
                Inbound::Req(Req::Sessions) => {
                    let reply = match work_engine.list_sessions() {
                        Ok(sessions) => Outbound::Sessions { sessions },
                        Err(error) => Outbound::SessionsError {
                            message: error.to_string(),
                        },
                    };
                    let _ = work_out.send(reply).await;
                }
            }
        }
    });

    // Client → ordered worker: parsing remains tied to the socket, accepted work does not.
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                match serde_json::from_str::<Inbound>(&text) {
                    Ok(inbound) => {
                        if in_tx.send(inbound).await.is_err() {
                            break;
                        }
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

/// One address the desktop can advertise for remote pairing. IDs are stable across refreshes so
/// the frontend can keep a selection without treating the URL itself as identity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PairingEndpoint {
    pub id: String,
    pub label: String,
    pub url: String,
    /// False for loopback: copying it for another browser on this machine is valid, but a phone
    /// scanning that URL would connect to itself.
    pub qr_shareable: bool,
}

/// Addresses advertised by a server bound on all interfaces. LAN is preferred for pairing; the
/// loopback address is always retained for same-machine use and as a safe fallback.
pub fn pairing_endpoints(port: u16) -> Vec<PairingEndpoint> {
    let mut endpoints = Vec::new();
    if let Some(ip) = local_ip() {
        endpoints.push(PairingEndpoint {
            id: "lan".into(),
            label: "LAN".into(),
            url: format!("http://{ip}:{port}/"),
            qr_shareable: true,
        });
    }
    endpoints.push(PairingEndpoint {
        id: "loopback".into(),
        label: "Loopback".into(),
        url: format!("http://127.0.0.1:{port}/"),
        qr_shareable: false,
    });
    endpoints
}

/// Resolve an explicitly requested endpoint, or prefer the first address that is meaningful to a
/// second device. Validation happens before a pairing token is issued by callers.
pub fn select_pairing_endpoint<'a>(
    endpoints: &'a [PairingEndpoint],
    requested_id: Option<&str>,
) -> Result<&'a PairingEndpoint, String> {
    if let Some(id) = requested_id {
        return endpoints
            .iter()
            .find(|endpoint| endpoint.id == id)
            .ok_or_else(|| format!("unknown pairing endpoint: {id}"));
    }
    endpoints
        .iter()
        .find(|endpoint| endpoint.qr_shareable)
        .or_else(|| endpoints.first())
        .ok_or_else(|| "no pairing endpoints are available".to_string())
}

/// Attach the one-time token as a fragment, never as a query or request-path credential.
pub fn pairing_url_for_endpoint(endpoint_url: &str, pairing_token: &str) -> String {
    format!(
        "{}/#token={pairing_token}",
        endpoint_url.trim_end_matches('/')
    )
}

/// The pairing URL a device opens to connect. The one-time token rides in the fragment so it never
/// appears in a request line or server log.
pub fn pairing_url(port: u16, pairing_token: &str) -> String {
    let endpoints = pairing_endpoints(port);
    let endpoint = select_pairing_endpoint(&endpoints, None)
        .expect("pairing_endpoints always includes the loopback fallback");
    pairing_url_for_endpoint(&endpoint.url, pairing_token)
}

/// Print a pairing panel (URL, token, and a scannable QR) to the terminal, t3code-style.
pub fn print_pairing(port: u16, pairing_token: &str) {
    let endpoints = pairing_endpoints(port);
    let endpoint = select_pairing_endpoint(&endpoints, None)
        .expect("pairing_endpoints always includes the loopback fallback");
    let url = pairing_url_for_endpoint(&endpoint.url, pairing_token);
    println!("\n  Code2 remote is live.\n");
    if endpoint.qr_shareable {
        println!("  Open on another device (link is one-time, expires in 15 minutes):");
    } else {
        println!(
            "  Open in another browser on this machine (link is one-time, expires in 15 minutes):"
        );
    }
    println!("    {url}\n");
    println!("  Pairing token: {pairing_token}\n");
    if endpoint.qr_shareable {
        if let Ok(code) = qrcode::QrCode::new(url.as_bytes()) {
            let img = code
                .render::<qrcode::render::unicode::Dense1x2>()
                .quiet_zone(true)
                .build();
            println!("{img}\n");
        }
    } else {
        println!("  Loopback is not reachable from another device, so no QR code is shown.\n");
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
    use super::{Outbound, PairingEndpoint, TranscriptCursor, TranscriptEntry};
    use codetwo_core::{Part, Role};

    fn endpoint(id: &str, qr_shareable: bool) -> PairingEndpoint {
        PairingEndpoint {
            id: id.into(),
            label: id.into(),
            url: format!("http://{id}.example/"),
            qr_shareable,
        }
    }

    #[test]
    fn pairing_url_puts_token_in_fragment() {
        let u = super::pairing_url(4599, "abc");
        assert!(u.contains(":4599/#token=abc"), "got: {u}");
    }

    #[test]
    fn pairing_url_for_endpoint_normalizes_the_slash_before_the_fragment() {
        assert_eq!(
            super::pairing_url_for_endpoint("http://device.example///", "abc"),
            "http://device.example/#token=abc"
        );
    }

    #[test]
    fn endpoint_selection_validates_requests_and_prefers_qr_shareable_addresses() {
        let endpoints = vec![endpoint("loopback", false), endpoint("lan", true)];
        assert_eq!(
            super::select_pairing_endpoint(&endpoints, None).unwrap().id,
            "lan"
        );
        assert_eq!(
            super::select_pairing_endpoint(&endpoints, Some("loopback"))
                .unwrap()
                .id,
            "loopback"
        );
        assert!(super::select_pairing_endpoint(&endpoints, Some("missing")).is_err());
    }

    #[test]
    fn endpoint_selection_falls_back_when_only_loopback_exists() {
        let endpoints = vec![endpoint("loopback", false)];
        assert_eq!(
            super::select_pairing_endpoint(&endpoints, None).unwrap().id,
            "loopback"
        );
    }

    #[test]
    fn qr_svg_renders() {
        let svg = super::pairing_qr_svg("http://192.168.1.2:4599/#token=abc").unwrap();
        assert!(
            svg.starts_with("<?xml") || svg.starts_with("<svg"),
            "got: {}",
            &svg[..20.min(svg.len())]
        );
    }

    #[test]
    fn transcript_frame_preserves_the_canonical_prompt_variant() {
        let frame = Outbound::Transcript {
            session: "session-1".into(),
            request_id: Some("page-1".into()),
            entries: vec![TranscriptEntry {
                seq: 7,
                role: Role::User,
                part: Part::Prompt {
                    text: "full\n  prompt".into(),
                    display: "full prompt".into(),
                },
            }],
            next_before: Some(TranscriptCursor(7)),
            snapshot_through: Some(TranscriptCursor(7)),
        };
        let value = serde_json::to_value(frame).unwrap();
        assert_eq!(value["kind"], "transcript");
        assert_eq!(value["request_id"], "page-1");
        assert_eq!(value["entries"][0]["seq"], 7);
        assert_eq!(value["entries"][0]["part"]["kind"], "prompt");
        assert_eq!(value["entries"][0]["part"]["text"], "full\n  prompt");
        assert_eq!(value["next_before"], 7);
    }
}
