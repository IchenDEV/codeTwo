use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

use super::domain::{
    BriefRevision, Deliverable, DeliverableSaveResult, RunChange, RunSnapshot, Task, TaskStatus,
    WorkVersioned, Workspace,
};
use super::schema;
use crate::automation::{
    AutomationFailure, AutomationRun, AutomationRunStatus, AutomationSpec, AutomationValidation,
    AutomationWait, MAX_DUE_WINDOW_MS,
};
use crate::store::StoreError;
use crate::work_snapshot::SnapshotChange;
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

pub(crate) fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_millis()).ok())
        .unwrap_or(0)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Ord, PartialOrd)]
#[serde(rename_all = "snake_case")]
pub enum WorkEntityKind {
    System,
    Workspace,
    Task,
    Brief,
    Run,
    Snapshot,
    Change,
    Deliverable,
    Template,
    Automation,
    AutomationRun,
    MemoryScope,
    Memory,
    ProviderCapabilities,
}

impl WorkEntityKind {
    pub const ALL: [Self; 14] = [
        Self::System,
        Self::Workspace,
        Self::Task,
        Self::Brief,
        Self::Run,
        Self::Snapshot,
        Self::Change,
        Self::Deliverable,
        Self::Template,
        Self::Automation,
        Self::AutomationRun,
        Self::MemoryScope,
        Self::Memory,
        Self::ProviderCapabilities,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Workspace => "workspace",
            Self::Task => "task",
            Self::Brief => "brief",
            Self::Run => "run",
            Self::Snapshot => "snapshot",
            Self::Change => "change",
            Self::Deliverable => "deliverable",
            Self::Template => "template",
            Self::Automation => "automation",
            Self::AutomationRun => "automation_run",
            Self::MemoryScope => "memory_scope",
            Self::Memory => "memory",
            Self::ProviderCapabilities => "provider_capabilities",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "system" => Self::System,
            "workspace" => Self::Workspace,
            "task" => Self::Task,
            "brief" => Self::Brief,
            "run" => Self::Run,
            "snapshot" => Self::Snapshot,
            "change" => Self::Change,
            "deliverable" => Self::Deliverable,
            "template" => Self::Template,
            "automation" => Self::Automation,
            "automation_run" => Self::AutomationRun,
            "memory_scope" => Self::MemoryScope,
            "memory" => Self::Memory,
            "provider_capabilities" => Self::ProviderCapabilities,
            _ => return None,
        })
    }
}

impl fmt::Display for WorkEntityKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkAuditContext {
    pub actor: String,
    pub auth_subject: String,
    pub request_id: String,
}

impl WorkAuditContext {
    pub fn new(
        actor: impl Into<String>,
        auth_subject: impl Into<String>,
        request_id: impl Into<String>,
    ) -> Self {
        Self {
            actor: actor.into(),
            auth_subject: auth_subject.into(),
            request_id: request_id.into(),
        }
    }

