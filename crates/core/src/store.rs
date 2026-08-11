//! SQLite persistence for sessions and their transcripts.
//!
//! Mirrors opencode's model: a single `codetwo.db` under the platform data dir. Sessions are rows;
//! the transcript is a flat, ordered list of `parts` per session (simpler and more queryable than
//! codex's JSONL rollouts). Access is synchronous behind a `Mutex` — SQLite writes are fast and the
//! engine only touches the store at turn boundaries and per streamed part.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[cfg(test)]
use std::sync::{Arc, Barrier, OnceLock};

use rusqlite::{Connection, OptionalExtension};
use thiserror::Error;

use crate::canvas::{
    new_draft, validate_exports, CanvasDraft, CanvasDraftUpdate, CanvasError, CanvasExportBudget,
    CanvasFeatureGate, CanvasFreezeInput, CanvasPromptPayload, CanvasRevision, CanvasSnapshot,
    CanvasStaticAsset,
};
use crate::project::ProjectWorktreeMode;
use crate::session::{
    MemoryAccess, Part, Role, RunFailureReason, Session, SessionActivity, SessionRunState,
    SessionTitleOrigin, TranscriptCursor, TranscriptEntry, TranscriptPage, MAX_TRANSCRIPT_TURNS,
    UNTITLED_SESSION_TITLE,
};

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("serde: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("invalid transcript cursor {before} for session {session_id}")]
    InvalidTranscriptCursor { session_id: String, before: i64 },
    #[error(
        "session activity revision conflict for {session_id}: expected {expected}, found {actual}"
    )]
    ActivityConflict {
        session_id: String,
        expected: u64,
        actual: u64,
    },
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  title_origin    TEXT NOT NULL DEFAULT 'default',
  pinned          INTEGER NOT NULL DEFAULT 0,
  activity_json   TEXT,
  provider        TEXT NOT NULL,
  model           TEXT,
  cwd             TEXT NOT NULL,
  project_path    TEXT,
  worktree_path   TEXT,
  worktree_baseline_json TEXT,
  worktree_common_dir TEXT,
  worktree_git_dir TEXT,
  worktree_identity_json TEXT,
  permission_mode TEXT NOT NULL,
  sandbox_policy TEXT NOT NULL DEFAULT '\"workspace_write\"',
  acp_session_id  TEXT,
  memory_read     TEXT NOT NULL DEFAULT 'inherit',
  memory_write    TEXT NOT NULL DEFAULT 'inherit',
  created_at      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parts (
  session_id TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  role       TEXT NOT NULL,
  part_json  TEXT NOT NULL,
  search_text TEXT,
  PRIMARY KEY (session_id, seq)
);
CREATE INDEX IF NOT EXISTS parts_session ON parts(session_id, seq);
CREATE INDEX IF NOT EXISTS parts_session_role_seq ON parts(session_id, role, seq);
CREATE TABLE IF NOT EXISTS artifacts (
  id           TEXT PRIMARY KEY,
  digest       TEXT NOT NULL UNIQUE,
  mime_type    TEXT NOT NULL,
  byte_count   INTEGER NOT NULL,
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS artifact_refs (
  session_id   TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  artifact_id  TEXT NOT NULL,
  PRIMARY KEY (session_id, tool_call_id, artifact_id),
  FOREIGN KEY (artifact_id) REFERENCES artifacts(id)
);
CREATE INDEX IF NOT EXISTS artifact_refs_session ON artifact_refs(session_id, tool_call_id);
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS projects (
  path           TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  last_opened_at INTEGER NOT NULL,
  added_at       INTEGER NOT NULL DEFAULT 0,
  default_worktree_mode TEXT
);
";

/// A workspace the user works in. Sessions belong to one by their source `project_path`.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Project {
    /// Absolute path. Also the identity — one directory is one project.
    pub path: String,
    pub name: String,
    pub last_opened_at: i64,
    /// `None` follows the current draft/session; `Local` is an explicit no-worktree default.
    pub default_worktree_mode: Option<ProjectWorktreeMode>,
}

/// One best conversation-content match per session.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SessionSearchHit {
    pub session_id: String,
    pub title: String,
    pub cwd: String,
    pub archived: bool,
    pub role: Role,
    pub snippet: String,
    pub seq: i64,
}

pub struct Store {
    pub(crate) conn: Mutex<Connection>,
    artifact_root: Option<PathBuf>,
}

#[cfg(test)]
fn canvas_freeze_test_barrier() -> &'static Mutex<Option<Arc<Barrier>>> {
    static BARRIER: OnceLock<Mutex<Option<Arc<Barrier>>>> = OnceLock::new();
    BARRIER.get_or_init(|| Mutex::new(None))
}

#[cfg(test)]
fn set_canvas_freeze_test_barrier(barrier: Option<Arc<Barrier>>) {
    *canvas_freeze_test_barrier().lock().unwrap() = barrier;
}

#[cfg(test)]
fn wait_canvas_freeze_test_barrier() {
    let barrier = canvas_freeze_test_barrier().lock().unwrap().clone();
    if let Some(barrier) = barrier {
        barrier.wait();
        barrier.wait();
    }
}

