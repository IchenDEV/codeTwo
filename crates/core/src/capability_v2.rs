//! Capability readiness and plugin-install proposals for Scenes 2.0.
//!
//! Scene namespaces describe needs, installed adapters describe current readiness, and Core
//! reports the gap. A plugin candidate can become a user-visible proposal, but this module has no
//! installation operation and never mutates the plugin manager.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::scene_v2::{SceneCatalogV2, SceneV2Origin};
use crate::task::{SceneOrigin, TaskId, WorkItem, WorkItemId};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConcreteEffect {
    Read,
    LocalModify,
    ExternalModify,
    Send,
    PublishDeploy,
    Delete,
    Payment,
    AccessAdministration,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum CapabilityAdapterState {
    Ready,
    Degraded { reason: String },
    Blocked { reason: String },
    Unknown { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapabilityAdapter {
    pub adapter_id: String,
    pub namespace: String,
    pub version: String,
    pub content_identity: String,
    pub state: CapabilityAdapterState,
    pub effects: Vec<ConcreteEffect>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityReadinessStatus {
    Ready,
    Degraded,
    Blocked,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapabilityReadiness {
    pub namespace: String,
    pub status: CapabilityReadinessStatus,
    pub selected_adapter: Option<String>,
    pub installed_adapters: Vec<String>,
    pub effects: Vec<ConcreteEffect>,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginInstallCandidate {
    pub plugin_id: String,
    pub publisher: String,
    pub version: String,
    pub capabilities: Vec<String>,
    pub effects: Vec<ConcreteEffect>,
    pub account_requirements: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PluginInstallProposal {
    pub proposal_id: String,
    pub task_id: TaskId,
    pub work_item_id: WorkItemId,
    pub plugin_id: String,
    pub publisher: String,
    pub version: String,
    pub blocked_capabilities: Vec<String>,
    pub effects: Vec<ConcreteEffect>,
    pub account_requirements: Vec<String>,
    pub requires_user_installation: bool,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CapabilityResolutionError {
    #[error("unknown Scene `{scene_id}`")]
    UnknownScene { scene_id: String },
    #[error("Scene reference does not match installed identity `{scene_id}`")]
    SceneIdentityMismatch { scene_id: String },
}

pub fn resolve_work_item_capabilities(
    work_item: &WorkItem,
    scenes: &SceneCatalogV2,
    adapters: &[CapabilityAdapter],
) -> Result<Vec<CapabilityReadiness>, CapabilityResolutionError> {
    let mut required = BTreeSet::new();
    for reference in &work_item.scenes {
        let resolved = scenes.resolve(&reference.id).ok_or_else(|| {
            CapabilityResolutionError::UnknownScene {
                scene_id: reference.id.clone(),
            }
        })?;
        if resolved.definition.version != reference.version
            || !origins_match(&reference.source, &resolved.definition.provenance)
        {
            return Err(CapabilityResolutionError::SceneIdentityMismatch {
                scene_id: reference.id.clone(),
            });
        }
        required.extend(resolved.definition.capability_namespaces.iter().cloned());
    }

    let mut by_namespace: BTreeMap<&str, Vec<&CapabilityAdapter>> = BTreeMap::new();
    for adapter in adapters {
        by_namespace
            .entry(adapter.namespace.as_str())
            .or_default()
            .push(adapter);
    }
    for candidates in by_namespace.values_mut() {
        candidates.sort_by(|left, right| {
            (&left.adapter_id, &left.version, &left.content_identity).cmp(&(
                &right.adapter_id,
                &right.version,
                &right.content_identity,
            ))
        });
    }

    Ok(required
        .into_iter()
        .map(|namespace| resolve_namespace(&namespace, by_namespace.get(namespace.as_str())))
        .collect())
}

pub fn propose_plugin_installations(
    task_id: &TaskId,
    work_item: &WorkItem,
    readiness: &[CapabilityReadiness],
    candidates: &[PluginInstallCandidate],
) -> Vec<PluginInstallProposal> {
    let missing: BTreeSet<_> = readiness
        .iter()
        .filter(|item| {
            item.status == CapabilityReadinessStatus::Blocked && item.installed_adapters.is_empty()
        })
        .map(|item| item.namespace.as_str())
        .collect();
    let mut candidates: Vec<_> = candidates.iter().collect();
    candidates.sort_by(|left, right| {
        (&left.plugin_id, &left.version).cmp(&(&right.plugin_id, &right.version))
    });
    candidates
        .into_iter()
        .filter_map(|candidate| {
            let mut blocked_capabilities: Vec<_> = candidate
                .capabilities
                .iter()
                .filter(|namespace| missing.contains(namespace.as_str()))
                .cloned()
                .collect();
            blocked_capabilities.sort();
            blocked_capabilities.dedup();
            if blocked_capabilities.is_empty() {
                return None;
            }
            let mut effects = candidate.effects.clone();
            effects.sort();
            effects.dedup();
            let mut account_requirements = candidate.account_requirements.clone();
            account_requirements.sort();
            account_requirements.dedup();
            let identity = serde_json::to_vec(&(
                task_id,
                &work_item.id,
                &candidate.plugin_id,
                &candidate.version,
                &blocked_capabilities,
            ))
            .expect("plugin proposal identity serialization cannot fail");
            Some(PluginInstallProposal {
                proposal_id: blake3::hash(&identity).to_hex().to_string(),
                task_id: task_id.clone(),
                work_item_id: work_item.id.clone(),
                plugin_id: candidate.plugin_id.clone(),
                publisher: candidate.publisher.clone(),
                version: candidate.version.clone(),
                blocked_capabilities,
                effects,
                account_requirements,
                requires_user_installation: true,
            })
        })
        .collect()
}

fn resolve_namespace(
    namespace: &str,
    candidates: Option<&Vec<&CapabilityAdapter>>,
) -> CapabilityReadiness {
    let candidates = candidates.map(Vec::as_slice).unwrap_or_default();
    let installed_adapters = candidates
        .iter()
        .map(|adapter| adapter.adapter_id.clone())
        .collect();
    if let Some(adapter) = candidates
        .iter()
        .find(|adapter| adapter.state == CapabilityAdapterState::Ready)
    {
        return readiness(
            namespace,
            CapabilityReadinessStatus::Ready,
            Some(adapter),
            installed_adapters,
            "installed adapter is ready".into(),
        );
    }
    if let Some(adapter) = candidates
        .iter()
        .find(|adapter| matches!(adapter.state, CapabilityAdapterState::Degraded { .. }))
    {
        let CapabilityAdapterState::Degraded { reason } = &adapter.state else {
            unreachable!()
        };
        return readiness(
            namespace,
            CapabilityReadinessStatus::Degraded,
            Some(adapter),
            installed_adapters,
            reason.clone(),
        );
    }
    if let Some(adapter) = candidates
        .iter()
        .find(|adapter| matches!(adapter.state, CapabilityAdapterState::Unknown { .. }))
    {
        let CapabilityAdapterState::Unknown { reason } = &adapter.state else {
            unreachable!()
        };
        return readiness(
            namespace,
            CapabilityReadinessStatus::Unknown,
            Some(adapter),
            installed_adapters,
            reason.clone(),
        );
    }
    if let Some(adapter) = candidates.first() {
        let reason = match &adapter.state {
            CapabilityAdapterState::Blocked { reason } => reason.clone(),
            _ => "installed adapters are blocked".into(),
        };
        return readiness(
            namespace,
            CapabilityReadinessStatus::Blocked,
            Some(adapter),
            installed_adapters,
            reason,
        );
    }
    CapabilityReadiness {
        namespace: namespace.to_string(),
        status: CapabilityReadinessStatus::Blocked,
        selected_adapter: None,
        installed_adapters,
        effects: Vec::new(),
        reason: "no installed adapter provides this capability".into(),
    }
}

fn readiness(
    namespace: &str,
    status: CapabilityReadinessStatus,
    selected: Option<&&CapabilityAdapter>,
    installed_adapters: Vec<String>,
    reason: String,
) -> CapabilityReadiness {
    let selected = selected.copied();
    CapabilityReadiness {
        namespace: namespace.to_string(),
        status,
        selected_adapter: selected.map(|adapter| adapter.adapter_id.clone()),
        installed_adapters,
        effects: selected
            .map(|adapter| adapter.effects.clone())
            .unwrap_or_default(),
        reason,
    }
}

fn origins_match(reference: &SceneOrigin, definition: &SceneV2Origin) -> bool {
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
