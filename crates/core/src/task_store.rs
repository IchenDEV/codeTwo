//! Durable Scenes 2.0 Task storage.
//!
//! These tables use explicit `*_v2` identities and never read, transform, or delete Agent Scenes
//! 1.0 scene, pipeline, or artifact rows.

use std::collections::BTreeSet;

use rusqlite::OptionalExtension;

use crate::store::{Store, StoreError};
use crate::task::{
    AgentId, AgentRole, ArtifactProvenance, OrchestrationEvent, OrchestrationEventKind, Task,
    TaskGraph, TaskId, TaskSessionLease, WorkItemAttempt, WorkItemAttemptStatus, WorkItemEdge,
    WorkItemId,
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

fn attempt_status_db(status: WorkItemAttemptStatus) -> &'static str {
    match status {
        WorkItemAttemptStatus::Running => "running",
        WorkItemAttemptStatus::Succeeded => "succeeded",
        WorkItemAttemptStatus::Failed => "failed",
        WorkItemAttemptStatus::Cancelled => "cancelled",
        WorkItemAttemptStatus::Uncertain => "uncertain",
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