/// Snapshot-only projection mirroring the client tool fold: once a later terminal row exists for
/// the same explicit call id in the same user turn, earlier in-flight rows no longer add visible
/// state. Live events remain untouched. Metadata absent from a status-only terminal update is
/// carried forward so slimming cannot erase launch observability.
fn drop_superseded_tool_updates(mut entries: Vec<TranscriptEntry>) -> Vec<TranscriptEntry> {
    fn terminal(status: &str) -> bool {
        matches!(
            status.trim().to_ascii_lowercase().as_str(),
            "completed" | "failed"
        )
    }

    let mut keep = vec![true; entries.len()];
    let mut later_terminal: HashMap<String, usize> = HashMap::new();
    for index in (0..entries.len()).rev() {
        if entries[index].role == Role::User {
            later_terminal.clear();
            continue;
        }
        let Part::ToolCall {
            id,
            title,
            status,
            tool_kind,
            agent_input,
            outputs,
        } = &entries[index].part
        else {
            continue;
        };
        let id = id.clone();
        if terminal(status) {
            later_terminal.insert(id, index);
            continue;
        }
        let Some(&terminal_index) = later_terminal.get(&id) else {
            continue;
        };
        let prior_title = title.clone();
        let prior_kind = tool_kind.clone();
        let prior_input = agent_input.clone();
        let prior_outputs = outputs.clone();
        if let Part::ToolCall {
            title,
            tool_kind,
            agent_input,
            outputs,
            ..
        } = &mut entries[terminal_index].part
        {
            if title.trim().is_empty() && !prior_title.trim().is_empty() {
                *title = prior_title;
            }
            if tool_kind.is_none() {
                *tool_kind = prior_kind;
            }
            if agent_input.is_none() {
                *agent_input = prior_input;
            }
            if outputs.is_empty() {
                *outputs = prior_outputs;
            }
        }
        keep[index] = false;
    }

    entries
        .into_iter()
        .zip(keep)
        .filter_map(|(entry, keep)| keep.then_some(entry))
        .collect()
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut statement = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let names = statement.query_map([], |row| row.get::<_, String>(1))?;
    for name in names {
        if name? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Add a known internal column exactly once. Unlike swallowing every ALTER error, checking the
/// schema first preserves idempotence while still surfacing disk, locking, and corruption errors.
fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> rusqlite::Result<bool> {
    if table_has_column(conn, table, column)? {
        return Ok(false);
    }
    conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {definition}"), [])?;
    Ok(true)
}

/// Additive migrations for stores created by older versions.
fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    // Every schema addition, semantic backfill, and project seed below is one unit. SQLite makes
    // ALTER TABLE transactional, so an interrupted backfill cannot leave a column present while a
    // future open incorrectly assumes its data migration already completed.
    let tx = conn.unchecked_transaction()?;
    ensure_column(
        &tx,
        "sessions",
        "archived",
        "archived INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &tx,
        "sessions",
        "pinned",
        "pinned INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(&tx, "sessions", "activity_json", "activity_json TEXT")?;
    let idle = serde_json::to_string(&SessionActivity::default()).unwrap_or_default();
    tx.execute(
        "UPDATE sessions SET activity_json=?1 WHERE activity_json IS NULL",
        [idle],
    )?;
    ensure_column(
        &tx,
        "sessions",
        "title_origin",
        "title_origin TEXT NOT NULL DEFAULT 'default'",
    )?;
    // Before automatic titles existed, every non-placeholder title necessarily came from the
    // user. The predicate is intentionally re-runnable so a database from an interrupted older
    // migration (column present, backfill absent) repairs itself on the next open.
    tx.execute(
        "UPDATE sessions SET title_origin='manual'
         WHERE title_origin='default' AND title<>?1",
        [UNTITLED_SESSION_TITLE],
    )?;
    ensure_column(&tx, "sessions", "project_path", "project_path TEXT")?;
    ensure_column(
        &tx,
        "sessions",
        "worktree_baseline_json",
        "worktree_baseline_json TEXT",
    )?;
    ensure_column(
        &tx,
        "sessions",
        "worktree_common_dir",
        "worktree_common_dir TEXT",
    )?;
    ensure_column(&tx, "sessions", "worktree_git_dir", "worktree_git_dir TEXT")?;
    ensure_column(
        &tx,
        "sessions",
        "worktree_identity_json",
        "worktree_identity_json TEXT",
    )?;
    ensure_column(
        &tx,
        "sessions",
        "sandbox_policy",
        "sandbox_policy TEXT NOT NULL DEFAULT '\"workspace_write\"'",
    )?;
    ensure_column(
        &tx,
        "sessions",
        "memory_read",
        "memory_read TEXT NOT NULL DEFAULT 'inherit'",
    )?;
    ensure_column(
        &tx,
        "sessions",
        "memory_write",
        "memory_write TEXT NOT NULL DEFAULT 'inherit'",
    )?;
    ensure_column(&tx, "sessions", "active_scene", "active_scene TEXT")?;
    ensure_column(
        &tx,
        "sessions",
        "scene_customized",
        "scene_customized INTEGER NOT NULL DEFAULT 0",
    )?;
    // A legacy local session's cwd is its source project. A legacy worktree row no longer contains
    // enough information to recover the source safely, so leave it unknown instead of
    // misidentifying the isolated checkout as a project. Keep this idempotent in case a previous
    // migration added the column but stopped before completing the backfill.
    tx.execute(
        "UPDATE sessions SET project_path=cwd
         WHERE project_path IS NULL AND worktree_path IS NULL",
        [],
    )?;
    ensure_column(&tx, "parts", "search_text", "search_text TEXT")?;
    // Ordering used to come from `last_opened_at`, which meant the rail resorted itself under the
    // cursor every time you clicked a project. Backfilling `added_at` from it keeps the order an
    // existing store already shows, and freezes it there.
    ensure_column(
        &tx,
        "projects",
        "added_at",
        "added_at INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_column(
        &tx,
        "projects",
        "default_worktree_mode",
        "default_worktree_mode TEXT",
    )?;
    // `0` is the additive-column sentinel; current writes always use their positive timestamp.
    // Re-running this also heals a database interrupted between an old ALTER and UPDATE.
    tx.execute(
        "UPDATE projects SET added_at=last_opened_at WHERE added_at=0",
        [],
    )?;
    // Stores that predate the projects table already hold the answer to "what projects are there?"
    // in the sessions they contain — seed from those rather than opening to an empty list on a
    // machine that's been in use for months. Names come from the path's last component, so the
    // list reads like a project list instead of a column of absolute paths.
    {
        let mut stmt = tx.prepare(
            "SELECT project_path, MAX(created_at) FROM sessions
             WHERE project_path IS NOT NULL GROUP BY project_path",
        )?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        for row in rows {
            let (path, at): (String, i64) = row?;
            tx.execute(
                "INSERT OR IGNORE INTO projects (path, name, last_opened_at, added_at)
                 VALUES (?1,?2,?3,?3)",
                rusqlite::params![path, default_project_name(&path), at],
            )?;
        }
    }
    tx.commit()?;

    // This derived FTS projection has its own marker and transaction because SQLite does not allow
    // the helper to nest a transaction inside the additive migration above.
    migrate_session_search(conn)
}

/// Build the content-search projection once for an older database, then keep it current with
/// triggers. Legacy user rows are deliberately not backfilled: older Code2 versions stored the
/// fully compiled prompt there (project rules, file contents, expanded skills), not just what the
/// user authored. Agent text is safe to recover; new user prompts arrive with canonical text.
fn migrate_session_search(conn: &Connection) -> rusqlite::Result<()> {
    let applied: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE id='session_search_v2')",
        [],
        |row| row.get(0),
    )?;
    if applied {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    // v1 used unicode61, which treats a Chinese sentence as one token and cannot match incremental
    // English prefixes. The search table is derived data, so replace it atomically with a trigram
    // projection. Queries shorter than three characters use a bounded-result substring fallback.
    tx.execute_batch(
        "DROP TRIGGER IF EXISTS parts_fts_ai;
         DROP TRIGGER IF EXISTS parts_fts_ad;
         DROP TRIGGER IF EXISTS parts_fts_au;
         DROP TABLE IF EXISTS parts_fts;
         UPDATE parts SET search_text=NULL;
         CREATE VIRTUAL TABLE parts_fts USING fts5(
           search_text,
           content='parts',
           content_rowid='rowid',
           tokenize='trigram'
         );
         CREATE TRIGGER parts_fts_ai AFTER INSERT ON parts
         WHEN new.search_text IS NOT NULL BEGIN
           INSERT INTO parts_fts(rowid,search_text) VALUES(new.rowid,new.search_text);
         END;
         CREATE TRIGGER parts_fts_ad AFTER DELETE ON parts
         WHEN old.search_text IS NOT NULL BEGIN
           INSERT INTO parts_fts(parts_fts,rowid,search_text)
           VALUES('delete',old.rowid,old.search_text);
         END;
         CREATE TRIGGER parts_fts_au AFTER UPDATE OF search_text ON parts BEGIN
           INSERT INTO parts_fts(parts_fts,rowid,search_text)
           SELECT 'delete',old.rowid,old.search_text WHERE old.search_text IS NOT NULL;
           INSERT INTO parts_fts(rowid,search_text)
           SELECT new.rowid,new.search_text WHERE new.search_text IS NOT NULL;
         END;",
    )?;

    // Recover safe text from old stores while preserving turn boundaries. Legacy user Text rows
    // contained compiled rules/files and remain excluded; canonical Prompt rows are safe. Agent
    // chunks are concatenated once per user turn so phrases spanning chunks stay searchable.
    let persisted: Vec<(i64, String, String, String)> = {
        let mut stmt = tx
            .prepare("SELECT rowid,session_id,role,part_json FROM parts ORDER BY session_id,seq")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    let mut updates: Vec<(i64, String)> = Vec::new();
    let mut active_session = String::new();
    let mut agent_row: Option<i64> = None;
    let mut agent_text = String::new();
    let mut agent_chars = 0usize;
    let flush_agent = |updates: &mut Vec<(i64, String)>,
                       agent_row: &mut Option<i64>,
                       agent_text: &mut String,
                       agent_chars: &mut usize| {
        if let Some(rowid) = agent_row.take() {
            updates.push((rowid, std::mem::take(agent_text)));
        }
        *agent_chars = 0;
    };
    for (rowid, session_id, role, json) in persisted {
        if session_id != active_session {
            flush_agent(
                &mut updates,
                &mut agent_row,
                &mut agent_text,
                &mut agent_chars,
            );
            active_session = session_id;
        }
        let part = serde_json::from_str::<Part>(&json).ok();
        if role == "\"user\"" {
            flush_agent(
                &mut updates,
                &mut agent_row,
                &mut agent_text,
                &mut agent_chars,
            );
            if let Some(Part::Prompt { text, .. }) = part {
                updates.push((rowid, text.chars().take(262_144).collect()));
            }
        } else if let Some(Part::Text { text }) = part {
            if agent_row.is_none() {
                agent_row = Some(rowid);
            }
            let remaining = 262_144usize.saturating_sub(agent_chars);
            agent_text.extend(text.chars().take(remaining));
            agent_chars += text.chars().take(remaining).count();
        }
    }
    flush_agent(
        &mut updates,
        &mut agent_row,
        &mut agent_text,
        &mut agent_chars,
    );
    for (rowid, text) in updates {
        tx.execute(
            "UPDATE parts SET search_text=?2 WHERE rowid=?1",
            rusqlite::params![rowid, text],
        )?;
    }

    // Rebuild after the projection so an interrupted migration can retry without duplicate rows.
    // The tokenizer swap, projection, index and marker commit atomically.
    tx.execute("INSERT INTO parts_fts(parts_fts) VALUES('rebuild')", [])?;
    tx.execute(
        "INSERT INTO schema_migrations(id) VALUES('session_search_v2')",
        [],
    )?;
    tx.commit()
}

/// A project's display name when the user hasn't set one: the directory's own name.
pub fn default_project_name(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| path.to_string())
}

impl Store {
    pub fn open(path: &str) -> Result<Self, StoreError> {
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        migrate(&conn)?;
        crate::memory::install(&conn)?;
        crate::canvas::install(&conn)?;
        let store = Self {
            conn: Mutex::new(conn),
            artifact_root: Path::new(path)
                .parent()
                .map(|parent| parent.join("artifacts")),
        };
        // A delayed candidate may have become eligible while Code2 was closed.
        store.run_memory_maintenance()?;
        Ok(store)
    }

    /// In-memory store, used by tests.
    pub fn open_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA)?;
        migrate(&conn)?;
        crate::memory::install(&conn)?;
        crate::canvas::install(&conn)?;
        let store = Self {
            conn: Mutex::new(conn),
            artifact_root: None,
        };
        store.run_memory_maintenance()?;
        Ok(store)
    }

    /// App-private root for opaque tool artifacts. In-memory stores deliberately have none.
    pub fn artifact_root(&self) -> Option<&Path> {
        self.artifact_root.as_deref()
    }

    // ---- Canvas Input V1 ----------------------------------------------------------------------

    /// Create a mutable, client-owned Canvas draft.  The production entry point is intentionally
    /// closed until physical QA; tests and a trusted QA harness pass
    /// [`CanvasFeatureGate::enabled_for_tests`].
    pub fn create_canvas_draft(
        &self,
        owner: &str,
        title: &str,
        now: i64,
    ) -> Result<CanvasDraft, CanvasError> {
        self.create_canvas_draft_with_gate(CanvasFeatureGate::disabled(), owner, title, now)
    }

    pub fn create_canvas_draft_with_gate(
        &self,
        gate: CanvasFeatureGate,
        owner: &str,
        title: &str,
        now: i64,
    ) -> Result<CanvasDraft, CanvasError> {
        gate.require()?;
        if owner.trim().is_empty() {
            return Err(CanvasError::OwnerMismatch);
        }
        let draft = new_draft(owner.to_string(), title.to_string(), now);
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO canvas_drafts
             (id,owner,revision,title,theme,envelope_json,manifest_json,assets_json,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
            rusqlite::params![
                draft.id,
                draft.owner,
                draft.revision as i64,
                draft.title,
                serde_json::to_string(&draft.theme)?,
                serde_json::to_string(&draft.envelope)?,
                serde_json::to_string(&draft.manifest)?,
                serde_json::to_string(&draft.assets)?,
                now,
            ],
        )?;
        Ok(draft)
    }

    pub fn get_canvas_draft(
        &self,
        id: &str,
        owner: &str,
    ) -> Result<Option<CanvasDraft>, CanvasError> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT owner,revision,title,theme,envelope_json,manifest_json,assets_json,created_at,updated_at,tombstoned_at
                 FROM canvas_drafts WHERE id=?1",
                [id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, i64>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, Option<i64>>(9)?,
                    ))
                },
            )
            .optional()?;
        let Some((
            row_owner,
            revision,
            title,
            theme,
            envelope,
            manifest,
            assets,
            created_at,
            updated_at,
            tombstoned_at,
        )) = row
        else {
            return Ok(None);
        };
        if row_owner != owner {
            return Err(CanvasError::OwnerMismatch);
        }
        let draft = CanvasDraft {
            id: id.to_string(),
            owner: row_owner,
            revision: revision.max(0) as u64,
            title,
            theme: serde_json::from_str(&theme)?,
            envelope: serde_json::from_str(&envelope)?,
            manifest: serde_json::from_str(&manifest)?,
            assets: serde_json::from_str(&assets)?,
            created_at,
            updated_at,
            tombstoned_at,
        };
        draft.validate()?;
        Ok(Some(draft))
    }

    pub fn update_canvas_draft_cas(
        &self,
        id: &str,
        owner: &str,
        expected_revision: CanvasRevision,
        update: CanvasDraftUpdate,
        now: i64,
    ) -> Result<CanvasDraft, CanvasError> {
        let next_revision = expected_revision.saturating_add(1);
        update.validate_for_revision(next_revision)?;
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT owner,revision,created_at,tombstoned_at FROM canvas_drafts WHERE id=?1",
                [id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                    ))
                },
            )
            .optional()?;
        let Some((row_owner, current, created_at, tombstoned_at)) = row else {
            return Err(CanvasError::NotFound(id.into()));
        };
        if row_owner != owner {
            return Err(CanvasError::OwnerMismatch);
        }
        if tombstoned_at.is_some() {
            return Err(CanvasError::Tombstoned(id.into()));
        }
        let actual = current.max(0) as u64;
        if actual != expected_revision {
            return Err(CanvasError::StaleRevision {
                id: id.into(),
                expected: expected_revision,
                actual,
            });
        }
        let mut envelope = update.envelope.clone();
        envelope.revision = next_revision;
        envelope.theme = update.theme;
        envelope.assets = update
            .assets
            .iter()
            .map(CanvasStaticAsset::reference)
            .collect();
        let manifest = update.manifest.normalized()?;
        conn.execute(
            "UPDATE canvas_drafts SET revision=?2,title=?3,theme=?4,envelope_json=?5,manifest_json=?6,assets_json=?7,updated_at=?8
             WHERE id=?1 AND owner=?9 AND revision=?10 AND tombstoned_at IS NULL",
            rusqlite::params![
                id,
                next_revision as i64,
                update.title,
                serde_json::to_string(&update.theme)?,
                serde_json::to_string(&envelope)?,
                serde_json::to_string(&manifest)?,
                serde_json::to_string(&update.assets)?,
                now,
                owner,
                expected_revision as i64,
            ],
        )?;
        if conn.changes() != 1 {
            return Err(CanvasError::StaleRevision {
                id: id.into(),
                expected: expected_revision,
                actual,
            });
        }
        Ok(CanvasDraft {
            id: id.into(),
            owner: owner.into(),
            revision: next_revision,
            title: update.title,
            theme: update.theme,
            envelope,
            manifest,
            assets: update.assets,
            created_at,
            updated_at: now,
            tombstoned_at: None,
        })
    }

    pub fn freeze_canvas(
        &self,
        id: &str,
        owner: &str,
        expected_revision: CanvasRevision,
        input: CanvasFreezeInput,
    ) -> Result<CanvasSnapshot, CanvasError> {
        self.freeze_canvas_with_gate(
            CanvasFeatureGate::disabled(),
            id,
            owner,
            expected_revision,
            input,
        )
    }

    pub fn freeze_canvas_with_gate(
        &self,
        gate: CanvasFeatureGate,
        id: &str,
        owner: &str,
        expected_revision: CanvasRevision,
        input: CanvasFreezeInput,
    ) -> Result<CanvasSnapshot, CanvasError> {
        gate.require()?;
        let draft = self
            .get_canvas_draft(id, owner)?
            .ok_or_else(|| CanvasError::NotFound(id.into()))?;
        if draft.tombstoned_at.is_some() {
            return Err(CanvasError::Tombstoned(id.into()));
        }
        if draft.revision != expected_revision {
            return Err(CanvasError::StaleRevision {
                id: id.into(),
                expected: expected_revision,
                actual: draft.revision,
            });
        }
        #[cfg(test)]
        wait_canvas_freeze_test_barrier();
        // Normalize the caller's freeze payload exactly as a draft update would.  A frozen
        // revision is an immutable id@revision address: accepting a different scene, manifest,
        // title, or asset set here would let two payloads claim the same address.  The mutable
        // draft head is authoritative; exports are the only freeze-only data.
        let mut requested_envelope = input.envelope.clone();
        requested_envelope.revision = expected_revision;
        requested_envelope.theme = input.theme;
        requested_envelope.assets = input
            .assets
            .iter()
            .map(CanvasStaticAsset::reference)
            .collect();
        requested_envelope.validate()?;
        let requested_manifest = input.manifest.clone().normalized()?;
        let asset_ids = input.assets.iter().map(|asset| asset.id.clone()).collect();
        requested_manifest.validate_with_assets(&asset_ids)?;
        let derived_manifest = requested_envelope.derive_manifest()?;
        if requested_manifest != derived_manifest {
            return Err(CanvasError::InvalidManifest(
                "manifest does not match the exact scene-derived projection".into(),
            ));
        }
        crate::canvas::validate_static_assets_for_store(&input.assets)?;
        if input.title != draft.title
            || input.theme != draft.theme
            || requested_envelope != draft.envelope
            || requested_manifest != draft.manifest
            || input.assets != draft.assets
        {
            return Err(CanvasError::InvalidEnvelope(
                "freeze payload differs from the current mutable draft".into(),
            ));
        }
        validate_exports(&input.exports, CanvasExportBudget::default())?;

        // Re-read the head while holding the same mutex used by CAS updates.  The initial read
        // above intentionally occurs before validation (which can decode/validate large media),
        // so this final check closes the stale-freeze race: an update that wins during validation
        // makes this freeze fail instead of persisting an old revision.
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT owner,revision,title,theme,envelope_json,manifest_json,assets_json,created_at,updated_at,tombstoned_at
                 FROM canvas_drafts WHERE id=?1",
                [id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, i64>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, Option<i64>>(9)?,
                    ))
                },
            )
            .optional()?;
        let Some((
            current_owner,
            current_revision,
            title,
            theme,
            envelope_json,
            manifest_json,
            assets_json,
            created_at,
            updated_at,
            tombstoned_at,
        )) = row
        else {
            return Err(CanvasError::NotFound(id.into()));
        };
        if current_owner != owner {
            return Err(CanvasError::OwnerMismatch);
        }
        if tombstoned_at.is_some() {
            return Err(CanvasError::Tombstoned(id.into()));
        }
        let actual = current_revision.max(0) as u64;
        if actual != expected_revision {
            return Err(CanvasError::StaleRevision {
                id: id.into(),
                expected: expected_revision,
                actual,
            });
        }
        let current_draft = CanvasDraft {
            id: id.into(),
            owner: current_owner,
            revision: actual,
            title,
            theme: serde_json::from_str(&theme)?,
            envelope: serde_json::from_str(&envelope_json)?,
            manifest: serde_json::from_str(&manifest_json)?,
            assets: serde_json::from_str(&assets_json)?,
            created_at,
            updated_at,
            tombstoned_at,
        };
        let snapshot = CanvasSnapshot {
            id: id.into(),
            revision: expected_revision,
            title: current_draft.title,
            theme: current_draft.theme,
            created_at: current_draft.created_at,
            frozen_at: input.now,
            object_count: current_draft.manifest.objects.len(),
            envelope: current_draft.envelope,
            assets: current_draft.assets,
            summary: crate::canvas::deterministic_summary(&current_draft.manifest),
            manifest: current_draft.manifest,
            exports: input.exports,
        };
        snapshot.validate()?;

        let existing: Option<String> = conn
            .query_row(
                "SELECT snapshot_json FROM canvas_revisions WHERE canvas_id=?1 AND revision=?2 AND owner=?3",
                rusqlite::params![id, expected_revision as i64, owner],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(existing) = existing {
            let existing: CanvasSnapshot = serde_json::from_str(&existing)?;
            existing.validate()?;
            if existing.exports != snapshot.exports {
                return Err(CanvasError::Immutable(format!(
                    "{id}@{expected_revision} already has different exports"
                )));
            }
            return Ok(existing);
        }
        conn.execute(
            "INSERT INTO canvas_revisions(canvas_id,revision,owner,snapshot_json,created_at)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                id,
                expected_revision as i64,
                owner,
                serde_json::to_string(&snapshot)?,
                input.now,
            ],
        )?;
        Ok(snapshot)
    }

    pub fn get_canvas_snapshot(
        &self,
        id: &str,
        owner: &str,
        revision: CanvasRevision,
    ) -> Result<Option<CanvasSnapshot>, CanvasError> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT owner,snapshot_json FROM canvas_revisions WHERE canvas_id=?1 AND revision=?2",
                rusqlite::params![id, revision as i64],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let Some((row_owner, snapshot)) = row else {
            return Ok(None);
        };
        if row_owner != owner {
            return Err(CanvasError::OwnerMismatch);
        }
        let snapshot: CanvasSnapshot = serde_json::from_str(&snapshot)?;
        snapshot.validate()?;
        Ok(Some(snapshot))
    }

    /// Read an immutable frozen revision without applying mutable-draft ownership rules.
    ///
    /// Frozen history is globally readable only after an authenticated bridge has validated the
    /// caller.  Keeping this seam separate from [`Self::get_canvas_snapshot`] makes it impossible
    /// for a remote request to accidentally turn a mutable draft read into a global read.
    pub fn get_canvas_snapshot_frozen(
        &self,
        id: &str,
        revision: CanvasRevision,
    ) -> Result<Option<CanvasSnapshot>, CanvasError> {
        let conn = self.conn.lock().unwrap();
        let snapshot: Option<String> = conn
            .query_row(
                "SELECT snapshot_json FROM canvas_revisions WHERE canvas_id=?1 AND revision=?2",
                rusqlite::params![id, revision as i64],
                |row| row.get(0),
            )
            .optional()?;
        snapshot
            .map(|json| {
                let snapshot: CanvasSnapshot = serde_json::from_str(&json)?;
                snapshot.validate()?;
                Ok::<CanvasSnapshot, CanvasError>(snapshot)
            })
            .transpose()
    }

    pub fn resolve_canvas_prompt(
        &self,
        id: &str,
        owner: &str,
        revision: CanvasRevision,
    ) -> Result<CanvasPromptPayload, CanvasError> {
        self.get_canvas_snapshot(id, owner, revision)?
            .map(|snapshot| snapshot.prompt_payload())
            .ok_or_else(|| CanvasError::NotFound(format!("{id}@{revision}")))
    }

    /// Resolve an immutable frozen revision after an authenticated bridge has already checked
    /// device/client ownership.  No mutable draft is exposed through this seam, and callers that
    /// have not performed that bridge check must use [`Self::resolve_canvas_prompt`] instead.
    pub fn resolve_canvas_prompt_frozen(
        &self,
        id: &str,
        revision: CanvasRevision,
    ) -> Result<CanvasPromptPayload, CanvasError> {
        let conn = self.conn.lock().unwrap();
        let snapshot: Option<String> = conn
            .query_row(
                "SELECT snapshot_json FROM canvas_revisions WHERE canvas_id=?1 AND revision=?2",
                rusqlite::params![id, revision as i64],
                |row| row.get(0),
            )
            .optional()?;
        snapshot
            .map(|json| {
                let snapshot: CanvasSnapshot = serde_json::from_str(&json)?;
                snapshot.validate()?;
                Ok::<CanvasPromptPayload, CanvasError>(snapshot.prompt_payload())
            })
            .transpose()?
            .ok_or_else(|| CanvasError::NotFound(format!("{id}@{revision}")))
    }

    pub fn duplicate_canvas_with_gate(
        &self,
        gate: CanvasFeatureGate,
        id: &str,
        owner: &str,
        revision: CanvasRevision,
        now: i64,
    ) -> Result<CanvasDraft, CanvasError> {
        gate.require()?;
        let snapshot = self
            .get_canvas_snapshot(id, owner, revision)?
            .ok_or_else(|| CanvasError::NotFound(format!("{id}@{revision}")))?;
        let mut draft = new_draft(owner.to_string(), snapshot.title, now);
        draft.theme = snapshot.theme;
        draft.envelope = snapshot.envelope.clone();
        draft.envelope.revision = 1;
        draft.envelope.assets = snapshot
            .envelope
            .assets
            .iter()
            .map(|asset| asset.clone())
            .collect();
        draft.manifest = snapshot.manifest;
        draft.assets = snapshot.assets;
        draft.envelope.assets = draft
            .assets
            .iter()
            .map(CanvasStaticAsset::reference)
            .collect();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO canvas_drafts
             (id,owner,revision,title,theme,envelope_json,manifest_json,assets_json,created_at,updated_at)
             VALUES (?1,?2,1,?3,?4,?5,?6,?7,?8,?8)",
            rusqlite::params![
                draft.id,
                draft.owner,
                draft.title,
                serde_json::to_string(&draft.theme)?,
                serde_json::to_string(&draft.envelope)?,
                serde_json::to_string(&draft.manifest)?,
                serde_json::to_string(&draft.assets)?,
                now,
            ],
        )?;
        Ok(draft)
    }

    /// Duplicate an immutable frozen revision into a new mutable draft owned by `new_owner`.
    ///
    /// The source lookup is deliberately owner-independent: callers must authenticate before
    /// entering this seam, while the returned draft is always stamped with the server-derived
    /// requesting owner.  The immutable source row is never updated.
    pub fn duplicate_canvas_to_owner_with_gate(
        &self,
        gate: CanvasFeatureGate,
        id: &str,
        revision: CanvasRevision,
        new_owner: &str,
        now: i64,
    ) -> Result<CanvasDraft, CanvasError> {
        gate.require()?;
        if new_owner.trim().is_empty() {
            return Err(CanvasError::OwnerMismatch);
        }
        let snapshot = self
            .get_canvas_snapshot_frozen(id, revision)?
            .ok_or_else(|| CanvasError::NotFound(format!("{id}@{revision}")))?;
        let mut draft = new_draft(new_owner.to_string(), snapshot.title, now);
        draft.theme = snapshot.theme;
        draft.envelope = snapshot.envelope.clone();
        draft.envelope.revision = 1;
        draft.envelope.assets = snapshot.envelope.assets.iter().cloned().collect();
        draft.manifest = snapshot.manifest;
        draft.assets = snapshot.assets;
        draft.envelope.assets = draft
            .assets
            .iter()
            .map(CanvasStaticAsset::reference)
            .collect();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO canvas_drafts
             (id,owner,revision,title,theme,envelope_json,manifest_json,assets_json,created_at,updated_at)
             VALUES (?1,?2,1,?3,?4,?5,?6,?7,?8,?8)",
            rusqlite::params![
                draft.id,
                draft.owner,
                draft.title,
                serde_json::to_string(&draft.theme)?,
                serde_json::to_string(&draft.envelope)?,
                serde_json::to_string(&draft.manifest)?,
                serde_json::to_string(&draft.assets)?,
                now,
            ],
        )?;
        Ok(draft)
    }

    pub fn tombstone_canvas(&self, id: &str, owner: &str, now: i64) -> Result<(), CanvasError> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT owner,revision,immutable,tombstoned_at,manifest_json FROM canvas_drafts WHERE id=?1",
                [id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                },
            )
            .optional()?;
        let Some((row_owner, _revision, immutable, existing, manifest)) = row else {
            return Err(CanvasError::NotFound(id.into()));
        };
        if row_owner != owner {
            return Err(CanvasError::OwnerMismatch);
        }
        if immutable != 0 {
            return Err(CanvasError::Immutable(id.into()));
        }
        if existing.is_some() {
            return Ok(());
        }
        let manifest: crate::canvas::CanvasManifest = serde_json::from_str(&manifest)?;
        if manifest.objects.is_empty() {
            return Err(CanvasError::InvalidManifest(
                "empty drafts do not need tombstones".into(),
            ));
        }
        conn.execute(
            "UPDATE canvas_drafts SET tombstoned_at=?2,updated_at=?2 WHERE id=?1 AND owner=?3",
            rusqlite::params![id, now, owner],
        )?;
        conn.execute(
            "INSERT OR REPLACE INTO canvas_tombstones(canvas_id,owner,tombstoned_at) VALUES (?1,?2,?3)",
            rusqlite::params![id, owner, now],
        )?;
        Ok(())
    }

    pub fn restore_canvas(&self, id: &str, owner: &str, now: i64) -> Result<(), CanvasError> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT owner,tombstoned_at FROM canvas_drafts WHERE id=?1",
                [id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?)),
            )
            .optional()?;
        let Some((row_owner, tombstoned_at)) = row else {
            return Err(CanvasError::NotFound(id.into()));
        };
        if row_owner != owner {
            return Err(CanvasError::OwnerMismatch);
        }
        let Some(tombstoned_at) = tombstoned_at else {
            return Ok(());
        };
        if now.saturating_sub(tombstoned_at) > crate::canvas::MAX_CANVAS_TOMBSTONE_AGE_MS {
            return Err(CanvasError::NotFound(id.into()));
        }
        conn.execute(
            "UPDATE canvas_drafts SET tombstoned_at=NULL,updated_at=?2 WHERE id=?1 AND owner=?3",
            rusqlite::params![id, now, owner],
        )?;
        conn.execute("DELETE FROM canvas_tombstones WHERE canvas_id=?1", [id])?;
        Ok(())
    }

    pub fn purge_canvas(&self, id: &str, owner: &str, now: i64) -> Result<bool, CanvasError> {
        let conn = self.conn.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT owner,tombstoned_at,manifest_json FROM canvas_drafts WHERE id=?1",
                [id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<i64>>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        let Some((row_owner, tombstoned_at, manifest_json)) = row else {
            return Ok(false);
        };
        if row_owner != owner {
            return Err(CanvasError::OwnerMismatch);
        }
        let references: i64 = conn.query_row(
            "SELECT COUNT(*) FROM canvas_revisions WHERE canvas_id=?1",
            [id],
            |row| row.get(0),
        )?;
        let Some(tombstoned_at) = tombstoned_at else {
            // An empty draft that was never frozen is a disposable editor placeholder.  Purging
            // it is owner-scoped and cannot remove history; non-empty active drafts still require
            // an explicit tombstone first.
            let manifest: crate::canvas::CanvasManifest = serde_json::from_str(&manifest_json)?;
            if !manifest.objects.is_empty() || references != 0 {
                return Ok(false);
            }
            conn.execute(
                "DELETE FROM canvas_drafts WHERE id=?1 AND owner=?2",
                rusqlite::params![id, owner],
            )?;
            return Ok(conn.changes() == 1);
        };
        let _expired =
            now.saturating_sub(tombstoned_at) >= crate::canvas::MAX_CANVAS_TOMBSTONE_AGE_MS;
        // Immutable history is reference-safe: remove only the mutable tombstone row while
        // retaining every historical snapshot and its normalized assets.
        if references > 0 {
            conn.execute("DELETE FROM canvas_tombstones WHERE canvas_id=?1", [id])?;
            conn.execute("DELETE FROM canvas_drafts WHERE id=?1", [id])?;
            return Ok(true);
        }
        conn.execute("DELETE FROM canvas_tombstones WHERE canvas_id=?1", [id])?;
        conn.execute("DELETE FROM canvas_drafts WHERE id=?1", [id])?;
        Ok(true)
    }

    /// Expire all tombstones older than the bounded recovery window.  Historical revisions remain
    /// untouched; only mutable draft rows with no history are physically removed.
    pub fn purge_expired_canvases(&self, now: i64) -> Result<usize, CanvasError> {
        let conn = self.conn.lock().unwrap();
        let cutoff = now.saturating_sub(crate::canvas::MAX_CANVAS_TOMBSTONE_AGE_MS);
        let mut stmt = conn.prepare(
            "SELECT id FROM canvas_drafts WHERE tombstoned_at IS NOT NULL AND tombstoned_at<=?1",
        )?;
        let ids = stmt
            .query_map([cutoff], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let mut purged = 0;
        for id in ids {
            // Frozen history is stored separately and remains resolvable. Expiry removes only
            // the mutable tombstone/head; referenced snapshot rows and their embedded assets are
            // never collected here.
            conn.execute("DELETE FROM canvas_tombstones WHERE canvas_id=?1", [&id])?;
            conn.execute("DELETE FROM canvas_drafts WHERE id=?1", [&id])?;
            purged += 1;
        }
        Ok(purged)
    }

    // ---- projects -----------------------------------------------------------------------------

    /// Known projects, most recently *added* first. Deliberately not use-order: the rail is a list
    /// you learn the shape of, and a list that reshuffles itself when you click it can't be learned.
    /// `path` breaks ties so that projects seeded from one migration still have a stable order.
    pub fn list_projects(&self) -> Result<Vec<Project>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT path, name, last_opened_at, default_worktree_mode
             FROM projects ORDER BY added_at DESC, path ASC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Project {
                path: r.get(0)?,
                name: r.get(1)?,
                last_opened_at: r.get(2)?,
                default_worktree_mode: r
                    .get::<_, Option<String>>(3)?
                    .as_deref()
                    .and_then(ProjectWorktreeMode::from_db),
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Add a project, or re-open one already in the list. Adding a directory you already have is a
    /// normal thing to do by accident, so it re-opens rather than erroring or duplicating — and it
    /// keeps its original `added_at`, so re-adding doesn't move a row the user has learned to find.
    pub fn add_project(&self, path: &str, name: Option<&str>, now: i64) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        let name = name
            .map(|s| s.to_string())
            .unwrap_or_else(|| default_project_name(path));
        conn.execute(
            "INSERT INTO projects (path, name, last_opened_at, added_at) VALUES (?1,?2,?3,?3)
             ON CONFLICT(path) DO UPDATE SET last_opened_at=excluded.last_opened_at",
            rusqlite::params![path, name, now],
        )?;
        Ok(())
    }

    /// Record that a project was just opened. This feeds the age shown on its row; it does *not*
    /// reorder the list.
    pub fn touch_project(&self, path: &str, now: i64) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE projects SET last_opened_at=?2 WHERE path=?1",
            rusqlite::params![path, now],
        )?;
        Ok(())
    }

    pub fn rename_project(&self, path: &str, name: &str) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE projects SET name=?2 WHERE path=?1",
            rusqlite::params![path, name],
        )?;
        Ok(())
    }

    pub fn set_project_worktree_mode(
        &self,
        path: &str,
        mode: Option<ProjectWorktreeMode>,
    ) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE projects SET default_worktree_mode=?2 WHERE path=?1",
            rusqlite::params![path, mode.map(ProjectWorktreeMode::as_db)],
        )?;
        Ok(())
    }

    /// Forget a project. Its sessions are left alone — removing a project from the list is a
    /// bookkeeping act, not a request to delete months of transcripts.
    pub fn remove_project(&self, path: &str) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM projects WHERE path=?1", [path])?;
        Ok(())
    }

    /// The most recent text in each session, for the rail's preview line.
    ///
    /// One query for every session rather than one per row: the rail redraws on every event, and a
    /// query per visible session would put the transcript table in the hot path of streaming.
    /// Non-text parts (tool calls, plans) are skipped — "ran a command" is not a conversation.
    pub fn last_texts(&self) -> Result<Vec<(String, String)>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.session_id, p.part_json FROM parts p
             WHERE p.seq = (
               SELECT MAX(q.seq) FROM parts q
               WHERE q.session_id = p.session_id
                 AND json_extract(q.part_json,'$.kind') IN ('text','prompt')
             )",
        )?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;

        let mut out = Vec::new();
        for row in rows.flatten() {
            let (id, json) = row;
            if let Ok(part) = serde_json::from_str::<Part>(&json) {
                let text = match part {
                    Part::Text { text } => text,
                    Part::Prompt { display, .. } => display,
                    _ => continue,
                };
                let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
                if !flat.is_empty() {
                    out.push((id, flat.chars().take(160).collect()));
                }
            }
        }
        Ok(out)
    }

    /// Rename a session (the sidebar title).
    pub fn rename_session(&self, id: &str, title: &str) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET title=?2,title_origin='manual' WHERE id=?1",
            rusqlite::params![id, title],
        )?;
        Ok(())
    }

    /// Set the first automatic title only while the session still owns the placeholder.
    /// Returns whether a row changed, allowing the in-memory runtime to mirror the durable result.
    pub fn set_initial_title(&self, id: &str, title: &str) -> Result<bool, StoreError> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE sessions SET title=?2,title_origin='automatic'
             WHERE id=?1 AND title_origin='default'",
            rusqlite::params![id, title],
        )?;
        Ok(changed > 0)
    }

    /// Archive / unarchive a session (archived ones drop out of the main list).
    /// Archiving also clears pinning: a pin only has meaning in the active-session list.
    pub fn set_archived(&self, id: &str, archived: bool) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions
             SET archived=?2, pinned=CASE WHEN ?2=1 THEN 0 ELSE pinned END
             WHERE id=?1",
            rusqlite::params![id, if archived { 1 } else { 0 }],
        )?;
        Ok(())
    }

    /// Pin or unpin an active session. Archived sessions deliberately ignore pin requests.
    pub fn set_pinned(&self, id: &str, pinned: bool) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET pinned=?2 WHERE id=?1 AND archived=0",
            rusqlite::params![id, if pinned { 1 } else { 0 }],
        )?;
        Ok(())
    }

    /// Archived sessions, newest first.
    pub fn list_archived_sessions(&self) -> Result<Vec<Session>, StoreError> {
        self.query_sessions(true)
    }

    fn query_sessions(&self, archived: bool) -> Result<Vec<Session>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let order = if archived {
            "created_at DESC"
        } else {
            "pinned DESC, created_at DESC"
        };
        let sql = format!(
            "SELECT id,title,provider,model,cwd,project_path,worktree_path,permission_mode,sandbox_policy,acp_session_id,created_at,pinned,title_origin,activity_json,worktree_baseline_json,worktree_common_dir,worktree_git_dir,worktree_identity_json,memory_read,memory_write
             FROM sessions WHERE archived=?1 ORDER BY {order}"
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([if archived { 1 } else { 0 }], row_to_session_parts)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(build_session(r?)?);
        }
        Ok(out)
    }

    pub fn upsert_session(&self, s: &Session) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions
               (id,title,provider,model,cwd,project_path,worktree_path,permission_mode,sandbox_policy,acp_session_id,created_at,pinned,title_origin,activity_json,worktree_baseline_json,worktree_common_dir,worktree_git_dir,worktree_identity_json,memory_read,memory_write)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)
             ON CONFLICT(id) DO UPDATE SET
               provider=excluded.provider, model=excluded.model,
               cwd=excluded.cwd, project_path=excluded.project_path,
               worktree_path=excluded.worktree_path,
               worktree_baseline_json=excluded.worktree_baseline_json,
               worktree_common_dir=excluded.worktree_common_dir,
               worktree_git_dir=excluded.worktree_git_dir,
               worktree_identity_json=excluded.worktree_identity_json,
               permission_mode=excluded.permission_mode,
               sandbox_policy=excluded.sandbox_policy,
               acp_session_id=excluded.acp_session_id",
            rusqlite::params![
                s.id,
                s.title,
                serde_json::to_string(&s.provider)?,
                s.model,
                s.cwd,
                s.project_path,
                s.worktree_path,
                serde_json::to_string(&s.permission_mode)?,
                serde_json::to_string(&s.sandbox_policy)?,
                s.acp_session_id,
                s.created_at,
                if s.pinned { 1 } else { 0 },
                title_origin_str(s.title_origin),
                serde_json::to_string(&s.activity)?,
                s.worktree_baseline
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                s.worktree_common_dir,
                s.worktree_git_dir,
                s.worktree_identity
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
                s.memory_read.as_db(),
                s.memory_write.as_db(),
            ],
        )?;
        Ok(())
    }

    /// Active (non-archived) sessions, pinned first and newest within each group.
    pub fn list_sessions(&self) -> Result<Vec<Session>, StoreError> {
        self.query_sessions(false)
    }

    pub fn get_session(&self, id: &str) -> Result<Option<Session>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id,title,provider,model,cwd,project_path,worktree_path,permission_mode,sandbox_policy,acp_session_id,created_at,pinned,title_origin,activity_json,worktree_baseline_json,worktree_common_dir,worktree_git_dir,worktree_identity_json,memory_read,memory_write
             FROM sessions WHERE id=?1",
        )?;
        let mut rows = stmt.query_map([id], row_to_session_parts)?;
        match rows.next() {
            Some(r) => Ok(Some(build_session(r?)?)),
            None => Ok(None),
        }
    }

    /// Persist the permission mode even when this process has not revived the session runtime yet.
    pub fn set_permission_mode(
        &self,
        id: &str,
        mode: crate::permission::PermissionMode,
    ) -> Result<bool, StoreError> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE sessions SET permission_mode=?2 WHERE id=?1",
            rusqlite::params![id, serde_json::to_string(&mode)?],
        )?;
        Ok(changed > 0)
    }

    /// Persist both execution-policy axes with one SQLite statement.
    pub fn set_execution_policy(
        &self,
        id: &str,
        mode: crate::permission::PermissionMode,
        sandbox: crate::permission::SandboxPolicy,
    ) -> Result<bool, StoreError> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE sessions SET permission_mode=?2, sandbox_policy=?3 WHERE id=?1",
            rusqlite::params![
                id,
                serde_json::to_string(&mode)?,
                serde_json::to_string(&sandbox)?,
            ],
        )?;
        Ok(changed > 0)
    }

    /// Compatibility path for older single-axis clients.
    pub fn set_sandbox_policy(
        &self,
        id: &str,
        sandbox: crate::permission::SandboxPolicy,
    ) -> Result<bool, StoreError> {
        let conn = self.conn.lock().unwrap();
        let changed = conn.execute(
            "UPDATE sessions SET sandbox_policy=?2 WHERE id=?1",
            rusqlite::params![id, serde_json::to_string(&sandbox)?],
        )?;
        Ok(changed > 0)
    }

    /// Revision-aware activity persistence. A stale writer returns `false` and never overwrites a
    /// newer lifecycle state.
    pub fn update_session_activity(
        &self,
        session_id: &str,
        expected_revision: u64,
        activity: &SessionActivity,
    ) -> Result<bool, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let stored: Option<Option<String>> = tx
            .query_row(
                "SELECT activity_json FROM sessions WHERE id=?1",
                [session_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(stored) = stored else {
            tx.commit()?;
            return Ok(false);
        };
        let current: SessionActivity = stored
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?
            .unwrap_or_default();
        if current.revision != expected_revision
            || activity.revision != expected_revision.saturating_add(1)
        {
            tx.commit()?;
            return Ok(false);
        }
        tx.execute(
            "UPDATE sessions SET activity_json=?2 WHERE id=?1",
            rusqlite::params![session_id, serde_json::to_string(activity)?],
        )?;
        tx.commit()?;
        Ok(true)
    }

    /// Atomically accept a user prompt and its Running activity. This is the durable seam behind
    /// `TurnStarted`: either both rows commit or neither does.
    pub fn append_prompt_and_activity(
        &self,
        session_id: &str,
        prompt: &Part,
        expected_revision: u64,
        activity: &SessionActivity,
    ) -> Result<i64, StoreError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let stored: Option<Option<String>> = tx
            .query_row(
                "SELECT activity_json FROM sessions WHERE id=?1",
                [session_id],
                |row| row.get(0),
            )
            .optional()?;
        let stored = stored.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        let current: SessionActivity = stored
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?
            .unwrap_or_default();
        if current.revision != expected_revision
            || activity.revision != expected_revision.saturating_add(1)
        {
            return Err(StoreError::ActivityConflict {
                session_id: session_id.to_string(),
                expected: expected_revision,
                actual: current.revision,
            });
        }

        let seq: i64 = tx.query_row(
            "SELECT COALESCE(MAX(seq), -1) + 1 FROM parts WHERE session_id=?1",
            [session_id],
            |row| row.get(0),
        )?;
        let search_text = match prompt {
            Part::Prompt { text, .. } => Some(text.chars().take(262_144).collect::<String>()),
            _ => None,
        };
        tx.execute(
            "INSERT INTO parts (session_id,seq,role,part_json,search_text)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                session_id,
                seq,
                serde_json::to_string(&Role::User)?,
                serde_json::to_string(prompt)?,
                search_text.as_deref(),
            ],
        )?;
        tx.execute(
            "UPDATE sessions SET activity_json=?2 WHERE id=?1",
            rusqlite::params![session_id, serde_json::to_string(activity)?],
        )?;
        tx.commit()?;
        Ok(seq)
    }

    /// A new process cannot recover provider children or parked oneshots. Convert every persisted
    /// in-flight state to an honest, non-actionable interruption before any session list is shown.
    pub fn normalize_interrupted_activities(&self) -> Result<usize, StoreError> {
        const MESSAGE: &str = "Code2 stopped before the turn finished";
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let rows: Vec<(String, Option<String>)> = {
            let mut stmt = tx.prepare("SELECT id,activity_json FROM sessions")?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        let mut changed = 0;
        for (session_id, json) in rows {
            let activity: SessionActivity = json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?
                .unwrap_or_default();
            let turn_id = match &activity.state {
                SessionRunState::Running { turn_id, .. }
                | SessionRunState::AwaitingInput { turn_id, .. } => Some(turn_id.clone()),
                SessionRunState::Idle | SessionRunState::Failed { .. } => None,
            };
            let Some(turn_id) = turn_id else {
                continue;
            };
            let interrupted = SessionActivity {
                revision: activity.revision.saturating_add(1),
                state: SessionRunState::Failed {
                    turn_id: Some(turn_id),
                    reason: RunFailureReason::Interrupted,
                    message: MESSAGE.into(),
                },
            };
            tx.execute(
                "UPDATE sessions SET activity_json=?2 WHERE id=?1",
                rusqlite::params![session_id, serde_json::to_string(&interrupted)?],
            )?;
            changed += 1;
        }
        tx.commit()?;
        Ok(changed)
    }

    /// Append one transcript part, returning its sequence number.
    pub fn append_part(
        &self,
        session_id: &str,
        role: Role,
        part: &Part,
    ) -> Result<i64, StoreError> {
        let conn = self.conn.lock().unwrap();
        let seq: i64 = conn.query_row(
            "SELECT COALESCE(MAX(seq), -1) + 1 FROM parts WHERE session_id=?1",
            [session_id],
            |r| r.get(0),
        )?;

        // User prompts are complete at append time. Agent chunks are deliberately left out until
        // `finalize_agent_search`: indexing every streamed fragment would repeatedly re-tokenize
        // the whole accumulated answer and expose cancelled/failed partial output as final text.
        let search_text = match (role, part) {
            (Role::User, Part::Prompt { text, .. }) => {
                Some(text.chars().take(262_144).collect::<String>())
            }
            _ => None,
        };
        conn.execute(
            "INSERT INTO parts (session_id,seq,role,part_json,search_text)
             VALUES (?1,?2,?3,?4,?5)",
            rusqlite::params![
                session_id,
                seq,
                serde_json::to_string(&role)?,
                serde_json::to_string(part)?,
                search_text.as_deref(),
            ],
        )?;
        Ok(seq)
    }

    pub fn set_session_memory_policy(
        &self,
        session_id: &str,
        read: MemoryAccess,
        write: MemoryAccess,
    ) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET memory_read=?2,memory_write=?3 WHERE id=?1",
            rusqlite::params![session_id, read.as_db(), write.as_db()],
        )?;
        Ok(())
    }

    pub fn session_memory_policy(
        &self,
        session_id: &str,
    ) -> Result<(MemoryAccess, MemoryAccess), StoreError> {
        let conn = self.conn.lock().unwrap();
        let (read, write): (String, String) = conn.query_row(
            "SELECT memory_read,memory_write FROM sessions WHERE id=?1",
            [session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        Ok((MemoryAccess::from_db(&read), MemoryAccess::from_db(&write)))
    }

    /// Persist (or clear, with `None`) the session's active scene reference.
    pub fn set_session_scene(
        &self,
        session_id: &str,
        scene_ref: Option<&str>,
        customized: bool,
    ) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET active_scene=?2,scene_customized=?3 WHERE id=?1",
            rusqlite::params![session_id, scene_ref, customized as i64],
        )?;
        Ok(())
    }

    pub fn session_scene(&self, session_id: &str) -> Result<Option<(String, bool)>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let (scene_ref, customized): (Option<String>, i64) = conn.query_row(
            "SELECT active_scene,scene_customized FROM sessions WHERE id=?1",
            [session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        Ok(scene_ref.map(|r| (r, customized != 0)))
    }

    /// Publish the completed assistant answer into FTS exactly once. Stored chunks remain the
    /// transcript source of truth; only the first text row of the current turn owns the derived
    /// projection, keeping one searchable document per assistant turn.
    pub fn finalize_agent_search(&self, session_id: &str) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        let rows: Vec<(i64, String)> = {
            let mut stmt = conn.prepare(
                "SELECT rowid,part_json FROM parts
                 WHERE session_id=?1 AND role='\"agent\"'
                   AND seq>COALESCE((
                     SELECT MAX(seq) FROM parts WHERE session_id=?1 AND role='\"user\"'
                   ),-1)
                 ORDER BY seq",
            )?;
            let mapped = stmt.query_map([session_id], |row| Ok((row.get(0)?, row.get(1)?)))?;
            mapped.collect::<rusqlite::Result<Vec<_>>>()?
        };
        let mut first_row = None;
        let mut text = String::new();
        let mut chars = 0usize;
        for (rowid, json) in rows {
            let Ok(Part::Text { text: chunk }) = serde_json::from_str::<Part>(&json) else {
                continue;
            };
            first_row.get_or_insert(rowid);
            let remaining = 262_144usize.saturating_sub(chars);
            let bounded: String = chunk.chars().take(remaining).collect();
            chars += bounded.chars().count();
            text.push_str(&bounded);
        }
        if let Some(rowid) = first_row {
            conn.execute(
                "UPDATE parts SET search_text=?2 WHERE rowid=?1",
                rusqlite::params![rowid, text],
            )?;
        }
        Ok(())
    }

    pub fn transcript(&self, session_id: &str) -> Result<Vec<(Role, Part)>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT role, part_json FROM parts WHERE session_id=?1 ORDER BY seq")?;
        let rows = stmt.query_map([session_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut out = Vec::new();
        for r in rows {
            let (role_s, part_s) = r?;
            out.push((
                serde_json::from_str(&role_s)?,
                serde_json::from_str(&part_s)?,
            ));
        }
        Ok(out)
    }

    /// Read a newest-first-windowed but ascending transcript page whose boundaries always land on
    /// user rows. `before` is exclusive and must identify a user row in this session; rejecting
    /// arbitrary sequence numbers prevents a caller from splitting a turn in half.
    pub fn transcript_page(
        &self,
        session_id: &str,
        before: Option<TranscriptCursor>,
        limit: usize,
    ) -> Result<TranscriptPage, StoreError> {
        let limit = limit.clamp(1, MAX_TRANSCRIPT_TURNS) as i64;
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // This first read establishes the transaction's snapshot. Every boundary and entry query
        // below sees exactly this high-water mark even if a running turn appends concurrently.
        let snapshot_through: Option<i64> = tx.query_row(
            "SELECT MAX(seq) FROM parts WHERE session_id=?1",
            [session_id],
            |row| row.get(0),
        )?;
        let Some(snapshot_through) = snapshot_through else {
            tx.commit()?;
            return Ok(TranscriptPage::empty());
        };

        if let Some(TranscriptCursor(cursor)) = before {
            let role: Option<String> = tx
                .query_row(
                    "SELECT role FROM parts WHERE session_id=?1 AND seq=?2",
                    rusqlite::params![session_id, cursor],
                    |row| row.get(0),
                )
                .optional()?;
            let valid_user = role
                .as_deref()
                .and_then(|role| serde_json::from_str::<Role>(role).ok())
                == Some(Role::User);
            if !valid_user {
                return Err(StoreError::InvalidTranscriptCursor {
                    session_id: session_id.to_string(),
                    before: cursor,
                });
            }
        }

        let user_role = serde_json::to_string(&Role::User)?;
        let user_seqs: Vec<i64> = if let Some(TranscriptCursor(cursor)) = before {
            let mut stmt = tx.prepare(
                "SELECT seq FROM parts
                 WHERE session_id=?1 AND role=?2 AND seq<?3 AND seq<=?4
                 ORDER BY seq DESC LIMIT ?5",
            )?;
            let rows = stmt.query_map(
                rusqlite::params![session_id, user_role, cursor, snapshot_through, limit],
                |row| row.get(0),
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        } else {
            let mut stmt = tx.prepare(
                "SELECT seq FROM parts
                 WHERE session_id=?1 AND role=?2 AND seq<=?3
                 ORDER BY seq DESC LIMIT ?4",
            )?;
            let rows = stmt.query_map(
                rusqlite::params![session_id, user_role, snapshot_through, limit],
                |row| row.get(0),
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };

        let min_seq: i64 = tx.query_row(
            "SELECT MIN(seq) FROM parts WHERE session_id=?1 AND seq<=?2",
            rusqlite::params![session_id, snapshot_through],
            |row| row.get(0),
        )?;
        let (start_seq, next_before) = match user_seqs.last().copied() {
            Some(earliest_user) => {
                let has_earlier_user: bool = tx.query_row(
                    "SELECT EXISTS(
                       SELECT 1 FROM parts
                       WHERE session_id=?1 AND role=?2 AND seq<?3 AND seq<=?4
                     )",
                    rusqlite::params![session_id, user_role, earliest_user, snapshot_through],
                    |row| row.get(0),
                )?;
                if has_earlier_user {
                    (earliest_user, Some(TranscriptCursor(earliest_user)))
                } else {
                    // The oldest turn owns any legacy agent preamble that predates the first user
                    // row. It is returned once, never stranded behind a non-user cursor.
                    (min_seq, None)
                }
            }
            // Legacy transcripts with no earlier user marker form one bounded-by-snapshot page.
            None => (min_seq, None),
        };

        let raw_entries: Vec<(i64, String, String)> = if let Some(TranscriptCursor(cursor)) = before
        {
            let mut stmt = tx.prepare(
                "SELECT seq,role,part_json FROM parts
                     WHERE session_id=?1 AND seq>=?2 AND seq<?3 AND seq<=?4
                     ORDER BY seq",
            )?;
            let rows = stmt.query_map(
                rusqlite::params![session_id, start_seq, cursor, snapshot_through],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        } else {
            let mut stmt = tx.prepare(
                "SELECT seq,role,part_json FROM parts
                     WHERE session_id=?1 AND seq>=?2 AND seq<=?3
                     ORDER BY seq",
            )?;
            let rows = stmt.query_map(
                rusqlite::params![session_id, start_seq, snapshot_through],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };

        let mut entries = Vec::with_capacity(raw_entries.len());
        for (seq, role, part) in raw_entries {
            entries.push(TranscriptEntry {
                seq,
                role: serde_json::from_str(&role)?,
                part: serde_json::from_str(&part)?,
            });
        }
        tx.commit()?;
        Ok(TranscriptPage {
            entries: drop_superseded_tool_updates(entries),
            next_before,
            snapshot_through: Some(TranscriptCursor(snapshot_through)),
        })
    }

    /// Search canonical user prompts and agent text, returning at most one bounded snippet per
    /// session. Tool payloads, reasoning, plans and legacy compiled user prompts are not indexed.
    pub fn search_sessions(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SessionSearchHit>, StoreError> {
        let query: String = query.trim().chars().take(200).collect();
        let query = query.as_str();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let limit = limit.clamp(1, 50);
        let terms: Vec<String> = query
            .split(|c: char| !c.is_alphanumeric())
            .filter(|term| !term.is_empty())
            .map(str::to_string)
            .collect();

        let conn = self.conn.lock().unwrap();
        let mut rows: Vec<SessionSearchHit> = Vec::new();
        if terms.is_empty() || terms.iter().any(|term| term.chars().count() < 3) {
            // Trigram FTS cannot represent a one/two-character token. Use literal substring AND
            // semantics for those incremental/CJK inputs; parameters, not SQL text, carry values.
            let needles = if terms.is_empty() {
                vec![query.to_string()]
            } else {
                terms
            };
            let conditions = (1..=needles.len())
                .map(|index| format!("instr(lower(p.search_text),lower(?{index}))>0"))
                .collect::<Vec<_>>()
                .join(" AND ");
            let limit_param = needles.len() + 1;
            let sql = format!(
                "WITH ranked AS (
                   SELECT p.session_id,p.seq,p.role,s.title,s.cwd,s.archived,
                          substr(p.search_text,MAX(1,instr(lower(p.search_text),lower(?1))-60),180) AS snippet,
                          ROW_NUMBER() OVER (PARTITION BY p.session_id ORDER BY p.seq DESC) AS rn
                   FROM parts p JOIN sessions s ON s.id=p.session_id
                   WHERE p.search_text IS NOT NULL AND {conditions}
                 )
                 SELECT session_id,seq,role,title,cwd,archived,snippet
                 FROM ranked WHERE rn=1 ORDER BY seq DESC LIMIT ?{limit_param}"
            );
            let mut params = needles
                .into_iter()
                .map(rusqlite::types::Value::Text)
                .collect::<Vec<_>>();
            params.push(rusqlite::types::Value::Integer(limit as i64));
            let mut stmt = conn.prepare(&sql)?;
            let mapped =
                stmt.query_map(rusqlite::params_from_iter(params.iter()), search_hit_row)?;
            for row in mapped {
                rows.push(row?);
            }
        } else {
            let match_query = terms
                .iter()
                .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
                .collect::<Vec<_>>()
                .join(" AND ");
            let mut stmt = conn.prepare(
                "WITH best AS (
                   SELECT p.session_id,MAX(p.seq) AS seq
                   FROM parts_fts JOIN parts p ON p.rowid=parts_fts.rowid
                   WHERE parts_fts MATCH ?1
                   GROUP BY p.session_id
                   ORDER BY MAX(p.seq) DESC LIMIT ?2
                 )
                 SELECT p.session_id,p.seq,p.role,s.title,s.cwd,s.archived,
                        snippet(parts_fts,0,'','', ' … ',24)
                 FROM best
                 JOIN parts p ON p.session_id=best.session_id AND p.seq=best.seq
                 JOIN parts_fts ON parts_fts.rowid=p.rowid
                 JOIN sessions s ON s.id=p.session_id
                 WHERE parts_fts MATCH ?1
                 ORDER BY p.seq DESC",
            )?;
            let mapped =
                stmt.query_map(rusqlite::params![match_query, limit as i64], search_hit_row)?;
            for row in mapped {
                rows.push(row?);
            }
        }

        let mut out = Vec::new();
        for mut hit in rows {
            hit.snippet = hit.snippet.split_whitespace().collect::<Vec<_>>().join(" ");
            hit.snippet = hit.snippet.chars().take(240).collect();
            out.push(hit);
        }
        Ok(out)
    }

    /// Transcript with stable sequence ids, used to attach non-transcript turn metadata such as
    /// memory injection receipts after an app restart.
    pub fn transcript_with_seq(
        &self,
        session_id: &str,
    ) -> Result<Vec<(i64, Role, Part)>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT seq,role,part_json FROM parts WHERE session_id=?1 ORDER BY seq")?;
        let rows = stmt.query_map([session_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (seq, role, part) = row?;
            out.push((
                seq,
                serde_json::from_str(&role)?,
                serde_json::from_str(&part)?,
            ));
        }
        Ok(out)
    }
}

/// Raw column tuple for a session row (JSON columns still stringified).
type SessionCols = (
    String,
    String,
    String,
    Option<String>,
    String,
    Option<String>,
    Option<String>,
    String,
    String,
    Option<String>,
    i64,
    i64,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    String,
);

fn row_to_session_parts(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionCols> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
        row.get(10)?,
        row.get(11)?,
        row.get(12)?,
        row.get(13)?,
        row.get(14)?,
        row.get(15)?,
        row.get(16)?,
        row.get(17)?,
        row.get(18)?,
        row.get(19)?,
    ))
}