    fn validate(&self) -> Result<(), StoreError> {
        validate_text("actor", &self.actor, 160)?;
        validate_text("auth_subject", &self.auth_subject, 256)?;
        validate_text("request_id", &self.request_id, 256)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkMutationGuard {
    pub expected_revision: Option<u64>,
    actor: String,
    auth_subject: String,
    request_id: String,
}

impl WorkMutationGuard {
    pub fn new(
        expected_revision: Option<u64>,
        actor: impl Into<String>,
        auth_subject: impl Into<String>,
        request_id: impl Into<String>,
    ) -> Self {
        Self {
            expected_revision,
            actor: actor.into(),
            auth_subject: auth_subject.into(),
            request_id: request_id.into(),
        }
    }

    pub fn from_audit(expected_revision: Option<u64>, audit: &WorkAuditContext) -> Self {
        Self::new(
            expected_revision,
            audit.actor.clone(),
            audit.auth_subject.clone(),
            audit.request_id.clone(),
        )
    }

    fn input(
        &self,
        entity_kind: WorkEntityKind,
        entity_id: impl Into<String>,
        deleted: bool,
        operation: impl Into<String>,
    ) -> WorkMutationInput {
        WorkMutationInput {
            entity_kind,
            entity_id: entity_id.into(),
            expected_revision: self.expected_revision,
            deleted,
            operation: operation.into(),
            audit: WorkAuditContext::new(
                self.actor.clone(),
                self.auth_subject.clone(),
                self.request_id.clone(),
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkEntityHead {
    pub entity_kind: WorkEntityKind,
    pub entity_id: String,
    pub revision: u64,
    pub deleted: bool,
    pub mutation_id: u64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkMutation {
    pub mutation_id: u64,
    pub entity_kind: WorkEntityKind,
    pub entity_id: String,
    pub revision: u64,
    pub deleted: bool,
    pub operation: String,
    pub actor: String,
    pub auth_subject: String,
    pub request_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
struct WorkMutationInput {
    entity_kind: WorkEntityKind,
    entity_id: String,
    expected_revision: Option<u64>,
    deleted: bool,
    operation: String,
    audit: WorkAuditContext,
}

impl WorkMutationInput {
    fn validate(&self) -> Result<(), StoreError> {
        if self.entity_kind == WorkEntityKind::System {
            return Err(StoreError::Domain(
                "system is reserved for high-water metadata".to_owned(),
            ));
        }
        validate_text("entity id", &self.entity_id, 256)?;
        validate_text("operation", &self.operation, 64)?;
        self.audit.validate()?;
        if self.expected_revision == Some(0) {
            return Err(StoreError::Domain(
                "expected revision must be at least one".to_owned(),
            ));
        }
        Ok(())
    }
}

fn validate_text(field: &str, value: &str, max: usize) -> Result<(), StoreError> {
    if value.is_empty()
        || value.len() > max
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(StoreError::Domain(format!("invalid Work {field}")));
    }
    Ok(())
}

fn sqlite_revision(value: u64) -> Result<i64, StoreError> {
    i64::try_from(value).map_err(|_| StoreError::Domain("Work revision is out of range".to_owned()))
}

fn json_column<T: serde::de::DeserializeOwned>(
    row: &rusqlite::Row<'_>,
    index: usize,
) -> rusqlite::Result<T> {
    let value: String = row.get(index)?;
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

fn automation_spec_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<WorkVersioned<AutomationSpec>> {
    let revision =
        u64::try_from(row.get::<_, i64>(12)?).map_err(|_| rusqlite::Error::InvalidQuery)?;
    Ok(WorkVersioned {
        entity: AutomationSpec {
            id: row.get(0)?,
            task_id: row.get(1)?,
            provider: Some(json_column(row, 2)?),
            model: row.get(3)?,
            prompt: json_column(row, 4)?,
            trigger: json_column(row, 5)?,
            enabled: row.get::<_, i64>(6)? != 0,
            revision: i64::try_from(revision).map_err(|_| rusqlite::Error::InvalidQuery)?,
            last_evaluated_at: row.get(7)?,
            next_due_at: row.get(8)?,
            cursor_ms: row.get(9)?,
            validation: AutomationValidation::Valid,
            created_at: Some(row.get(10)?),
            updated_at: Some(row.get(11)?),
            tombstoned: false,
        },
        revision,
    })
}

pub(super) fn automation_run_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<WorkVersioned<AutomationRun>> {
    let status: String = row.get(3)?;
    Ok(WorkVersioned {
        entity: AutomationRun {
            id: row.get(0)?,
            automation_id: row.get(1)?,
            occurrence_key: row.get(2)?,
            status: AutomationRunStatus::parse(&status).ok_or(rusqlite::Error::InvalidQuery)?,
            scheduled_at: row.get(4)?,
            provider: json_column(row, 5)?,
            model: row.get(6)?,
            prompt: json_column(row, 7)?,
            work_run_id: row.get(8)?,
            started_at: row.get(9)?,
            finished_at: row.get(10)?,
            wait: row
                .get::<_, Option<String>>(11)?
                .map(|value| serde_json::from_str(&value))
                .transpose()
                .map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        11,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?,
            failure: row
                .get::<_, Option<String>>(12)?
                .map(|value| serde_json::from_str(&value))
                .transpose()
                .map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        12,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?,
            coalesced_missed: u64::try_from(row.get::<_, i64>(13)?)
                .map_err(|_| rusqlite::Error::InvalidQuery)?,
            missed_start: row.get(14)?,
            missed_end: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
        },
        revision: u64::try_from(row.get::<_, i64>(18)?)
            .map_err(|_| rusqlite::Error::InvalidQuery)?,
    })
}

fn work_conflict(
    entity_kind: WorkEntityKind,
    entity_id: &str,
    current_revision: Option<u64>,
) -> StoreError {
    StoreError::WorkConflict {
        entity_kind: entity_kind.as_str().to_owned(),
        entity_id: entity_id.to_owned(),
        current_revision,
    }
}

pub fn install_schema(conn: &mut Connection) -> Result<(), StoreError> {
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    install_schema_tx(&tx)?;
    tx.commit()?;
    Ok(())
}

pub(super) fn install_schema_tx(tx: &Transaction<'_>) -> Result<(), StoreError> {
    schema::install(tx)
}

/// Append one deterministic revision-1 migration head when a legacy projection has no ledger
/// head yet. Existing heads are left untouched so rerunning Store installation cannot advance
/// revisions or the global high-water mark.
pub(super) fn ensure_backfill_head(
    tx: &Transaction<'_>,
    entity_kind: WorkEntityKind,
    entity_id: &str,
    created_at: i64,
) -> Result<bool, StoreError> {
    validate_text("entity id", entity_id, 256)?;
    if entity_kind == WorkEntityKind::System {
        return Err(StoreError::Domain(
            "system is reserved for high-water metadata".to_owned(),
        ));
    }
    let exists: Option<i64> = tx
        .query_row(
            "SELECT revision FROM work_entity_heads WHERE entity_kind=?1 AND entity_id=?2",
            params![entity_kind.as_str(), entity_id],
            |row| row.get(0),
        )
        .optional()?;
    if exists.is_some() {
        return Ok(false);
    }
    let input = WorkMutationInput {
        entity_kind,
        entity_id: entity_id.to_owned(),
        expected_revision: None,
        deleted: false,
        operation: "backfill".to_owned(),
        audit: WorkAuditContext::new(
            "migration",
            "work_store_v1",
            format!(
                "work_store_v1:backfill:{}:{}",
                entity_kind.as_str(),
                blake3::hash(entity_id.as_bytes()).to_hex()
            ),
        ),
    };
    input.validate()?;
    append_with_revision_tx(tx, &input, 1, created_at.max(0))?;
    Ok(true)
}

pub fn with_transaction<T, F>(conn: &mut Connection, f: F) -> Result<T, StoreError>
where
    F: FnOnce(&mut WorkTransaction<'_>) -> Result<T, StoreError>,
{
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    let mut work_tx = WorkTransaction { transaction: tx };
    match f(&mut work_tx) {
        Ok(value) => {
            work_tx.transaction.commit()?;
            Ok(value)
        }
        Err(error) => {
            drop(work_tx);
            Err(error)
        }
    }
}

pub struct WorkTransaction<'tx> {
    transaction: Transaction<'tx>,
}

impl WorkTransaction<'_> {
    #[allow(dead_code)]
    pub(crate) fn append_guarded(
        &mut self,
        entity_kind: WorkEntityKind,
        entity_id: impl Into<String>,
        deleted: bool,
        operation: impl Into<String>,
        guard: &WorkMutationGuard,
    ) -> Result<WorkMutation, StoreError> {
        let input = guard.input(entity_kind, entity_id, deleted, operation);
        let revision = self.next_revision(&input)?;
        self.append_with_revision(&input, revision)
    }

    pub fn save_workspace(
        &mut self,
        workspace: &Workspace,
        guard: &WorkMutationGuard,
    ) -> Result<WorkMutation, StoreError> {
        workspace.validate().map_err(StoreError::Domain)?;
        let input = guard.input(
            WorkEntityKind::Workspace,
            workspace.id.clone(),
            false,
            "save",
        );
        let revision = self.next_revision(&input)?;
        self.transaction.execute(
            "INSERT INTO workspaces(id,name,root_path,kind,created_at,updated_at)
             VALUES(?1,?2,?3,?4,?5,?6)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name,root_path=excluded.root_path,
               kind=excluded.kind,updated_at=excluded.updated_at",
            params![
                workspace.id,
                workspace.name,
                workspace.root_path,
                workspace.kind.as_str(),
                workspace.created_at,
                workspace.updated_at,
            ],
        )?;
        self.append_with_revision(&input, revision)
    }

    pub fn save_task(
        &mut self,
        task: &Task,
        guard: &WorkMutationGuard,
    ) -> Result<WorkMutation, StoreError> {
        task.validate().map_err(StoreError::Domain)?;
        let existing: Option<(Option<i64>, String)> = self
            .transaction
            .query_row(
                "SELECT current_brief_revision,status FROM tasks WHERE id=?1",
                params![task.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        match &existing {
            None if task.current_brief_revision.is_some() => {
                return Err(StoreError::Domain(
                    "a task brief pointer can only be set by save_brief".to_owned(),
                ));
            }
            Some((pointer, _)) if task.current_brief_revision != *pointer => {
                return Err(StoreError::Domain(
                    "a task brief pointer can only be changed by save_brief".to_owned(),
                ));
            }
            _ => {}
        }
        if let Some((_, status)) = &existing {
            let status = TaskStatus::parse(status)
                .ok_or_else(|| StoreError::Domain("invalid stored Task status".to_owned()))?;
            if task.status != status {
                return Err(StoreError::Domain(
                    "Task status can only change through a lifecycle transition".to_owned(),
                ));
            }
        }
        let input = guard.input(WorkEntityKind::Task, task.id.clone(), false, "save");
        let revision = self.next_revision(&input)?;
        if existing.is_none() {
            self.transaction.execute(
                "INSERT INTO tasks(id,workspace_id,title,experience,status,created_at,updated_at,archived)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    task.id,
                    task.workspace_id,
                    task.title,
                    task.experience.as_str(),
                    task.status.as_str(),
                    task.created_at,
                    task.updated_at,
                    task.archived as i64,
                ],
            )?;
        } else {
            self.transaction.execute(
                "UPDATE tasks SET workspace_id=?2,title=?3,experience=?4,status=?5,
                   updated_at=?6,archived=?7 WHERE id=?1",
                params![
                    task.id,
                    task.workspace_id,
                    task.title,
                    task.experience.as_str(),
                    task.status.as_str(),
                    task.updated_at,
                    task.archived as i64,
                ],
            )?;
        }
        self.append_with_revision(&input, revision)
    }

    pub fn save_automation(
        &mut self,
        mut automation: AutomationSpec,
        guard: &WorkMutationGuard,
    ) -> Result<WorkVersioned<AutomationSpec>, StoreError> {
        automation
            .validate()
            .map_err(|error| StoreError::Domain(error.to_string()))?;
        if automation.tombstoned {
            return Err(StoreError::Domain(
                "tombstoned Automation cannot be saved".to_owned(),
            ));
        }
        let existing: Option<(String, i64, Option<i64>, Option<i64>, Option<i64>)> = self
            .transaction
            .query_row(
                "SELECT task_id,created_at,last_evaluated_at,next_due_at,cursor_ms
                 FROM automations WHERE id=?1",
                [&automation.id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .optional()?;
        if let Some((task_id, ..)) = &existing {
            if task_id != &automation.task_id {
                return Err(StoreError::Domain(
                    "Automation task binding is immutable".to_owned(),
                ));
            }
        } else {
            let active_task: bool = self.transaction.query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks t JOIN work_entity_heads h
                   ON h.entity_kind='task' AND h.entity_id=t.id AND h.deleted=0
                   WHERE t.id=?1 AND t.experience='work')",
                [&automation.task_id],
                |row| row.get(0),
            )?;
            if !active_task {
                return Err(StoreError::Domain(
                    "Automation requires an active Work Task".to_owned(),
                ));
            }
        }

        let input = guard.input(
            WorkEntityKind::Automation,
            automation.id.clone(),
            false,
            "save",
        );
        let revision = self.next_revision(&input)?;
        let now = now_millis();
        let (created_at, last_evaluated_at, next_due_at, cursor_ms) = existing
            .map(|(_, created_at, last, next, cursor)| (created_at, last, next, cursor))
            .unwrap_or((now, None, None, None));
        automation.revision = sqlite_revision(revision)?;
        automation.created_at = Some(created_at);
        automation.updated_at = Some(now);
        automation.last_evaluated_at = last_evaluated_at;
        automation.next_due_at = next_due_at;
        automation.cursor_ms = cursor_ms;
        let provider =
            serde_json::to_string(automation.provider.as_ref().ok_or_else(|| {
                StoreError::Domain("Automation provider is required".to_owned())
            })?)?;
        let prompt = serde_json::to_string(&automation.prompt)?;
        let trigger = serde_json::to_string(&automation.trigger)?;
        self.transaction.execute(
            "INSERT INTO automations
             (id,task_id,provider_json,model,prompt_json,trigger_json,enabled,last_evaluated_at,
              next_due_at,cursor_ms,created_at,updated_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
             ON CONFLICT(id) DO UPDATE SET provider_json=excluded.provider_json,
               model=excluded.model,prompt_json=excluded.prompt_json,
               trigger_json=excluded.trigger_json,enabled=excluded.enabled,
               updated_at=excluded.updated_at",
            params![
                automation.id,
                automation.task_id,
                provider,
                automation.model,
                prompt,
                trigger,
                automation.enabled as i64,
                automation.last_evaluated_at,
                automation.next_due_at,
                automation.cursor_ms,
                created_at,
                now,
            ],
        )?;
        self.append_with_revision(&input, revision)?;
        Ok(WorkVersioned {
            entity: automation,
            revision,
        })
    }

    pub fn claim_due_automations(
        &mut self,
        now: i64,
        audit: &WorkAuditContext,
    ) -> Result<Vec<WorkVersioned<AutomationRun>>, StoreError> {
        if now < 0 {
            return Err(StoreError::Domain(
                "Automation evaluation time is invalid".to_owned(),
            ));
        }
        let mut statement = self.transaction.prepare(
            "SELECT a.id,a.task_id,a.provider_json,a.model,a.prompt_json,a.trigger_json,a.enabled,
                    a.last_evaluated_at,a.next_due_at,a.cursor_ms,a.created_at,a.updated_at,h.revision
             FROM automations a JOIN work_entity_heads h
               ON h.entity_kind='automation' AND h.entity_id=a.id AND h.deleted=0
             WHERE a.enabled=1 ORDER BY a.id",
        )?;
        let rows = statement.query_map([], automation_spec_from_row)?;
        let automations = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        drop(statement);

        let mut claimed = Vec::new();
        for current in automations {
            let mut automation = current.entity;
            let from = automation
                .cursor_ms
                .unwrap_or_else(|| automation.created_at.unwrap_or(now).saturating_sub(1))
                .max(now.saturating_sub(MAX_DUE_WINDOW_MS));
            let Some(due) = automation
                .due_summary(from, now)
                .map_err(|error| StoreError::Domain(error.to_string()))?
            else {
                continue;
            };
            let active: Option<WorkVersioned<AutomationRun>> = self
                .transaction
                .query_row(
                    "SELECT r.id,r.automation_id,r.occurrence_key,r.status,r.scheduled_at,
                            r.provider_json,r.model,r.prompt_json,r.work_run_id,r.started_at,
                            r.finished_at,r.wait_json,r.failure_json,r.coalesced_missed,
                            r.missed_start,r.missed_end,r.created_at,r.updated_at,h.revision
                     FROM automation_runs r JOIN work_entity_heads h
                       ON h.entity_kind='automation_run' AND h.entity_id=r.id AND h.deleted=0
                     WHERE r.automation_id=?1 AND r.status IN ('queued','running','waiting')",
                    [&automation.id],
                    automation_run_from_row,
                )
                .optional()?;

            let run = if let Some(mut active) = active {
                active.entity.coalesced_missed =
                    active.entity.coalesced_missed.saturating_add(due.count);
                active.entity.missed_start = Some(
                    active
                        .entity
                        .missed_start
                        .map_or(due.first_ms, |value| value.min(due.first_ms)),
                );
                active.entity.missed_end = Some(
                    active
                        .entity
                        .missed_end
                        .map_or(due.last_ms, |value| value.max(due.last_ms)),
                );
                active.entity.updated_at = now;
                let run_guard = WorkMutationGuard::from_audit(Some(active.revision), audit);
                let mutation = self.append_guarded(
                    WorkEntityKind::AutomationRun,
                    active.entity.id.clone(),
                    false,
                    "coalesce",
                    &run_guard,
                )?;
                self.transaction.execute(
                    "UPDATE automation_runs SET coalesced_missed=?2,missed_start=?3,
                       missed_end=?4,updated_at=?5 WHERE id=?1",
                    params![
                        active.entity.id,
                        i64::try_from(active.entity.coalesced_missed).unwrap_or(i64::MAX),
                        active.entity.missed_start,
                        active.entity.missed_end,
                        now,
                    ],
                )?;
                active.revision = mutation.revision;
                active
            } else {
                let provider = automation.provider.clone().ok_or_else(|| {
                    StoreError::Domain("Automation provider is required".to_owned())
                })?;
                let run = AutomationRun {
                    id: uuid::Uuid::new_v4().to_string(),
                    automation_id: automation.id.clone(),
                    occurrence_key: due.last_ms.to_string(),
                    status: AutomationRunStatus::Queued,
                    scheduled_at: due.last_ms,
                    provider,
                    model: automation.model.clone(),
                    prompt: automation.prompt.clone(),
                    work_run_id: None,
                    started_at: None,
                    finished_at: None,
                    wait: None,
                    failure: None,
                    coalesced_missed: due.count.saturating_sub(1),
                    missed_start: (due.count > 1).then_some(due.first_ms),
                    missed_end: (due.count > 1).then_some(due.last_ms),
                    created_at: now,
                    updated_at: now,
                };
                run.validate()
                    .map_err(|error| StoreError::Domain(error.to_string()))?;
                let run_guard = WorkMutationGuard::from_audit(None, audit);
                let mutation = self.append_guarded(
                    WorkEntityKind::AutomationRun,
                    run.id.clone(),
                    false,
                    "claim",
                    &run_guard,
                )?;
                self.transaction.execute(
                    "INSERT INTO automation_runs
                     (id,automation_id,occurrence_key,status,scheduled_at,provider_json,model,
                      prompt_json,work_run_id,started_at,finished_at,wait_json,failure_json,
                      coalesced_missed,missed_start,missed_end,created_at,updated_at)
                     VALUES(?1,?2,?3,'queued',?4,?5,?6,?7,NULL,NULL,NULL,NULL,NULL,?8,?9,?10,?11,?11)",
                    params![
                        run.id,
                        run.automation_id,
                        run.occurrence_key,
                        run.scheduled_at,
                        serde_json::to_string(&run.provider)?,
                        run.model,
                        serde_json::to_string(&run.prompt)?,
                        i64::try_from(run.coalesced_missed).unwrap_or(i64::MAX),
                        run.missed_start,
                        run.missed_end,
                        now,
                    ],
                )?;
                WorkVersioned {
                    entity: run,
                    revision: mutation.revision,
                }
            };

            automation.cursor_ms = Some(now);
            automation.last_evaluated_at = Some(now);
            automation.next_due_at = automation
                .due_summary(now, now.saturating_add(MAX_DUE_WINDOW_MS))
                .map_err(|error| StoreError::Domain(error.to_string()))?
                .map(|summary| summary.first_ms);
            let automation_guard = WorkMutationGuard::from_audit(Some(current.revision), audit);
            let mutation = self.append_guarded(
                WorkEntityKind::Automation,
                automation.id.clone(),
                false,
                "evaluate",
                &automation_guard,
            )?;
            self.transaction.execute(
                "UPDATE automations SET last_evaluated_at=?2,next_due_at=?3,cursor_ms=?4,
                   updated_at=?5 WHERE id=?1",
                params![
                    automation.id,
                    automation.last_evaluated_at,
                    automation.next_due_at,
                    automation.cursor_ms,
                    now,
                ],
            )?;
            debug_assert_eq!(mutation.revision, current.revision + 1);
            claimed.push(run);
        }
        Ok(claimed)
    }

    pub fn transition_automation_run(
        &mut self,
        run_id: &str,
        target: AutomationRunStatus,
        wait: Option<AutomationWait>,
        failure: Option<AutomationFailure>,
        now: i64,
        audit: &WorkAuditContext,
    ) -> Result<WorkVersioned<AutomationRun>, StoreError> {
        let mut current = self
            .transaction
            .query_row(
                "SELECT r.id,r.automation_id,r.occurrence_key,r.status,r.scheduled_at,
                        r.provider_json,r.model,r.prompt_json,r.work_run_id,r.started_at,
                        r.finished_at,r.wait_json,r.failure_json,r.coalesced_missed,
                        r.missed_start,r.missed_end,r.created_at,r.updated_at,h.revision
                 FROM automation_runs r JOIN work_entity_heads h
                   ON h.entity_kind='automation_run' AND h.entity_id=r.id AND h.deleted=0
                 WHERE r.id=?1",
                [run_id],
                automation_run_from_row,
            )
            .optional()?
            .ok_or_else(|| StoreError::Domain("unknown Automation run".to_owned()))?;
        if !current.entity.status.can_transition_to(target) {
            return Err(StoreError::Domain(format!(
                "invalid Automation run transition: {} -> {}",
                current.entity.status.as_str(),
                target.as_str()
            )));
        }
        current.entity.status = target;
        current.entity.wait = wait;
        current.entity.failure = failure;
        current.entity.updated_at = now;
        if target == AutomationRunStatus::Running && current.entity.started_at.is_none() {
            current.entity.started_at = Some(now);
        }
        if !target.is_active() {
            current.entity.finished_at = Some(now);
        }
        current
            .entity
            .validate()
            .map_err(|error| StoreError::Domain(error.to_string()))?;
        let guard = WorkMutationGuard::from_audit(Some(current.revision), audit);
        let mutation = self.append_guarded(
            WorkEntityKind::AutomationRun,
            current.entity.id.clone(),
            false,
            format!("status_{}", target.as_str()),
            &guard,
        )?;
        self.transaction.execute(
            "UPDATE automation_runs SET status=?2,started_at=?3,finished_at=?4,wait_json=?5,
               failure_json=?6,updated_at=?7 WHERE id=?1",
            params![
                current.entity.id,
                target.as_str(),
                current.entity.started_at,
                current.entity.finished_at,
                current
                    .entity
                    .wait
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                current
                    .entity
                    .failure
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                now,
            ],
        )?;
        current.revision = mutation.revision;
        Ok(current)
    }

    pub fn start_automation_run(
        &mut self,
        run_id: &str,
        work_run_id: &str,
        now: i64,
        audit: &WorkAuditContext,
    ) -> Result<WorkVersioned<AutomationRun>, StoreError> {
        let mut current = self
            .transaction
            .query_row(
                "SELECT r.id,r.automation_id,r.occurrence_key,r.status,r.scheduled_at,
                        r.provider_json,r.model,r.prompt_json,r.work_run_id,r.started_at,
                        r.finished_at,r.wait_json,r.failure_json,r.coalesced_missed,
                        r.missed_start,r.missed_end,r.created_at,r.updated_at,h.revision
                 FROM automation_runs r JOIN work_entity_heads h
                   ON h.entity_kind='automation_run' AND h.entity_id=r.id AND h.deleted=0
                 WHERE r.id=?1",
                [run_id],
                automation_run_from_row,
            )
            .optional()?
            .ok_or_else(|| StoreError::Domain("unknown Automation run".to_owned()))?;
        if current.entity.status != AutomationRunStatus::Queued
            || current.entity.work_run_id.is_some()
        {
            return Err(StoreError::Domain(
                "Automation run is not ready to start".to_owned(),
            ));
        }
        let owned: bool = self.transaction.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM automation_runs ar
               JOIN automations a ON a.id=ar.automation_id
               JOIN sessions s ON s.id=?2 AND s.task_id=a.task_id
               JOIN work_entity_heads h
                 ON h.entity_kind='run' AND h.entity_id=s.id AND h.deleted=0
               WHERE ar.id=?1
             )",
            params![run_id, work_run_id],
            |row| row.get(0),
        )?;
        if !owned {
            return Err(StoreError::Domain(
                "Automation occurrence and Work Run do not share a Task".to_owned(),
            ));
        }
        current.entity.status = AutomationRunStatus::Running;
        current.entity.work_run_id = Some(work_run_id.to_owned());
        current.entity.started_at = Some(now);
        current.entity.updated_at = now;
        current
            .entity
            .validate()
            .map_err(|error| StoreError::Domain(error.to_string()))?;
        let guard = WorkMutationGuard::from_audit(Some(current.revision), audit);
        let mutation = self.append_guarded(
            WorkEntityKind::AutomationRun,
            current.entity.id.clone(),
            false,
            "start",
            &guard,
        )?;
        self.transaction.execute(
            "UPDATE automation_runs SET status='running',work_run_id=?2,started_at=?3,
               wait_json=NULL,failure_json=NULL,updated_at=?3 WHERE id=?1",
            params![current.entity.id, work_run_id, now],
        )?;
        current.revision = mutation.revision;
        Ok(current)
    }

    pub fn transition_task_status(
        &mut self,
        task_id: &str,
        target: TaskStatus,
        guard: &WorkMutationGuard,
    ) -> Result<WorkMutation, StoreError> {
        let current: Option<String> = self
            .transaction
            .query_row("SELECT status FROM tasks WHERE id=?1", [task_id], |row| {
                row.get(0)
            })
            .optional()?;
        let current = current
            .as_deref()
            .and_then(TaskStatus::parse)
            .ok_or_else(|| StoreError::Domain(format!("unknown Work Task {task_id}")))?;
        if !current.can_transition_to(target) {
            return Err(StoreError::Domain(format!(
                "invalid Task lifecycle transition: {} -> {}",
                current.as_str(),
                target.as_str()
            )));
        }
        let input = guard.input(
            WorkEntityKind::Task,
            task_id.to_owned(),
            false,
            format!("status_{}", target.as_str()),
        );
        let revision = self.next_revision(&input)?;
        let changed = self.transaction.execute(
            "UPDATE tasks SET status=?2,updated_at=?3 WHERE id=?1",
            params![task_id, target.as_str(), now_millis()],
        )?;
        if changed != 1 {
            return Err(StoreError::Domain(format!("unknown Work Task {task_id}")));
        }
        self.append_with_revision(&input, revision)
    }

    pub fn save_brief(
        &mut self,
        mut brief: BriefRevision,
        guard: &WorkMutationGuard,
    ) -> Result<BriefRevision, StoreError> {
        // The caller supplies identity, blocks, and source. Revision and timestamp are
        // transaction-owned and are deliberately overwritten after both CAS preflights pass.
        brief.revision = 1;
        brief.created_at = 0;
        brief.validate().map_err(StoreError::Domain)?;
        let brief_input = guard.input(WorkEntityKind::Brief, brief.task_id.clone(), false, "save");
        let task_revision = self.active_task_head_revision(&brief.task_id)?;
        let mut task_input = guard.input(
            WorkEntityKind::Task,
            brief.task_id.clone(),
            false,
            "brief_pointer",
        );
        task_input.expected_revision = Some(task_revision);
        // Read every next revision before writing either projection. A stale Brief or Task head
        // therefore leaves the projection, both heads, and the global clock untouched.
        let brief_revision = self.next_revision(&brief_input)?;
        let next_task_revision = self.next_revision(&task_input)?;
        brief.revision = sqlite_revision(brief_revision)?;
        brief.created_at = now_millis();
        let blocks = serde_json::to_string(&brief.blocks)?;
        self.transaction.execute(
            "INSERT INTO brief_revisions(id,task_id,revision,blocks_json,source,created_at)
             VALUES(?1,?2,?3,?4,?5,?6)",
            params![
                brief.id,
                brief.task_id,
                brief.revision,
                blocks,
                brief.source,
                brief.created_at,
            ],
        )?;
        let changed = self.transaction.execute(
            "UPDATE tasks SET current_brief_revision=?2,updated_at=?3 WHERE id=?1",
            params![brief.task_id, brief.revision, brief.created_at],
        )?;
        if changed != 1 {
            return Err(StoreError::Domain(
                "brief task pointer update did not affect exactly one row".to_owned(),
            ));
        }
        self.append_with_revision(&brief_input, brief_revision)?;
        self.append_with_revision(&task_input, next_task_revision)?;
        Ok(brief)
    }

    pub fn save_deliverable(
        &mut self,
        mut deliverable: Deliverable,
        guard: &WorkMutationGuard,
    ) -> Result<DeliverableSaveResult, StoreError> {
        if guard.expected_revision.is_some() {
            return Err(StoreError::Domain(
                "new Deliverables do not accept an expected revision".to_owned(),
            ));
        }
        let owned: bool = self.transaction.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM sessions s
               JOIN tasks t ON t.id=s.task_id
               JOIN work_entity_heads rh
                 ON rh.entity_kind='run' AND rh.entity_id=s.id AND rh.deleted=0
               JOIN work_entity_heads th
                 ON th.entity_kind='task' AND th.entity_id=t.id AND th.deleted=0
               JOIN work_entity_heads wh
                 ON wh.entity_kind='workspace' AND wh.entity_id=t.workspace_id AND wh.deleted=0
               WHERE s.id=?1 AND s.task_id=?2
             )",
            params![deliverable.run_id, deliverable.task_id],
            |row| row.get(0),
        )?;
        if !owned {
            return Err(StoreError::Domain(
                "deliverable run/task ownership mismatch".to_owned(),
            ));
        }

        let current: Option<(Deliverable, u64)> = self
            .transaction
            .query_row(
                "SELECT d.id,d.task_id,d.run_id,d.path,d.mime,d.hash,d.version,d.current,
                        d.missing,d.created_at,d.updated_at,h.revision
                 FROM deliverables d JOIN work_entity_heads h
                   ON h.entity_kind='deliverable' AND h.entity_id=d.id AND h.deleted=0
                 WHERE d.task_id=?1 AND d.path=?2 AND d.current=1",
                params![deliverable.task_id, deliverable.path],
                deliverable_versioned_row,
            )
            .optional()?;
        if let Some((existing, revision)) = &current {
            if existing.hash == deliverable.hash && !existing.missing {
                return Ok(DeliverableSaveResult {
                    item: WorkVersioned {
                        entity: existing.clone(),
                        revision: *revision,
                    },
                    retired: None,
                    changed: false,
                });
            }
        }

        let latest_version: Option<i64> = self.transaction.query_row(
            "SELECT MAX(version) FROM deliverables WHERE task_id=?1 AND path=?2",
            params![deliverable.task_id, deliverable.path],
            |row| row.get(0),
        )?;
        let now = now_millis();
        deliverable.version = latest_version
            .unwrap_or(0)
            .checked_add(1)
            .ok_or_else(|| StoreError::Domain("deliverable version overflow".to_owned()))?;
        deliverable.current = true;
        deliverable.missing = false;
        deliverable.created_at = now;
        deliverable.updated_at = now;
        deliverable.validate().map_err(StoreError::Domain)?;

        let retired = if let Some((mut old, old_revision)) = current {
            let changed = self.transaction.execute(
                "UPDATE deliverables SET current=0,updated_at=?2 WHERE id=?1 AND current=1",
                params![old.id, now],
            )?;
            if changed != 1 {
                return Err(StoreError::Domain(
                    "current Deliverable changed during registration".to_owned(),
                ));
            }
            old.current = false;
            old.updated_at = now;
            let mut retire_input =
                guard.input(WorkEntityKind::Deliverable, old.id.clone(), false, "retire");
            retire_input.expected_revision = Some(old_revision);
            let next_revision = self.next_revision(&retire_input)?;
            self.append_with_revision(&retire_input, next_revision)?;
            Some(WorkVersioned {
                entity: old,
                revision: next_revision,
            })
        } else {
            None
        };

        let create_input = guard.input(
            WorkEntityKind::Deliverable,
            deliverable.id.clone(),
            false,
            "create",
        );
        let revision = self.next_revision(&create_input)?;
        self.transaction.execute(
            "INSERT INTO deliverables
             (id,task_id,run_id,path,mime,hash,version,current,missing,created_at,updated_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,1,0,?8,?9)",
            params![
                deliverable.id,
                deliverable.task_id,
                deliverable.run_id,
                deliverable.path,
                deliverable.mime,
                deliverable.hash,
                deliverable.version,
                deliverable.created_at,
                deliverable.updated_at,
            ],
        )?;
        self.append_with_revision(&create_input, revision)?;
        Ok(DeliverableSaveResult {
            item: WorkVersioned {
                entity: deliverable,
                revision,
            },
            retired,
            changed: true,
        })
    }

    pub fn save_run_snapshot(
        &mut self,
        mut snapshot: RunSnapshot,
        guard: &WorkMutationGuard,
    ) -> Result<WorkVersioned<RunSnapshot>, StoreError> {
        if guard.expected_revision.is_some() {
            return Err(StoreError::Domain(
                "new Snapshots do not accept an expected revision".to_owned(),
            ));
        }
        snapshot.created_at = now_millis();
        snapshot.validate().map_err(StoreError::Domain)?;
        let owned: bool = self.transaction.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM sessions s
               JOIN work_entity_heads rh
                 ON rh.entity_kind='run' AND rh.entity_id=s.id AND rh.deleted=0
               JOIN tasks t ON t.id=s.task_id
               JOIN work_entity_heads th
                 ON th.entity_kind='task' AND th.entity_id=t.id AND th.deleted=0
               WHERE s.id=?1 AND s.task_id=?2
             )",
            params![snapshot.run_id, snapshot.task_id],
            |row| row.get(0),
        )?;
        if !owned {
            return Err(StoreError::Domain(
                "snapshot run/task ownership mismatch".to_owned(),
            ));
        }
        let input = guard.input(
            WorkEntityKind::Snapshot,
            snapshot.id.clone(),
            false,
            "create",
        );
        let revision = self.next_revision(&input)?;
        self.transaction.execute(
            "INSERT INTO run_snapshots
             (id,task_id,run_id,storage_path,manifest_json,not_covered_json,created_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![
                snapshot.id,
                snapshot.task_id,
                snapshot.run_id,
                snapshot.storage_path,
                serde_json::to_string(&snapshot.manifest)?,
                serde_json::to_string(&snapshot.not_covered)?,
                snapshot.created_at,
            ],
        )?;
        self.append_with_revision(&input, revision)?;
        Ok(WorkVersioned {
            entity: snapshot,
            revision,
        })
    }

    pub fn save_run_changes(
        &mut self,
        snapshot_id: &str,
        mut changes: Vec<SnapshotChange>,
        guard: &WorkMutationGuard,
    ) -> Result<Vec<WorkVersioned<RunChange>>, StoreError> {
        if guard.expected_revision.is_some() {
            return Err(StoreError::Domain(
                "new Changes do not accept an expected revision".to_owned(),
            ));
        }
        let active: bool = self.transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM run_snapshots s JOIN work_entity_heads h
               ON h.entity_kind='snapshot' AND h.entity_id=s.id AND h.deleted=0 WHERE s.id=?1)",
            [snapshot_id],
            |row| row.get(0),
        )?;
        if !active {
            return Err(StoreError::Domain(
                "snapshot unavailable for change review".to_owned(),
            ));
        }
        let existing_count: i64 = self.transaction.query_row(
            "SELECT COUNT(*) FROM run_changes WHERE snapshot_id=?1",
            [snapshot_id],
            |row| row.get(0),
        )?;
        if existing_count > 0 {
            let mut statement = self.transaction.prepare(
                "SELECT c.id,c.snapshot_id,c.change_json,c.created_at,h.revision
                 FROM run_changes c JOIN work_entity_heads h
                   ON h.entity_kind='change' AND h.entity_id=c.id AND h.deleted=0
                 WHERE c.snapshot_id=?1 ORDER BY c.path,c.id",
            )?;
            let rows = statement.query_map([snapshot_id], run_change_versioned_row)?;
            return Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }

        changes.sort_by(|left, right| left.path.cmp(&right.path));
        if changes.windows(2).any(|pair| pair[0].path == pair[1].path) {
            return Err(StoreError::Domain(
                "duplicate paths in Work change set".to_owned(),
            ));
        }
        let now = now_millis();
        let mut saved = Vec::with_capacity(changes.len());
        for change in changes {
            let entity = RunChange {
                id: uuid::Uuid::new_v4().to_string(),
                snapshot_id: snapshot_id.to_owned(),
                change,
                created_at: now,
            };
            entity.validate().map_err(StoreError::Domain)?;
            let input = guard.input(WorkEntityKind::Change, entity.id.clone(), false, "create");
            let revision = self.next_revision(&input)?;
            self.transaction.execute(
                "INSERT INTO run_changes(id,snapshot_id,path,change_json,created_at)
                 VALUES(?1,?2,?3,?4,?5)",
                params![
                    entity.id,
                    entity.snapshot_id,
                    entity.change.path,
                    serde_json::to_string(&entity.change)?,
                    entity.created_at,
                ],
            )?;
            self.append_with_revision(&input, revision)?;
            saved.push(WorkVersioned { entity, revision });
        }
        Ok(saved)
    }

    pub fn high_water(&self) -> Result<u64, StoreError> {
        high_water(&self.transaction)
    }

    pub fn entity_head(
        &self,
        entity_kind: WorkEntityKind,
        entity_id: &str,
    ) -> Result<Option<WorkEntityHead>, StoreError> {
        entity_head(&self.transaction, entity_kind, entity_id)
    }

    fn active_task_head_revision(&self, task_id: &str) -> Result<u64, StoreError> {
        let task_exists: i64 = self.transaction.query_row(
            "SELECT COUNT(*) FROM tasks WHERE id=?1",
            params![task_id],
            |row| row.get(0),
        )?;
        if task_exists != 1 {
            return Err(StoreError::Domain(format!(
                "task {task_id} must have exactly one projection row"
            )));
        }
        let Some((revision, deleted)) = self
            .transaction
            .query_row(
                "SELECT revision,deleted FROM work_entity_heads
                 WHERE entity_kind='task' AND entity_id=?1",
                params![task_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)? != 0)),
            )
            .optional()?
        else {
            return Err(StoreError::Domain(format!(
                "task {task_id} ledger head is missing"
            )));
        };
        let revision = u64::try_from(revision)
            .map_err(|_| StoreError::Domain("task revision is out of bounds".to_owned()))?;
        if deleted {
            return Err(work_conflict(WorkEntityKind::Task, task_id, Some(revision)));
        }
        Ok(revision)
    }

