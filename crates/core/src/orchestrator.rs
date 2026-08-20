//! Scenes 2.0 dynamic orchestration boundary.
//!
//! Planner output is untrusted proposal data. This module is the pure Core boundary that checks
//! a bounded patch against the current revision and installed Scene/Agent Skill identities before
//! producing the next Task Graph. It contains no reusable workflow or fixed stage definition.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::agent_skill_v2::AgentSkillResolver;
use crate::scene_v2::{SceneCatalogV2, SceneV2Origin};
use crate::task::{SceneOrigin, TaskGraph, WorkItem, WorkItemEdge, WorkItemId, WorkItemStatus};

const MAX_PATCH_OPERATIONS: usize = 64;
const MAX_REASON_CHARS: usize = 2_048;
const MAX_OBJECTIVE_CHARS: usize = 4_096;
const MAX_WORK_ITEMS: usize = 256;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OrchestrationPatch {
    pub expected_revision: u64,
    pub reason: String,
    pub operations: Vec<GraphOperation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum GraphOperation {
    Add {
        work_item: WorkItem,
        depends_on: Vec<WorkItemId>,
    },
    Update {
        work_item: WorkItem,
    },
    Remove {
        work_item_id: WorkItemId,
    },
    Retry {
        work_item_id: WorkItemId,
        reason: String,
    },
    Cancel {
        work_item_id: WorkItemId,
        reason: String,
    },
    Complete {
        work_item_id: WorkItemId,
        evidence: Vec<String>,
    },
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum OrchestrationValidationError {
    #[error("Task Graph revision conflict: expected {expected}, found {actual}")]
    RevisionConflict { expected: u64, actual: u64 },
    #[error("patch reason must contain between 1 and {MAX_REASON_CHARS} characters")]
    InvalidReason,
    #[error("patch has too many operations: {actual}; maximum is {MAX_PATCH_OPERATIONS}")]
    TooManyOperations { actual: usize },
    #[error("Task Graph has too many Work Items: {actual}; maximum is {MAX_WORK_ITEMS}")]
    TooManyWorkItems { actual: usize },
    #[error("duplicate Work Item `{work_item_id}`")]
    DuplicateWorkItem { work_item_id: String },
    #[error("unknown Work Item `{work_item_id}`")]
    UnknownWorkItem { work_item_id: String },
    #[error("Work Item `{work_item_id}` is running and cannot be rewritten by a planner patch")]
    RunningWorkItem { work_item_id: String },
    #[error("Work Item `{work_item_id}` has an invalid objective or reason")]
    InvalidWorkItemText { work_item_id: String },
    #[error("unknown Scene `{scene_id}`")]
    UnknownScene { scene_id: String },
    #[error("Scene reference does not match installed identity `{scene_id}`")]
    SceneIdentityMismatch { scene_id: String },
    #[error("unknown or non-Agent Skill `{skill_id}`")]
    UnknownAgentSkill { skill_id: String },
    #[error("Agent Skill reference does not match installed identity `{skill_id}`")]
    AgentSkillIdentityMismatch { skill_id: String },
    #[error("invalid dependency `{prerequisite}` -> `{dependent}`")]
    InvalidDependency {
        prerequisite: String,
        dependent: String,
    },
    #[error("Task Graph contains a dependency cycle")]
    DependencyCycle,
    #[error("Task Graph would contain {actual} running Executor Work Items")]
    MultipleRunningExecutors { actual: usize },
}

pub fn apply_orchestration_patch(
    current: &TaskGraph,
    patch: &OrchestrationPatch,
    scenes: &SceneCatalogV2,
    skills: &AgentSkillResolver,
) -> Result<TaskGraph, OrchestrationValidationError> {
    if patch.expected_revision != current.revision {
        return Err(OrchestrationValidationError::RevisionConflict {
            expected: patch.expected_revision,
            actual: current.revision,
        });
    }
    validate_text(&patch.reason, MAX_REASON_CHARS)
        .map_err(|_| OrchestrationValidationError::InvalidReason)?;
    if patch.operations.len() > MAX_PATCH_OPERATIONS {
        return Err(OrchestrationValidationError::TooManyOperations {
            actual: patch.operations.len(),
        });
    }

    let mut next = current.clone();
    for operation in &patch.operations {
        match operation {
            GraphOperation::Add {
                work_item,
                depends_on,
            } => {
                if next
                    .work_items
                    .iter()
                    .any(|existing| existing.id == work_item.id)
                {
                    return Err(OrchestrationValidationError::DuplicateWorkItem {
                        work_item_id: work_item.id.as_str().to_string(),
                    });
                }
                validate_planner_work_item(work_item, scenes, skills)?;
                for prerequisite in depends_on {
                    next.edges.push(WorkItemEdge {
                        prerequisite: prerequisite.clone(),
                        dependent: work_item.id.clone(),
                    });
                }
                next.work_items.push(work_item.clone());
            }
            GraphOperation::Update { work_item } => {
                let existing = find_work_item_mut(&mut next, &work_item.id)?;
                reject_running(existing)?;
                validate_planner_work_item(work_item, scenes, skills)?;
                *existing = work_item.clone();
            }
            GraphOperation::Remove { work_item_id } => {
                let existing = find_work_item(&next, work_item_id)?;
                reject_running(existing)?;
                next.work_items.retain(|item| item.id != *work_item_id);
                next.edges.retain(|edge| {
                    edge.prerequisite != *work_item_id && edge.dependent != *work_item_id
                });
            }
            GraphOperation::Retry {
                work_item_id,
                reason,
            } => {
                validate_text(reason, MAX_REASON_CHARS)
                    .map_err(|_| OrchestrationValidationError::InvalidReason)?;
                let work_item = find_work_item_mut(&mut next, work_item_id)?;
                reject_running(work_item)?;
                work_item.status = WorkItemStatus::Ready;
                work_item.blocker = None;
                work_item.completion_evidence.clear();
                work_item.reason = reason.clone();
            }
            GraphOperation::Cancel {
                work_item_id,
                reason,
            } => {
                validate_text(reason, MAX_REASON_CHARS)
                    .map_err(|_| OrchestrationValidationError::InvalidReason)?;
                let work_item = find_work_item_mut(&mut next, work_item_id)?;
                reject_running(work_item)?;
                work_item.status = WorkItemStatus::Cancelled;
                work_item.reason = reason.clone();
            }
            GraphOperation::Complete {
                work_item_id,
                evidence,
            } => {
                let work_item = find_work_item_mut(&mut next, work_item_id)?;
                reject_running(work_item)?;
                work_item.status = WorkItemStatus::Succeeded;
                work_item.completion_evidence = evidence.clone();
            }
        }
    }
    validate_graph(&next, scenes, skills)?;
    next.revision =
        current
            .revision
            .checked_add(1)
            .ok_or(OrchestrationValidationError::RevisionConflict {
                expected: current.revision,
                actual: current.revision,
            })?;
    Ok(next)
}

fn validate_graph(
    graph: &TaskGraph,
    scenes: &SceneCatalogV2,
    skills: &AgentSkillResolver,
) -> Result<(), OrchestrationValidationError> {
    if graph.work_items.len() > MAX_WORK_ITEMS {
        return Err(OrchestrationValidationError::TooManyWorkItems {
            actual: graph.work_items.len(),
        });
    }
    let mut ids = BTreeSet::new();
    for item in &graph.work_items {
        if !ids.insert(item.id.as_str()) {
            return Err(OrchestrationValidationError::DuplicateWorkItem {
                work_item_id: item.id.as_str().to_string(),
            });
        }
        validate_work_item(item, scenes, skills)?;
    }
    let running = graph
        .work_items
        .iter()
        .filter(|item| item.status == WorkItemStatus::Running)
        .count();
    if running > 1 {
        return Err(OrchestrationValidationError::MultipleRunningExecutors { actual: running });
    }
    let mut edges = BTreeSet::new();
    for edge in &graph.edges {
        if edge.prerequisite == edge.dependent
            || !ids.contains(edge.prerequisite.as_str())
            || !ids.contains(edge.dependent.as_str())
            || !edges.insert((edge.prerequisite.as_str(), edge.dependent.as_str()))
        {
            return Err(OrchestrationValidationError::InvalidDependency {
                prerequisite: edge.prerequisite.as_str().to_string(),
                dependent: edge.dependent.as_str().to_string(),
            });
        }
    }
    if has_cycle(graph) {
        return Err(OrchestrationValidationError::DependencyCycle);
    }
    Ok(())
}

fn validate_planner_work_item(
    item: &WorkItem,
    scenes: &SceneCatalogV2,
    skills: &AgentSkillResolver,
) -> Result<(), OrchestrationValidationError> {
    if item.status == WorkItemStatus::Running {
        return Err(OrchestrationValidationError::RunningWorkItem {
            work_item_id: item.id.as_str().to_string(),
        });
    }
    validate_work_item(item, scenes, skills)
}

fn validate_work_item(
    item: &WorkItem,
    scenes: &SceneCatalogV2,
    skills: &AgentSkillResolver,
) -> Result<(), OrchestrationValidationError> {
    if validate_text(&item.objective, MAX_OBJECTIVE_CHARS).is_err()
        || validate_text(&item.reason, MAX_REASON_CHARS).is_err()
    {
        return Err(OrchestrationValidationError::InvalidWorkItemText {
            work_item_id: item.id.as_str().to_string(),
        });
    }
    for scene in &item.scenes {
        let Some(installed) = scenes.resolve(&scene.id) else {
            return Err(OrchestrationValidationError::UnknownScene {
                scene_id: scene.id.clone(),
            });
        };
        if installed.definition.version != scene.version
            || !scene_origin_matches(&scene.source, &installed.definition.provenance)
        {
            return Err(OrchestrationValidationError::SceneIdentityMismatch {
                scene_id: scene.id.clone(),
            });
        }
    }
    for skill in &item.agent_skills {
        let Some(installed) = skills.resolve(&skill.id) else {
            return Err(OrchestrationValidationError::UnknownAgentSkill {
                skill_id: skill.id.clone(),
            });
        };
        if installed.reference != *skill {
            return Err(OrchestrationValidationError::AgentSkillIdentityMismatch {
                skill_id: skill.id.clone(),
            });
        }
    }
    Ok(())
}

fn scene_origin_matches(reference: &SceneOrigin, actual: &SceneV2Origin) -> bool {
    match (reference, actual) {
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

fn find_work_item<'a>(
    graph: &'a TaskGraph,
    id: &WorkItemId,
) -> Result<&'a WorkItem, OrchestrationValidationError> {
    graph
        .work_items
        .iter()
        .find(|item| item.id == *id)
        .ok_or_else(|| OrchestrationValidationError::UnknownWorkItem {
            work_item_id: id.as_str().to_string(),
        })
}

fn find_work_item_mut<'a>(
    graph: &'a mut TaskGraph,
    id: &WorkItemId,
) -> Result<&'a mut WorkItem, OrchestrationValidationError> {
    graph
        .work_items
        .iter_mut()
        .find(|item| item.id == *id)
        .ok_or_else(|| OrchestrationValidationError::UnknownWorkItem {
            work_item_id: id.as_str().to_string(),
        })
}

