//! User-authored recurring tasks and their durable run history.
//!
//! Schedules are five-field cron expressions evaluated in the timezone captured by the desktop
//! client. The host owns execution; this module owns validation, persistence, due-run claiming,
//! and lifecycle receipts so renderer reloads and app restarts cannot duplicate a run.

use std::str::FromStr;

use chrono::{Datelike, TimeZone, Timelike, Utc};
use chrono_tz::Tz;
use rusqlite::{Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use crate::permission::{PermissionMode, SandboxPolicy};
use crate::provider::ProviderId;
use crate::store::{Store, StoreError};

// Five years keeps leap-day schedules valid even when they are saved just after February 29.
const MAX_SCHEDULE_LOOKAHEAD_MINUTES: i64 = 5 * 366 * 24 * 60;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS automations (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  project_path    TEXT NOT NULL,
  provider        TEXT NOT NULL,
  cron            TEXT NOT NULL,
  timezone        TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  use_worktree    INTEGER NOT NULL DEFAULT 1,
  permission_mode TEXT NOT NULL,
  sandbox_policy  TEXT NOT NULL,
  next_run_at     INTEGER,
  last_run_at     INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS automations_due
  ON automations(enabled, next_run_at);
CREATE TABLE IF NOT EXISTS automation_runs (
  id              TEXT PRIMARY KEY,
  automation_id   TEXT NOT NULL,
  session_id      TEXT,
  status          TEXT NOT NULL,
  scheduled_for   INTEGER NOT NULL,
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER,
  error           TEXT,
  FOREIGN KEY (automation_id) REFERENCES automations(id)
);
CREATE INDEX IF NOT EXISTS automation_runs_task
  ON automation_runs(automation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS automation_runs_session
  ON automation_runs(session_id);
";

fn table_has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
    for existing in columns {
        if existing? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// The removed Work automation prototype used these table names for a different schema. Preserve
/// its rows under explicit legacy names before installing the scheduled-task implementation.
fn archive_legacy_work_schema(conn: &Connection) -> rusqlite::Result<()> {
    let legacy_automations = table_has_column(conn, "automations", "task_id")?
        && table_has_column(conn, "automations", "configuration_json")?
        && !table_has_column(conn, "automations", "next_run_at")?;
    if !legacy_automations {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    if table_has_column(&tx, "automation_runs", "scheduled_at")?
        && !table_has_column(&tx, "automation_runs", "scheduled_for")?
    {
        tx.execute(
            "ALTER TABLE automation_runs RENAME TO legacy_work_automation_runs",
            [],
        )?;
    }
    tx.execute(
        "ALTER TABLE automations RENAME TO legacy_work_automations",
        [],
    )?;
    tx.commit()
}

pub(crate) fn install(conn: &Connection) -> rusqlite::Result<()> {
    archive_legacy_work_schema(conn)?;
    conn.execute_batch(SCHEMA)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Automation {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub project_path: String,
    pub provider: ProviderId,
    pub cron: String,
    pub timezone: String,
    pub enabled: bool,
    pub use_worktree: bool,
    pub permission_mode: PermissionMode,
    pub sandbox_policy: SandboxPolicy,
    pub next_run_at: Option<i64>,
    pub last_run_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationInput {
    pub name: String,
    pub prompt: String,
    pub project_path: String,
    pub provider: ProviderId,
    pub cron: String,
    pub timezone: String,
    pub enabled: bool,
    pub use_worktree: bool,
    pub permission_mode: PermissionMode,
    pub sandbox_policy: SandboxPolicy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AutomationRunStatus {
    Starting,
    Running,
    NeedsAttention,
    Succeeded,
    Failed,
    Interrupted,
}

impl AutomationRunStatus {
    fn as_db(self) -> &'static str {
        match self {
            Self::Starting => "starting",
            Self::Running => "running",
            Self::NeedsAttention => "needs_attention",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Interrupted => "interrupted",
        }
    }

    fn from_db(value: &str) -> Result<Self, StoreError> {
        match value {
            "starting" => Ok(Self::Starting),
            "running" => Ok(Self::Running),
            "needs_attention" => Ok(Self::NeedsAttention),
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "interrupted" => Ok(Self::Interrupted),
            other => Err(StoreError::InvalidAutomation(format!(
                "unknown run status `{other}`"
            ))),
        }
    }

    pub fn is_active(self) -> bool {
        matches!(self, Self::Starting | Self::Running | Self::NeedsAttention)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutomationRun {
    pub id: String,
    pub automation_id: String,
    pub session_id: Option<String>,
    pub status: AutomationRunStatus,
    pub scheduled_for: i64,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub error: Option<String>,
}

/// Return the first matching minute strictly after `after_ms`.
///
/// Iterating UTC minutes and projecting each into the task timezone makes daylight-saving gaps
/// and repeated hours deterministic without implementing calendar rules ourselves.
pub fn next_automation_run_after(
    cron: &str,
    timezone: &str,
    after_ms: i64,
) -> Result<i64, StoreError> {
    validate_cron_expression(cron)?;
    let timezone = Tz::from_str(timezone)
        .map_err(|_| StoreError::InvalidAutomation(format!("unknown timezone `{timezone}`")))?;
    let first_minute = after_ms.div_euclid(60_000).saturating_add(1);
    for offset in 0..MAX_SCHEDULE_LOOKAHEAD_MINUTES {
        let millis = first_minute.saturating_add(offset).saturating_mul(60_000);
        let utc = Utc.timestamp_millis_opt(millis).single().ok_or_else(|| {
            StoreError::InvalidAutomation("schedule timestamp is out of range".into())
        })?;
        let local = utc.with_timezone(&timezone);
        if crate::scene_runtime::cron::matches(
            cron,
            local.minute(),
            local.hour(),
            local.day(),
            local.month(),
            local.weekday().num_days_from_sunday(),
        ) {
            return Ok(millis);
        }
    }
    Err(StoreError::InvalidAutomation(
        "schedule has no occurrence within five years".into(),
    ))
}

fn validate_cron_expression(cron: &str) -> Result<(), StoreError> {
    let fields = cron.split_whitespace().collect::<Vec<_>>();
    if fields.len() != 5 {
        return Err(StoreError::InvalidAutomation(
            "cron must contain five fields".into(),
        ));
    }
    let ranges = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)];
    for (index, (field, (min, max))) in fields.iter().zip(ranges).enumerate() {
        for part in field.split(',') {
            let segments = part.split('/').collect::<Vec<_>>();
            if segments.len() > 2 || segments[0].is_empty() {
                return Err(invalid_cron_field(index));
            }
            if let Some(step) = segments.get(1) {
                if step.parse::<u32>().ok().filter(|step| *step > 0).is_none() {
                    return Err(invalid_cron_field(index));
                }
            }
            let range = segments[0];
            if range == "*" {
                continue;
            }
            let (lo, hi) = if let Some((lo, hi)) = range.split_once('-') {
                let lo = lo.parse::<u32>().map_err(|_| invalid_cron_field(index))?;
                let hi = hi.parse::<u32>().map_err(|_| invalid_cron_field(index))?;
                (lo, hi)
            } else {
                let value = range
                    .parse::<u32>()
                    .map_err(|_| invalid_cron_field(index))?;
                (value, value)
            };
            if lo < min || hi > max || lo > hi {
                return Err(invalid_cron_field(index));
            }
        }
    }
    Ok(())
}

fn invalid_cron_field(index: usize) -> StoreError {
    StoreError::InvalidAutomation(format!("invalid cron field {}", index + 1))
}

fn normalized_input(mut input: AutomationInput) -> Result<AutomationInput, StoreError> {
    input.name = input.name.trim().to_string();
    input.prompt = input.prompt.trim().to_string();
    input.project_path = input.project_path.trim().to_string();
    input.cron = input.cron.split_whitespace().collect::<Vec<_>>().join(" ");
    input.timezone = input.timezone.trim().to_string();
    if input.name.is_empty() {
        return Err(StoreError::InvalidAutomation("name is required".into()));
    }
    if input.prompt.is_empty() {
        return Err(StoreError::InvalidAutomation("prompt is required".into()));
    }
    if input.project_path.is_empty() {
        return Err(StoreError::InvalidAutomation("project is required".into()));
    }
    Ok(input)
}

fn provider_json(provider: &ProviderId) -> Result<String, StoreError> {
    serde_json::to_string(provider).map_err(StoreError::from)
}

fn automation_from_row(row: &Row<'_>) -> rusqlite::Result<Automation> {
    let provider: String = row.get(4)?;
    let permission_mode: String = row.get(9)?;
    let sandbox_policy: String = row.get(10)?;
    Ok(Automation {
        id: row.get(0)?,
        name: row.get(1)?,
        prompt: row.get(2)?,
        project_path: row.get(3)?,
        provider: serde_json::from_str(&provider).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        cron: row.get(5)?,
        timezone: row.get(6)?,
        enabled: row.get::<_, i64>(7)? != 0,
        use_worktree: row.get::<_, i64>(8)? != 0,
        permission_mode: serde_json::from_str(&permission_mode).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                9,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        sandbox_policy: serde_json::from_str(&sandbox_policy).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(
                10,
                rusqlite::types::Type::Text,
                Box::new(error),
            )
        })?,
        next_run_at: row.get(11)?,
        last_run_at: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

const AUTOMATION_COLUMNS: &str =
    "id,name,prompt,project_path,provider,cron,timezone,enabled,use_worktree,permission_mode,sandbox_policy,next_run_at,last_run_at,created_at,updated_at";

fn run_from_row(row: &Row<'_>) -> rusqlite::Result<AutomationRun> {
    let status: String = row.get(3)?;
    let status = AutomationRunStatus::from_db(&status).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(AutomationRun {
        id: row.get(0)?,
        automation_id: row.get(1)?,
        session_id: row.get(2)?,
        status,
        scheduled_for: row.get(4)?,
        started_at: row.get(5)?,
        finished_at: row.get(6)?,
        error: row.get(7)?,
    })
}

const RUN_COLUMNS: &str =
    "id,automation_id,session_id,status,scheduled_for,started_at,finished_at,error";

impl Store {
    pub fn list_automations(&self) -> Result<Vec<Automation>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(&format!(
            "SELECT {AUTOMATION_COLUMNS} FROM automations ORDER BY enabled DESC, updated_at DESC"
        ))?;
        let rows = statement.query_map([], automation_from_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::from)
    }

    pub fn automation(&self, id: &str) -> Result<Option<Automation>, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            &format!("SELECT {AUTOMATION_COLUMNS} FROM automations WHERE id=?1"),
            [id],
            automation_from_row,
        )
        .optional()
        .map_err(StoreError::from)
    }

    pub fn create_automation(
        &self,
        input: AutomationInput,
        now: i64,
    ) -> Result<Automation, StoreError> {
        let input = normalized_input(input)?;
        let next_run_at = input
            .enabled
            .then(|| next_automation_run_after(&input.cron, &input.timezone, now))
            .transpose()?;
        let automation = Automation {
            id: uuid::Uuid::new_v4().to_string(),
            name: input.name,
            prompt: input.prompt,
            project_path: input.project_path,
            provider: input.provider,
            cron: input.cron,
            timezone: input.timezone,
            enabled: input.enabled,
            use_worktree: input.use_worktree,
            permission_mode: input.permission_mode,
            sandbox_policy: input.sandbox_policy,
            next_run_at,
            last_run_at: None,
            created_at: now,
            updated_at: now,
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO automations
             (id,name,prompt,project_path,provider,cron,timezone,enabled,use_worktree,permission_mode,sandbox_policy,next_run_at,last_run_at,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,NULL,?13,?13)",
            rusqlite::params![
                automation.id,
                automation.name,
                automation.prompt,
                automation.project_path,
                provider_json(&automation.provider)?,
                automation.cron,
                automation.timezone,
                i64::from(automation.enabled),
                i64::from(automation.use_worktree),
                serde_json::to_string(&automation.permission_mode)?,
                serde_json::to_string(&automation.sandbox_policy)?,
                automation.next_run_at,
                now,
            ],
        )?;
        Ok(automation)
    }

    pub fn update_automation(
        &self,
        id: &str,
        input: AutomationInput,
        now: i64,
    ) -> Result<Option<Automation>, StoreError> {
        let input = normalized_input(input)?;
        let next_run_at = input
            .enabled
            .then(|| next_automation_run_after(&input.cron, &input.timezone, now))
            .transpose()?;
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE automations SET
               name=?2,prompt=?3,project_path=?4,provider=?5,cron=?6,timezone=?7,
               enabled=?8,use_worktree=?9,permission_mode=?10,sandbox_policy=?11,
               next_run_at=?12,updated_at=?13
             WHERE id=?1",
            rusqlite::params![
                id,
                input.name,
                input.prompt,
                input.project_path,
                provider_json(&input.provider)?,
                input.cron,
                input.timezone,
                i64::from(input.enabled),
                i64::from(input.use_worktree),
                serde_json::to_string(&input.permission_mode)?,
                serde_json::to_string(&input.sandbox_policy)?,
                next_run_at,
                now,
            ],
        )?;
        drop(conn);
        if changed == 0 {
            Ok(None)
        } else {
            self.automation(id)
        }
    }

    pub fn set_automation_enabled(
        &self,
        id: &str,
        enabled: bool,
        now: i64,
    ) -> Result<Option<Automation>, StoreError> {
        let Some(current) = self.automation(id)? else {
            return Ok(None);
        };
        let next_run_at = enabled
            .then(|| next_automation_run_after(&current.cron, &current.timezone, now))
            .transpose()?;
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE automations SET enabled=?2,next_run_at=?3,updated_at=?4 WHERE id=?1",
            rusqlite::params![id, i64::from(enabled), next_run_at, now],
        )?;
        drop(conn);
        self.automation(id)
    }

    pub fn delete_automation(&self, id: &str) -> Result<bool, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        if has_active_run(&tx, id)? {
            return Err(StoreError::InvalidAutomation(
                "wait for the active run to finish before deleting this automation".into(),
            ));
        }
        tx.execute("DELETE FROM automation_runs WHERE automation_id=?1", [id])?;
        let changed = tx.execute("DELETE FROM automations WHERE id=?1", [id])?;
        tx.commit()?;
        Ok(changed > 0)
    }

    pub fn due_automation_ids(&self, now: i64) -> Result<Vec<String>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT id FROM automations
             WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at<=?1
             ORDER BY next_run_at ASC LIMIT 32",
        )?;
        let rows = statement.query_map([now], |row| row.get(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::from)
    }

    pub fn claim_scheduled_automation_run(
        &self,
        automation_id: &str,
        now: i64,
    ) -> Result<Option<(Automation, AutomationRun)>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let automation = tx
            .query_row(
                &format!("SELECT {AUTOMATION_COLUMNS} FROM automations WHERE id=?1"),
                [automation_id],
                automation_from_row,
            )
            .optional()?;
        let Some(mut automation) = automation else {
            return Ok(None);
        };
        let Some(scheduled_for) = automation.next_run_at else {
            return Ok(None);
        };
        if !automation.enabled || scheduled_for > now || has_active_run(&tx, automation_id)? {
            return Ok(None);
        }
        let next = next_automation_run_after(&automation.cron, &automation.timezone, now)?;
        let run = new_run(automation_id, scheduled_for, now);
        tx.execute(
            "UPDATE automations SET next_run_at=?2,last_run_at=?3,updated_at=?3 WHERE id=?1",
            rusqlite::params![automation_id, next, now],
        )?;
        insert_run(&tx, &run)?;
        tx.commit()?;
        automation.next_run_at = Some(next);
        automation.last_run_at = Some(now);
        automation.updated_at = now;
        Ok(Some((automation, run)))
    }

    pub fn create_manual_automation_run(
        &self,
        automation_id: &str,
        now: i64,
    ) -> Result<Option<(Automation, AutomationRun)>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let automation = tx
            .query_row(
                &format!("SELECT {AUTOMATION_COLUMNS} FROM automations WHERE id=?1"),
                [automation_id],
                automation_from_row,
            )
            .optional()?;
        let Some(mut automation) = automation else {
            return Ok(None);
        };
        if has_active_run(&tx, automation_id)? {
            return Ok(None);
        }
        let run = new_run(automation_id, now, now);
        tx.execute(
            "UPDATE automations SET last_run_at=?2,updated_at=?2 WHERE id=?1",
            rusqlite::params![automation_id, now],
        )?;
        insert_run(&tx, &run)?;
        tx.commit()?;
        automation.last_run_at = Some(now);
        automation.updated_at = now;
        Ok(Some((automation, run)))
    }

    pub fn set_automation_run_session(
        &self,
        run_id: &str,
        session_id: &str,
    ) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE automation_runs SET session_id=?2,status='running' WHERE id=?1",
            rusqlite::params![run_id, session_id],
        )?;
        Ok(())
    }

    pub fn set_automation_run_status(
        &self,
        run_id: &str,
        status: AutomationRunStatus,
        error: Option<&str>,
        now: i64,
    ) -> Result<(), StoreError> {
        let finished_at = (!status.is_active()).then_some(now);
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE automation_runs SET status=?2,error=?3,finished_at=?4 WHERE id=?1",
            rusqlite::params![run_id, status.as_db(), error, finished_at],
        )?;
        Ok(())
    }

    pub fn active_automation_run_for_session(
        &self,
        session_id: &str,
    ) -> Result<Option<AutomationRun>, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            &format!(
                "SELECT {RUN_COLUMNS} FROM automation_runs
                 WHERE session_id=?1 AND status IN ('starting','running','needs_attention')
                 ORDER BY started_at DESC LIMIT 1"
            ),
            [session_id],
            run_from_row,
        )
        .optional()
        .map_err(StoreError::from)
    }

    pub fn list_automation_runs(
        &self,
        automation_id: Option<&str>,
        limit: usize,
    ) -> Result<Vec<AutomationRun>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let limit = limit.clamp(1, 200) as i64;
        let sql = if automation_id.is_some() {
            format!(
                "SELECT {RUN_COLUMNS} FROM automation_runs
                 WHERE automation_id=?1 ORDER BY started_at DESC LIMIT ?2"
            )
        } else {
            format!(
                "SELECT {RUN_COLUMNS} FROM automation_runs
                 WHERE ?1 IS NULL ORDER BY started_at DESC LIMIT ?2"
            )
        };
        let mut statement = conn.prepare(&sql)?;
        let rows = statement.query_map(rusqlite::params![automation_id, limit], run_from_row)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(StoreError::from)
    }

    pub fn interrupt_active_automation_runs(&self, now: i64) -> Result<usize, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE automation_runs
             SET status='interrupted',finished_at=?1,error='Code2 closed before this run finished'
             WHERE status IN ('starting','running','needs_attention')",
            [now],
        )
        .map_err(StoreError::from)
    }
}

