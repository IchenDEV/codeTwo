use codetwo_core::{
    ProviderConfiguration, ProviderId, ResultContract, Store, Task, TaskBudget, TaskId, TaskStatus,
};

fn task() -> Task {
    Task {
        id: TaskId::new("task-1"),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Implement Scenes 2.0".into(),
            required_deliverables: vec!["Task persistence".into()],
            completion_conditions: vec!["Task survives reopening the store".into()],
            boundaries: vec!["Do not migrate Scenes 1.0".into()],
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
            max_tokens: Some(120_000),
            max_duration_seconds: None,
        },
    }
}

#[test]
fn task_and_initial_result_contract_survive_reopening_the_store() {
    let dir = tempfile::tempdir().unwrap();
    let database = dir.path().join("codetwo.db");
    let database = database.to_str().unwrap();
    {
        let store = Store::open(database).unwrap();
        store.create_task(&task(), 100).unwrap();
    }

    let reopened = Store::open(database).unwrap();
    let stored = reopened.get_task(&TaskId::new("task-1")).unwrap().unwrap();

    assert_eq!(stored.task, task());
    assert_eq!(stored.result_contract_revision, 1);
    assert_eq!(stored.created_at_ms, 100);
    assert_eq!(stored.updated_at_ms, 100);
}

#[test]
fn installing_task_storage_leaves_legacy_pipeline_rows_untouched() {
    let dir = tempfile::tempdir().unwrap();
    let database = dir.path().join("codetwo.db");
    let database = database.to_str().unwrap();
    let legacy_id = {
        let store = Store::open(database).unwrap();
        store
            .create_pipeline_instance("builtin:rnd-lifecycle", "/work/project", "research")
            .unwrap()
            .id
    };

    let reopened = Store::open(database).unwrap();

    assert_eq!(
        reopened
            .get_pipeline_instance(&legacy_id)
            .unwrap()
            .unwrap()
            .pipeline_ref,
        "builtin:rnd-lifecycle"
    );
    assert!(reopened.get_task(&TaskId::new("task-1")).unwrap().is_none());
}
