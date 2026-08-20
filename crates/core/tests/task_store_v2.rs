use codetwo_core::{
    AgentId, AgentRole, ArtifactProvenance, ArtifactStore, OrchestrationEventKind,
    ProviderConfiguration, ProviderId, ResultContract, Session, Store, StoreError, Task,
    TaskArtifactStatus, TaskBudget, TaskGraph, TaskId, TaskStatus, WorkItem, WorkItemAttemptStatus,
    WorkItemEdge, WorkItemId, WorkItemStatus,
};
use std::sync::Arc;

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

    store
        .apply_task_graph(&task.id, 0, &graph, "Initial graph", 200)
        .unwrap();

    assert_eq!(store.get_task_graph(&task.id).unwrap(), graph);
}

#[test]
fn store_rejects_a_second_running_executor_attempt_for_the_same_task() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    store.create_task(&task, 100).unwrap();
    store
        .apply_task_graph(
            &task.id,
            0,
            &TaskGraph {
                revision: 1,
                work_items: vec![work_item("work-1", "First"), work_item("work-2", "Second")],
                edges: Vec::new(),
            },
            "Initial graph",
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
        .apply_task_graph(
            &task.id,
            0,
            &TaskGraph {
                revision: 1,
                work_items: vec![work_item("work-1", "First"), work_item("work-2", "Second")],
                edges: Vec::new(),
            },
            "Initial graph",
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

#[test]
fn stale_graph_patch_is_rejected_and_does_not_append_an_event() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    store.create_task(&task, 100).unwrap();
    let graph = TaskGraph {
        revision: 1,
        work_items: vec![work_item("work-1", "First")],
        edges: Vec::new(),
    };
    store
        .apply_task_graph(&task.id, 0, &graph, "Initial graph", 200)
        .unwrap();

    let stale = store.apply_task_graph(&task.id, 0, &graph, "Stale retry", 201);
    let events = store.list_orchestration_events(&task.id).unwrap();

    assert!(matches!(
        stale,
        Err(StoreError::TaskRevisionConflict {
            expected: 0,
            actual: 1,
            ..
        })
    ));
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].kind, OrchestrationEventKind::TaskCreated);
    assert_eq!(
        events[1].kind,
        OrchestrationEventKind::TaskGraphChanged {
            reason: "Initial graph".into()
        }
    );
}

#[test]
fn compatible_session_lease_is_reused_and_incompatible_rebind_is_rejected() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    store.create_task(&task, 100).unwrap();
    let session = Session::new(ProviderId::Codex, "/work/project");
    store.upsert_session(&session).unwrap();

    let first = store
        .lease_task_session(
            &task.id,
            &session.id,
            &AgentId::new("agent-1"),
            AgentRole::Executor,
            "compatibility-a",
            200,
        )
        .unwrap();
    let reused = store
        .lease_task_session(
            &task.id,
            &session.id,
            &AgentId::new("agent-1"),
            AgentRole::Executor,
            "compatibility-a",
            300,
        )
        .unwrap();
    let incompatible = store.lease_task_session(
        &task.id,
        &session.id,
        &AgentId::new("agent-1"),
        AgentRole::Executor,
        "compatibility-b",
        400,
    );

    assert_eq!(reused, first);
    assert!(matches!(
        incompatible,
        Err(StoreError::SessionLeaseConflict { .. })
    ));
}

#[test]
fn task_artifact_versions_keep_attempt_and_content_provenance() {
    let dir = tempfile::tempdir().unwrap();
    let database = dir.path().join("codetwo.db");
    let store = Arc::new(Store::open(database.to_str().unwrap()).unwrap());
    let artifacts = ArtifactStore::from_store(store.clone()).unwrap();
    let task = task();
    store.create_task(&task, 100).unwrap();
    store
        .apply_task_graph(
            &task.id,
            0,
            &TaskGraph {
                revision: 1,
                work_items: vec![work_item("work-1", "Produce report")],
                edges: Vec::new(),
            },
            "Initial graph",
            200,
        )
        .unwrap();
    let session = Session::new(ProviderId::Codex, "/work/project");
    store.upsert_session(&session).unwrap();
    let agent = AgentId::new("agent-1");
    let first_attempt = store
        .start_work_item_attempt(
            &task.id,
            &WorkItemId::new("work-1"),
            &agent,
            &session.id,
            300,
        )
        .unwrap();
    let first_content = "first report";
    let first = artifacts
        .save_document(
            first_content,
            "text/markdown",
            Some("report.md"),
            &session.id,
            "task:work-1:1",
        )
        .unwrap();
    store
        .record_task_artifact(&ArtifactProvenance {
            artifact_id: first.id.clone(),
            artifact_key: "report".into(),
            task_id: task.id.clone(),
            work_item_id: first_attempt.work_item_id.clone(),
            attempt: first_attempt.attempt,
            version: 1,
            agent_id: agent.clone(),
            session_id: session.id.clone(),
            scenes: Vec::new(),
            agent_skills: Vec::new(),
            provider_configuration: task.provider_configuration.clone(),
            content_identity: blake3::hash(first_content.as_bytes()).to_hex().to_string(),
            storage_reference: first.id,
            created_at_ms: 310,
            status: TaskArtifactStatus::Candidate,
        })
        .unwrap();
    store
        .finish_work_item_attempt(
            &task.id,
            &first_attempt.work_item_id,
            first_attempt.attempt,
            WorkItemAttemptStatus::Failed,
            320,
        )
        .unwrap();
    let second_attempt = store
        .start_work_item_attempt(
            &task.id,
            &WorkItemId::new("work-1"),
            &agent,
            &session.id,
            400,
        )
        .unwrap();
    let second_content = "corrected report";
    let second = artifacts
        .save_document(
            second_content,
            "text/markdown",
            Some("report.md"),
            &session.id,
            "task:work-1:2",
        )
        .unwrap();
    store
        .record_task_artifact(&ArtifactProvenance {
            artifact_id: second.id.clone(),
            artifact_key: "report".into(),
            task_id: task.id.clone(),
            work_item_id: second_attempt.work_item_id,
            attempt: second_attempt.attempt,
            version: 2,
            agent_id: agent,
            session_id: session.id,
            scenes: Vec::new(),
            agent_skills: Vec::new(),
            provider_configuration: task.provider_configuration,
            content_identity: blake3::hash(second_content.as_bytes()).to_hex().to_string(),
            storage_reference: second.id,
            created_at_ms: 410,
            status: TaskArtifactStatus::Candidate,
        })
        .unwrap();

    let history = store.list_task_artifacts(&task.id).unwrap();

    assert_eq!(history.len(), 2);
    assert_eq!(history[0].version, 1);
    assert_eq!(history[0].attempt, 1);
    assert_eq!(history[1].version, 2);
    assert_eq!(history[1].attempt, 2);
    assert_ne!(history[0].content_identity, history[1].content_identity);
}
