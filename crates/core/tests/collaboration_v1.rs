use codetwo_core::{
    AgentId, MemberId, ProviderConfiguration, ProviderId, ResultContract, Session, Store,
    StoreError, SuggestionId, SuggestionStatus, Task, TaskBudget, TaskId, TaskStatus, WorkItem,
    WorkItemId, WorkItemStatus, WorkspaceId, WorkspaceRole,
};
use std::sync::{Arc, Barrier};

fn task(id: &str) -> Task {
    Task {
        id: TaskId::new(id),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Ship the shared Task".into(),
            required_deliverables: Vec::new(),
            completion_conditions: Vec::new(),
            boundaries: Vec::new(),
            known_risks: Vec::new(),
            unresolved_facts: Vec::new(),
        },
        provider_configuration: ProviderConfiguration {
            provider: ProviderId::Codex,
            model: Some("gpt-test".into()),
            reasoning_effort: Some("high".into()),
        },
        budget: TaskBudget {
            max_cost_microusd: None,
            max_tokens: None,
            max_duration_seconds: None,
        },
    }
}

#[test]
fn two_members_share_one_revisioned_task_and_only_owner_claims_execution() {
    let store = Store::open_in_memory().unwrap();
    let workspace_id = WorkspaceId::new("workspace-team");
    let alice = MemberId::new("member-alice");
    let bob = MemberId::new("member-bob");
    store
        .create_workspace(workspace_id.clone(), "CodeTwo Team", 1)
        .unwrap();
    store
        .create_member(
            &workspace_id,
            alice.clone(),
            "Alice",
            WorkspaceRole::Admin,
            2,
        )
        .unwrap();
    store
        .create_member(&workspace_id, bob.clone(), "Bob", WorkspaceRole::Member, 3)
        .unwrap();

    let task = task("task-shared");
    let created = store
        .create_shared_task(
            &task,
            &workspace_id,
            &alice,
            std::slice::from_ref(&bob),
            "/tmp/project",
            4,
        )
        .unwrap();
    assert_eq!(created.collaboration.revision, 1);
    assert_eq!(created.collaboration.owner_id, alice);

    let commented = store
        .add_task_comment(&task.id, &bob, 1, "Please preserve the API contract.", 5)
        .unwrap();
    assert_eq!(commented.revision, 2);
    assert_eq!(commented.comments[0].author_id, bob);
    let suggested = store
        .create_task_suggestion(&task.id, &bob, 2, "Implement the approved slice.", 6)
        .unwrap();
    assert_eq!(suggested.revision, 3);
    let suggestion_id = suggested.suggestions[0].id.clone();
    assert_eq!(suggested.suggestions[0].status, SuggestionStatus::Pending);

    let alice_snapshot = store.shared_task_snapshot(&task.id, &alice).unwrap();
    let bob_snapshot = store.shared_task_snapshot(&task.id, &bob).unwrap();
    assert_eq!(alice_snapshot, bob_snapshot);

    assert!(matches!(
        store.approve_task_suggestion(&task.id, &suggestion_id, &bob, "bob-cannot-approve", 3, 7,),
        Err(StoreError::MemberUnauthorized { .. })
    ));

    let accepted = store
        .approve_task_suggestion(&task.id, &suggestion_id, &alice, "approve-once", 3, 8)
        .unwrap();
    assert!(!accepted.replayed);
    assert_eq!(accepted.receipt.revision, 4);
    assert!(accepted.receipt.execution_claimed);
    let replay = store
        .approve_task_suggestion(&task.id, &suggestion_id, &alice, "approve-once", 3, 9)
        .unwrap();
    assert!(replay.replayed);
    assert_eq!(replay.receipt, accepted.receipt);

    let mut session = Session::new(ProviderId::Codex, "/tmp/project-worktree");
    session.id = "session-approved".into();
    let work_item = WorkItem {
        id: WorkItemId::new("work-approved"),
        objective: "Implement the approved slice.".into(),
        result_contract_conditions: Vec::new(),
        scenes: Vec::new(),
        agent_skills: Vec::new(),
        input_artifacts: Vec::new(),
        expected_outputs: Vec::new(),
        completion_evidence: Vec::new(),
        status: WorkItemStatus::Running,
        blocker: None,
        assigned_session_id: Some(session.id.clone()),
        reason: "Approved Suggestion".into(),
    };
    store
        .attach_parallel_task_session(
            &session,
            &task.id,
            &work_item,
            &AgentId::new("agent-approved"),
            "executor:task-shared:test",
            10,
        )
        .unwrap();
    assert!(matches!(
        store.attach_parallel_task_session(
            &session,
            &task.id,
            &work_item,
            &AgentId::new("agent-second"),
            "executor:task-shared:second",
            11,
        ),
        Err(StoreError::TaskExecutorBusy { .. })
    ));
    let linked_revision = store
        .link_suggestion_execution(&task.id, &suggestion_id, &alice, &session.id, 12)
        .unwrap();
    assert_eq!(linked_revision, 5);
    let final_snapshot = store.shared_task_snapshot(&task.id, &bob).unwrap();
    assert_eq!(final_snapshot.runtime.session_leases.len(), 1);
    assert_eq!(
        final_snapshot.collaboration.suggestions[0]
            .execution_session_id
            .as_deref(),
        Some("session-approved")
    );
    assert_eq!(final_snapshot.collaboration.activity.len(), 5);

    assert!(matches!(
        store.add_task_comment(&task.id, &bob, 3, "stale", 13),
        Err(StoreError::TaskRevisionConflict {
            expected: 3,
            actual: 5,
            ..
        })
    ));
}

