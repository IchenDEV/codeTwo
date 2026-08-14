//! Scope-owned forwarding from core broadcasts to Tauri window events.

use codetwo_core::app::{EventBus, TerminalEvent, TerminalService};
use codetwo_kernel::{async_trait, Context, Injection, Plugin, PluginError, PluginResult};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

pub struct HostEventsPlugin {
    app: AppHandle,
}

impl HostEventsPlugin {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

#[derive(Serialize, Clone)]
struct PtyOutput {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct PtyTitle {
    id: String,
    title: String,
}

#[async_trait]
impl Plugin for HostEventsPlugin {
    fn name(&self) -> &str {
        "desktop-events"
    }

    fn inject(&self) -> Injection {
        Injection::required(["bus"]).with_optional(["terminal"])
    }

    fn description(&self) -> Option<&str> {
        Some("Forwards core engine and terminal broadcasts to Tauri windows.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let mut engine_events = ctx
            .get::<EventBus>()
            .ok_or_else(|| PluginError::new("event bus is unavailable"))?
            .subscribe();
        let terminal_events = ctx
            .get::<TerminalService>()
            .map(|service| service.subscribe());

        let app = self.app.clone();
        ctx.spawn(async move {
            loop {
                match engine_events.recv().await {
                    Ok(event) => {
                        let _ = app.emit("engine-event", event);
                    }
                    Err(broadcast::error::RecvError::Lagged(count)) => {
                        eprintln!("engine-event pump lagged; dropped {count} events");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });

        if let Some(mut terminal_events) = terminal_events {
            let app = self.app.clone();
            ctx.spawn(async move {
                loop {
                    match terminal_events.recv().await {
                        Ok(TerminalEvent::Data { id, data }) => {
                            let _ = app.emit("pty-output", PtyOutput { id, data });
                        }
                        Ok(TerminalEvent::Title { id, title }) => {
                            let _ = app.emit("pty-title", PtyTitle { id, title });
                        }
                        Ok(TerminalEvent::Exit { id }) => {
                            let _ = app.emit("pty-exit", id);
                        }
                        Err(broadcast::error::RecvError::Lagged(count)) => {
                            eprintln!("terminal event pump lagged; dropped {count} events");
                        }
                        Err(broadcast::error::RecvError::Closed) => break,
                    }
                }
            });
        }
        Ok(())
    }
}