fn has_active_run(conn: &Connection, automation_id: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM automation_runs
           WHERE automation_id=?1 AND status IN ('starting','running','needs_attention')
         )",
        [automation_id],
        |row| row.get(0),
    )
}

fn new_run(automation_id: &str, scheduled_for: i64, now: i64) -> AutomationRun {
    AutomationRun {
        id: uuid::Uuid::new_v4().to_string(),
        automation_id: automation_id.to_string(),
        session_id: None,
        status: AutomationRunStatus::Starting,
        scheduled_for,
        started_at: now,
        finished_at: None,
        error: None,
    }
}

fn insert_run(conn: &Connection, run: &AutomationRun) -> Result<(), StoreError> {
    conn.execute(
        "INSERT INTO automation_runs
         (id,automation_id,session_id,status,scheduled_for,started_at,finished_at,error)
         VALUES (?1,?2,NULL,?3,?4,?5,NULL,NULL)",
        rusqlite::params![
            run.id,
            run.automation_id,
            run.status.as_db(),
            run.scheduled_for,
            run.started_at,
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_preserves_and_moves_aside_the_legacy_work_automation_schema() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE automations (
               id TEXT PRIMARY KEY,
               task_id TEXT NOT NULL,
               trigger TEXT NOT NULL,
               configuration_json TEXT NOT NULL,
               enabled INTEGER NOT NULL DEFAULT 1,
               non_overlapping INTEGER NOT NULL DEFAULT 1,
               created_at INTEGER NOT NULL,
               updated_at INTEGER NOT NULL
             );
             CREATE TABLE automation_runs (
               id TEXT PRIMARY KEY,
               automation_id TEXT NOT NULL REFERENCES automations(id),
               status TEXT NOT NULL,
               scheduled_at INTEGER NOT NULL,
               metadata_json TEXT NOT NULL
             );
             INSERT INTO automations
               (id, task_id, trigger, configuration_json, created_at, updated_at)
             VALUES ('legacy-automation', 'task-1', 'cron', '{}', 1, 1);
             INSERT INTO automation_runs
               (id, automation_id, status, scheduled_at, metadata_json)
             VALUES ('legacy-run', 'legacy-automation', 'completed', 1, '{}');",
        )
        .unwrap();

        install(&conn).unwrap();
        install(&conn).unwrap();

        let new_columns: Vec<String> = conn
            .prepare("PRAGMA table_info(automations)")
            .unwrap()
            .query_map([], |row| row.get(1))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert!(new_columns.contains(&"next_run_at".to_string()));
        assert!(!new_columns.contains(&"task_id".to_string()));
        assert_eq!(
            conn.query_row(
                "SELECT task_id FROM legacy_work_automations WHERE id='legacy-automation'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
            "task-1"
        );
        assert_eq!(
            conn.query_row(
                "SELECT automation_id FROM legacy_work_automation_runs WHERE id='legacy-run'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap(),
            "legacy-automation"
        );
    }

    fn input() -> AutomationInput {
        AutomationInput {
            name: "Morning review".into(),
            prompt: "Review the repository".into(),
            project_path: "/work/project".into(),
            provider: ProviderId::Codex,
            cron: "30 9 * * 1-5".into(),
            timezone: "Asia/Singapore".into(),
            enabled: true,
            use_worktree: true,
            permission_mode: PermissionMode::Yolo,
            sandbox_policy: SandboxPolicy::WorkspaceWrite,
        }
    }

    #[test]
    fn next_run_uses_the_saved_timezone() {
        // 2026-08-12 01:29 UTC = 09:29 in Singapore.
        let after = Utc
            .with_ymd_and_hms(2026, 8, 12, 1, 29, 10)
            .single()
            .unwrap()
            .timestamp_millis();
        let next = next_automation_run_after("30 9 * * *", "Asia/Singapore", after).unwrap();
        assert_eq!(
            Utc.timestamp_millis_opt(next).single().unwrap(),
            Utc.with_ymd_and_hms(2026, 8, 12, 1, 30, 0)
                .single()
                .unwrap()
        );
    }

    #[test]
    fn next_run_accepts_a_leap_day_more_than_two_years_away() {
        let after = Utc
            .with_ymd_and_hms(2028, 3, 1, 0, 0, 0)
            .single()
            .unwrap()
            .timestamp_millis();
        let next = next_automation_run_after("0 9 29 2 *", "UTC", after).unwrap();
        assert_eq!(
            Utc.timestamp_millis_opt(next).single().unwrap(),
            Utc.with_ymd_and_hms(2032, 2, 29, 9, 0, 0).single().unwrap()
        );
    }

    #[test]
    fn invalid_schedule_or_timezone_is_rejected() {
        assert!(next_automation_run_after("61 * * * *", "UTC", 0).is_err());
        assert!(next_automation_run_after("*/0 * * * *", "UTC", 0).is_err());
        assert!(next_automation_run_after("0 9 * * *", "Mars/Olympus", 0).is_err());
    }

    #[test]
    fn automation_crud_claim_and_run_history_are_durable() {
        let store = Store::open_in_memory().unwrap();
        let created = store.create_automation(input(), 1_786_500_000_000).unwrap();
        assert_eq!(store.list_automations().unwrap(), vec![created.clone()]);

        let due = created.next_run_at.unwrap();
        assert!(store
            .claim_scheduled_automation_run(&created.id, due - 1)
            .unwrap()
            .is_none());
        let (_, run) = store
            .claim_scheduled_automation_run(&created.id, due)
            .unwrap()
            .unwrap();
        assert!(store
            .create_manual_automation_run(&created.id, due)
            .unwrap()
            .is_none());

        store
            .set_automation_run_session(&run.id, "session-1")
            .unwrap();
        store
            .set_automation_run_status(&run.id, AutomationRunStatus::Succeeded, None, due + 10)
            .unwrap();
        let runs = store.list_automation_runs(Some(&created.id), 10).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].session_id.as_deref(), Some("session-1"));
        assert_eq!(runs[0].status, AutomationRunStatus::Succeeded);

        assert!(store.delete_automation(&created.id).unwrap());
        assert!(store.list_automation_runs(None, 10).unwrap().is_empty());
    }
}