#[test]
fn suggestion_lookup_is_scoped_to_the_task() {
    let store = Store::open_in_memory().unwrap();
    let workspace_id = WorkspaceId::new("workspace-team");
    let alice = MemberId::new("member-alice");
    store
        .create_workspace(workspace_id.clone(), "CodeTwo Team", 1)
        .unwrap();
    store
        .create_member(
            &workspace_id,
            alice.clone(),
            "Alice",
            WorkspaceRole::Admin,
            2,
        )
        .unwrap();
    let task = task("task-shared");
    store
        .create_shared_task(&task, &workspace_id, &alice, &[], "/tmp/project", 3)
        .unwrap();
    assert!(matches!(
        store.task_suggestion(&task.id, &SuggestionId::new("missing"), &alice,),
        Err(StoreError::SuggestionNotFound { .. })
    ));
}

#[test]
fn concurrent_approval_replays_one_durable_command_receipt() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let workspace_id = WorkspaceId::new("workspace-team");
    let alice = MemberId::new("member-alice");
    let bob = MemberId::new("member-bob");
    store
        .create_workspace(workspace_id.clone(), "CodeTwo Team", 1)
        .unwrap();
    store
        .create_member(
            &workspace_id,
            alice.clone(),
            "Alice",
            WorkspaceRole::Admin,
            2,
        )
        .unwrap();
    store
        .create_member(&workspace_id, bob.clone(), "Bob", WorkspaceRole::Member, 3)
        .unwrap();
    let task = task("task-race");
    store
        .create_shared_task(
            &task,
            &workspace_id,
            &alice,
            std::slice::from_ref(&bob),
            "/tmp/project",
            4,
        )
        .unwrap();
    let suggestion = store
        .create_task_suggestion(&task.id, &bob, 1, "Run once", 5)
        .unwrap();
    let suggestion_id = suggestion.suggestions[0].id.clone();
    let barrier = Arc::new(Barrier::new(3));
    let handles = (0..2)
        .map(|_| {
            let store = store.clone();
            let task_id = task.id.clone();
            let suggestion_id = suggestion_id.clone();
            let alice = alice.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                store
                    .approve_task_suggestion(&task_id, &suggestion_id, &alice, "same-command", 2, 6)
                    .unwrap()
            })
        })
        .collect::<Vec<_>>();
    barrier.wait();
    let results = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(results.iter().filter(|result| !result.replayed).count(), 1);
    assert_eq!(results.iter().filter(|result| result.replayed).count(), 1);
    assert_eq!(results[0].receipt, results[1].receipt);
}
