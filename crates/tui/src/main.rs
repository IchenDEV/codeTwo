//! C2 TUI entrypoint. Same core as the desktop app; ratatui renders it.
//!
//! The TUI does not build a C2 — it boots one. Storage, providers, the skill library and the
//! agent loop all come out of the plugin graph ([`codetwo_core::app`]), which is also why this
//! file no longer knows the order any of them have to be constructed in.
//!
//! Two event sources feed one loop: a background thread reads terminal key events into a channel,
//! and the engine's event bus streams domain events. `tokio::select!` merges them; every iteration
//! redraws.

mod app;

use std::path::PathBuf;
use std::time::Duration;

use app::App;
use codetwo_core::app::{AppConfig, CoreApp, EngineService, EventBus, SkillService};
use codetwo_core::provider::default_registry;
use codetwo_core::Op;

use ratatui::crossterm::event::{self, Event as CtEvent};
use ratatui::DefaultTerminal;
use tokio::sync::{broadcast, mpsc};

fn data_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    home.join(".codetwo")
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let dir = data_dir();
    // A terminal frontend has no use for scenes, key bindings or the market — so it does not load
    // them. Trimming the app is a config edit, not a build flag.
    let config = AppConfig::new(&dir)
        .without("scenes")
        .without("keymap")
        .without("market");
    let core = CoreApp::boot(config).await.map_err(std::io::Error::other)?;

    let engine = core
        .service::<EngineService>()
        .ok_or_else(|| std::io::Error::other(boot_failure(&core)))?;
    let engine = &*engine;
    // The skill library resolves the workspace the TUI was started in.
    let skills = core.service::<SkillService>().ok_or_else(|| std::io::Error::other("no skills"))?;
    skills.reload(std::env::current_dir().ok().as_deref());
    let skill_vec = skills.list();
    let mut engine_rx = core
        .service::<EventBus>()
        .ok_or_else(|| std::io::Error::other("no event bus"))?
        .subscribe();

    // Terminal key events on a blocking thread → channel.
    let (in_tx, mut in_rx) = mpsc::unbounded_channel::<CtEvent>();
    std::thread::spawn(move || loop {
        match event::poll(Duration::from_millis(200)) {
            Ok(true) => {
                if let Ok(ev) = event::read() {
                    if in_tx.send(ev).is_err() {
                        break;
                    }
                }
            }
            Ok(false) => {}
            Err(_) => break,
        }
    });

    let mut terminal = ratatui::init();
    let mut app = App::new(default_registry(), skill_vec);
    app.set_sessions(engine.list_sessions().map_err(std::io::Error::other)?);
    app.load_recent_session_history(&engine)
        .map_err(std::io::Error::other)?;
    let result = run(&mut terminal, &mut app, engine, &mut in_rx, &mut engine_rx).await;
    ratatui::restore();
    result
}

/// A boot that produced no engine has an explanation in the graph; print it rather than "failed".
fn boot_failure(core: &CoreApp) -> String {
    let blocked: Vec<String> = core
        .scopes()
        .into_iter()
        .filter(|scope| scope.error.is_some() || !scope.missing.is_empty())
        .map(|scope| match scope.error {
            Some(error) => format!("{}: {error}", scope.plugin),
            None => format!("{} is waiting for {}", scope.plugin, scope.missing.join(", ")),
        })
        .collect();
    format!("the agent loop did not start — {}", blocked.join("; "))
}

async fn run(
    terminal: &mut DefaultTerminal,
    app: &mut App,
    engine: &codetwo_core::Engine,
    in_rx: &mut mpsc::UnboundedReceiver<CtEvent>,
    engine_rx: &mut broadcast::Receiver<codetwo_core::Event>,
) -> std::io::Result<()> {
    loop {
        terminal.draw(|f| app.render(f))?;
        tokio::select! {
            Some(ev) = in_rx.recv() => {
                if let CtEvent::Key(key) = ev {
                    app.handle_key(key, engine).await;
                }
            }
            Ok(ev) = engine_rx.recv() => {
                let refresh_sessions = matches!(&ev, codetwo_core::Event::SessionCreated { .. });
                app.on_engine_event(ev);
                if refresh_sessions {
                    app.set_sessions(engine.list_sessions().map_err(std::io::Error::other)?);
                }
                if let Some((session, doc, request_id)) = app.take_pending_send() {
                    if let Err(error) = engine
                        .submit(Op::Prompt {
                            session,
                            doc,
                            request_id: Some(request_id.clone()),
                        })
                        .await
                    {
                        app.on_prompt_submit_error(&request_id, &error.to_string());
                    }
                }
            }
        }
        if app.should_quit {
            break;
        }
    }
    Ok(())
}
