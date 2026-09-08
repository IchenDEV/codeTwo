//! Host-owned issue delivery: plugin I/O is short-lived; Core retains tasks and workspaces.
use codetwo_core::{
    engine::{Engine, ParallelTaskCreation},
    event::{Event, Op},
    issue_delivery::{
        DeliveryPermissions, IssueDelivery, PendingFeedback, TrackedIssue, ValidationResult,
        VerificationReceipt,
    },
    permission::ExecutionPolicy,
    provider::ProviderId,
    session::SessionRunState,
    skill::DocBlock,
    store::Store,
    task::TaskId,
    worktree::WorktreeBaseline,
};
use codetwo_kernel::{
    async_trait, Context, Injection, Plugin, PluginError, PluginResult, WeakContext,
};
use codetwo_plugins::{events::EngineEvent, EngineService, Paths, PluginHub, StoreService};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::{io::AsyncReadExt, process::Command, sync::Mutex};

fn error(message: impl ToString) -> PluginError {
    PluginError::new(message.to_string())
}
fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
fn decode<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, PluginError> {
    serde_json::from_value(value).map_err(error)
}
fn encode(value: impl serde::Serialize) -> Result<Value, PluginError> {
    serde_json::to_value(value).map_err(error)
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Connector {
    plugin_id: String,
    connector_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConnectorRequest {
    connector: Connector,
    operation: String,
    #[serde(default)]
    input: Value,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ConnectRequest {
    connector: Connector,
    token: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StartRequest {
    connector: Connector,
    issue_id: String,
    repository: String,
    provider: String,
    #[serde(default)]
    model: Option<String>,
    base_branch: String,
    acceptance: String,
    validation_commands: Vec<String>,
    permissions: DeliveryPermissions,
    #[serde(default)]
    done_state_id: Option<String>,
    #[serde(default)]
    new_attempt: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RunRequest {
    id: String,
    #[serde(default)]
    message: String,
    #[serde(default)]
    accept_issue_update: bool,
}

pub struct IssueDeliveryPlugin;
struct Controller {
    store: Arc<Store>,
    engine: Arc<Engine>,
    hub: Arc<PluginHub>,
    context: WeakContext,
    credential_namespace: String,
    credentials: Arc<dyn CredentialStore>,
    gate: Mutex<()>,
    cancellations: std::sync::Mutex<std::collections::BTreeSet<String>>,
    run_gates: std::sync::Mutex<std::collections::HashMap<String, Arc<Mutex<()>>>>,
}

#[async_trait]
impl Plugin for IssueDeliveryPlugin {
    fn name(&self) -> &str {
        "issue-delivery"
    }
    fn description(&self) -> Option<&str> {
        Some("Issue development, verified PR delivery, and recoverable tracker synchronization.")
    }
    fn inject(&self) -> Injection {
        Injection::required(["store", "engine", "plugin-hub", "paths"])
    }
    async fn apply(&self, ctx: Context, _: Value) -> PluginResult {
        let paths = ctx.expect::<Paths>()?;
        let store = ctx.expect::<StoreService>()?.0.clone();
        store.init_issue_delivery().map_err(error)?;
        let controller = Arc::new(Controller {
            store,
            engine: ctx.expect::<EngineService>()?.0.clone(),
            hub: ctx.expect::<PluginHub>()?,
            context: ctx.weak(),
            credentials: Arc::new(SystemCredentials),
            credential_namespace: format!(
                "dev.codetwo.issues.{}",
                blake3::hash(paths.data_dir.to_string_lossy().as_bytes()).to_hex()
            ),
            gate: Mutex::new(()),
            cancellations: std::sync::Mutex::new(Default::default()),
            run_gates: std::sync::Mutex::new(Default::default()),
        });
        let c = controller.clone();
        ctx.command("issue_delivery.connect", move |args| {
            let c = c.clone();
            async move {
                let args: ConnectRequest = decode(args)?;
                if args.token.trim().is_empty() || args.token.len() > 8192 {
                    return Err(error("Enter a valid API key."));
                }
                let _guard = c.gate.lock().await;
                c.check_connector(&args.connector)?;
                let result = c
                    .invoke(
                        &args.connector,
                        "connection.info",
                        json!({}),
                        Some(args.token.trim().into()),
                    )
                    .await?;
                c.credentials
                    .access(
                        &c.credential_namespace,
                        &args.connector,
                        CredentialOp::Set(args.token.trim().into()),
                    )
                    .await?;
                Ok(result)
            }
        })?;
        let c = controller.clone();
        ctx.command("issue_delivery.disconnect", move |args| {
            let c = c.clone();
            async move {
                let connector: Connector = decode(args)?;
                let _guard = c.gate.lock().await;
                c.credentials
                    .access(&c.credential_namespace, &connector, CredentialOp::Delete)
                    .await?;
                Ok(Value::Null)
            }
        })?;
        let c = controller.clone();
        ctx.command("issue_delivery.read", move |args| {
            let c = c.clone();
            async move {
                let args: ConnectorRequest = decode(args)?;
                if !matches!(
                    args.operation.as_str(),
                    "connection.info" | "issues.list" | "issues.get"
                ) {
                    return Err(error("Unsupported read operation."));
                }
                if args.operation == "issues.get" {
                    c.read_issue(&args.connector, args.input).await
                } else {
                    c.invoke(&args.connector, &args.operation, args.input, None)
                        .await
                }
            }
        })?;
        ctx.command("issue_delivery.repository", move |args| async move {
            #[derive(Deserialize)] struct RepositoryArgs { path: String }
            let args:RepositoryArgs=decode(args)?;
            let path=std::fs::canonicalize(args.path).map_err(|_|error("Repository not found."))?;
            let branch=git(&path,&["symbolic-ref","--short","HEAD"]).await?.trim().to_owned();
            let validation = if path.join("Cargo.toml").is_file() { "cargo test" }
                else if path.join("bun.lock").is_file() || path.join("bun.lockb").is_file() { "bun test" }
                else if path.join("pnpm-lock.yaml").is_file() { "pnpm test" }
                else if path.join("package.json").is_file() { "npm test" } else { "" };
            let common=git(&path,&["rev-parse","--path-format=absolute","--git-common-dir"]).await?;
            let identity=std::fs::canonicalize(common.trim()).map_err(error)?.to_string_lossy().into_owned();
            Ok(json!({"base_branch":branch,"validation_command":validation,"repository_identity":identity}))
        })?;
        let c = controller.clone();
        ctx.command("issue_delivery.start", move |args| {
            let c = c.clone();
            async move {
                let args: StartRequest = decode(args)?;
                let _guard = c.gate.lock().await;
                encode(c.start(args).await?)
            }
        })?;
        let c = controller.clone();
        ctx.command("issue_delivery.list", move |_| {
            let c = c.clone();
            async move { encode(c.store.issue_deliveries().map_err(error)?) }
        })?;
        for operation in ["continue", "cancel", "refresh", "publish", "retry_creation"] {
            let c = controller.clone();
            ctx.command(format!("issue_delivery.{operation}"), move |args| { let c = c.clone(); async move {
                let args: RunRequest = decode(args)?;
                if operation == "cancel" {
                    let existing=c.store.issue_delivery(&args.id).map_err(error)?.ok_or_else(||error("Development task not found."))?;
                    if matches!(existing.stage.as_str(),"merged"|"closed") {return Err(error("This attempt is already finished."));}
                    c.cancellations.lock().unwrap().insert(args.id.clone());
                }
                let gate=c.run_gate(&args.id);
                let _guard = gate.lock().await;
                let mut run = c.store.issue_delivery(&args.id).map_err(error)?.ok_or_else(|| error("Development task not found."))?;
                match operation {
                    "cancel" => {
                        c.cancellations.lock().unwrap().remove(&run.id);
                        if matches!(run.stage.as_str(),"merged"|"closed") { return Err(error("This attempt is already finished.")); }
                        if let Some(session) = &run.session_id { c.engine.submit(Op::Cancel { session: session.clone() }).await.map_err(error)?; }
                        run.stage = "cancelled".into(); run.error = None; run.sync_pending=run.permissions.writeback;
                        c.cancellations.lock().unwrap().remove(&run.id);
                    }
                    "continue" => {
                        if run.terminal() { return Err(error("This attempt is finished. Start a new attempt explicitly.")); }
                        if args.accept_issue_update {
                            if let Some(issue) = run.pending_issue.take() { run.issue = issue; }
                        } else if run.pending_issue.is_some() { return Err(error("Review and accept the changed issue before continuing.")); }
                        if args.message.trim().is_empty() { return Err(error("Describe what to continue or clarify.")); }
                        if args.message.len() > 24_000 { return Err(error("Continuation is too long.")); }
                        let session = run.session_id.clone().ok_or_else(|| error("The task has no session yet. Refresh its creation status."))?;
                        c.prompt(&session, &format!("Continue the existing issue development task. Keep its repository and authorization boundaries.\n\nUser clarification:\n{}\n\nCurrent task context:\n{}", args.message, run.prompt()), format!("issue-continue:{}:{}", run.id, uuid::Uuid::new_v4())).await?;
                        run.stage = "developing".into(); run.error = None; run.verification = None;
                    }
                    "retry_creation" => {
                        if run.terminal() {return Err(error("This attempt is finished."));}
                        let leases=c.store.list_task_session_leases(&TaskId::new(run.task_id.clone())).map_err(error)?;
                        if let Some(lease)=leases.first() {run.session_id=Some(lease.session_id.clone());}
                        else {
                            if c.store.get_task(&TaskId::new(run.task_id.clone())).map_err(error)?.is_some() {return Err(error("The task exists but its session needs recovery. No duplicate was created."));}
                            if git(Path::new(&run.repository),&["rev-parse","HEAD"]).await?.trim()!=run.base_sha {return Err(error("The original base changed. Restore it or cancel and start a new attempt."));}
                            c.create_task(&run).await?;
                        }
                        run.stage="creating".into(); run.error=None;
                    }
                    "publish" => { c.reconcile(&mut run, true).await; }
                    _ => { c.reconcile(&mut run, true).await; }
                }
                c.save(&mut run)?;
                encode(run)
            }})?;
        }
        // This is an application-owned task observer, not a remote scheduler. Credentials and
        // bundle policy are checked at every external read/write; disabling a bundle keeps tasks.
        let c = controller.clone();
        ctx.spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                c.tick().await;
            }
        });
        let weak = Arc::downgrade(&controller);
        let context = ctx.weak();
        ctx.on::<EngineEvent, _>(move |event| {
            if matches!(
                &event.0,
                Event::SessionCreated { .. } | Event::TurnEnded { .. }
            ) {
                if let (Some(c), Some(ctx)) = (weak.upgrade(), context.upgrade()) {
                    ctx.spawn(async move {
                        c.tick().await;
                    });
                }
            }
            None
        });
        Ok(())
    }
}

enum CredentialOp {
    Get,
    Set(String),
    Delete,
}
#[async_trait]
trait CredentialStore: Send + Sync {
    async fn access(
        &self,
        namespace: &str,
        connector: &Connector,
        operation: CredentialOp,
    ) -> Result<Option<String>, PluginError>;
}
struct SystemCredentials;
#[async_trait]
impl CredentialStore for SystemCredentials {
    async fn access(
        &self,
        namespace: &str,
        connector: &Connector,
        operation: CredentialOp,
    ) -> Result<Option<String>, PluginError> {
        credential(namespace, connector, operation).await
    }
}

async fn credential(
    namespace: &str,
    connector: &Connector,
    operation: CredentialOp,
) -> Result<Option<String>, PluginError> {
    let namespace = namespace.to_owned();
    let account = format!("{}:{}", connector.plugin_id, connector.connector_id);
    tokio::task::spawn_blocking(move || {
        static KEYRING_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = KEYRING_LOCK
            .lock()
            .map_err(|_| error("Credential store is unavailable."))?;
        let entry = keyring::Entry::new(&namespace, &account)
            .map_err(|_| error("System credential store is unavailable."))?;
        match operation {
            CredentialOp::Get => entry
                .get_password()
                .map(Some)
                .map_err(|_| error("Reconnect this issue tracker to access its saved credential.")),
            CredentialOp::Set(token) => entry
                .set_password(&token)
                .map(|_| None)
                .map_err(|_| error("Could not save the API key in the system credential store.")),
            CredentialOp::Delete => match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(None),
                Err(_) => Err(error("Could not remove this saved credential.")),
            },
        }
    })
    .await
    .map_err(|_| error("Credential operation failed."))?
}

impl Controller {
    fn run_gate(&self, id: &str) -> Arc<Mutex<()>> {
        self.run_gates
            .lock()
            .unwrap()
            .entry(id.into())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }
    fn check_connector(&self, connector: &Connector) -> PluginResult {
        let plugin = self
            .hub
            .installed()
            .into_iter()
            .find(|p| p.id == connector.plugin_id)
            .ok_or_else(|| error("Install this issue tracker plugin first."))?;
        if !plugin.enabled || !plugin.trusted {
            return Err(error("Enable and trust this issue tracker plugin first."));
        }
        if !plugin.connector_contributions.iter().any(|c| {
            c.id == connector.connector_id && c.capabilities.iter().any(|cap| cap == "issues")
        }) {
            return Err(error(
                "This plugin does not own the selected issue connector.",
            ));
        }
        Ok(())
    }
    async fn invoke(
        &self,
        connector: &Connector,
        operation: &str,
        input: Value,
        token: Option<String>,
    ) -> Result<Value, PluginError> {
        self.check_connector(connector)?;
        let mut input = input.as_object().cloned().unwrap_or_default();
        input.remove("_credential");
        let token = match token {
            Some(token) => token,
            None => self
                .credentials
                .access(&self.credential_namespace, connector, CredentialOp::Get)
                .await?
                .ok_or_else(|| error("Reconnect this issue tracker."))?,
        };
        input.insert("_credential".into(), Value::String(token));
        let context = self
            .context
            .upgrade()
            .ok_or_else(|| error("Issue delivery is unavailable."))?;
        context.call("plugins.invoke_connector", json!({"plugin_id":connector.plugin_id,"contribution_id":connector.connector_id,"operation":operation,"input":input})).await.map_err(|_| error("Issue tracker request failed. Check the connection, plugin state, and access permissions."))
    }
    async fn read_issue(&self, connector: &Connector, input: Value) -> Result<Value, PluginError> {
        let mut issue = self.invoke(connector, "issues.get", input, None).await?;
        for field in ["comments", "attachments"] {
            let more = format!("{field}_more");
            let cursor_key = format!("{field}_cursor");
            let mut cursor = if issue[&more].as_bool() == Some(true) {
                issue[&cursor_key].as_str().map(str::to_owned)
            } else {
                None
            };
            if issue[&more].as_bool() == Some(true) && cursor.is_none() {
                return Err(error(
                    "Issue context is incomplete: pagination cursor missing.",
                ));
            }
            for page in 0..10 {
                let Some(current) = cursor.take() else {
                    break;
                };
                let next = self
                    .invoke(
                        connector,
                        &format!("issues.{field}"),
                        json!({"id":issue["id"],"cursor":current}),
                        None,
                    )
                    .await?;
                let values = next["items"]
                    .as_array()
                    .ok_or_else(|| error("Incomplete issue page."))?
                    .clone();
                issue[field]
                    .as_array_mut()
                    .ok_or_else(|| error("Incomplete issue context."))?
                    .extend(values);
                cursor = next["cursor"].as_str().map(str::to_owned);
                if serde_json::to_vec(&issue).map_err(error)?.len() > 600_000
                    || (page == 9 && cursor.is_some())
                {
                    return Err(error(
                        "Issue context is too large. Narrow the requirement before starting.",
                    ));
                }
            }
            issue[&more] = json!(false);
        }
        Ok(issue)
    }
    async fn wait_cancel(&self, id: &str) {
        loop {
            if self.cancellations.lock().unwrap().contains(id) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
    fn save(&self, run: &mut IssueDelivery) -> PluginResult {
        run.updated_at = now();
        self.store.save_issue_delivery(run).map_err(error)
    }
    async fn start(&self, args: StartRequest) -> Result<IssueDelivery, PluginError> {
        if args.acceptance.trim().is_empty() || args.acceptance.len() > 24_000 {
            return Err(error("Provide bounded acceptance criteria."));
        }
        if args.validation_commands.is_empty()
            || args.validation_commands.len() > 8
            || args
                .validation_commands
                .iter()
                .any(|s| s.trim().is_empty() || s.len() > 2000)
        {
            return Err(error(
                "Provide 1–8 validation commands for this repository.",
            ));
        }
        if args.permissions.create_pr && !args.permissions.push {
            return Err(error("PR creation also requires push permission."));
        }
        if args.provider.trim().is_empty() || args.provider.len() > 256 {
            return Err(error("Choose a configured provider."));
        }
        let repository = std::fs::canonicalize(&args.repository)
            .map_err(|_| error("Choose an existing repository."))?;
        let root = git(&repository, &["rev-parse", "--show-toplevel"]).await?;
        let repository = PathBuf::from(root.trim());
        let common = git(
            &repository,
            &["rev-parse", "--path-format=absolute", "--git-common-dir"],
        )
        .await?;
        let identity = std::fs::canonicalize(common.trim())
            .map_err(error)?
            .to_string_lossy()
            .into_owned();
        git(
            &repository,
            &["check-ref-format", "--branch", &args.base_branch],
        )
        .await?;
        let current_branch = git(&repository, &["symbolic-ref", "--short", "HEAD"])
            .await?
            .trim()
            .to_owned();
        if args.base_branch != current_branch {
            return Err(error(
                "The base must be the source checkout's current branch. Switch it before starting.",
            ));
        }
        let remote = codetwo_core::source_control::inspect(&repository)
            .await
            .map_err(error)?;
        if args.permissions.create_pr
            && !remote.as_ref().is_some_and(|r| {
                r.host == "github.com" && r.remote_name == "origin" && r.required_cli_available
            })
        {
            return Err(error(
                "PR delivery requires GitHub CLI and a github.com origin remote.",
            ));
        }
        let remote_url = remote.and_then(|r| r.web_url);
        let base_sha = git(
            &repository,
            &[
                "rev-parse",
                "--verify",
                &format!("refs/heads/{}^{{commit}}", args.base_branch),
            ],
        )
        .await?
        .trim()
        .to_string();
        let issue: TrackedIssue = decode(
            self.read_issue(&args.connector, json!({"id":args.issue_id}))
                .await?,
        )?;
        if issue.description.len() > 100_000 || issue.id.is_empty() || issue.workspace_id.is_empty()
        {
            return Err(error("Issue context is missing or too large."));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let run = IssueDelivery {
            task_id: format!("issue-{id}"),
            id: id.clone(),
            plugin_id: args.connector.plugin_id,
            connector_id: args.connector.connector_id,
            repository: repository.to_string_lossy().into_owned(),
            repository_identity: identity,
            remote_url,
            session_id: None,
            work_branch: None,
            issue,
            provider: args.provider,
            model: args.model,
            base_branch: args.base_branch,
            base_sha,
            permissions: args.permissions,
            validation_commands: args.validation_commands,
            acceptance: args.acceptance,
            done_state_id: args.done_state_id.filter(|s| !s.is_empty()),
            stage: "creating".into(),
            error: None,
            verification: None,
            pull_request: None,
            pending_issue: None,
            seen_review_ids: vec![],
            pending_feedback: None,
            synced_milestones: vec![],
            sync_error: None,
            sync_pending: false,
            initial_prompt_sent: false,
            created_at: now(),
            updated_at: now(),
        };
        let (mut run, created) = self
            .store
            .reserve_issue_delivery(&run, args.new_attempt)
            .map_err(error)?;
        if !created {
            return Ok(run);
        }
        let result = self.create_task(&run).await;
        if let Err(e) = result {
            run.stage = "blocked".into();
            run.error = Some(e.to_string());
            self.save(&mut run)?;
        }
        Ok(run)
    }
    async fn create_task(&self, run: &IssueDelivery) -> PluginResult {
        let provider: ProviderId = serde_json::from_value(json!(run.provider))
            .unwrap_or_else(|_| ProviderId::Custom(run.provider.clone()));
        self.engine
            .create_parallel_task_session(ParallelTaskCreation {
                provider,
                cwd: run.repository.clone(),
                worktree_base: WorktreeBaseline::Current,
                worktree_base_sha: Some(run.base_sha.clone()),
                request_id: format!("issue-create:{}", run.id),
                model: run.model.clone(),
                initial_policy: Some(ExecutionPolicy::default()),
                reasoning_effort: None,
                task_id: TaskId::new(run.task_id.clone()),
                goal: format!("{}: {}", run.issue.identifier, run.issue.title)
                    .chars()
                    .take(4096)
                    .collect(),
            })
            .await
            .map_err(error)
    }
    async fn prompt(&self, session: &str, text: &str, request: String) -> PluginResult {
        self.engine
            .submit(Op::Prompt {
                session: session.into(),
                doc: vec![DocBlock::Text { text: text.into() }],
                request_id: Some(format!("t3-command:{request}")),
            })
            .await
            .map_err(error)
    }
    async fn tick(&self) {
        use futures_util::{stream, StreamExt};
        let Ok(runs) = self.store.issue_deliveries() else {
            return;
        };
        stream::iter(runs.into_iter().filter(|r| !r.terminal() || r.sync_pending))
            .for_each_concurrent(4, |mut run| async move {
                let gate = self.run_gate(&run.id);
                let Ok(_guard) = gate.try_lock() else {
                    return;
                };
                // Re-read after taking the per-run lock; a user may have cancelled or continued it.
                let Ok(Some(current)) = self.store.issue_delivery(&run.id) else {
                    return;
                };
                run = current;
                self.reconcile(&mut run, false).await;
                let _ = self.save(&mut run);
            })
            .await;
    }
    async fn reconcile(&self, run: &mut IssueDelivery, explicit: bool) {
        if run.terminal() {
            if let Err(e) = self.sync(run).await {
                run.sync_error = Some(e.to_string());
            }
            return;
        }
        let id = run.id.clone();
        tokio::select! {
            result=self.reconcile_inner(run, explicit) => if let Err(e)=result {run.error=Some(e.to_string());},
            _=self.wait_cancel(&id) => {if !run.terminal() {run.stage="cancelled".into();run.error=None;run.sync_pending=run.permissions.writeback;}}
        }
    }
    async fn reconcile_inner(&self, run: &mut IssueDelivery, explicit: bool) -> PluginResult {
        if run.terminal() {
            return self.sync(run).await;
        }
        if run.session_id.is_none() {
            let leases = self
                .store
                .list_task_session_leases(&TaskId::new(run.task_id.clone()))
                .map_err(error)?;
            run.session_id = leases.first().map(|lease| lease.session_id.clone());
            if run.session_id.is_none() {
                if now() - run.created_at > 120_000 {
                    run.stage = "blocked".into();
                    run.error = Some(
                        "Task creation was interrupted. No duplicate task was created.".into(),
                    );
                }
                return Ok(());
            }
        }
        if run.terminal() {
            return self.sync(run).await;
        }
        let session_id = run.session_id.as_ref().unwrap().clone();
        let session = self
            .store
            .get_session(&session_id)
            .map_err(error)?
            .ok_or_else(|| error("The linked session is unavailable."))?;
        if run.work_branch.is_none() {
            run.work_branch = Some(
                git(
                    Path::new(&session.cwd),
                    &["symbolic-ref", "--short", "HEAD"],
                )
                .await?
                .trim()
                .to_owned(),
            );
            self.save(run)?;
        }
        if !run.initial_prompt_sent {
            let request = format!("issue-initial:{}", run.id);
            if self
                .store
                .command_receipt("t3-prompt", &request)
                .map_err(error)?
                .is_some()
            {
                run.initial_prompt_sent = true;
                self.save(run)?;
            } else {
                run.stage = "developing".into();
                self.save(run)?;
                self.prompt(&session_id, &run.prompt(), request).await?;
                run.sync_pending = run.permissions.writeback;
                return self.sync(run).await;
            }
        }
        if let Some(pending) = run.pending_feedback.clone() {
            if self
                .store
                .command_receipt("t3-prompt", &pending.request_id)
                .map_err(error)?
                .is_some()
            {
                run.seen_review_ids.extend(pending.ids);
                run.pending_feedback = None;
                self.save(run)?;
            } else if matches!(session.activity.state, SessionRunState::Idle) {
                self.prompt(&session_id, &pending.body, pending.request_id)
                    .await?;
                return Ok(());
            }
        }
        let connector = Connector {
            plugin_id: run.plugin_id.clone(),
            connector_id: run.connector_id.clone(),
        };
        if self.check_connector(&connector).is_ok() {
            match self
                .read_issue(&connector, json!({"id":run.issue.id}))
                .await
                .and_then(decode::<TrackedIssue>)
            {
                Ok(latest) => {
                    if latest.workspace_id != run.issue.workspace_id {
                        return Err(error(
                            "The issue connector now belongs to another workspace.",
                        ));
                    }
                    run.sync_error = None;
                    if requirements_changed(&run.issue, &latest) {
                        run.pending_issue = Some(latest);
                    }
                }
                Err(e) => run.sync_error = Some(e.to_string()),
            }
        }
        if matches!(
            session.activity.state,
            SessionRunState::Running { .. } | SessionRunState::AwaitingInput { .. }
        ) {
            return self.sync(run).await;
        }
        if run.pending_issue.is_some() {
            run.stage = "blocked".into();
            return Err(error(
                "Issue requirements changed. Review the changes before continuing.",
            ));
        }
        if matches!(session.activity.state, SessionRunState::Failed { .. }) {
            run.stage = "blocked".into();
            return Err(error(
                "The development session needs attention. Open it to continue.",
            ));
        }
        let cwd = Path::new(&session.cwd);
        validate_checkout(run, &session).await?;
        if let Some(pr) = if (run.permissions.create_pr || run.pull_request.is_some())
            && run.remote_url.is_some()
            && codetwo_core::provider::which("gh").is_some()
        {
            bound_pr(cwd, run).await?
        } else {
            None
        } {
            run.pull_request = Some(pr.clone());
            match pr["state"].as_str() {
                Some("MERGED") => {
                    run.stage = "merged".into();
                    run.error = None;
                    run.sync_pending = run.permissions.writeback;
                    return self.sync(run).await;
                }
                Some("CLOSED") => {
                    run.stage = "closed".into();
                    run.error =
                        Some("PR closed without merging; the issue was not completed.".into());
                    run.sync_pending = run.permissions.writeback;
                    return self.sync(run).await;
                }
                _ => {}
            }
            let feedback = review_feedback(cwd, &pr).await?;
            let fresh = feedback
                .into_iter()
                .filter(|(id, _)| !run.seen_review_ids.contains(id))
                .collect::<Vec<_>>();
            if !fresh.is_empty() {
                let pending=PendingFeedback {
                    ids:fresh.iter().map(|(id,_)|id.clone()).collect(),
                    body:format!("Continue this issue in the same worktree. Review the following external PR feedback, apply relevant fixes, rerun validation, and commit locally. Preserve repository rules and the original permissions. Do not push, merge, deploy, or post replies.\n\n{}",fresh.iter().map(|(_,body)|body.as_str()).collect::<Vec<_>>().join("\n\n")),
                    request_id:format!("issue-review:{}:{}",run.id,uuid::Uuid::new_v4()),
                };
                run.pending_feedback = Some(pending.clone());
                run.stage = "developing".into();
                run.verification = None;
                self.save(run)?;
                self.prompt(&session_id, &pending.body, pending.request_id)
                    .await?;
                return Ok(());
            }
        }
        if run.stage != "blocked" || explicit {
            self.verify_and_publish(run).await?;
        }
        self.sync(run).await
    }
    async fn verify_and_publish(&self, run: &mut IssueDelivery) -> PluginResult {
        if run.terminal() {
            return Err(error("This delivery attempt is already finished."));
        }
        let session = self
            .store
            .get_session(
                run.session_id
                    .as_deref()
                    .ok_or_else(|| error("Task creation is not complete."))?,
            )
            .map_err(error)?
            .ok_or_else(|| error("Session not found."))?;
        if !matches!(session.activity.state, SessionRunState::Idle) {
            return Err(error("Wait for the current session turn to finish."));
        }
        if run.pending_issue.is_some() {
            return Err(error("Review the changed issue first."));
        }
        let cwd = Path::new(&session.cwd);
        validate_checkout(run, &session).await?;
        if !git(cwd, &["status", "--porcelain"])
            .await?
            .trim()
            .is_empty()
        {
            run.stage = "blocked".into();
            return Err(error(
                "Commit the completed local changes before delivery validation.",
            ));
        }
        let head = git(cwd, &["rev-parse", "HEAD"]).await?.trim().to_owned();
        if head == run.base_sha {
            run.stage = "blocked".into();
            return Err(error("No committed feature changes are available yet."));
        }
        if !run
            .verification
            .as_ref()
            .is_some_and(|v| v.passed && v.head == head)
        {
            run.stage = "verifying".into();
            self.save(run)?;
            let mut results = Vec::new();
            for command in &run.validation_commands {
                results.push(validate_command(cwd, command).await?);
            }
            let passed = results.iter().all(|r| r.exit_code == Some(0))
                && git(cwd, &["rev-parse", "HEAD"]).await?.trim() == head
                && git(cwd, &["status", "--porcelain"])
                    .await?
                    .trim()
                    .is_empty();
            run.verification = Some(VerificationReceipt {
                head: head.clone(),
                passed,
                results,
            });
            if !passed {
                run.stage = "blocked".into();
                return Err(error(
                    "Validation failed or changed the checkout. Review the recorded results.",
                ));
            }
        }
        run.error = None;
        run.stage = "verified".into();
        if !run.permissions.create_pr {
            return Ok(());
        }
        if !run.permissions.push {
            return Err(error("Push permission was not granted."));
        }
        let branch = git(cwd, &["symbolic-ref", "--short", "HEAD"])
            .await?
            .trim()
            .to_owned();
        if branch == run.base_branch {
            return Err(error(
                "Delivery must use the task's isolated feature branch.",
            ));
        }
        let common = git(
            cwd,
            &["rev-parse", "--path-format=absolute", "--git-common-dir"],
        )
        .await?;
        if std::fs::canonicalize(common.trim())
            .map_err(error)?
            .to_string_lossy()
            != run.repository_identity
        {
            return Err(error(
                "The checkout no longer belongs to the authorized repository.",
            ));
        }
        let remote = codetwo_core::source_control::inspect(cwd)
            .await
            .map_err(error)?
            .ok_or_else(|| error("The authorized remote is missing."))?;
        if remote.remote_name != "origin" || remote.web_url != run.remote_url {
            return Err(error("The remote changed since delivery was authorized."));
        }
        if git(cwd, &["rev-parse", "HEAD"]).await?.trim() != head
            || !git(cwd, &["status", "--porcelain"])
                .await?
                .trim()
                .is_empty()
        {
            return Err(error("The checkout changed after validation."));
        }
        if run
            .pull_request
            .as_ref()
            .and_then(|pr| pr["headRefOid"].as_str())
            != Some(head.as_str())
        {
            git(
                cwd,
                &[
                    "push",
                    "--",
                    "origin",
                    &format!("{head}:refs/heads/{branch}"),
                ],
            )
            .await?;
        }
        if let Some(pr) = bound_pr(cwd, run).await? {
            run.pull_request = Some(pr);
        } else {
            let body = format!(
                "{}\n\n## Acceptance\n{}\n\n## Verification\n{}\n\nValidated commit: `{}`\n",
                run.issue.url,
                run.acceptance,
                run.validation_commands
                    .iter()
                    .map(|s| format!("- `{s}`"))
                    .collect::<Vec<_>>()
                    .join("\n"),
                head
            );
            let body_file = tempfile::NamedTempFile::new().map_err(error)?;
            std::fs::write(body_file.path(), body).map_err(error)?;
            gh(
                cwd,
                vec![
                    "pr".into(),
                    "create".into(),
                    "--repo".into(),
                    run.remote_url
                        .clone()
                        .ok_or_else(|| error("Authorized repository is missing."))?,
                    "--base".into(),
                    run.base_branch.clone(),
                    "--head".into(),
                    branch,
                    "--title".into(),
                    format!("{}: {}", run.issue.identifier, run.issue.title),
                    "--body-file".into(),
                    body_file.path().to_string_lossy().into_owned(),
                ],
            )
            .await?;
            run.pull_request = bound_pr(cwd, run).await?;
        }
        run.stage = "review".into();
        run.sync_pending = run.permissions.writeback;
        self.save(run)
    }
    async fn sync(&self, run: &mut IssueDelivery) -> PluginResult {
        if !run.permissions.writeback {
            return Ok(());
        }
        let milestone = match run.stage.as_str() {
            "creating" => return Ok(()),
            "developing" => "started",
            "review" => "review",
            "merged" => "merged",
            "closed" => "closed",
            "cancelled" => "cancelled",
            _ => return Ok(()),
        };
        if run.synced_milestones.iter().any(|s| s == milestone) {
            run.sync_pending = false;
            return Ok(());
        }
        run.sync_pending = true;
        let connector = Connector {
            plugin_id: run.plugin_id.clone(),
            connector_id: run.connector_id.clone(),
        };
        let status = match milestone {
            "started" => "Development started in CodeTwo.",
            "review" => {
                "Implementation and validation completed; pull request is ready for review."
            }
            "merged" => "The linked pull request has been merged.",
            "closed" => {
                "The pull request was closed without merging. The issue is not marked complete."
            }
            _ => "Development was cancelled. The issue is not marked complete.",
        };
        let body = format!(
            "{}\n\n{}\n\n{}\n\n<!-- codetwo:{}:{} -->",
            status,
            run.pull_request
                .as_ref()
                .and_then(|pr| pr["url"].as_str())
                .unwrap_or(""),
            if milestone == "merged" {
                format!(
                    "Validation: {}",
                    run.verification
                        .as_ref()
                        .filter(|v| run
                            .pull_request
                            .as_ref()
                            .and_then(|p| p["headRefOid"].as_str())
                            == Some(v.head.as_str()))
                        .map(|v| v.head.as_str())
                        .unwrap_or("No local validation receipt for the merged revision")
                )
            } else {
                String::new()
            },
            run.id,
            milestone
        );
        match self.invoke(&connector,"issues.sync",json!({"id":run.issue.id,"workspace_id":run.issue.workspace_id,"key":format!("{}:{milestone}",run.id),"body":body,"state_id":if milestone=="merged" {run.done_state_id.clone()}else{None}}),None).await {
            Ok(_) => {run.synced_milestones.push(milestone.into());run.sync_pending=false;run.sync_error=None;}
            Err(e) => {run.sync_error=Some(e.to_string());}
        }
        Ok(())
    }
}

struct ProcessGroup(Option<u32>);
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(pid) = self.0 {
            unsafe extern "C" {
                fn killpg(group: i32, signal: i32) -> i32;
            }
            unsafe {
                killpg(pid as i32, 9);
            }
        }
    }
}

async fn bounded_output(
    mut command: Command,
    seconds: u64,
) -> Result<(Option<i32>, String), PluginError> {
    command
        .kill_on_drop(true)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .stdin(std::process::Stdio::null());
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command
        .spawn()
        .map_err(|_| error("Could not start the requested command."))?;
    let _group = ProcessGroup(child.id());
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let read = |stream: Box<dyn tokio::io::AsyncRead + Send + Unpin>| async move {
        let mut bytes = Vec::new();
        stream
            .take(1_000_001)
            .read_to_end(&mut bytes)
            .await
            .map_err(error)?;
        if bytes.len() > 1_000_000 {
            return Err(error("Command output exceeded its limit."));
        }
        Ok::<_, PluginError>(bytes)
    };
    let result = tokio::time::timeout(Duration::from_secs(seconds), async {
        let (out, err, status) =
            tokio::try_join!(read(Box::new(stdout)), read(Box::new(stderr)), async {
                child.wait().await.map_err(error)
            })?;
        Ok::<_, PluginError>((
            status.code(),
            String::from_utf8_lossy(&[out, err].concat()).into_owned(),
        ))
    })
    .await
    .map_err(|_| error("Command timed out."))?;
    result
}
async fn git(cwd: &Path, args: &[&str]) -> Result<String, PluginError> {
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0");
    let (code, out) = bounded_output(command, 120).await?;
    if code != Some(0) {
        return Err(error(
            "Git operation failed. Check the branch, repository and authentication.",
        ));
    }
    Ok(out)
}
async fn gh(cwd: &Path, args: Vec<String>) -> Result<String, PluginError> {
    let mut command = Command::new("gh");
    command
        .args(args)
        .current_dir(cwd)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat");
    let (code, out) = bounded_output(command, 120).await?;
    if code != Some(0) {
        return Err(error(
            "GitHub operation failed. Check GitHub CLI authentication and repository access.",
        ));
    }
    Ok(out)
}
fn requirements_changed(previous: &TrackedIssue, next: &TrackedIssue) -> bool {
    fn comments(issue: &TrackedIssue) -> Vec<Value> {
        issue
            .comments
            .iter()
            .filter(|comment| {
                !comment["body"]
                    .as_str()
                    .unwrap_or_default()
                    .contains("<!-- codetwo:")
            })
            .cloned()
            .collect()
    }
    previous.title != next.title
        || previous.description != next.description
        || comments(previous) != comments(next)
        || previous.attachments != next.attachments
}
async fn validate_checkout(run: &IssueDelivery, session: &codetwo_core::Session) -> PluginResult {
    if session.worktree_discarded || session.worktree_path.is_none() {
        return Err(error("The task's isolated checkout is unavailable."));
    }
    let root = Path::new(session.worktree_path.as_deref().unwrap());
    if let Some(identity) = &session.worktree_identity {
        if !identity.matches_path(root).map_err(error)? {
            return Err(error("The task checkout directory was replaced."));
        }
    }
    let cwd = Path::new(&session.cwd);
    let common = git(
        cwd,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )
    .await?;
    if std::fs::canonicalize(common.trim())
        .map_err(error)?
        .to_string_lossy()
        != run.repository_identity
    {
        return Err(error("The checkout belongs to another repository."));
    }
    let branch = git(cwd, &["symbolic-ref", "--short", "HEAD"]).await?;
    if Some(branch.trim()) != run.work_branch.as_deref() {
        return Err(error(
            "The task branch changed. Restore the original branch before delivery.",
        ));
    }
    let remote = codetwo_core::source_control::inspect(cwd)
        .await
        .map_err(error)?;
    if remote.and_then(|remote| remote.web_url) != run.remote_url {
        return Err(error("The remote changed since this task was authorized."));
    }
    Ok(())
}
fn validate_pr(run: &IssueDelivery, pr: &Value) -> PluginResult {
    if pr["isCrossRepository"].as_bool() != Some(false) {
        return Err(error(
            "The PR must use the authorized repository's own task branch.",
        ));
    }
    let url = pr["url"]
        .as_str()
        .ok_or_else(|| error("PR URL is missing."))?;
    let expected = run
        .remote_url
        .as_ref()
        .ok_or_else(|| error("Authorized remote is missing."))?;
    if !url.starts_with(&format!("{expected}/pull/"))
        || pr["headRefName"].as_str() != run.work_branch.as_deref()
        || pr["baseRefName"].as_str() != Some(run.base_branch.as_str())
    {
        return Err(error(
            "PR does not match the authorized repository and branches.",
        ));
    }
    if let Some(bound) = &run.pull_request {
        if bound["url"] != pr["url"] || bound["number"] != pr["number"] {
            return Err(error("PR identity changed."));
        }
    }
    Ok(())
}
async fn bound_pr(cwd: &Path, run: &IssueDelivery) -> Result<Option<Value>, PluginError> {
    let fields="number,url,state,headRefOid,headRefName,baseRefName,mergedAt,reviewDecision,comments,reviews,statusCheckRollup,isCrossRepository";
    let repo = run
        .remote_url
        .clone()
        .ok_or_else(|| error("GitHub repository is not configured."))?;
    let value = if let Some(pr) = &run.pull_request {
        let url = pr["url"]
            .as_str()
            .ok_or_else(|| error("Invalid saved PR."))?;
        Some(
            serde_json::from_str::<Value>(
                &gh(
                    cwd,
                    vec![
                        "pr".into(),
                        "view".into(),
                        url.into(),
                        "--repo".into(),
                        repo,
                        "--json".into(),
                        fields.into(),
                    ],
                )
                .await?,
            )
            .map_err(error)?,
        )
    } else {
        let branch = run
            .work_branch
            .clone()
            .ok_or_else(|| error("Task branch is missing."))?;
        let output = gh(
            cwd,
            vec![
                "pr".into(),
                "list".into(),
                "--repo".into(),
                repo,
                "--head".into(),
                branch,
                "--base".into(),
                run.base_branch.clone(),
                "--state".into(),
                "all".into(),
                "--limit".into(),
                "10".into(),
                "--json".into(),
                fields.into(),
            ],
        )
        .await?;
        let values: Vec<Value> = serde_json::from_str(&output).map_err(error)?;
        if values.len() > 1 {
            return Err(error(
                "Multiple PRs match this task branch. Resolve the ambiguity before syncing.",
            ));
        }
        values.into_iter().next()
    };
    if let Some(pr) = &value {
        validate_pr(run, pr)?;
    }
    Ok(value)
}
async fn review_feedback(cwd: &Path, pr: &Value) -> Result<Vec<(String, String)>, PluginError> {
    let mut feedback = Vec::new();
    for check in pr["statusCheckRollup"].as_array().into_iter().flatten() {
        let conclusion = check["conclusion"]
            .as_str()
            .or_else(|| check["state"].as_str())
            .unwrap_or_default();
        if matches!(
            conclusion,
            "FAILURE" | "ERROR" | "TIMED_OUT" | "ACTION_REQUIRED"
        ) {
            let name = check["name"]
                .as_str()
                .or_else(|| check["context"].as_str())
                .unwrap_or("CI check");
            let link = check["detailsUrl"]
                .as_str()
                .or_else(|| check["targetUrl"].as_str())
                .unwrap_or_default();
            let key = format!("ci:{name}:{link}:{}:{conclusion}", check["completedAt"]);
            feedback.push((key,format!("CI check {name} reported {conclusion}. Inspect its logs and fix relevant failures within the current scope; ask the user if it requires administrative approval. {link}")));
        }
    }
    for key in ["comments", "reviews"] {
        for value in pr[key].as_array().into_iter().flatten() {
            let body = value["body"].as_str().unwrap_or_default();
            if body.trim().is_empty() || body.contains("<!-- codetwo:") {
                continue;
            }
            feedback.push((
                format!("{key}:{}:{}", value["id"], blake3::hash(body.as_bytes())),
                body.chars().take(10_000).collect(),
            ));
        }
    }
    let url = url::Url::parse(pr["url"].as_str().ok_or_else(|| error("PR URL missing."))?)
        .map_err(error)?;
    let path = url
        .path_segments()
        .ok_or_else(|| error("Invalid PR URL."))?
        .collect::<Vec<_>>();
    if url.host_str() != Some("github.com") || path.len() != 4 {
        return Err(error("Invalid GitHub PR URL."));
    }
    let repo = format!("{}/{}", path[0], path[1]);
    let number = pr["number"]
        .as_u64()
        .ok_or_else(|| error("Invalid pull request number."))?;
    for page in 1..=20 {
        let output = gh(
            cwd,
            vec![
                "api".into(),
                format!("repos/{repo}/pulls/{number}/comments?per_page=100&page={page}"),
            ],
        )
        .await?;
        let comments: Vec<Value> = serde_json::from_str(&output).map_err(error)?;
        for value in &comments {
            let body = value["body"].as_str().unwrap_or_default();
            feedback.push((
                format!("inline:{}:{}", value["id"], value["updated_at"]),
                format!(
                    "{}:{}\n{}",
                    value["path"],
                    value["line"],
                    body.chars().take(10_000).collect::<String>()
                ),
            ));
        }
        if comments.len() < 100 {
            break;
        }
        if page == 20 {
            return Err(error(
                "Review feedback exceeded its limit; inspect the PR manually.",
            ));
        }
    }
    if feedback.iter().map(|(_, body)| body.len()).sum::<usize>() > 100_000 {
        return Err(error(
            "Review feedback is too large for an automatic continuation. Review it in the task.",
        ));
    }
    Ok(feedback)
}
async fn validate_command(cwd: &Path, script: &str) -> Result<ValidationResult, PluginError> {
    #[cfg(windows)]
    let mut command = {
        let mut c = Command::new("cmd");
        c.args(["/C", script]);
        c
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut c = Command::new("sh");
        c.args(["-lc", script]);
        c
    };
    command.current_dir(cwd);
    let (exit_code, output) = bounded_output(command, 600).await?;
    Ok(ValidationResult {
        command: script.into(),
        exit_code,
        output: output.chars().take(8000).collect(),
    })
}

#[cfg(test)]
#[path = "issue_delivery_tests.rs"]
mod tests;
