//! Persistent embedded terminals as a plugin-owned service.

use crate::app::service::{TerminalEvent, TerminalService};
use crate::app::TerminalOutputEvent;
use crate::app::{json, take_args};
use crate::app::{PluginManager, ProjectActivityLease};
use crate::term::{Scope, TerminalConfig, TerminalHandle, TerminalOutput};
use codetwo_kernel::{
    async_trait, CommandRealm, Context, Injection, Plugin, PluginError, PluginResult, WeakContext,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct TerminalPlugin;

struct ProjectTerminalLease {
    generation: uuid::Uuid,
    _activity: ProjectActivityLease,
}

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

    fn inject(&self) -> Injection {
        Injection::optional(["plugin-manager"])
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let terminals = Arc::new(TerminalService::new());
        let project_lifecycle = match ctx.command_realm() {
            CommandRealm::Project(path) => ctx
                .get::<PluginManager>()
                .map(|manager| (manager, path.clone())),
            CommandRealm::Global => None,
        };
        let project_leases = Arc::new(Mutex::new(HashMap::<String, ProjectTerminalLease>::new()));
        let terminal_mutations = Arc::new(Mutex::new(()));
        ctx.provide(terminals.clone())?;
        let cleanup = terminals.clone();
        let cleanup_leases = project_leases.clone();
        let cleanup_mutations = terminal_mutations.clone();
        ctx.effect(move || {
            let _mutation = cleanup_mutations.lock().unwrap();
            cleanup.terminals.lock().unwrap().clear();
            cleanup_leases.lock().unwrap().clear();
        });

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
        let spawning_leases = project_leases.clone();
        let spawning_mutations = terminal_mutations.clone();
        let scope = ctx.weak();
        ctx.command("terminal.spawn", move |args| {
            let terminals = spawning.clone();
            let project_lifecycle = project_lifecycle.clone();
            let project_leases = spawning_leases.clone();
            let terminal_mutations = spawning_mutations.clone();
            let scope = scope.clone();
            async move {
                let args: SpawnArgs = take_args(args)?;
                let _mutation = terminal_mutations.lock().unwrap();
                if let Some(existing) = terminals.terminals.lock().unwrap().get(&args.id) {
                    let _ = existing.resize(args.rows, args.cols);
                    return json(TerminalAttach {
                        created: false,
                        restore: existing.restore().map_err(PluginError::new)?,
                    });
                }

                let project_lease = match project_lifecycle {
                    Some((manager, project_path)) => Some(
                        manager
                            .lease_loaded_project(project_path)
                            .ok_or_else(|| PluginError::new("project graph is unloading"))?,
                    ),
                    None => None,
                };
                let event_context = scope
                    .upgrade()
                    .ok_or_else(|| PluginError::new("terminal plugin is unloading"))?;

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
                let terminal_id = args.id.clone();
                let exited_terminal_id = terminal_id.clone();
                let generation = uuid::Uuid::new_v4();
                let exited_generation = generation;
                let output_leases = project_leases.clone();
                let event_scope = scope.clone();
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
                        publish_terminal_event(&publisher, &event_scope, event).await;
                    }
                    publish_terminal_event(&publisher, &event_scope, TerminalEvent::Exit { id })
                        .await;
                    let mut leases = output_leases.lock().unwrap();
                    if leases
                        .get(&exited_terminal_id)
                        .is_some_and(|lease| lease.generation == exited_generation)
                    {
                        leases.remove(&exited_terminal_id);
                    }
                };
                terminals
                    .terminals
                    .lock()
                    .unwrap()
                    .insert(args.id.clone(), terminal);
                if let Some(project_lease) = project_lease {
                    project_leases.lock().unwrap().insert(
                        terminal_id.clone(),
                        ProjectTerminalLease {
                            generation,
                            _activity: project_lease,
                        },
                    );
                }
                let disposed_terminals = terminals.clone();
                let disposed_leases = project_leases.clone();
                let disposed_terminal_id = terminal_id;
                event_context.effect(move || {
                    disposed_terminals
                        .terminals
                        .lock()
                        .unwrap()
                        .remove(&disposed_terminal_id);
                    disposed_leases
                        .lock()
                        .unwrap()
                        .remove(&disposed_terminal_id);
                });
                event_context.spawn(output_task);
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
        let killing_leases = project_leases;
        let killing_mutations = terminal_mutations;
        ctx.command("terminal.kill", move |args| {
            let terminals = terminals.clone();
            let project_leases = killing_leases.clone();
            let terminal_mutations = killing_mutations.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                let _mutation = terminal_mutations.lock().unwrap();
                terminals.terminals.lock().unwrap().remove(&args.id);
                project_leases.lock().unwrap().remove(&args.id);
                Ok(Value::Bool(true))
            }
        })?;
        Ok(())
    }
}

async fn publish_terminal_event(
    terminals: &TerminalService,
    scope: &WeakContext,
    event: TerminalEvent,
) {
    // Keep the per-service broadcast for core/server consumers, and mirror onto the kernel bus so
    // a desktop host sees project-isolated terminals without subscribing to every service realm.
    terminals.publish(event.clone());
    if let Some(ctx) = scope.upgrade() {
        ctx.emit(TerminalOutputEvent {
            realm: ctx.command_realm().clone(),
            event,
        })
        .await;
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

#[cfg(test)]
mod tests {
    use super::*;
    use codetwo_kernel::App;
    use std::sync::Mutex;

    #[tokio::test]
    async fn project_terminal_publish_crosses_service_isolation_on_typed_bus() {
        let app = App::new();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured = seen.clone();
        app.ctx().on::<TerminalOutputEvent, _>(move |event| {
            if let TerminalEvent::Data { id, data } = &event.event {
                captured
                    .lock()
                    .unwrap()
                    .push((event.realm.clone(), id.clone(), data.clone()));
            }
            None
        });

        let global = Arc::new(TerminalService::new());
        app.ctx().provide(global.clone()).unwrap();
        let mut global_receiver = global.subscribe();
        let project_context = app
            .ctx()
            .with_command_realm(codetwo_kernel::CommandRealm::project("/projects/alpha"))
            .isolate(&["terminal"]);
        let project = Arc::new(TerminalService::new());
        project_context.provide(project.clone()).unwrap();
        let mut project_receiver = project.subscribe();
        publish_terminal_event(
            &project,
            &project_context.weak(),
            TerminalEvent::Data {
                id: "project-terminal".into(),
                data: "hello".into(),
            },
        )
        .await;

        assert!(matches!(
            project_receiver.recv().await.unwrap(),
            TerminalEvent::Data { id, data }
                if id == "project-terminal" && data == "hello"
        ));
        assert!(matches!(
            global_receiver.try_recv(),
            Err(tokio::sync::broadcast::error::TryRecvError::Empty)
        ));
        assert_eq!(
            seen.lock().unwrap().as_slice(),
            &[(
                (codetwo_kernel::CommandRealm::project("/projects/alpha")),
                "project-terminal".to_string(),
                "hello".to_string()
            )]
        );
    }
}
