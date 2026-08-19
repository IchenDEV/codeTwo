use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use codetwo_core::canvas::CanvasFeatureGate;
use codetwo_core::skill::{builtin_skills, SkillLibrary};
use codetwo_core::{Engine, Store};
use codetwo_server::{
    bind_and_serve, bind_and_serve_with_canvas, embedded_canvas_asset_paths, fanout, AuthState,
    DEFAULT_PAIRING_TTL,
};
use futures_util::{SinkExt, StreamExt};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_tungstenite::tungstenite::Message;

const TINY_PNG: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
    0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240, 31, 0,
    5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

struct HttpReply {
    status: u16,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

async fn http(
    addr: SocketAddr,
    method: &str,
    path: &str,
    bearer: Option<&str>,
    body: &[u8],
) -> HttpReply {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let auth = bearer
        .map(|value| format!("Authorization: Bearer {value}\r\n"))
        .unwrap_or_default();
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\n{auth}Content-Length: {}\r\n\r\n",
        body.len()
    );
    stream.write_all(request.as_bytes()).await.unwrap();
    stream.write_all(body).await.unwrap();
    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).await.unwrap();
    let separator = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .expect("HTTP response headers");
    let head = String::from_utf8_lossy(&raw[..separator]);
    let mut lines = head.lines();
    let status = lines
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse().ok())
        .unwrap_or_default();
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
        .collect();
    HttpReply {
        status,
        headers,
        body: raw[separator + 4..].to_vec(),
    }
}

fn json(reply: &HttpReply) -> serde_json::Value {
    serde_json::from_slice(&reply.body).unwrap_or_else(|error| {
        panic!(
            "expected JSON response ({}): {error}; body={:?}",
            reply.status, reply.body
        )
    })
}

fn private(reply: &HttpReply) {
    assert_eq!(
        reply.headers.get("cache-control"),
        Some(&"private, no-store, max-age=0".into())
    );
    assert_eq!(reply.headers.get("pragma"), Some(&"no-cache".into()));
    assert_eq!(
        reply.headers.get("x-content-type-options"),
        Some(&"nosniff".into())
    );
}

fn envelope(revision: u64) -> serde_json::Value {
    serde_json::json!({
        "engine": "@excalidraw/excalidraw",
        "engineVersion": "0.18.1",
        "schemaVersion": 1,
        "revision": revision,
        "theme": "light",
        "assets": [{"id": "asset-1", "mimeType": "image/png", "width": 1, "height": 1}],
        "scene": {
            "elements": [{
                "id": "text-1",
                "type": "text",
                "x": 0.0,
                "y": 0.0,
                "width": 100.0,
                "height": 30.0,
                "text": "hello canvas",
                "originalText": "hello canvas",
                "isDeleted": false,
                "opacity": 100.0
            }],
            "appState": {"activeTool": "selection"}
        }
    })
}

fn manifest() -> serde_json::Value {
    serde_json::json!({
        "objects": [{
        "id": "text-1",
        "kind": "text",
        "originalText": "hello canvas",
        "bounds": {"x": 0.0, "y": 0.0, "width": 100.0, "height": 30.0},
        "layer": 0
    }]
    })
}

fn update_body(expected_revision: u64) -> serde_json::Value {
    serde_json::json!({
        "title": "Board",
        "theme": "light",
        "envelope": envelope(expected_revision),
        "manifest": manifest(),
        "assets": [{"id": "asset-1", "mimeType": "image/png", "width": 1, "height": 1, "bytes": TINY_PNG}],
        "expectedRevision": expected_revision
    })
}

fn freeze_body(expected_revision: u64) -> serde_json::Value {
    serde_json::json!({
        "title": "Board",
        "theme": "light",
        "envelope": envelope(expected_revision),
        "manifest": manifest(),
        "assets": [{"id": "asset-1", "mimeType": "image/png", "width": 1, "height": 1, "bytes": TINY_PNG}],
        "exports": [
            {"id": "overview", "kind": "overview", "mimeType": "image/png", "width": 1, "height": 1, "bytes": TINY_PNG},
            {"id": "detail-0", "kind": "detail", "index": 0, "mimeType": "image/png", "width": 1, "height": 1, "bytes": TINY_PNG}
        ],
        "expectedRevision": expected_revision
    })
}

