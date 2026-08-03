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
use codetwo_core::{Engine, Store};
use codetwo_server::{bind_and_serve, fanout, print_pairing, AuthState, DEFAULT_PAIRING_TTL};

fn data_dir() -> PathBuf {
    let home = std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir());
    home.join(".codetwo")
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let host = std::env::var("CODETWO_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("CODETWO_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(4599);
    let pair_ttl = std::env::var("CODETWO_PAIR_TTL")
        .ok()
        .and_then(|s| s.parse().ok())
        .map(Duration::from_secs)
        .unwrap_or(DEFAULT_PAIRING_TTL);

    let dir = data_dir();
    std::fs::create_dir_all(&dir).ok();
    let store = Store::open(dir.join("codetwo.db").to_string_lossy().as_ref()).ok().map(Arc::new);
    let skills = SkillLibrary::new(builtin_skills());
    let (engine, rx) = match store {
        Some(s) => Engine::with_store(default_registry(), skills, s),
        None => Engine::new(default_registry(), skills),
    };

    let auth = Arc::new(AuthState::load(Some(dir.join("remote-devices.json"))));
    let pairing_token = auth.issue_pairing_token(pair_ttl);

    let events = fanout(rx);
    let addr: SocketAddr = format!("{host}:{port}").parse().expect("valid host:port");
    let (local, handle) = bind_and_serve(Arc::new(engine), events, addr, auth.clone()).await?;

    print_pairing(local.port(), &pairing_token);
    let paired = auth.list_devices().len();
    if paired > 0 {
        println!("  {paired} previously paired device(s) can reconnect without a new link.\n");
    }
    println!("  listening on {local}\n");
    let _ = handle.await;
    Ok(())
}
