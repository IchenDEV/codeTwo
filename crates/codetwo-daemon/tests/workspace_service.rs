#![cfg(unix)]

use std::sync::Arc;
use std::time::Duration;

use codetwo_client::{Client, SubscriptionMessage};
use codetwo_core::{
    BriefRevision, DocBlock, Event, LaunchSpec, Op, PermissionMode, Provider, ProviderId, Session,
    SkillLibrary, Store, Task, TaskExperience, WorkMutationGuard, Workspace, WorkspaceKind,
    WorkspaceSnapshot,
};
use codetwo_daemon::Daemon;
use codetwo_protocol::{TransportEvent, WorkPage};
use tempfile::TempDir;
use tokio::time::timeout;

#[tokio::test]
async fn workspace_writes_are_daemon_owned_revisioned_and_durable() {
    let root = TempDir::new().unwrap();
    let runtime = root.path().join("runtime");
    let database = root.path().join("data").join("codetwo.db");
    std::fs::create_dir_all(database.parent().unwrap()).unwrap();
    let store = Arc::new(Store::open(database.to_str().unwrap()).unwrap());
    let daemon = Daemon::bind_with_store(&runtime, store).unwrap();
    let socket = daemon.socket_path().to_owned();
    let server = tokio::spawn(daemon.run());

    let writer = timeout(Duration::from_secs(2), Client::connect(&socket))
        .await
        .unwrap()
        .unwrap();
    let observer = timeout(Duration::from_secs(2), Client::connect(&socket))
        .await
        .unwrap()
        .unwrap();
    let mut events = observer
        .subscribe(Some(observer.hello().cursor.clone()))
        .await
        .unwrap();

    let workspace = Workspace::new(
        "External research",
        Some(root.path().join("research").to_string_lossy().into_owned()),
        WorkspaceKind::External,
    );
    let saved = writer
        .save_workspace(workspace.clone(), None)
        .await
        .unwrap();
    assert_eq!(saved.entity, workspace);
    assert_eq!(saved.revision, 1);

    let event = timeout(Duration::from_secs(2), events.recv())
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        event,
        SubscriptionMessage::Event(envelope)
            if matches!(
                envelope.event,
                TransportEvent::WorkspaceChanged { ref workspace, revision: 1 }
                    if workspace.id == saved.entity.id
            )
    ));

    let WorkPage {
        items,
        next_cursor,
        high_water,
    } = observer.list_workspaces(None, 50).await.unwrap();
    assert_eq!(items, vec![saved.clone()]);
    assert_eq!(next_cursor, None);
    assert!(high_water >= 1);

    let stale = writer
        .save_workspace(workspace.clone(), None)
        .await
        .unwrap_err();
    assert!(stale.to_string().contains("revision conflict"));

    writer.shutdown().await.unwrap();
    timeout(Duration::from_secs(2), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();

    let reopened = Store::open(database.to_str().unwrap()).unwrap();
    let page = reopened.work_list_workspaces(None, 50).unwrap();
    assert_eq!(page.items, vec![saved]);
}

