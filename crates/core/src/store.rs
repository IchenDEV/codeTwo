//! SQLite persistence for sessions and their transcripts.
//!
//! Mirrors opencode's model: a single `codetwo.db` under the platform data dir. Sessions are rows;
//! the transcript is a flat, ordered list of `parts` per session (simpler and more queryable than
//! codex's JSONL rollouts). Access is synchronous behind a `Mutex` — SQLite writes are fast and the
//! engine only touches the store at turn boundaries and per streamed part.

use std::sync::Mutex;

use rusqlite::Connection;
use thiserror::Error;

use crate::session::{Part, Role, Session};

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("serde: {0}")]
    Serde(#[from] serde_json::Error),
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  provider        TEXT NOT NULL,
  model           TEXT,
  cwd             TEXT NOT NULL,
  worktree_path   TEXT,
  permission_mode TEXT NOT NULL,
  acp_session_id  TEXT,
  created_at      INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parts (
  session_id TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  role       TEXT NOT NULL,
  part_json  TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE INDEX IF NOT EXISTS parts_session ON parts(session_id, seq);
CREATE TABLE IF NOT EXISTS projects (
  path           TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  last_opened_at INTEGER NOT NULL
);
";

/// A workspace the user works in. Sessions belong to one by their `cwd`.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Project {
    /// Absolute path. Also the identity — one directory is one project.
    pub path: String,
    pub name: String,
    pub last_opened_at: i64,
}

pub struct Store {
    conn: Mutex<Connection>,
}

/// Additive migrations for stores created by older versions. Each is ignored if already applied.
fn migrate(conn: &Connection) {
    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0", []);
    // Stores that predate the projects table already hold the answer to "what projects are there?"
    // in the sessions they contain — seed from those rather than opening to an empty list on a
    // machine that's been in use for months. Names come from the path's last component, so the
    // list reads like a project list instead of a column of absolute paths.
    if let Ok(mut stmt) = conn.prepare("SELECT cwd, MAX(created_at) FROM sessions GROUP BY cwd") {
        let rows: Vec<(String, i64)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rs| rs.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();
        for (path, at) in rows {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO projects (path, name, last_opened_at) VALUES (?1,?2,?3)",
                rusqlite::params![path, default_project_name(&path), at],
            );
        }
    }
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
        migrate(&conn);
        Ok(Self { conn: Mutex::new(conn) })
    }

    /// In-memory store, used by tests.
    pub fn open_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA)?;
        migrate(&conn);
        Ok(Self { conn: Mutex::new(conn) })
    }

    // ---- projects -----------------------------------------------------------------------------

    /// Known projects, most recently opened first.
    pub fn list_projects(&self) -> Result<Vec<Project>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT path, name, last_opened_at FROM projects ORDER BY last_opened_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Project { path: r.get(0)?, name: r.get(1)?, last_opened_at: r.get(2)? })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Add a project, or bump an existing one to the top. Adding a directory you already have is a
    /// normal thing to do by accident, so it re-opens rather than erroring or duplicating.
    pub fn add_project(&self, path: &str, name: Option<&str>, now: i64) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        let name = name.map(|s| s.to_string()).unwrap_or_else(|| default_project_name(path));
        conn.execute(
            "INSERT INTO projects (path, name, last_opened_at) VALUES (?1,?2,?3)
             ON CONFLICT(path) DO UPDATE SET last_opened_at=excluded.last_opened_at",
            rusqlite::params![path, name, now],
        )?;
        Ok(())
    }

    /// Mark a project as the one just opened, so the list stays in use-order.
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
        conn.execute("UPDATE projects SET name=?2 WHERE path=?1", rusqlite::params![path, name])?;
        Ok(())
    }

    /// Forget a project. Its sessions are left alone — removing a project from the list is a
    /// bookkeeping act, not a request to delete months of transcripts.
    pub fn remove_project(&self, path: &str) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM projects WHERE path=?1", [path])?;
        Ok(())
    }

    /// Rename a session (the sidebar title).
    pub fn rename_session(&self, id: &str, title: &str) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE sessions SET title=?2 WHERE id=?1", rusqlite::params![id, title])?;
        Ok(())
    }

    /// Archive / unarchive a session (archived ones drop out of the main list).
    pub fn set_archived(&self, id: &str, archived: bool) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET archived=?2 WHERE id=?1",
            rusqlite::params![id, if archived { 1 } else { 0 }],
        )?;
        Ok(())
    }

    /// Archived sessions, newest first.
    pub fn list_archived_sessions(&self) -> Result<Vec<Session>, StoreError> {
        self.query_sessions(true)
    }

    fn query_sessions(&self, archived: bool) -> Result<Vec<Session>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,created_at
             FROM sessions WHERE archived=?1 ORDER BY created_at DESC",
        )?;
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
               (id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
             ON CONFLICT(id) DO UPDATE SET
               title=excluded.title, provider=excluded.provider, model=excluded.model,
               cwd=excluded.cwd, worktree_path=excluded.worktree_path,
               permission_mode=excluded.permission_mode, acp_session_id=excluded.acp_session_id",
            rusqlite::params![
                s.id,
                s.title,
                serde_json::to_string(&s.provider)?,
                s.model,
                s.cwd,
                s.worktree_path,
                serde_json::to_string(&s.permission_mode)?,
                s.acp_session_id,
                s.created_at,
            ],
        )?;
        Ok(())
    }

    /// Active (non-archived) sessions, newest first.
    pub fn list_sessions(&self) -> Result<Vec<Session>, StoreError> {
        self.query_sessions(false)
    }

    pub fn get_session(&self, id: &str) -> Result<Option<Session>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,created_at
             FROM sessions WHERE id=?1",
        )?;
        let mut rows = stmt.query_map([id], row_to_session_parts)?;
        match rows.next() {
            Some(r) => Ok(Some(build_session(r?)?)),
            None => Ok(None),
        }
    }

    /// Append one transcript part, returning its sequence number.
    pub fn append_part(&self, session_id: &str, role: Role, part: &Part) -> Result<i64, StoreError> {
        let conn = self.conn.lock().unwrap();
        let seq: i64 = conn.query_row(
            "SELECT COALESCE(MAX(seq), -1) + 1 FROM parts WHERE session_id=?1",
            [session_id],
            |r| r.get(0),
        )?;
        conn.execute(
            "INSERT INTO parts (session_id,seq,role,part_json) VALUES (?1,?2,?3,?4)",
            rusqlite::params![session_id, seq, serde_json::to_string(&role)?, serde_json::to_string(part)?],
        )?;
        Ok(seq)
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
            out.push((serde_json::from_str(&role_s)?, serde_json::from_str(&part_s)?));
        }
        Ok(out)
    }
}

