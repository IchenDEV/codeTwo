//! `codetwo-server` — run the engine headless and expose it for remote control.
//!
//! Env: `CODETWO_HOST` (default 0.0.0.0), `CODETWO_PORT` (default 4599), `CODETWO_PAIR_TTL`
//! (pairing-token lifetime in seconds, default 900). Shares `~/.codetwo/codetwo.db` with the
//! desktop app; paired devices persist in `~/.codetwo/remote-devices.json`.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use codetwo_core::provider::default_registry;
use codetwo_core::skill::{builtin_skills, SkillLibrary};
use codetwo_core::{CanvasFeatureGate, Engine, Store};
use codetwo_server::{
    bind_and_serve_with_canvas, fanout, print_pairing, AuthState, DEFAULT_PAIRING_TTL,
};

fn data_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
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
    let store = Arc::new(
        Store::open(dir.join("codetwo.db").to_string_lossy().as_ref())
            .map_err(std::io::Error::other)?,
    );
    let now_millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    if let Err(error) = store.purge_expired_canvases(now_millis) {
        eprintln!("canvas tombstone cleanup failed: {error}");
    }
    // Headless: sessions pick their cwd later, so only user-level harness skill dirs are scanned.
    let mut skill_vec = builtin_skills();
    skill_vec.extend(codetwo_core::harness::discover(None));
    let skills = SkillLibrary::new(skill_vec);
    let canvas_gate = CanvasFeatureGate::disabled();
    let (engine, rx) =
        Engine::with_store_and_canvas_gate(default_registry(), skills, store.clone(), canvas_gate);

    let auth = Arc::new(AuthState::load(Some(dir.join("remote-devices.json"))));
    let pairing_token = auth.issue_pairing_token(pair_ttl);

    let events = fanout(rx);
    let addr: SocketAddr = format!("{host}:{port}").parse().expect("valid host:port");
    let (local, handle) = bind_and_serve_with_canvas(
        Arc::new(engine),
        events,
        addr,
        auth.clone(),
        store,
        canvas_gate,
    )
    .await?;

    print_pairing(local.port(), &pairing_token);
    let paired = auth.list_devices().len();
    if paired > 0 {
        println!("  {paired} previously paired device(s) can reconnect without a new link.\n");
    }
    println!("  listening on {local}\n");
    let _ = handle.await;
    Ok(())
}
