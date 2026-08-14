//! Persistent embedded terminals as a plugin-owned service.

use crate::app::service::{TerminalEvent, TerminalService};
use crate::app::{json, take_args};
use crate::term::{Scope, TerminalConfig, TerminalHandle, TerminalOutput};
use codetwo_kernel::{async_trait, Context, Plugin, PluginError, PluginResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

pub struct TerminalPlugin;

#[derive(Serialize)]
struct TerminalAttach {
    created: bool,
    restore: String,
}

#[async_trait]
impl Plugin for TerminalPlugin {
    fn name(&self) -> &str {
        "terminal"
    }

    fn description(&self) -> Option<&str> {
        Some("Persistent PTY sessions backed by a VT emulator and optional tmux.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let terminals = Arc::new(TerminalService::new());
        ctx.provide(terminals.clone())?;
        let cleanup = terminals.clone();
        ctx.effect(move || cleanup.terminals.lock().unwrap().clear());

        ctx.command("terminal.tmux_available", |_| async move {
            Ok(Value::Bool(crate::tmux::is_available()))
        })?;

        #[derive(Deserialize)]
        struct SpawnArgs {
            id: String,
            #[serde(default)]
            cwd: Option<String>,
            rows: u16,
            cols: u16,
            #[serde(default)]
            scrollback: Option<usize>,
            #[serde(default)]
            tmux_session: Option<String>,
        }
        let spawning = terminals.clone();
        let scope = ctx.weak();
        ctx.command("terminal.spawn", move |args| {
            let terminals = spawning.clone();
            let scope = scope.clone();
            async move {
                let args: SpawnArgs = take_args(args)?;
                if let Some(existing) = terminals.terminals.lock().unwrap().get(&args.id) {
                    let _ = existing.resize(args.rows, args.cols);
                    return json(TerminalAttach {
                        created: false,
                        restore: existing.restore().map_err(PluginError::new)?,
                    });
                }

                let config = TerminalConfig {
                    cwd: args.cwd,
                    rows: args.rows,
                    cols: args.cols,
                    scrollback: args.scrollback.unwrap_or(10_000),
                    tmux_session: args.tmux_session,
                };
                let (terminal, mut output) =
                    TerminalHandle::spawn(config).map_err(PluginError::new)?;
                let publisher = terminals.clone();
                let id = args.id.clone();
                let output_task = async move {
                    while let Some(output) = output.recv().await {
                        let event = match output {
                            TerminalOutput::Data(data) => TerminalEvent::Data {
                                id: id.clone(),
                                data,
                            },
                            TerminalOutput::Title(title) => TerminalEvent::Title {
                                id: id.clone(),
                                title,
                            },
                        };
                        publisher.publish(event);
                    }
                    publisher.publish(TerminalEvent::Exit { id });
                };
                scope
                    .upgrade()
                    .ok_or_else(|| PluginError::new("terminal plugin is unloading"))?
                    .spawn(output_task);
                terminals
                    .terminals
                    .lock()
                    .unwrap()
                    .insert(args.id, terminal);
                json(TerminalAttach {
                    created: true,
                    restore: String::new(),
                })
            }
        })?;

        #[derive(Deserialize)]
        struct WriteArgs {
            id: String,
            data: String,
        }
        let writing = terminals.clone();
        ctx.command("terminal.write", move |args| {
            let terminals = writing.clone();
            async move {
                let args: WriteArgs = take_args(args)?;
                with_terminal(&terminals, &args.id, |terminal| {
                    terminal.write(args.data.as_bytes())
                })?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct ResizeArgs {
            id: String,
            rows: u16,
            cols: u16,
        }
        let resizing = terminals.clone();
        ctx.command("terminal.resize", move |args| {
            let terminals = resizing.clone();
            async move {
                let args: ResizeArgs = take_args(args)?;
                with_terminal(&terminals, &args.id, |terminal| {
                    terminal.resize(args.rows, args.cols)
                })?;
                Ok(Value::Bool(true))
            }
        })?;

        #[derive(Deserialize)]
        struct DumpArgs {
            id: String,
            #[serde(default)]
            all: bool,
        }
        let dumping = terminals.clone();
        ctx.command("terminal.dump", move |args| {
            let terminals = dumping.clone();
            async move {
                let args: DumpArgs = take_args(args)?;
                let scope = if args.all { Scope::All } else { Scope::Screen };
                json(with_terminal(&terminals, &args.id, |terminal| {
                    terminal.text(scope)
                })?)
            }
        })?;

        #[derive(Deserialize)]
        struct IdArgs {
            id: String,
        }
        ctx.command("terminal.kill", move |args| {
            let terminals = terminals.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                terminals.terminals.lock().unwrap().remove(&args.id);
                Ok(Value::Bool(true))
            }
        })?;
        Ok(())
    }
}

fn with_terminal<T>(
    terminals: &TerminalService,
    id: &str,
    operation: impl FnOnce(&TerminalHandle) -> std::io::Result<T>,
) -> Result<T, PluginError> {
    let terminals = terminals.terminals.lock().unwrap();
    let terminal = terminals
        .get(id)
        .ok_or_else(|| PluginError::new("no such terminal"))?;
    operation(terminal).map_err(PluginError::new)
}
