//! `codetwo-server` — run the engine headless and expose it for remote control.
//!
//! Env: `CODETWO_HOST` (default 0.0.0.0), `CODETWO_PORT` (default 4599), `CODETWO_TOKEN`
//! (default: a fresh random token). Shares `~/.codetwo/codetwo.db` with the desktop app.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use codetwo_core::provider::default_registry;
use codetwo_core::skill::{builtin_skills, SkillLibrary};
use codetwo_core::{Engine, Store};
use codetwo_server::{bind_and_serve, fanout, print_pairing};

fn data_dir() -> PathBuf {
    let home = std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir());
    home.join(".codetwo")
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let host = std::env::var("CODETWO_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    let port: u16 = std::env::var("CODETWO_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(4599);
    let token = std::env::var("CODETWO_TOKEN").unwrap_or_else(|_| uuid::Uuid::new_v4().simple().to_string());

    let dir = data_dir();
    std::fs::create_dir_all(&dir).ok();
    let store = Store::open(dir.join("codetwo.db").to_string_lossy().as_ref()).ok().map(Arc::new);
    // Headless: sessions pick their cwd later, so only user-level harness skill dirs are scanned.
    let mut skill_vec = builtin_skills();
    skill_vec.extend(codetwo_core::harness::discover(None));
    let skills = SkillLibrary::new(skill_vec);
    let (engine, rx) = match store {
        Some(s) => Engine::with_store(default_registry(), skills, s),
        None => Engine::new(default_registry(), skills),
    };

    let events = fanout(rx);
    let addr: SocketAddr = format!("{host}:{port}").parse().expect("valid host:port");
    let (local, handle) = bind_and_serve(Arc::new(engine), events, addr, token.clone()).await?;

    print_pairing(local.port(), &token);
    println!("  listening on {local}\n");
    let _ = handle.await;
    Ok(())
}