    fn next_revision(&self, input: &WorkMutationInput) -> Result<u64, StoreError> {
        input.validate()?;
        let current: Option<(i64, bool)> = self
            .transaction
            .query_row(
                "SELECT revision,deleted FROM work_entity_heads
                 WHERE entity_kind=?1 AND entity_id=?2",
                params![input.entity_kind.as_str(), input.entity_id],
                |row| Ok((row.get(0)?, row.get::<_, i64>(1)? != 0)),
            )
            .optional()?;
        match current {
            None if input.expected_revision.is_none() && !input.deleted => Ok(1),
            None => Err(work_conflict(input.entity_kind, &input.entity_id, None)),
            Some((current, true)) => Err(work_conflict(
                input.entity_kind,
                &input.entity_id,
                u64::try_from(current).ok(),
            )),
            Some((current, false)) => {
                let current = u64::try_from(current)
                    .map_err(|_| StoreError::Domain("invalid Work head revision".to_owned()))?;
                if input.expected_revision != Some(current) {
                    return Err(work_conflict(
                        input.entity_kind,
                        &input.entity_id,
                        Some(current),
                    ));
                }
                current
                    .checked_add(1)
                    .ok_or_else(|| StoreError::Domain("Work revision overflow".to_owned()))
            }
        }
    }

