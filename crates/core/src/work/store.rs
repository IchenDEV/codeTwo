use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

use super::domain::{
    BriefRevision, BriefSaveResult, Deliverable, DeliverableSaveResult, Run, RunChange,
    RunSnapshot, Task, TaskExperience, TaskStatus, WorkPage, WorkVersioned, Workspace,
    WorkspaceKind, MAX_WORK_PAGE_SIZE,
};
use super::ledger::{
    ensure_backfill_head, entity_head, high_water, install_schema_tx, with_transaction,
    WorkAuditContext, WorkEntityKind, WorkMutationGuard,
};
use crate::automation::{
    AutomationFailure, AutomationRun, AutomationRunStatus, AutomationSpec, AutomationValidation,
    AutomationWait,
};
use crate::store::{Store, StoreError};
use crate::work_snapshot::SnapshotChange;

pub(crate) const WORK_STORE_MARKER: &str = "work_store_v1";
const BACKUP_SUFFIX: &str = ".pre-work-store-v1.bak";
const ROOTLESS_WORKSPACE_KEY: &str = "work-store-v1:rootless-recovery";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkRunBinding {
    pub session_id: String,
    pub task_id: String,
    pub run_index: i64,
}

#[derive(Debug, Clone)]
struct LegacySession {
    id: String,
    title: String,
    cwd: String,
    project_path: Option<String>,
    worktree_path: Option<String>,
    task_id: Option<String>,
    run_index: Option<i64>,
    created_at: i64,
}

#[derive(Debug, Clone)]
struct WorkspaceSeed {
    id: String,
    root_path: Option<String>,
    name: String,
    created_at: i64,
}

#[derive(Debug, Clone)]
struct TaskSeed {
    id: String,
    workspace_id: String,
    title: String,
    created_at: i64,
}

pub(crate) fn backup_path(path: &str) -> PathBuf {
    PathBuf::from(format!("{path}{BACKUP_SUFFIX}"))
}

pub(crate) fn prepare_backup(
    path: &str,
    conn: &Connection,
    preexisting: bool,
) -> Result<Option<PathBuf>, StoreError> {
    let destination = backup_path(path);
    if destination.exists() {
        validate_backup(&destination)?;
        harden_backup(&destination)?;
        return Ok(Some(destination));
    }
    if !preexisting || work_store_marker_applied(conn)? || !has_user_rows(conn)? {
        return Ok(None);
    }
    conn.execute("VACUUM INTO ?1", [destination.to_string_lossy().as_ref()])?;
    validate_backup(&destination)?;
    harden_backup(&destination)?;
    Ok(Some(destination))
}

fn validate_backup(path: &Path) -> Result<(), StoreError> {
    let connection = Connection::open(path)?;
    let result: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if result != "ok" {
        return Err(StoreError::Domain(format!(
            "pre-Work Store backup failed integrity_check: {result}"
        )));
    }
    Ok(())
}

fn harden_backup(path: &Path) -> Result<(), StoreError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| {
            StoreError::Domain(format!("cannot harden Work Store backup: {error}"))
        })?;
    }
    Ok(())
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool, StoreError> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        [table],
        |row| row.get(0),
    )?)
}

fn work_store_marker_applied(conn: &Connection) -> Result<bool, StoreError> {
    if !table_exists(conn, "work_schema_migrations")? {
        return Ok(false);
    }
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM work_schema_migrations WHERE id=?1)",
        [WORK_STORE_MARKER],
        |row| row.get(0),
    )?)
}

fn has_user_rows(conn: &Connection) -> Result<bool, StoreError> {
    let mut statement = conn.prepare(
        "SELECT name FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )?;
    let tables = statement.query_map([], |row| row.get::<_, String>(0))?;
    let tables = tables.collect::<rusqlite::Result<Vec<_>>>()?;
    drop(statement);
    for table in tables {
        if table == "memory_settings" {
            if memory_settings_is_default(conn)? {
                continue;
            }
            return Ok(true);
        }
        if ignored_user_table(&table) {
            continue;
        }
        let quoted = quote_identifier(&table);
        if conn.query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {quoted} LIMIT 1)"),
            [],
            |row| row.get(0),
        )? {
            return Ok(true);
        }
    }
    Ok(false)
}

fn ignored_user_table(table: &str) -> bool {
    matches!(
        table,
        "schema_migrations" | "work_schema_migrations" | "work_revision_clock"
    ) || table.starts_with("parts_fts")
}

fn memory_settings_is_default(conn: &Connection) -> Result<bool, StoreError> {
    for column in ["singleton", "enabled", "capture", "inject"] {
        let present: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info('memory_settings') WHERE name=?1)",
            [column],
            |row| row.get(0),
        )?;
        if !present {
            return Ok(false);
        }
    }
    let row_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM memory_settings", [], |row| row.get(0))?;
    if row_count == 0 {
        return Ok(true);
    }
    if row_count != 1 {
        return Ok(false);
    }
    let include_external_context: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pragma_table_info('memory_settings')
         WHERE name='include_external_context')",
        [],
        |row| row.get(0),
    )?;
    let values: Option<(i64, i64, i64, i64, Option<i64>)> = if include_external_context {
        conn.query_row(
            "SELECT singleton,enabled,capture,inject,include_external_context
             FROM memory_settings WHERE singleton=1",
            [],
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
        .optional()?
    } else {
        conn.query_row(
            "SELECT singleton,enabled,capture,inject FROM memory_settings WHERE singleton=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, None)),
        )
        .optional()?
    };
    let Some(values) = values else {
        return Ok(false);
    };
    Ok(values.0 == 1
        && values.1 == 1
        && values.2 == 1
        && values.3 == 1
        && values.4.unwrap_or(1) == 1)
}

fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

