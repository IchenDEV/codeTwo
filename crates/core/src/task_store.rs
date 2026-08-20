//! Durable Scenes 2.0 Task storage.
//!
//! These tables use explicit `*_v2` identities and never read, transform, or delete Agent Scenes
//! 1.0 scene, pipeline, or artifact rows.

use rusqlite::OptionalExtension;

use crate::store::{Store, StoreError};
use crate::task::{Task, TaskId};

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
}