async fn enabled_server() -> (
    SocketAddr,
    Arc<AuthState>,
    String,
    String,
    tokio::task::JoinHandle<()>,
) {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let (engine, receiver) = Engine::with_store_and_canvas_gate(
        codetwo_core::provider::default_registry(),
        SkillLibrary::new(builtin_skills()),
        store.clone(),
        CanvasFeatureGate::enabled_for_tests(),
    );
    let auth = Arc::new(AuthState::load(None));
    let first = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
    let second = auth.issue_pairing_token(DEFAULT_PAIRING_TTL);
    let first = auth.pair(&first, "first").unwrap().bearer;
    let second = auth.pair(&second, "second").unwrap().bearer;
    let (addr, handle) = bind_and_serve_with_canvas(
        Arc::new(engine),
        fanout(receiver),
        "127.0.0.1:0".parse().unwrap(),
        auth.clone(),
        store,
        CanvasFeatureGate::enabled_for_tests(),
    )
    .await
    .unwrap();
    (addr, auth, first, second, handle)
}

#[tokio::test]
async fn canvas_http_lifecycle_is_authenticated_owner_scoped_and_private() {
    let (addr, _auth, first, second, handle) = enabled_server().await;

    let embedded = embedded_canvas_asset_paths().collect::<Vec<_>>();
    for (suffix, content_type) in [
        ("canvas-island.js", "text/javascript; charset=utf-8"),
        (".css", "text/css; charset=utf-8"),
        (".woff2", "font/woff2"),
    ] {
        let path = embedded
            .iter()
            .find(|path| **path == suffix || path.ends_with(suffix))
            .copied()
            .unwrap_or_else(|| panic!("embedded Canvas asset missing: {suffix}"));
        let reply = http(addr, "GET", &format!("/canvas/{path}"), None, b"").await;
        assert_eq!(reply.status, 200, "asset route {path}");
        private(&reply);
        assert_eq!(
            reply.headers.get("content-type"),
            Some(&content_type.into())
        );
        assert!(!reply.body.is_empty());
    }
    let chunk = embedded
        .iter()
        .find(|path| path.ends_with(".js") && **path != "canvas-island.js")
        .copied()
        .expect("embedded Canvas chunk");
    let chunk_reply = http(addr, "GET", &format!("/canvas/{chunk}"), None, b"").await;
    assert_eq!(chunk_reply.status, 200, "chunk route {chunk}");
    private(&chunk_reply);
    assert_eq!(
        chunk_reply.headers.get("content-type"),
        Some(&"text/javascript; charset=utf-8".into())
    );
    assert!(!chunk_reply.body.is_empty());
    let stable_css = http(addr, "GET", "/canvas/canvas.css", None, b"").await;
    assert_eq!(stable_css.status, 200);
    private(&stable_css);
    assert_eq!(stable_css.headers.get("content-type"), Some(&"text/css; charset=utf-8".into()));
    let canvas_page = http(addr, "GET", "/canvas", None, b"").await;
    assert_eq!(canvas_page.status, 200);
    private(&canvas_page);
    assert!(String::from_utf8_lossy(&canvas_page.body).contains("C2 remote"));
    let traversal = http(addr, "GET", "/canvas/%2e%2e/client.html", None, b"").await;
    assert_eq!(traversal.status, 404);
    private(&traversal);

    let unauthenticated = http(addr, "GET", "/api/canvas/feature", None, b"").await;
    assert_eq!(unauthenticated.status, 401);
    private(&unauthenticated);

    let feature = http(addr, "GET", "/api/canvas/feature", Some(&first), b"").await;
    assert_eq!(feature.status, 200);
    private(&feature);
    let feature_json = json(&feature);
    assert_eq!(feature_json["enabled"], true);
    assert_eq!(feature_json["status"], "not production-enabled");

    let malformed = http(
        addr,
        "POST",
        "/api/canvas/media/normalize",
        Some(&first),
        br#"{"bytes":[1,2,3],"declaredMime":"image/png"}"#,
    )
    .await;
    assert_eq!(malformed.status, 400);
    private(&malformed);

    let created = http(
        addr,
        "POST",
        "/api/canvas/drafts",
        Some(&first),
        br#"{"title":"Board"}"#,
    )
    .await;
    assert_eq!(created.status, 200);
    private(&created);
    let created_json = json(&created);
    let canvas_id = created_json["id"].as_str().unwrap().to_string();
    assert_eq!(created_json["revision"], 1);
    assert!(created_json.get("createdAt").is_some());
    assert!(created_json.get("created_at").is_none());
    assert_eq!(created_json["owner"].as_str().unwrap().len(), 36);

    let cross_get = http(
        addr,
        "GET",
        &format!("/api/canvas/drafts/{canvas_id}"),
        Some(&second),
        b"",
    )
    .await;
    assert_eq!(cross_get.status, 404);
    private(&cross_get);
    assert_eq!(cross_get.body, b"canvas not found");

    let update = update_body(1).to_string();
    let cross_update = http(
        addr,
        "PUT",
        &format!("/api/canvas/drafts/{canvas_id}"),
        Some(&second),
        update.as_bytes(),
    )
    .await;
    assert_eq!(cross_update.status, 404);
    private(&cross_update);
    assert_eq!(cross_update.body, b"canvas not found");

    let stale = update_body(99).to_string();
    let stale = http(
        addr,
        "PUT",
        &format!("/api/canvas/drafts/{canvas_id}"),
        Some(&first),
        stale.as_bytes(),
    )
    .await;
    assert_eq!(stale.status, 409);
    private(&stale);

    let updated = update_body(1).to_string();
    let updated = http(
        addr,
        "PUT",
        &format!("/api/canvas/drafts/{canvas_id}"),
        Some(&first),
        updated.as_bytes(),
    )
    .await;
    assert_eq!(updated.status, 200);
    private(&updated);
    assert_eq!(json(&updated)["revision"], 2);

    let freeze = freeze_body(2).to_string();
    let frozen = http(
        addr,
        "POST",
        &format!("/api/canvas/drafts/{canvas_id}/freeze"),
        Some(&first),
        freeze.as_bytes(),
    )
    .await;
    assert_eq!(frozen.status, 200, "freeze response: {:?}", frozen.body);
    private(&frozen);
    let frozen_json = json(&frozen);
    assert_eq!(frozen_json["revision"], 2);
    assert!(frozen_json.get("frozenAt").is_some());
    assert!(frozen_json["envelope"].get("engineVersion").is_some());
    assert!(frozen_json["exports"][0].get("mimeType").is_some());

    let snapshot = http(
        addr,
        "GET",
        &format!("/api/canvas/{canvas_id}/revisions/2"),
        Some(&second),
        b"",
    )
    .await;
    assert_eq!(snapshot.status, 200);
    private(&snapshot);
    assert_eq!(
        json(&snapshot)["summary"]
            .as_str()
            .unwrap()
            .contains("text-1"),
        true
    );

    for (path, expected_type) in [
        (
            format!("/api/canvas/{canvas_id}/revisions/2/assets/missing"),
            None,
        ),
        (
            format!("/api/canvas/{canvas_id}/revisions/2/assets/asset-1"),
            Some("image/png"),
        ),
        (
            format!("/api/canvas/{canvas_id}/revisions/2/exports/detail-0"),
            Some("image/png"),
        ),
    ] {
        let reply = http(addr, "GET", &path, Some(&second), b"").await;
        private(&reply);
        if let Some(expected_type) = expected_type {
            assert_eq!(reply.status, 200);
            assert_eq!(
                reply.headers.get("content-type"),
                Some(&expected_type.into())
            );
            assert_eq!(reply.body, TINY_PNG);
        } else {
            assert_eq!(reply.status, 404);
        }
    }

    let duplicate = http(
        addr,
        "POST",
        &format!("/api/canvas/{canvas_id}/revisions/2/duplicate"),
        Some(&second),
        b"",
    )
    .await;
    assert_eq!(duplicate.status, 200);
    private(&duplicate);
    let duplicate_json = json(&duplicate);
    assert_ne!(duplicate_json["id"], canvas_id);
    assert_eq!(duplicate_json["owner"].as_str().unwrap().len(), 36);

    let tombstone = http(
        addr,
        "POST",
        &format!("/api/canvas/drafts/{canvas_id}/tombstone"),
        Some(&first),
        b"",
    )
    .await;
    assert_eq!(tombstone.status, 204);
    private(&tombstone);
    let cross_tombstone = http(
        addr,
        "POST",
        &format!("/api/canvas/drafts/{canvas_id}/tombstone"),
        Some(&second),
        b"",
    )
    .await;
    assert_eq!(cross_tombstone.status, 404);
    private(&cross_tombstone);

    let restore = http(
        addr,
        "POST",
        &format!("/api/canvas/drafts/{canvas_id}/restore"),
        Some(&first),
        b"",
    )
    .await;
    assert_eq!(restore.status, 204);
    private(&restore);
    let _ = http(
        addr,
        "POST",
        &format!("/api/canvas/drafts/{canvas_id}/tombstone"),
        Some(&first),
        b"",
    )
    .await;
    let purge = http(
        addr,
        "POST",
        &format!("/api/canvas/drafts/{canvas_id}/purge"),
        Some(&first),
        b"",
    )
    .await;
    assert_eq!(purge.status, 200);
    private(&purge);
    assert_eq!(json(&purge)["purged"], true);
    let after_purge = http(
        addr,
        "GET",
        &format!("/api/canvas/drafts/{canvas_id}"),
        Some(&first),
        b"",
    )
    .await;
    assert_eq!(after_purge.status, 404);
    private(&after_purge);
    let history_after_purge = http(
        addr,
        "GET",
        &format!("/api/canvas/{canvas_id}/revisions/2"),
        Some(&second),
        b"",
    )
    .await;
    assert_eq!(history_after_purge.status, 200);
    private(&history_after_purge);

    handle.abort();
}

