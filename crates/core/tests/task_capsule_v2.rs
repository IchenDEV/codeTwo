use codetwo_core::{
    compile_task_capsule, session_compatibility_key, AgentSkillContribution, AgentSkillOrigin,
    AgentSkillResolver, CapabilityManifestEntry, ProviderConfiguration, ProviderId, ResultContract,
    SceneCatalogV2, SceneOrigin, SceneRef, Skill, SkillPayload, StablePromptLayerKind, Task,
    TaskBudget, TaskCapsuleContext, TaskId, TaskStatus, WorkItem, WorkItemId, WorkItemStatus,
};

fn resolver() -> AgentSkillResolver {
    AgentSkillResolver::new([
        AgentSkillContribution {
            skill: Skill {
                id: "review".into(),
                name: "Review".into(),
                description: "Review evidence".into(),
                icon: None,
                source: None,
                payload: SkillPayload::AgentSkill {
                    skill_ref: "review".into(),
                    inline_text: Some("Review the current evidence.".into()),
                },
            },
            origin: AgentSkillOrigin::Preinstalled,
        },
        AgentSkillContribution {
            skill: Skill {
                id: "diagnose".into(),
                name: "Diagnose".into(),
                description: "Diagnose failures".into(),
                icon: None,
                source: None,
                payload: SkillPayload::AgentSkill {
                    skill_ref: "diagnose".into(),
                    inline_text: Some("Find the causal failure.".into()),
                },
            },
            origin: AgentSkillOrigin::Preinstalled,
        },
    ])
}

