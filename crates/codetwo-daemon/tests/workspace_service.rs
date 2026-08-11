#![cfg(unix)]

use std::sync::Arc;
use std::time::Duration;

use codetwo_client::{Client, SubscriptionMessage};
use codetwo_core::{
    BriefRevision, DocBlock, Event, Op, PermissionMode, ProviderId, Session, Store, Task,
    TaskExperience, Workspace, WorkspaceKind,
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