#[tokio::test]
async fn canvas_ws_rejects_unknown_frozen_reference_and_legacy_server_stays_disabled() {
    let (addr, auth, first, _second, handle) = enabled_server().await;
    let device_id = auth.list_devices()[0].id.clone();
    let ticket = auth.issue_ws_ticket(&device_id);
    let (mut socket, _) =
        tokio_tungstenite::connect_async(format!("ws://{addr}/ws?ticket={ticket}"))
            .await
            .unwrap();
    let _welcome = socket.next().await.unwrap().unwrap();
    socket
        .send(Message::Text(
            serde_json::json!({
                "op": "prompt",
                "session": "missing-session",
                "doc": [{"type": "canvas", "id": "not-frozen", "frozen_revision": 1}],
                "request_id": "canvas-preflight"
            })
            .to_string()
            .into(),
        ))
        .await
        .unwrap();
    let response = tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let text = socket.next().await.unwrap().unwrap().into_text().unwrap();
            if text.contains("canvas not found") || text.contains("not-frozen@1") {
                break text;
            }
        }
    })
    .await
    .expect("Canvas reference preflight error");
    assert!(response.contains("canvas-preflight"));
    drop(socket);
    handle.abort();

    let store = Arc::new(Store::open_in_memory().unwrap());
    let (engine, receiver) = Engine::new(
        codetwo_core::provider::default_registry(),
        SkillLibrary::new(builtin_skills()),
    );
    let (legacy_addr, legacy_handle) = bind_and_serve(
        Arc::new(engine),
        fanout(receiver),
        "127.0.0.1:0".parse().unwrap(),
        auth,
    )
    .await
    .unwrap();
    let feature = http(legacy_addr, "GET", "/api/canvas/feature", Some(&first), b"").await;
    assert_eq!(feature.status, 200);
    private(&feature);
    assert_eq!(json(&feature)["enabled"], false);
    assert_eq!(json(&feature)["status"], "not production-enabled");
    let create = http(
        legacy_addr,
        "POST",
        "/api/canvas/drafts",
        Some(&first),
        br#"{"title":"disabled"}"#,
    )
    .await;
    assert_eq!(create.status, 403);
    private(&create);
    drop(store);
    legacy_handle.abort();
}
