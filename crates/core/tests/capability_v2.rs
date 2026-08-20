use codetwo_core::{
    propose_plugin_installations, resolve_work_item_capabilities, CapabilityAdapter,
    CapabilityAdapterState, CapabilityReadinessStatus, ConcreteEffect, GraphOperation,
    OrchestrationPatch, PluginInstallCandidate, SceneCatalogV2, SceneOrigin, SceneRef, TaskId,
    WorkItem, WorkItemId, WorkItemStatus,
};

fn work_item(scene_id: &str) -> WorkItem {
    WorkItem {
        id: WorkItemId::new("work-capability"),
        objective: "Complete domain work".into(),
        result_contract_conditions: Vec::new(),
        scenes: vec![SceneRef {
            id: scene_id.into(),
            version: "2.0.0".into(),
            source: SceneOrigin::Official,
        }],
        agent_skills: Vec::new(),
        input_artifacts: Vec::new(),
        expected_outputs: Vec::new(),
        completion_evidence: Vec::new(),
        status: WorkItemStatus::Ready,
        blocker: None,
        assigned_session_id: None,
        reason: "The Task needs domain capabilities".into(),
    }
}

#[test]
fn readiness_selects_installed_adapters_without_prescribing_a_workflow() {
    let scenes = SceneCatalogV2::builtin();
    let work = work_item("official:software-development");
    let adapters = [
        CapabilityAdapter {
            adapter_id: "builtin:git".into(),
            namespace: "source-control".into(),
            version: "1".into(),
            content_identity: "git-v1".into(),
            state: CapabilityAdapterState::Ready,
            effects: vec![ConcreteEffect::LocalModify],
        },
        CapabilityAdapter {
            adapter_id: "builtin:workspace".into(),
            namespace: "workspace".into(),
            version: "1".into(),
            content_identity: "workspace-v1".into(),
            state: CapabilityAdapterState::Degraded {
                reason: "read-only workspace".into(),
            },
            effects: vec![ConcreteEffect::Read],
        },
    ];

    let readiness = resolve_work_item_capabilities(&work, &scenes, &adapters).unwrap();

    assert_eq!(readiness.len(), 2);
    assert_eq!(readiness[0].namespace, "source-control");
    assert_eq!(readiness[0].status, CapabilityReadinessStatus::Ready);
    assert_eq!(
        readiness[0].selected_adapter.as_deref(),
        Some("builtin:git")
    );
    assert_eq!(readiness[1].namespace, "workspace");
    assert_eq!(readiness[1].status, CapabilityReadinessStatus::Degraded);
    assert_eq!(
        readiness[1].selected_adapter.as_deref(),
        Some("builtin:workspace")
    );
}

#[test]
fn missing_capability_yields_a_non_mutating_user_install_proposal() {
    let scenes = SceneCatalogV2::builtin();
    let work = work_item("official:office-collaboration");
    let readiness = resolve_work_item_capabilities(&work, &scenes, &[]).unwrap();
    assert!(readiness
        .iter()
        .all(|item| item.status == CapabilityReadinessStatus::Blocked));

    let candidate = PluginInstallCandidate {
        plugin_id: "acme:office".into(),
        publisher: "Acme".into(),
        version: "2.1.0".into(),
        capabilities: vec!["documents".into(), "collaboration".into()],
        effects: vec![ConcreteEffect::ExternalModify, ConcreteEffect::Send],
        account_requirements: vec!["Acme Workspace account".into()],
    };
    let proposals =
        propose_plugin_installations(&TaskId::new("task-office"), &work, &readiness, &[candidate]);

    assert_eq!(proposals.len(), 1);
    assert_eq!(
        proposals[0].blocked_capabilities,
        ["collaboration", "documents"]
    );
    assert_eq!(proposals[0].plugin_id, "acme:office");
    assert_eq!(
        proposals[0].effects,
        [ConcreteEffect::ExternalModify, ConcreteEffect::Send]
    );
    assert!(proposals[0].requires_user_installation);

    let still_blocked = resolve_work_item_capabilities(&work, &scenes, &[]).unwrap();
    assert_eq!(
        still_blocked, readiness,
        "a proposal must not install anything"
    );
}

#[test]
fn planner_patch_has_no_plugin_install_operation() {
    let attempted_install = serde_json::json!({
        "expected_revision": 0,
        "reason": "Install a missing adapter",
        "operations": [{
            "kind": "install_plugin",
            "plugin_id": "acme:office"
        }]
    });

    assert!(serde_json::from_value::<OrchestrationPatch>(attempted_install).is_err());
    let allowed_kinds = [
        GraphOperation::Remove {
            work_item_id: WorkItemId::new("work-capability"),
        },
        GraphOperation::Cancel {
            work_item_id: WorkItemId::new("work-capability"),
            reason: "User cancelled".into(),
        },
    ];
    assert_eq!(allowed_kinds.len(), 2);
}
