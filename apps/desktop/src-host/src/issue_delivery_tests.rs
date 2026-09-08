use super::*;
use codetwo_core::{session::Session, skill::SkillLibrary};
use codetwo_kernel::{App, PluginEntry};
use codetwo_plugins::{AppConfig, CoreApp};

struct RejectCredentials;
#[async_trait]
impl CredentialStore for RejectCredentials {
    async fn access(
        &self,
        _: &str,
        _: &Connector,
        _: CredentialOp,
    ) -> Result<Option<String>, PluginError> {
        panic!("this test must not access any credential store")
    }
}
struct MemoryCredentials(std::sync::Mutex<Vec<String>>);
#[async_trait]
impl CredentialStore for MemoryCredentials {
    async fn access(
        &self,
        namespace: &str,
        connector: &Connector,
        operation: CredentialOp,
    ) -> Result<Option<String>, PluginError> {
        self.0.lock().unwrap().push(format!(
            "{namespace}:{}:{}",
            connector.plugin_id, connector.connector_id
        ));
        match operation {
            CredentialOp::Get => Ok(Some("fixture-secret".into())),
            _ => panic!("unexpected credential mutation"),
        }
    }
}

fn delivery() -> IssueDelivery {
    serde_json::from_value(json!({
        "id":"delivery-1","plugin_id":"linear","connector_id":"issues",
        "repository":"/tmp/test-repository","repository_identity":"test-repository.git","remote_url":null,
        "task_id":"task-1","session_id":null,"work_branch":null,
        "issue":{"workspace_id":"workspace-1","id":"issue-1","identifier":"APP-7","title":"Feature","url":"https://linear.app/test/issue/APP-7","description":"Feature description","updated_at":"2026-09-08","team_id":"team-1"},
        "provider":"codex","model":null,"base_branch":"main","base_sha":"base",
        "permissions":{"push":false,"create_pr":false,"writeback":false},
        "validation_commands":["printf verified"],"acceptance":"Feature works","done_state_id":null,
        "stage":"creating","error":null,"verification":null,"pull_request":null,"pending_issue":null,
        "seen_review_ids":[],"pending_feedback":null,"synced_milestones":[],"sync_error":null,"sync_pending":false,
        "initial_prompt_sent":false,"created_at":1,"updated_at":1
    })).unwrap()
}

#[test]
fn restart_keeps_identity_permissions_and_revision_evidence() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("state.db");
    let mut run = delivery();
    {
        let store = Store::open(path.to_str().unwrap()).unwrap();
        store.init_issue_delivery().unwrap();
        assert!(store.reserve_issue_delivery(&run, false).unwrap().1);
        run.session_id = Some("session-existing".into());
        run.stage = "review".into();
        run.permissions.writeback = true;
        run.pull_request = Some(
            json!({"number":7,"url":"https://github.com/test/repo/pull/7","headRefOid":"head-1"}),
        );
        run.verification = Some(VerificationReceipt {
            head: "head-1".into(),
            passed: true,
            results: vec![],
        });
        run.synced_milestones.push("started".into());
        run.pending_feedback = Some(codetwo_core::issue_delivery::PendingFeedback {
            ids: vec!["review-1".into()],
            body: "Fix this".into(),
            request_id: "stable-request".into(),
        });
        store.save_issue_delivery(&run).unwrap();
    }
    let reopened = Store::open(path.to_str().unwrap()).unwrap();
    reopened.init_issue_delivery().unwrap();
    let restored = reopened.issue_delivery(&run.id).unwrap().unwrap();
    assert_eq!(
        serde_json::to_value(&restored).unwrap(),
        serde_json::to_value(&run).unwrap()
    );
    let mut duplicate = delivery();
    duplicate.id = "another-click".into();
    let (existing, created) = reopened.reserve_issue_delivery(&duplicate, true).unwrap();
    assert!(
        !created,
        "even explicit new-attempt must not duplicate an active delivery"
    );
    assert_eq!(existing.id, run.id);
}

#[test]
fn finished_attempt_requires_explicit_new_attempt_and_isolated_issue_identity() {
    let store = Store::open_in_memory().unwrap();
    store.init_issue_delivery().unwrap();
    let mut run = delivery();
    store.reserve_issue_delivery(&run, false).unwrap();
    run.stage = "cancelled".into();
    store.save_issue_delivery(&run).unwrap();
    let mut second = run.clone();
    second.id = "delivery-2".into();
    second.stage = "creating".into();
    assert!(!store.reserve_issue_delivery(&second, false).unwrap().1);
    assert!(store.reserve_issue_delivery(&second, true).unwrap().1);
    let mut other_workspace = second.clone();
    other_workspace.id = "delivery-3".into();
    other_workspace.issue.workspace_id = "workspace-2".into();
    assert!(
        store
            .reserve_issue_delivery(&other_workspace, false)
            .unwrap()
            .1
    );
    let mut other_repo = second;
    other_repo.id = "delivery-4".into();
    other_repo.repository_identity = "other.git".into();
    assert!(store.reserve_issue_delivery(&other_repo, false).unwrap().1);
    assert_eq!(store.issue_deliveries().unwrap().len(), 4);
}

