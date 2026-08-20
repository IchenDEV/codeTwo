//! Deterministic prompt compilation and Session compatibility for Scenes 2.0.
//!
//! Stable Task context is emitted before volatile Work Item context. Every unordered input is
//! canonicalized before serialization so compatible serial work can retain the provider's prompt
//! prefix. CodeTwo's structural identity is not a claim that a provider actually served a cache
//! hit; provider cache receipts are recorded separately.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::agent_skill_v2::AgentSkillResolver;
use crate::scene_v2::{SceneCatalogV2, SceneV2Origin};
use crate::task::{
    AgentSkillRef, ProviderConfiguration, ResultContract, SceneOrigin, SceneRef, Task, WorkItem,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StablePromptLayerKind {
    InvariantRules,
    ProjectSnapshot,
    CapabilityManifest,
    TaskCapsule,
    Scenes,
    AgentSkills,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapabilityManifestEntry {
    pub namespace: String,
    pub adapter_id: String,
    pub content_identity: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskCapsuleContext {
    pub invariant_rules: String,
    pub project_snapshot: String,
    pub capability_manifest: Vec<CapabilityManifestEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StablePromptLayer {
    pub kind: StablePromptLayerKind,
    pub content_identity: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompiledTaskCapsule {
    pub stable_layers: Vec<StablePromptLayer>,
    pub stable_prefix: String,
    pub stable_prefix_identity: String,
    pub capability_manifest_identity: String,
    pub volatile_suffix: String,
    pub volatile_suffix_identity: String,
    pub full_prompt: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SessionCompatibilityKey(String);

impl SessionCompatibilityKey {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum TaskCapsuleError {
    #[error("unknown Scene `{scene_id}`")]
    UnknownScene { scene_id: String },
    #[error("Scene reference does not match installed identity `{scene_id}`")]
    SceneIdentityMismatch { scene_id: String },
    #[error("unknown Agent Skill `{skill_id}`")]
    UnknownAgentSkill { skill_id: String },
    #[error("Agent Skill reference does not match installed identity `{skill_id}`")]
    AgentSkillIdentityMismatch { skill_id: String },
}

#[derive(Serialize)]
struct CapabilityLayer<'a> {
    required_namespaces: Vec<&'a str>,
    adapters: Vec<&'a CapabilityManifestEntry>,
}

#[derive(Serialize)]
struct TaskLayer<'a> {
    task_id: &'a str,
    result_contract: CanonicalResultContract<'a>,
}

#[derive(Serialize)]
struct CanonicalResultContract<'a> {
    goal: &'a str,
    required_deliverables: Vec<&'a str>,
    completion_conditions: Vec<&'a str>,
    boundaries: Vec<&'a str>,
    known_risks: Vec<&'a str>,
    unresolved_facts: Vec<&'a str>,
}

#[derive(Serialize)]
struct AgentSkillLayer<'a> {
    reference: &'a AgentSkillRef,
    skill: &'a crate::skill::Skill,
}

#[derive(Serialize)]
struct CompatibilityPayload<'a> {
    task_id: &'a str,
    provider_configuration: &'a ProviderConfiguration,
    scenes: Vec<&'a SceneRef>,
    agent_skills: Vec<&'a AgentSkillRef>,
    capability_manifest_identity: &'a str,
    workspace_scope: &'a str,
    stable_prompt_identity: &'a str,
}

pub fn compile_task_capsule(
    task: &Task,
    work_item: &WorkItem,
    context: &TaskCapsuleContext,
    scenes: &SceneCatalogV2,
    skills: &AgentSkillResolver,
) -> Result<CompiledTaskCapsule, TaskCapsuleError> {
    let mut scene_refs: Vec<_> = work_item.scenes.iter().collect();
    scene_refs.sort_by(|left, right| scene_ref_key(left).cmp(&scene_ref_key(right)));
    let mut definitions = Vec::with_capacity(scene_refs.len());
    let mut required_namespaces = BTreeSet::new();
    for reference in &scene_refs {
        let resolved =
            scenes
                .resolve(&reference.id)
                .ok_or_else(|| TaskCapsuleError::UnknownScene {
                    scene_id: reference.id.clone(),
                })?;
        if resolved.definition.version != reference.version
            || !scene_origins_match(&reference.source, &resolved.definition.provenance)
        {
            return Err(TaskCapsuleError::SceneIdentityMismatch {
                scene_id: reference.id.clone(),
            });
        }
        let mut definition = resolved.definition.clone();
        definition.agent_skill_selectors.sort();
        definition.capability_namespaces.sort();
        required_namespaces.extend(definition.capability_namespaces.iter().cloned());
        definitions.push(definition);
    }
    definitions.sort_by(|left, right| (&left.id, &left.version).cmp(&(&right.id, &right.version)));

    let mut skill_refs: Vec<_> = work_item.agent_skills.iter().collect();
    skill_refs.sort_by(|left, right| agent_skill_ref_key(left).cmp(&agent_skill_ref_key(right)));
    let mut resolved_skills = Vec::with_capacity(skill_refs.len());
    for reference in &skill_refs {
        let resolved =
            skills
                .resolve(&reference.id)
                .ok_or_else(|| TaskCapsuleError::UnknownAgentSkill {
                    skill_id: reference.id.clone(),
                })?;
        if resolved.reference != **reference {
            return Err(TaskCapsuleError::AgentSkillIdentityMismatch {
                skill_id: reference.id.clone(),
            });
        }
        resolved_skills.push(AgentSkillLayer {
            reference,
            skill: &resolved.skill,
        });
    }

    let mut capability_adapters: Vec<_> = context
        .capability_manifest
        .iter()
        .filter(|entry| required_namespaces.contains(entry.namespace.as_str()))
        .collect();
    capability_adapters.sort_by(|left, right| {
        (&left.namespace, &left.adapter_id, &left.content_identity).cmp(&(
            &right.namespace,
            &right.adapter_id,
            &right.content_identity,
        ))
    });
    let capability_layer = CapabilityLayer {
        required_namespaces: required_namespaces.iter().map(String::as_str).collect(),
        adapters: capability_adapters,
    };
    let task_layer = TaskLayer {
        task_id: task.id.as_str(),
        result_contract: canonical_contract(&task.result_contract),
    };

    let stable_layers = vec![
        prompt_layer(
            StablePromptLayerKind::InvariantRules,
            &context.invariant_rules,
        ),
        prompt_layer(
            StablePromptLayerKind::ProjectSnapshot,
            &context.project_snapshot,
        ),
        prompt_layer(StablePromptLayerKind::CapabilityManifest, &capability_layer),
        prompt_layer(StablePromptLayerKind::TaskCapsule, &task_layer),
        prompt_layer(StablePromptLayerKind::Scenes, &definitions),
        prompt_layer(StablePromptLayerKind::AgentSkills, &resolved_skills),
    ];
    let capability_manifest_identity = stable_layers[2].content_identity.clone();
    let stable_prefix = stable_layers
        .iter()
        .map(render_stable_layer)
        .collect::<String>();
    let stable_prefix_identity = digest(stable_prefix.as_bytes());
    let volatile_suffix = render_volatile_work_item(work_item);
    let volatile_suffix_identity = digest(volatile_suffix.as_bytes());
    let full_prompt = format!("{stable_prefix}{volatile_suffix}");
    Ok(CompiledTaskCapsule {
        stable_layers,
        stable_prefix,
        stable_prefix_identity,
        capability_manifest_identity,
        volatile_suffix,
        volatile_suffix_identity,
        full_prompt,
    })
}

pub fn session_compatibility_key(
    task: &Task,
    work_item: &WorkItem,
    capsule: &CompiledTaskCapsule,
    workspace_scope: &str,
) -> SessionCompatibilityKey {
    let mut scenes: Vec<_> = work_item.scenes.iter().collect();
    scenes.sort_by(|left, right| scene_ref_key(left).cmp(&scene_ref_key(right)));
    let mut agent_skills: Vec<_> = work_item.agent_skills.iter().collect();
    agent_skills.sort_by(|left, right| agent_skill_ref_key(left).cmp(&agent_skill_ref_key(right)));
    let payload = CompatibilityPayload {
        task_id: task.id.as_str(),
        provider_configuration: &task.provider_configuration,
        scenes,
        agent_skills,
        capability_manifest_identity: &capsule.capability_manifest_identity,
        workspace_scope,
        stable_prompt_identity: &capsule.stable_prefix_identity,
    };
    let serialized = serde_json::to_vec(&payload)
        .expect("Session compatibility payload serialization cannot fail");
    SessionCompatibilityKey(digest(&serialized))
}

fn prompt_layer(kind: StablePromptLayerKind, payload: &impl Serialize) -> StablePromptLayer {
    let content = serde_json::to_string(payload).expect("prompt layer serialization cannot fail");
    StablePromptLayer {
        kind,
        content_identity: digest(content.as_bytes()),
        content,
    }
}

fn render_stable_layer(layer: &StablePromptLayer) -> String {
    let kind = serde_json::to_string(&layer.kind).expect("layer kind serialization cannot fail");
    format!(
        "<codetwo_stable_layer kind={kind} identity=\"{}\">\n{}\n</codetwo_stable_layer>\n",
        layer.content_identity, layer.content
    )
}

fn render_volatile_work_item(work_item: &WorkItem) -> String {
    let mut canonical = work_item.clone();
    canonical
        .scenes
        .sort_by(|left, right| scene_ref_key(left).cmp(&scene_ref_key(right)));
    canonical
        .agent_skills
        .sort_by(|left, right| agent_skill_ref_key(left).cmp(&agent_skill_ref_key(right)));
    canonical.result_contract_conditions.sort();
    canonical.input_artifacts.sort();
    canonical.expected_outputs.sort();
    canonical.completion_evidence.sort();
    let content = serde_json::to_string(&canonical).expect("Work Item serialization cannot fail");
    format!("<codetwo_volatile_work_item>\n{content}\n</codetwo_volatile_work_item>\n")
}

fn canonical_contract(contract: &ResultContract) -> CanonicalResultContract<'_> {
    CanonicalResultContract {
        goal: &contract.goal,
        required_deliverables: sorted_strings(&contract.required_deliverables),
        completion_conditions: sorted_strings(&contract.completion_conditions),
        boundaries: sorted_strings(&contract.boundaries),
        known_risks: sorted_strings(&contract.known_risks),
        unresolved_facts: sorted_strings(&contract.unresolved_facts),
    }
}

fn sorted_strings(values: &[String]) -> Vec<&str> {
    let mut values: Vec<_> = values.iter().map(String::as_str).collect();
    values.sort();
    values.dedup();
    values
}

fn scene_ref_key(reference: &SceneRef) -> (String, &str, &str) {
    (
        serde_json::to_string(&reference.source).expect("Scene origin serialization cannot fail"),
        reference.id.as_str(),
        reference.version.as_str(),
    )
}

fn agent_skill_ref_key(reference: &AgentSkillRef) -> (String, &str, Option<&str>, &str) {
    (
        serde_json::to_string(&reference.source)
            .expect("Agent Skill origin serialization cannot fail"),
        reference.id.as_str(),
        reference.version.as_deref(),
        reference.content_identity.as_str(),
    )
}

fn scene_origins_match(reference: &SceneOrigin, definition: &SceneV2Origin) -> bool {
    match (reference, definition) {
        (SceneOrigin::Official, SceneV2Origin::Official)
        | (SceneOrigin::Personal, SceneV2Origin::Personal)
        | (SceneOrigin::Project, SceneV2Origin::Project) => true,
        (
            SceneOrigin::Plugin {
                plugin_id: expected,
            },
            SceneV2Origin::Plugin { plugin_id, .. },
        ) => expected == plugin_id,
        _ => false,
    }
}

fn digest(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}
