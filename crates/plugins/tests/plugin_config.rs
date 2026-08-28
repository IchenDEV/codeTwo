use codetwo_plugins::{
    PluginConfigStore, PluginOverride, PluginPolicy, PluginRecoveryState, PluginScope,
};

#[test]
fn user_and_project_policy_resolve_through_one_store() {
    let mut store = PluginConfigStore::ephemeral();
    assert!(store.effective_enabled(&PluginScope::User, "git", true));

    store
        .set_policy(
            PluginScope::User,
            "git",
            PluginPolicy {
                state: PluginOverride::Disabled,
                ..Default::default()
            },
        )
        .unwrap();
    let project = PluginScope::project("/tmp/project-a");
    assert!(!store.effective_enabled(&project, "git", true));

    store
        .set_policy(
            project.clone(),
            "git",
            PluginPolicy {
                state: PluginOverride::Enabled,
                ..Default::default()
            },
        )
        .unwrap();
    assert!(store.effective_enabled(&project, "git", true));
    assert!(!store.effective_enabled(&PluginScope::User, "git", true));
}

#[test]
fn component_overrides_are_independent_from_the_plugin_switch() {
    let mut store = PluginConfigStore::ephemeral();
    let mut policy = PluginPolicy::default();
    policy
        .components
        .insert("dock".into(), PluginOverride::Disabled);
    store
        .set_policy(PluginScope::User, "terminal", policy)
        .unwrap();

    assert!(store.effective_enabled(&PluginScope::User, "terminal", true));
    assert!(!store.effective_component_enabled(&PluginScope::User, "terminal", "dock", true));
}

#[test]
fn persistent_policy_round_trips_and_keeps_a_last_good_copy() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = PluginConfigStore::open(dir.path()).unwrap();
    let revision = store
        .set_policy(
            PluginScope::User,
            "voice",
            PluginPolicy {
                state: PluginOverride::Disabled,
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(revision, 1);
    store.mark_last_good().unwrap();

    let reopened = PluginConfigStore::open(dir.path()).unwrap();
    assert!(!reopened.effective_enabled(&PluginScope::User, "voice", true));
    assert_eq!(reopened.snapshot().revision, 1);
}

#[test]
fn invalid_primary_uses_last_good_without_overwriting_the_evidence() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = PluginConfigStore::open(dir.path()).unwrap();
    store
        .set_policy(
            PluginScope::User,
            "usage",
            PluginPolicy {
                state: PluginOverride::Disabled,
                ..Default::default()
            },
        )
        .unwrap();
    store.mark_last_good().unwrap();
    std::fs::write(dir.path().join("plugin-config.json"), b"not json").unwrap();

    let recovered = PluginConfigStore::open(dir.path()).unwrap();
    assert!(matches!(
        recovered.recovery(),
        PluginRecoveryState::RestoredLastGood { .. }
    ));
    assert!(!recovered.effective_enabled(&PluginScope::User, "usage", true));
    assert_eq!(
        std::fs::read(dir.path().join("plugin-config.json")).unwrap(),
        b"not json"
    );
}

#[test]
fn invalid_config_without_a_snapshot_enters_safe_mode() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("plugin-config.json"), b"{").unwrap();
    let store = PluginConfigStore::open(dir.path()).unwrap();
    assert!(matches!(
        store.recovery(),
        PluginRecoveryState::SafeMode { .. }
    ));
    assert!(store.snapshot().user.is_empty());
}

#[test]
fn resetting_safe_mode_rewrites_the_primary_even_when_the_document_is_unchanged() {
    let dir = tempfile::tempdir().unwrap();
    let primary = dir.path().join("plugin-config.json");
    std::fs::write(&primary, b"{").unwrap();
    let mut store = PluginConfigStore::open(dir.path()).unwrap();
    assert!(matches!(
        store.recovery(),
        PluginRecoveryState::SafeMode { .. }
    ));

    let revision = store.reset(PluginScope::User, "terminal").unwrap();

    assert_eq!(revision, 0);
    assert!(matches!(store.recovery(), PluginRecoveryState::Normal));
    let rewritten: serde_json::Value =
        serde_json::from_slice(&std::fs::read(primary).unwrap()).unwrap();
    assert_eq!(rewritten["schema_version"], 1);
    assert_eq!(rewritten["revision"], 0);
}