#[test]
fn request_payload_cannot_smuggle_merge_permission_or_credential_into_start() {
    let base = json!({"connector":{"plugin_id":"linear","connector_id":"issues"},"issue_id":"APP-7","repository":"/tmp/test","provider":"codex","base_branch":"main","acceptance":"Works","validation_commands":["true"],"permissions":{"push":false,"create_pr":false,"writeback":false}});
    assert!(decode::<StartRequest>(base.clone()).is_ok());
    let mut unauthorized = base.clone();
    unauthorized["permissions"]["merge"] = json!(true);
    assert!(decode::<StartRequest>(unauthorized).is_err());
    let mut credential = base;
    credential["token"] = json!("test-secret");
    assert!(decode::<StartRequest>(credential).is_err());
    assert!(
        decode::<RunRequest>(json!({"id":"delivery-1","permissions":{"writeback":true}})).is_err()
    );
}

#[cfg(unix)]
#[tokio::test]
async fn command_execution_records_exit_and_bounds_output_and_time() {
    let temp = tempfile::tempdir().unwrap();
    let result = validate_command(temp.path(), "printf stdout; printf stderr >&2; exit 7")
        .await
        .unwrap();
    assert_eq!(result.exit_code, Some(7));
    assert!(result.output.contains("stdout") && result.output.contains("stderr"));
    let mut command = Command::new("sh");
    command.args(["-c", "head -c 1000001 /dev/zero"]);
    assert!(bounded_output(command, 5)
        .await
        .unwrap_err()
        .to_string()
        .contains("limit"));
    let mut command = Command::new("sh");
    command.args(["-c", "sleep 10"]);
    assert!(bounded_output(command, 0)
        .await
        .unwrap_err()
        .to_string()
        .contains("timed out"));
}