fn build_session(c: SessionCols) -> Result<Session, StoreError> {
    Ok(Session {
        id: c.0,
        title: c.1,
        title_origin: parse_title_origin(&c.12),
        pinned: c.11 != 0,
        activity: c
            .13
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?
            .unwrap_or_default(),
        provider: serde_json::from_str(&c.2)?,
        model: c.3,
        cwd: c.4,
        project_path: c.5,
        worktree_path: c.6,
        worktree_common_dir: c.15,
        worktree_git_dir: c.16,
        worktree_identity: c.17.as_deref().map(serde_json::from_str).transpose()?,
        worktree_baseline: c.14.as_deref().map(serde_json::from_str).transpose()?,
        permission_mode: serde_json::from_str(&c.7)?,
        sandbox_policy: serde_json::from_str(&c.8)?,
        acp_session_id: c.9,
        memory_read: MemoryAccess::from_db(&c.18),
        memory_write: MemoryAccess::from_db(&c.19),
        created_at: c.10,
    })
}

fn title_origin_str(origin: SessionTitleOrigin) -> &'static str {
    match origin {
        SessionTitleOrigin::Default => "default",
        SessionTitleOrigin::Automatic => "automatic",
        SessionTitleOrigin::Manual => "manual",
    }
}

fn parse_title_origin(value: &str) -> SessionTitleOrigin {
    match value {
        "automatic" => SessionTitleOrigin::Automatic,
        "manual" => SessionTitleOrigin::Manual,
        _ => SessionTitleOrigin::Default,
    }
}

