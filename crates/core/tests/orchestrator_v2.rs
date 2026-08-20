use codetwo_core::{
    apply_orchestration_patch, AgentSkillContribution, AgentSkillOrigin, AgentSkillRef,
    AgentSkillResolver, ExecutorAssignment, ExecutorOutcome, GraphOperation, InMemoryExecutor,
    InMemoryPlanner, OrchestrationPatch, OrchestrationValidationError, Orchestrator,
    ProviderConfiguration, ProviderId, ResultContract, SceneCatalogV2, SceneOrigin, SceneRef,
    Session, Skill, SkillPayload, Store, Task, TaskBudget, TaskGraph, TaskId, TaskStatus, WorkItem,
    WorkItemId, WorkItemStatus,
};
use std::sync::Arc;

fn authentic_skill_resolver() -> AgentSkillResolver {
    AgentSkillResolver::new([AgentSkillContribution {
        skill: Skill {
            id: "review".into(),
            name: "Review".into(),
            description: "Review current evidence".into(),
            icon: None,
            source: None,
            payload: SkillPayload::AgentSkill {
                skill_ref: "review".into(),
                inline_text: Some("Review the evidence.".into()),
            },
        },
        origin: AgentSkillOrigin::Preinstalled,
    }])
}

fn work_item(scene_id: &str, skill: AgentSkillRef) -> WorkItem {
    work_item_named("work-1", scene_id, skill)
}

fn work_item_named(id: &str, scene_id: &str, skill: AgentSkillRef) -> WorkItem {
    WorkItem {
        id: WorkItemId::new(id),
        objective: "Review the implementation".into(),
        result_contract_conditions: vec!["reviewed".into()],
        scenes: vec![SceneRef {
            id: scene_id.into(),
            version: "2.0.0".into(),
            source: SceneOrigin::Official,
        }],
        agent_skills: vec![skill],
        input_artifacts: Vec::new(),
        expected_outputs: vec!["Review report".into()],
        completion_evidence: Vec::new(),
        status: WorkItemStatus::Proposed,
        blocker: None,
        assigned_session_id: None,
        reason: "The Task requires review evidence".into(),
    }
}

#[test]
fn validated_patch_adds_a_work_item_and_advances_one_revision() {
    let scenes = SceneCatalogV2::builtin();
    let skills = authentic_skill_resolver();
    let skill = skills.resolve("review").unwrap().reference.clone();
    let current = TaskGraph {
        revision: 0,
        work_items: Vec::new(),
        edges: Vec::new(),
    };
    let patch = OrchestrationPatch {
        expected_revision: 0,
        reason: "Review is required before completion".into(),
        operations: vec![GraphOperation::Add {
            work_item: work_item("official:software-development", skill),
            depends_on: Vec::new(),
        }],
    };

    let next = apply_orchestration_patch(&current, &patch, &scenes, &skills).unwrap();

    assert_eq!(next.revision, 1);
    assert_eq!(next.work_items.len(), 1);
    assert_eq!(next.work_items[0].status, WorkItemStatus::Proposed);
}

#[test]
fn patch_rejects_an_unknown_scene_without_mutating_the_graph() {
    let scenes = SceneCatalogV2::builtin();
    let skills = authentic_skill_resolver();
    let skill = skills.resolve("review").unwrap().reference.clone();
    let current = TaskGraph {
        revision: 4,
        work_items: Vec::new(),
        edges: Vec::new(),
    };
    let patch = OrchestrationPatch {
        expected_revision: 4,
        reason: "Attach missing context".into(),
        operations: vec![GraphOperation::Add {
            work_item: work_item("official:unknown-domain", skill),
            depends_on: Vec::new(),
        }],
    };

    let result = apply_orchestration_patch(&current, &patch, &scenes, &skills);

    assert!(matches!(
        result,
        Err(OrchestrationValidationError::UnknownScene { .. })
    ));
    assert_eq!(current.revision, 4);
    assert!(current.work_items.is_empty());
}

