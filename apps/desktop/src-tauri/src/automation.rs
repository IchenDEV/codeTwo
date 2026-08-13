//! Desktop host for durable user automations.
//!
//! The SQLite layer lives in `codetwo-core`; this host owns the clock and turns claimed runs into
//! ordinary Engine sessions. Runs therefore use the same ACP, permissions, transcript, worktree,
//! and review surfaces as user-started work.

use std::sync::Arc;
use std::time::Duration;

use codetwo_core::permission::ExecutionPolicy;
use codetwo_core::session::SessionRunState;
use codetwo_core::skill::DocBlock;
use codetwo_core::worktree::WorktreeBaseline;
use codetwo_core::{
    Automation, AutomationInput, AutomationRun, AutomationRunStatus, Engine, Event, Op, Store,
};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::broadcast;

const TICK_SECONDS: u64 = 30;
const SESSION_CREATION_TIMEOUT_SECONDS: u64 = 120;

pub struct AutomationState(pub Arc<AutomationRuntime>);

pub struct AutomationRuntime {
    engine: Arc<Engine>,
    store: Arc<Store>,
    events: broadcast::Sender<Event>,
    app: AppHandle,
}

impl AutomationRuntime {
    pub fn new(
        engine: Arc<Engine>,
        store: Arc<Store>,
        events: broadcast::Sender<Event>,
        app: AppHandle,
    ) -> Self {
        Self {
            engine,
            store,
            events,
            app,
        }
    }

    fn notify(&self, automation_id: &str) {
        let _ = self.app.emit("automation-changed", automation_id);
    }

    pub async fn schedule_loop(self: Arc<Self>) {
        let mut tick = tokio::time::interval(Duration::from_secs(TICK_SECONDS));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tick.tick().await;
            let now = super::now_millis();
            let ids = match self.store.due_automation_ids(now) {
                Ok(ids) => ids,
                Err(error) => {
                    eprintln!("automation scan failed: {error}");
                    continue;
                }
            };
            for id in ids {
                match self.store.claim_scheduled_automation_run(&id, now) {
                    Ok(Some((automation, run))) => self.clone().spawn(automation, run),
                    Ok(None) => {}
                    Err(error) => eprintln!("automation `{id}` could not be claimed: {error}"),
                }
            }
        }
    }

    pub async fn event_loop(self: Arc<Self>) {
        let mut events = self.events.subscribe();
        loop {
            let event = match events.recv().await {
                Ok(event) => event,
                Err(broadcast::error::RecvError::Lagged(count)) => {
                    eprintln!("automation event monitor lagged; dropped {count} events");
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => break,
            };
            let (session, status, error) = match &event {
                Event::TurnStarted { session, .. } => {
                    (session.as_str(), Some(AutomationRunStatus::Running), None)
                }
                Event::PermissionRequest { session, .. } => (
                    session.as_str(),
                    Some(AutomationRunStatus::NeedsAttention),
                    None,
                ),
                Event::SessionActivityChanged { session, activity } => match &activity.state {
                    SessionRunState::Running { .. } => {
                        (session.as_str(), Some(AutomationRunStatus::Running), None)
                    }
                    SessionRunState::AwaitingInput { .. } => (
                        session.as_str(),
                        Some(AutomationRunStatus::NeedsAttention),
                        None,
                    ),
                    SessionRunState::Failed { message, .. } => (
                        session.as_str(),
                        Some(AutomationRunStatus::Failed),
                        Some(message.as_str()),
                    ),
                    SessionRunState::Idle => (session.as_str(), None, None),
                },
                Event::TurnEnded {
                    session,
                    stop_reason,
                } if stop_reason == "EndTurn" => {
                    (session.as_str(), Some(AutomationRunStatus::Succeeded), None)
                }
                Event::TurnEnded {
                    session,
                    stop_reason,
                } if stop_reason == "Cancelled" => (
                    session.as_str(),
                    Some(AutomationRunStatus::Interrupted),
                    Some("run was cancelled"),
                ),
                Event::TurnEnded {
                    session,
                    stop_reason,
                } => (
                    session.as_str(),
                    Some(AutomationRunStatus::Failed),
                    Some(stop_reason.as_str()),
                ),
                Event::Error {
                    session: Some(session),
                    message,
                    terminal: true,
                    ..
                } => (
                    session.as_str(),
                    Some(AutomationRunStatus::Failed),
                    Some(message.as_str()),
                ),
                _ => continue,
            };
            let Some(status) = status else {
                continue;
            };
            let run = match self.store.active_automation_run_for_session(session) {
                Ok(Some(run)) => run,
                Ok(None) => continue,
                Err(error) => {
                    eprintln!("automation event lookup failed for {session}: {error}");
                    continue;
                }
            };
            if let Err(store_error) =
                self.store
                    .set_automation_run_status(&run.id, status, error, super::now_millis())
            {
                eprintln!(
                    "automation run {} could not be updated: {store_error}",
                    run.id
                );
                continue;
            }
            self.notify(&run.automation_id);
        }
    }

    pub fn run_now(self: &Arc<Self>, automation_id: &str) -> Result<AutomationRun, String> {
        let now = super::now_millis();
        let Some((automation, run)) = self
            .store
            .create_manual_automation_run(automation_id, now)
            .map_err(|error| error.to_string())?
        else {
            return Err("automation not found or already has an active run".into());
        };
        self.clone().spawn(automation, run.clone());
        Ok(run)
    }

    fn spawn(self: Arc<Self>, automation: Automation, run: AutomationRun) {
        self.notify(&automation.id);
        tauri::async_runtime::spawn(async move {
            self.execute(automation, run).await;
        });
    }

    async fn execute(&self, automation: Automation, run: AutomationRun) {
        let creation_request = format!("automation:{}:session", run.id);
        let mut events = self.events.subscribe();
        let create = self
            .engine
            .submit(Op::NewSession {
                provider: automation.provider.clone(),
                cwd: automation.project_path.clone(),
                use_worktree: automation.use_worktree,
                worktree_base: automation.use_worktree.then_some(WorktreeBaseline::Current),
                worktree_base_sha: None,
                request_id: Some(creation_request.clone()),
                initial_policy: Some(ExecutionPolicy {
                    mode: automation.permission_mode,
                    sandbox: automation.sandbox_policy,
                }),
            })
            .await;
        if let Err(error) = create {
            self.fail(&automation.id, &run.id, &error.to_string());
            return;
        }

        let session = tokio::time::timeout(
            Duration::from_secs(SESSION_CREATION_TIMEOUT_SECONDS),
            async {
                loop {
                    match events.recv().await {
                        Ok(Event::SessionCreated {
                            session,
                            request_id: Some(request_id),
                            ..
                        }) if request_id == creation_request => return Ok(session),
                        Ok(Event::Error {
                            message,
                            terminal: true,
                            request_id: Some(request_id),
                            ..
                        }) if request_id == creation_request => return Err(message),
                        Ok(_) | Err(broadcast::error::RecvError::Lagged(_)) => {}
                        Err(broadcast::error::RecvError::Closed) => {
                            return Err("engine event stream closed".into())
                        }
                    }
                }
            },
        )
        .await;
        let session = match session {
            Ok(Ok(session)) => session,
            Ok(Err(error)) => {
                self.fail(&automation.id, &run.id, &error);
                return;
            }
            Err(_) => {
                self.fail(
                    &automation.id,
                    &run.id,
                    "timed out while creating the automation session",
                );
                return;
            }
        };

        if let Err(error) = self.store.set_automation_run_session(&run.id, &session) {
            self.fail(&automation.id, &run.id, &error.to_string());
            return;
        }
        self.notify(&automation.id);

        let prompt_request = format!("automation:{}:prompt", run.id);
        if let Err(error) = self
            .engine
            .submit(Op::Prompt {
                session,
                doc: vec![DocBlock::Text {
                    text: automation.prompt,
                }],
                request_id: Some(prompt_request),
            })
            .await
        {
            self.fail(&automation.id, &run.id, &error.to_string());
        }
    }

    fn fail(&self, automation_id: &str, run_id: &str, message: &str) {
        if let Err(error) = self.store.set_automation_run_status(
            run_id,
            AutomationRunStatus::Failed,
            Some(message),
            super::now_millis(),
        ) {
            eprintln!("automation run {run_id} failure could not be persisted: {error}");
        }
        self.notify(automation_id);
    }
}

