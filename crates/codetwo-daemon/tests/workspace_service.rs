#![cfg(unix)]

use std::sync::Arc;
use std::time::Duration;

use codetwo_client::{Client, SubscriptionMessage};
use codetwo_core::{Store, Workspace, WorkspaceKind};
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
