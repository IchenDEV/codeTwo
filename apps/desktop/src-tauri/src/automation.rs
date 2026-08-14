//! Desktop host for durable user automations.
//!
//! The SQLite layer lives in `codetwo-core`; this host owns the clock and turns claimed runs into
//! ordinary Engine sessions. Runs therefore use the same ACP, permissions, transcript, worktree,
//! and review surfaces as user-started work.

use std::sync::Arc;
use std::time::Duration;

use codetwo_core::app::{EngineService, EventBus, StoreService};
use codetwo_core::permission::ExecutionPolicy;
use codetwo_core::session::SessionRunState;
use codetwo_core::skill::DocBlock;
use codetwo_core::worktree::WorktreeBaseline;
use codetwo_core::{
    Automation, AutomationInput, AutomationRun, AutomationRunStatus, Engine, Event, Op, Store,
};
use codetwo_kernel::{
    async_trait, Context, Injection, Plugin, PluginError, PluginResult, WeakContext,
};
use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

const TICK_SECONDS: u64 = 30;
const SESSION_CREATION_TIMEOUT_SECONDS: u64 = 120;

pub struct AutomationPlugin {
    app: AppHandle,
}

impl AutomationPlugin {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

pub struct AutomationRuntime {
    engine: Arc<Engine>,
    store: Arc<Store>,
    events: broadcast::Sender<Event>,
    app: AppHandle,
    scope: WeakContext,
}

impl AutomationRuntime {
    pub fn new(
        engine: Arc<Engine>,
        store: Arc<Store>,
        events: broadcast::Sender<Event>,
        app: AppHandle,
        scope: WeakContext,
    ) -> Self {
        Self {
            engine,
            store,
            events,
            app,
            scope,
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
        if let Some(ctx) = self.scope.upgrade() {
            ctx.spawn(async move {
                self.execute(automation, run).await;
            });
        } else {
            self.fail(&automation.id, &run.id, "automation plugin is unloading");
        }
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

fn take_args<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, PluginError> {
    let value = if value.is_null() {
        Value::Object(Default::default())
    } else {
        value
    };
    serde_json::from_value(value)
        .map_err(|error| PluginError::new(format!("bad arguments: {error}")))
}

fn json<T: serde::Serialize>(value: T) -> Result<Value, PluginError> {
    serde_json::to_value(value).map_err(PluginError::new)
}

#[async_trait]
impl Plugin for AutomationPlugin {
    fn name(&self) -> &str {
        "automation"
    }

    fn inject(&self) -> Injection {
        Injection::required(["engine", "store", "bus"])
    }

    fn description(&self) -> Option<&str> {
        Some("Durable scheduled and on-demand agent runs.")
    }

    async fn apply(&self, ctx: Context, _config: Value) -> PluginResult {
        let engine = ctx
            .get::<EngineService>()
            .ok_or_else(|| PluginError::new("engine service is unavailable"))?
            .0
            .clone();
        let store = ctx
            .get::<StoreService>()
            .ok_or_else(|| PluginError::new("store service is unavailable"))?
            .0
            .clone();
        let events = ctx
            .get::<EventBus>()
            .ok_or_else(|| PluginError::new("event bus is unavailable"))?
            .0
            .clone();
        let runtime = Arc::new(AutomationRuntime::new(
            engine,
            store,
            events,
            self.app.clone(),
            ctx.weak(),
        ));

        ctx.spawn(runtime.clone().schedule_loop());
        ctx.spawn(runtime.clone().event_loop());

        let service = runtime.clone();
        ctx.command("automation.list", move |_| {
            let service = service.clone();
            async move { json(service.store.list_automations().map_err(PluginError::new)?) }
        })?;

        #[derive(Deserialize)]
        struct InputArgs {
            input: AutomationInput,
        }
        let service = runtime.clone();
        ctx.command("automation.create", move |args| {
            let service = service.clone();
            async move {
                let args: InputArgs = take_args(args)?;
                let automation = service
                    .store
                    .create_automation(args.input, super::now_millis())
                    .map_err(PluginError::new)?;
                service.notify(&automation.id);
                json(automation)
            }
        })?;

        #[derive(Deserialize)]
        struct UpdateArgs {
            id: String,
            input: AutomationInput,
        }
        let service = runtime.clone();
        ctx.command("automation.update", move |args| {
            let service = service.clone();
            async move {
                let args: UpdateArgs = take_args(args)?;
                let automation = service
                    .store
                    .update_automation(&args.id, args.input, super::now_millis())
                    .map_err(PluginError::new)?
                    .ok_or_else(|| PluginError::new("automation not found"))?;
                service.notify(&automation.id);
                json(automation)
            }
        })?;

        #[derive(Deserialize)]
        struct EnabledArgs {
            id: String,
            enabled: bool,
        }
        let service = runtime.clone();
        ctx.command("automation.set_enabled", move |args| {
            let service = service.clone();
            async move {
                let args: EnabledArgs = take_args(args)?;
                let automation = service
                    .store
                    .set_automation_enabled(&args.id, args.enabled, super::now_millis())
                    .map_err(PluginError::new)?
                    .ok_or_else(|| PluginError::new("automation not found"))?;
                service.notify(&automation.id);
                json(automation)
            }
        })?;

        #[derive(Deserialize)]
        struct IdArgs {
            id: String,
        }
        let service = runtime.clone();
        ctx.command("automation.delete", move |args| {
            let service = service.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                let deleted = service
                    .store
                    .delete_automation(&args.id)
                    .map_err(PluginError::new)?;
                service.notify(&args.id);
                json(deleted)
            }
        })?;

        #[derive(Deserialize)]
        struct ListRunsArgs {
            #[serde(default)]
            automation_id: Option<String>,
            #[serde(default = "default_run_limit")]
            limit: usize,
        }
        fn default_run_limit() -> usize {
            50
        }
        let service = runtime.clone();
        ctx.command("automation.runs", move |args| {
            let service = service.clone();
            async move {
                let args: ListRunsArgs = take_args(args)?;
                json(
                    service
                        .store
                        .list_automation_runs(args.automation_id.as_deref(), args.limit)
                        .map_err(PluginError::new)?,
                )
            }
        })?;

        let service = runtime;
        ctx.command("automation.run_now", move |args| {
            let service = service.clone();
            async move {
                let args: IdArgs = take_args(args)?;
                json(service.run_now(&args.id).map_err(PluginError::new)?)
            }
        })?;
        Ok(())
    }
}