/// Raw column tuple for a session row (JSON columns still stringified).
type SessionCols = (String, String, String, Option<String>, String, Option<String>, String, Option<String>, i64);

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
    ))
}

fn build_session(c: SessionCols) -> Result<Session, StoreError> {
    Ok(Session {
        id: c.0,
        title: c.1,
        provider: serde_json::from_str(&c.2)?,
        model: c.3,
        cwd: c.4,
        worktree_path: c.5,
        permission_mode: serde_json::from_str(&c.6)?,
        acp_session_id: c.7,
        created_at: c.8,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::ProviderId;

    #[test]
    fn projects_are_listed_in_use_order() {
        let store = Store::open_in_memory().unwrap();
        store.add_project("/work/alpha", None, 100).unwrap();
        store.add_project("/work/beta", None, 200).unwrap();

        let list = store.list_projects().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].path, "/work/beta", "most recently opened first");
        // A name defaults to the directory's own name, not the whole path.
        assert_eq!(list[0].name, "beta");

        store.touch_project("/work/alpha", 300).unwrap();
        assert_eq!(store.list_projects().unwrap()[0].path, "/work/alpha");
    }

    #[test]
    fn adding_a_known_project_reopens_it_rather_than_duplicating() {
        let store = Store::open_in_memory().unwrap();
        store.add_project("/work/alpha", Some("Alpha"), 100).unwrap();
        store.add_project("/work/alpha", None, 400).unwrap();

        let list = store.list_projects().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].last_opened_at, 400);
        // Re-adding must not clobber a name the user chose.
        assert_eq!(list[0].name, "Alpha");
    }

    #[test]
    fn removing_a_project_keeps_its_sessions() {
        let store = Store::open_in_memory().unwrap();
        let s = Session::new(ProviderId::Grok, "/work/alpha");
        store.upsert_session(&s).unwrap();
        store.add_project("/work/alpha", None, 100).unwrap();

        store.remove_project("/work/alpha").unwrap();
        assert!(store.list_projects().unwrap().is_empty());
        assert_eq!(store.list_sessions().unwrap().len(), 1, "transcripts are not the bookkeeping");
    }

    #[test]
    fn an_existing_store_seeds_projects_from_its_sessions() {
        // A store that predates the projects table shouldn't open to an empty picker.
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        let store = Store { conn: Mutex::new(conn) };
        let mut a = Session::new(ProviderId::Grok, "/work/alpha");
        a.created_at = 100;
        let mut b = Session::new(ProviderId::Grok, "/work/beta");
        b.created_at = 300;
        store.upsert_session(&a).unwrap();
        store.upsert_session(&b).unwrap();

        migrate(&store.conn.lock().unwrap());

        let list = store.list_projects().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].path, "/work/beta", "ordered by the newest session in each");
        assert_eq!(list[0].name, "beta");
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
        assert_eq!(store.get_session(&a.id).unwrap().unwrap().model.as_deref(), Some("grok-build"));
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
        assert_eq!(store.list_sessions().unwrap().len(), 1, "upsert must preserve archived");
    }

    #[test]
    fn transcript_appends_in_order() {
        let store = Store::open_in_memory().unwrap();
        let s = Session::new(ProviderId::Grok, "/a");
        store.upsert_session(&s).unwrap();

        store.append_part(&s.id, Role::User, &Part::Text { text: "hi".into() }).unwrap();
        store.append_part(&s.id, Role::Agent, &Part::Text { text: "hello".into() }).unwrap();
        store
            .append_part(&s.id, Role::Agent, &Part::ToolCall { id: "t1".into(), title: "ls".into(), status: "completed".into() })
            .unwrap();

        let t = store.transcript(&s.id).unwrap();
        assert_eq!(t.len(), 3);
        assert!(matches!(t[0], (Role::User, Part::Text { .. })));
        assert!(matches!(t[2], (Role::Agent, Part::ToolCall { .. })));
    }
}
