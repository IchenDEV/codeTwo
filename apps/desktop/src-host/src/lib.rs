//! C2's native desktop sidecar.
//!
//! Electrobun owns the application window and native desktop APIs. This process owns the existing
//! Rust plugin graph and exposes exactly one JSON-lines command bridge over stdin/stdout. Plugin
//! events use the same connection in the opposite direction, so the renderer still receives the
//! engine, terminal, automation, and language-server streams without coupling the core to a GUI
//! framework.

mod automation;
mod host_events;
mod lsp;
mod remote;

use std::path::PathBuf;
use std::sync::Arc;

use codetwo_core::app::{AppConfig, CoreApp};
use codetwo_kernel::{
    PluginCategory, PluginEntry, PluginMetadata, PluginOrigin, PluginScopeSupport,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;

/// Cloneable output channel shared by host plugins.
///
/// Nothing except the protocol writer touches stdout. That invariant matters because a single log
/// line mixed into JSON would corrupt every pending renderer request.
#[derive(Clone)]
pub struct EventSink {
    output: mpsc::UnboundedSender<Output>,
}

impl EventSink {
    fn new(output: mpsc::UnboundedSender<Output>) -> Self {
        Self { output }
    }

    pub fn emit<T: Serialize>(&self, name: &str, payload: T) -> Result<(), String> {
        let payload = serde_json::to_value(payload).map_err(|error| error.to_string())?;
        self.output
            .send(Output::Message(serde_json::json!({
                "method": "event",
                "params": { "name": name, "payload": payload }
            })))
            .map_err(|_| "desktop protocol output is closed".to_string())
    }
}

enum Output {
    Message(Value),
    Finish,
}

#[derive(Debug, Deserialize)]
struct Request {
    id: u64,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Deserialize)]
struct CallParams {
    name: String,
    #[serde(default)]
    args: Value,
    #[serde(default)]
    project_path: Option<String>,
}

fn data_dir_from_args() -> Result<PathBuf, String> {
    let mut args = std::env::args_os().skip(1);
    while let Some(argument) = args.next() {
        if argument == "--data-dir" {
            return args
                .next()
                .map(PathBuf::from)
                .ok_or_else(|| "--data-dir requires a path".to_string());
        }
    }
    Err("missing required --data-dir <path> argument".to_string())
}

fn response(id: u64, result: Result<Value, String>) -> Value {
    match result {
        Ok(result) => serde_json::json!({ "id": id, "result": result }),
        Err(error) => serde_json::json!({ "id": id, "error": error }),
    }
}

