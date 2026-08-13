//! End-to-end R8 hook flow over the normative fixtures: the builtin `test` scene declares
//! `tests_failed → suggest_scene fix`, so a synthetic [`Event::TestSignal`] through
//! [`SceneRuntime::on_event`] must surface exactly one render-only [`Event::HookSuggestion`]
//! for the `fix` scene — and never any engine op.

use std::sync::{Arc, Mutex};

use codetwo_core::event::{Event, Op};
use codetwo_core::provider::ProviderId;
use codetwo_core::scene::SceneLibrary;
use codetwo_core::session::Session;
use codetwo_core::skill::SkillLibrary;
use codetwo_core::{ArtifactStore, SceneArtifactStore, SceneRuntime, Store};

#[test]
fn builtin_test_scene_suggests_fix_on_a_failed_test_signal() {
    let dir = tempfile::tempdir().unwrap();
    let store = Arc::new(Store::open(dir.path().join("codetwo.db").to_str().unwrap()).unwrap());
    let blobs = ArtifactStore::from_store(store.clone()).unwrap();
    let artifacts = SceneArtifactStore::new(store.clone(), blobs);

    // A durable session bound to the builtin test scene, exactly as `apply_scene` persists it.
    let mut session = Session::new(ProviderId::ClaudeCode, "/work");
    session.id = "session-1".to_string();
    store.upsert_session(&session).unwrap();
    store
        .set_session_scene("session-1", Some("builtin:test"), false)
        .unwrap();

    let submitted: Arc<Mutex<Vec<Op>>> = Arc::default();
    let sink = submitted.clone();
    let (emit, mut events) = tokio::sync::broadcast::channel(16);
    let runtime = SceneRuntime::new(
        Arc::new(SceneLibrary::builtin()),
        Arc::new(Mutex::new(SkillLibrary::default())),
        store,
        artifacts,
        Box::new(move |op| sink.lock().unwrap().push(op)),
        emit,
    );

    runtime.on_event(&Event::TestSignal {
        session: "session-1".into(),
        tool_call_id: "tool-1".into(),
        command: "cargo test".into(),
        passed: false,
        exit_code: Some(101),
    });

    let mut suggestions = Vec::new();
    while let Ok(event) = events.try_recv() {
        if matches!(event, Event::HookSuggestion { .. }) {
            suggestions.push(event);
        }
    }
    assert_eq!(suggestions.len(), 1, "exactly one suggestion per tool call");
    match &suggestions[0] {
        Event::HookSuggestion {
            session,
            scene_ref,
            on,
            kind,
            target_scene,
            state_key,
            ..
        } => {
            assert_eq!(session, "session-1");
            assert_eq!(scene_ref, "builtin:test");
            assert_eq!(on, "tests_failed");
            assert_eq!(kind, "suggest_scene");
            assert_eq!(target_scene.as_deref(), Some("fix"));
            assert_eq!(state_key, "tool-1");
        }
        _ => unreachable!(),
    }

    // Render-only: hooks submitted nothing, and could never have loosened permissions.
    assert!(submitted.lock().unwrap().is_empty());

    // The same failed tool call never fires twice; a green signal fires nothing.
    runtime.on_event(&Event::TestSignal {
        session: "session-1".into(),
        tool_call_id: "tool-1".into(),
        command: "cargo test".into(),
        passed: false,
        exit_code: Some(101),
    });
    runtime.on_event(&Event::TestSignal {
        session: "session-1".into(),
        tool_call_id: "tool-2".into(),
        command: "cargo test".into(),
        passed: true,
        exit_code: Some(0),
    });
    while let Ok(event) = events.try_recv() {
        assert!(
            !matches!(event, Event::HookSuggestion { .. }),
            "debounced/green signals must stay silent"
        );
    }
}