#[cfg(unix)]
#[tokio::test]
async fn cancelling_command_kills_descendants_before_they_can_write() {
    let temp = tempfile::tempdir().unwrap();
    let marker = temp.path().join("escaped");
    let started = temp.path().join("started");
    let mut command = Command::new("sh");
    command
        .args(["-c", "(sleep 1; touch escaped) & touch started; wait"])
        .current_dir(temp.path());
    let task = tokio::spawn(bounded_output(command, 5));
    for _ in 0..100 {
        if started.exists() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(started.exists());
    task.abort();
    let _ = task.await;
    tokio::time::sleep(Duration::from_millis(1200)).await;
    assert!(
        !marker.exists(),
        "cancel must kill the process group, not only the shell"
    );
}

async fn fixture() -> (Controller, CoreApp, App, tempfile::TempDir, IssueDelivery) {
    let temp = tempfile::tempdir().unwrap();
    let app = CoreApp::boot(
        AppConfig::bare_in(temp.path())
            .with(
                "paths",
                PluginEntry::with_config(json!({"data_dir":temp.path()})),
            )
            .with("plugin-hub", PluginEntry::default()),
    )
    .await
    .unwrap();
    let context = App::new();
    let store = Arc::new(Store::open_in_memory().unwrap());
    store.init_issue_delivery().unwrap();
    let (engine, _) = Engine::with_store(vec![], SkillLibrary::default(), store.clone());
    let controller = Controller {
        store: store.clone(),
        engine: Arc::new(engine),
        hub: app.service::<PluginHub>().unwrap(),
        context: context.ctx().weak(),
        credential_namespace: "never-access-credentials".into(),
        credentials: Arc::new(RejectCredentials),
        run_gates: std::sync::Mutex::new(Default::default()),
        gate: Mutex::new(()),
        cancellations: std::sync::Mutex::new(Default::default()),
    };
    let repo = temp.path().join("repository");
    std::fs::create_dir(&repo).unwrap();
    git(&repo, &["init", "-b", "main"]).await.unwrap();
    git(&repo, &["config", "user.name", "Test User"])
        .await
        .unwrap();
    git(&repo, &["config", "user.email", "test@example.invalid"])
        .await
        .unwrap();
    git(&repo, &["config", "commit.gpgsign", "false"])
        .await
        .unwrap();
    git(&repo, &["commit", "--allow-empty", "-m", "base"])
        .await
        .unwrap();
    let mut run = delivery();
    run.repository = repo.to_string_lossy().into_owned();
    run.repository_identity = std::fs::canonicalize(repo.join(".git"))
        .unwrap()
        .to_string_lossy()
        .into_owned();
    run.base_sha = git(&repo, &["rev-parse", "HEAD"])
        .await
        .unwrap()
        .trim()
        .into();
    let worktree = temp.path().join("feature");
    git(
        &repo,
        &[
            "worktree",
            "add",
            "-b",
            "feature",
            worktree.to_str().unwrap(),
            "HEAD",
        ],
    )
    .await
    .unwrap();
    run.repository = worktree.to_string_lossy().into_owned();
    run.work_branch = Some("feature".into());
    let mut session = Session::new(ProviderId::Codex, worktree.to_string_lossy());
    session.worktree_path = Some(worktree.to_string_lossy().into_owned());
    session.worktree_identity =
        Some(codetwo_core::worktree::DirectoryIdentity::capture(&worktree).unwrap());
    store.upsert_session(&session).unwrap();
    run.session_id = Some(session.id);
    run.initial_prompt_sent = true;
    run.stage = "developing".into();
    store.reserve_issue_delivery(&run, false).unwrap();
    (controller, app, context, temp, run)
}

#[tokio::test]
async fn validation_requires_clean_changed_commit_and_rechecks_new_revision() {
    let (controller, app, _context, _temp, mut run) = fixture().await;
    assert!(controller
        .verify_and_publish(&mut run)
        .await
        .unwrap_err()
        .to_string()
        .contains("No committed"));
    let repo = PathBuf::from(&run.repository);
    std::fs::write(repo.join("feature.txt"), "first").unwrap();
    assert!(controller
        .verify_and_publish(&mut run)
        .await
        .unwrap_err()
        .to_string()
        .contains("Commit"));
    git(&repo, &["add", "feature.txt"]).await.unwrap();
    git(&repo, &["commit", "-m", "feature"]).await.unwrap();
    controller.verify_and_publish(&mut run).await.unwrap();
    let first_head = run.verification.as_ref().unwrap().head.clone();
    assert_eq!(run.stage, "verified");
    assert!(run.verification.as_ref().unwrap().passed);
    assert!(
        run.pull_request.is_none(),
        "no push or PR without authorization"
    );
    std::fs::write(repo.join("feature.txt"), "second").unwrap();
    git(&repo, &["commit", "-am", "revision"]).await.unwrap();
    run.validation_commands = vec!["exit 9".into()];
    assert!(controller.verify_and_publish(&mut run).await.is_err());
    let current = run.verification.as_ref().unwrap();
    assert_ne!(current.head, first_head);
    assert!(!current.passed);
    assert_eq!(current.results[0].exit_code, Some(9));
    app.stop().await;
}

#[tokio::test]
async fn validation_that_changes_checkout_cannot_produce_passing_receipt() {
    let (controller, app, _context, _temp, mut run) = fixture().await;
    let repo = PathBuf::from(&run.repository);
    git(&repo, &["commit", "--allow-empty", "-m", "feature"])
        .await
        .unwrap();
    run.validation_commands = vec!["printf unexpected > generated.txt".into()];
    assert!(controller.verify_and_publish(&mut run).await.is_err());
    assert!(!run.verification.unwrap().passed);
    assert_eq!(run.stage, "blocked");
    app.stop().await;
}

#[tokio::test]
async fn terminal_attempt_and_pending_requirements_never_run_validation() {
    let (controller, app, _context, _temp, mut run) = fixture().await;
    run.validation_commands = vec!["touch should-not-run".into()];
    run.stage = "cancelled".into();
    assert!(controller.verify_and_publish(&mut run).await.is_err());
    run.stage = "developing".into();
    run.pending_issue = Some(run.issue.clone());
    assert!(controller.verify_and_publish(&mut run).await.is_err());
    assert!(!Path::new(&run.repository).join("should-not-run").exists());
    app.stop().await;
}

#[test]
fn requirements_notice_comments_and_attachments_but_ignore_delivery_milestones() {
    let old = delivery().issue;
    let mut next = old.clone();
    next.updated_at = "later".into();
    next.comments
        .push(json!({"id":"sync-1","body":"Started\n<!-- codetwo:delivery-1:started -->"}));
    assert!(!requirements_changed(&old, &next));
    next.comments
        .push(json!({"id":"user-1","body":"Also require keyboard support"}));
    assert!(requirements_changed(&old, &next));
    let mut attachment = old.clone();
    attachment
        .attachments
        .push(json!({"id":"design-1","url":"https://example.invalid/new-design"}));
    assert!(requirements_changed(&old, &attachment));
}

#[test]
fn pr_binding_rejects_other_repository_branch_base_or_replacement_pr() {
    let mut run = delivery();
    run.remote_url = Some("https://github.com/test/repo".into());
    run.work_branch = Some("feature".into());
    let pr = json!({"number":7,"url":"https://github.com/test/repo/pull/7","headRefName":"feature","baseRefName":"main","isCrossRepository":false,"state":"OPEN","headRefOid":"head-1"});
    assert!(validate_pr(&run, &pr).is_ok());
    let mut fork_pr = pr.clone();
    fork_pr["isCrossRepository"] = json!(true);
    assert!(validate_pr(&run, &fork_pr).is_err());
    for (field, value) in [
        ("url", "https://github.com/other/repo/pull/7"),
        ("url", "https://github.com/test/repository/pull/7"),
        ("headRefName", "another-feature"),
        ("baseRefName", "another-base"),
    ] {
        let mut changed = pr.clone();
        changed[field] = json!(value);
        assert!(validate_pr(&run, &changed).is_err());
    }
    run.pull_request = Some(pr.clone());
    let mut replacement = pr;
    replacement["number"] = json!(8);
    replacement["url"] = json!("https://github.com/test/repo/pull/8");
    assert!(validate_pr(&run, &replacement).is_err());
}

#[tokio::test]
async fn checkout_binding_rejects_discard_remote_branch_and_repository_changes() {
    let (controller, app, _context, _temp, mut run) = fixture().await;
    let mut session = controller
        .store
        .get_session(run.session_id.as_deref().unwrap())
        .unwrap()
        .unwrap();
    assert!(validate_checkout(&run, &session).await.is_ok());
    let original_directory = session.worktree_identity.clone();
    session.worktree_identity = Some(
        codetwo_core::worktree::DirectoryIdentity::capture(
            Path::new(&session.cwd).parent().unwrap(),
        )
        .unwrap(),
    );
    assert!(validate_checkout(&run, &session)
        .await
        .unwrap_err()
        .to_string()
        .contains("replaced"));
    session.worktree_identity = original_directory;
    session.worktree_discarded = true;
    assert!(validate_checkout(&run, &session).await.is_err());
    session.worktree_discarded = false;
    let original_identity = run.repository_identity.clone();
    run.repository_identity = "another-repository".into();
    assert!(validate_checkout(&run, &session).await.is_err());
    run.repository_identity = original_identity;
    run.work_branch = Some("other-feature".into());
    assert!(validate_checkout(&run, &session).await.is_err());
    run.work_branch = Some("feature".into());
    git(
        Path::new(&session.cwd),
        &[
            "remote",
            "add",
            "origin",
            "https://github.com/test/changed.git",
        ],
    )
    .await
    .unwrap();
    assert!(validate_checkout(&run, &session).await.is_err());
    app.stop().await;
}

fn install_test_connector(controller: &Controller) -> Connector {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../packs/linear");
    let bundle =
        codetwo_plugins::bundle::from_local(&source, "test fixture", "test-linear").unwrap();
    let plugin = codetwo_plugins::bundle::install(&controller.hub.dir, bundle).unwrap();
    codetwo_plugins::bundle::set_enabled(&controller.hub.dir, &plugin.id, true).unwrap();
    codetwo_plugins::bundle::set_trusted(&controller.hub.dir, &plugin.id, true).unwrap();
    Connector {
        plugin_id: plugin.id,
        connector_id: "issues".into(),
    }
}

#[tokio::test]
async fn connector_gate_precedes_credentials_and_replaces_caller_secret() {
    let (mut controller, app, context, _temp, _run) = fixture().await;
    let connector = install_test_connector(&controller);
    let credentials = Arc::new(MemoryCredentials(std::sync::Mutex::new(vec![])));
    controller.credentials = credentials.clone();
    context
        .ctx()
        .command("plugins.invoke_connector", |args| async move {
            assert_eq!(args["input"]["_credential"], "fixture-secret");
            assert_eq!(args["operation"], "issues.get");
            Ok(json!({"id":"issue-1"}))
        })
        .unwrap();
    codetwo_plugins::bundle::set_trusted(&controller.hub.dir, &connector.plugin_id, false).unwrap();
    assert!(controller
        .invoke(&connector, "issues.get", json!({}), None)
        .await
        .is_err());
    assert!(credentials.0.lock().unwrap().is_empty());
    codetwo_plugins::bundle::set_trusted(&controller.hub.dir, &connector.plugin_id, true).unwrap();
    codetwo_plugins::bundle::set_enabled(&controller.hub.dir, &connector.plugin_id, false).unwrap();
    assert!(controller
        .invoke(&connector, "issues.get", json!({}), None)
        .await
        .is_err());
    assert!(credentials.0.lock().unwrap().is_empty());
    codetwo_plugins::bundle::set_enabled(&controller.hub.dir, &connector.plugin_id, true).unwrap();
    let wrong = Connector {
        plugin_id: connector.plugin_id.clone(),
        connector_id: "not-owned".into(),
    };
    assert!(controller
        .invoke(&wrong, "issues.get", json!({}), None)
        .await
        .is_err());
    assert!(credentials.0.lock().unwrap().is_empty());
    let result = controller
        .invoke(
            &connector,
            "issues.get",
            json!({"id":"issue-1","_credential":"caller-supplied-secret"}),
            None,
        )
        .await
        .unwrap();
    assert_eq!(result["id"], "issue-1");
    assert_eq!(credentials.0.lock().unwrap().len(), 1);
    app.stop().await;
}

#[tokio::test]
async fn tracker_writeback_requires_permission_and_retries_stable_milestone() {
    let (mut controller, app, context, _temp, mut run) = fixture().await;
    let connector = install_test_connector(&controller);
    controller.credentials = Arc::new(MemoryCredentials(std::sync::Mutex::new(vec![])));
    run.plugin_id = connector.plugin_id;
    run.stage = "merged".into();
    run.done_state_id = Some("done-1".into());
    run.pull_request =
        Some(json!({"url":"https://github.com/test/repo/pull/7","headRefOid":"head-1"}));
    let calls = Arc::new(std::sync::Mutex::new(Vec::<Value>::new()));
    let observed = calls.clone();
    context
        .ctx()
        .command("plugins.invoke_connector", move |args| {
            let observed = observed.clone();
            async move {
                let mut calls = observed.lock().unwrap();
                calls.push(args.clone());
                if calls.len() == 1 {
                    Err(error("fixture-secret: remote error must be sanitized"))
                } else {
                    Ok(json!({"comment_url":"https://linear.app/comment/1"}))
                }
            }
        })
        .unwrap();
    controller.sync(&mut run).await.unwrap();
    assert!(calls.lock().unwrap().is_empty());
    run.permissions.writeback = true;
    controller.sync(&mut run).await.unwrap();
    assert!(run.sync_pending);
    assert!(!run.sync_error.as_ref().unwrap().contains("fixture-secret"));
    assert!(run.synced_milestones.is_empty());
    controller.sync(&mut run).await.unwrap();
    assert!(!run.sync_pending);
    assert_eq!(run.synced_milestones, vec!["merged"]);
    controller.sync(&mut run).await.unwrap();
    let calls = calls.lock().unwrap();
    assert_eq!(calls.len(), 2);
    assert_eq!(
        calls[0], calls[1],
        "ambiguous retry must preserve stable key and body"
    );
    assert_eq!(calls[0]["input"]["workspace_id"], run.issue.workspace_id);
    assert_eq!(calls[0]["input"]["state_id"], "done-1");
    assert!(serde_json::to_string(&run)
        .unwrap()
        .find("fixture-secret")
        .is_none());
    drop(calls);
    app.stop().await;
}

#[tokio::test]
async fn cancelled_and_closed_attempts_never_request_done_state() {
    let (mut controller, app, context, _temp, mut run) = fixture().await;
    let connector = install_test_connector(&controller);
    run.plugin_id = connector.plugin_id;
    controller.credentials = Arc::new(MemoryCredentials(std::sync::Mutex::new(vec![])));
    run.permissions.writeback = true;
    run.done_state_id = Some("done-1".into());
    run.session_id = None;
    let calls = Arc::new(std::sync::Mutex::new(Vec::<Value>::new()));
    let observed = calls.clone();
    context
        .ctx()
        .command("plugins.invoke_connector", move |args| {
            let observed = observed.clone();
            async move {
                observed.lock().unwrap().push(args);
                Ok(json!({}))
            }
        })
        .unwrap();
    for stage in ["cancelled", "closed"] {
        run.stage = stage.into();
        controller.reconcile_inner(&mut run, false).await.unwrap();
        assert_eq!(run.stage, stage);
    }
    let calls = calls.lock().unwrap();
    assert_eq!(calls.len(), 2);
    assert!(calls.iter().all(|call| call["input"]["state_id"].is_null()));
    drop(calls);
    app.stop().await;
}

#[tokio::test]
async fn feedback_is_marked_seen_only_after_durable_prompt_acceptance() {
    let (controller, app, _context, _temp, mut run) = fixture().await;
    run.pending_feedback = Some(PendingFeedback {
        ids: vec!["review-1".into()],
        body: "Fix feedback".into(),
        request_id: "feedback-request".into(),
    });
    controller.save(&mut run).unwrap();
    controller.reconcile_inner(&mut run, false).await.unwrap();
    assert!(run.seen_review_ids.is_empty());
    assert_eq!(
        run.pending_feedback.as_ref().unwrap().request_id,
        "feedback-request"
    );
    for _ in 0..100 {
        if controller
            .store
            .command_receipt("t3-prompt", "feedback-request")
            .unwrap()
            .is_some()
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(controller
        .store
        .command_receipt("t3-prompt", "feedback-request")
        .unwrap()
        .is_some());
    let _ = controller.reconcile_inner(&mut run, false).await;
    assert_eq!(run.seen_review_ids, vec!["review-1"]);
    assert!(run.pending_feedback.is_none());
    let _ = controller.reconcile_inner(&mut run, false).await;
    assert_eq!(
        run.seen_review_ids,
        vec!["review-1"],
        "accepted feedback must not be queued twice"
    );
    app.stop().await;
}

#[tokio::test]
async fn delivery_locks_are_per_task_and_cancellation_interrupts_validation() {
    let (controller, app, _context, _temp, mut run) = fixture().await;
    let gate = controller.run_gate(&run.id);
    let lock = gate.lock().await;
    assert!(controller.run_gate(&run.id).try_lock().is_err());
    assert!(controller
        .run_gate("independent-delivery")
        .try_lock()
        .is_ok());
    drop(lock);
    git(
        Path::new(&run.repository),
        &["commit", "--allow-empty", "-m", "feature"],
    )
    .await
    .unwrap();
    run.validation_commands = vec!["touch validation-started; sleep 10".into()];
    let run_id = run.id.clone();
    let repo = run.repository.clone();
    tokio::join!(controller.reconcile(&mut run, false), async {
        for _ in 0..100 {
            if Path::new(&repo).join("validation-started").exists() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        controller.cancellations.lock().unwrap().insert(run_id);
    });
    assert_eq!(run.stage, "cancelled");
    assert!(run.verification.is_none());
    app.stop().await;
}

async fn register_test_commands(controller: &Controller, context: &App, temp: &tempfile::TempDir) {
    let ctx = context.ctx();
    ctx.provide(Arc::new(Paths::new(temp.path()))).unwrap();
    ctx.provide(Arc::new(StoreService(controller.store.clone())))
        .unwrap();
    ctx.provide(Arc::new(EngineService(controller.engine.clone())))
        .unwrap();
    ctx.provide(controller.hub.clone()).unwrap();
    // These command tests only exercise local cancellation/recovery branches with writeback=false;
    // no connector is installed and no credential method is reachable.
    IssueDeliveryPlugin.apply(ctx, Value::Null).await.unwrap();
}

#[tokio::test]
async fn cancel_command_is_idempotent_and_cannot_replace_merged_or_closed_outcomes() {
    let (controller, app, context, temp, mut run) = fixture().await;
    run.stage = "merged".into();
    controller.save(&mut run).unwrap();
    register_test_commands(&controller, &context, &temp).await;
    for stage in ["merged", "closed"] {
        run.stage = stage.into();
        controller.save(&mut run).unwrap();
        assert!(context
            .ctx()
            .call("issue_delivery.cancel", json!({"id":run.id}))
            .await
            .is_err());
        assert_eq!(
            controller
                .store
                .issue_delivery(&run.id)
                .unwrap()
                .unwrap()
                .stage,
            stage
        );
    }
    run.stage = "cancelled".into();
    controller.save(&mut run).unwrap();
    for _ in 0..2 {
        let cancelled = context
            .ctx()
            .call("issue_delivery.cancel", json!({"id":run.id}))
            .await
            .unwrap();
        assert_eq!(cancelled["stage"], "cancelled");
    }
    app.stop().await;
}

#[tokio::test]
async fn creation_retry_refuses_changed_base_and_recovers_existing_task_session() {
    let (controller, app, context, temp, mut run) = fixture().await;
    let existing_session = run.session_id.take().unwrap();
    run.stage = "blocked".into();
    controller.save(&mut run).unwrap();
    register_test_commands(&controller, &context, &temp).await;
    git(
        Path::new(&run.repository),
        &["commit", "--allow-empty", "-m", "changed-base"],
    )
    .await
    .unwrap();
    let rejected = context
        .ctx()
        .call("issue_delivery.retry_creation", json!({"id":run.id}))
        .await
        .unwrap_err();
    assert!(rejected.to_string().contains("base changed"));
    assert!(controller
        .store
        .get_task(&TaskId::new(run.task_id.clone()))
        .unwrap()
        .is_none());
    let task = codetwo_core::Task {
        id: TaskId::new(run.task_id.clone()),
        status: codetwo_core::TaskStatus::Active,
        result_contract: codetwo_core::ResultContract {
            goal: "Feature".into(),
            required_deliverables: vec![],
            completion_conditions: vec![],
            boundaries: vec![],
            known_risks: vec![],
            unresolved_facts: vec![],
        },
        provider_configuration: codetwo_core::ProviderConfiguration {
            provider: ProviderId::Codex,
            model: None,
            reasoning_effort: None,
        },
        budget: codetwo_core::TaskBudget {
            max_cost_microusd: None,
            max_tokens: None,
            max_duration_seconds: None,
        },
    };
    controller.store.create_task(&task, now()).unwrap();
    let existing = context
        .ctx()
        .call("issue_delivery.retry_creation", json!({"id":run.id}))
        .await
        .unwrap_err();
    assert!(existing.to_string().contains("task exists"));
    controller
        .store
        .lease_task_session(
            &task.id,
            &existing_session,
            &codetwo_core::AgentId::new("agent-1"),
            codetwo_core::AgentRole::Executor,
            "fixture",
            now(),
        )
        .unwrap();
    let recovered = context
        .ctx()
        .call("issue_delivery.retry_creation", json!({"id":run.id}))
        .await
        .unwrap();
    assert_eq!(recovered["session_id"], existing_session);
    assert_eq!(
        controller
            .store
            .list_task_session_leases(&task.id)
            .unwrap()
            .len(),
        1
    );
    app.stop().await;
}

#[tokio::test]
async fn cancellation_signal_cannot_overwrite_merged_while_writeback_is_pending() {
    let (mut controller, app, context, _temp, mut run) = fixture().await;
    let connector = install_test_connector(&controller);
    run.plugin_id = connector.plugin_id;
    controller.credentials = Arc::new(MemoryCredentials(std::sync::Mutex::new(vec![])));
    run.stage = "merged".into();
    run.permissions.writeback = true;
    run.sync_pending = true;
    context
        .ctx()
        .command("plugins.invoke_connector", |_| async {
            tokio::time::sleep(Duration::from_millis(100)).await;
            Ok(json!({}))
        })
        .unwrap();
    controller
        .cancellations
        .lock()
        .unwrap()
        .insert(run.id.clone());
    controller.reconcile(&mut run, false).await;
    assert_eq!(
        run.stage, "merged",
        "cancel must preserve an observed merge even during network synchronization"
    );
    app.stop().await;
}

#[tokio::test]
async fn background_refresh_retries_after_sync_error_and_clears_it_on_recovery() {
    let (mut controller, app, context, _temp, mut run) = fixture().await;
    let connector = install_test_connector(&controller);
    run.plugin_id = connector.plugin_id;
    run.stage = "blocked".into();
    run.sync_error = Some("Previous connection or credential failure".into());
    controller.credentials = Arc::new(MemoryCredentials(std::sync::Mutex::new(vec![])));
    let issue = serde_json::to_value(&run.issue).unwrap();
    let calls = Arc::new(std::sync::Mutex::new(0));
    let observed = calls.clone();
    context
        .ctx()
        .command("plugins.invoke_connector", move |args| {
            let observed = observed.clone();
            let issue = issue.clone();
            async move {
                assert_eq!(args["operation"], "issues.get");
                let mut calls = observed.lock().unwrap();
                *calls += 1;
                if *calls == 1 {
                    Err(error("Fixture network is still unavailable"))
                } else {
                    Ok(issue)
                }
            }
        })
        .unwrap();

    controller.reconcile_inner(&mut run, false).await.unwrap();
    assert_eq!(
        *calls.lock().unwrap(),
        1,
        "background refresh must retry despite an existing sync error"
    );
    assert!(
        run.sync_error.is_some(),
        "an unsuccessful retry must retain the error"
    );
    controller.reconcile_inner(&mut run, false).await.unwrap();
    assert_eq!(*calls.lock().unwrap(), 2);
    assert!(
        run.sync_error.is_none(),
        "successful background read must clear the stale error"
    );
    assert!(run.pending_issue.is_none());
    assert_eq!(
        run.stage, "blocked",
        "connection recovery must not implicitly resume a blocked development task"
    );
    app.stop().await;
}

#[cfg(unix)]
#[tokio::test]
async fn local_delivery_without_pr_permission_does_not_invoke_github_cli() {
    use std::os::unix::fs::PermissionsExt;
    const CHILD: &str = "C2_TEST_LINEAR_GITLAB_CHILD";
    if std::env::var_os(CHILD).is_some() {
        let mut failures = Vec::new();
        for remote in [
            "https://gitlab.com/test/repo",
            "https://github.com/test/repo",
        ] {
            let (controller, app, _context, _temp, mut run) = fixture().await;
            git(
                Path::new(&run.repository),
                &["remote", "add", "origin", &format!("{remote}.git")],
            )
            .await
            .unwrap();
            run.remote_url = Some(remote.into());
            git(
                Path::new(&run.repository),
                &["commit", "--allow-empty", "-m", "feature"],
            )
            .await
            .unwrap();
            match controller.reconcile_inner(&mut run, false).await {
                Ok(()) => assert_eq!(run.stage, "verified"),
                Err(error) => failures.push(format!("{remote}: {error}")),
            }
            app.stop().await;
        }
        assert!(
            failures.is_empty(),
            "local delivery was blocked: {failures:?}"
        );
        assert!(
            !Path::new(&std::env::var("C2_TEST_GH_MARKER").unwrap()).exists(),
            "local delivery must not call gh"
        );
        let (controller, app, _context, _temp, mut run) = fixture().await;
        git(
            Path::new(&run.repository),
            &[
                "remote",
                "add",
                "origin",
                "https://github.com/test/repo.git",
            ],
        )
        .await
        .unwrap();
        run.remote_url = Some("https://github.com/test/repo".into());
        let bound = json!({"number":7,"url":"https://github.com/test/repo/pull/7","headRefName":"feature","baseRefName":"main","isCrossRepository":false,"state":"MERGED","headRefOid":run.base_sha});
        run.pull_request = Some(bound.clone());
        let response_file = format!("{}.json", std::env::var("C2_TEST_GH_MARKER").unwrap());
        std::fs::write(response_file, serde_json::to_vec(&bound).unwrap()).unwrap();
        controller.reconcile_inner(&mut run, false).await.unwrap();
        assert_eq!(
            run.stage, "merged",
            "previously bound PR must still be tracked when creation permission is off"
        );
        app.stop().await;
        return;
    }
    let temp = tempfile::tempdir().unwrap();
    let executable = temp.path().join("gh");
    std::fs::write(&executable, "#!/bin/sh\ntouch \"$C2_TEST_GH_MARKER\"\nif [ -f \"$C2_TEST_GH_MARKER.json\" ]; then cat \"$C2_TEST_GH_MARKER.json\"; exit 0; fi\nexit 71\n").unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o755)).unwrap();
    let original_path = std::env::var_os("PATH").unwrap();
    let paths =
        std::iter::once(temp.path().to_path_buf()).chain(std::env::split_paths(&original_path));
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "issue_delivery::tests::local_delivery_without_pr_permission_does_not_invoke_github_cli", "--nocapture"])
        .env(CHILD, "1").env("PATH", std::env::join_paths(paths).unwrap())
        .env("C2_TEST_GH_MARKER", temp.path().join("gh-invoked")).env("GH_CONFIG_DIR", temp.path()).output().unwrap();
    assert!(
        output.status.success(),
        "isolated child failed:\n{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[tokio::test]
async fn installed_linear_bundle_runs_through_real_connector_and_stdio_protocol_offline() {
    let temp = tempfile::tempdir().unwrap();
    let source = temp.path().join("source");
    std::fs::create_dir(&source).unwrap();
    let pack = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../packs/linear");
    std::fs::copy(pack.join("plugin.js"), source.join("plugin.js")).unwrap();
    let mut manifest: Value =
        serde_json::from_slice(&std::fs::read(pack.join("plugin.json")).unwrap()).unwrap();
    manifest["extensions"]["dev.codetwo"]["runtime"]["args"] =
        json!(["--require", "./fake-fetch.cjs", "plugin.js"]);
    std::fs::write(
        source.join("plugin.json"),
        serde_json::to_vec(&manifest).unwrap(),
    )
    .unwrap();
    std::fs::write(source.join("fake-fetch.cjs"), r#"
global.fetch = async (url, options) => {
  if (url !== 'https://api.linear.app/graphql' || options.headers.Authorization !== 'fixture-secret') throw new Error('unexpected request');
  const {query, variables} = JSON.parse(options.body);
  if (!query.includes('query Issue(') || variables.id !== 'APP-7') throw new Error('unexpected GraphQL operation');
  return new Response(JSON.stringify({data:{organization:{id:'workspace-1'},issue:{id:'issue-1',identifier:'APP-7',title:'Offline feature',url:'https://linear.app/test/issue/APP-7',description:'Acceptance',updatedAt:'2026-09-08',team:{id:'team-1',name:'Test'},state:{id:'state-1',name:'Todo',type:'unstarted'},comments:{nodes:[],pageInfo:{hasNextPage:false}},attachments:{nodes:[],pageInfo:{hasNextPage:false}},children:{nodes:[]}}}}));
};
"#).unwrap();
    let data = temp.path().join("data");
    let plugins = Paths::new(&data).plugins();
    let bundle =
        codetwo_plugins::bundle::from_local(&source, "offline contract fixture", "linear-offline")
            .unwrap();
    let installed = codetwo_plugins::bundle::install(&plugins, bundle).unwrap();
    codetwo_plugins::bundle::set_enabled(&plugins, &installed.id, true).unwrap();
    codetwo_plugins::bundle::set_trusted(&plugins, &installed.id, true).unwrap();
    let app = CoreApp::boot(
        AppConfig::bare_in(&data)
            .with("paths", PluginEntry::with_config(json!({"data_dir":data})))
            .with("plugin-hub", PluginEntry::default())
            .with("extensions", PluginEntry::default()),
    )
    .await
    .unwrap();
    let request = json!({"plugin_id":installed.id,"contribution_id":"issues","operation":"issues.get","input":{"id":"APP-7","_credential":"fixture-secret"}});
    let detail = app.call("plugins.invoke_connector", request).await.unwrap();
    assert_eq!(detail["workspace_id"], "workspace-1");
    assert_eq!(detail["identifier"], "APP-7");
    assert_eq!(detail["title"], "Offline feature");
    assert!(!serde_json::to_string(&detail)
        .unwrap()
        .contains("fixture-secret"));
    assert!(app.call("plugins.invoke_connector", json!({"plugin_id":installed.id,"contribution_id":"issues","operation":"message.send","input":{}})).await.is_err());
    app.stop().await;
}