    fn append_with_revision(
        &mut self,
        input: &WorkMutationInput,
        revision: u64,
    ) -> Result<WorkMutation, StoreError> {
        append_with_revision_tx(&self.transaction, input, revision, now_millis())
    }
}

fn deliverable_versioned_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<(Deliverable, u64)> {
    Ok((
        Deliverable {
            id: row.get(0)?,
            task_id: row.get(1)?,
            run_id: row.get(2)?,
            path: row.get(3)?,
            mime: row.get(4)?,
            hash: row.get(5)?,
            version: row.get(6)?,
            current: row.get::<_, i64>(7)? != 0,
            missing: row.get::<_, i64>(8)? != 0,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        },
        u64::try_from(row.get::<_, i64>(11)?).map_err(|_| rusqlite::Error::InvalidQuery)?,
    ))
}

fn run_change_versioned_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkVersioned<RunChange>> {
    let change_json: String = row.get(2)?;
    let change = serde_json::from_str(&change_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(WorkVersioned {
        entity: RunChange {
            id: row.get(0)?,
            snapshot_id: row.get(1)?,
            change,
            created_at: row.get(3)?,
        },
        revision: u64::try_from(row.get::<_, i64>(4)?)
            .map_err(|_| rusqlite::Error::InvalidQuery)?,
    })
}

fn append_with_revision_tx(
    tx: &Transaction<'_>,
    input: &WorkMutationInput,
    revision: u64,
    now: i64,
) -> Result<WorkMutation, StoreError> {
    let revision_i64 = sqlite_revision(revision)?;
    tx.execute(
        "UPDATE work_revision_clock SET high_water=high_water+1 WHERE singleton=1",
        [],
    )?;
    let mutation_id: i64 = tx.query_row(
        "SELECT high_water FROM work_revision_clock WHERE singleton=1",
        [],
        |row| row.get(0),
    )?;
    if mutation_id < 1 {
        return Err(StoreError::Domain("invalid Work mutation id".to_owned()));
    }
    tx.execute(
            "INSERT INTO work_entity_heads(entity_kind,entity_id,revision,deleted,mutation_id,updated_at)
             VALUES(?1,?2,?3,?4,?5,?6)
             ON CONFLICT(entity_kind,entity_id) DO UPDATE SET revision=excluded.revision,
               deleted=excluded.deleted,mutation_id=excluded.mutation_id,updated_at=excluded.updated_at",
            params![
                input.entity_kind.as_str(),
                input.entity_id,
                revision_i64,
                input.deleted as i64,
                mutation_id,
                now,
            ],
        )?;
    tx.execute(
            "INSERT INTO work_mutations
             (mutation_id,entity_kind,entity_id,revision,deleted,operation,actor,auth_subject,request_id,created_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![
                mutation_id,
                input.entity_kind.as_str(),
                input.entity_id,
                revision_i64,
                input.deleted as i64,
                input.operation,
                input.audit.actor,
                input.audit.auth_subject,
                input.audit.request_id,
                now,
            ],
        )?;
    Ok(WorkMutation {
        mutation_id: u64::try_from(mutation_id)
            .map_err(|_| StoreError::Domain("invalid Work mutation id".to_owned()))?,
        entity_kind: input.entity_kind,
        entity_id: input.entity_id.clone(),
        revision,
        deleted: input.deleted,
        operation: input.operation.clone(),
        actor: input.audit.actor.clone(),
        auth_subject: input.audit.auth_subject.clone(),
        request_id: input.audit.request_id.clone(),
        created_at: now,
    })
}

pub fn high_water(conn: &Connection) -> Result<u64, StoreError> {
    let value: i64 = conn.query_row(
        "SELECT high_water FROM work_revision_clock WHERE singleton=1",
        [],
        |row| row.get(0),
    )?;
    u64::try_from(value).map_err(|_| StoreError::Domain("invalid Work high-water".to_owned()))
}

pub fn entity_head(
    conn: &Connection,
    entity_kind: WorkEntityKind,
    entity_id: &str,
) -> Result<Option<WorkEntityHead>, StoreError> {
    let row = conn
        .query_row(
            "SELECT entity_kind,entity_id,revision,deleted,mutation_id,updated_at
             FROM work_entity_heads WHERE entity_kind=?1 AND entity_id=?2",
            params![entity_kind.as_str(), entity_id],
            |row| {
                let kind: String = row.get(0)?;
                Ok(WorkEntityHead {
                    entity_kind: WorkEntityKind::parse(&kind).ok_or_else(|| {
                        rusqlite::Error::InvalidColumnType(
                            0,
                            "entity_kind".to_owned(),
                            rusqlite::types::Type::Text,
                        )
                    })?,
                    entity_id: row.get(1)?,
                    revision: u64::try_from(row.get::<_, i64>(2)?).map_err(|_| {
                        rusqlite::Error::InvalidColumnType(
                            2,
                            "revision".to_owned(),
                            rusqlite::types::Type::Integer,
                        )
                    })?,
                    deleted: row.get::<_, i64>(3)? != 0,
                    mutation_id: u64::try_from(row.get::<_, i64>(4)?).map_err(|_| {
                        rusqlite::Error::InvalidColumnType(
                            4,
                            "mutation_id".to_owned(),
                            rusqlite::types::Type::Integer,
                        )
                    })?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .optional()?;
    Ok(row)
}

pub fn mutation_history(
    conn: &Connection,
    entity_kind: WorkEntityKind,
    entity_id: &str,
) -> Result<Vec<WorkMutation>, StoreError> {
    let mut statement = conn.prepare(
        "SELECT mutation_id,entity_kind,entity_id,revision,deleted,operation,actor,auth_subject,
                request_id,created_at
         FROM work_mutations WHERE entity_kind=?1 AND entity_id=?2 ORDER BY revision",
    )?;
    let rows = statement.query_map(params![entity_kind.as_str(), entity_id], |row| {
        let kind: String = row.get(1)?;
        Ok(WorkMutation {
            mutation_id: u64::try_from(row.get::<_, i64>(0)?).map_err(|_| {
                rusqlite::Error::InvalidColumnType(
                    0,
                    "mutation_id".to_owned(),
                    rusqlite::types::Type::Integer,
                )
            })?,
            entity_kind: WorkEntityKind::parse(&kind).ok_or_else(|| {
                rusqlite::Error::InvalidColumnType(
                    1,
                    "entity_kind".to_owned(),
                    rusqlite::types::Type::Text,
                )
            })?,
            entity_id: row.get(2)?,
            revision: u64::try_from(row.get::<_, i64>(3)?).map_err(|_| {
                rusqlite::Error::InvalidColumnType(
                    3,
                    "revision".to_owned(),
                    rusqlite::types::Type::Integer,
                )
            })?,
            deleted: row.get::<_, i64>(4)? != 0,
            operation: row.get(5)?,
            actor: row.get(6)?,
            auth_subject: row.get(7)?,
            request_id: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}