fn search_hit_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionSearchHit> {
    let role: String = row.get(2)?;
    let role = serde_json::from_str(&role).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(e))
    })?;
    Ok(SessionSearchHit {
        session_id: row.get(0)?,
        seq: row.get(1)?,
        role,
        title: row.get(3)?,
        cwd: row.get(4)?,
        archived: row.get::<_, i64>(5)? != 0,
        snippet: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::canvas::{
        CanvasDraftUpdate, CanvasExport, CanvasExportKind, CanvasFeatureGate, CanvasFreezeInput,
        CanvasManifest, CanvasObject, CanvasObjectKind, CanvasRect, CanvasSceneEnvelope,
        CanvasTheme,
    };
    use crate::permission::{PermissionMode, SandboxPolicy};
    use crate::provider::ProviderId;
    use crate::session::{PendingInput, PendingInputKind, DEFAULT_TRANSCRIPT_TURNS};
    use crate::worktree::{DirectoryIdentity, ResolvedWorktreeBaseline, WorktreeBaseline};
    use std::sync::{Arc, Barrier};

    #[test]
    fn migration_adds_pinned_with_an_unpinned_default() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, provider TEXT NOT NULL, model TEXT,
               cwd TEXT NOT NULL, worktree_path TEXT, permission_mode TEXT NOT NULL,
               acp_session_id TEXT, created_at INTEGER NOT NULL
             );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions
               (id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,created_at)
             VALUES (?1,?2,?3,NULL,?4,NULL,?5,NULL,?6)",
            rusqlite::params!["legacy", "Legacy", "\"grok\"", "/work", "\"ask\"", 100],
        )
        .unwrap();

        conn.execute_batch(SCHEMA).unwrap();
        migrate(&conn).unwrap();
        let store = Store {
            conn: Mutex::new(conn),
            artifact_root: None,
        };
        let restored = store.get_session("legacy").unwrap().unwrap();
        assert!(!restored.pinned);
        assert!(restored.worktree_baseline.is_none());
        assert!(restored.worktree_identity.is_none());
        assert_eq!(restored.activity, SessionActivity::default());
        assert_eq!(restored.title_origin, SessionTitleOrigin::Manual);
        assert_eq!(restored.project_path.as_deref(), Some("/work"));
        assert_eq!(restored.sandbox_policy, SandboxPolicy::WorkspaceWrite);
    }

    #[test]
    fn migration_repairs_columns_left_present_before_their_backfills() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
               id TEXT PRIMARY KEY, title TEXT NOT NULL,
               title_origin TEXT NOT NULL DEFAULT 'default',
               provider TEXT NOT NULL, model TEXT, cwd TEXT NOT NULL,
               worktree_path TEXT, permission_mode TEXT NOT NULL,
               acp_session_id TEXT, created_at INTEGER NOT NULL
             );
             INSERT INTO sessions
               (id,title,title_origin,provider,cwd,permission_mode,created_at)
             VALUES ('legacy-title','My title','default','\"grok\"','/work/legacy','\"ask\"',100);
             CREATE TABLE projects (
               path TEXT PRIMARY KEY, name TEXT NOT NULL,
               last_opened_at INTEGER NOT NULL,
               added_at INTEGER NOT NULL DEFAULT 0
             );
             INSERT INTO projects VALUES ('/work/older','older',100,0),
                                         ('/work/newer','newer',200,0);",
        )
        .unwrap();
        conn.execute_batch(SCHEMA).unwrap();

        migrate(&conn).unwrap();

        let origin: String = conn
            .query_row(
                "SELECT title_origin FROM sessions WHERE id='legacy-title'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(origin, "manual");
        for (path, expected) in [("/work/older", 100), ("/work/newer", 200)] {
            let added: i64 = conn
                .query_row(
                    "SELECT added_at FROM projects WHERE path=?1",
                    [path],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(added, expected);
        }
    }

    #[test]
    fn additive_schema_and_backfills_roll_back_together() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, provider TEXT NOT NULL, model TEXT,
               cwd TEXT NOT NULL, worktree_path TEXT, permission_mode TEXT NOT NULL,
               acp_session_id TEXT, created_at INTEGER NOT NULL
             );
             INSERT INTO sessions
               (id,title,provider,cwd,permission_mode,created_at)
             VALUES ('legacy','Legacy','\"grok\"','/work','\"ask\"',100);
             CREATE TRIGGER reject_session_backfill BEFORE UPDATE ON sessions
             BEGIN SELECT RAISE(ABORT, 'simulated backfill failure'); END;",
        )
        .unwrap();
        conn.execute_batch(SCHEMA).unwrap();

        let error = migrate(&conn).unwrap_err();
        assert!(error.to_string().contains("simulated backfill failure"));
        assert!(
            !table_has_column(&conn, "sessions", "archived").unwrap(),
            "ALTER TABLE must roll back with its failed backfill"
        );
        assert!(!table_has_column(&conn, "sessions", "activity_json").unwrap());
    }

    #[test]
    fn migration_leaves_a_legacy_worktree_source_unknown() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, provider TEXT NOT NULL, model TEXT,
               cwd TEXT NOT NULL, worktree_path TEXT, permission_mode TEXT NOT NULL,
               acp_session_id TEXT, created_at INTEGER NOT NULL
             );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions
               (id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,created_at)
             VALUES (?1,?2,?3,NULL,?4,?5,?6,NULL,?7)",
            rusqlite::params![
                "legacy-worktree",
                "Legacy",
                "\"grok\"",
                "/isolated/repo/packages/app",
                "/isolated/repo",
                "\"ask\"",
                100
            ],
        )
        .unwrap();

        conn.execute_batch(SCHEMA).unwrap();
        migrate(&conn).unwrap();
        let store = Store {
            conn: Mutex::new(conn),
            artifact_root: None,
        };
        let restored = store.get_session("legacy-worktree").unwrap().unwrap();
        assert!(restored.project_path.is_none());
        assert!(restored.worktree_common_dir.is_none());
        assert!(restored.worktree_git_dir.is_none());
        assert!(restored.worktree_identity.is_none());
    }

    #[test]
    fn projects_are_listed_newest_added_first() {
        let store = Store::open_in_memory().unwrap();
        store.add_project("/work/alpha", None, 100).unwrap();
        store.add_project("/work/beta", None, 200).unwrap();

        let list = store.list_projects().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].path, "/work/beta", "most recently added first");
        // A name defaults to the directory's own name, not the whole path.
        assert_eq!(list[0].name, "beta");
    }

    #[test]
    fn opening_a_project_does_not_reorder_the_list() {
        let store = Store::open_in_memory().unwrap();
        store.add_project("/work/alpha", None, 100).unwrap();
        store.add_project("/work/beta", None, 200).unwrap();
        let before: Vec<String> = store
            .list_projects()
            .unwrap()
            .into_iter()
            .map(|p| p.path)
            .collect();

        // Clicking the bottom row must not walk it to the top under the cursor.
        store.touch_project("/work/alpha", 300).unwrap();
        // Nor does re-adding a directory that's already listed.
        store.add_project("/work/alpha", None, 400).unwrap();

        let after = store.list_projects().unwrap();
        assert_eq!(
            after.iter().map(|p| p.path.clone()).collect::<Vec<_>>(),
            before
        );
        // The age on the row still tracks use, even though the position doesn't.
        assert_eq!(
            after
                .iter()
                .find(|p| p.path == "/work/alpha")
                .unwrap()
                .last_opened_at,
            400
        );
    }

    #[test]
    fn adding_a_known_project_reopens_it_rather_than_duplicating() {
        let store = Store::open_in_memory().unwrap();
        store
            .add_project("/work/alpha", Some("Alpha"), 100)
            .unwrap();
        store.add_project("/work/alpha", None, 400).unwrap();

        let list = store.list_projects().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].last_opened_at, 400);
        // Re-adding must not clobber a name the user chose.
        assert_eq!(list[0].name, "Alpha");
    }

    #[test]
    fn project_worktree_default_round_trips_survives_reopen_and_clears() {
        let store = Store::open_in_memory().unwrap();
        store.add_project("/work/alpha", None, 100).unwrap();
        assert_eq!(
            store.list_projects().unwrap()[0].default_worktree_mode,
            None
        );

        store
            .set_project_worktree_mode("/work/alpha", Some(ProjectWorktreeMode::OriginDefault))
            .unwrap();
        store.add_project("/work/alpha", None, 200).unwrap();
        assert_eq!(
            store.list_projects().unwrap()[0].default_worktree_mode,
            Some(ProjectWorktreeMode::OriginDefault),
            "reopening a project must not reset its default"
        );

        store
            .set_project_worktree_mode("/work/alpha", Some(ProjectWorktreeMode::Local))
            .unwrap();
        assert_eq!(
            store.list_projects().unwrap()[0].default_worktree_mode,
            Some(ProjectWorktreeMode::Local),
            "local is an explicit preference, not the inherit sentinel"
        );

        store
            .set_project_worktree_mode("/work/alpha", None)
            .unwrap();
        assert_eq!(
            store.list_projects().unwrap()[0].default_worktree_mode,
            None
        );
    }

    #[test]
    fn removing_a_project_keeps_its_sessions() {
        let store = Store::open_in_memory().unwrap();
        let s = Session::new(ProviderId::Grok, "/work/alpha");
        store.upsert_session(&s).unwrap();
        store.add_project("/work/alpha", None, 100).unwrap();

        store.remove_project("/work/alpha").unwrap();
        assert!(store.list_projects().unwrap().is_empty());
        assert_eq!(
            store.list_sessions().unwrap().len(),
            1,
            "transcripts are not the bookkeeping"
        );
    }

    #[test]
    fn an_existing_store_seeds_projects_from_its_sessions() {
        // A store that predates the projects table shouldn't open to an empty picker.
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        let store = Store {
            conn: Mutex::new(conn),
            artifact_root: None,
        };
        let mut a = Session::new(ProviderId::Grok, "/work/alpha");
        a.created_at = 100;
        let mut b = Session::new(ProviderId::Grok, "/work/beta");
        b.created_at = 300;
        store.upsert_session(&a).unwrap();
        store.upsert_session(&b).unwrap();

        migrate(&store.conn.lock().unwrap()).unwrap();

        let list = store.list_projects().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(
            list[0].path, "/work/beta",
            "ordered by the newest session in each"
        );
        assert_eq!(list[0].name, "beta");
    }

    #[test]
    fn a_store_without_added_at_keeps_the_order_it_already_showed() {
        // Upgrading shouldn't shuffle a rail the user already knows: the order that use-order
        // produced becomes the fixed order, and stays put from then on.
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE projects (path TEXT PRIMARY KEY, name TEXT NOT NULL,
                                    last_opened_at INTEGER NOT NULL);
             INSERT INTO projects VALUES ('/work/alpha', 'alpha', 100),
                                         ('/work/beta',  'beta',  200);",
        )
        .unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        migrate(&conn).unwrap();
        let store = Store {
            conn: Mutex::new(conn),
            artifact_root: None,
        };

        let paths: Vec<String> = store
            .list_projects()
            .unwrap()
            .into_iter()
            .map(|p| p.path)
            .collect();
        assert_eq!(paths, ["/work/beta", "/work/alpha"]);

        store.touch_project("/work/alpha", 999).unwrap();
        let after: Vec<String> = store
            .list_projects()
            .unwrap()
            .into_iter()
            .map(|p| p.path)
            .collect();
        assert_eq!(
            after, paths,
            "frozen after the migration, not re-derived from use"
        );
    }

    #[test]
    fn last_texts_returns_the_newest_text_per_session() {
        let store = Store::open_in_memory().unwrap();
        let a = Session::new(ProviderId::Grok, "/a");
        store.upsert_session(&a).unwrap();

        store
            .append_part(
                &a.id,
                Role::User,
                &Part::Text {
                    text: "first".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &a.id,
                Role::Agent,
                &Part::Text {
                    text: "  second\n  answer  ".into(),
                },
            )
            .unwrap();
        // A tool call lands last, but "ran a command" is not a conversation preview.
        store
            .append_part(
                &a.id,
                Role::Agent,
                &Part::ToolCall {
                    id: "t".into(),
                    title: "ls".into(),
                    status: "completed".into(),
                    tool_kind: None,
                    agent_input: None,
                    outputs: Vec::new(),
                },
            )
            .unwrap();

        let previews = store.last_texts().unwrap();
        assert_eq!(previews.len(), 1);
        assert_eq!(previews[0].0, a.id);
        // Whitespace is flattened so a multi-line answer stays one line in the rail.
        assert_eq!(previews[0].1, "second answer");
    }

    #[test]
    fn a_session_with_no_text_has_no_preview() {
        let store = Store::open_in_memory().unwrap();
        let a = Session::new(ProviderId::Grok, "/a");
        store.upsert_session(&a).unwrap();
        store
            .append_part(
                &a.id,
                Role::Agent,
                &Part::Plan {
                    entries: vec!["x".into()],
                },
            )
            .unwrap();

        assert!(store.last_texts().unwrap().is_empty());
    }

    #[test]
    fn session_round_trip_and_ordering() {
        let store = Store::open_in_memory().unwrap();
        let mut a = Session::new(ProviderId::Grok, "/a");
        a.title = "First".into();
        a.created_at = 100;
        let mut b = Session::new(ProviderId::ClaudeCode, "/b");
        b.title = "Second".into();
        b.created_at = 200;

        store.upsert_session(&a).unwrap();
        store.upsert_session(&b).unwrap();

        let list = store.list_sessions().unwrap();
        assert_eq!(list.len(), 2);
        // Newest first.
        assert_eq!(list[0].title, "Second");
        assert_eq!(list[1].provider, ProviderId::Grok);

        // Upsert updates in place, not duplicates.
        let mut a2 = a.clone();
        a2.model = Some("grok-build".into());
        store.upsert_session(&a2).unwrap();
        assert_eq!(store.list_sessions().unwrap().len(), 2);
        assert_eq!(
            store.get_session(&a.id).unwrap().unwrap().model.as_deref(),
            Some("grok-build")
        );

        store
            .set_session_memory_policy(&a.id, MemoryAccess::Allow, MemoryAccess::Deny)
            .unwrap();
        let saved = store.get_session(&a.id).unwrap().unwrap();
        assert_eq!(saved.memory_read, MemoryAccess::Allow);
        assert_eq!(saved.memory_write, MemoryAccess::Deny);
        // A later runtime upsert must not overwrite a policy changed directly by the UI.
        store.upsert_session(&a2).unwrap();
        assert_eq!(
            store.session_memory_policy(&a.id).unwrap(),
            (MemoryAccess::Allow, MemoryAccess::Deny)
        );
    }

    #[test]
    fn session_activity_round_trips_and_rejects_stale_cas_writers() {
        let store = Store::open_in_memory().unwrap();
        let mut session = Session::new(ProviderId::Grok, "/work");
        session.activity = SessionActivity {
            revision: 4,
            state: SessionRunState::Running {
                turn_id: "turn-4".into(),
                prompt_request_id: Some("prompt-4".into()),
            },
        };
        store.upsert_session(&session).unwrap();
        assert_eq!(
            store.get_session(&session.id).unwrap().unwrap().activity,
            session.activity
        );

        let awaiting = SessionActivity {
            revision: 5,
            state: SessionRunState::AwaitingInput {
                turn_id: "turn-4".into(),
                prompt_request_id: Some("prompt-4".into()),
                pending: vec![PendingInput {
                    input_id: "permission-1".into(),
                    kind: PendingInputKind::Permission,
                    title: "Run tests".into(),
                    options: vec![("allow".into(), "Allow".into())],
                    sequence: 1,
                    context: Default::default(),
                }],
            },
        };
        assert!(store
            .update_session_activity(&session.id, 4, &awaiting)
            .unwrap());

        let stale = SessionActivity {
            revision: 5,
            state: SessionRunState::Idle,
        };
        assert!(!store
            .update_session_activity(&session.id, 4, &stale)
            .unwrap());
        assert_eq!(
            store.get_session(&session.id).unwrap().unwrap().activity,
            awaiting
        );
    }

    #[test]
    fn prompt_and_running_activity_commit_atomically() {
        let store = Store::open_in_memory().unwrap();
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();
        let running = SessionActivity {
            revision: 1,
            state: SessionRunState::Running {
                turn_id: "turn-1".into(),
                prompt_request_id: Some("prompt-1".into()),
            },
        };
        let prompt = Part::Prompt {
            text: "canonical prompt".into(),
            display: "canonical prompt".into(),
        };

        assert_eq!(
            store
                .append_prompt_and_activity(&session.id, &prompt, 0, &running)
                .unwrap(),
            0
        );
        assert_eq!(
            store.get_session(&session.id).unwrap().unwrap().activity,
            running
        );
        assert!(matches!(
            store.transcript(&session.id).unwrap().as_slice(),
            [(Role::User, Part::Prompt { text, .. })] if text == "canonical prompt"
        ));

        let stale_prompt = Part::Prompt {
            text: "must roll back".into(),
            display: "must roll back".into(),
        };
        assert!(matches!(
            store.append_prompt_and_activity(&session.id, &stale_prompt, 0, &running),
            Err(StoreError::ActivityConflict {
                expected: 0,
                actual: 1,
                ..
            })
        ));
        assert_eq!(
            store.transcript(&session.id).unwrap().len(),
            1,
            "a failed activity CAS must not append the prompt"
        );
    }

    #[test]
    fn startup_normalizes_only_in_flight_activity_as_interrupted() {
        let store = Store::open_in_memory().unwrap();
        let mut running = Session::new(ProviderId::Grok, "/running");
        running.activity = SessionActivity {
            revision: 3,
            state: SessionRunState::Running {
                turn_id: "running-turn".into(),
                prompt_request_id: None,
            },
        };
        let mut awaiting = Session::new(ProviderId::Grok, "/awaiting");
        awaiting.activity = SessionActivity {
            revision: 8,
            state: SessionRunState::AwaitingInput {
                turn_id: "awaiting-turn".into(),
                prompt_request_id: Some("prompt".into()),
                pending: vec![PendingInput {
                    input_id: "permission".into(),
                    kind: PendingInputKind::Permission,
                    title: "Approve".into(),
                    options: vec![],
                    sequence: 9,
                    context: Default::default(),
                }],
            },
        };
        let idle = Session::new(ProviderId::Grok, "/idle");
        let mut failed = Session::new(ProviderId::Grok, "/failed");
        failed.activity = SessionActivity {
            revision: 2,
            state: SessionRunState::Failed {
                turn_id: Some("old-turn".into()),
                reason: RunFailureReason::ProviderError,
                message: "already terminal".into(),
            },
        };
        for session in [&running, &awaiting, &idle, &failed] {
            store.upsert_session(session).unwrap();
        }

        assert_eq!(store.normalize_interrupted_activities().unwrap(), 2);
        for (session_id, revision, turn_id) in [
            (&running.id, 4, "running-turn"),
            (&awaiting.id, 9, "awaiting-turn"),
        ] {
            let activity = store.get_session(session_id).unwrap().unwrap().activity;
            assert_eq!(activity.revision, revision);
            assert!(matches!(
                activity.state,
                SessionRunState::Failed {
                    turn_id: Some(ref actual_turn),
                    reason: RunFailureReason::Interrupted,
                    ref message,
                } if actual_turn == turn_id
                    && message == "Code2 stopped before the turn finished"
            ));
        }
        assert_eq!(
            store.get_session(&idle.id).unwrap().unwrap().activity,
            idle.activity
        );
        assert_eq!(
            store.get_session(&failed.id).unwrap().unwrap().activity,
            failed.activity
        );
        assert_eq!(store.normalize_interrupted_activities().unwrap(), 0);
    }

    #[test]
    fn permission_mode_updates_without_requiring_a_live_runtime() {
        let store = Store::open_in_memory().unwrap();
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();

        assert!(store
            .set_permission_mode(&session.id, PermissionMode::Yolo)
            .unwrap());
        assert_eq!(
            store
                .get_session(&session.id)
                .unwrap()
                .unwrap()
                .permission_mode,
            PermissionMode::Yolo
        );
        assert!(!store
            .set_permission_mode("missing", PermissionMode::AcceptEdits)
            .unwrap());
    }

    #[test]
    fn execution_policy_round_trips_atomically() {
        let store = Store::open_in_memory().unwrap();
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();

        assert!(store
            .set_execution_policy(
                &session.id,
                PermissionMode::AcceptEdits,
                SandboxPolicy::ReadOnly,
            )
            .unwrap());
        let restored = store.get_session(&session.id).unwrap().unwrap();
        assert_eq!(restored.permission_mode, PermissionMode::AcceptEdits);
        assert_eq!(restored.sandbox_policy, SandboxPolicy::ReadOnly);

        // A failed write cannot leave one axis updated and the other stale because both columns
        // are assigned by the same SQLite statement.
        store
            .conn
            .lock()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER reject_execution_policy BEFORE UPDATE OF permission_mode, sandbox_policy ON sessions
                 BEGIN SELECT RAISE(ABORT, 'simulated policy write failure'); END;",
            )
            .unwrap();
        let error = store
            .set_execution_policy(
                &session.id,
                PermissionMode::Yolo,
                SandboxPolicy::DangerFullAccess,
            )
            .unwrap_err();
        assert!(error.to_string().contains("simulated policy write failure"));
        let unchanged = store.get_session(&session.id).unwrap().unwrap();
        assert_eq!(unchanged.permission_mode, PermissionMode::AcceptEdits);
        assert_eq!(unchanged.sandbox_policy, SandboxPolicy::ReadOnly);
    }

    #[test]
    fn worktree_session_paths_round_trip_independently() {
        let store = Store::open_in_memory().unwrap();
        let mut session = Session::new(ProviderId::Grok, "/source/repo/packages/app");
        session.cwd = "/isolated/repo/packages/app".into();
        session.worktree_path = Some("/isolated/repo".into());
        session.worktree_identity = Some(DirectoryIdentity::Unix {
            device: 42,
            inode: 108,
        });
        session.worktree_common_dir = Some("/source/repo/.git".into());
        session.worktree_git_dir = Some("/source/repo/.git/worktrees/isolated".into());
        session.worktree_baseline = Some(ResolvedWorktreeBaseline {
            kind: WorktreeBaseline::OriginDefault,
            reference: "refs/remotes/origin/main".into(),
            sha: "0123456789abcdef0123456789abcdef01234567".into(),
            display: "origin/main @ 01234567".into(),
        });
        store.upsert_session(&session).unwrap();

        let restored = store.get_session(&session.id).unwrap().unwrap();
        assert_eq!(
            restored.project_path.as_deref(),
            Some("/source/repo/packages/app")
        );
        assert_eq!(restored.cwd, "/isolated/repo/packages/app");
        assert_eq!(restored.worktree_path.as_deref(), Some("/isolated/repo"));
        assert_eq!(restored.worktree_identity, session.worktree_identity);
        assert_eq!(restored.worktree_common_dir, session.worktree_common_dir);
        assert_eq!(restored.worktree_git_dir, session.worktree_git_dir);
        assert_eq!(restored.worktree_baseline, session.worktree_baseline);
    }

    #[test]
    fn pinned_sessions_persist_and_sort_before_newer_sessions() {
        let store = Store::open_in_memory().unwrap();
        let mut pinned = Session::new(ProviderId::Grok, "/pinned");
        pinned.title = "Pinned".into();
        pinned.created_at = 100;
        pinned.pinned = true;
        let mut newer_pinned = Session::new(ProviderId::Grok, "/newer-pinned");
        newer_pinned.title = "Newer pinned".into();
        newer_pinned.created_at = 150;
        newer_pinned.pinned = true;
        let mut newest = Session::new(ProviderId::Codex, "/newest");
        newest.title = "Newest".into();
        newest.created_at = 200;

        store.upsert_session(&pinned).unwrap();
        store.upsert_session(&newer_pinned).unwrap();
        store.upsert_session(&newest).unwrap();

        let list = store.list_sessions().unwrap();
        assert_eq!(
            list.iter().map(|s| s.title.as_str()).collect::<Vec<_>>(),
            ["Newer pinned", "Pinned", "Newest"],
        );
        assert!(store.get_session(&pinned.id).unwrap().unwrap().pinned);

        let mut updated = pinned.clone();
        updated.title = "Still pinned".into();
        store.upsert_session(&updated).unwrap();
        assert!(store.get_session(&pinned.id).unwrap().unwrap().pinned);
    }

    #[test]
    fn archiving_clears_and_blocks_pinning() {
        let store = Store::open_in_memory().unwrap();
        let mut session = Session::new(ProviderId::Grok, "/work");
        session.pinned = true;
        store.upsert_session(&session).unwrap();

        store.set_archived(&session.id, true).unwrap();
        let archived = store.list_archived_sessions().unwrap();
        assert_eq!(archived.len(), 1);
        assert!(
            !archived[0].pinned,
            "archived sessions must not surface as pinned"
        );

        store.set_pinned(&session.id, true).unwrap();
        store.upsert_session(&session).unwrap();
        assert!(!store.get_session(&session.id).unwrap().unwrap().pinned);

        store.set_archived(&session.id, false).unwrap();
        assert!(!store.get_session(&session.id).unwrap().unwrap().pinned);
    }

    #[test]
    fn rename_and_archive_sessions() {
        let store = Store::open_in_memory().unwrap();
        let a = Session::new(ProviderId::Grok, "/a");
        let b = Session::new(ProviderId::Codex, "/b");
        store.upsert_session(&a).unwrap();
        store.upsert_session(&b).unwrap();
        assert_eq!(store.list_sessions().unwrap().len(), 2);

        store.rename_session(&a.id, "Renamed").unwrap();
        let renamed = store.get_session(&a.id).unwrap().unwrap();
        assert_eq!(renamed.title, "Renamed");
        assert_eq!(renamed.title_origin, SessionTitleOrigin::Manual);

        assert!(!store
            .set_initial_title(&a.id, "Automatic replacement")
            .unwrap());
        assert_eq!(store.get_session(&a.id).unwrap().unwrap().title, "Renamed");

        store.set_archived(&b.id, true).unwrap();
        let active = store.list_sessions().unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].id, a.id);
        let archived = store.list_archived_sessions().unwrap();
        assert_eq!(archived.len(), 1);
        assert_eq!(archived[0].id, b.id);

        // Unarchive restores it, and an upsert doesn't clobber the flag.
        store.set_archived(&b.id, false).unwrap();
        assert_eq!(store.list_sessions().unwrap().len(), 2);
        store.set_archived(&b.id, true).unwrap();
        store.upsert_session(&b).unwrap();
        assert_eq!(
            store.list_sessions().unwrap().len(),
            1,
            "upsert must preserve archived"
        );
    }

    #[test]
    fn transcript_appends_in_order() {
        let store = Store::open_in_memory().unwrap();
        let s = Session::new(ProviderId::Grok, "/a");
        store.upsert_session(&s).unwrap();

        store
            .append_part(
                &s.id,
                Role::User,
                &Part::Prompt {
                    text: "hi".into(),
                    display: "hi".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &s.id,
                Role::Agent,
                &Part::Text {
                    text: "hello".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &s.id,
                Role::Agent,
                &Part::ToolCall {
                    id: "t1".into(),
                    title: "ls".into(),
                    status: "completed".into(),
                    tool_kind: None,
                    agent_input: None,
                    outputs: Vec::new(),
                },
            )
            .unwrap();

        let t = store.transcript(&s.id).unwrap();
        assert_eq!(t.len(), 3);
        assert!(matches!(t[0], (Role::User, Part::Prompt { .. })));
        assert!(matches!(t[2], (Role::Agent, Part::ToolCall { .. })));
    }

    fn append_numbered_turn(store: &Store, session_id: &str, number: usize) -> (i64, i64) {
        let user = store
            .append_part(
                session_id,
                Role::User,
                &Part::Prompt {
                    text: format!("user-{number}"),
                    display: format!("user-{number}"),
                },
            )
            .unwrap();
        let agent = store
            .append_part(
                session_id,
                Role::Agent,
                &Part::Text {
                    text: format!("agent-{number}"),
                },
            )
            .unwrap();
        (user, agent)
    }

    fn page_user_numbers(page: &TranscriptPage) -> Vec<usize> {
        page.entries
            .iter()
            .filter_map(|entry| match (&entry.role, &entry.part) {
                (Role::User, Part::Prompt { text, .. }) | (Role::User, Part::Text { text }) => {
                    text.strip_prefix("user-")?.parse::<usize>().ok()
                }
                _ => None,
            })
            .collect()
    }

    #[test]
    fn transcript_pages_stitch_fifty_five_turns_as_twenty_twenty_fifteen() {
        let store = Store::open_in_memory().unwrap();
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();
        for turn in 0..55 {
            append_numbered_turn(&store, &session.id, turn);
        }

        let latest = store
            .transcript_page(&session.id, None, DEFAULT_TRANSCRIPT_TURNS)
            .unwrap();
        assert_eq!(page_user_numbers(&latest), (35..55).collect::<Vec<_>>());
        assert_eq!(latest.entries.len(), 40);
        assert_eq!(latest.snapshot_through, Some(TranscriptCursor(109)));

        let middle = store
            .transcript_page(&session.id, latest.next_before, DEFAULT_TRANSCRIPT_TURNS)
            .unwrap();
        assert_eq!(page_user_numbers(&middle), (15..35).collect::<Vec<_>>());
        assert_eq!(middle.entries.len(), 40);

        let oldest = store
            .transcript_page(&session.id, middle.next_before, DEFAULT_TRANSCRIPT_TURNS)
            .unwrap();
        assert_eq!(page_user_numbers(&oldest), (0..15).collect::<Vec<_>>());
        assert_eq!(oldest.entries.len(), 30);
        assert_eq!(oldest.next_before, None);

        let mut stitched = oldest.entries;
        stitched.extend(middle.entries);
        stitched.extend(latest.entries);
        assert_eq!(stitched.len(), 110);
        assert_eq!(
            stitched.iter().map(|entry| entry.seq).collect::<Vec<_>>(),
            (0..110).collect::<Vec<_>>()
        );
    }

    #[test]
    fn transcript_cursor_must_be_a_user_row_in_the_same_session() {
        let store = Store::open_in_memory().unwrap();
        let a = Session::new(ProviderId::Grok, "/a");
        let b = Session::new(ProviderId::Grok, "/b");
        store.upsert_session(&a).unwrap();
        store.upsert_session(&b).unwrap();
        append_numbered_turn(&store, &a.id, 0); // user 0, agent 1
        store
            .append_part(
                &b.id,
                Role::Agent,
                &Part::Text {
                    text: "legacy preamble".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &b.id,
                Role::Agent,
                &Part::Text {
                    text: "another preamble".into(),
                },
            )
            .unwrap();
        let cross_session_user = store
            .append_part(
                &b.id,
                Role::User,
                &Part::Text {
                    text: "legacy user".into(),
                },
            )
            .unwrap();
        assert_eq!(cross_session_user, 2);

        for cursor in [
            TranscriptCursor(1),
            TranscriptCursor(2),
            TranscriptCursor(999),
        ] {
            assert!(matches!(
                store.transcript_page(&a.id, Some(cursor), 20),
                Err(StoreError::InvalidTranscriptCursor { before, .. }) if before == cursor.0
            ));
        }
    }

    #[test]
    fn transcript_limit_is_clamped_between_one_and_fifty_turns() {
        let store = Store::open_in_memory().unwrap();
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();
        for turn in 0..55 {
            append_numbered_turn(&store, &session.id, turn);
        }

        let minimum = store.transcript_page(&session.id, None, 0).unwrap();
        assert_eq!(page_user_numbers(&minimum), vec![54]);
        let maximum = store
            .transcript_page(&session.id, None, usize::MAX)
            .unwrap();
        assert_eq!(page_user_numbers(&maximum), (5..55).collect::<Vec<_>>());
        assert!(maximum.next_before.is_some());
    }

    #[test]
    fn oldest_page_includes_legacy_agent_preamble_and_user_text() {
        let store = Store::open_in_memory().unwrap();
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();
        store
            .append_part(
                &session.id,
                Role::Agent,
                &Part::Text {
                    text: "legacy preamble".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &session.id,
                Role::User,
                &Part::Text {
                    text: "user-0".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &session.id,
                Role::Agent,
                &Part::Text {
                    text: "legacy answer".into(),
                },
            )
            .unwrap();

        let page = store.transcript_page(&session.id, None, 20).unwrap();
        assert_eq!(
            page.entries
                .iter()
                .map(|entry| entry.seq)
                .collect::<Vec<_>>(),
            [0, 1, 2]
        );
        assert_eq!(page.next_before, None);
        assert_eq!(page_user_numbers(&page), vec![0]);
    }

    #[test]
    fn agent_only_and_empty_legacy_transcripts_are_single_sensible_pages() {
        let store = Store::open_in_memory().unwrap();
        let agent_only = Session::new(ProviderId::Grok, "/agent-only");
        let empty = Session::new(ProviderId::Grok, "/empty");
        store.upsert_session(&agent_only).unwrap();
        store.upsert_session(&empty).unwrap();
        for text in ["one", "two", "three"] {
            store
                .append_part(
                    &agent_only.id,
                    Role::Agent,
                    &Part::Text { text: text.into() },
                )
                .unwrap();
        }

        let page = store.transcript_page(&agent_only.id, None, 1).unwrap();
        assert_eq!(page.entries.len(), 3);
        assert_eq!(page.next_before, None);
        assert_eq!(page.snapshot_through, Some(TranscriptCursor(2)));
        let empty_page = store.transcript_page(&empty.id, None, 20).unwrap();
        assert!(empty_page.entries.is_empty());
        assert_eq!(empty_page.snapshot_through, None);
    }

    #[test]
    fn snapshot_high_water_mark_keeps_running_appends_out_of_an_existing_page() {
        let store = Store::open_in_memory().unwrap();
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();
        for turn in 0..21 {
            append_numbered_turn(&store, &session.id, turn);
        }

        let first = store.transcript_page(&session.id, None, 20).unwrap();
        assert_eq!(first.snapshot_through, Some(TranscriptCursor(41)));
        let live_seq = store
            .append_part(
                &session.id,
                Role::Agent,
                &Part::Text {
                    text: "live tail".into(),
                },
            )
            .unwrap();
        assert_eq!(live_seq, 42);
        assert!(first.entries.iter().all(|entry| entry.seq <= 41));

        let older = store
            .transcript_page(&session.id, first.next_before, 20)
            .unwrap();
        assert_eq!(page_user_numbers(&older), vec![0]);
        assert!(older
            .entries
            .iter()
            .all(|entry| entry.seq < first.next_before.unwrap().0));

        let refreshed = store.transcript_page(&session.id, None, 20).unwrap();
        assert_eq!(refreshed.snapshot_through, Some(TranscriptCursor(42)));
        assert_eq!(refreshed.entries.last().unwrap().seq, 42);
    }

    #[test]
    fn automatic_title_is_one_shot_and_manual_rename_wins() {
        let store = Store::open_in_memory().unwrap();
        let session = Session::new(ProviderId::Grok, "/work");
        store.upsert_session(&session).unwrap();

        assert!(store
            .set_initial_title(&session.id, "Search conversations")
            .unwrap());
        let automatic = store.get_session(&session.id).unwrap().unwrap();
        assert_eq!(automatic.title, "Search conversations");
        assert_eq!(automatic.title_origin, SessionTitleOrigin::Automatic);

        store.rename_session(&session.id, "My research").unwrap();
        assert!(!store
            .set_initial_title(&session.id, "Do not use this")
            .unwrap());
        let manual = store.get_session(&session.id).unwrap().unwrap();
        assert_eq!(manual.title, "My research");
        assert_eq!(manual.title_origin, SessionTitleOrigin::Manual);

        // A concurrent operation may still hold the pre-rename runtime snapshot. Generic upserts
        // update provider/session mechanics, never the title fields owned by the dedicated APIs.
        store.upsert_session(&automatic).unwrap();
        let after_stale_upsert = store.get_session(&session.id).unwrap().unwrap();
        assert_eq!(after_stale_upsert.title, "My research");
        assert_eq!(after_stale_upsert.title_origin, SessionTitleOrigin::Manual);
    }

    #[test]
    fn search_uses_canonical_prompts_coalesces_agent_chunks_and_deduplicates_sessions() {
        let store = Store::open_in_memory().unwrap();
        let mut a = Session::new(ProviderId::Grok, "/alpha");
        a.title = "Palette work".into();
        let mut b = Session::new(ProviderId::Codex, "/beta");
        b.title = "Archived percent bug".into();
        store.upsert_session(&a).unwrap();
        store.upsert_session(&b).unwrap();

        store
            .append_part(
                &a.id,
                Role::User,
                &Part::Prompt {
                    text: "Build conversation search for the command palette".into(),
                    display: "Build conversation search".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &a.id,
                Role::User,
                &Part::Text {
                    text: "hidden expanded project rule".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &a.id,
                Role::Agent,
                &Part::Reasoning {
                    text: "private reasoning needle".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &a.id,
                Role::Agent,
                &Part::Text {
                    text: "Index ".into(),
                },
            )
            .unwrap();
        store
            .append_part(
                &a.id,
                Role::Agent,
                &Part::ToolCall {
                    id: "tool".into(),
                    title: "secret tool needle".into(),
                    status: "completed".into(),
                    tool_kind: None,
                    agent_input: None,
                    outputs: Vec::new(),
                },
            )
            .unwrap();
        store
            .append_part(
                &a.id,
                Role::Agent,
                &Part::Text {
                    text: "migration safely".into(),
                },
            )
            .unwrap();
        assert!(store
            .search_sessions("index migration", 10)
            .unwrap()
            .is_empty());
        store.finalize_agent_search(&a.id).unwrap();

        store
            .append_part(
                &b.id,
                Role::User,
                &Part::Prompt {
                    text: "Fix the literal % wildcard in search".into(),
                    display: "Fix literal wildcard".into(),
                },
            )
            .unwrap();
        store.set_archived(&b.id, true).unwrap();

        let palette = store.search_sessions("palette", 10).unwrap();
        assert_eq!(palette.len(), 1, "one result per session");
        assert_eq!(palette[0].session_id, a.id);
        assert_eq!(palette[0].role, Role::User);

        let chunks = store.search_sessions("index migration", 10).unwrap();
        assert_eq!(chunks.len(), 1, "agent chunks form one searchable turn");
        assert_eq!(chunks[0].role, Role::Agent);
        assert!(chunks[0].snippet.contains("Index migration"));

        for excluded in ["expanded", "reasoning", "secret"] {
            assert!(
                store.search_sessions(excluded, 10).unwrap().is_empty(),
                "indexed {excluded}"
            );
        }

        let wildcard = store.search_sessions("%", 10).unwrap();
        assert_eq!(wildcard.len(), 1);
        assert_eq!(wildcard[0].session_id, b.id);
        assert!(wildcard[0].archived);
    }

    #[test]
    fn search_supports_cjk_incremental_prefixes_and_one_result_per_session() {
        let store = Store::open_in_memory().unwrap();
        let a = Session::new(ProviderId::Grok, "/alpha");
        let b = Session::new(ProviderId::Codex, "/beta");
        store.upsert_session(&a).unwrap();
        store.upsert_session(&b).unwrap();

        for index in 0..90 {
            store
                .append_part(
                    &a.id,
                    Role::User,
                    &Part::Prompt {
                        text: format!("conversation search repeated {index}"),
                        display: "repeat".into(),
                    },
                )
                .unwrap();
        }
        store
            .append_part(
                &b.id,
                Role::User,
                &Part::Prompt {
                    text: "调研并吸纳 conversation search".into(),
                    display: "中文搜索".into(),
                },
            )
            .unwrap();

        let prefix = store.search_sessions("convers", 10).unwrap();
        assert_eq!(
            prefix.len(),
            2,
            "a long session must not starve another match"
        );
        let cjk = store.search_sessions("吸纳", 10).unwrap();
        assert_eq!(cjk.len(), 1);
        assert_eq!(cjk[0].session_id, b.id);
    }

    #[test]
    fn prompt_projection_survives_file_reopen() {
        let path = std::env::temp_dir().join(format!("codetwo-search-{}.db", uuid::Uuid::new_v4()));
        let path_text = path.to_string_lossy().into_owned();
        let session = Session::new(ProviderId::Grok, "/work");
        {
            let store = Store::open(&path_text).unwrap();
            store.upsert_session(&session).unwrap();
            store
                .append_part(
                    &session.id,
                    Role::User,
                    &Part::Prompt {
                        text: "First line\n  preserved indent".into(),
                        display: "First line…".into(),
                    },
                )
                .unwrap();
        }
        let reopened = Store::open(&path_text).unwrap();
        let transcript = reopened.transcript(&session.id).unwrap();
        assert!(matches!(
            &transcript[0],
            (Role::User, Part::Prompt { text, .. }) if text == "First line\n  preserved indent"
        ));
        assert_eq!(reopened.search_sessions("preserved", 10).unwrap().len(), 1);
        drop(reopened);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn transcript_snapshot_drops_only_updates_superseded_by_a_later_terminal_in_the_turn() {
        let tool = |seq, status: &str, title: &str, metadata: bool| TranscriptEntry {
            seq,
            role: Role::Agent,
            part: Part::ToolCall {
                id: "call-1".into(),
                title: title.into(),
                status: status.into(),
                tool_kind: metadata.then(|| "agent".into()),
                agent_input: metadata.then(|| serde_json::json!({ "role": "researcher" })),
                outputs: Vec::new(),
            },
        };
        let mut entries = vec![
            TranscriptEntry {
                seq: 0,
                role: Role::User,
                part: Part::Text { text: "one".into() },
            },
            tool(1, "pending", "Delegate researcher", true),
            tool(2, "in_progress", "", false),
            tool(3, "completed", "", false),
            // Same identity after its completion is a new in-flight call and must survive.
            tool(4, "in_progress", "Next call", false),
            TranscriptEntry {
                seq: 5,
                role: Role::User,
                part: Part::Text { text: "two".into() },
            },
            // A later turn cannot supersede the prior turn's row.
            tool(6, "failed", "Other turn", false),
        ];
        let artifact = crate::artifact::ArtifactRef {
            id: "opaque-image-id".into(),
            mime_type: "image/png".into(),
            bytes: 128,
            width: 8,
            height: 8,
            display_name: "generated.png".into(),
        };
        if let Part::ToolCall { outputs, .. } = &mut entries[1].part {
            outputs.push(crate::artifact::ToolOutput::Image {
                artifact: artifact.clone(),
            });
        }

        let projected = drop_superseded_tool_updates(entries);
        assert_eq!(
            projected.iter().map(|entry| entry.seq).collect::<Vec<_>>(),
            vec![0, 3, 4, 5, 6]
        );
        let Part::ToolCall {
            title,
            status,
            tool_kind,
            agent_input,
            outputs,
            ..
        } = &projected[1].part
        else {
            panic!("terminal tool row")
        };
        assert_eq!(title, "Delegate researcher");
        assert_eq!(status, "completed");
        assert_eq!(tool_kind.as_deref(), Some("agent"));
        assert_eq!(
            agent_input,
            &Some(serde_json::json!({ "role": "researcher" }))
        );
        assert_eq!(
            outputs,
            &vec![crate::artifact::ToolOutput::Image { artifact }]
        );
    }

    #[test]
    fn transcript_snapshot_keeps_in_flight_updates_without_a_terminal() {
        let entries = vec![
            TranscriptEntry {
                seq: 0,
                role: Role::User,
                part: Part::Text { text: "run".into() },
            },
            TranscriptEntry {
                seq: 1,
                role: Role::Agent,
                part: Part::ToolCall {
                    id: "call".into(),
                    title: "Read".into(),
                    status: "pending".into(),
                    tool_kind: None,
                    agent_input: None,
                    outputs: Vec::new(),
                },
            },
            TranscriptEntry {
                seq: 2,
                role: Role::Agent,
                part: Part::ToolCall {
                    id: "call".into(),
                    title: "Read".into(),
                    status: "in_progress".into(),
                    tool_kind: None,
                    agent_input: None,
                    outputs: Vec::new(),
                },
            },
        ];

        assert_eq!(drop_superseded_tool_updates(entries).len(), 3);
    }

    #[test]
    fn migration_indexes_agent_text_but_not_legacy_compiled_user_prompts() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
               id TEXT PRIMARY KEY, title TEXT NOT NULL, provider TEXT NOT NULL, model TEXT,
               cwd TEXT NOT NULL, worktree_path TEXT, permission_mode TEXT NOT NULL,
               acp_session_id TEXT, created_at INTEGER NOT NULL
             );
             CREATE TABLE parts (
               session_id TEXT NOT NULL, seq INTEGER NOT NULL, role TEXT NOT NULL,
               part_json TEXT NOT NULL, PRIMARY KEY(session_id,seq)
             );",
        )
        .unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE parts_fts USING fts5(
               search_text,content='parts',content_rowid='rowid',tokenize='unicode61'
             );
             INSERT INTO schema_migrations(id) VALUES('session_search_v1');",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sessions
               (id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,created_at)
             VALUES ('legacy','Legacy','\"grok\"',NULL,'/work',NULL,'\"ask\"',NULL,1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO parts(session_id,seq,role,part_json) VALUES (?1,0,?2,?3)",
            rusqlite::params![
                "legacy",
                "\"user\"",
                serde_json::to_string(&Part::Text {
                    text: "private_file_rule_marker".into()
                })
                .unwrap(),
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO parts(session_id,seq,role,part_json) VALUES (?1,1,?2,?3)",
            rusqlite::params![
                "legacy",
                "\"agent\"",
                serde_json::to_string(&Part::Text {
                    text: "safe_agent_".into()
                })
                .unwrap(),
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO parts(session_id,seq,role,part_json) VALUES (?1,2,?2,?3)",
            rusqlite::params![
                "legacy",
                "\"agent\"",
                serde_json::to_string(&Part::Text {
                    text: "answer_marker".into()
                })
                .unwrap(),
            ],
        )
        .unwrap();

        migrate(&conn).unwrap();
        let store = Store {
            conn: Mutex::new(conn),
            artifact_root: None,
        };
        assert!(store
            .search_sessions("private_file_rule_marker", 10)
            .unwrap()
            .is_empty());
        assert_eq!(
            store
                .search_sessions("safe_agent_answer_marker", 10)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn canvas_freeze_rechecks_cas_after_validation_interleaving() {
        let store = Arc::new(Store::open_in_memory().unwrap());
        let gate = CanvasFeatureGate::enabled_for_tests();
        let draft = store
            .create_canvas_draft_with_gate(gate, "client-a", "Board", 1)
            .unwrap();
        let object = CanvasObject::new(
            "text-1",
            CanvasObjectKind::Text,
            CanvasRect {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            },
            0,
        );
        let update = CanvasDraftUpdate {
            title: "Board".into(),
            theme: CanvasTheme::Light,
            envelope: CanvasSceneEnvelope::new(
                draft.revision,
                CanvasTheme::Light,
                serde_json::json!({
                    "elements": [{"id": "text-1", "type": "text", "x": 0.0, "y": 0.0,
                        "width": 1.0, "height": 1.0, "text": "", "originalText": ""}],
                    "appState": {"activeTool": "selection"}
                }),
            ),
            manifest: CanvasManifest::new(vec![object.clone()]),
            assets: vec![],
        };
        let updated = store
            .update_canvas_draft_cas(&draft.id, "client-a", draft.revision, update, 2)
            .unwrap();
        let input = CanvasFreezeInput {
            title: updated.title.clone(),
            theme: updated.theme,
            envelope: updated.envelope.clone(),
            manifest: updated.manifest.clone(),
            assets: vec![],
            exports: vec![CanvasExport {
                id: "overview".into(),
                kind: CanvasExportKind::Overview,
                index: None,
                mime_type: "image/png".into(),
                width: 1,
                height: 1,
                bytes: vec![
                    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0,
                    0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156,
                    99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73,
                    69, 78, 68, 174, 66, 96, 130,
                ],
            }],
            now: 3,
        };
        let barrier = Arc::new(Barrier::new(2));
        set_canvas_freeze_test_barrier(Some(barrier.clone()));
        let worker_store = store.clone();
        let worker_id = draft.id.clone();
        let worker_input = input.clone();
        let worker = std::thread::spawn(move || {
            worker_store.freeze_canvas_with_gate(gate, &worker_id, "client-a", 2, worker_input)
        });

        // The worker has completed its first head read and is paused before validation. Advance the
        // mutable head, then release it to prove the final CAS check rejects the stale freeze.
        barrier.wait();
        let second_update = CanvasDraftUpdate {
            title: "Board v3".into(),
            theme: CanvasTheme::Light,
            envelope: CanvasSceneEnvelope::new(
                updated.revision,
                CanvasTheme::Light,
                serde_json::json!({
                    "elements": [{"id": "text-1", "type": "text", "x": 0.0, "y": 0.0,
                        "width": 1.0, "height": 1.0, "text": "", "originalText": ""}],
                    "appState": {"activeTool": "selection"}
                }),
            ),
            manifest: CanvasManifest::new(vec![object]),
            assets: vec![],
        };
        store
            .update_canvas_draft_cas(&draft.id, "client-a", 2, second_update, 4)
            .unwrap();
        barrier.wait();
        let result = worker.join().unwrap();
        set_canvas_freeze_test_barrier(None);
        assert!(
            matches!(result, Err(CanvasError::StaleRevision { .. })),
            "freeze result: {result:?}"
        );
        assert!(store
            .get_canvas_snapshot_frozen(&draft.id, 2)
            .unwrap()
            .is_none());
    }
}
