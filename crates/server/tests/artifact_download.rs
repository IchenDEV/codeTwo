use std::sync::Arc;
use std::time::Duration;

use codetwo_core::artifact::ArtifactStore;
use codetwo_core::canvas::CanvasFeatureGate;
use codetwo_core::skill::{builtin_skills, SkillLibrary};
use codetwo_core::{Engine, Store};
use codetwo_server::{bind_and_serve_with_web_ui, fanout, AuthState};

/// One live server whose store is file-backed, so it has an artifact root to serve from. The
/// caller's `AuthState` is shared so a bearer minted by the test authenticates against this server.
async fn artifact_server(
    auth: Arc<AuthState>,
) -> (
    std::net::SocketAddr,
    tokio::task::JoinHandle<()>,
    tempfile::TempDir,
    Arc<Store>,
) {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(Store::open(dir.path().join("codetwo.db").to_str().unwrap()).unwrap());
    let artifacts = ArtifactStore::from_store(store.clone()).unwrap();
    let reference = artifacts
        .save_document("hello artifact", "text/plain", Some("note.txt"), "s1", "t1")
        .unwrap();
    assert_eq!(reference.display_name, "note.txt");

    let (engine, receiver) = Engine::with_store(
        codetwo_core::provider::default_registry(),
        SkillLibrary::new(builtin_skills()),
        store.clone(),
    );
    let (addr, handle) = bind_and_serve_with_web_ui(
        Arc::new(engine),
        fanout(receiver),
        "127.0.0.1:0".parse().unwrap(),
        auth,
        store.clone(),
        CanvasFeatureGate::default(),
        None,
        None,
        None,
    )
    .await
    .unwrap();
    (addr, handle, dir, store)
}

#[tokio::test]
async fn artifact_download_requires_a_device_and_serves_the_stored_bytes() {
    let auth = Arc::new(AuthState::load(None));
    let token = auth.issue_pairing_token(Duration::from_secs(60));
    let paired = auth.pair(&token, "Laptop").unwrap();
    let (addr, handle, _dir, store) = artifact_server(auth).await;

    let artifacts = ArtifactStore::from_store(store).unwrap();
    let reference = artifacts.list_for_session("s1").unwrap()[0].clone();

    // No bearer → unauthorized.
    let anonymous = reqwest::get(format!("http://{addr}/api/artifacts/{}", reference.id))
        .await
        .unwrap();
    assert_eq!(anonymous.status().as_u16(), 401);

    let response = reqwest::Client::new()
        .get(format!("http://{addr}/api/artifacts/{}", reference.id))
        .bearer_auth(&paired.bearer)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(
        response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .unwrap(),
        "text/plain"
    );
    assert_eq!(
        response
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .unwrap(),
        "attachment; filename=\"note.txt\""
    );
    assert_eq!(response.text().await.unwrap(), "hello artifact");

    // An unknown id is a clean 404, not an empty 200.
    let missing = reqwest::Client::new()
        .get(format!("http://{addr}/api/artifacts/does-not-exist"))
        .bearer_auth(&paired.bearer)
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status().as_u16(), 404);

    handle.abort();
}
