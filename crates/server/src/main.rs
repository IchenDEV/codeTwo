//! `codetwo-server` — run the engine headless and expose it for remote control.
//!
//! Env: `CODETWO_HOST` (default 0.0.0.0), `CODETWO_PORT` (default 4599), `CODETWO_PAIR_TTL`
//! (pairing-token lifetime in seconds, default 900). Shares `~/.codetwo/codetwo.db` with the
//! desktop app; paired devices persist in `~/.codetwo/remote-devices.json`.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use codetwo_plugins::{AppConfig, CanvasService, CoreApp, EngineService, EventBus, StoreService};
use codetwo_server::{bind_and_serve_with_canvas, print_pairing, AuthState, DEFAULT_PAIRING_TTL};

fn data_dir() -> PathBuf {
    let home = codetwo_core::provider::home_dir().unwrap_or_else(std::env::temp_dir);
    home.join(".codetwo")
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let host = std::env::var("CODETWO_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("CODETWO_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4599);
    let pair_ttl = std::env::var("CODETWO_PAIR_TTL")
        .ok()
        .and_then(|s| s.parse().ok())
        .map(Duration::from_secs)
        .unwrap_or(DEFAULT_PAIRING_TTL);

    let dir = data_dir();
    std::fs::create_dir_all(&dir)?;
    let core = CoreApp::boot(AppConfig::new(&dir))
        .await
        .map_err(std::io::Error::other)?;
    let engine = core
        .service::<EngineService>()
        .ok_or_else(|| std::io::Error::other("engine plugin did not load"))?
        .0
        .clone();
    let store = core
        .service::<StoreService>()
        .ok_or_else(|| std::io::Error::other("store plugin did not load"))?
        .0
        .clone();
    let events = core
        .service::<EventBus>()
        .ok_or_else(|| std::io::Error::other("bus plugin did not load"))?
        .0
        .clone();
    let canvas_gate = core
        .service::<CanvasService>()
        .ok_or_else(|| std::io::Error::other("canvas plugin did not load"))?
        .gate;

    let auth = Arc::new(AuthState::load(Some(dir.join("remote-devices.json"))));
    let pairing_token = auth.issue_pairing_token(pair_ttl);

    let addr: SocketAddr = format!("{host}:{port}").parse().expect("valid host:port");
    let (local, handle) =
        bind_and_serve_with_canvas(engine, events, addr, auth.clone(), store, canvas_gate).await?;

    print_pairing(local.port(), &pairing_token);
    let paired = auth.list_devices().len();
    if paired > 0 {
        println!("  {paired} previously paired device(s) can reconnect without a new link.\n");
    }
    println!("  listening on {local}\n");
    let _ = handle.await;
    Ok(())
}