#[tokio::test]
async fn orchestrator_plans_and_completes_one_work_item_through_ports() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let task = Task {
        id: TaskId::new("task-1"),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Review Scenes 2.0".into(),
            required_deliverables: vec!["Review report".into()],
            completion_conditions: vec!["reviewed".into()],
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
    };
    store.create_task(&task, 100).unwrap();
    let session = Session::new(ProviderId::Codex, "/work/project");
    store.upsert_session(&session).unwrap();
    let manager_session = Session::new(ProviderId::Codex, "/work/project");
    store.upsert_session(&manager_session).unwrap();
    let scenes = Arc::new(SceneCatalogV2::builtin());
    let skills = Arc::new(authentic_skill_resolver());
    let skill = skills.resolve("review").unwrap().reference.clone();
    let planner = Arc::new(
        InMemoryPlanner::new([OrchestrationPatch {
            expected_revision: 0,
            reason: "Review evidence is required".into(),
            operations: vec![GraphOperation::Add {
                work_item: work_item("official:software-development", skill),
                depends_on: Vec::new(),
            }],
        }])
        .with_manager_assignment(ExecutorAssignment {
            agent_id: "manager-1".into(),
            session_id: manager_session.id,
        }),
    );
    let executor = Arc::new(InMemoryExecutor::new(
        ExecutorAssignment {
            agent_id: "agent-1".into(),
            session_id: session.id,
        },
        [ExecutorOutcome::Succeeded {
            evidence: vec!["Review report recorded".into()],
        }],
    ));
    let orchestrator = Orchestrator::new(store.clone(), planner, executor, scenes, skills);

    orchestrator.plan_once(&task.id, 200).await.unwrap();
    assert!(store.list_task_session_leases(&task.id).unwrap().is_empty());
    orchestrator.execute_next(&task.id, 300).await.unwrap();

    let graph = store.get_task_graph(&task.id).unwrap();
    assert_eq!(graph.revision, 2);
    assert_eq!(graph.work_items[0].status, WorkItemStatus::Succeeded);
    assert_eq!(
        graph.work_items[0].completion_evidence,
        ["Review report recorded"]
    );
}

#[tokio::test]
async fn orchestrator_executes_dependent_work_items_serially() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let task = Task {
        id: TaskId::new("task-serial"),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Produce and verify a change".into(),
            required_deliverables: vec!["Change".into(), "Verification".into()],
            completion_conditions: vec!["changed".into(), "verified".into()],
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
    };
    store.create_task(&task, 100).unwrap();
    let session = Session::new(ProviderId::Codex, "/work/project");
    store.upsert_session(&session).unwrap();
    let manager_session = Session::new(ProviderId::Codex, "/work/project");
    store.upsert_session(&manager_session).unwrap();
    let scenes = Arc::new(SceneCatalogV2::builtin());
    let skills = Arc::new(authentic_skill_resolver());
    let skill = skills.resolve("review").unwrap().reference.clone();
    let planner = Arc::new(
        InMemoryPlanner::new([OrchestrationPatch {
            expected_revision: 0,
            reason: "The change must precede verification".into(),
            operations: vec![
                GraphOperation::Add {
                    work_item: work_item_named(
                        "work-change",
                        "official:software-development",
                        skill.clone(),
                    ),
                    depends_on: Vec::new(),
                },
                GraphOperation::Add {
                    work_item: work_item_named("work-verify", "official:testing-quality", skill),
                    depends_on: vec![WorkItemId::new("work-change")],
                },
            ],
        }])
        .with_manager_assignment(ExecutorAssignment {
            agent_id: "manager-1".into(),
            session_id: manager_session.id,
        }),
    );
    let executor = Arc::new(InMemoryExecutor::new(
        ExecutorAssignment {
            agent_id: "agent-1".into(),
            session_id: session.id,
        },
        [
            ExecutorOutcome::Succeeded {
                evidence: vec!["Change produced".into()],
            },
            ExecutorOutcome::Succeeded {
                evidence: vec!["Verification passed".into()],
            },
        ],
    ));
    let orchestrator = Orchestrator::new(store.clone(), planner, executor, scenes, skills);

    orchestrator.plan_once(&task.id, 200).await.unwrap();
    let leases = store.list_task_session_leases(&task.id).unwrap();
    assert_eq!(leases.len(), 1);
    assert_eq!(leases[0].role, codetwo_core::AgentRole::Manager);
    orchestrator.execute_next(&task.id, 300).await.unwrap();
    orchestrator.execute_next(&task.id, 400).await.unwrap();

    let graph = store.get_task_graph(&task.id).unwrap();
    assert_eq!(graph.revision, 3);
    assert!(graph
        .work_items
        .iter()
        .all(|item| item.status == WorkItemStatus::Succeeded));
}

