use codetwo_core::{
    AgentId, ProviderConfiguration, ProviderId, ResultContract, Store, StoreError, Task,
    TaskBudget, TaskGraph, TaskId, TaskStatus, WorkItem, WorkItemAttemptStatus, WorkItemEdge,
    WorkItemId, WorkItemStatus,
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

fn work_item(id: &str, objective: &str) -> WorkItem {
    WorkItem {
        id: WorkItemId::new(id),
        objective: objective.into(),
        result_contract_conditions: Vec::new(),
        scenes: Vec::new(),
        agent_skills: Vec::new(),
        input_artifacts: Vec::new(),
        expected_outputs: Vec::new(),
        completion_evidence: Vec::new(),
        status: WorkItemStatus::Ready,
        blocker: None,
        assigned_session_id: None,
        reason: "Required by the current Task Graph".into(),
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

#[test]
fn task_graph_with_work_items_and_edges_round_trips() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    store.create_task(&task, 100).unwrap();
    let graph = TaskGraph {
        revision: 1,
        work_items: vec![
            work_item("work-1", "Model storage"),
            work_item("work-2", "Verify restart"),
        ],
        edges: vec![WorkItemEdge {
            prerequisite: WorkItemId::new("work-1"),
            dependent: WorkItemId::new("work-2"),
        }],
    };

    store.put_task_graph(&task.id, &graph, 200).unwrap();

    assert_eq!(store.get_task_graph(&task.id).unwrap(), graph);
}

#[test]
fn store_rejects_a_second_running_executor_attempt_for_the_same_task() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    store.create_task(&task, 100).unwrap();
    store
        .put_task_graph(
            &task.id,
            &TaskGraph {
                revision: 1,
                work_items: vec![work_item("work-1", "First"), work_item("work-2", "Second")],
                edges: Vec::new(),
            },
            200,
        )
        .unwrap();
    store
        .start_work_item_attempt(
            &task.id,
            &WorkItemId::new("work-1"),
            &AgentId::new("agent-1"),
            "session-1",
            300,
        )
        .unwrap();

    let result = store.start_work_item_attempt(
        &task.id,
        &WorkItemId::new("work-2"),
        &AgentId::new("agent-2"),
        "session-2",
        301,
    );

    assert!(matches!(result, Err(StoreError::TaskExecutorBusy { .. })));
}

#[test]
fn completing_an_attempt_releases_the_serial_executor_slot() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    store.create_task(&task, 100).unwrap();
    store
        .put_task_graph(
            &task.id,
            &TaskGraph {
                revision: 1,
                work_items: vec![work_item("work-1", "First"), work_item("work-2", "Second")],
                edges: Vec::new(),
            },
            200,
        )
        .unwrap();
    let first = store
        .start_work_item_attempt(
            &task.id,
            &WorkItemId::new("work-1"),
            &AgentId::new("agent-1"),
            "session-1",
            300,
        )
        .unwrap();

    let completed = store
        .finish_work_item_attempt(
            &task.id,
            &first.work_item_id,
            first.attempt,
            WorkItemAttemptStatus::Succeeded,
            400,
        )
        .unwrap();
    let second = store.start_work_item_attempt(
        &task.id,
        &WorkItemId::new("work-2"),
        &AgentId::new("agent-2"),
        "session-2",
        401,
    );

    assert_eq!(completed.status, WorkItemAttemptStatus::Succeeded);
    assert_eq!(completed.finished_at_ms, Some(400));
    assert!(second.is_ok());
}
