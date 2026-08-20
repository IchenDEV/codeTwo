//! Authentic Agent Skill resolution for Scenes 2.0.
//!
//! The legacy skill library intentionally contains prompt fragments, macros, MCP definitions,
//! and subagent definitions alongside provider-native Agent Skills. Scenes 2.0 must not blur that
//! boundary, so this resolver accepts only [`SkillPayload::AgentSkill`] contributions with an
//! explicit 2.0 provenance.

use std::collections::BTreeMap;

use crate::skill::{Skill, SkillPayload};
use crate::task::{AgentSkillOrigin, AgentSkillRef};

#[derive(Debug, Clone)]
pub struct AgentSkillContribution {
    pub skill: Skill,
    pub origin: AgentSkillOrigin,
}

#[derive(Debug, Clone)]
pub struct ResolvedAgentSkill {
    pub reference: AgentSkillRef,
    pub skill: Skill,
}

#[derive(Debug, Clone, Default)]
pub struct AgentSkillResolver {
    by_id: BTreeMap<String, ResolvedAgentSkill>,
    rejected_ids: Vec<String>,
}

impl AgentSkillResolver {
    pub fn new(contributions: impl IntoIterator<Item = AgentSkillContribution>) -> Self {
        let mut resolver = Self::default();
        for contribution in contributions {
            let id = contribution.skill.id.clone();
            if !matches!(contribution.skill.payload, SkillPayload::AgentSkill { .. })
                || resolver.by_id.contains_key(&id)
            {
                resolver.rejected_ids.push(id);
                continue;
            }
            let content = serde_json::to_vec(&contribution.skill)
                .expect("serializing an in-memory Agent Skill cannot fail");
            let reference = AgentSkillRef {
                id: id.clone(),
                version: None,
                content_identity: blake3::hash(&content).to_hex().to_string(),
                source: contribution.origin,
            };
            resolver.by_id.insert(
                id,
                ResolvedAgentSkill {
                    reference,
                    skill: contribution.skill,
                },
            );
        }
        resolver.rejected_ids.sort();
        resolver.rejected_ids.dedup();
        resolver
    }

    pub fn resolve(&self, id: &str) -> Option<&ResolvedAgentSkill> {
        self.by_id.get(id)
    }

    pub fn all(&self) -> impl Iterator<Item = &ResolvedAgentSkill> {
        self.by_id.values()
    }

    pub fn rejected_ids(&self) -> &[String] {
        &self.rejected_ids
    }
}
