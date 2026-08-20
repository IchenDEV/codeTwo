use codetwo_core::{
    OrchestrationEventKind, ProviderConfiguration, ProviderId, ResultContract,
    ResultContractRefinement, Store, StoreError, Task, TaskBudget, TaskGraph, TaskId, TaskStatus,
    WorkItem, WorkItemId, WorkItemStatus,
};

fn task(id: &str) -> Task {
    Task {
        id: TaskId::new(id),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Produce a verified report".into(),
            required_deliverables: vec!["Report".into()],
            completion_conditions: vec!["verified".into()],
            boundaries: vec!["Do not publish".into()],
            known_risks: Vec::new(),
            unresolved_facts: Vec::new(),
        },
        provider_configuration: ProviderConfiguration {
            provider: ProviderId::Codex,
            model: None,
            reasoning_effort: None,
        },
        budget: TaskBudget {
            max_cost_microusd: None,
            max_tokens: None,
            max_duration_seconds: None,
        },
    }
}

fn work_item(
    id: &str,
    outputs: &[&str],
    conditions: &[&str],
    status: WorkItemStatus,
    evidence: &[&str],
) -> WorkItem {
    WorkItem {
        id: WorkItemId::new(id),
        objective: "Produce contract evidence".into(),
        result_contract_conditions: conditions.iter().map(|value| (*value).into()).collect(),
        scenes: Vec::new(),
        agent_skills: Vec::new(),
        input_artifacts: Vec::new(),
        expected_outputs: outputs.iter().map(|value| (*value).into()).collect(),
        completion_evidence: evidence.iter().map(|value| (*value).into()).collect(),
        status,
        blocker: (status == WorkItemStatus::Failed).then(|| "execution failed".into()),
        assigned_session_id: None,
        reason: "Required by the Result Contract".into(),
    }
}

#[test]
fn refinement_is_additive_and_records_material_goal_change() {
    let store = Store::open_in_memory().unwrap();
    let task = task("task-refinement");
    store.create_task(&task, 100).unwrap();

    let record = store
        .refine_result_contract(
            &task.id,
            &ResultContractRefinement {
                expected_revision: 1,
                reason: "New evidence narrows the required audience".into(),
                clarified_goal: Some("Produce a verified report for operators".into()),
                add_required_deliverables: vec!["Operator checklist".into()],
                add_completion_conditions: vec!["operator reviewed".into()],
                add_boundaries: Vec::new(),
                add_known_risks: vec!["Runbook may be stale".into()],
                add_unresolved_facts: vec!["Current on-call owner".into()],
            },
            200,
        )
        .unwrap();

    assert_eq!(record.result_contract_revision, 2);
    assert_eq!(
        record.task.result_contract.required_deliverables,
        ["Report", "Operator checklist"]
    );
    assert_eq!(record.task.result_contract.boundaries, ["Do not publish"]);
    let events = store.list_orchestration_events(&task.id).unwrap();
    assert!(matches!(
        &events.last().unwrap().kind,
        OrchestrationEventKind::ResultContractRefined {
            previous_revision: 1,
            revision: 2,
            goal_change: Some(receipt),
            ..
        } if receipt.before == "Produce a verified report"
            && receipt.after == "Produce a verified report for operators"
    ));
}

#[test]
fn stale_refinement_cannot_replace_or_remove_requirements() {
    let store = Store::open_in_memory().unwrap();
    let task = task("task-stale-contract");
    store.create_task(&task, 100).unwrap();
    let refinement = ResultContractRefinement {
        expected_revision: 1,
        reason: "Add an explicit audience".into(),
        clarified_goal: None,
        add_required_deliverables: vec!["Audience note".into()],
        add_completion_conditions: Vec::new(),
        add_boundaries: Vec::new(),
        add_known_risks: Vec::new(),
        add_unresolved_facts: Vec::new(),
    };
    store
        .refine_result_contract(&task.id, &refinement, 200)
        .unwrap();

    let stale = store.refine_result_contract(&task.id, &refinement, 300);

    assert!(matches!(
        stale,
        Err(StoreError::ResultContractRevisionConflict {
            expected: 1,
            actual: 2,
            ..
        })
    ));
    assert_eq!(
        store
            .get_task(&task.id)
            .unwrap()
            .unwrap()
            .task
            .result_contract
            .required_deliverables,
        ["Report", "Audience note"]
    );
}

#[test]
fn completion_status_is_derived_from_contract_evidence() {
    let store = Store::open_in_memory().unwrap();

    let completed = task("task-completed");
    store.create_task(&completed, 100).unwrap();
    store
        .apply_task_graph(
            &completed.id,
            0,
            &TaskGraph {
                revision: 1,
                work_items: vec![work_item(
                    "complete",
                    &["Report"],
                    &["verified"],
                    WorkItemStatus::Succeeded,
                    &["report.md and test receipt"],
                )],
                edges: Vec::new(),
            },
            "Evidence is ready",
            200,
        )
        .unwrap();
    let completed_evaluation = store.finalize_task(&completed.id, 300).unwrap();

    let partial = task("task-partial");
    store.create_task(&partial, 100).unwrap();
    store
        .refine_result_contract(
            &partial.id,
            &ResultContractRefinement {
                expected_revision: 1,
                reason: "A second deliverable is required".into(),
                clarified_goal: None,
                add_required_deliverables: vec!["Checklist".into()],
                add_completion_conditions: Vec::new(),
                add_boundaries: Vec::new(),
                add_known_risks: Vec::new(),
                add_unresolved_facts: Vec::new(),
            },
            150,
        )
        .unwrap();
    store
        .apply_task_graph(
            &partial.id,
            0,
            &TaskGraph {
                revision: 1,
                work_items: vec![work_item(
                    "partial",
                    &["Report"],
                    &["verified"],
                    WorkItemStatus::Succeeded,
                    &["report.md"],
                )],
                edges: Vec::new(),
            },
            "One deliverable is ready",
            200,
        )
        .unwrap();
    let partial_evaluation = store.finalize_task(&partial.id, 300).unwrap();

    let blocked = task("task-blocked");
    store.create_task(&blocked, 100).unwrap();
    store
        .apply_task_graph(
            &blocked.id,
            0,
            &TaskGraph {
                revision: 1,
                work_items: vec![work_item("blocked", &[], &[], WorkItemStatus::Failed, &[])],
                edges: Vec::new(),
            },
            "Execution is blocked",
            200,
        )
        .unwrap();
    let blocked_evaluation = store.finalize_task(&blocked.id, 300).unwrap();

    assert_eq!(completed_evaluation.status, TaskStatus::Completed);
    assert!(completed_evaluation.missing_deliverables.is_empty());
    assert_eq!(partial_evaluation.status, TaskStatus::PartiallyCompleted);
    assert_eq!(partial_evaluation.missing_deliverables, ["Checklist"]);
    assert_eq!(blocked_evaluation.status, TaskStatus::Blocked);
    assert_eq!(blocked_evaluation.blockers, ["execution failed"]);
}
