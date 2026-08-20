use codetwo_core::{
    effect_requires_risk_gate, ConcreteEffect, ProviderConfiguration, ProviderId, ResultContract,
    RiskGateDecision, Store, StoreError, Task, TaskBudget, TaskGraph, TaskId, TaskStatus,
    UserRiskDecision, WorkItem, WorkItemId, WorkItemStatus,
};

fn task() -> Task {
    Task {
        id: TaskId::new("task-risk"),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Prepare and optionally send a release update".into(),
            required_deliverables: Vec::new(),
            completion_conditions: Vec::new(),
            boundaries: Vec::new(),
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

fn install_work(store: &Store, task: &Task) {
    store.create_task(task, 100).unwrap();
    store
        .apply_task_graph(
            &task.id,
            0,
            &TaskGraph {
                revision: 1,
                work_items: vec![WorkItem {
                    id: WorkItemId::new("work-risk"),
                    objective: "Prepare release communication".into(),
                    result_contract_conditions: Vec::new(),
                    scenes: Vec::new(),
                    agent_skills: Vec::new(),
                    input_artifacts: Vec::new(),
                    expected_outputs: Vec::new(),
                    completion_evidence: Vec::new(),
                    status: WorkItemStatus::Ready,
                    blocker: None,
                    assigned_session_id: None,
                    reason: "Communication is requested".into(),
                }],
                edges: Vec::new(),
            },
            "Prepare communication",
            150,
        )
        .unwrap();
}

#[test]
fn concrete_effects_distinguish_preparation_from_external_action() {
    assert!(!effect_requires_risk_gate(ConcreteEffect::Read));
    assert!(!effect_requires_risk_gate(ConcreteEffect::LocalModify));
    assert!(effect_requires_risk_gate(ConcreteEffect::ExternalModify));
    assert!(effect_requires_risk_gate(ConcreteEffect::Send));
    assert!(effect_requires_risk_gate(ConcreteEffect::PublishDeploy));
    assert!(effect_requires_risk_gate(ConcreteEffect::Delete));
    assert!(effect_requires_risk_gate(ConcreteEffect::Payment));
    assert!(effect_requires_risk_gate(
        ConcreteEffect::AccessAdministration
    ));
    assert!(effect_requires_risk_gate(ConcreteEffect::Unknown));
}

#[test]
fn user_refusal_is_a_durable_effect_receipt_and_cannot_be_overwritten() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    install_work(&store, &task);
    let pending = store
        .request_risk_gate(
            &task.id,
            &WorkItemId::new("work-risk"),
            "Send release update",
            "#release channel",
            "Acme workspace",
            ConcreteEffect::Send,
            200,
        )
        .unwrap();
    assert_eq!(pending.decision, RiskGateDecision::Pending);
    assert!(!pending.allows_effect());

    let refused = store
        .record_user_risk_decision(
            &pending.request_id,
            UserRiskDecision::Refuse,
            "Keep this as a draft",
            300,
        )
        .unwrap();

    assert!(matches!(
        refused.decision,
        RiskGateDecision::Refused { ref reason }
            if reason == "Keep this as a draft"
    ));
    assert!(!refused.allows_effect());
    assert!(matches!(
        store.record_user_risk_decision(
            &pending.request_id,
            UserRiskDecision::Approve,
            "Try to overwrite refusal",
            400,
        ),
        Err(StoreError::InvalidRiskGate(_))
    ));
    assert_eq!(store.list_task_risk_gates(&task.id).unwrap(), [refused]);
}

#[test]
fn approved_effect_is_bound_to_the_exact_action_target_and_scope() {
    let store = Store::open_in_memory().unwrap();
    let task = task();
    install_work(&store, &task);
    let pending = store
        .request_risk_gate(
            &task.id,
            &WorkItemId::new("work-risk"),
            "Deploy release",
            "production",
            "service-a",
            ConcreteEffect::PublishDeploy,
            200,
        )
        .unwrap();
    let approved = store
        .record_user_risk_decision(
            &pending.request_id,
            UserRiskDecision::Approve,
            "Approved for service-a production only",
            300,
        )
        .unwrap();

    assert!(approved.allows_effect());
    assert_eq!(approved.action, "Deploy release");
    assert_eq!(approved.target, "production");
    assert_eq!(approved.scope, "service-a");
}