#[tauri::command]
pub fn list_automations(state: State<'_, AutomationState>) -> Result<Vec<Automation>, String> {
    state
        .0
        .store
        .list_automations()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_automation(
    state: State<'_, AutomationState>,
    input: AutomationInput,
) -> Result<Automation, String> {
    let automation = state
        .0
        .store
        .create_automation(input, super::now_millis())
        .map_err(|error| error.to_string())?;
    state.0.notify(&automation.id);
    Ok(automation)
}

#[tauri::command]
pub fn update_automation(
    state: State<'_, AutomationState>,
    id: String,
    input: AutomationInput,
) -> Result<Automation, String> {
    let automation = state
        .0
        .store
        .update_automation(&id, input, super::now_millis())
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "automation not found".to_string())?;
    state.0.notify(&automation.id);
    Ok(automation)
}

#[tauri::command]
pub fn set_automation_enabled(
    state: State<'_, AutomationState>,
    id: String,
    enabled: bool,
) -> Result<Automation, String> {
    let automation = state
        .0
        .store
        .set_automation_enabled(&id, enabled, super::now_millis())
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "automation not found".to_string())?;
    state.0.notify(&automation.id);
    Ok(automation)
}

#[tauri::command]
pub fn delete_automation(state: State<'_, AutomationState>, id: String) -> Result<bool, String> {
    let deleted = state
        .0
        .store
        .delete_automation(&id)
        .map_err(|error| error.to_string())?;
    state.0.notify(&id);
    Ok(deleted)
}

#[tauri::command]
pub fn list_automation_runs(
    state: State<'_, AutomationState>,
    automation_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<AutomationRun>, String> {
    state
        .0
        .store
        .list_automation_runs(automation_id.as_deref(), limit.unwrap_or(50))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_automation_now(
    state: State<'_, AutomationState>,
    id: String,
) -> Result<AutomationRun, String> {
    state.0.run_now(&id)
}
