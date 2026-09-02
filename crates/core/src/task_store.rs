//! Durable Scenes 2.0 Task storage.
//!
//! These tables use explicit `*_v2` identities and never read, transform, or delete Agent Scenes
//! 1.0 scene, pipeline, or artifact rows.

use std::collections::BTreeSet;

use rusqlite::OptionalExtension;

use crate::capability_v2::ConcreteEffect;
use crate::risk_v2::{
    effect_requires_risk_gate, RiskGateDecision, RiskGateReceipt, UserRiskDecision,
};
use crate::session::Session;
use crate::store::{Store, StoreError};
use crate::task::{
    AgentAssignment, AgentId, AgentRole, AgentStatus, ArtifactProvenance, AttentionItem,
    IdempotentCommand, LoopGuardState, MaterialGoalChangeReceipt, Member, MemberId,
    OrchestrationEvent, OrchestrationEventKind, ResultContract, ResultContractRefinement,
    RunSnapshot, SharedTaskSnapshot, SuggestionApprovalReceipt, SuggestionId, SuggestionStatus,
    Task, TaskActivityEvent, TaskActivityKind, TaskBudget, TaskBudgetState, TaskCacheReceipt,
    TaskCollaborationSnapshot, TaskComment, TaskCommentId, TaskCompletionEvaluation, TaskGraph,
    TaskId, TaskSessionLease, TaskStatus, TaskSuggestion, TaskUsageObservation, WorkItem,
    WorkItemAttempt, WorkItemAttemptStatus, WorkItemEdge, WorkItemId, WorkItemStatus, Workspace,
    WorkspaceId, WorkspaceRole,
};