#[tokio::test]
async fn consecutive_failures_pause_the_task_before_a_fourth_execution() {
    let store = Arc::new(Store::open_in_memory().unwrap());
    let task = Task {
        id: TaskId::new("task-loop-guard"),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Complete bounded work".into(),
            required_deliverables: vec!["Result".into()],
            completion_conditions: vec!["done".into()],
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
    };
    store.create_task(&task, 100).unwrap();
    let session = Session::new(ProviderId::Codex, "/work/project");
    store.upsert_session(&session).unwrap();
    let scenes = Arc::new(SceneCatalogV2::builtin());
    let skills = Arc::new(authentic_skill_resolver());
    let skill = skills.resolve("review").unwrap().reference.clone();
    let planner = Arc::new(InMemoryPlanner::new([
        OrchestrationPatch {
            expected_revision: 0,
            reason: "Initial bounded attempt".into(),
            operations: vec![GraphOperation::Add {
                work_item: work_item("official:software-development", skill),
                depends_on: Vec::new(),
            }],
        },
        OrchestrationPatch {
            expected_revision: 2,
            reason: "Retry after first failure".into(),
            operations: vec![GraphOperation::Retry {
                work_item_id: WorkItemId::new("work-1"),
                reason: "Retry after first failure".into(),
            }],
        },
        OrchestrationPatch {
            expected_revision: 4,
            reason: "Retry after second failure".into(),
            operations: vec![GraphOperation::Retry {
                work_item_id: WorkItemId::new("work-1"),
                reason: "Retry after second failure".into(),
            }],
        },
    ]));
    let executor = Arc::new(InMemoryExecutor::new(
        ExecutorAssignment {
            agent_id: "agent-1".into(),
            session_id: session.id,
        },
        [
            ExecutorOutcome::Failed {
                message: "failure one".into(),
            },
            ExecutorOutcome::Failed {
                message: "failure two".into(),
            },
            ExecutorOutcome::Failed {
                message: "failure three".into(),
            },
            ExecutorOutcome::Succeeded {
                evidence: vec!["must not run".into()],
            },
        ],
    ));
    let orchestrator = Orchestrator::new(store.clone(), planner, executor, scenes, skills);

    orchestrator.plan_once(&task.id, 200).await.unwrap();
    orchestrator.execute_next(&task.id, 300).await.unwrap();
    orchestrator.plan_once(&task.id, 400).await.unwrap();
    orchestrator.execute_next(&task.id, 500).await.unwrap();
    orchestrator.plan_once(&task.id, 600).await.unwrap();
    orchestrator.execute_next(&task.id, 700).await.unwrap();

    assert_eq!(
        store.get_task(&task.id).unwrap().unwrap().task.status,
        TaskStatus::Paused
    );
    assert!(matches!(
        orchestrator.execute_next(&task.id, 800).await,
        Err(codetwo_core::OrchestratorError::TaskPaused { .. })
    ));
}
