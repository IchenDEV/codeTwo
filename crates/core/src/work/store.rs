use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};

use super::domain::{Task, TaskExperience, TaskStatus, Workspace, WorkspaceKind};
use super::ledger::{ensure_backfill_head, install_schema_tx, WorkEntityKind};
use crate::store::{Store, StoreError};

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
) -> Result<(), StoreError> {
    if !work_store_marker_applied(tx)? {
        return Ok(());
    }
    let session = load_legacy_session(tx, session_id)?
        .ok_or_else(|| StoreError::Domain(format!("unknown session {session_id}")))?;
    backfill_one(tx, &session)?;
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