const TASK_SCHEMA_V2: &str = "
CREATE TABLE IF NOT EXISTS tasks_v2 (
  id                          TEXT PRIMARY KEY,
  status_json                 TEXT NOT NULL,
  provider_configuration_json TEXT NOT NULL,
  budget_json                 TEXT NOT NULL,
  result_contract_revision    INTEGER NOT NULL,
  created_at_ms               INTEGER NOT NULL,
  updated_at_ms               INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_result_contracts_v2 (
  task_id       TEXT NOT NULL,
  revision      INTEGER NOT NULL,
  contract_json TEXT NOT NULL,
  reason        TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (task_id, revision),
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE INDEX IF NOT EXISTS task_result_contracts_v2_task
  ON task_result_contracts_v2(task_id, revision);
CREATE TABLE IF NOT EXISTS task_graph_revisions_v2 (
  task_id       TEXT PRIMARY KEY,
  revision      INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE TABLE IF NOT EXISTS task_work_items_v2 (
  task_id       TEXT NOT NULL,
  graph_revision INTEGER NOT NULL,
  work_item_id  TEXT NOT NULL,
  position      INTEGER NOT NULL,
  item_json     TEXT NOT NULL,
  PRIMARY KEY (task_id, graph_revision, work_item_id),
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE INDEX IF NOT EXISTS task_work_items_v2_order
  ON task_work_items_v2(task_id, graph_revision, position);
CREATE TABLE IF NOT EXISTS task_work_item_edges_v2 (
  task_id       TEXT NOT NULL,
  graph_revision INTEGER NOT NULL,
  position      INTEGER NOT NULL,
  prerequisite  TEXT NOT NULL,
  dependent     TEXT NOT NULL,
  PRIMARY KEY (task_id, graph_revision, prerequisite, dependent),
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE INDEX IF NOT EXISTS task_work_item_edges_v2_order
  ON task_work_item_edges_v2(task_id, graph_revision, position);
CREATE TABLE IF NOT EXISTS task_work_item_attempts_v2 (
  task_id       TEXT NOT NULL,
  work_item_id  TEXT NOT NULL,
  attempt       INTEGER NOT NULL,
  agent_id      TEXT NOT NULL,
  session_id    TEXT NOT NULL,
  status        TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  finished_at_ms INTEGER,
  PRIMARY KEY (task_id, work_item_id, attempt),
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS task_one_running_executor_v2
  ON task_work_item_attempts_v2(task_id) WHERE status='running';
CREATE TABLE IF NOT EXISTS task_orchestration_events_v2 (
  task_id        TEXT NOT NULL,
  sequence       INTEGER NOT NULL,
  graph_revision INTEGER NOT NULL,
  kind_json      TEXT NOT NULL,
  created_at_ms  INTEGER NOT NULL,
  PRIMARY KEY (task_id, sequence),
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE INDEX IF NOT EXISTS task_orchestration_events_v2_order
  ON task_orchestration_events_v2(task_id, sequence);
CREATE TABLE IF NOT EXISTS task_session_leases_v2 (
  lease_id               INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id                TEXT NOT NULL,
  session_id             TEXT NOT NULL,
  agent_id               TEXT NOT NULL,
  role                   TEXT NOT NULL,
  compatibility_identity TEXT NOT NULL,
  leased_at_ms           INTEGER NOT NULL,
  released_at_ms         INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS task_active_session_lease_v2
  ON task_session_leases_v2(session_id) WHERE released_at_ms IS NULL;
CREATE INDEX IF NOT EXISTS task_session_leases_v2_task
  ON task_session_leases_v2(task_id, lease_id);
CREATE TABLE IF NOT EXISTS task_artifacts_v2 (
  task_id         TEXT NOT NULL,
  work_item_id    TEXT NOT NULL,
  artifact_key    TEXT NOT NULL,
  version         INTEGER NOT NULL,
  attempt         INTEGER NOT NULL,
  artifact_id     TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_at_ms   INTEGER NOT NULL,
  PRIMARY KEY (task_id, work_item_id, artifact_key, version),
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);
CREATE INDEX IF NOT EXISTS task_artifacts_v2_history
  ON task_artifacts_v2(task_id, created_at_ms, work_item_id, artifact_key, version);
CREATE TABLE IF NOT EXISTS task_loop_guard_v2 (
  task_id                         TEXT PRIMARY KEY,
  state_json                      TEXT NOT NULL,
  updated_at_ms                   INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE TABLE IF NOT EXISTS task_budget_state_v2 (
  task_id       TEXT PRIMARY KEY,
  state_json    TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE TABLE IF NOT EXISTS task_cache_receipts_v2 (
  task_id       TEXT NOT NULL,
  work_item_id  TEXT NOT NULL,
  attempt       INTEGER NOT NULL,
  receipt_json  TEXT NOT NULL,
  recorded_at_ms INTEGER NOT NULL,
  PRIMARY KEY (task_id, work_item_id, attempt),
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE INDEX IF NOT EXISTS task_cache_receipts_v2_order
  ON task_cache_receipts_v2(task_id, recorded_at_ms, work_item_id, attempt);
CREATE TABLE IF NOT EXISTS task_risk_gates_v2 (
  request_id    TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  work_item_id  TEXT NOT NULL,
  receipt_json  TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  decided_at_ms INTEGER,
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id)
);
CREATE INDEX IF NOT EXISTS task_risk_gates_v2_order
  ON task_risk_gates_v2(task_id, created_at_ms, request_id);
CREATE TABLE IF NOT EXISTS team_workspaces_v1 (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members_v1 (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL,
  active        INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES team_workspaces_v1(id)
);
CREATE INDEX IF NOT EXISTS team_members_v1_workspace
  ON team_members_v1(workspace_id, created_at_ms, id);
CREATE TABLE IF NOT EXISTS task_collaboration_v1 (
  task_id        TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL,
  owner_id       TEXT NOT NULL,
  cwd            TEXT NOT NULL,
  revision       INTEGER NOT NULL,
  created_at_ms  INTEGER NOT NULL,
  updated_at_ms  INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks_v2(id),
  FOREIGN KEY (workspace_id) REFERENCES team_workspaces_v1(id),
  FOREIGN KEY (owner_id) REFERENCES team_members_v1(id)
);
CREATE TABLE IF NOT EXISTS task_collaborators_v1 (
  task_id    TEXT NOT NULL,
  member_id  TEXT NOT NULL,
  position   INTEGER NOT NULL,
  PRIMARY KEY (task_id, member_id),
  FOREIGN KEY (task_id) REFERENCES task_collaboration_v1(task_id),
  FOREIGN KEY (member_id) REFERENCES team_members_v1(id)
);
CREATE INDEX IF NOT EXISTS task_collaborators_v1_order
  ON task_collaborators_v1(task_id, position, member_id);
CREATE TABLE IF NOT EXISTS task_comments_v1 (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  author_id     TEXT NOT NULL,
  body          TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES task_collaboration_v1(task_id),
  FOREIGN KEY (author_id) REFERENCES team_members_v1(id)
);
CREATE INDEX IF NOT EXISTS task_comments_v1_order
  ON task_comments_v1(task_id, created_at_ms, id);
CREATE TABLE IF NOT EXISTS task_suggestions_v1 (
  id                   TEXT PRIMARY KEY,
  task_id              TEXT NOT NULL,
  author_id            TEXT NOT NULL,
  body                 TEXT NOT NULL,
  status                TEXT NOT NULL,
  decided_by            TEXT,
  decided_at_ms         INTEGER,
  execution_command_id  TEXT,
  execution_session_id  TEXT,
  execution_error       TEXT,
  created_at_ms         INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES task_collaboration_v1(task_id),
  FOREIGN KEY (author_id) REFERENCES team_members_v1(id),
  FOREIGN KEY (decided_by) REFERENCES team_members_v1(id),
  FOREIGN KEY (execution_session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS task_suggestions_v1_order
  ON task_suggestions_v1(task_id, created_at_ms, id);
CREATE UNIQUE INDEX IF NOT EXISTS task_suggestions_v1_execution_command
  ON task_suggestions_v1(execution_command_id) WHERE execution_command_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS task_activity_v1 (
  task_id        TEXT NOT NULL,
  sequence       INTEGER NOT NULL,
  actor_id       TEXT NOT NULL,
  kind_json      TEXT NOT NULL,
  created_at_ms  INTEGER NOT NULL,
  PRIMARY KEY (task_id, sequence),
  FOREIGN KEY (task_id) REFERENCES task_collaboration_v1(task_id),
  FOREIGN KEY (actor_id) REFERENCES team_members_v1(id)
);
CREATE TABLE IF NOT EXISTS task_collaboration_commands_v1 (
  command_id    TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  actor_id      TEXT NOT NULL,
  action        TEXT NOT NULL,
  receipt_json  TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES task_collaboration_v1(task_id),
  FOREIGN KEY (actor_id) REFERENCES team_members_v1(id)
);
";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskRecord {
    pub task: Task,
    pub result_contract_revision: u64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

pub(crate) fn install(conn: &rusqlite::Connection) -> Result<(), StoreError> {
    conn.execute_batch(TASK_SCHEMA_V2)?;
    conn.execute(
        "INSERT OR IGNORE INTO task_graph_revisions_v2(task_id,revision,updated_at_ms)
         SELECT id,0,created_at_ms FROM tasks_v2",
        [],
    )?;
    let loop_guard = serde_json::to_string(&LoopGuardState::default())?;
    conn.execute(
        "INSERT OR IGNORE INTO task_loop_guard_v2(task_id,state_json,updated_at_ms)
         SELECT id,?1,created_at_ms FROM tasks_v2",
        [loop_guard],
    )?;
    let budget_state = serde_json::to_string(&TaskBudgetState::default())?;
    conn.execute(
        "INSERT OR IGNORE INTO task_budget_state_v2(task_id,state_json,updated_at_ms)
         SELECT id,?1,created_at_ms FROM tasks_v2",
        [budget_state],
    )?;
    let created = serde_json::to_string(&OrchestrationEventKind::TaskCreated)?;
    conn.execute(
        "INSERT OR IGNORE INTO task_orchestration_events_v2
           (task_id,sequence,graph_revision,kind_json,created_at_ms)
         SELECT id,1,0,?1,created_at_ms FROM tasks_v2",
        [created],
    )?;
    Ok(())
}

impl Store {
    /// Persist the native shell for a newly launched parallel Task and its first Executor as one
    /// transaction. The renderer supplies the user-owned Task id and goal; Core owns every runtime
    /// identity and invariant below that boundary.
    pub fn create_parallel_task_session(
        &self,
        session: &Session,
        task: &Task,
        work_item: &WorkItem,
        agent_id: &AgentId,
        compatibility_identity: &str,
        now_ms: i64,
    ) -> Result<(), StoreError> {
        let graph = TaskGraph {
            revision: 1,
            work_items: vec![work_item.clone()],
            edges: Vec::new(),
        };
        validate_graph(&graph)?;
        if work_item.status != WorkItemStatus::Running
            || work_item.assigned_session_id.as_deref() != Some(session.id.as_str())
        {
            return Err(StoreError::InvalidTaskGraph(
                "parallel Task Work Item must be running in its created Session".into(),
            ));
        }

        let status = serde_json::to_string(&task.status)?;
        let provider_configuration = serde_json::to_string(&task.provider_configuration)?;
        let budget = serde_json::to_string(&task.budget)?;
        let result_contract = serde_json::to_string(&task.result_contract)?;
        let item_json = serde_json::to_string(work_item)?;
        let task_created = serde_json::to_string(&OrchestrationEventKind::TaskCreated)?;
        let graph_changed = serde_json::to_string(&OrchestrationEventKind::TaskGraphChanged {
            reason: "Parallel task started".into(),
        })?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        Store::upsert_session_on(&tx, session)?;
        tx.execute(
            "INSERT INTO tasks_v2
               (id,status_json,provider_configuration_json,budget_json,
                result_contract_revision,created_at_ms,updated_at_ms)
             VALUES (?1,?2,?3,?4,1,?5,?5)",
            rusqlite::params![
                task.id.as_str(),
                status,
                provider_configuration,
                budget,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_result_contracts_v2
               (task_id,revision,contract_json,reason,created_at_ms)
             VALUES (?1,1,?2,'task_created',?3)",
            rusqlite::params![task.id.as_str(), result_contract, now_ms],
        )?;
        tx.execute(
            "INSERT INTO task_graph_revisions_v2(task_id,revision,updated_at_ms)
             VALUES (?1,1,?2)",
            rusqlite::params![task.id.as_str(), now_ms],
        )?;
        tx.execute(
            "INSERT INTO task_work_items_v2
               (task_id,graph_revision,work_item_id,position,item_json)
             VALUES (?1,1,?2,0,?3)",
            rusqlite::params![task.id.as_str(), work_item.id.as_str(), item_json],
        )?;
        tx.execute(
            "INSERT INTO task_loop_guard_v2(task_id,state_json,updated_at_ms)
             VALUES (?1,?2,?3)",
            rusqlite::params![
                task.id.as_str(),
                serde_json::to_string(&LoopGuardState::default())?,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_budget_state_v2(task_id,state_json,updated_at_ms)
             VALUES (?1,?2,?3)",
            rusqlite::params![
                task.id.as_str(),
                serde_json::to_string(&TaskBudgetState::default())?,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,1,0,?2,?3), (?1,2,1,?4,?3)",
            rusqlite::params![task.id.as_str(), task_created, now_ms, graph_changed],
        )?;
        tx.execute(
            "INSERT INTO task_session_leases_v2
               (task_id,session_id,agent_id,role,compatibility_identity,leased_at_ms)
             VALUES (?1,?2,?3,'executor',?4,?5)",
            rusqlite::params![
                task.id.as_str(),
                session.id,
                agent_id.as_str(),
                compatibility_identity,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_work_item_attempts_v2
               (task_id,work_item_id,attempt,agent_id,session_id,status,started_at_ms)
             VALUES (?1,?2,1,?3,?4,'running',?5)",
            rusqlite::params![
                task.id.as_str(),
                work_item.id.as_str(),
                agent_id.as_str(),
                session.id,
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Attach the first Executor Session to a shared Task that already exists. Approval owns the
    /// collaboration claim; this transaction owns the runtime identities and refuses any second
    /// active execution before mutating the Session or Task graph.
    pub fn attach_parallel_task_session(
        &self,
        session: &Session,
        task_id: &TaskId,
        work_item: &WorkItem,
        agent_id: &AgentId,
        compatibility_identity: &str,
        now_ms: i64,
    ) -> Result<(), StoreError> {
        let graph = TaskGraph {
            revision: 1,
            work_items: vec![work_item.clone()],
            edges: Vec::new(),
        };
        validate_graph(&graph)?;
        if work_item.status != WorkItemStatus::Running
            || work_item.assigned_session_id.as_deref() != Some(session.id.as_str())
        {
            return Err(StoreError::InvalidTaskGraph(
                "attached Task Work Item must be running in its created Session".into(),
            ));
        }

        let item_json = serde_json::to_string(work_item)?;
        let graph_changed = serde_json::to_string(&OrchestrationEventKind::TaskGraphChanged {
            reason: "Approved collaboration Suggestion started".into(),
        })?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let graph_revision: Option<i64> = tx
            .query_row(
                "SELECT revision FROM task_graph_revisions_v2 WHERE task_id=?1",
                [task_id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        let Some(graph_revision) = graph_revision else {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        };
        let running: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM task_work_item_attempts_v2
               WHERE task_id=?1 AND status='running'
             )",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        if running {
            return Err(StoreError::TaskExecutorBusy {
                task_id: task_id.as_str().to_string(),
            });
        }
        if graph_revision != 0 {
            return Err(StoreError::TaskRevisionConflict {
                task_id: task_id.as_str().to_string(),
                expected: 0,
                actual: graph_revision as u64,
            });
        }

        Store::upsert_session_on(&tx, session)?;
        tx.execute(
            "UPDATE task_graph_revisions_v2 SET revision=1,updated_at_ms=?2 WHERE task_id=?1",
            rusqlite::params![task_id.as_str(), now_ms],
        )?;
        tx.execute(
            "INSERT INTO task_work_items_v2
               (task_id,graph_revision,work_item_id,position,item_json)
             VALUES (?1,1,?2,0,?3)",
            rusqlite::params![task_id.as_str(), work_item.id.as_str(), item_json],
        )?;
        let sequence: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_orchestration_events_v2
             WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,?2,1,?3,?4)",
            rusqlite::params![task_id.as_str(), sequence, graph_changed, now_ms],
        )?;
        tx.execute(
            "INSERT INTO task_session_leases_v2
               (task_id,session_id,agent_id,role,compatibility_identity,leased_at_ms)
             VALUES (?1,?2,?3,'executor',?4,?5)",
            rusqlite::params![
                task_id.as_str(),
                session.id,
                agent_id.as_str(),
                compatibility_identity,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_work_item_attempts_v2
               (task_id,work_item_id,attempt,agent_id,session_id,status,started_at_ms)
             VALUES (?1,?2,1,?3,?4,'running',?5)",
            rusqlite::params![
                task_id.as_str(),
                work_item.id.as_str(),
                agent_id.as_str(),
                session.id,
                now_ms,
            ],
        )?;
        tx.execute(
            "UPDATE tasks_v2 SET status_json=?2,updated_at_ms=?3 WHERE id=?1",
            rusqlite::params![
                task_id.as_str(),
                serde_json::to_string(&TaskStatus::Active)?,
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn create_task(&self, task: &Task, now_ms: i64) -> Result<TaskRecord, StoreError> {
        let status = serde_json::to_string(&task.status)?;
        let provider_configuration = serde_json::to_string(&task.provider_configuration)?;
        let budget = serde_json::to_string(&task.budget)?;
        let result_contract = serde_json::to_string(&task.result_contract)?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO tasks_v2
               (id,status_json,provider_configuration_json,budget_json,
                result_contract_revision,created_at_ms,updated_at_ms)
             VALUES (?1,?2,?3,?4,1,?5,?5)",
            rusqlite::params![
                task.id.as_str(),
                status,
                provider_configuration,
                budget,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_loop_guard_v2(task_id,state_json,updated_at_ms)
             VALUES (?1,?2,?3)",
            rusqlite::params![
                task.id.as_str(),
                serde_json::to_string(&LoopGuardState::default())?,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_budget_state_v2(task_id,state_json,updated_at_ms)
             VALUES (?1,?2,?3)",
            rusqlite::params![
                task.id.as_str(),
                serde_json::to_string(&TaskBudgetState::default())?,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_graph_revisions_v2(task_id,revision,updated_at_ms)
             VALUES (?1,0,?2)",
            rusqlite::params![task.id.as_str(), now_ms],
        )?;
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,1,0,?2,?3)",
            rusqlite::params![
                task.id.as_str(),
                serde_json::to_string(&OrchestrationEventKind::TaskCreated)?,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_result_contracts_v2
               (task_id,revision,contract_json,reason,created_at_ms)
             VALUES (?1,1,?2,'task_created',?3)",
            rusqlite::params![task.id.as_str(), result_contract, now_ms],
        )?;
        tx.commit()?;
        Ok(TaskRecord {
            task: task.clone(),
            result_contract_revision: 1,
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
        })
    }

    pub fn get_task(&self, task_id: &TaskId) -> Result<Option<TaskRecord>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let row: Option<(String, String, String, i64, i64, i64)> = conn
            .query_row(
                "SELECT status_json,provider_configuration_json,budget_json,
                        result_contract_revision,created_at_ms,updated_at_ms
                 FROM tasks_v2 WHERE id=?1",
                [task_id.as_str()],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .optional()?;
        let Some((status, provider_configuration, budget, revision, created_at, updated_at)) = row
        else {
            return Ok(None);
        };
        let contract: String = conn.query_row(
            "SELECT contract_json FROM task_result_contracts_v2
             WHERE task_id=?1 AND revision=?2",
            rusqlite::params![task_id.as_str(), revision],
            |row| row.get(0),
        )?;
        Ok(Some(TaskRecord {
            task: Task {
                id: task_id.clone(),
                status: serde_json::from_str(&status)?,
                result_contract: serde_json::from_str(&contract)?,
                provider_configuration: serde_json::from_str(&provider_configuration)?,
                budget: serde_json::from_str(&budget)?,
            },
            result_contract_revision: revision as u64,
            created_at_ms: created_at,
            updated_at_ms: updated_at,
        }))
    }

    pub fn task_snapshot(&self, task_id: &TaskId) -> Result<RunSnapshot, StoreError> {
        let record = self
            .get_task(task_id)?
            .ok_or_else(|| StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            })?;
        let task_graph = self.get_task_graph(task_id)?;
        let session_leases = self.list_task_session_leases(task_id)?;
        let artifacts = self.list_task_artifacts(task_id)?;
        let cache_receipts = self.list_task_cache_receipts(task_id)?;
        let risk_gates = self.list_task_risk_gates(task_id)?;
        let budget_state = self.task_budget_state(task_id)?;
        let loop_guard = self.task_loop_guard(task_id)?;
        let agents = self.task_agents(task_id, &session_leases)?;
        let mut blockers = BTreeSet::new();
        blockers.extend(
            task_graph
                .work_items
                .iter()
                .filter_map(|item| item.blocker.clone()),
        );
        blockers.extend(loop_guard.pause_reason.iter().cloned());
        blockers.extend(budget_state.hard_limit_reason.iter().cloned());
        blockers.extend(
            risk_gates
                .iter()
                .filter_map(|receipt| match &receipt.decision {
                    RiskGateDecision::Pending => Some(format!(
                        "risk decision pending: {} -> {} ({})",
                        receipt.action, receipt.target, receipt.scope
                    )),
                    RiskGateDecision::Refused { reason } => Some(format!(
                        "risk effect refused: {} -> {} ({reason})",
                        receipt.action, receipt.target
                    )),
                    RiskGateDecision::Approved { .. } => None,
                }),
        );
        Ok(RunSnapshot {
            task_id: task_id.clone(),
            revision: task_graph.revision,
            result_contract_revision: record.result_contract_revision,
            status: record.task.status,
            result_contract: record.task.result_contract,
            provider_configuration: record.task.provider_configuration,
            task_graph,
            agents,
            session_leases,
            artifacts,
            cache_receipts,
            risk_gates,
            blockers: blockers.into_iter().collect(),
            budget: record.task.budget,
            budget_state,
            loop_guard,
        })
    }

    fn task_agents(
        &self,
        task_id: &TaskId,
        leases: &[TaskSessionLease],
    ) -> Result<Vec<AgentAssignment>, StoreError> {
        let mut agents: Vec<_> = leases
            .iter()
            .filter(|lease| lease.role == AgentRole::Manager)
            .map(|lease| AgentAssignment {
                agent_id: lease.agent_id.clone(),
                role: AgentRole::Manager,
                status: if lease.released_at_ms.is_some() {
                    AgentStatus::Completed
                } else {
                    AgentStatus::Running
                },
                session_id: lease.session_id.clone(),
                work_item_id: None,
            })
            .collect();
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT work_item_id,agent_id,session_id,status
             FROM task_work_item_attempts_v2
             WHERE task_id=?1 ORDER BY started_at_ms ASC,work_item_id ASC,attempt ASC",
        )?;
        let rows = statement.query_map([task_id.as_str()], |row| {
            let status: String = row.get(3)?;
            Ok(AgentAssignment {
                agent_id: AgentId::new(row.get::<_, String>(1)?),
                role: AgentRole::Executor,
                status: agent_status_db(&status)?,
                session_id: row.get(2)?,
                work_item_id: Some(WorkItemId::new(row.get::<_, String>(0)?)),
            })
        })?;
        agents.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        Ok(agents)
    }

    pub fn refine_result_contract(
        &self,
        task_id: &TaskId,
        refinement: &ResultContractRefinement,
        now_ms: i64,
    ) -> Result<TaskRecord, StoreError> {
        validate_refinement(refinement)?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let current: Option<(i64, String)> = tx
            .query_row(
                "SELECT t.result_contract_revision,c.contract_json
                 FROM tasks_v2 t
                 JOIN task_result_contracts_v2 c
                   ON c.task_id=t.id AND c.revision=t.result_contract_revision
                 WHERE t.id=?1",
                [task_id.as_str()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let Some((actual_revision, contract_json)) = current else {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        };
        if actual_revision as u64 != refinement.expected_revision {
            return Err(StoreError::ResultContractRevisionConflict {
                task_id: task_id.as_str().to_string(),
                expected: refinement.expected_revision,
                actual: actual_revision as u64,
            });
        }
        let mut contract: ResultContract = serde_json::from_str(&contract_json)?;
        let previous = contract.clone();
        if let Some(goal) = &refinement.clarified_goal {
            contract.goal = goal.trim().to_string();
        }
        append_unique(
            &mut contract.required_deliverables,
            &refinement.add_required_deliverables,
        );
        append_unique(
            &mut contract.completion_conditions,
            &refinement.add_completion_conditions,
        );
        append_unique(&mut contract.boundaries, &refinement.add_boundaries);
        append_unique(&mut contract.known_risks, &refinement.add_known_risks);
        append_unique(
            &mut contract.unresolved_facts,
            &refinement.add_unresolved_facts,
        );
        if contract == previous {
            return Err(StoreError::InvalidResultContractRefinement(
                "refinement must add or clarify contract content".into(),
            ));
        }
        let goal_change = (contract.goal != previous.goal).then(|| MaterialGoalChangeReceipt {
            before: previous.goal,
            after: contract.goal.clone(),
            reason: refinement.reason.trim().to_string(),
        });
        let next_revision = actual_revision.checked_add(1).ok_or_else(|| {
            StoreError::InvalidResultContractRefinement("revision exceeds SQLite range".into())
        })?;
        tx.execute(
            "INSERT INTO task_result_contracts_v2
               (task_id,revision,contract_json,reason,created_at_ms)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                task_id.as_str(),
                next_revision,
                serde_json::to_string(&contract)?,
                refinement.reason.trim(),
                now_ms,
            ],
        )?;
        tx.execute(
            "UPDATE tasks_v2
             SET result_contract_revision=?2,updated_at_ms=?3
             WHERE id=?1",
            rusqlite::params![task_id.as_str(), next_revision, now_ms],
        )?;
        let graph_revision: i64 = tx.query_row(
            "SELECT revision FROM task_graph_revisions_v2 WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let sequence: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_orchestration_events_v2
             WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let kind = OrchestrationEventKind::ResultContractRefined {
            previous_revision: actual_revision as u64,
            revision: next_revision as u64,
            reason: refinement.reason.trim().to_string(),
            goal_change,
        };
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                task_id.as_str(),
                sequence,
                graph_revision,
                serde_json::to_string(&kind)?,
                now_ms,
            ],
        )?;
        tx.commit()?;
        drop(conn);
        self.get_task(task_id)?
            .ok_or_else(|| StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            })
    }

    pub fn finalize_task(
        &self,
        task_id: &TaskId,
        now_ms: i64,
    ) -> Result<TaskCompletionEvaluation, StoreError> {
        let record = self
            .get_task(task_id)?
            .ok_or_else(|| StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            })?;
        let graph = self.get_task_graph(task_id)?;
        let evaluation = evaluate_completion(&record.task.result_contract, &graph);
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let current: (i64, i64) = tx.query_row(
            "SELECT t.result_contract_revision,g.revision
             FROM tasks_v2 t
             JOIN task_graph_revisions_v2 g ON g.task_id=t.id
             WHERE t.id=?1",
            [task_id.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        if current.0 as u64 != record.result_contract_revision {
            return Err(StoreError::ResultContractRevisionConflict {
                task_id: task_id.as_str().to_string(),
                expected: record.result_contract_revision,
                actual: current.0 as u64,
            });
        }
        if current.1 as u64 != graph.revision {
            return Err(StoreError::TaskRevisionConflict {
                task_id: task_id.as_str().to_string(),
                expected: graph.revision,
                actual: current.1 as u64,
            });
        }
        tx.execute(
            "UPDATE tasks_v2 SET status_json=?2,updated_at_ms=?3 WHERE id=?1",
            rusqlite::params![
                task_id.as_str(),
                serde_json::to_string(&evaluation.status)?,
                now_ms,
            ],
        )?;
        let sequence: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_orchestration_events_v2
             WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let kind = OrchestrationEventKind::TaskOutcomeRecorded {
            status: evaluation.status,
        };
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                task_id.as_str(),
                sequence,
                graph.revision,
                serde_json::to_string(&kind)?,
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(evaluation)
    }

    pub fn apply_task_graph(
        &self,
        task_id: &TaskId,
        expected_revision: u64,
        graph: &TaskGraph,
        reason: &str,
        now_ms: i64,
    ) -> Result<OrchestrationEvent, StoreError> {
        validate_graph(graph)?;
        let next_revision = expected_revision.checked_add(1).ok_or_else(|| {
            StoreError::InvalidTaskGraph("expected revision cannot be incremented".into())
        })?;
        if graph.revision != next_revision {
            return Err(StoreError::InvalidTaskGraph(format!(
                "next revision must be {next_revision}, got {}",
                graph.revision
            )));
        }
        let revision = i64::try_from(graph.revision)
            .map_err(|_| StoreError::InvalidTaskGraph("revision exceeds SQLite range".into()))?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let task_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM tasks_v2 WHERE id=?1)",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        if !task_exists {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        }
        let actual_revision: i64 = tx.query_row(
            "SELECT revision FROM task_graph_revisions_v2 WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        if actual_revision as u64 != expected_revision {
            return Err(StoreError::TaskRevisionConflict {
                task_id: task_id.as_str().to_string(),
                expected: expected_revision,
                actual: actual_revision as u64,
            });
        }
        let running: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM task_work_item_attempts_v2
               WHERE task_id=?1 AND status='running'
             )",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        if running {
            return Err(StoreError::TaskExecutorBusy {
                task_id: task_id.as_str().to_string(),
            });
        }
        tx.execute(
            "DELETE FROM task_work_item_edges_v2 WHERE task_id=?1 AND graph_revision=?2",
            rusqlite::params![task_id.as_str(), revision],
        )?;
        tx.execute(
            "DELETE FROM task_work_items_v2 WHERE task_id=?1 AND graph_revision=?2",
            rusqlite::params![task_id.as_str(), revision],
        )?;
        for (position, item) in graph.work_items.iter().enumerate() {
            tx.execute(
                "INSERT INTO task_work_items_v2
                   (task_id,graph_revision,work_item_id,position,item_json)
                 VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params![
                    task_id.as_str(),
                    revision,
                    item.id.as_str(),
                    position as i64,
                    serde_json::to_string(item)?,
                ],
            )?;
        }
        for (position, edge) in graph.edges.iter().enumerate() {
            tx.execute(
                "INSERT INTO task_work_item_edges_v2
                   (task_id,graph_revision,position,prerequisite,dependent)
                 VALUES (?1,?2,?3,?4,?5)",
                rusqlite::params![
                    task_id.as_str(),
                    revision,
                    position as i64,
                    edge.prerequisite.as_str(),
                    edge.dependent.as_str(),
                ],
            )?;
        }
        tx.execute(
            "UPDATE task_graph_revisions_v2 SET revision=?2,updated_at_ms=?3 WHERE task_id=?1",
            rusqlite::params![task_id.as_str(), revision, now_ms],
        )?;
        tx.execute(
            "UPDATE tasks_v2 SET updated_at_ms=?2 WHERE id=?1",
            rusqlite::params![task_id.as_str(), now_ms],
        )?;
        let sequence: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_orchestration_events_v2
             WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let kind = OrchestrationEventKind::TaskGraphChanged {
            reason: reason.to_string(),
        };
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                task_id.as_str(),
                sequence,
                revision,
                serde_json::to_string(&kind)?,
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(OrchestrationEvent {
            task_id: task_id.clone(),
            sequence: sequence as u64,
            graph_revision: graph.revision,
            kind,
            created_at_ms: now_ms,
        })
    }

    pub fn get_task_graph(&self, task_id: &TaskId) -> Result<TaskGraph, StoreError> {
        let conn = self.conn.lock().unwrap();
        let revision: Option<i64> = conn
            .query_row(
                "SELECT revision FROM task_graph_revisions_v2 WHERE task_id=?1",
                [task_id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        let Some(revision) = revision else {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        };
        let mut item_statement = conn.prepare(
            "SELECT item_json FROM task_work_items_v2
             WHERE task_id=?1 AND graph_revision=?2 ORDER BY position ASC",
        )?;
        let item_rows = item_statement
            .query_map(rusqlite::params![task_id.as_str(), revision], |row| {
                row.get::<_, String>(0)
            })?;
        let mut work_items = Vec::new();
        for item in item_rows {
            work_items.push(serde_json::from_str(&item?)?);
        }
        let mut edge_statement = conn.prepare(
            "SELECT prerequisite,dependent FROM task_work_item_edges_v2
             WHERE task_id=?1 AND graph_revision=?2 ORDER BY position ASC",
        )?;
        let edge_rows =
            edge_statement.query_map(rusqlite::params![task_id.as_str(), revision], |row| {
                Ok(WorkItemEdge {
                    prerequisite: WorkItemId::new(row.get::<_, String>(0)?),
                    dependent: WorkItemId::new(row.get::<_, String>(1)?),
                })
            })?;
        Ok(TaskGraph {
            revision: revision as u64,
            work_items,
            edges: edge_rows.collect::<rusqlite::Result<Vec<_>>>()?,
        })
    }

    pub fn start_work_item_attempt(
        &self,
        task_id: &TaskId,
        work_item_id: &WorkItemId,
        agent_id: &AgentId,
        session_id: &str,
        now_ms: i64,
    ) -> Result<WorkItemAttempt, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let work_item_exists: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM task_work_items_v2 wi
               JOIN task_graph_revisions_v2 gr
                 ON gr.task_id=wi.task_id AND gr.revision=wi.graph_revision
               WHERE wi.task_id=?1 AND wi.work_item_id=?2
             )",
            rusqlite::params![task_id.as_str(), work_item_id.as_str()],
            |row| row.get(0),
        )?;
        if !work_item_exists {
            return Err(StoreError::WorkItemNotFound {
                task_id: task_id.as_str().to_string(),
                work_item_id: work_item_id.as_str().to_string(),
            });
        }
        let leased_role: Option<String> = tx
            .query_row(
                "SELECT role FROM task_session_leases_v2
                 WHERE session_id=?1 AND released_at_ms IS NULL",
                [session_id],
                |row| row.get(0),
            )
            .optional()?;
        if leased_role.as_deref() == Some("manager") {
            return Err(invalid_attempt(
                task_id,
                work_item_id,
                0,
                "Manager Session cannot execute a Work Item",
            ));
        }
        let running: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM task_work_item_attempts_v2
               WHERE task_id=?1 AND status='running'
             )",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        if running {
            return Err(StoreError::TaskExecutorBusy {
                task_id: task_id.as_str().to_string(),
            });
        }
        let attempt: i64 = tx.query_row(
            "SELECT COALESCE(MAX(attempt),0)+1 FROM task_work_item_attempts_v2
             WHERE task_id=?1 AND work_item_id=?2",
            rusqlite::params![task_id.as_str(), work_item_id.as_str()],
            |row| row.get(0),
        )?;
        tx.execute(
            "INSERT INTO task_work_item_attempts_v2
               (task_id,work_item_id,attempt,agent_id,session_id,status,started_at_ms)
             VALUES (?1,?2,?3,?4,?5,'running',?6)",
            rusqlite::params![
                task_id.as_str(),
                work_item_id.as_str(),
                attempt,
                agent_id.as_str(),
                session_id,
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(WorkItemAttempt {
            task_id: task_id.clone(),
            work_item_id: work_item_id.clone(),
            attempt: attempt as u32,
            agent_id: agent_id.clone(),
            session_id: session_id.to_string(),
            status: WorkItemAttemptStatus::Running,
            started_at_ms: now_ms,
            finished_at_ms: None,
        })
    }

    pub fn finish_work_item_attempt(
        &self,
        task_id: &TaskId,
        work_item_id: &WorkItemId,
        attempt: u32,
        status: WorkItemAttemptStatus,
        now_ms: i64,
    ) -> Result<WorkItemAttempt, StoreError> {
        if status == WorkItemAttemptStatus::Running {
            return Err(invalid_attempt(
                task_id,
                work_item_id,
                attempt,
                "terminal status required",
            ));
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let row: Option<(String, String, i64, String)> = tx
            .query_row(
                "SELECT agent_id,session_id,started_at_ms,status
                 FROM task_work_item_attempts_v2
                 WHERE task_id=?1 AND work_item_id=?2 AND attempt=?3",
                rusqlite::params![task_id.as_str(), work_item_id.as_str(), attempt],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()?;
        let Some((agent_id, session_id, started_at_ms, current_status)) = row else {
            return Err(invalid_attempt(
                task_id,
                work_item_id,
                attempt,
                "attempt does not exist",
            ));
        };
        if current_status != "running" {
            return Err(invalid_attempt(
                task_id,
                work_item_id,
                attempt,
                "attempt is already terminal",
            ));
        }
        tx.execute(
            "UPDATE task_work_item_attempts_v2
             SET status=?4,finished_at_ms=?5
             WHERE task_id=?1 AND work_item_id=?2 AND attempt=?3",
            rusqlite::params![
                task_id.as_str(),
                work_item_id.as_str(),
                attempt,
                attempt_status_db(status),
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(WorkItemAttempt {
            task_id: task_id.clone(),
            work_item_id: work_item_id.clone(),
            attempt,
            agent_id: AgentId::new(agent_id),
            session_id,
            status,
            started_at_ms,
            finished_at_ms: Some(now_ms),
        })
    }

    pub fn list_orchestration_events(
        &self,
        task_id: &TaskId,
    ) -> Result<Vec<OrchestrationEvent>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT sequence,graph_revision,kind_json,created_at_ms
             FROM task_orchestration_events_v2
             WHERE task_id=?1 ORDER BY sequence ASC",
        )?;
        let rows = statement.query_map([task_id.as_str()], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        let mut events = Vec::new();
        for row in rows {
            let (sequence, graph_revision, kind, created_at_ms) = row?;
            events.push(OrchestrationEvent {
                task_id: task_id.clone(),
                sequence: sequence as u64,
                graph_revision: graph_revision as u64,
                kind: serde_json::from_str(&kind)?,
                created_at_ms,
            });
        }
        Ok(events)
    }

    pub fn lease_task_session(
        &self,
        task_id: &TaskId,
        session_id: &str,
        agent_id: &AgentId,
        role: AgentRole,
        compatibility_identity: &str,
        now_ms: i64,
    ) -> Result<TaskSessionLease, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let task_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM tasks_v2 WHERE id=?1)",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        if !task_exists {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        }
        let session_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1)",
            [session_id],
            |row| row.get(0),
        )?;
        if !session_exists {
            return Err(StoreError::SessionLeaseConflict {
                session_id: session_id.to_string(),
                reason: "session does not exist".into(),
            });
        }
        let existing: Option<TaskSessionLease> = tx
            .query_row(
                "SELECT lease_id,task_id,session_id,agent_id,role,compatibility_identity,
                        leased_at_ms,released_at_ms
                 FROM task_session_leases_v2
                 WHERE session_id=?1 AND released_at_ms IS NULL",
                [session_id],
                task_session_lease_row,
            )
            .optional()?;
        if let Some(existing) = existing {
            if existing.task_id == *task_id
                && existing.agent_id == *agent_id
                && existing.role == role
                && existing.compatibility_identity == compatibility_identity
            {
                return Ok(existing);
            }
            return Err(StoreError::SessionLeaseConflict {
                session_id: session_id.to_string(),
                reason: "active lease has a different Task, Agent, role, or compatibility identity"
                    .into(),
            });
        }
        tx.execute(
            "INSERT INTO task_session_leases_v2
               (task_id,session_id,agent_id,role,compatibility_identity,leased_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6)",
            rusqlite::params![
                task_id.as_str(),
                session_id,
                agent_id.as_str(),
                agent_role_db(role),
                compatibility_identity,
                now_ms,
            ],
        )?;
        let lease = TaskSessionLease {
            lease_id: tx.last_insert_rowid(),
            task_id: task_id.clone(),
            session_id: session_id.to_string(),
            agent_id: agent_id.clone(),
            role,
            compatibility_identity: compatibility_identity.to_string(),
            leased_at_ms: now_ms,
            released_at_ms: None,
        };
        tx.commit()?;
        Ok(lease)
    }

    pub fn list_task_session_leases(
        &self,
        task_id: &TaskId,
    ) -> Result<Vec<TaskSessionLease>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT lease_id,task_id,session_id,agent_id,role,compatibility_identity,
                    leased_at_ms,released_at_ms
             FROM task_session_leases_v2 WHERE task_id=?1 ORDER BY lease_id ASC",
        )?;
        let rows = statement.query_map([task_id.as_str()], task_session_lease_row)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    pub fn record_task_artifact(&self, provenance: &ArtifactProvenance) -> Result<(), StoreError> {
        if provenance.artifact_key.is_empty() || provenance.artifact_key.len() > 128 {
            return Err(StoreError::InvalidTaskArtifact(
                "artifact_key must contain between 1 and 128 bytes".into(),
            ));
        }
        if provenance.storage_reference != provenance.artifact_id {
            return Err(StoreError::InvalidTaskArtifact(
                "storage_reference must be the opaque Artifact id".into(),
            ));
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let attempt_exists: bool = tx.query_row(
            "SELECT EXISTS(
                   SELECT 1 FROM task_work_item_attempts_v2
                   WHERE task_id=?1 AND work_item_id=?2 AND attempt=?3
                     AND agent_id=?4 AND session_id=?5
                 )",
            rusqlite::params![
                provenance.task_id.as_str(),
                provenance.work_item_id.as_str(),
                provenance.attempt,
                provenance.agent_id.as_str(),
                provenance.session_id,
            ],
            |row| row.get(0),
        )?;
        if !attempt_exists {
            return Err(StoreError::InvalidTaskArtifact(
                "producing Work Item attempt, Agent, or Session does not match".into(),
            ));
        }
        let stored_digest: Option<String> = tx
            .query_row(
                "SELECT digest FROM artifacts WHERE id=?1",
                [provenance.artifact_id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        if stored_digest.as_deref() != Some(provenance.content_identity.as_str()) {
            return Err(StoreError::InvalidTaskArtifact(
                "content identity does not match content-addressed Artifact storage".into(),
            ));
        }
        let expected_version: i64 = tx.query_row(
            "SELECT COALESCE(MAX(version),0)+1 FROM task_artifacts_v2
             WHERE task_id=?1 AND work_item_id=?2 AND artifact_key=?3",
            rusqlite::params![
                provenance.task_id.as_str(),
                provenance.work_item_id.as_str(),
                provenance.artifact_key,
            ],
            |row| row.get(0),
        )?;
        if provenance.version as i64 != expected_version {
            return Err(StoreError::InvalidTaskArtifact(format!(
                "expected version {expected_version}, got {}",
                provenance.version
            )));
        }
        tx.execute(
            "INSERT INTO task_artifacts_v2
               (task_id,work_item_id,artifact_key,version,attempt,artifact_id,
                provenance_json,created_at_ms)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![
                provenance.task_id.as_str(),
                provenance.work_item_id.as_str(),
                provenance.artifact_key,
                provenance.version,
                provenance.attempt,
                provenance.artifact_id,
                serde_json::to_string(provenance)?,
                provenance.created_at_ms,
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn list_task_artifacts(
        &self,
        task_id: &TaskId,
    ) -> Result<Vec<ArtifactProvenance>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT provenance_json FROM task_artifacts_v2
             WHERE task_id=?1
             ORDER BY created_at_ms ASC, work_item_id ASC, artifact_key ASC, version ASC",
        )?;
        let rows = statement.query_map([task_id.as_str()], |row| row.get::<_, String>(0))?;
        let mut artifacts = Vec::new();
        for row in rows {
            artifacts.push(serde_json::from_str(&row?)?);
        }
        Ok(artifacts)
    }

    pub fn record_task_cache_receipt(&self, receipt: &TaskCacheReceipt) -> Result<(), StoreError> {
        if receipt
            .structural_reuse
            .stable_prefix_identity
            .trim()
            .is_empty()
            || receipt
                .structural_reuse
                .session_compatibility_identity
                .trim()
                .is_empty()
        {
            return Err(StoreError::InvalidTaskCacheReceipt(
                "structural identities cannot be empty".into(),
            ));
        }
        let conn = self.conn.lock().unwrap();
        let attempt_exists: bool = conn.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM task_work_item_attempts_v2
               WHERE task_id=?1 AND work_item_id=?2 AND attempt=?3
             )",
            rusqlite::params![
                receipt.task_id.as_str(),
                receipt.work_item_id.as_str(),
                receipt.attempt,
            ],
            |row| row.get(0),
        )?;
        if !attempt_exists {
            return Err(StoreError::InvalidTaskCacheReceipt(
                "receipt does not match a Work Item attempt".into(),
            ));
        }
        conn.execute(
            "INSERT INTO task_cache_receipts_v2
               (task_id,work_item_id,attempt,receipt_json,recorded_at_ms)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                receipt.task_id.as_str(),
                receipt.work_item_id.as_str(),
                receipt.attempt,
                serde_json::to_string(receipt)?,
                receipt.recorded_at_ms,
            ],
        )?;
        Ok(())
    }

    pub fn list_task_cache_receipts(
        &self,
        task_id: &TaskId,
    ) -> Result<Vec<TaskCacheReceipt>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let task_exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tasks_v2 WHERE id=?1)",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        if !task_exists {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        }
        let mut statement = conn.prepare(
            "SELECT receipt_json FROM task_cache_receipts_v2
             WHERE task_id=?1 ORDER BY recorded_at_ms ASC,work_item_id ASC,attempt ASC",
        )?;
        let rows = statement.query_map([task_id.as_str()], |row| row.get::<_, String>(0))?;
        let mut receipts = Vec::new();
        for row in rows {
            receipts.push(serde_json::from_str(&row?)?);
        }
        Ok(receipts)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn request_risk_gate(
        &self,
        task_id: &TaskId,
        work_item_id: &WorkItemId,
        action: &str,
        target: &str,
        scope: &str,
        effect: ConcreteEffect,
        now_ms: i64,
    ) -> Result<RiskGateReceipt, StoreError> {
        validate_risk_text("action", action)?;
        validate_risk_text("target", target)?;
        validate_risk_text("scope", scope)?;
        if !effect_requires_risk_gate(effect) {
            return Err(StoreError::InvalidRiskGate(
                "read and local preparation effects do not require a Risk Gate".into(),
            ));
        }
        let identity = serde_json::to_vec(&(
            task_id,
            work_item_id,
            action.trim(),
            target.trim(),
            scope.trim(),
            effect,
            now_ms,
        ))?;
        let receipt = RiskGateReceipt {
            request_id: blake3::hash(&identity).to_hex().to_string(),
            task_id: task_id.clone(),
            work_item_id: work_item_id.clone(),
            action: action.trim().to_string(),
            target: target.trim().to_string(),
            scope: scope.trim().to_string(),
            effect,
            decision: RiskGateDecision::Pending,
            created_at_ms: now_ms,
            decided_at_ms: None,
        };
        let conn = self.conn.lock().unwrap();
        let work_item_exists: bool = conn.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM task_work_items_v2 wi
               JOIN task_graph_revisions_v2 gr
                 ON gr.task_id=wi.task_id AND gr.revision=wi.graph_revision
               WHERE wi.task_id=?1 AND wi.work_item_id=?2
             )",
            rusqlite::params![task_id.as_str(), work_item_id.as_str()],
            |row| row.get(0),
        )?;
        if !work_item_exists {
            return Err(StoreError::WorkItemNotFound {
                task_id: task_id.as_str().to_string(),
                work_item_id: work_item_id.as_str().to_string(),
            });
        }
        let existing: Option<String> = conn
            .query_row(
                "SELECT receipt_json FROM task_risk_gates_v2 WHERE request_id=?1",
                [receipt.request_id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(existing) = existing {
            return Ok(serde_json::from_str(&existing)?);
        }
        conn.execute(
            "INSERT INTO task_risk_gates_v2
               (request_id,task_id,work_item_id,receipt_json,created_at_ms)
            VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                receipt.request_id.as_str(),
                task_id.as_str(),
                work_item_id.as_str(),
                serde_json::to_string(&receipt)?,
                now_ms,
            ],
        )?;
        Ok(receipt)
    }

    pub fn record_user_risk_decision(
        &self,
        request_id: &str,
        decision: UserRiskDecision,
        reason: &str,
        now_ms: i64,
    ) -> Result<RiskGateReceipt, StoreError> {
        validate_risk_text("decision reason", reason)?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let receipt_json: Option<String> = tx
            .query_row(
                "SELECT receipt_json FROM task_risk_gates_v2 WHERE request_id=?1",
                [request_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(receipt_json) = receipt_json else {
            return Err(StoreError::InvalidRiskGate(format!(
                "unknown request `{request_id}`"
            )));
        };
        let mut receipt: RiskGateReceipt = serde_json::from_str(&receipt_json)?;
        if receipt.decision != RiskGateDecision::Pending {
            return Err(StoreError::InvalidRiskGate(
                "a decided Risk Gate cannot be overwritten".into(),
            ));
        }
        receipt.decision = match decision {
            UserRiskDecision::Approve => RiskGateDecision::Approved {
                reason: reason.trim().to_string(),
            },
            UserRiskDecision::Refuse => RiskGateDecision::Refused {
                reason: reason.trim().to_string(),
            },
        };
        receipt.decided_at_ms = Some(now_ms);
        tx.execute(
            "UPDATE task_risk_gates_v2
             SET receipt_json=?2,decided_at_ms=?3 WHERE request_id=?1",
            rusqlite::params![request_id, serde_json::to_string(&receipt)?, now_ms],
        )?;
        tx.commit()?;
        Ok(receipt)
    }

    pub fn list_task_risk_gates(
        &self,
        task_id: &TaskId,
    ) -> Result<Vec<RiskGateReceipt>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let task_exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tasks_v2 WHERE id=?1)",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        if !task_exists {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        }
        let mut statement = conn.prepare(
            "SELECT receipt_json FROM task_risk_gates_v2
             WHERE task_id=?1 ORDER BY created_at_ms ASC,request_id ASC",
        )?;
        let rows = statement.query_map([task_id.as_str()], |row| row.get::<_, String>(0))?;
        let mut receipts = Vec::new();
        for row in rows {
            receipts.push(serde_json::from_str(&row?)?);
        }
        Ok(receipts)
    }

    pub fn task_budget_state(&self, task_id: &TaskId) -> Result<TaskBudgetState, StoreError> {
        let conn = self.conn.lock().unwrap();
        let state: Option<String> = conn
            .query_row(
                "SELECT state_json FROM task_budget_state_v2 WHERE task_id=?1",
                [task_id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        let Some(state) = state else {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        };
        Ok(serde_json::from_str(&state)?)
    }

    pub fn record_task_usage(
        &self,
        task_id: &TaskId,
        observation: &TaskUsageObservation,
        now_ms: i64,
    ) -> Result<TaskBudgetState, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let row: Option<(String, String, String)> = tx
            .query_row(
                "SELECT t.status_json,t.budget_json,b.state_json
                 FROM tasks_v2 t
                 JOIN task_budget_state_v2 b ON b.task_id=t.id
                 WHERE t.id=?1",
                [task_id.as_str()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let Some((status_json, budget_json, state_json)) = row else {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        };
        let status: TaskStatus = serde_json::from_str(&status_json)?;
        let budget: TaskBudget = serde_json::from_str(&budget_json)?;
        let mut state: TaskBudgetState = serde_json::from_str(&state_json)?;
        state.fresh_input_tokens = accumulate_observation(
            state.fresh_input_tokens,
            observation.fresh_input_tokens,
            state.observations,
        );
        state.provider_cached_input_tokens = accumulate_observation(
            state.provider_cached_input_tokens,
            observation.provider_cached_input_tokens,
            state.observations,
        );
        state.output_tokens = accumulate_observation(
            state.output_tokens,
            observation.output_tokens,
            state.observations,
        );
        state.cost_microusd = accumulate_observation(
            state.cost_microusd,
            observation.cost_microusd,
            state.observations,
        );
        state.observations = state.observations.saturating_add(1);
        state.elapsed_seconds = state.elapsed_seconds.max(observation.elapsed_seconds);
        state.hard_limit_reason = budget_limit_reason(&budget, &state);
        tx.execute(
            "UPDATE task_budget_state_v2 SET state_json=?2,updated_at_ms=?3 WHERE task_id=?1",
            rusqlite::params![task_id.as_str(), serde_json::to_string(&state)?, now_ms],
        )?;
        if status == TaskStatus::Active {
            if let Some(reason) = state.hard_limit_reason.as_deref() {
                tx.execute(
                    "UPDATE tasks_v2 SET status_json=?2,updated_at_ms=?3 WHERE id=?1",
                    rusqlite::params![
                        task_id.as_str(),
                        serde_json::to_string(&TaskStatus::Paused)?,
                        now_ms,
                    ],
                )?;
                let loop_json: String = tx.query_row(
                    "SELECT state_json FROM task_loop_guard_v2 WHERE task_id=?1",
                    [task_id.as_str()],
                    |row| row.get(0),
                )?;
                let mut loop_state: LoopGuardState = serde_json::from_str(&loop_json)?;
                loop_state.pause_reason = Some(reason.to_string());
                tx.execute(
                    "UPDATE task_loop_guard_v2 SET state_json=?2,updated_at_ms=?3 WHERE task_id=?1",
                    rusqlite::params![
                        task_id.as_str(),
                        serde_json::to_string(&loop_state)?,
                        now_ms,
                    ],
                )?;
                let graph_revision: i64 = tx.query_row(
                    "SELECT revision FROM task_graph_revisions_v2 WHERE task_id=?1",
                    [task_id.as_str()],
                    |row| row.get(0),
                )?;
                let sequence: i64 = tx.query_row(
                    "SELECT COALESCE(MAX(sequence),0)+1 FROM task_orchestration_events_v2
                     WHERE task_id=?1",
                    [task_id.as_str()],
                    |row| row.get(0),
                )?;
                let kind = OrchestrationEventKind::TaskPaused {
                    reason: reason.to_string(),
                };
                tx.execute(
                    "INSERT INTO task_orchestration_events_v2
                       (task_id,sequence,graph_revision,kind_json,created_at_ms)
                     VALUES (?1,?2,?3,?4,?5)",
                    rusqlite::params![
                        task_id.as_str(),
                        sequence,
                        graph_revision,
                        serde_json::to_string(&kind)?,
                        now_ms,
                    ],
                )?;
            }
        }
        tx.commit()?;
        Ok(state)
    }

    pub fn update_task_budget(
        &self,
        task_id: &TaskId,
        budget: &TaskBudget,
        reason: &str,
        now_ms: i64,
    ) -> Result<OrchestrationEvent, StoreError> {
        validate_control_reason(reason)?;
        let mut state = self.task_budget_state(task_id)?;
        state.hard_limit_reason = budget_limit_reason(budget, &state);
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let changed = tx.execute(
            "UPDATE tasks_v2 SET budget_json=?2,updated_at_ms=?3 WHERE id=?1",
            rusqlite::params![task_id.as_str(), serde_json::to_string(budget)?, now_ms],
        )?;
        if changed == 0 {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        }
        tx.execute(
            "UPDATE task_budget_state_v2 SET state_json=?2,updated_at_ms=?3 WHERE task_id=?1",
            rusqlite::params![task_id.as_str(), serde_json::to_string(&state)?, now_ms],
        )?;
        let graph_revision: i64 = tx.query_row(
            "SELECT revision FROM task_graph_revisions_v2 WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let sequence: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_orchestration_events_v2
             WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let kind = OrchestrationEventKind::TaskBudgetChanged {
            reason: reason.trim().to_string(),
        };
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                task_id.as_str(),
                sequence,
                graph_revision,
                serde_json::to_string(&kind)?,
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(OrchestrationEvent {
            task_id: task_id.clone(),
            sequence: sequence as u64,
            graph_revision: graph_revision as u64,
            kind,
            created_at_ms: now_ms,
        })
    }

    pub fn resume_task(
        &self,
        task_id: &TaskId,
        reason: &str,
        now_ms: i64,
    ) -> Result<OrchestrationEvent, StoreError> {
        validate_control_reason(reason)?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let row: Option<(String, String, String, String)> = tx
            .query_row(
                "SELECT t.status_json,t.budget_json,b.state_json,l.state_json
                 FROM tasks_v2 t
                 JOIN task_budget_state_v2 b ON b.task_id=t.id
                 JOIN task_loop_guard_v2 l ON l.task_id=t.id
                 WHERE t.id=?1",
                [task_id.as_str()],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()?;
        let Some((status_json, budget_json, budget_state_json, loop_state_json)) = row else {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        };
        let status: TaskStatus = serde_json::from_str(&status_json)?;
        if status != TaskStatus::Paused {
            return Err(StoreError::InvalidTaskControl(format!(
                "only a paused Task can resume; current status is {status:?}"
            )));
        }
        let budget: TaskBudget = serde_json::from_str(&budget_json)?;
        let mut budget_state: TaskBudgetState = serde_json::from_str(&budget_state_json)?;
        if let Some(reason) = budget_limit_reason(&budget, &budget_state) {
            return Err(StoreError::InvalidTaskControl(format!(
                "Task budget is still exhausted: {reason}"
            )));
        }
        budget_state.hard_limit_reason = None;
        let previous_loop: LoopGuardState = serde_json::from_str(&loop_state_json)?;
        let loop_state = LoopGuardState {
            total_attempts: previous_loop.total_attempts,
            ..LoopGuardState::default()
        };
        tx.execute(
            "UPDATE tasks_v2 SET status_json=?2,updated_at_ms=?3 WHERE id=?1",
            rusqlite::params![
                task_id.as_str(),
                serde_json::to_string(&TaskStatus::Active)?,
                now_ms,
            ],
        )?;
        tx.execute(
            "UPDATE task_budget_state_v2 SET state_json=?2,updated_at_ms=?3 WHERE task_id=?1",
            rusqlite::params![
                task_id.as_str(),
                serde_json::to_string(&budget_state)?,
                now_ms,
            ],
        )?;
        tx.execute(
            "UPDATE task_loop_guard_v2 SET state_json=?2,updated_at_ms=?3 WHERE task_id=?1",
            rusqlite::params![
                task_id.as_str(),
                serde_json::to_string(&loop_state)?,
                now_ms,
            ],
        )?;
        let graph_revision: i64 = tx.query_row(
            "SELECT revision FROM task_graph_revisions_v2 WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let sequence: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_orchestration_events_v2
             WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let kind = OrchestrationEventKind::TaskResumed {
            reason: reason.trim().to_string(),
        };
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                task_id.as_str(),
                sequence,
                graph_revision,
                serde_json::to_string(&kind)?,
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(OrchestrationEvent {
            task_id: task_id.clone(),
            sequence: sequence as u64,
            graph_revision: graph_revision as u64,
            kind,
            created_at_ms: now_ms,
        })
    }

    pub fn task_loop_guard(&self, task_id: &TaskId) -> Result<LoopGuardState, StoreError> {
        let conn = self.conn.lock().unwrap();
        let state: Option<String> = conn
            .query_row(
                "SELECT state_json FROM task_loop_guard_v2 WHERE task_id=?1",
                [task_id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        let Some(state) = state else {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        };
        Ok(serde_json::from_str(&state)?)
    }

    pub fn record_work_item_outcome(
        &self,
        task_id: &TaskId,
        work_item_id: &WorkItemId,
        agent_skill_set_identity: &str,
        succeeded: bool,
        now_ms: i64,
    ) -> Result<LoopGuardState, StoreError> {
        let mut state = self.task_loop_guard(task_id)?;
        state.total_attempts = state.total_attempts.saturating_add(1);
        state.consecutive_failures = if succeeded {
            0
        } else {
            state.consecutive_failures.saturating_add(1)
        };
        state.repeated_work_item_attempts = if succeeded {
            0
        } else if state.last_work_item_id.as_ref() == Some(work_item_id) {
            state.repeated_work_item_attempts.saturating_add(1)
        } else {
            1
        };
        state.repeated_agent_skill_set_attempts = if succeeded {
            0
        } else if state.last_agent_skill_set_identity.as_deref() == Some(agent_skill_set_identity) {
            state.repeated_agent_skill_set_attempts.saturating_add(1)
        } else {
            1
        };
        state.last_work_item_id = Some(work_item_id.clone());
        state.last_agent_skill_set_identity = Some(agent_skill_set_identity.to_string());
        self.write_loop_guard(task_id, &state, now_ms)?;
        Ok(state)
    }

    pub fn record_replan_progress(
        &self,
        task_id: &TaskId,
        progress_identity: &str,
        now_ms: i64,
    ) -> Result<LoopGuardState, StoreError> {
        let mut state = self.task_loop_guard(task_id)?;
        state.replans_without_progress = match state.last_progress_identity.as_deref() {
            None => 0,
            Some(previous) if previous == progress_identity => {
                state.replans_without_progress.saturating_add(1)
            }
            Some(_) => 0,
        };
        state.last_progress_identity = Some(progress_identity.to_string());
        self.write_loop_guard(task_id, &state, now_ms)?;
        Ok(state)
    }

    pub fn pause_task(
        &self,
        task_id: &TaskId,
        reason: &str,
        now_ms: i64,
    ) -> Result<OrchestrationEvent, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let changed = tx.execute(
            "UPDATE tasks_v2 SET status_json=?2,updated_at_ms=?3 WHERE id=?1",
            rusqlite::params![
                task_id.as_str(),
                serde_json::to_string(&TaskStatus::Paused)?,
                now_ms,
            ],
        )?;
        if changed == 0 {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        }
        let mut state: LoopGuardState = serde_json::from_str(&tx.query_row(
            "SELECT state_json FROM task_loop_guard_v2 WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get::<_, String>(0),
        )?)?;
        state.pause_reason = Some(reason.to_string());
        tx.execute(
            "UPDATE task_loop_guard_v2 SET state_json=?2,updated_at_ms=?3 WHERE task_id=?1",
            rusqlite::params![task_id.as_str(), serde_json::to_string(&state)?, now_ms],
        )?;
        let graph_revision: i64 = tx.query_row(
            "SELECT revision FROM task_graph_revisions_v2 WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let sequence: i64 = tx.query_row(
            "SELECT COALESCE(MAX(sequence),0)+1 FROM task_orchestration_events_v2
             WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )?;
        let kind = OrchestrationEventKind::TaskPaused {
            reason: reason.to_string(),
        };
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                task_id.as_str(),
                sequence,
                graph_revision,
                serde_json::to_string(&kind)?,
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(OrchestrationEvent {
            task_id: task_id.clone(),
            sequence: sequence as u64,
            graph_revision: graph_revision as u64,
            kind,
            created_at_ms: now_ms,
        })
    }

    pub fn create_workspace(
        &self,
        id: WorkspaceId,
        name: &str,
        now_ms: i64,
    ) -> Result<Workspace, StoreError> {
        validate_collaboration_text("workspace name", name, 128)?;
        let conn = self.conn.lock().unwrap();
        let existing: Option<(String, String, i64)> = conn
            .query_row(
                "SELECT id,name,created_at_ms FROM team_workspaces_v1 LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        if let Some((existing_id, existing_name, created_at_ms)) = existing {
            if existing_id != id.as_str() {
                return Err(StoreError::CollaborationConflict(
                    "this server already owns a different Workspace".into(),
                ));
            }
            return Ok(Workspace {
                id,
                name: existing_name,
                created_at_ms,
            });
        }
        conn.execute(
            "INSERT INTO team_workspaces_v1(id,name,created_at_ms) VALUES (?1,?2,?3)",
            rusqlite::params![id.as_str(), name.trim(), now_ms],
        )?;
        Ok(Workspace {
            id,
            name: name.trim().to_string(),
            created_at_ms: now_ms,
        })
    }

    pub fn workspace(&self) -> Result<Option<Workspace>, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id,name,created_at_ms FROM team_workspaces_v1 LIMIT 1",
            [],
            |row| {
                Ok(Workspace {
                    id: WorkspaceId::new(row.get::<_, String>(0)?),
                    name: row.get(1)?,
                    created_at_ms: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn create_member(
        &self,
        workspace_id: &WorkspaceId,
        id: MemberId,
        display_name: &str,
        role: WorkspaceRole,
        now_ms: i64,
    ) -> Result<Member, StoreError> {
        validate_collaboration_text("member display name", display_name, 128)?;
        let conn = self.conn.lock().unwrap();
        let workspace_exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM team_workspaces_v1 WHERE id=?1)",
            [workspace_id.as_str()],
            |row| row.get(0),
        )?;
        if !workspace_exists {
            return Err(StoreError::CollaborationConflict(
                "Workspace must exist before adding a Member".into(),
            ));
        }
        conn.execute(
            "INSERT INTO team_members_v1
               (id,workspace_id,display_name,role,active,created_at_ms)
             VALUES (?1,?2,?3,?4,1,?5)",
            rusqlite::params![
                id.as_str(),
                workspace_id.as_str(),
                display_name.trim(),
                serde_json::to_string(&role)?,
                now_ms,
            ],
        )?;
        Ok(Member {
            id,
            workspace_id: workspace_id.clone(),
            display_name: display_name.trim().to_string(),
            role,
            active: true,
            created_at_ms: now_ms,
        })
    }

    pub fn member(&self, member_id: &MemberId) -> Result<Option<Member>, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT workspace_id,display_name,role,active,created_at_ms
             FROM team_members_v1 WHERE id=?1",
            [member_id.as_str()],
            |row| {
                let role: String = row.get(2)?;
                let role = serde_json::from_str(&role).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        2,
                        rusqlite::types::Type::Text,
                        error.into(),
                    )
                })?;
                Ok(Member {
                    id: member_id.clone(),
                    workspace_id: WorkspaceId::new(row.get::<_, String>(0)?),
                    display_name: row.get(1)?,
                    role,
                    active: row.get(3)?,
                    created_at_ms: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_members(&self) -> Result<Vec<Member>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT id,workspace_id,display_name,role,active,created_at_ms
             FROM team_members_v1 ORDER BY created_at_ms,id",
        )?;
        let rows = statement.query_map([], |row| {
            let role: String = row.get(3)?;
            let role = serde_json::from_str(&role).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    error.into(),
                )
            })?;
            Ok(Member {
                id: MemberId::new(row.get::<_, String>(0)?),
                workspace_id: WorkspaceId::new(row.get::<_, String>(1)?),
                display_name: row.get(2)?,
                role,
                active: row.get(4)?,
                created_at_ms: row.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn create_shared_task(
        &self,
        task: &Task,
        workspace_id: &WorkspaceId,
        owner_id: &MemberId,
        collaborator_ids: &[MemberId],
        cwd: &str,
        now_ms: i64,
    ) -> Result<SharedTaskSnapshot, StoreError> {
        validate_collaboration_text("Task id", task.id.as_str(), 256)?;
        validate_collaboration_text("Task goal", &task.result_contract.goal, 16_384)?;
        validate_collaboration_text("Task working directory", cwd, 4_096)?;
        let status = serde_json::to_string(&task.status)?;
        let provider_configuration = serde_json::to_string(&task.provider_configuration)?;
        let budget = serde_json::to_string(&task.budget)?;
        let result_contract = serde_json::to_string(&task.result_contract)?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        require_active_member_on(&tx, owner_id)?;
        let owner_workspace: String = tx.query_row(
            "SELECT workspace_id FROM team_members_v1 WHERE id=?1",
            [owner_id.as_str()],
            |row| row.get(0),
        )?;
        if owner_workspace != workspace_id.as_str() {
            return Err(StoreError::MemberUnauthorized {
                member_id: owner_id.as_str().to_string(),
            });
        }
        let mut unique_collaborators = BTreeSet::new();
        for collaborator_id in collaborator_ids {
            if collaborator_id == owner_id || !unique_collaborators.insert(collaborator_id.as_str())
            {
                continue;
            }
            require_active_member_on(&tx, collaborator_id)?;
            let collaborator_workspace: String = tx.query_row(
                "SELECT workspace_id FROM team_members_v1 WHERE id=?1",
                [collaborator_id.as_str()],
                |row| row.get(0),
            )?;
            if collaborator_workspace != workspace_id.as_str() {
                return Err(StoreError::MemberUnauthorized {
                    member_id: collaborator_id.as_str().to_string(),
                });
            }
        }

        tx.execute(
            "INSERT INTO tasks_v2
               (id,status_json,provider_configuration_json,budget_json,
                result_contract_revision,created_at_ms,updated_at_ms)
             VALUES (?1,?2,?3,?4,1,?5,?5)",
            rusqlite::params![
                task.id.as_str(),
                status,
                provider_configuration,
                budget,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_result_contracts_v2
               (task_id,revision,contract_json,reason,created_at_ms)
             VALUES (?1,1,?2,'shared_task_created',?3)",
            rusqlite::params![task.id.as_str(), result_contract, now_ms],
        )?;
        tx.execute(
            "INSERT INTO task_graph_revisions_v2(task_id,revision,updated_at_ms)
             VALUES (?1,0,?2)",
            rusqlite::params![task.id.as_str(), now_ms],
        )?;
        tx.execute(
            "INSERT INTO task_loop_guard_v2(task_id,state_json,updated_at_ms)
             VALUES (?1,?2,?3)",
            rusqlite::params![
                task.id.as_str(),
                serde_json::to_string(&LoopGuardState::default())?,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_budget_state_v2(task_id,state_json,updated_at_ms)
             VALUES (?1,?2,?3)",
            rusqlite::params![
                task.id.as_str(),
                serde_json::to_string(&TaskBudgetState::default())?,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_orchestration_events_v2
               (task_id,sequence,graph_revision,kind_json,created_at_ms)
             VALUES (?1,1,0,?2,?3)",
            rusqlite::params![
                task.id.as_str(),
                serde_json::to_string(&OrchestrationEventKind::TaskCreated)?,
                now_ms,
            ],
        )?;
        tx.execute(
            "INSERT INTO task_collaboration_v1
               (task_id,workspace_id,owner_id,cwd,revision,created_at_ms,updated_at_ms)
             VALUES (?1,?2,?3,?4,1,?5,?5)",
            rusqlite::params![
                task.id.as_str(),
                workspace_id.as_str(),
                owner_id.as_str(),
                cwd.trim(),
                now_ms,
            ],
        )?;
        for (position, collaborator_id) in collaborator_ids
            .iter()
            .filter(|candidate| candidate != &owner_id)
            .filter(|candidate| unique_collaborators.contains(candidate.as_str()))
            .enumerate()
        {
            tx.execute(
                "INSERT OR IGNORE INTO task_collaborators_v1(task_id,member_id,position)
                 VALUES (?1,?2,?3)",
                rusqlite::params![task.id.as_str(), collaborator_id.as_str(), position as i64],
            )?;
        }
        tx.execute(
            "INSERT INTO task_activity_v1(task_id,sequence,actor_id,kind_json,created_at_ms)
             VALUES (?1,1,?2,?3,?4)",
            rusqlite::params![
                task.id.as_str(),
                owner_id.as_str(),
                serde_json::to_string(&TaskActivityKind::TaskCreated)?,
                now_ms,
            ],
        )?;
        tx.commit()?;
        drop(conn);
        self.shared_task_snapshot(&task.id, owner_id)
    }

    pub fn shared_task_snapshot(
        &self,
        task_id: &TaskId,
        actor_id: &MemberId,
    ) -> Result<SharedTaskSnapshot, StoreError> {
        let collaboration = self.task_collaboration_snapshot(task_id, actor_id)?;
        let runtime = self.task_snapshot(task_id)?;
        Ok(SharedTaskSnapshot {
            runtime,
            collaboration,
        })
    }

    pub fn list_shared_tasks(
        &self,
        actor_id: &MemberId,
    ) -> Result<Vec<SharedTaskSnapshot>, StoreError> {
        let ids = {
            let conn = self.conn.lock().unwrap();
            require_active_member_on(&conn, actor_id)?;
            let mut statement = conn.prepare(
                "SELECT DISTINCT c.task_id
                 FROM task_collaboration_v1 c
                 LEFT JOIN task_collaborators_v1 x ON x.task_id=c.task_id
                 WHERE c.owner_id=?1 OR x.member_id=?1
                 ORDER BY c.updated_at_ms DESC,c.task_id",
            )?;
            let rows = statement.query_map([actor_id.as_str()], |row| {
                Ok(TaskId::new(row.get::<_, String>(0)?))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        ids.iter()
            .map(|task_id| self.shared_task_snapshot(task_id, actor_id))
            .collect()
    }

    pub fn list_attention_items(
        &self,
        actor_id: &MemberId,
    ) -> Result<Vec<AttentionItem>, StoreError> {
        let conn = self.conn.lock().unwrap();
        require_active_member_on(&conn, actor_id)?;
        let mut statement = conn.prepare(
            "SELECT task.task_id,task.revision,suggestion.id,suggestion.author_id,
                    suggestion.created_at_ms
             FROM task_collaboration_v1 task
             JOIN task_suggestions_v1 suggestion ON suggestion.task_id=task.task_id
             WHERE task.owner_id=?1 AND suggestion.status='pending'
             ORDER BY suggestion.created_at_ms,task.task_id,suggestion.id",
        )?;
        let rows = statement.query_map([actor_id.as_str()], |row| {
            Ok(AttentionItem::PendingSuggestion {
                task_id: TaskId::new(row.get::<_, String>(0)?),
                task_revision: row.get::<_, i64>(1)? as u64,
                suggestion_id: SuggestionId::new(row.get::<_, String>(2)?),
                author_id: MemberId::new(row.get::<_, String>(3)?),
                created_at_ms: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn member_can_access_task(
        &self,
        member_id: &MemberId,
        task_id: &TaskId,
    ) -> Result<bool, StoreError> {
        let conn = self.conn.lock().unwrap();
        if require_active_member_on(&conn, member_id).is_err() {
            return Ok(false);
        }
        let allowed: Option<bool> = conn
            .query_row(
                "SELECT owner_id=?2 OR EXISTS(
                     SELECT 1 FROM task_collaborators_v1
                     WHERE task_id=?1 AND member_id=?2
                   )
                 FROM task_collaboration_v1 WHERE task_id=?1",
                rusqlite::params![task_id.as_str(), member_id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        Ok(allowed == Some(true))
    }

    pub fn member_can_access_session(
        &self,
        member_id: &MemberId,
        session_id: &str,
    ) -> Result<bool, StoreError> {
        let conn = self.conn.lock().unwrap();
        if require_active_member_on(&conn, member_id).is_err() {
            return Ok(false);
        }
        conn.query_row(
            "SELECT EXISTS(
               SELECT 1
               FROM task_session_leases_v2 lease
               JOIN task_collaboration_v1 task ON task.task_id=lease.task_id
               LEFT JOIN task_collaborators_v1 collaborator
                 ON collaborator.task_id=task.task_id AND collaborator.member_id=?2
               WHERE lease.session_id=?1
                 AND (task.owner_id=?2 OR collaborator.member_id IS NOT NULL)
             )",
            rusqlite::params![session_id, member_id.as_str()],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    pub fn member_controls_session(
        &self,
        member_id: &MemberId,
        session_id: &str,
    ) -> Result<bool, StoreError> {
        let conn = self.conn.lock().unwrap();
        if require_active_member_on(&conn, member_id).is_err() {
            return Ok(false);
        }
        conn.query_row(
            "SELECT EXISTS(
               SELECT 1
               FROM task_session_leases_v2 lease
               JOIN task_collaboration_v1 task ON task.task_id=lease.task_id
               WHERE lease.session_id=?1 AND task.owner_id=?2
             )",
            rusqlite::params![session_id, member_id.as_str()],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    pub fn session_is_team_managed(&self, session_id: &str) -> Result<bool, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT EXISTS(
               SELECT 1
               FROM task_session_leases_v2 lease
               JOIN task_collaboration_v1 task ON task.task_id=lease.task_id
               WHERE lease.session_id=?1
             )",
            [session_id],
            |row| row.get(0),
        )
        .map_err(Into::into)
    }

    pub fn add_task_comment(
        &self,
        task_id: &TaskId,
        actor_id: &MemberId,
        expected_revision: u64,
        body: &str,
        now_ms: i64,
    ) -> Result<TaskCollaborationSnapshot, StoreError> {
        validate_collaboration_text("comment", body, 16_384)?;
        let comment_id = TaskCommentId::new(format!("comment-{}", uuid::Uuid::new_v4()));
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        require_task_access_on(&tx, task_id, actor_id)?;
        let revision = advance_collaboration_revision_on(&tx, task_id, expected_revision, now_ms)?;
        tx.execute(
            "INSERT INTO task_comments_v1(id,task_id,author_id,body,created_at_ms)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                comment_id.as_str(),
                task_id.as_str(),
                actor_id.as_str(),
                body.trim(),
                now_ms,
            ],
        )?;
        append_task_activity_on(
            &tx,
            task_id,
            actor_id,
            &TaskActivityKind::CommentAdded { comment_id },
            now_ms,
        )?;
        tx.commit()?;
        drop(conn);
        debug_assert_eq!(revision, expected_revision.saturating_add(1));
        self.task_collaboration_snapshot(task_id, actor_id)
    }

    pub fn create_task_suggestion(
        &self,
        task_id: &TaskId,
        actor_id: &MemberId,
        expected_revision: u64,
        body: &str,
        now_ms: i64,
    ) -> Result<TaskCollaborationSnapshot, StoreError> {
        validate_collaboration_text("suggestion", body, 16_384)?;
        let suggestion_id = SuggestionId::new(format!("suggestion-{}", uuid::Uuid::new_v4()));
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        require_task_access_on(&tx, task_id, actor_id)?;
        advance_collaboration_revision_on(&tx, task_id, expected_revision, now_ms)?;
        tx.execute(
            "INSERT INTO task_suggestions_v1
               (id,task_id,author_id,body,status,created_at_ms)
             VALUES (?1,?2,?3,?4,'pending',?5)",
            rusqlite::params![
                suggestion_id.as_str(),
                task_id.as_str(),
                actor_id.as_str(),
                body.trim(),
                now_ms,
            ],
        )?;
        append_task_activity_on(
            &tx,
            task_id,
            actor_id,
            &TaskActivityKind::SuggestionCreated { suggestion_id },
            now_ms,
        )?;
        tx.commit()?;
        drop(conn);
        self.task_collaboration_snapshot(task_id, actor_id)
    }

    pub fn approve_task_suggestion(
        &self,
        task_id: &TaskId,
        suggestion_id: &SuggestionId,
        actor_id: &MemberId,
        command_id: &str,
        expected_revision: u64,
        now_ms: i64,
    ) -> Result<IdempotentCommand<SuggestionApprovalReceipt>, StoreError> {
        validate_command_id(command_id)?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        if let Some((stored_task, stored_actor, action, receipt_json)) = tx
            .query_row(
                "SELECT task_id,actor_id,action,receipt_json
                 FROM task_collaboration_commands_v1 WHERE command_id=?1",
                [command_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()?
        {
            if stored_task != task_id.as_str()
                || stored_actor != actor_id.as_str()
                || action != "approve_suggestion"
            {
                return Err(StoreError::CommandReceiptConflict {
                    protocol: "team".into(),
                    command_id: command_id.to_string(),
                });
            }
            let receipt = serde_json::from_str(&receipt_json)?;
            tx.commit()?;
            return Ok(IdempotentCommand {
                receipt,
                replayed: true,
            });
        }
        require_active_member_on(&tx, actor_id)?;
        let owner_id: String = tx
            .query_row(
                "SELECT owner_id FROM task_collaboration_v1 WHERE task_id=?1",
                [task_id.as_str()],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            })?;
        if owner_id != actor_id.as_str() {
            return Err(StoreError::MemberUnauthorized {
                member_id: actor_id.as_str().to_string(),
            });
        }
        let status: Option<String> = tx
            .query_row(
                "SELECT status FROM task_suggestions_v1 WHERE task_id=?1 AND id=?2",
                rusqlite::params![task_id.as_str(), suggestion_id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        let Some(status) = status else {
            return Err(StoreError::SuggestionNotFound {
                task_id: task_id.as_str().to_string(),
                suggestion_id: suggestion_id.as_str().to_string(),
            });
        };
        if status != "pending" {
            return Err(StoreError::CollaborationConflict(format!(
                "Suggestion is already {status}"
            )));
        }
        let revision = advance_collaboration_revision_on(&tx, task_id, expected_revision, now_ms)?;
        tx.execute(
            "UPDATE task_suggestions_v1
             SET status='approved',decided_by=?3,decided_at_ms=?4,execution_command_id=?5
             WHERE task_id=?1 AND id=?2",
            rusqlite::params![
                task_id.as_str(),
                suggestion_id.as_str(),
                actor_id.as_str(),
                now_ms,
                command_id,
            ],
        )?;
        append_task_activity_on(
            &tx,
            task_id,
            actor_id,
            &TaskActivityKind::SuggestionApproved {
                suggestion_id: suggestion_id.clone(),
            },
            now_ms,
        )?;
        let receipt = SuggestionApprovalReceipt {
            task_id: task_id.clone(),
            suggestion_id: suggestion_id.clone(),
            revision,
            execution_claimed: true,
        };
        tx.execute(
            "INSERT INTO task_collaboration_commands_v1
               (command_id,task_id,actor_id,action,receipt_json,created_at_ms)
             VALUES (?1,?2,?3,'approve_suggestion',?4,?5)",
            rusqlite::params![
                command_id,
                task_id.as_str(),
                actor_id.as_str(),
                serde_json::to_string(&receipt)?,
                now_ms,
            ],
        )?;
        tx.commit()?;
        Ok(IdempotentCommand {
            receipt,
            replayed: false,
        })
    }

    pub fn task_suggestion(
        &self,
        task_id: &TaskId,
        suggestion_id: &SuggestionId,
        actor_id: &MemberId,
    ) -> Result<TaskSuggestion, StoreError> {
        let snapshot = self.task_collaboration_snapshot(task_id, actor_id)?;
        snapshot
            .suggestions
            .into_iter()
            .find(|suggestion| &suggestion.id == suggestion_id)
            .ok_or_else(|| StoreError::SuggestionNotFound {
                task_id: task_id.as_str().to_string(),
                suggestion_id: suggestion_id.as_str().to_string(),
            })
    }

    pub fn link_suggestion_execution(
        &self,
        task_id: &TaskId,
        suggestion_id: &SuggestionId,
        actor_id: &MemberId,
        session_id: &str,
        now_ms: i64,
    ) -> Result<u64, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        require_task_access_on(&tx, task_id, actor_id)?;
        let changed = tx.execute(
            "UPDATE task_suggestions_v1
             SET execution_session_id=?3,execution_error=NULL
             WHERE task_id=?1 AND id=?2 AND status='approved'
               AND execution_session_id IS NULL",
            rusqlite::params![task_id.as_str(), suggestion_id.as_str(), session_id],
        )?;
        if changed == 0 {
            return Err(StoreError::CollaborationConflict(
                "Suggestion execution was already linked or is not approved".into(),
            ));
        }
        let revision = bump_collaboration_revision_on(&tx, task_id, now_ms)?;
        append_task_activity_on(
            &tx,
            task_id,
            actor_id,
            &TaskActivityKind::SuggestionExecutionStarted {
                suggestion_id: suggestion_id.clone(),
                session_id: session_id.to_string(),
            },
            now_ms,
        )?;
        tx.commit()?;
        Ok(revision)
    }

    pub fn fail_suggestion_execution(
        &self,
        task_id: &TaskId,
        suggestion_id: &SuggestionId,
        actor_id: &MemberId,
        message: &str,
        now_ms: i64,
    ) -> Result<u64, StoreError> {
        validate_collaboration_text("execution failure", message, 4_096)?;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        require_task_access_on(&tx, task_id, actor_id)?;
        let changed = tx.execute(
            "UPDATE task_suggestions_v1
             SET status='execution_failed',execution_error=?3
             WHERE task_id=?1 AND id=?2 AND status='approved'
               AND execution_session_id IS NULL",
            rusqlite::params![task_id.as_str(), suggestion_id.as_str(), message.trim()],
        )?;
        if changed == 0 {
            return Err(StoreError::CollaborationConflict(
                "Suggestion execution was already resolved".into(),
            ));
        }
        let revision = bump_collaboration_revision_on(&tx, task_id, now_ms)?;
        append_task_activity_on(
            &tx,
            task_id,
            actor_id,
            &TaskActivityKind::SuggestionExecutionFailed {
                suggestion_id: suggestion_id.clone(),
                message: message.trim().to_string(),
            },
            now_ms,
        )?;
        tx.commit()?;
        Ok(revision)
    }

    fn task_collaboration_snapshot(
        &self,
        task_id: &TaskId,
        actor_id: &MemberId,
    ) -> Result<TaskCollaborationSnapshot, StoreError> {
        let conn = self.conn.lock().unwrap();
        require_task_access_on(&conn, task_id, actor_id)?;
        let (owner_id, cwd, revision): (String, String, i64) = conn.query_row(
            "SELECT owner_id,cwd,revision FROM task_collaboration_v1 WHERE task_id=?1",
            [task_id.as_str()],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        let collaborator_ids = {
            let mut statement = conn.prepare(
                "SELECT member_id FROM task_collaborators_v1
                 WHERE task_id=?1 ORDER BY position,member_id",
            )?;
            let rows = statement.query_map([task_id.as_str()], |row| {
                Ok(MemberId::new(row.get::<_, String>(0)?))
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        let comments = {
            let mut statement = conn.prepare(
                "SELECT id,author_id,body,created_at_ms FROM task_comments_v1
                 WHERE task_id=?1 ORDER BY created_at_ms,id",
            )?;
            let rows = statement.query_map([task_id.as_str()], |row| {
                Ok(TaskComment {
                    id: TaskCommentId::new(row.get::<_, String>(0)?),
                    author_id: MemberId::new(row.get::<_, String>(1)?),
                    body: row.get(2)?,
                    created_at_ms: row.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        let suggestions = {
            let mut statement = conn.prepare(
                "SELECT id,author_id,body,status,decided_by,decided_at_ms,
                        execution_session_id,execution_error,created_at_ms
                 FROM task_suggestions_v1 WHERE task_id=?1 ORDER BY created_at_ms,id",
            )?;
            let rows = statement.query_map([task_id.as_str()], suggestion_row)?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        let activity = {
            let mut statement = conn.prepare(
                "SELECT sequence,actor_id,kind_json,created_at_ms FROM task_activity_v1
                 WHERE task_id=?1 ORDER BY sequence",
            )?;
            let rows = statement.query_map([task_id.as_str()], |row| {
                let kind: String = row.get(2)?;
                let kind = serde_json::from_str(&kind).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        2,
                        rusqlite::types::Type::Text,
                        error.into(),
                    )
                })?;
                Ok(TaskActivityEvent {
                    sequence: row.get::<_, i64>(0)? as u64,
                    actor_id: MemberId::new(row.get::<_, String>(1)?),
                    kind,
                    created_at_ms: row.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()?
        };
        Ok(TaskCollaborationSnapshot {
            task_id: task_id.clone(),
            revision: revision as u64,
            owner_id: MemberId::new(owner_id),
            collaborator_ids,
            cwd,
            comments,
            suggestions,
            activity,
        })
    }

    fn write_loop_guard(
        &self,
        task_id: &TaskId,
        state: &LoopGuardState,
        now_ms: i64,
    ) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE task_loop_guard_v2 SET state_json=?2,updated_at_ms=?3 WHERE task_id=?1",
            rusqlite::params![task_id.as_str(), serde_json::to_string(state)?, now_ms],
        )?;
        if changed == 0 {
            return Err(StoreError::TaskNotFound {
                task_id: task_id.as_str().to_string(),
            });
        }
        Ok(())
    }
}

fn validate_collaboration_text(field: &str, value: &str, maximum: usize) -> Result<(), StoreError> {
    let length = value.trim().chars().count();
    if length == 0 || length > maximum {
        return Err(StoreError::CollaborationConflict(format!(
            "{field} must contain between 1 and {maximum} characters"
        )));
    }
    Ok(())
}

fn validate_command_id(command_id: &str) -> Result<(), StoreError> {
    let length = command_id.trim().chars().count();
    if length == 0 || length > 256 {
        return Err(StoreError::CollaborationConflict(
            "command_id must contain between 1 and 256 characters".into(),
        ));
    }
    Ok(())
}

fn require_active_member_on(
    conn: &rusqlite::Connection,
    member_id: &MemberId,
) -> Result<(), StoreError> {
    let active: Option<bool> = conn
        .query_row(
            "SELECT active FROM team_members_v1 WHERE id=?1",
            [member_id.as_str()],
            |row| row.get(0),
        )
        .optional()?;
    if active != Some(true) {
        return Err(StoreError::MemberUnauthorized {
            member_id: member_id.as_str().to_string(),
        });
    }
    Ok(())
}

fn require_task_access_on(
    conn: &rusqlite::Connection,
    task_id: &TaskId,
    member_id: &MemberId,
) -> Result<(), StoreError> {
    require_active_member_on(conn, member_id)?;
    let allowed: Option<bool> = conn
        .query_row(
            "SELECT owner_id=?2 OR EXISTS(
                 SELECT 1 FROM task_collaborators_v1
                 WHERE task_id=?1 AND member_id=?2
               )
             FROM task_collaboration_v1 WHERE task_id=?1",
            rusqlite::params![task_id.as_str(), member_id.as_str()],
            |row| row.get(0),
        )
        .optional()?;
    match allowed {
        Some(true) => Ok(()),
        Some(false) => Err(StoreError::MemberUnauthorized {
            member_id: member_id.as_str().to_string(),
        }),
        None => Err(StoreError::TaskNotFound {
            task_id: task_id.as_str().to_string(),
        }),
    }
}

fn advance_collaboration_revision_on(
    conn: &rusqlite::Connection,
    task_id: &TaskId,
    expected_revision: u64,
    now_ms: i64,
) -> Result<u64, StoreError> {
    let actual: Option<i64> = conn
        .query_row(
            "SELECT revision FROM task_collaboration_v1 WHERE task_id=?1",
            [task_id.as_str()],
            |row| row.get(0),
        )
        .optional()?;
    let Some(actual) = actual else {
        return Err(StoreError::TaskNotFound {
            task_id: task_id.as_str().to_string(),
        });
    };
    if actual as u64 != expected_revision {
        return Err(StoreError::TaskRevisionConflict {
            task_id: task_id.as_str().to_string(),
            expected: expected_revision,
            actual: actual as u64,
        });
    }
    let revision = expected_revision
        .checked_add(1)
        .ok_or_else(|| StoreError::CollaborationConflict("Task revision is exhausted".into()))?;
    conn.execute(
        "UPDATE task_collaboration_v1 SET revision=?2,updated_at_ms=?3 WHERE task_id=?1",
        rusqlite::params![task_id.as_str(), revision as i64, now_ms],
    )?;
    Ok(revision)
}

fn bump_collaboration_revision_on(
    conn: &rusqlite::Connection,
    task_id: &TaskId,
    now_ms: i64,
) -> Result<u64, StoreError> {
    let revision: i64 = conn
        .query_row(
            "UPDATE task_collaboration_v1
             SET revision=revision+1,updated_at_ms=?2 WHERE task_id=?1
             RETURNING revision",
            rusqlite::params![task_id.as_str(), now_ms],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| StoreError::TaskNotFound {
            task_id: task_id.as_str().to_string(),
        })?;
    Ok(revision as u64)
}

fn append_task_activity_on(
    conn: &rusqlite::Connection,
    task_id: &TaskId,
    actor_id: &MemberId,
    kind: &TaskActivityKind,
    now_ms: i64,
) -> Result<(), StoreError> {
    let sequence: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sequence),0)+1 FROM task_activity_v1 WHERE task_id=?1",
        [task_id.as_str()],
        |row| row.get(0),
    )?;
    conn.execute(
        "INSERT INTO task_activity_v1(task_id,sequence,actor_id,kind_json,created_at_ms)
         VALUES (?1,?2,?3,?4,?5)",
        rusqlite::params![
            task_id.as_str(),
            sequence,
            actor_id.as_str(),
            serde_json::to_string(kind)?,
            now_ms,
        ],
    )?;
    Ok(())
}

fn suggestion_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskSuggestion> {
    let status: String = row.get(3)?;
    let status = match status.as_str() {
        "pending" => SuggestionStatus::Pending,
        "approved" => SuggestionStatus::Approved,
        "rejected" => SuggestionStatus::Rejected,
        "execution_failed" => SuggestionStatus::ExecutionFailed,
        other => {
            return Err(rusqlite::Error::FromSqlConversionFailure(
                3,
                rusqlite::types::Type::Text,
                format!("unknown Suggestion status `{other}`").into(),
            ))
        }
    };
    Ok(TaskSuggestion {
        id: SuggestionId::new(row.get::<_, String>(0)?),
        author_id: MemberId::new(row.get::<_, String>(1)?),
        body: row.get(2)?,
        status,
        decided_by: row.get::<_, Option<String>>(4)?.map(MemberId::new),
        decided_at_ms: row.get(5)?,
        execution_session_id: row.get(6)?,
        execution_error: row.get(7)?,
        created_at_ms: row.get(8)?,
    })
}

fn validate_graph(graph: &TaskGraph) -> Result<(), StoreError> {
    let mut ids = BTreeSet::new();
    for item in &graph.work_items {
        if !ids.insert(item.id.as_str()) {
            return Err(StoreError::InvalidTaskGraph(format!(
                "duplicate Work Item id `{}`",
                item.id.as_str()
            )));
        }
    }
    for edge in &graph.edges {
        if edge.prerequisite == edge.dependent {
            return Err(StoreError::InvalidTaskGraph(format!(
                "Work Item `{}` depends on itself",
                edge.prerequisite.as_str()
            )));
        }
        if !ids.contains(edge.prerequisite.as_str()) || !ids.contains(edge.dependent.as_str()) {
            return Err(StoreError::InvalidTaskGraph(
                "edge names an undeclared Work Item".into(),
            ));
        }
    }
    Ok(())
}

fn validate_refinement(refinement: &ResultContractRefinement) -> Result<(), StoreError> {
    validate_contract_text("reason", &refinement.reason, 2_048)?;
    if let Some(goal) = &refinement.clarified_goal {
        validate_contract_text("clarified_goal", goal, 4_096)?;
    }
    for (field, values) in [
        (
            "required deliverable",
            &refinement.add_required_deliverables,
        ),
        (
            "completion condition",
            &refinement.add_completion_conditions,
        ),
        ("boundary", &refinement.add_boundaries),
        ("known risk", &refinement.add_known_risks),
        ("unresolved fact", &refinement.add_unresolved_facts),
    ] {
        if values.len() > 256 {
            return Err(StoreError::InvalidResultContractRefinement(format!(
                "too many {field} additions"
            )));
        }
        for value in values {
            validate_contract_text(field, value, 2_048)?;
        }
    }
    Ok(())
}

fn validate_contract_text(field: &str, value: &str, maximum: usize) -> Result<(), StoreError> {
    let length = value.trim().chars().count();
    if length == 0 || length > maximum {
        return Err(StoreError::InvalidResultContractRefinement(format!(
            "{field} must contain between 1 and {maximum} characters"
        )));
    }
    Ok(())
}

fn append_unique(target: &mut Vec<String>, additions: &[String]) {
    for addition in additions {
        let addition = addition.trim();
        if !target.iter().any(|existing| existing == addition) {
            target.push(addition.to_string());
        }
    }
}

fn evaluate_completion(contract: &ResultContract, graph: &TaskGraph) -> TaskCompletionEvaluation {
    let successful: Vec<_> = graph
        .work_items
        .iter()
        .filter(|item| {
            item.status == WorkItemStatus::Succeeded && !item.completion_evidence.is_empty()
        })
        .collect();
    let satisfied_deliverables: Vec<_> = contract
        .required_deliverables
        .iter()
        .filter(|deliverable| {
            successful
                .iter()
                .any(|item| item.expected_outputs.contains(deliverable))
        })
        .cloned()
        .collect();
    let missing_deliverables: Vec<_> = contract
        .required_deliverables
        .iter()
        .filter(|deliverable| !satisfied_deliverables.contains(deliverable))
        .cloned()
        .collect();
    let satisfied_conditions: Vec<_> = contract
        .completion_conditions
        .iter()
        .filter(|condition| {
            successful
                .iter()
                .any(|item| item.result_contract_conditions.contains(condition))
        })
        .cloned()
        .collect();
    let missing_conditions: Vec<_> = contract
        .completion_conditions
        .iter()
        .filter(|condition| !satisfied_conditions.contains(condition))
        .cloned()
        .collect();
    let evidence: Vec<_> = successful
        .iter()
        .flat_map(|item| {
            item.completion_evidence
                .iter()
                .map(move |evidence| format!("{}: {evidence}", item.id.as_str()))
        })
        .collect();
    let blockers: Vec<_> = graph
        .work_items
        .iter()
        .filter_map(|item| item.blocker.clone())
        .collect();
    let status = if missing_deliverables.is_empty()
        && missing_conditions.is_empty()
        && contract.unresolved_facts.is_empty()
    {
        TaskStatus::Completed
    } else if !evidence.is_empty() {
        TaskStatus::PartiallyCompleted
    } else {
        TaskStatus::Blocked
    };
    TaskCompletionEvaluation {
        status,
        satisfied_deliverables,
        missing_deliverables,
        satisfied_conditions,
        missing_conditions,
        evidence,
        unresolved_facts: contract.unresolved_facts.clone(),
        blockers,
    }
}

fn accumulate_observation(
    aggregate: Option<u64>,
    observation: Option<u64>,
    previous_observations: u64,
) -> Option<u64> {
    if previous_observations == 0 {
        observation
    } else {
        Some(aggregate?.saturating_add(observation?))
    }
}

fn budget_limit_reason(budget: &TaskBudget, state: &TaskBudgetState) -> Option<String> {
    if let (Some(maximum), Some(observed)) = (budget.max_cost_microusd, state.cost_microusd) {
        if observed >= maximum {
            return Some(format!(
                "cost budget reached: {observed} of {maximum} microusd"
            ));
        }
    }
    if let (Some(maximum), Some(observed)) =
        (budget.max_tokens, state.observed_tokens_excluding_cache())
    {
        if observed >= maximum {
            return Some(format!(
                "token budget reached: {observed} of {maximum} fresh input and output tokens"
            ));
        }
    }
    if let Some(maximum) = budget.max_duration_seconds {
        if state.elapsed_seconds >= maximum {
            return Some(format!(
                "time budget reached: {} of {maximum} seconds",
                state.elapsed_seconds
            ));
        }
    }
    None
}

fn validate_control_reason(reason: &str) -> Result<(), StoreError> {
    let length = reason.trim().chars().count();
    if length == 0 || length > 2_048 {
        return Err(StoreError::InvalidTaskControl(
            "reason must contain between 1 and 2048 characters".into(),
        ));
    }
    Ok(())
}

fn validate_risk_text(field: &str, value: &str) -> Result<(), StoreError> {
    let length = value.trim().chars().count();
    if length == 0 || length > 2_048 {
        return Err(StoreError::InvalidRiskGate(format!(
            "{field} must contain between 1 and 2048 characters"
        )));
    }
    Ok(())
}

fn attempt_status_db(status: WorkItemAttemptStatus) -> &'static str {
    match status {
        WorkItemAttemptStatus::Running => "running",
        WorkItemAttemptStatus::Succeeded => "succeeded",
        WorkItemAttemptStatus::Failed => "failed",
        WorkItemAttemptStatus::Cancelled => "cancelled",
        WorkItemAttemptStatus::Uncertain => "uncertain",
    }
}

fn agent_status_db(status: &str) -> rusqlite::Result<AgentStatus> {
    match status {
        "running" => Ok(AgentStatus::Running),
        "succeeded" => Ok(AgentStatus::Completed),
        "failed" => Ok(AgentStatus::Failed),
        "cancelled" => Ok(AgentStatus::Cancelled),
        "uncertain" => Ok(AgentStatus::Uncertain),
        other => Err(rusqlite::Error::FromSqlConversionFailure(
            3,
            rusqlite::types::Type::Text,
            format!("unknown Work Item attempt status `{other}`").into(),
        )),
    }
}

fn invalid_attempt(
    task_id: &TaskId,
    work_item_id: &WorkItemId,
    attempt: u32,
    reason: impl Into<String>,
) -> StoreError {
    StoreError::InvalidTaskAttempt {
        task_id: task_id.as_str().to_string(),
        work_item_id: work_item_id.as_str().to_string(),
        attempt,
        reason: reason.into(),
    }
}

fn agent_role_db(role: AgentRole) -> &'static str {
    match role {
        AgentRole::Manager => "manager",
        AgentRole::Executor => "executor",
    }
}

fn task_session_lease_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskSessionLease> {
    let role: String = row.get(4)?;
    let role = match role.as_str() {
        "manager" => AgentRole::Manager,
        "executor" => AgentRole::Executor,
        other => {
            return Err(rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                format!("unknown Agent role `{other}`").into(),
            ))
        }
    };
    Ok(TaskSessionLease {
        lease_id: row.get(0)?,
        task_id: TaskId::new(row.get::<_, String>(1)?),
        session_id: row.get(2)?,
        agent_id: AgentId::new(row.get::<_, String>(3)?),
        role,
        compatibility_identity: row.get(5)?,
        leased_at_ms: row.get(6)?,
        released_at_ms: row.get(7)?,
    })
}