#[tokio::test]
async fn task_and_brief_share_guarded_daemon_state_and_ordered_events() {
    let root = TempDir::new().unwrap();
    let runtime = root.path().join("runtime");
    let database = root.path().join("codetwo.db");
    let store = Arc::new(Store::open(database.to_str().unwrap()).unwrap());
    let daemon = Daemon::bind_with_store(&runtime, store).unwrap();
    let socket = daemon.socket_path().to_owned();
    let server = tokio::spawn(daemon.run());
    let client = Client::connect(&socket).await.unwrap();
    let observer = Client::connect(&socket).await.unwrap();
    let mut events = observer
        .subscribe(Some(observer.hello().cursor.clone()))
        .await
        .unwrap();

    let workspace = client
        .save_workspace(Workspace::new("Work", None, WorkspaceKind::Managed), None)
        .await
        .unwrap();
    let _workspace_event = events.recv().await.unwrap();

    let task = Task::named(
        &workspace.entity.id,
        "Prepare launch brief",
        TaskExperience::Work,
    );
    let saved_task = client.save_task(task, None).await.unwrap();
    assert_eq!(saved_task.revision, 1);
    assert!(matches!(
        events.recv().await.unwrap(),
        SubscriptionMessage::Event(envelope)
            if matches!(
                envelope.event,
                TransportEvent::TaskChanged { ref task, revision: 1 }
                    if task.id == saved_task.entity.id
            )
    ));

    let draft = BriefRevision::new(
        &saved_task.entity.id,
        999,
        vec![DocBlock::Text {
            text: "Goal: produce a reviewed launch memo. Acceptance: PDF exists.".to_owned(),
        }],
        "desktop",
    );
    let saved_brief = client.save_brief(draft, None).await.unwrap();
    assert_eq!(saved_brief.brief.entity.revision, 1);
    assert_eq!(saved_brief.brief.revision, 1);
    assert_eq!(saved_brief.task.entity.current_brief_revision, Some(1));
    assert_eq!(saved_brief.task.revision, 2);

    let brief_event = events.recv().await.unwrap();
    assert!(matches!(
        brief_event,
        SubscriptionMessage::Event(envelope)
            if matches!(envelope.event, TransportEvent::BriefChanged { revision: 1, .. })
    ));
    let task_event = events.recv().await.unwrap();
    assert!(matches!(
        task_event,
        SubscriptionMessage::Event(envelope)
            if matches!(envelope.event, TransportEvent::TaskChanged { revision: 2, .. })
    ));

    let page = observer
        .list_tasks(Some(workspace.entity.id.clone()), false, None, 50)
        .await
        .unwrap();
    assert_eq!(page.items, vec![saved_brief.task.clone()]);
    let current = observer
        .get_brief(saved_task.entity.id.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(current, saved_brief.brief);

    let stale = client
        .save_brief(
            BriefRevision::new(
                &saved_task.entity.id,
                1,
                vec![DocBlock::Text {
                    text: "Replacement".to_owned(),
                }],
                "desktop",
            ),
            None,
        )
        .await
        .unwrap_err();
    assert!(stale.to_string().contains("revision conflict"));

    client.shutdown().await.unwrap();
    timeout(Duration::from_secs(2), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn core_ops_execute_once_inside_daemon_and_share_the_ordered_stream() {
    let root = TempDir::new().unwrap();
    let runtime = root.path().join("runtime");
    let database = root.path().join("codetwo.db");
    let store = Arc::new(Store::open(database.to_str().unwrap()).unwrap());
    let session = Session::new(ProviderId::Grok, root.path().to_string_lossy().into_owned());
    store.upsert_session(&session).unwrap();
    let daemon = Daemon::bind_with_store(&runtime, store).unwrap();
    let socket = daemon.socket_path().to_owned();
    let server = tokio::spawn(daemon.run());

    let writer = Client::connect(&socket).await.unwrap();
    let observer = Client::connect(&socket).await.unwrap();
    let mut events = observer
        .subscribe(Some(observer.hello().cursor.clone()))
        .await
        .unwrap();
    writer
        .submit(Op::SetPermissionMode {
            session: session.id.clone(),
            mode: PermissionMode::Yolo,
        })
        .await
        .unwrap();

    let event = timeout(Duration::from_secs(2), events.recv())
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(
        event,
        SubscriptionMessage::Event(envelope)
            if matches!(
                envelope.event,
                TransportEvent::Core { event: Event::ExecutionPolicyChanged { session: ref event_session, policy, .. } }
                    if event_session == &session.id && policy.mode == PermissionMode::Yolo
            )
    ));

    writer.shutdown().await.unwrap();
    timeout(Duration::from_secs(2), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let reopened = Store::open(database.to_str().unwrap()).unwrap();
    assert_eq!(
        reopened
            .get_session(&session.id)
            .unwrap()
            .unwrap()
            .permission_mode,
        PermissionMode::Yolo
    );
}

#[tokio::test]
async fn daemon_registers_versioned_deliverables_from_safe_workspace_paths() {
    let root = TempDir::new().unwrap();
    let workspace_root = root.path().join("workspace");
    let deliverables_root = workspace_root.join("Deliverables");
    std::fs::create_dir_all(&deliverables_root).unwrap();
    let artifact = deliverables_root.join("report.md");
    std::fs::write(&artifact, b"version one\n").unwrap();

    let store = Arc::new(Store::open(root.path().join("codetwo.db").to_str().unwrap()).unwrap());
    let workspace = Workspace::new(
        "Artifacts",
        Some(workspace_root.to_string_lossy().into_owned()),
        WorkspaceKind::External,
    );
    store
        .work_save_workspace(
            &workspace,
            &WorkMutationGuard::new(None, "test", "test", "workspace"),
        )
        .unwrap();
    let task = Task::named(&workspace.id, "Artifact task", TaskExperience::Work);
    store
        .work_save_task(&task, &WorkMutationGuard::new(None, "test", "test", "task"))
        .unwrap();
    let run = Session::new(
        ProviderId::Custom("artifact-provider".to_owned()),
        workspace_root.to_string_lossy().into_owned(),
    );
    store.upsert_session_for_task(&run, Some(&task.id)).unwrap();

    let runtime = root.path().join("runtime");
    let daemon = Daemon::bind_with_store(&runtime, store).unwrap();
    let socket = daemon.socket_path().to_owned();
    let server = tokio::spawn(daemon.run());
    let client = Client::connect(&socket).await.unwrap();
    let observer = Client::connect(&socket).await.unwrap();
    let mut events = observer
        .subscribe(Some(observer.hello().cursor.clone()))
        .await
        .unwrap();

    let first = client
        .register_deliverable(
            task.id.clone(),
            run.id.clone(),
            "Deliverables/report.md".to_owned(),
        )
        .await
        .unwrap();
    assert_eq!(first.entity.version, 1);
    assert!(first.entity.current);
    assert_eq!(first.entity.hash.len(), 64);
    assert!(matches!(
        events.recv().await.unwrap(),
        SubscriptionMessage::Event(envelope)
            if matches!(envelope.event, TransportEvent::DeliverableChanged { revision: 1, .. })
    ));

    let repeated = client
        .register_deliverable(
            task.id.clone(),
            run.id.clone(),
            "Deliverables/report.md".to_owned(),
        )
        .await
        .unwrap();
    assert_eq!(repeated, first);
    assert!(timeout(Duration::from_millis(25), events.recv())
        .await
        .is_err());

    std::fs::write(&artifact, b"version two\n").unwrap();
    let second = client
        .register_deliverable(
            task.id.clone(),
            run.id.clone(),
            "Deliverables/report.md".to_owned(),
        )
        .await
        .unwrap();
    assert_eq!(second.entity.version, 2);
    assert!(second.entity.current);
    assert_ne!(second.entity.id, first.entity.id);
    assert!(matches!(
        events.recv().await.unwrap(),
        SubscriptionMessage::Event(envelope)
            if matches!(&envelope.event, TransportEvent::DeliverableChanged { deliverable, revision: 2 } if !deliverable.current && deliverable.id == first.entity.id)
    ));
    assert!(matches!(
        events.recv().await.unwrap(),
        SubscriptionMessage::Event(envelope)
            if matches!(&envelope.event, TransportEvent::DeliverableChanged { deliverable, revision: 1 } if deliverable.current && deliverable.id == second.entity.id)
    ));

    let page = observer
        .list_deliverables(task.id.clone(), None, 50)
        .await
        .unwrap();
    assert_eq!(page.items.len(), 2);
    assert!(!page.items[0].entity.current);
    assert_eq!(page.items[0].entity.version, 1);
    assert_eq!(page.items[1], second);

    let unsafe_path = client
        .register_deliverable(task.id.clone(), run.id.clone(), "../outside.md".to_owned())
        .await
        .unwrap_err();
    assert!(unsafe_path.to_string().contains("invalid Work request"));

    let outside = root.path().join("outside.md");
    std::fs::write(&outside, b"outside\n").unwrap();
    std::os::unix::fs::symlink(&outside, deliverables_root.join("link.md")).unwrap();
    let symlink = client
        .register_deliverable(task.id, run.id, "Deliverables/link.md".to_owned())
        .await
        .unwrap_err();
    assert!(symlink.to_string().contains("invalid Work request"));

    client.shutdown().await.unwrap();
    timeout(Duration::from_secs(2), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}

const MOCK_AGENT: &str = r#"
import json, os, sys
for line in sys.stdin:
    message = json.loads(line)
    if message.get("method") == "initialize":
        with open(os.environ["CODETWO_TEST_PROVIDER_MARKER"], "w") as marker:
            marker.write("provider started\n")
        print(json.dumps({"jsonrpc":"2.0","id":message["id"],"result":{"protocolVersion":1}}), flush=True)
"#;

fn mock_provider(id: &str, marker: &std::path::Path) -> Provider {
    let mut launch = LaunchSpec::new("python3", ["-u", "-c", MOCK_AGENT]);
    launch.env.push((
        "CODETWO_TEST_PROVIDER_MARKER".to_owned(),
        marker.to_string_lossy().into_owned(),
    ));
    Provider {
        id: ProviderId::Custom(id.to_owned()),
        display_name: id.to_owned(),
        launch,
        needs_node: false,
    }
}

#[tokio::test]
async fn provider_switch_creates_a_new_run_without_rewriting_the_old_run() {
    let root = TempDir::new().unwrap();
    let runtime = root.path().join("runtime");
    let database = root.path().join("codetwo.db");
    let workspace_root = root.path().join("workspace");
    std::fs::create_dir_all(&workspace_root).unwrap();
    let provider_marker = workspace_root.join("provider-started.txt");
    let store = Arc::new(Store::open(database.to_str().unwrap()).unwrap());
    let daemon = Daemon::bind_with_components(
        &runtime,
        store.clone(),
        vec![
            mock_provider("alpha", &provider_marker),
            mock_provider("beta", &provider_marker),
        ],
        SkillLibrary::default(),
    )
    .unwrap();
    let socket = daemon.socket_path().to_owned();
    let server = tokio::spawn(daemon.run());
    let client = Client::connect(&socket).await.unwrap();
    let workspace = client
        .save_workspace(
            Workspace::new(
                "Runs",
                Some(workspace_root.to_string_lossy().into_owned()),
                WorkspaceKind::External,
            ),
            None,
        )
        .await
        .unwrap();
    let task = client
        .save_task(
            Task::named(
                &workspace.entity.id,
                "Cross-provider task",
                TaskExperience::Work,
            ),
            None,
        )
        .await
        .unwrap();
    let observer = Client::connect(&socket).await.unwrap();
    let mut events = observer
        .subscribe(Some(observer.hello().cursor.clone()))
        .await
        .unwrap();

    let bypass_client = Client::connect(&socket).await.unwrap();
    let bypass = bypass_client
        .submit(Op::NewSession {
            provider: ProviderId::Custom("alpha".to_owned()),
            cwd: workspace_root.to_string_lossy().into_owned(),
            use_worktree: false,
            worktree_base: None,
            worktree_base_sha: None,
            request_id: Some("unsafe-work-bypass".to_owned()),
            initial_policy: None,
            task_id: Some(task.entity.id.clone()),
        })
        .await
        .unwrap_err();
    assert!(
        bypass.to_string().contains("got error"),
        "unexpected bypass error: {bypass}"
    );
    drop(bypass_client);

    for (expected_count, provider) in ["alpha", "beta"].into_iter().enumerate() {
        let receipt = client
            .start_run(
                task.entity.id.clone(),
                ProviderId::Custom(provider.to_owned()),
                false,
            )
            .await
            .unwrap();
        let request_id = receipt.request_id;
        assert!(receipt.rollback_available);
        let snapshot_id = receipt.snapshot_id.as_ref().unwrap();
        let snapshot =
            WorkspaceSnapshot::load(runtime.join("snapshots").join(snapshot_id), &workspace_root)
                .unwrap();
        if expected_count == 0 {
            assert!(snapshot
                .manifest
                .files
                .iter()
                .all(|file| file.path != "provider-started.txt"));
        }
        loop {
            match timeout(Duration::from_secs(2), events.recv())
                .await
                .unwrap()
                .unwrap()
            {
                SubscriptionMessage::Event(envelope) => match envelope.event {
                    TransportEvent::Core {
                        event:
                            Event::SessionCreated {
                                request_id: seen, ..
                            },
                    } if seen.as_deref() == Some(request_id.as_str()) => break,
                    TransportEvent::Core {
                        event:
                            Event::Error {
                                request_id: seen,
                                message,
                                ..
                            },
                    } if seen.as_deref() == Some(request_id.as_str()) => {
                        panic!("run creation failed: {message}")
                    }
                    _ => {}
                },
                SubscriptionMessage::Reset { reason, .. } => {
                    panic!("unexpected stream reset: {reason:?}")
                }
            }
        }
        let page = client
            .list_runs(task.entity.id.clone(), None, 50)
            .await
            .unwrap();
        assert_eq!(page.items.len(), expected_count + 1, "after {provider}");
        let saved_snapshot = store
            .work_snapshot_for_run(&page.items.last().unwrap().entity.id)
            .unwrap()
            .unwrap();
        assert_eq!(saved_snapshot.id, *snapshot_id);
        assert_eq!(saved_snapshot.run_id, page.items.last().unwrap().entity.id);
        loop {
            match timeout(Duration::from_secs(2), events.recv())
                .await
                .unwrap()
                .unwrap()
            {
                SubscriptionMessage::Event(envelope)
                    if matches!(
                        envelope.event,
                        TransportEvent::SnapshotPrepared {
                            ref snapshot_id,
                            ref run_id,
                            revision: 1,
                            ..
                        } if snapshot_id == &saved_snapshot.id && run_id == &saved_snapshot.run_id
                    ) =>
                {
                    break
                }
                SubscriptionMessage::Event(_) => {}
                SubscriptionMessage::Reset { reason, .. } => {
                    panic!("unexpected stream reset: {reason:?}")
                }
            }
        }
        assert!(workspace_root.join("provider-started.txt").is_file());
        if expected_count == 0 {
            let summary = client
                .inspect_run_changes(saved_snapshot.run_id.clone())
                .await
                .unwrap();
            assert_eq!(summary.snapshot_id, saved_snapshot.id);
            assert_eq!(
                (summary.added, summary.modified, summary.deleted),
                (1, 0, 0)
            );
            let changes = client
                .list_changes(summary.snapshot_id.clone(), None, 50)
                .await
                .unwrap();
            assert_eq!(changes.items.len(), 1);
            assert_eq!(changes.items[0].entity.change.path, "provider-started.txt");
            std::fs::write(&provider_marker, b"later user edit\n").unwrap();
            let stale = client
                .rollback_run(saved_snapshot.run_id.clone(), saved_snapshot.id.clone())
                .await
                .unwrap();
            assert_eq!((stale.restored, stale.removed, stale.conflicts), (0, 0, 1));
            assert_eq!(
                std::fs::read(&provider_marker).unwrap(),
                b"later user edit\n"
            );
        } else {
            let summary = client
                .inspect_run_changes(saved_snapshot.run_id.clone())
                .await
                .unwrap();
            assert_eq!(
                (summary.added, summary.modified, summary.deleted),
                (0, 1, 0)
            );
            let rollback = client
                .rollback_run(saved_snapshot.run_id.clone(), saved_snapshot.id.clone())
                .await
                .unwrap();
            assert_eq!(
                (rollback.restored, rollback.removed, rollback.conflicts),
                (1, 0, 0)
            );
            assert_eq!(
                std::fs::read(&provider_marker).unwrap(),
                b"later user edit\n"
            );
        }
    }

    let page = client
        .list_runs(task.entity.id.clone(), None, 50)
        .await
        .unwrap();
    assert_eq!(page.items[0].entity.index, 1);
    assert_eq!(
        page.items[0].entity.provider,
        ProviderId::Custom("alpha".into())
    );
    assert_eq!(page.items[1].entity.index, 2);
    assert_eq!(
        page.items[1].entity.provider,
        ProviderId::Custom("beta".into())
    );
    assert_ne!(page.items[0].entity.id, page.items[1].entity.id);

    client.shutdown().await.unwrap();
    timeout(Duration::from_secs(2), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}