fn task() -> Task {
    Task {
        id: TaskId::new("task-cache"),
        status: TaskStatus::Active,
        result_contract: ResultContract {
            goal: "Ship a verified change".into(),
            required_deliverables: vec!["Change".into()],
            completion_conditions: vec!["tests pass".into()],
            boundaries: vec!["Do not deploy".into()],
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

fn work_item(skills: &AgentSkillResolver) -> WorkItem {
    WorkItem {
        id: WorkItemId::new("work-1"),
        objective: "Implement the change".into(),
        result_contract_conditions: vec!["tests pass".into()],
        scenes: vec![
            SceneRef {
                id: "official:testing-quality".into(),
                version: "2.0.0".into(),
                source: SceneOrigin::Official,
            },
            SceneRef {
                id: "official:software-development".into(),
                version: "2.0.0".into(),
                source: SceneOrigin::Official,
            },
        ],
        agent_skills: vec![
            skills.resolve("review").unwrap().reference.clone(),
            skills.resolve("diagnose").unwrap().reference.clone(),
        ],
        input_artifacts: vec!["source-snapshot".into()],
        expected_outputs: vec!["Change".into()],
        completion_evidence: Vec::new(),
        status: WorkItemStatus::Ready,
        blocker: None,
        assigned_session_id: None,
        reason: "Current evidence requires implementation".into(),
    }
}

fn context(capabilities: Vec<CapabilityManifestEntry>) -> TaskCapsuleContext {
    TaskCapsuleContext {
        invariant_rules: "Follow Core risk gates. Never change provider configuration.".into(),
        project_snapshot: "project=/work/codeTwo\nrevision=abc123".into(),
        capability_manifest: capabilities,
    }
}

fn capabilities() -> Vec<CapabilityManifestEntry> {
    vec![
        CapabilityManifestEntry {
            namespace: "workspace".into(),
            adapter_id: "builtin:workspace".into(),
            content_identity: "workspace-v1".into(),
        },
        CapabilityManifestEntry {
            namespace: "source-control".into(),
            adapter_id: "builtin:git".into(),
            content_identity: "git-v1".into(),
        },
        CapabilityManifestEntry {
            namespace: "calendar".into(),
            adapter_id: "plugin:calendar".into(),
            content_identity: "calendar-v1".into(),
        },
    ]
}

#[test]
fn capsule_is_byte_stable_and_only_work_item_content_changes_the_suffix() {
    let scenes = SceneCatalogV2::builtin();
    let skills = resolver();
    let task = task();
    let work = work_item(&skills);
    let first =
        compile_task_capsule(&task, &work, &context(capabilities()), &scenes, &skills).unwrap();

    let mut reordered_work = work.clone();
    reordered_work.scenes.reverse();
    reordered_work.agent_skills.reverse();
    let mut reordered_capabilities = capabilities();
    reordered_capabilities.reverse();
    let reordered = compile_task_capsule(
        &task,
        &reordered_work,
        &context(reordered_capabilities),
        &scenes,
        &skills,
    )
    .unwrap();

    assert_eq!(first, reordered);
    assert_eq!(
        first
            .stable_layers
            .iter()
            .map(|layer| layer.kind)
            .collect::<Vec<_>>(),
        [
            StablePromptLayerKind::InvariantRules,
            StablePromptLayerKind::ProjectSnapshot,
            StablePromptLayerKind::CapabilityManifest,
            StablePromptLayerKind::TaskCapsule,
            StablePromptLayerKind::Scenes,
            StablePromptLayerKind::AgentSkills,
        ]
    );
    assert!(first
        .stable_layers
        .iter()
        .all(|layer| layer.content_identity.len() == 64));

    let mut changed_work = work;
    changed_work.objective = "Implement the corrected change".into();
    let changed = compile_task_capsule(
        &task,
        &changed_work,
        &context(capabilities()),
        &scenes,
        &skills,
    )
    .unwrap();

    assert_eq!(first.stable_prefix, changed.stable_prefix);
    assert_eq!(first.stable_prefix_identity, changed.stable_prefix_identity);
    assert_ne!(first.volatile_suffix, changed.volatile_suffix);
    assert_ne!(first.full_prompt, changed.full_prompt);
}

#[test]
fn compatibility_key_reuses_only_the_same_stable_execution_boundary() {
    let scenes = SceneCatalogV2::builtin();
    let skills = resolver();
    let task = task();
    let first_work = work_item(&skills);
    let first_capsule = compile_task_capsule(
        &task,
        &first_work,
        &context(capabilities()),
        &scenes,
        &skills,
    )
    .unwrap();
    let first = session_compatibility_key(&task, &first_work, &first_capsule, "/work/codeTwo");

    let mut next_work = first_work.clone();
    next_work.id = WorkItemId::new("work-2");
    next_work.objective = "Verify the change".into();
    let next_capsule = compile_task_capsule(
        &task,
        &next_work,
        &context(capabilities()),
        &scenes,
        &skills,
    )
    .unwrap();
    let compatible = session_compatibility_key(&task, &next_work, &next_capsule, "/work/codeTwo");
    assert_eq!(
        first, compatible,
        "compatible serial work should reuse a Session"
    );

    let mut irrelevant_added = capabilities();
    irrelevant_added.push(CapabilityManifestEntry {
        namespace: "mail".into(),
        adapter_id: "plugin:mail".into(),
        content_identity: "mail-v1".into(),
    });
    let irrelevant_capsule = compile_task_capsule(
        &task,
        &next_work,
        &context(irrelevant_added),
        &scenes,
        &skills,
    )
    .unwrap();
    assert_eq!(
        first,
        session_compatibility_key(&task, &next_work, &irrelevant_capsule, "/work/codeTwo"),
        "an unrelated installed adapter must not destroy cache reuse"
    );

    let mut changed_provider = task.clone();
    changed_provider.provider_configuration.model = Some("different-model".into());
    assert_ne!(
        first,
        session_compatibility_key(
            &changed_provider,
            &next_work,
            &next_capsule,
            "/work/codeTwo"
        )
    );

    let mut changed_capabilities = capabilities();
    changed_capabilities[0].content_identity = "workspace-v2".into();
    let changed_capability_capsule = compile_task_capsule(
        &task,
        &next_work,
        &context(changed_capabilities),
        &scenes,
        &skills,
    )
    .unwrap();
    assert_ne!(
        first,
        session_compatibility_key(
            &task,
            &next_work,
            &changed_capability_capsule,
            "/work/codeTwo"
        )
    );
    assert_ne!(
        first,
        session_compatibility_key(&task, &next_work, &next_capsule, "/work/other")
    );
}
