use codetwo_core::{
    AgentSkillContribution, AgentSkillOrigin, AgentSkillResolver, Skill, SkillPayload,
};

fn skill(id: &str, payload: SkillPayload) -> Skill {
    Skill {
        id: id.into(),
        name: id.into(),
        description: String::new(),
        icon: None,
        source: None,
        payload,
    }
}

#[test]
fn scenes_v2_resolves_only_authentic_agent_skills() {
    let resolver = AgentSkillResolver::new([
        AgentSkillContribution {
            skill: skill(
                "review",
                SkillPayload::AgentSkill {
                    skill_ref: "review".into(),
                    inline_text: Some("Inspect the change and report evidence.".into()),
                },
            ),
            origin: AgentSkillOrigin::Preinstalled,
        },
        AgentSkillContribution {
            skill: skill(
                "review-fragment",
                SkillPayload::Fragment {
                    text: "Act as a reviewer.".into(),
                },
            ),
            origin: AgentSkillOrigin::Preinstalled,
        },
    ]);

    let resolved = resolver.resolve("review").unwrap();
    assert_eq!(resolved.reference.id, "review");
    assert_eq!(resolved.reference.source, AgentSkillOrigin::Preinstalled);
    assert!(resolver.resolve("review-fragment").is_none());
    assert_eq!(resolver.rejected_ids(), ["review-fragment"]);
}