async fn write_output(mut output: mpsc::UnboundedReceiver<Output>) -> Result<(), String> {
    let mut stdout = tokio::io::stdout();
    while let Some(item) = output.recv().await {
        let Output::Message(message) = item else {
            break;
        };
        let mut encoded = serde_json::to_vec(&message).map_err(|error| error.to_string())?;
        encoded.push(b'\n');
        stdout
            .write_all(&encoded)
            .await
            .map_err(|error| error.to_string())?;
        stdout.flush().await.map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn now_millis() -> i64 {
    codetwo_core::session::now_millis()
}

/// Boot the core plugin graph and serve the desktop protocol until stdin closes or the host sends
/// `shutdown`. The renderer-facing Browser MCP is intentionally not registered here: Electrobun's
/// stable BrowserView API cannot yet return evaluated JavaScript values or capture screenshots,
/// both of which are required for the existing agent-browser contract.
pub async fn run() -> Result<(), String> {
    codetwo_core::provider::augment_search_path();

    let data_dir = data_dir_from_args()?;
    std::fs::create_dir_all(&data_dir).map_err(|error| {
        format!(
            "could not create desktop data directory {}: {error}",
            data_dir.display()
        )
    })?;

    let (output_tx, output_rx) = mpsc::unbounded_channel();
    let writer = tokio::spawn(write_output(output_rx));
    let events = EventSink::new(output_tx.clone());

    let mut registry = codetwo_core::app::plugins::builtin_registry();
    let host = events.clone();
    registry.register(move || automation::AutomationPlugin::new(host.clone()));
    let host = events.clone();
    registry.register(move || lsp::LspPlugin::new(host.clone()));
    let host = events.clone();
    registry.register(move || host_events::HostEventsPlugin::new(host.clone()));
    let remote_auth_path = data_dir.join("remote-devices.json");
    registry.register(move || remote::RemotePlugin::new(remote_auth_path.clone()));

    for (name, category, essential, project_scoped) in [
        ("automation", PluginCategory::Automation, false, false),
        ("lsp", PluginCategory::DeveloperTools, false, true),
        ("desktop-events", PluginCategory::Foundation, true, false),
        ("remote", PluginCategory::Integration, false, false),
    ] {
        let scope_support = if project_scoped {
            vec![PluginScopeSupport::User, PluginScopeSupport::Project]
        } else {
            vec![PluginScopeSupport::User]
        };
        registry
            .set_metadata(
                name,
                PluginMetadata {
                    origin: PluginOrigin::Host,
                    category,
                    scope_support,
                    essential,
                    default_enabled: true,
                },
            )
            .expect("host metadata must refer to a registered plugin");
    }

    let config = AppConfig::new(&data_dir)
        .with("automation", PluginEntry::default())
        .with("desktop-events", PluginEntry::default())
        .with("lsp", PluginEntry::default())
        .with("remote", PluginEntry::default());
    let core = Arc::new(
        CoreApp::boot_with(config, registry)
            .await
            .map_err(|error| error.to_string())?,
    );

    events.emit(
        "host-ready",
        serde_json::json!({
            "commands": core
                .commands()
                .into_iter()
                .map(|command| command.name)
                .collect::<Vec<_>>()
        }),
    )?;

    let stdin = tokio::io::stdin();
    let mut lines = BufReader::new(stdin).lines();
    let mut calls = tokio::task::JoinSet::new();
    while let Some(line) = lines.next_line().await.map_err(|error| error.to_string())? {
        let request = match serde_json::from_str::<Request>(&line) {
            Ok(request) => request,
            Err(error) => {
                let _ = events.emit("protocol-error", error.to_string());
                continue;
            }
        };

        if request.method == "call" {
            let id = request.id;
            let params = serde_json::from_value::<CallParams>(request.params)
                .map_err(|error| format!("invalid call parameters: {error}"));
            let core = Arc::clone(&core);
            let output = output_tx.clone();
            calls.spawn(async move {
                let result = match params {
                    Ok(params) => match params.project_path {
                        Some(project_path) => {
                            core.call_in_project(project_path, &params.name, params.args)
                                .await
                        }
                        None => core.call(&params.name, params.args).await,
                    }
                    .map_err(|error| error.to_string()),
                    Err(error) => Err(error),
                };
                let _ = output.send(Output::Message(response(id, result)));
            });
            continue;
        }

        let should_stop = request.method == "shutdown";
        let result = match request.method.as_str() {
            "ping" => Ok(Value::String("pong".into())),
            "shutdown" => Ok(Value::Null),
            method => Err(format!("unknown desktop host method `{method}`")),
        };
        output_tx
            .send(Output::Message(response(request.id, result)))
            .map_err(|_| "desktop protocol output is closed".to_string())?;
        if should_stop {
            break;
        }
    }

    calls.abort_all();
    while calls.join_next().await.is_some() {}
    core.stop().await;
    drop(core);
    drop(events);
    let _ = output_tx.send(Output::Finish);
    writer
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_success_and_error_responses_without_protocol_noise() {
        assert_eq!(
            response(7, Ok(serde_json::json!({ "ok": true }))),
            serde_json::json!({ "id": 7, "result": { "ok": true } })
        );
        assert_eq!(
            response(8, Err("nope".into())),
            serde_json::json!({ "id": 8, "error": "nope" })
        );
    }

    #[test]
    fn deserializes_project_scoped_calls() {
        let params: CallParams = serde_json::from_value(serde_json::json!({
            "name": "terminal.write",
            "args": { "id": "shell", "data": "pwd\n" },
            "project_path": "/tmp/project"
        }))
        .unwrap();
        assert_eq!(params.name, "terminal.write");
        assert_eq!(params.project_path.as_deref(), Some("/tmp/project"));
    }

    #[tokio::test]
    async fn event_sink_uses_the_shared_json_lines_envelope() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        EventSink::new(tx).emit("ready", 2).unwrap();
        let Output::Message(message) = rx.recv().await.unwrap() else {
            panic!("event sink finished instead of sending the event");
        };
        assert_eq!(
            message,
            serde_json::json!({
                "method": "event",
                "params": { "name": "ready", "payload": 2 }
            })
        );
    }
}
