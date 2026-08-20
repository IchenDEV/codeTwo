use codetwo_core::{
    AgentId, ProviderCacheMetrics, ProviderConfiguration, ProviderId, ResultContract, Store,
    StructuralPromptReuse, Task, TaskBudget, TaskCacheReceipt, TaskGraph, TaskId, TaskStatus,
    WorkItem, WorkItemId, WorkItemStatus,
};

fn task() -> Task {
    Task {
        id: TaskId::new("task-cache-receipt"),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Observe cache evidence honestly".into(),
            required_deliverables: Vec::new(),
            completion_conditions: Vec::new(),
            boundaries: Vec::new(),
            known_risks: Vec::new(),
            unresolved_facts: Vec::new(),
        },
        provider_configuration: ProviderConfiguration {
            provider: ProviderId::Codex,
            model: Some("gpt-5.6-sol".into()),
            reasoning_effort: Some("high".into()),
        },
        budget: TaskBudget {
            max_cost_microusd: None,
            max_tokens: None,
            max_duration_seconds: None,
        },
    }
}

fn install_attempt(store: &Store, task: &Task) {
    store.create_task(task, 100).unwrap();
    store
        .apply_task_graph(
            &task.id,
            0,
            &TaskGraph {
                revision: 1,
                work_items: vec![WorkItem {
                    id: WorkItemId::new("work-1"),
                    objective: "Run compatible work".into(),
                    result_contract_conditions: Vec::new(),
                    scenes: Vec::new(),
                    agent_skills: Vec::new(),
                    input_artifacts: Vec::new(),
                    expected_outputs: Vec::new(),
                    completion_evidence: Vec::new(),
                    status: WorkItemStatus::Ready,
                    blocker: None,
                    assigned_session_id: None,
                    reason: "Observe the execution".into(),
                }],
                edges: Vec::new(),
            },
            "Prepare cache observation",
            150,
        )
        .unwrap();
    store
        .start_work_item_attempt(
            &task.id,
            &WorkItemId::new("work-1"),
            &AgentId::new("agent-1"),
            "session-1",
            200,
        )
        .unwrap();
}

#[test]
fn provider_cache_evidence_and_structural_reuse_are_separate_receipts() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    install_attempt(&store, &task);
    let receipt = TaskCacheReceipt {
        task_id: task.id.clone(),
        work_item_id: WorkItemId::new("work-1"),
        attempt: 1,
        provider_cache: ProviderCacheMetrics::Reported {
            fresh_input_tokens: 100,
            cached_input_tokens: 900,
        },
        structural_reuse: StructuralPromptReuse {
            stable_prefix_identity: "stable-prefix".into(),
            session_compatibility_identity: "session-key".into(),
            reused_compatible_session: true,
        },
        recorded_at_ms: 250,
    };

    store.record_task_cache_receipt(&receipt).unwrap();
    let stored = store.list_task_cache_receipts(&task.id).unwrap();

    assert_eq!(stored, [receipt]);
    assert_eq!(
        stored[0].provider_cache.hit_rate_basis_points(),
        Some(9_000)
    );
    let json = serde_json::to_value(&stored[0]).unwrap();
    assert_eq!(json["provider_cache"]["kind"], "reported");
    assert_eq!(json["structural_reuse"]["reused_compatible_session"], true);
}

#[test]
fn structural_reuse_never_becomes_a_provider_cache_hit_when_metrics_are_unknown() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    install_attempt(&store, &task);
    let receipt = TaskCacheReceipt {
        task_id: task.id.clone(),
        work_item_id: WorkItemId::new("work-1"),
        attempt: 1,
        provider_cache: ProviderCacheMetrics::Unknown,
        structural_reuse: StructuralPromptReuse {
            stable_prefix_identity: "stable-prefix".into(),
            session_compatibility_identity: "session-key".into(),
            reused_compatible_session: true,
        },
        recorded_at_ms: 250,
    };

    store.record_task_cache_receipt(&receipt).unwrap();
    let stored = store.list_task_cache_receipts(&task.id).unwrap();
    let json = serde_json::to_value(&stored[0]).unwrap();

    assert_eq!(stored[0].provider_cache.hit_rate_basis_points(), None);
    assert_eq!(json["provider_cache"]["kind"], "unknown");
    assert!(json["provider_cache"].get("cached_input_tokens").is_none());
    assert_eq!(json["structural_reuse"]["reused_compatible_session"], true);
}
