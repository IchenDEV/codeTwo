use codetwo_core::{
    apply_orchestration_patch, AgentSkillContribution, AgentSkillOrigin, AgentSkillRef,
    AgentSkillResolver, GraphOperation, OrchestrationPatch, OrchestrationValidationError,
    SceneCatalogV2, SceneOrigin, SceneRef, Skill, SkillPayload, TaskGraph, WorkItem, WorkItemId,
    WorkItemStatus,
};

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
    WorkItem {
        id: WorkItemId::new("work-1"),
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
