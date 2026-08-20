//! Scenes 2.0 task-domain types.
//!
//! A task is the user-owned unit of work. The types in this module deliberately contain no
//! pipeline, stage, scene-execution, permission-preset, or provider-routing fields. They are the
//! provider-neutral public vocabulary shared by persistence, SQ/EQ, and frontends.

use serde::{Deserialize, Serialize};

use crate::provider::ProviderId;
use crate::session::SessionId;

macro_rules! string_id {
    ($name:ident) => {
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self::new(value)
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self::new(value)
            }
        }
    };
}

string_id!(TaskId);
string_id!(WorkItemId);
string_id!(AgentId);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Active,
    Paused,
    Completed,
    PartiallyCompleted,
    Blocked,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultContract {
    pub goal: String,
    pub required_deliverables: Vec<String>,
    pub completion_conditions: Vec<String>,
    pub boundaries: Vec<String>,
    pub known_risks: Vec<String>,
    pub unresolved_facts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultContractRefinement {
    pub expected_revision: u64,
    pub reason: String,
    pub clarified_goal: Option<String>,
    pub add_required_deliverables: Vec<String>,
    pub add_completion_conditions: Vec<String>,
    pub add_boundaries: Vec<String>,
    pub add_known_risks: Vec<String>,
    pub add_unresolved_facts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MaterialGoalChangeReceipt {
    pub before: String,
    pub after: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskCompletionEvaluation {
    pub status: TaskStatus,
    pub satisfied_deliverables: Vec<String>,
    pub missing_deliverables: Vec<String>,
    pub satisfied_conditions: Vec<String>,
    pub missing_conditions: Vec<String>,
    pub evidence: Vec<String>,
    pub unresolved_facts: Vec<String>,
    pub blockers: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderConfiguration {
    pub provider: ProviderId,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskBudget {
    pub max_cost_microusd: Option<u64>,
    pub max_tokens: Option<u64>,
    pub max_duration_seconds: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum SceneOrigin {
    Official,
    Personal,
    Project,
    Plugin { plugin_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SceneRef {
    pub id: String,
    pub version: String,
    pub source: SceneOrigin,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum AgentSkillOrigin {
    Preinstalled,
    Plugin { plugin_id: String },
    Project,
    Temporary { task_id: TaskId },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentSkillRef {
    pub id: String,
    pub version: Option<String>,
    pub content_identity: String,
    pub source: AgentSkillOrigin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkItemStatus {
    Proposed,
    Ready,
    Running,
    AwaitingInput,
    Blocked,
    Succeeded,
    Failed,
    Cancelled,
    Superseded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkItem {
    pub id: WorkItemId,
    pub objective: String,
    pub result_contract_conditions: Vec<String>,
    pub scenes: Vec<SceneRef>,
    pub agent_skills: Vec<AgentSkillRef>,
    pub input_artifacts: Vec<String>,
    pub expected_outputs: Vec<String>,
    pub completion_evidence: Vec<String>,
    pub status: WorkItemStatus,
    pub blocker: Option<String>,
    pub assigned_session_id: Option<SessionId>,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkItemEdge {
    pub prerequisite: WorkItemId,
    pub dependent: WorkItemId,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkItemAttemptStatus {
    Running,
    Succeeded,
    Failed,
    Cancelled,
    Uncertain,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkItemAttempt {
    pub task_id: TaskId,
    pub work_item_id: WorkItemId,
    pub attempt: u32,
    pub agent_id: AgentId,
    pub session_id: SessionId,
    pub status: WorkItemAttemptStatus,
    pub started_at_ms: i64,
    pub finished_at_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskGraph {
    pub revision: u64,
    pub work_items: Vec<WorkItem>,
    pub edges: Vec<WorkItemEdge>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum OrchestrationEventKind {
    TaskCreated,
    TaskGraphChanged {
        reason: String,
    },
    TaskPaused {
        reason: String,
    },
    ResultContractRefined {
        previous_revision: u64,
        revision: u64,
        reason: String,
        goal_change: Option<MaterialGoalChangeReceipt>,
    },
    TaskOutcomeRecorded {
        status: TaskStatus,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OrchestrationEvent {
    pub task_id: TaskId,
    pub sequence: u64,
    pub graph_revision: u64,
    pub kind: OrchestrationEventKind,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoopGuardState {
    pub total_attempts: u64,
    pub consecutive_failures: u64,
    pub repeated_work_item_attempts: u64,
    pub repeated_agent_skill_set_attempts: u64,
    pub replans_without_progress: u64,
    pub last_work_item_id: Option<WorkItemId>,
    pub last_agent_skill_set_identity: Option<String>,
    pub last_progress_identity: Option<String>,
    pub pause_reason: Option<String>,
}

impl Default for LoopGuardState {
    fn default() -> Self {
        Self {
            total_attempts: 0,
            consecutive_failures: 0,
            repeated_work_item_attempts: 0,
            repeated_agent_skill_set_attempts: 0,
            replans_without_progress: 0,
            last_work_item_id: None,
            last_agent_skill_set_identity: None,
            last_progress_identity: None,
            pause_reason: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LoopCeilings {
    pub consecutive_failures: u64,
    pub repeated_work_item_attempts: u64,
    pub repeated_agent_skill_set_attempts: u64,
    pub replans_without_progress: u64,
}

impl Default for LoopCeilings {
    fn default() -> Self {
        Self {
            consecutive_failures: 3,
            repeated_work_item_attempts: 5,
            repeated_agent_skill_set_attempts: 6,
            replans_without_progress: 4,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRole {
    Manager,
    Executor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Running,
    AwaitingInput,
    Completed,
    Failed,
    Cancelled,
    Uncertain,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentAssignment {
    pub agent_id: AgentId,
    pub role: AgentRole,
    pub status: AgentStatus,
    pub session_id: SessionId,
    pub work_item_id: Option<WorkItemId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TaskSessionLease {
    pub lease_id: i64,
    pub task_id: TaskId,
    pub session_id: SessionId,
    pub agent_id: AgentId,
    pub role: AgentRole,
    pub compatibility_identity: String,
    pub leased_at_ms: i64,
    pub released_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskArtifactStatus {
    Candidate,
    Accepted,
    Rejected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArtifactProvenance {
    pub artifact_id: String,
    pub artifact_key: String,
    pub task_id: TaskId,
    pub work_item_id: WorkItemId,
    pub attempt: u32,
    pub version: u32,
    pub agent_id: AgentId,
    pub session_id: SessionId,
    pub scenes: Vec<SceneRef>,
    pub agent_skills: Vec<AgentSkillRef>,
    pub provider_configuration: ProviderConfiguration,
    pub content_identity: String,
    pub storage_reference: String,
    pub created_at_ms: i64,
    pub status: TaskArtifactStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Task {
    pub id: TaskId,
    pub status: TaskStatus,
    pub result_contract: ResultContract,
    pub provider_configuration: ProviderConfiguration,
    pub budget: TaskBudget,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunSnapshot {
    pub task_id: TaskId,
    pub revision: u64,
    pub status: TaskStatus,
    pub result_contract: ResultContract,
    pub provider_configuration: ProviderConfiguration,
    pub task_graph: TaskGraph,
    pub agents: Vec<AgentAssignment>,
    pub artifacts: Vec<ArtifactProvenance>,
    pub blockers: Vec<String>,
    pub budget: TaskBudget,
}