pub(crate) fn install(conn: &mut Connection) -> Result<(), StoreError> {
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    if work_store_marker_applied(conn)? {
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        install_schema_tx(&tx)?;
        tx.commit()?;
        return Ok(());
    }
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    install_schema_tx(&tx)?;
    ensure_column(
        &tx,
        "sessions",
        "task_id",
        "task_id TEXT REFERENCES tasks(id)",
    )?;
    ensure_column(
        &tx,
        "sessions",
        "run_index",
        "run_index INTEGER NOT NULL DEFAULT 1 CHECK(run_index >= 1)",
    )?;
    backfill(&tx)?;
    tx.execute_batch(
        "CREATE UNIQUE INDEX IF NOT EXISTS sessions_work_task_run
           ON sessions(task_id,run_index) WHERE task_id IS NOT NULL;",
    )?;
    tx.execute(
        "INSERT OR IGNORE INTO work_schema_migrations(id,applied_at) VALUES(?1,?2)",
        params![WORK_STORE_MARKER, super::ledger::now_millis()],
    )?;
    tx.commit()?;
    Ok(())
}

fn ensure_column(
    tx: &Transaction<'_>,
    table: &str,
    column: &str,
    definition: &str,
) -> Result<(), StoreError> {
    let present: bool = tx.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM pragma_table_info(?1) WHERE name=?2
         )",
        params![table, column],
        |row| row.get(0),
    )?;
    if !present {
        tx.execute(&format!("ALTER TABLE {table} ADD COLUMN {definition}"), [])?;
    }
    Ok(())
}

fn backfill(tx: &Transaction<'_>) -> Result<(), StoreError> {
    let sessions = load_legacy_sessions(tx)?;
    let mut workspace_seeds = BTreeMap::<String, WorkspaceSeed>::new();
    let mut task_seeds = BTreeMap::<String, TaskSeed>::new();
    let mut task_head_times = BTreeMap::<String, i64>::new();
    let mut assignments = Vec::with_capacity(sessions.len());

    for session in &sessions {
        let root_path = source_root(session);
        let root_key = root_path
            .clone()
            .unwrap_or_else(|| ROOTLESS_WORKSPACE_KEY.to_owned());
        let workspace_id = existing_or_deterministic_workspace(tx, &root_path, &root_key)?;
        let workspace_name = workspace_name(tx, root_path.as_deref())?;
        workspace_seeds
            .entry(workspace_id.clone())
            .or_insert_with(|| WorkspaceSeed {
                id: workspace_id.clone(),
                root_path: root_path.clone(),
                name: workspace_name.clone(),
                created_at: normalize_timestamp(session.created_at),
            });
        let task_id = session
            .task_id
            .as_deref()
            .filter(|id| valid_id(id))
            .map(str::to_owned)
            .unwrap_or_else(|| deterministic_id("task", &session.id));
        task_head_times
            .entry(task_id.clone())
            .or_insert_with(|| normalize_timestamp(session.created_at));
        if !task_seeds.contains_key(&task_id) && !task_exists(tx, &task_id)? {
            task_seeds.insert(
                task_id.clone(),
                TaskSeed {
                    id: task_id.clone(),
                    workspace_id: workspace_id.clone(),
                    title: normalized_title(&session.title),
                    created_at: normalize_timestamp(session.created_at),
                },
            );
        }
        assignments.push((session.clone(), task_id));
    }

    for seed in workspace_seeds.values() {
        tx.execute(
            "INSERT INTO workspaces(id,name,root_path,kind,created_at,updated_at)
             VALUES(?1,?2,?3,'external',?4,?4)
             ON CONFLICT(id) DO NOTHING",
            params![seed.id, seed.name, seed.root_path, seed.created_at],
        )?;
        ensure_backfill_head(tx, WorkEntityKind::Workspace, &seed.id, seed.created_at)?;
    }
    for seed in task_seeds.values() {
        tx.execute(
            "INSERT INTO tasks(id,workspace_id,title,experience,status,current_brief_revision,
               created_at,updated_at,archived)
             VALUES(?1,?2,?3,'code','active',NULL,?4,?4,0)
             ON CONFLICT(id) DO NOTHING",
            params![seed.id, seed.workspace_id, seed.title, seed.created_at],
        )?;
    }
    for (task_id, created_at) in task_head_times {
        ensure_backfill_head(tx, WorkEntityKind::Task, &task_id, created_at)?;
    }

    assignments.sort_by(|left, right| left.0.id.cmp(&right.0.id));
    let mut used_bindings = BTreeSet::new();
    for (session, task_id) in assignments {
        let run_index = available_run_index(tx, &session, &task_id, &mut used_bindings)?;
        let created_at = normalize_timestamp(session.created_at);
        tx.execute(
            "UPDATE sessions SET task_id=?2,run_index=?3,created_at=?4 WHERE id=?1",
            params![session.id, task_id, run_index, created_at],
        )?;
        ensure_backfill_head(tx, WorkEntityKind::Run, &session.id, created_at)?;
    }
    Ok(())
}