fn reject_running(item: &WorkItem) -> Result<(), OrchestrationValidationError> {
    if item.status == WorkItemStatus::Running {
        Err(OrchestrationValidationError::RunningWorkItem {
            work_item_id: item.id.as_str().to_string(),
        })
    } else {
        Ok(())
    }
}

fn validate_text(value: &str, max: usize) -> Result<(), ()> {
    let chars = value.chars().count();
    if (1..=max).contains(&chars) {
        Ok(())
    } else {
        Err(())
    }
}

fn has_cycle(graph: &TaskGraph) -> bool {
    let mut indegree: BTreeMap<&str, usize> = graph
        .work_items
        .iter()
        .map(|item| (item.id.as_str(), 0))
        .collect();
    let mut outgoing: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for edge in &graph.edges {
        *indegree.entry(edge.dependent.as_str()).or_default() += 1;
        outgoing
            .entry(edge.prerequisite.as_str())
            .or_default()
            .push(edge.dependent.as_str());
    }
    let mut ready: Vec<&str> = indegree
        .iter()
        .filter_map(|(id, degree)| (*degree == 0).then_some(*id))
        .collect();
    let mut visited = 0;
    while let Some(id) = ready.pop() {
        visited += 1;
        if let Some(dependents) = outgoing.get(id) {
            for dependent in dependents {
                let degree = indegree.get_mut(dependent).expect("validated Work Item id");
                *degree -= 1;
                if *degree == 0 {
                    ready.push(dependent);
                }
            }
        }
    }
    visited != graph.work_items.len()
}
