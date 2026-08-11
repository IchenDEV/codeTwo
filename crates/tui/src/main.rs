//! Code2 TUI entrypoint. The TUI is a client of the single local daemon; ratatui renders its
//! snapshots and ordered event stream.
//!
//! Two event sources feed one loop: a background thread reads terminal key events into a channel,
//! and the engine streams domain events. `tokio::select!` merges them; every iteration redraws.

mod app;

use std::time::Duration;

use app::App;
use codetwo_client::{Client, SubscriptionMessage, SubscriptionReceiver};
use codetwo_core::provider::default_registry;
use codetwo_core::skill::builtin_skills;
use codetwo_core::Op;
use codetwo_daemon::{Daemon, DataLayout, LegacyDataDecision};
use codetwo_protocol::TransportEvent;

use ratatui::crossterm::event::{self, Event as CtEvent};
use ratatui::DefaultTerminal;
use tokio::sync::mpsc;

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let layout = DataLayout::from_env();
    if std::env::var_os("CODETWO_DATA_DIR").is_none() {
        let decision = codetwo_daemon::inspect_legacy_data(&layout.data_dir)?;
        if matches!(decision, LegacyDataDecision::CopyLegacyToCanonical { .. }) {
            codetwo_daemon::copy_legacy_data(&decision)?;
        }
    }
    // Built-ins plus whatever harness skill directories (~/.claude/skills, .codex/skills, …) exist
    // here — the TUI runs inside the project, so its cwd is the workspace.
    let mut skill_vec = builtin_skills();
    if let Ok(plugins) = codetwo_core::plugin::load_dir(&layout.data_dir.join("plugins")) {
        skill_vec.extend(plugins.into_iter().flat_map(|plugin| plugin.components));
    }
    skill_vec.extend(codetwo_core::harness::discover(
        std::env::current_dir().ok().as_deref(),
    ));
    let (client, _owned_daemon) = connect_daemon(&layout).await?;
    client
        .replace_skills(skill_vec.clone())
        .await
        .map_err(std::io::Error::other)?;
    let mut daemon_events = client
        .subscribe(Some(client.hello().cursor.clone()))
        .await
        .map_err(std::io::Error::other)?;

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
    sync_sessions(&client, &mut app, true).await?;
    let result = run(
        &mut terminal,
        &mut app,
        &client,
        &mut in_rx,
        &mut daemon_events,
    )
    .await;
    ratatui::restore();
    result
}

async fn connect_daemon(
    layout: &DataLayout,
) -> std::io::Result<(Client, Option<tokio::task::JoinHandle<()>>)> {
    if let Ok(client) = Client::connect(&layout.socket_path).await {
        return Ok((client, None));
    }
    let owned = match Daemon::bind(&layout.data_dir) {
        Ok(daemon) => Some(tokio::spawn(async move {
            let _ = daemon.run().await;
        })),
        Err(codetwo_daemon::DaemonError::Ownership(
            codetwo_daemon::OwnershipError::AlreadyRunning,
        )) => None,
        Err(error) => return Err(std::io::Error::other(error)),
    };
    let mut last_error = None;
    for _ in 0..50 {
        match Client::connect(&layout.socket_path).await {
            Ok(client) => return Ok((client, owned)),
            Err(error) => last_error = Some(error),
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    Err(std::io::Error::other(
        last_error
            .map(|error| error.to_string())
            .unwrap_or_else(|| "daemon did not become ready".to_owned()),
    ))
}

async fn sync_sessions(client: &Client, app: &mut App, hydrate: bool) -> std::io::Result<()> {
    let sessions = client
        .list_sessions(false)
        .await
        .map_err(std::io::Error::other)?;
    let first = sessions.first().map(|session| session.id.clone());
    app.set_sessions(sessions);
    if hydrate {
        if let Some(session) = first {
            let page = client
                .transcript_page(
                    session.clone(),
                    None,
                    codetwo_core::DEFAULT_TRANSCRIPT_TURNS,
                )
                .await
                .map_err(std::io::Error::other)?;
            let _ = app.select_session_history(&session, page);
        }
    }
    Ok(())
}

async fn run(
    terminal: &mut DefaultTerminal,
    app: &mut App,
    client: &Client,
    in_rx: &mut mpsc::UnboundedReceiver<CtEvent>,
    daemon_events: &mut SubscriptionReceiver,
) -> std::io::Result<()> {
    loop {
        terminal.draw(|f| app.render(f))?;
        tokio::select! {
            Some(ev) = in_rx.recv() => {
                if let CtEvent::Key(key) = ev {
                    app.handle_key(key, client).await;
                }
            }
            Some(message) = daemon_events.recv() => {
                match message {
                    SubscriptionMessage::Event(envelope) => {
                        if let TransportEvent::Core { event } = envelope.event {
                            let refresh_sessions = matches!(&event, codetwo_core::Event::SessionCreated { .. });
                            app.on_engine_event(event);
                            if refresh_sessions {
                                sync_sessions(client, app, false).await?;
                            }
                            if let Some((session, doc, request_id)) = app.take_pending_send() {
                                if let Err(error) = client
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
                    SubscriptionMessage::Reset { .. } => sync_sessions(client, app, true).await?,
                }
            }
        }
        if app.should_quit {
            break;
        }
    }
    Ok(())
}
