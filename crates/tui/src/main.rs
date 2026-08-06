//! Code2 TUI entrypoint. Same core [`Engine`] as the desktop app; ratatui renders it.
//!
//! Two event sources feed one loop: a background thread reads terminal key events into a channel,
//! and the engine streams domain events. `tokio::select!` merges them; every iteration redraws.

mod app;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use app::App;
use codetwo_core::provider::default_registry;
use codetwo_core::skill::{builtin_skills, SkillLibrary};
use codetwo_core::{Engine, Op, Store};

use ratatui::crossterm::event::{self, Event as CtEvent};
use ratatui::DefaultTerminal;
use tokio::sync::mpsc;

fn data_dir() -> PathBuf {
    let home = std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir());
    home.join(".codetwo")
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).ok();
    let store = Store::open(dir.join("codetwo.db").to_string_lossy().as_ref()).ok().map(Arc::new);
    // Built-ins plus whatever harness skill directories (~/.claude/skills, .codex/skills, …) exist
    // here — the TUI runs inside the project, so its cwd is the workspace.
    let mut skill_vec = builtin_skills();
    if let Ok(plugins) = codetwo_core::plugin::load_dir(&dir.join("plugins")) {
        skill_vec.extend(plugins.into_iter().flat_map(|plugin| plugin.components));
    }
    skill_vec.extend(codetwo_core::harness::discover(std::env::current_dir().ok().as_deref()));
    let skills = SkillLibrary::new(skill_vec.clone());

    let (engine, mut engine_rx) = match store {
        Some(store) => Engine::with_store(default_registry(), skills, store),
        None => Engine::new(default_registry(), skills),
    };

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
    let result = run(&mut terminal, &mut app, &engine, &mut in_rx, &mut engine_rx).await;
    ratatui::restore();
    result
}

async fn run(
    terminal: &mut DefaultTerminal,
    app: &mut App,
    engine: &Engine,
    in_rx: &mut mpsc::UnboundedReceiver<CtEvent>,
    engine_rx: &mut mpsc::UnboundedReceiver<codetwo_core::Event>,
) -> std::io::Result<()> {
    loop {
        terminal.draw(|f| app.render(f))?;
        tokio::select! {
            Some(ev) = in_rx.recv() => {
                if let CtEvent::Key(key) = ev {
                    app.handle_key(key, engine).await;
                }
            }
            Some(ev) = engine_rx.recv() => {
                app.on_engine_event(ev);
                if let Some((session, doc)) = app.take_pending_send() {
                    let _ = engine.submit(Op::Prompt { session, doc }).await;
                }
            }
        }
        if app.should_quit {
            break;
        }
    }
    Ok(())
}