fn load_legacy_sessions(tx: &Transaction<'_>) -> Result<Vec<LegacySession>, StoreError> {
    let mut statement = tx.prepare(
        "SELECT id,title,cwd,project_path,worktree_path,task_id,run_index,created_at
         FROM sessions ORDER BY id",
    )?;
    let rows = statement.query_map([], legacy_session_from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn load_legacy_session(
    tx: &Transaction<'_>,
    session_id: &str,
) -> Result<Option<LegacySession>, StoreError> {
    tx.query_row(
        "SELECT id,title,cwd,project_path,worktree_path,task_id,run_index,created_at
         FROM sessions WHERE id=?1",
        [session_id],
        legacy_session_from_row,
    )
    .optional()
    .map_err(StoreError::from)
}

fn legacy_session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LegacySession> {
    Ok(LegacySession {
        id: row.get(0)?,
        title: row.get(1)?,
        cwd: row.get(2)?,
        project_path: row.get(3)?,
        worktree_path: row.get(4)?,
        task_id: row.get(5)?,
        run_index: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn source_root(session: &LegacySession) -> Option<String> {
    let candidate = session
        .project_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
        .or_else(|| {
            (!session.worktree_path.is_some() && !session.cwd.trim().is_empty())
                .then_some(session.cwd.as_str())
        });
    candidate.and_then(valid_root)
}

fn valid_root(path: &str) -> Option<String> {
    (!path.is_empty()
        && path.len() <= 4096
        && path.trim() == path
        && !path.chars().any(char::is_control))
    .then(|| path.to_owned())
}

fn existing_or_deterministic_workspace(
    tx: &Transaction<'_>,
    root_path: &Option<String>,
    root_key: &str,
) -> Result<String, StoreError> {
    let existing: Option<String> = match root_path {
        Some(root) => tx
            .query_row(
                "SELECT id FROM workspaces WHERE root_path=?1",
                [root],
                |row| row.get(0),
            )
            .optional()?,
        None => None,
    };
    Ok(existing.unwrap_or_else(|| deterministic_id("workspace", root_key)))
}

fn task_exists(tx: &Transaction<'_>, task_id: &str) -> Result<bool, StoreError> {
    Ok(tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM tasks WHERE id=?1)",
        [task_id],
        |row| row.get(0),
    )?)
}

fn available_run_index(
    tx: &Transaction<'_>,
    session: &LegacySession,
    task_id: &str,
    used: &mut BTreeSet<(String, i64)>,
) -> Result<i64, StoreError> {
    let mut index = session.run_index.filter(|value| *value >= 1).unwrap_or(1);
    loop {
        let occupied: bool = tx.query_row(
            "SELECT EXISTS(
               SELECT 1 FROM sessions WHERE task_id=?1 AND run_index=?2 AND id<>?3
             )",
            params![task_id, index, session.id],
            |row| row.get(0),
        )?;
        if !occupied && used.insert((task_id.to_owned(), index)) {
            return Ok(index);
        }
        index = index
            .checked_add(1)
            .ok_or_else(|| StoreError::Domain("run index overflow".to_owned()))?;
    }
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

fn normalized_title(title: &str) -> String {
    let normalized = bounded_text(title, 512);
    if normalized.is_empty() {
        "Untitled task".to_owned()
    } else {
        normalized
    }
}

fn bounded_text(value: &str, max_bytes: usize) -> String {
    let mut normalized: String = value
        .chars()
        .filter(|character| !character.is_control())
        .collect();
    normalized = normalized.trim().to_owned();
    while normalized.len() > max_bytes {
        normalized.pop();
    }
    normalized.trim().to_owned()
}

fn workspace_name(tx: &Transaction<'_>, root_path: Option<&str>) -> Result<String, StoreError> {
    let candidate = match root_path {
        Some(root) => tx
            .query_row("SELECT name FROM projects WHERE path=?1", [root], |row| {
                row.get::<_, String>(0)
            })
            .optional()?
            .unwrap_or_else(|| crate::store::default_project_name(root)),
        None => "Recovered Workspaces".to_owned(),
    };
    let normalized = bounded_text(&candidate, 256);
    Ok(if normalized.is_empty() {
        "Recovered Workspaces".to_owned()
    } else {
        normalized
    })
}

fn normalize_timestamp(value: i64) -> i64 {
    value.max(0)
}

fn deterministic_id(domain: &str, value: &str) -> String {
    blake3::hash(format!("codetwo-work-store-v1:{domain}:{value}").as_bytes())
        .to_hex()
        .to_string()
}

pub(crate) fn ensure_session_binding_tx(
    tx: &Transaction<'_>,
    session_id: &str,
    preferred_task_id: Option<&str>,
) -> Result<(), StoreError> {
    if !work_store_marker_applied(tx)? {
        return Ok(());
    }
    let session = load_legacy_session(tx, session_id)?
        .ok_or_else(|| StoreError::Domain(format!("unknown session {session_id}")))?;
    if let Some(task_id) = preferred_task_id {
        return bind_existing_task(tx, &session, task_id);
    }
    backfill_one(tx, &session)?;
    Ok(())
}

fn bind_existing_task(
    tx: &Transaction<'_>,
    session: &LegacySession,
    task_id: &str,
) -> Result<(), StoreError> {
    if !valid_id(task_id) {
        return Err(StoreError::Domain("invalid Work task id".to_owned()));
    }
    let workspace_root: Option<Option<String>> = tx
        .query_row(
            "SELECT w.root_path FROM tasks t
             JOIN workspaces w ON w.id=t.workspace_id
             JOIN work_entity_heads h
               ON h.entity_kind='task' AND h.entity_id=t.id AND h.deleted=0
             WHERE t.id=?1",
            [task_id],
            |row| row.get(0),
        )
        .optional()?;
    let Some(workspace_root) = workspace_root else {
        return Err(StoreError::Domain(format!(
            "unknown active Work task {task_id}"
        )));
    };
    if let Some(workspace_root) = workspace_root {
        let session_root = session
            .project_path
            .as_deref()
            .filter(|path| !path.trim().is_empty())
            .unwrap_or(&session.cwd);
        let workspace_root =
            fs::canonicalize(&workspace_root).unwrap_or_else(|_| PathBuf::from(&workspace_root));
        let session_root =
            fs::canonicalize(session_root).unwrap_or_else(|_| PathBuf::from(session_root));
        if !session_root.starts_with(&workspace_root) {
            return Err(StoreError::Domain(
                "Run working directory is outside its Workspace".to_owned(),
            ));
        }
    }
    let mut used = BTreeSet::new();
    let run_index = available_run_index(tx, session, task_id, &mut used)?;
    let timestamp = normalize_timestamp(session.created_at);
    tx.execute(
        "UPDATE sessions SET task_id=?2,run_index=?3,created_at=?4 WHERE id=?1",
        params![session.id, task_id, run_index, timestamp],
    )?;
    ensure_backfill_head(tx, WorkEntityKind::Run, &session.id, timestamp)?;
    Ok(())
}

fn backfill_one(tx: &Transaction<'_>, session: &LegacySession) -> Result<(), StoreError> {
    let root_path = source_root(session);
    let root_key = root_path
        .clone()
        .unwrap_or_else(|| ROOTLESS_WORKSPACE_KEY.to_owned());
    let workspace_id = existing_or_deterministic_workspace(tx, &root_path, &root_key)?;
    let timestamp = normalize_timestamp(session.created_at);
    tx.execute(
        "INSERT INTO workspaces(id,name,root_path,kind,created_at,updated_at)
         VALUES(?1,?2,?3,'external',?4,?4)
         ON CONFLICT(id) DO NOTHING",
        params![
            workspace_id,
            workspace_name(tx, root_path.as_deref())?,
            root_path,
            timestamp,
        ],
    )?;
    ensure_backfill_head(tx, WorkEntityKind::Workspace, &workspace_id, timestamp)?;
    let task_id = session
        .task_id
        .as_deref()
        .filter(|id| valid_id(id))
        .map(str::to_owned)
        .unwrap_or_else(|| deterministic_id("task", &session.id));
    tx.execute(
        "INSERT INTO tasks(id,workspace_id,title,experience,status,current_brief_revision,
           created_at,updated_at,archived)
         VALUES(?1,?2,?3,'code','active',NULL,?4,?4,0)
         ON CONFLICT(id) DO NOTHING",
        params![
            task_id,
            workspace_id,
            normalized_title(&session.title),
            timestamp
        ],
    )?;
    ensure_backfill_head(tx, WorkEntityKind::Task, &task_id, timestamp)?;
    let mut used = BTreeSet::new();
    let run_index = available_run_index(tx, session, &task_id, &mut used)?;
    tx.execute(
        "UPDATE sessions SET task_id=?2,run_index=?3,created_at=?4 WHERE id=?1",
        params![session.id, task_id, run_index, timestamp],
    )?;
    ensure_backfill_head(tx, WorkEntityKind::Run, &session.id, timestamp)?;
    Ok(())
}

impl Store {
    pub fn pre_work_store_v1_backup_path(&self) -> Option<PathBuf> {
        self.pre_work_store_v1_backup.clone()
    }

    pub fn work_save_workspace(
        &self,
        workspace: &Workspace,
        guard: &WorkMutationGuard,
    ) -> Result<WorkVersioned<Workspace>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let mutation = with_transaction(&mut conn, |transaction| {
            transaction.save_workspace(workspace, guard)
        })?;
        Ok(WorkVersioned {
            entity: workspace.clone(),
            revision: mutation.revision,
        })
    }

    pub fn work_list_workspaces(
        &self,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<WorkPage<Workspace>, StoreError> {
        if limit == 0 || limit > MAX_WORK_PAGE_SIZE {
            return Err(StoreError::Domain(format!(
                "Work page limit must be between 1 and {MAX_WORK_PAGE_SIZE}"
            )));
        }
        if cursor.is_some_and(|value| {
            value.is_empty()
                || value.len() > 256
                || value.trim() != value
                || value.chars().any(char::is_control)
        }) {
            return Err(StoreError::Domain("invalid Work page cursor".to_owned()));
        }

        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT w.id,w.name,w.root_path,w.kind,w.created_at,w.updated_at,h.revision
             FROM workspaces w
             JOIN work_entity_heads h
               ON h.entity_kind='workspace' AND h.entity_id=w.id AND h.deleted=0
             WHERE (?1 IS NULL OR w.id > ?1)
             ORDER BY w.id
             LIMIT ?2",
        )?;
        let fetch_limit = i64::try_from(limit + 1)
            .map_err(|_| StoreError::Domain("Work page limit is out of range".to_owned()))?;
        let rows = statement.query_map(params![cursor, fetch_limit], |row| {
            let kind: String = row.get(3)?;
            let revision =
                u64::try_from(row.get::<_, i64>(6)?).map_err(|_| rusqlite::Error::InvalidQuery)?;
            Ok(WorkVersioned {
                entity: Workspace {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    root_path: row.get(2)?,
                    kind: WorkspaceKind::parse(&kind).ok_or(rusqlite::Error::InvalidQuery)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                },
                revision,
            })
        })?;
        let mut items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        let next_cursor = if items.len() > limit {
            items.truncate(limit);
            items.last().map(|item| item.entity.id.clone())
        } else {
            None
        };
        Ok(WorkPage {
            items,
            next_cursor,
            high_water: high_water(&conn)?,
        })
    }

    pub fn work_save_task(
        &self,
        task: &Task,
        guard: &WorkMutationGuard,
    ) -> Result<WorkVersioned<Task>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let mutation =
            with_transaction(&mut conn, |transaction| transaction.save_task(task, guard))?;
        Ok(WorkVersioned {
            entity: task.clone(),
            revision: mutation.revision,
        })
    }

    pub fn work_get_task(&self, task_id: &str) -> Result<Option<WorkVersioned<Task>>, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT t.id,t.workspace_id,t.title,t.experience,t.status,t.current_brief_revision,
                    t.created_at,t.updated_at,t.archived,h.revision
             FROM tasks t JOIN work_entity_heads h
               ON h.entity_kind='task' AND h.entity_id=t.id AND h.deleted=0
             WHERE t.id=?1",
            [task_id],
            |row| {
                Ok(WorkVersioned {
                    entity: task_from_row(row)?,
                    revision: u64::try_from(row.get::<_, i64>(9)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                })
            },
        )
        .optional()
        .map_err(StoreError::from)
    }

    pub fn work_transition_task_status(
        &self,
        task_id: &str,
        target: TaskStatus,
        guard: &WorkMutationGuard,
    ) -> Result<WorkVersioned<Task>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let mutation = with_transaction(&mut conn, |transaction| {
            transaction.transition_task_status(task_id, target, guard)
        })?;
        let task = conn.query_row(
            "SELECT t.id,t.workspace_id,t.title,t.experience,t.status,t.current_brief_revision,
                    t.created_at,t.updated_at,t.archived
             FROM tasks t WHERE t.id=?1",
            [task_id],
            task_from_row,
        )?;
        Ok(WorkVersioned {
            entity: task,
            revision: mutation.revision,
        })
    }

    pub fn work_list_tasks(
        &self,
        workspace_id: Option<&str>,
        include_archived: bool,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<WorkPage<Task>, StoreError> {
        validate_page(cursor, limit)?;
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT t.id,t.workspace_id,t.title,t.experience,t.status,t.current_brief_revision,
                    t.created_at,t.updated_at,t.archived,h.revision
             FROM tasks t JOIN work_entity_heads h
               ON h.entity_kind='task' AND h.entity_id=t.id AND h.deleted=0
             WHERE (?1 IS NULL OR t.workspace_id=?1)
               AND (?2=1 OR t.archived=0)
               AND (?3 IS NULL OR t.id > ?3)
             ORDER BY t.id LIMIT ?4",
        )?;
        let rows = statement.query_map(
            params![
                workspace_id,
                include_archived as i64,
                cursor,
                (limit + 1) as i64
            ],
            |row| {
                Ok(WorkVersioned {
                    entity: task_from_row(row)?,
                    revision: u64::try_from(row.get::<_, i64>(9)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                })
            },
        )?;
        let mut items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        let next_cursor = page_cursor(&mut items, limit, |item| item.entity.id.clone());
        Ok(WorkPage {
            items,
            next_cursor,
            high_water: high_water(&conn)?,
        })
    }

    pub fn work_save_automation(
        &self,
        automation: AutomationSpec,
        guard: &WorkMutationGuard,
    ) -> Result<WorkVersioned<AutomationSpec>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        with_transaction(&mut conn, |transaction| {
            transaction.save_automation(automation, guard)
        })
    }

    pub fn work_get_automation(
        &self,
        automation_id: &str,
    ) -> Result<Option<WorkVersioned<AutomationSpec>>, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT a.id,a.task_id,a.provider_json,a.model,a.prompt_json,a.trigger_json,a.enabled,
                    a.last_evaluated_at,a.next_due_at,a.cursor_ms,a.created_at,a.updated_at,h.revision
             FROM automations a JOIN work_entity_heads h
               ON h.entity_kind='automation' AND h.entity_id=a.id AND h.deleted=0
             WHERE a.id=?1",
            [automation_id],
            automation_from_row,
        )
        .optional()
        .map_err(StoreError::from)
    }

    pub fn work_list_automations(
        &self,
        task_id: Option<&str>,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<WorkPage<AutomationSpec>, StoreError> {
        validate_page(cursor, limit)?;
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT a.id,a.task_id,a.provider_json,a.model,a.prompt_json,a.trigger_json,a.enabled,
                    a.last_evaluated_at,a.next_due_at,a.cursor_ms,a.created_at,a.updated_at,h.revision
             FROM automations a JOIN work_entity_heads h
               ON h.entity_kind='automation' AND h.entity_id=a.id AND h.deleted=0
             WHERE (?1 IS NULL OR a.task_id=?1) AND (?2 IS NULL OR a.id>?2)
             ORDER BY a.id LIMIT ?3",
        )?;
        let rows = statement.query_map(
            params![task_id, cursor, (limit + 1) as i64],
            automation_from_row,
        )?;
        let mut items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        let next_cursor = page_cursor(&mut items, limit, |item| item.entity.id.clone());
        Ok(WorkPage {
            items,
            next_cursor,
            high_water: high_water(&conn)?,
        })
    }

    pub fn work_claim_due_automations(
        &self,
        now: i64,
        audit: &WorkAuditContext,
    ) -> Result<Vec<WorkVersioned<AutomationRun>>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        with_transaction(&mut conn, |transaction| {
            transaction.claim_due_automations(now, audit)
        })
    }

    pub fn work_transition_automation_run(
        &self,
        run_id: &str,
        target: AutomationRunStatus,
        wait: Option<AutomationWait>,
        failure: Option<AutomationFailure>,
        now: i64,
        audit: &WorkAuditContext,
    ) -> Result<WorkVersioned<AutomationRun>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        with_transaction(&mut conn, |transaction| {
            transaction.transition_automation_run(run_id, target, wait, failure, now, audit)
        })
    }

    pub fn work_save_brief(
        &self,
        brief: BriefRevision,
        guard: &WorkMutationGuard,
    ) -> Result<BriefSaveResult, StoreError> {
        let task_id = brief.task_id.clone();
        let mut conn = self.conn.lock().unwrap();
        let brief = with_transaction(&mut conn, |transaction| {
            transaction.save_brief(brief, guard)
        })?;
        let brief_revision = entity_head(&conn, WorkEntityKind::Brief, &task_id)?
            .ok_or_else(|| StoreError::Domain("saved Brief head is missing".to_owned()))?
            .revision;
        let task = conn.query_row(
            "SELECT t.id,t.workspace_id,t.title,t.experience,t.status,t.current_brief_revision,
                    t.created_at,t.updated_at,t.archived,h.revision
             FROM tasks t JOIN work_entity_heads h
               ON h.entity_kind='task' AND h.entity_id=t.id AND h.deleted=0
             WHERE t.id=?1",
            [&task_id],
            |row| {
                Ok(WorkVersioned {
                    entity: task_from_row(row)?,
                    revision: u64::try_from(row.get::<_, i64>(9)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                })
            },
        )?;
        Ok(BriefSaveResult {
            brief: WorkVersioned {
                entity: brief,
                revision: brief_revision,
            },
            task,
        })
    }

    pub fn work_current_brief(
        &self,
        task_id: &str,
    ) -> Result<Option<WorkVersioned<BriefRevision>>, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT b.id,b.task_id,b.revision,b.blocks_json,b.source,b.created_at,h.revision
             FROM tasks t JOIN brief_revisions b
               ON b.task_id=t.id AND b.revision=t.current_brief_revision
             JOIN work_entity_heads h
               ON h.entity_kind='brief' AND h.entity_id=t.id AND h.deleted=0
             WHERE t.id=?1",
            [task_id],
            |row| {
                let blocks_json: String = row.get(3)?;
                let blocks = serde_json::from_str(&blocks_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        3,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
                Ok(WorkVersioned {
                    entity: BriefRevision {
                        id: row.get(0)?,
                        task_id: row.get(1)?,
                        revision: row.get(2)?,
                        blocks,
                        source: row.get(4)?,
                        created_at: row.get(5)?,
                    },
                    revision: u64::try_from(row.get::<_, i64>(6)?)
                        .map_err(|_| rusqlite::Error::InvalidQuery)?,
                })
            },
        )
        .optional()
        .map_err(StoreError::from)
    }

    pub fn work_get_run(&self, run_id: &str) -> Result<Option<WorkVersioned<Run>>, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT s.id,s.task_id,s.run_index,s.provider,s.model,s.activity_json,s.cwd,
                    s.created_at,h.revision
             FROM sessions s JOIN work_entity_heads h
               ON h.entity_kind='run' AND h.entity_id=s.id AND h.deleted=0
             WHERE s.id=?1 AND s.task_id IS NOT NULL AND s.run_index IS NOT NULL",
            [run_id],
            run_from_row,
        )
        .optional()
        .map_err(StoreError::from)
    }

    pub fn work_list_runs(
        &self,
        task_id: &str,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<WorkPage<Run>, StoreError> {
        validate_page(cursor, limit)?;
        let after_index = cursor
            .map(|cursor| {
                cursor
                    .parse::<i64>()
                    .ok()
                    .filter(|value| *value >= 0)
                    .ok_or_else(|| StoreError::Domain("invalid Run page cursor".to_owned()))
            })
            .transpose()?;
        let conn = self.conn.lock().unwrap();
        let mut statement = conn.prepare(
            "SELECT s.id,s.task_id,s.run_index,s.provider,s.model,s.activity_json,s.cwd,
                    s.created_at,h.revision
             FROM sessions s JOIN work_entity_heads h
               ON h.entity_kind='run' AND h.entity_id=s.id AND h.deleted=0
             WHERE s.task_id=?1 AND (?2 IS NULL OR s.run_index > ?2)
             ORDER BY s.run_index,s.id LIMIT ?3",
        )?;
        let rows = statement.query_map(
            params![task_id, after_index, (limit + 1) as i64],
            run_from_row,
        )?;
        let mut items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        let next_cursor = page_cursor(&mut items, limit, |item| item.entity.index.to_string());
        Ok(WorkPage {
            items,
            next_cursor,
            high_water: high_water(&conn)?,
        })
    }

    pub(crate) fn work_artifact_root(
        &self,
        task_id: &str,
        run_id: &str,
    ) -> Result<PathBuf, StoreError> {
        let conn = self.conn.lock().unwrap();
        let root: Option<Option<String>> = conn
            .query_row(
                "SELECT w.root_path FROM sessions s
                 JOIN work_entity_heads rh
                   ON rh.entity_kind='run' AND rh.entity_id=s.id AND rh.deleted=0
                 JOIN tasks t ON t.id=s.task_id
                 JOIN work_entity_heads th
                   ON th.entity_kind='task' AND th.entity_id=t.id AND th.deleted=0
                 JOIN workspaces w ON w.id=t.workspace_id
                 JOIN work_entity_heads wh
                   ON wh.entity_kind='workspace' AND wh.entity_id=w.id AND wh.deleted=0
                 WHERE s.id=?1 AND s.task_id=?2",
                params![run_id, task_id],
                |row| row.get(0),
            )
            .optional()?;
        match root.flatten() {
            Some(root) => Ok(PathBuf::from(root)),
            None => Err(StoreError::Domain(
                "deliverable run has no active rooted Workspace".to_owned(),
            )),
        }
    }

    pub fn work_workspace_root_for_task(&self, task_id: &str) -> Result<PathBuf, StoreError> {
        let conn = self.conn.lock().unwrap();
        let root: Option<Option<String>> = conn
            .query_row(
                "SELECT w.root_path FROM tasks t
                 JOIN work_entity_heads th
                   ON th.entity_kind='task' AND th.entity_id=t.id AND th.deleted=0
                 JOIN workspaces w ON w.id=t.workspace_id
                 JOIN work_entity_heads wh
                   ON wh.entity_kind='workspace' AND wh.entity_id=w.id AND wh.deleted=0
                 WHERE t.id=?1",
                [task_id],
                |row| row.get(0),
            )
            .optional()?;
        match root.flatten() {
            Some(root) => Ok(PathBuf::from(root)),
            None => Err(StoreError::Domain(
                "Work Task has no active rooted Workspace".to_owned(),
            )),
        }
    }

    pub(crate) fn work_save_deliverable(
        &self,
        deliverable: Deliverable,
        guard: &WorkMutationGuard,
    ) -> Result<DeliverableSaveResult, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        with_transaction(&mut conn, |transaction| {
            transaction.save_deliverable(deliverable, guard)
        })
    }

    pub fn work_list_deliverables(
        &self,
        task_id: &str,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<WorkPage<Deliverable>, StoreError> {
        if limit == 0 || limit > MAX_WORK_PAGE_SIZE {
            return Err(StoreError::Domain(format!(
                "Work page limit must be between 1 and {MAX_WORK_PAGE_SIZE}"
            )));
        }
        let after = cursor
            .map(|cursor| {
                if cursor.len() > 8192 || cursor.chars().any(char::is_control) {
                    return Err(StoreError::Domain(
                        "invalid Deliverable page cursor".to_owned(),
                    ));
                }
                serde_json::from_str::<DeliverableCursor>(cursor)
                    .map_err(|_| StoreError::Domain("invalid Deliverable page cursor".to_owned()))
            })
            .transpose()?;
        let conn = self.conn.lock().unwrap();
        let active: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tasks t JOIN work_entity_heads h
               ON h.entity_kind='task' AND h.entity_id=t.id AND h.deleted=0 WHERE t.id=?1)",
            [task_id],
            |row| row.get(0),
        )?;
        if !active {
            return Err(StoreError::Domain(
                "deliverable task unavailable".to_owned(),
            ));
        }
        let mut statement = conn.prepare(
            "SELECT d.id,d.task_id,d.run_id,d.path,d.mime,d.hash,d.version,d.current,d.missing,
                    d.created_at,d.updated_at,h.revision
             FROM deliverables d JOIN work_entity_heads h
               ON h.entity_kind='deliverable' AND h.entity_id=d.id AND h.deleted=0
             WHERE d.task_id=?1
               AND (?2 IS NULL OR d.path>?2 OR (d.path=?2 AND d.version>?3)
                    OR (d.path=?2 AND d.version=?3 AND d.id>?4))
             ORDER BY d.path,d.version,d.id LIMIT ?5",
        )?;
        let rows = statement.query_map(
            params![
                task_id,
                after.as_ref().map(|cursor| cursor.path.as_str()),
                after.as_ref().map(|cursor| cursor.version),
                after.as_ref().map(|cursor| cursor.id.as_str()),
                (limit + 1) as i64,
            ],
            deliverable_from_row,
        )?;
        let mut items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        let next_cursor = if items.len() > limit {
            items.truncate(limit);
            items
                .last()
                .map(|item| {
                    serde_json::to_string(&DeliverableCursor {
                        path: item.entity.path.clone(),
                        version: item.entity.version,
                        id: item.entity.id.clone(),
                    })
                })
                .transpose()?
        } else {
            None
        };
        Ok(WorkPage {
            items,
            next_cursor,
            high_water: high_water(&conn)?,
        })
    }

    pub fn work_save_run_snapshot(
        &self,
        snapshot: RunSnapshot,
        guard: &WorkMutationGuard,
    ) -> Result<WorkVersioned<RunSnapshot>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        with_transaction(&mut conn, |transaction| {
            transaction.save_run_snapshot(snapshot, guard)
        })
    }

    pub fn work_snapshot_for_run(&self, run_id: &str) -> Result<Option<RunSnapshot>, StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT s.id,s.task_id,s.run_id,s.storage_path,s.manifest_json,s.not_covered_json,
                    s.created_at
             FROM run_snapshots s JOIN work_entity_heads h
               ON h.entity_kind='snapshot' AND h.entity_id=s.id AND h.deleted=0
             WHERE s.run_id=?1",
            [run_id],
            run_snapshot_from_row,
        )
        .optional()
        .map_err(StoreError::from)
    }

    pub fn work_save_run_changes(
        &self,
        snapshot_id: &str,
        changes: Vec<SnapshotChange>,
        guard: &WorkMutationGuard,
    ) -> Result<Vec<WorkVersioned<RunChange>>, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        with_transaction(&mut conn, |transaction| {
            transaction.save_run_changes(snapshot_id, changes, guard)
        })
    }

    pub fn work_list_changes(
        &self,
        snapshot_id: &str,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<WorkPage<RunChange>, StoreError> {
        if limit == 0 || limit > MAX_WORK_PAGE_SIZE {
            return Err(StoreError::Domain(format!(
                "Work page limit must be between 1 and {MAX_WORK_PAGE_SIZE}"
            )));
        }
        let after = cursor
            .map(|cursor| {
                if cursor.len() > 8192 || cursor.chars().any(char::is_control) {
                    return Err(StoreError::Domain("invalid Change page cursor".to_owned()));
                }
                serde_json::from_str::<ChangeCursor>(cursor)
                    .map_err(|_| StoreError::Domain("invalid Change page cursor".to_owned()))
            })
            .transpose()?;
        let conn = self.conn.lock().unwrap();
        let active: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM run_snapshots s JOIN work_entity_heads h
               ON h.entity_kind='snapshot' AND h.entity_id=s.id AND h.deleted=0 WHERE s.id=?1)",
            [snapshot_id],
            |row| row.get(0),
        )?;
        if !active {
            return Err(StoreError::Domain("snapshot unavailable".to_owned()));
        }
        let mut statement = conn.prepare(
            "SELECT c.id,c.snapshot_id,c.change_json,c.created_at,h.revision
             FROM run_changes c JOIN work_entity_heads h
               ON h.entity_kind='change' AND h.entity_id=c.id AND h.deleted=0
             WHERE c.snapshot_id=?1
               AND (?2 IS NULL OR c.path>?2 OR (c.path=?2 AND c.id>?3))
             ORDER BY c.path,c.id LIMIT ?4",
        )?;
        let rows = statement.query_map(
            params![
                snapshot_id,
                after.as_ref().map(|cursor| cursor.path.as_str()),
                after.as_ref().map(|cursor| cursor.id.as_str()),
                (limit + 1) as i64,
            ],
            run_change_from_row,
        )?;
        let mut items = rows.collect::<rusqlite::Result<Vec<_>>>()?;
        let next_cursor = if items.len() > limit {
            items.truncate(limit);
            items
                .last()
                .map(|item| {
                    serde_json::to_string(&ChangeCursor {
                        path: item.entity.change.path.clone(),
                        id: item.entity.id.clone(),
                    })
                })
                .transpose()?
        } else {
            None
        };
        Ok(WorkPage {
            items,
            next_cursor,
            high_water: high_water(&conn)?,
        })
    }

    pub fn work_workspace_for_root(&self, root: &str) -> Result<Option<Workspace>, StoreError> {
        let conn = self.conn.lock().unwrap();
        if !work_store_marker_applied(&conn)? {
            return Ok(None);
        }
        conn.query_row(
            "SELECT id,name,root_path,kind,created_at,updated_at
             FROM workspaces WHERE root_path=?1",
            [root],
            workspace_from_row,
        )
        .optional()
        .map_err(StoreError::from)
    }

    pub fn work_task_for_session(&self, session_id: &str) -> Result<Option<Task>, StoreError> {
        let conn = self.conn.lock().unwrap();
        if !work_store_marker_applied(&conn)? {
            return Ok(None);
        }
        conn.query_row(
            "SELECT t.id,t.workspace_id,t.title,t.experience,t.status,t.current_brief_revision,
                    t.created_at,t.updated_at,t.archived
             FROM sessions s JOIN tasks t ON t.id=s.task_id WHERE s.id=?1",
            [session_id],
            task_from_row,
        )
        .optional()
        .map_err(StoreError::from)
    }

    pub fn work_run_binding(&self, session_id: &str) -> Result<Option<WorkRunBinding>, StoreError> {
        let conn = self.conn.lock().unwrap();
        if !work_store_marker_applied(&conn)? {
            return Ok(None);
        }
        conn.query_row(
            "SELECT id,task_id,run_index FROM sessions
             WHERE id=?1 AND task_id IS NOT NULL AND run_index >= 1",
            [session_id],
            |row| {
                Ok(WorkRunBinding {
                    session_id: row.get(0)?,
                    task_id: row.get(1)?,
                    run_index: row.get(2)?,
                })
            },
        )
        .optional()
        .map_err(StoreError::from)
    }
}

