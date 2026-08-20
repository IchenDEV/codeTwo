//! Scenes 2.0 dynamic orchestration boundary.
//!
//! Planner output is untrusted proposal data. This module is the pure Core boundary that checks
//! a bounded patch against the current revision and installed Scene/Agent Skill identities before
//! producing the next Task Graph. It contains no reusable workflow or fixed stage definition.

use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::agent_skill_v2::AgentSkillResolver;
use crate::scene_v2::{SceneCatalogV2, SceneV2Origin};
use crate::store::{Store, StoreError};
use crate::task::{
    AgentId, LoopCeilings, LoopGuardState, OrchestrationEvent, Task, TaskId, TaskStatus,
    WorkItemAttempt, WorkItemAttemptStatus,
};
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

#[derive(Debug, Clone)]
pub struct PlannerInput {
    pub task: Task,
    pub graph: TaskGraph,
}

#[async_trait]
pub trait PlannerPort: Send + Sync {
    async fn propose(&self, input: PlannerInput) -> Result<OrchestrationPatch, String>;

    async fn manager_assignment(&self, _task: &Task) -> Result<Option<ExecutorAssignment>, String> {
        Ok(None)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutorAssignment {
    pub agent_id: AgentId,
    pub session_id: String,
}

#[derive(Debug, Clone)]
pub struct ExecutionPreparation {
    pub task: Task,
    pub work_item: WorkItem,
}

#[derive(Debug, Clone)]
pub struct ExecutionRequest {
    pub task: Task,
    pub work_item: WorkItem,
    pub attempt: WorkItemAttempt,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExecutorOutcome {
    Succeeded { evidence: Vec<String> },
    Failed { message: String },
    Cancelled { message: String },
    Uncertain { message: String },
}

#[async_trait]
pub trait ExecutorPort: Send + Sync {
    async fn assignment(
        &self,
        preparation: ExecutionPreparation,
    ) -> Result<ExecutorAssignment, String>;

    async fn execute(&self, request: ExecutionRequest) -> Result<ExecutorOutcome, String>;
}

#[derive(Debug, Error)]
pub enum OrchestratorError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Validation(#[from] OrchestrationValidationError),
    #[error("planner: {0}")]
    Planner(String),
    #[error("executor: {0}")]
    Executor(String),
    #[error("task is paused: {reason}")]
    TaskPaused { reason: String },
    #[error("task is not active: {status:?}")]
    TaskNotActive { status: TaskStatus },
    #[error("task has no executable Work Item")]
    NoExecutableWork,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionStep {
    pub attempt: WorkItemAttempt,
    pub outcome: ExecutorOutcome,
    pub event: OrchestrationEvent,
}

pub struct Orchestrator {
    store: Arc<Store>,
    planner: Arc<dyn PlannerPort>,
    executor: Arc<dyn ExecutorPort>,
    scenes: Arc<SceneCatalogV2>,
    skills: Arc<AgentSkillResolver>,
    loop_ceilings: LoopCeilings,
}

impl Orchestrator {
    pub fn new(
        store: Arc<Store>,
        planner: Arc<dyn PlannerPort>,
        executor: Arc<dyn ExecutorPort>,
        scenes: Arc<SceneCatalogV2>,
        skills: Arc<AgentSkillResolver>,
    ) -> Self {
        Self {
            store,
            planner,
            executor,
            scenes,
            skills,
            loop_ceilings: LoopCeilings::default(),
        }
    }

    pub fn with_loop_ceilings(mut self, loop_ceilings: LoopCeilings) -> Self {
        self.loop_ceilings = loop_ceilings;
        self
    }

    pub async fn plan_once(
        &self,
        task_id: &TaskId,
        now_ms: i64,
    ) -> Result<OrchestrationEvent, OrchestratorError> {
        let record = self
            .store
            .get_task(task_id)?
            .ok_or_else(|| StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            })?;
        let graph = self.store.get_task_graph(task_id)?;
        let task = record.task;
        self.require_active(&task)?;
        let patch = self
            .planner
            .propose(PlannerInput {
                task: task.clone(),
                graph: graph.clone(),
            })
            .await
            .map_err(OrchestratorError::Planner)?;
        let next = apply_orchestration_patch(&graph, &patch, &self.scenes, &self.skills)?;
        let event = self.store.apply_task_graph(
            task_id,
            patch.expected_revision,
            &next,
            &patch.reason,
            now_ms,
        )?;
        self.ensure_manager_if_needed(&task, &next, now_ms).await?;
        let progress_identity = self.progress_identity(task_id, &next)?;
        let state = self
            .store
            .record_replan_progress(task_id, &progress_identity, now_ms)?;
        self.pause_if_ceiling_reached(task_id, &state, now_ms)?;
        Ok(event)
    }

    pub async fn execute_next(
        &self,
        task_id: &TaskId,
        now_ms: i64,
    ) -> Result<ExecutionStep, OrchestratorError> {
        let record = self
            .store
            .get_task(task_id)?
            .ok_or_else(|| StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            })?;
        self.require_active(&record.task)?;
        let graph = self.store.get_task_graph(task_id)?;
        let work_item = next_executable_work_item(&graph)
            .cloned()
            .ok_or(OrchestratorError::NoExecutableWork)?;
        let assignment = self
            .executor
            .assignment(ExecutionPreparation {
                task: record.task.clone(),
                work_item: work_item.clone(),
            })
            .await
            .map_err(OrchestratorError::Executor)?;
        let attempt = self.store.start_work_item_attempt(
            task_id,
            &work_item.id,
            &assignment.agent_id,
            &assignment.session_id,
            now_ms,
        )?;
        let outcome = self
            .executor
            .execute(ExecutionRequest {
                task: record.task,
                work_item: work_item.clone(),
                attempt: attempt.clone(),
            })
            .await
            .unwrap_or_else(|message| ExecutorOutcome::Failed { message });
        let (attempt_status, operation, reason) = outcome_transition(&work_item, &outcome);
        let completed_attempt = self.store.finish_work_item_attempt(
            task_id,
            &work_item.id,
            attempt.attempt,
            attempt_status,
            now_ms,
        )?;
        let patch = OrchestrationPatch {
            expected_revision: graph.revision,
            reason,
            operations: vec![operation],
        };
        let next = apply_orchestration_patch(&graph, &patch, &self.scenes, &self.skills)?;
        let event = self.store.apply_task_graph(
            task_id,
            patch.expected_revision,
            &next,
            &patch.reason,
            now_ms,
        )?;
        let skill_set_identity = agent_skill_set_identity(&work_item);
        let state = self.store.record_work_item_outcome(
            task_id,
            &work_item.id,
            &skill_set_identity,
            matches!(outcome, ExecutorOutcome::Succeeded { .. }),
            now_ms,
        )?;
        self.pause_if_ceiling_reached(task_id, &state, now_ms)?;
        Ok(ExecutionStep {
            attempt: completed_attempt,
            outcome,
            event,
        })
    }

    fn require_active(&self, task: &Task) -> Result<(), OrchestratorError> {
        match task.status {
            TaskStatus::Active => Ok(()),
            TaskStatus::Paused => {
                let state = self.store.task_loop_guard(&task.id)?;
                Err(OrchestratorError::TaskPaused {
                    reason: state
                        .pause_reason
                        .unwrap_or_else(|| "paused by user or runtime policy".into()),
                })
            }
            status => Err(OrchestratorError::TaskNotActive { status }),
        }
    }

    fn progress_identity(
        &self,
        task_id: &TaskId,
        graph: &TaskGraph,
    ) -> Result<String, OrchestratorError> {
        let mut completion_evidence: Vec<_> = graph
            .work_items
            .iter()
            .filter(|item| item.status == WorkItemStatus::Succeeded)
            .map(|item| {
                (
                    item.id.as_str().to_string(),
                    item.completion_evidence.clone(),
                )
            })
            .collect();
        completion_evidence.sort();
        let mut artifacts: Vec<_> = self
            .store
            .list_task_artifacts(task_id)?
            .into_iter()
            .map(|artifact| {
                (
                    artifact.artifact_key,
                    artifact.version,
                    artifact.content_identity,
                    artifact.status,
                )
            })
            .collect();
        artifacts
            .sort_by(|left, right| (&left.0, left.1, &left.2).cmp(&(&right.0, right.1, &right.2)));
        let payload = serde_json::to_vec(&(completion_evidence, artifacts))
            .expect("progress identity serialization cannot fail");
        Ok(blake3::hash(&payload).to_hex().to_string())
    }

    fn pause_if_ceiling_reached(
        &self,
        task_id: &TaskId,
        state: &LoopGuardState,
        now_ms: i64,
    ) -> Result<(), OrchestratorError> {
        let reason = if state.consecutive_failures >= self.loop_ceilings.consecutive_failures {
            Some(format!(
                "paused after {} consecutive unsuccessful attempts",
                state.consecutive_failures
            ))
        } else if state.repeated_work_item_attempts
            >= self.loop_ceilings.repeated_work_item_attempts
        {
            Some(format!(
                "paused after attempting the same Work Item {} times",
                state.repeated_work_item_attempts
            ))
        } else if state.repeated_agent_skill_set_attempts
            >= self.loop_ceilings.repeated_agent_skill_set_attempts
        {
            Some(format!(
                "paused after using the same Agent Skill set {} times",
                state.repeated_agent_skill_set_attempts
            ))
        } else if state.replans_without_progress >= self.loop_ceilings.replans_without_progress {
            Some(format!(
                "paused after {} replans without new completion evidence",
                state.replans_without_progress
            ))
        } else if state.consecutive_failures > 0
            && state.total_attempts >= self.loop_ceilings.total_attempts_without_cost
            && self
                .store
                .task_budget_state(task_id)?
                .cost_microusd
                .is_none()
        {
            Some(format!(
                "paused after {} total attempts because provider cost is unavailable",
                state.total_attempts
            ))
        } else {
            None
        };
        if let Some(reason) = reason {
            self.store.pause_task(task_id, &reason, now_ms)?;
        }
        Ok(())
    }

    async fn ensure_manager_if_needed(
        &self,
        task: &Task,
        graph: &TaskGraph,
        now_ms: i64,
    ) -> Result<(), OrchestratorError> {
        if !manager_required(graph)
            || self
                .store
                .list_task_session_leases(&task.id)?
                .iter()
                .any(|lease| {
                    lease.role == crate::task::AgentRole::Manager && lease.released_at_ms.is_none()
                })
        {
            return Ok(());
        }
        let Some(assignment) = self
            .planner
            .manager_assignment(task)
            .await
            .map_err(OrchestratorError::Planner)?
        else {
            return Ok(());
        };
        let provider = serde_json::to_vec(&task.provider_configuration)
            .expect("Provider Configuration serialization cannot fail");
        let compatibility = format!(
            "manager:{}:{}",
            task.id.as_str(),
            blake3::hash(&provider).to_hex()
        );
        self.store.lease_task_session(
            &task.id,
            &assignment.session_id,
            &assignment.agent_id,
            crate::task::AgentRole::Manager,
            &compatibility,
            now_ms,
        )?;
        Ok(())
    }
}

fn agent_skill_set_identity(work_item: &WorkItem) -> String {
    let mut skills: Vec<_> = work_item
        .agent_skills
        .iter()
        .map(|skill| {
            (
                skill.id.as_str(),
                skill.version.as_deref(),
                skill.content_identity.as_str(),
                &skill.source,
            )
        })
        .collect();
    skills.sort_by(|left, right| left.0.cmp(right.0).then(left.2.cmp(right.2)));
    let payload =
        serde_json::to_vec(&skills).expect("Agent Skill identity serialization cannot fail");
    blake3::hash(&payload).to_hex().to_string()
}

fn manager_required(graph: &TaskGraph) -> bool {
    graph
        .work_items
        .iter()
        .filter(|item| {
            !matches!(
                item.status,
                WorkItemStatus::Succeeded | WorkItemStatus::Cancelled | WorkItemStatus::Superseded
            )
        })
        .take(2)
        .count()
        > 1
}

fn next_executable_work_item(graph: &TaskGraph) -> Option<&WorkItem> {
    graph.work_items.iter().find(|candidate| {
        matches!(
            candidate.status,
            WorkItemStatus::Proposed | WorkItemStatus::Ready
        ) && graph
            .edges
            .iter()
            .filter(|edge| edge.dependent == candidate.id)
            .all(|edge| {
                graph.work_items.iter().any(|item| {
                    item.id == edge.prerequisite && item.status == WorkItemStatus::Succeeded
                })
            })
    })
}

fn outcome_transition(
    work_item: &WorkItem,
    outcome: &ExecutorOutcome,
) -> (WorkItemAttemptStatus, GraphOperation, String) {
    match outcome {
        ExecutorOutcome::Succeeded { evidence } => (
            WorkItemAttemptStatus::Succeeded,
            GraphOperation::Complete {
                work_item_id: work_item.id.clone(),
                evidence: evidence.clone(),
            },
            format!(
                "Work Item `{}` produced completion evidence",
                work_item.id.as_str()
            ),
        ),
        ExecutorOutcome::Failed { message } => (
            WorkItemAttemptStatus::Failed,
            GraphOperation::Update {
                work_item: terminal_work_item(work_item, WorkItemStatus::Failed, message),
            },
            format!("Work Item `{}` failed", work_item.id.as_str()),
        ),
        ExecutorOutcome::Cancelled { message } => (
            WorkItemAttemptStatus::Cancelled,
            GraphOperation::Update {
                work_item: terminal_work_item(work_item, WorkItemStatus::Cancelled, message),
            },
            format!("Work Item `{}` was cancelled", work_item.id.as_str()),
        ),
        ExecutorOutcome::Uncertain { message } => (
            WorkItemAttemptStatus::Uncertain,
            GraphOperation::Update {
                work_item: terminal_work_item(work_item, WorkItemStatus::Blocked, message),
            },
            format!(
                "Work Item `{}` has an uncertain outcome",
                work_item.id.as_str()
            ),
        ),
    }
}

fn terminal_work_item(item: &WorkItem, status: WorkItemStatus, message: &str) -> WorkItem {
    let mut terminal = item.clone();
    terminal.status = status;
    terminal.blocker = Some(message.to_string());
    terminal
}

pub struct InMemoryPlanner {
    patches: Mutex<VecDeque<OrchestrationPatch>>,
    manager_assignment: Option<ExecutorAssignment>,
}

impl InMemoryPlanner {
    pub fn new(patches: impl IntoIterator<Item = OrchestrationPatch>) -> Self {
        Self {
            patches: Mutex::new(patches.into_iter().collect()),
            manager_assignment: None,
        }
    }

    pub fn with_manager_assignment(mut self, assignment: ExecutorAssignment) -> Self {
        self.manager_assignment = Some(assignment);
        self
    }
}

#[async_trait]
impl PlannerPort for InMemoryPlanner {
    async fn propose(&self, _input: PlannerInput) -> Result<OrchestrationPatch, String> {
        self.patches
            .lock()
            .unwrap()
            .pop_front()
            .ok_or_else(|| "no in-memory planner reply remains".into())
    }

    async fn manager_assignment(&self, _task: &Task) -> Result<Option<ExecutorAssignment>, String> {
        Ok(self.manager_assignment.clone())
    }
}

pub struct InMemoryExecutor {
    assignment: ExecutorAssignment,
    outcomes: Mutex<VecDeque<ExecutorOutcome>>,
}

impl InMemoryExecutor {
    pub fn new(
        assignment: ExecutorAssignment,
        outcomes: impl IntoIterator<Item = ExecutorOutcome>,
    ) -> Self {
        Self {
            assignment,
            outcomes: Mutex::new(outcomes.into_iter().collect()),
        }
    }
}

#[async_trait]
impl ExecutorPort for InMemoryExecutor {
    async fn assignment(
        &self,
        _preparation: ExecutionPreparation,
    ) -> Result<ExecutorAssignment, String> {
        Ok(self.assignment.clone())
    }

    async fn execute(&self, _request: ExecutionRequest) -> Result<ExecutorOutcome, String> {
        self.outcomes
            .lock()
            .unwrap()
            .pop_front()
            .ok_or_else(|| "no in-memory Executor outcome remains".into())
    }
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
