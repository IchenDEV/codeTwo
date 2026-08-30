//! Scope-owned forwarding from core broadcasts to the desktop host protocol.

use codetwo_kernel::{
    async_trait, CommandRealm, Context, Injection, Plugin, PluginError, PluginResult,
};
use codetwo_plugins::events::{ConnectorEvent, PluginsChanged};
use codetwo_plugins::{EventBus, TerminalEvent, TerminalOutputEvent};
use serde::Serialize;
use serde_json::Value;
use tokio::sync::broadcast;

use crate::EventSink;

pub struct HostEventsPlugin {
    host: EventSink,
}

impl HostEventsPlugin {
    pub fn new(host: EventSink) -> Self {
        Self { host }
    }
}

#[derive(Serialize, Clone)]
struct PtyOutput {
    id: String,
    data: String,
    project_path: Option<String>,
}

#[derive(Serialize, Clone)]
struct PtyTitle {
    id: String,
    title: String,
    project_path: Option<String>,
}

#[derive(Serialize, Clone)]
struct PtyExit {
    id: String,
    project_path: Option<String>,
}

#[async_trait]
impl Plugin for HostEventsPlugin {
    fn name(&self) -> &str {
        "desktop-events"
    }

    fn inject(&self) -> Injection {
        Injection::required(["bus"])
    }

    fn description(&self) -> Option<&str> {
        Some("Forwards core engine and terminal broadcasts to the desktop renderer.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let mut engine_events = ctx
            .get::<EventBus>()
            .ok_or_else(|| PluginError::new("event bus is unavailable"))?
            .subscribe();
        let host = self.host.clone();
        ctx.spawn(async move {
            loop {
                match engine_events.recv().await {
                    Ok(event) => {
                        let _ = host.emit("engine-event", event);
                    }
                    Err(broadcast::error::RecvError::Lagged(count)) => {
                        eprintln!("engine-event pump lagged; dropped {count} events");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        });

        let host = self.host.clone();
        ctx.on::<TerminalOutputEvent, _>(move |event| {
            let project_path = match &event.realm {
                CommandRealm::Global => None,
                CommandRealm::Project(path) => Some(path.clone()),
            };
            match &event.event {
                TerminalEvent::Data { id, data } => {
                    let _ = host.emit(
                        "pty-output",
                        PtyOutput {
                            id: id.clone(),
                            data: data.clone(),
                            project_path,
                        },
                    );
                }
                TerminalEvent::Title { id, title } => {
                    let _ = host.emit(
                        "pty-title",
                        PtyTitle {
                            id: id.clone(),
                            title: title.clone(),
                            project_path,
                        },
                    );
                }
                TerminalEvent::Exit { id } => {
                    let _ = host.emit(
                        "pty-exit",
                        PtyExit {
                            id: id.clone(),
                            project_path,
                        },
                    );
                }
            }
            None
        });

        let host = self.host.clone();
        ctx.on::<PluginsChanged, _>(move |_| {
            let _ = host.emit("plugins-changed", ());
            None
        });

        let host = self.host.clone();
        ctx.on::<ConnectorEvent, _>(move |event| {
            let _ = host.emit("plugin-connector-event", (*event).clone());
            None
        });
        Ok(())
    }
}