fn workspace_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Workspace> {
    let kind: String = row.get(3)?;
    let kind = WorkspaceKind::parse(&kind).ok_or(rusqlite::Error::InvalidQuery)?;
    Ok(Workspace {
        id: row.get(0)?,
        name: row.get(1)?,
        root_path: row.get(2)?,
        kind,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn task_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    let experience: String = row.get(3)?;
    let status: String = row.get(4)?;
    let experience = TaskExperience::parse(&experience).ok_or(rusqlite::Error::InvalidQuery)?;
    let status = TaskStatus::parse(&status).ok_or(rusqlite::Error::InvalidQuery)?;
    Ok(Task {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        title: row.get(2)?,
        experience,
        status,
        current_brief_revision: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        archived: row.get::<_, i64>(8)? != 0,
    })
}

fn run_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkVersioned<Run>> {
    let provider_json: String = row.get(3)?;
    let activity_json: String = row.get(5)?;
    let provider = serde_json::from_str(&provider_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(error))
    })?;
    let activity = serde_json::from_str(&activity_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(WorkVersioned {
        entity: Run {
            id: row.get(0)?,
            task_id: row.get(1)?,
            index: row.get(2)?,
            provider,
            model: row.get(4)?,
            activity,
            cwd: row.get(6)?,
            created_at: row.get(7)?,
        },
        revision: u64::try_from(row.get::<_, i64>(8)?)
            .map_err(|_| rusqlite::Error::InvalidQuery)?,
    })
}

#[derive(Debug, Serialize, Deserialize)]
struct DeliverableCursor {
    path: String,
    version: i64,
    id: String,
}

fn deliverable_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkVersioned<Deliverable>> {
    Ok(WorkVersioned {
        entity: Deliverable {
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
        revision: u64::try_from(row.get::<_, i64>(11)?)
            .map_err(|_| rusqlite::Error::InvalidQuery)?,
    })
}

fn run_snapshot_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RunSnapshot> {
    let manifest_json: String = row.get(4)?;
    let not_covered_json: String = row.get(5)?;
    let manifest = serde_json::from_str(&manifest_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, Box::new(error))
    })?;
    let not_covered = serde_json::from_str(&not_covered_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(RunSnapshot {
        id: row.get(0)?,
        task_id: row.get(1)?,
        run_id: row.get(2)?,
        storage_path: row.get(3)?,
        manifest,
        not_covered,
        created_at: row.get(6)?,
    })
}

#[derive(Debug, Serialize, Deserialize)]
struct ChangeCursor {
    path: String,
    id: String,
}

fn run_change_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkVersioned<RunChange>> {
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

fn automation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkVersioned<AutomationSpec>> {
    fn json<T: serde::de::DeserializeOwned>(
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

    let revision =
        u64::try_from(row.get::<_, i64>(12)?).map_err(|_| rusqlite::Error::InvalidQuery)?;
    Ok(WorkVersioned {
        entity: AutomationSpec {
            id: row.get(0)?,
            task_id: row.get(1)?,
            provider: Some(json(row, 2)?),
            model: row.get(3)?,
            prompt: json(row, 4)?,
            trigger: json(row, 5)?,
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

fn validate_page(cursor: Option<&str>, limit: usize) -> Result<(), StoreError> {
    if limit == 0 || limit > MAX_WORK_PAGE_SIZE {
        return Err(StoreError::Domain(format!(
            "Work page limit must be between 1 and {MAX_WORK_PAGE_SIZE}"
        )));
    }
    if cursor.is_some_and(|value| {
        value.is_empty()
            || value.len() > 256
            || value.trim() != value
            || value.chars().any(char::is_control)
    }) {
        return Err(StoreError::Domain("invalid Work page cursor".to_owned()));
    }
    Ok(())
}

fn page_cursor<T>(
    items: &mut Vec<T>,
    limit: usize,
    key: impl FnOnce(&T) -> String,
) -> Option<String> {
    if items.len() <= limit {
        return None;
    }
    items.truncate(limit);
    items.last().map(key)
}

#[cfg(test)]
mod tests {
    use super::{bounded_text, normalized_title, source_root, LegacySession};

    #[test]
    fn generated_display_text_is_bounded_trimmed_and_control_free() {
        let source = format!(" \u{0000}{} \t", "é".repeat(300));
        let bounded = bounded_text(&source, 10);
        assert_eq!(bounded, "ééééé");
        assert!(bounded.len() <= 10);
        assert_eq!(bounded.trim(), bounded);
        assert!(!bounded.chars().any(char::is_control));
        assert_eq!(normalized_title("\u{0000}\t"), "Untitled task");
    }

    #[test]
    fn blank_project_path_falls_back_but_invalid_nonblank_path_stays_rootless() {
        let mut session = LegacySession {
            id: "session".to_owned(),
            title: "title".to_owned(),
            cwd: "/safe/repo".to_owned(),
            project_path: Some("  ".to_owned()),
            worktree_path: None,
            task_id: None,
            run_index: None,
            created_at: 0,
        };
        assert_eq!(source_root(&session).as_deref(), Some("/safe/repo"));
        session.project_path = Some(format!("{}\u{0000}", "/unsafe/repo"));
        assert!(source_root(&session).is_none());
    }
}
