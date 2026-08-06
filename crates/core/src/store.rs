//! SQLite persistence for sessions and their transcripts.
//!
//! Mirrors opencode's model: a single `codetwo.db` under the platform data dir. Sessions are rows;
//! the transcript is a flat, ordered list of `parts` per session (simpler and more queryable than
//! codex's JSONL rollouts). Access is synchronous behind a `Mutex` — SQLite writes are fast and the
//! engine only touches the store at turn boundaries and per streamed part.

use std::sync::Mutex;

use rusqlite::Connection;
use thiserror::Error;

use crate::session::{MemoryAccess, Part, Role, Session};

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
  memory_read     TEXT NOT NULL DEFAULT 'inherit',
  memory_write    TEXT NOT NULL DEFAULT 'inherit',
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
  last_opened_at INTEGER NOT NULL,
  added_at       INTEGER NOT NULL DEFAULT 0
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
    pub(crate) conn: Mutex<Connection>,
}

/// Additive migrations for stores created by older versions. Each is ignored if already applied.
fn migrate(conn: &Connection) {
    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0", []);
    let _ = conn.execute(
        "ALTER TABLE sessions ADD COLUMN memory_read TEXT NOT NULL DEFAULT 'inherit'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE sessions ADD COLUMN memory_write TEXT NOT NULL DEFAULT 'inherit'",
        [],
    );
    // Ordering used to come from `last_opened_at`, which meant the rail resorted itself under the
    // cursor every time you clicked a project. Backfilling `added_at` from it keeps the order an
    // existing store already shows, and freezes it there.
    if conn.execute("ALTER TABLE projects ADD COLUMN added_at INTEGER NOT NULL DEFAULT 0", []).is_ok()
    {
        let _ = conn.execute("UPDATE projects SET added_at=last_opened_at", []);
    }
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
                "INSERT OR IGNORE INTO projects (path, name, last_opened_at, added_at)
                 VALUES (?1,?2,?3,?3)",
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
        crate::memory::install(&conn)?;
        let store = Self { conn: Mutex::new(conn) };
        // A delayed candidate may have become eligible while Code2 was closed.
        store.run_memory_maintenance()?;
        Ok(store)
    }

    /// In-memory store, used by tests.
    pub fn open_in_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA)?;
        migrate(&conn);
        crate::memory::install(&conn)?;
        let store = Self { conn: Mutex::new(conn) };
        store.run_memory_maintenance()?;
        Ok(store)
    }

    // ---- projects -----------------------------------------------------------------------------

    /// Known projects, most recently *added* first. Deliberately not use-order: the rail is a list
    /// you learn the shape of, and a list that reshuffles itself when you click it can't be learned.
    /// `path` breaks ties so that projects seeded from one migration still have a stable order.
    pub fn list_projects(&self) -> Result<Vec<Project>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT path, name, last_opened_at FROM projects ORDER BY added_at DESC, path ASC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Project { path: r.get(0)?, name: r.get(1)?, last_opened_at: r.get(2)? })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// Add a project, or re-open one already in the list. Adding a directory you already have is a
    /// normal thing to do by accident, so it re-opens rather than erroring or duplicating — and it
    /// keeps its original `added_at`, so re-adding doesn't move a row the user has learned to find.
    pub fn add_project(&self, path: &str, name: Option<&str>, now: i64) -> Result<(), StoreError> {
        let conn = self.conn.lock().unwrap();
        let name = name.map(|s| s.to_string()).unwrap_or_else(|| default_project_name(path));
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
               WHERE q.session_id = p.session_id AND q.part_json LIKE '%\"kind\":\"text\"%'
             )",
        )?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;

        let mut out = Vec::new();
        for row in rows.flatten() {
            let (id, json) = row;
            if let Ok(Part::Text { text }) = serde_json::from_str::<Part>(&json) {
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
            "SELECT id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,
                    memory_read,memory_write,created_at
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
               (id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,
                memory_read,memory_write,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
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
                s.memory_read.as_db(),
                s.memory_write.as_db(),
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
            "SELECT id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,
                    memory_read,memory_write,created_at
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

    /// Transcript with stable sequence ids, used to attach non-transcript turn metadata such as
    /// memory injection receipts after an app restart.
    pub fn transcript_with_seq(
        &self,
        session_id: &str,
    ) -> Result<Vec<(i64, Role, Part)>, StoreError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT seq,role,part_json FROM parts WHERE session_id=?1 ORDER BY seq",
        )?;
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
            out.push((seq, serde_json::from_str(&role)?, serde_json::from_str(&part)?));
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
    String,
    Option<String>,
    String,
    String,
    i64,
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
        memory_read: MemoryAccess::from_db(&c.8),
        memory_write: MemoryAccess::from_db(&c.9),
        created_at: c.10,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::ProviderId;

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
        let before: Vec<String> = store.list_projects().unwrap().into_iter().map(|p| p.path).collect();

        // Clicking the bottom row must not walk it to the top under the cursor.
        store.touch_project("/work/alpha", 300).unwrap();
        // Nor does re-adding a directory that's already listed.
        store.add_project("/work/alpha", None, 400).unwrap();

        let after = store.list_projects().unwrap();
        assert_eq!(after.iter().map(|p| p.path.clone()).collect::<Vec<_>>(), before);
        // The age on the row still tracks use, even though the position doesn't.
        assert_eq!(after.iter().find(|p| p.path == "/work/alpha").unwrap().last_opened_at, 400);
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
        migrate(&conn);
        let store = Store { conn: Mutex::new(conn) };

        let paths: Vec<String> = store.list_projects().unwrap().into_iter().map(|p| p.path).collect();
        assert_eq!(paths, ["/work/beta", "/work/alpha"]);

        store.touch_project("/work/alpha", 999).unwrap();
        let after: Vec<String> = store.list_projects().unwrap().into_iter().map(|p| p.path).collect();
        assert_eq!(after, paths, "frozen after the migration, not re-derived from use");
    }

    #[test]
    fn last_texts_returns_the_newest_text_per_session() {
        let store = Store::open_in_memory().unwrap();
        let a = Session::new(ProviderId::Grok, "/a");
        store.upsert_session(&a).unwrap();

        store.append_part(&a.id, Role::User, &Part::Text { text: "first".into() }).unwrap();
        store
            .append_part(&a.id, Role::Agent, &Part::Text { text: "  second\n  answer  ".into() })
            .unwrap();
        // A tool call lands last, but "ran a command" is not a conversation preview.
        store
            .append_part(
                &a.id,
                Role::Agent,
                &Part::ToolCall { id: "t".into(), title: "ls".into(), status: "completed".into() },
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
        store.append_part(&a.id, Role::Agent, &Part::Plan { entries: vec!["x".into()] }).unwrap();

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
        assert_eq!(store.get_session(&a.id).unwrap().unwrap().model.as_deref(), Some("grok-build"));

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
