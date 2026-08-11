use std::fs;
use std::path::{Path, PathBuf};

use codetwo_core::work::WorkRunBinding;
use codetwo_core::{Part, ProviderId, Session, Store, StoreError, TaskStatus};
use rusqlite::Connection;
use tempfile::TempDir;

fn legacy_fixture(path: &Path) -> Connection {
    let connection = Connection::open(path).unwrap();
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .unwrap();
    connection
        .execute_batch(
            "CREATE TABLE sessions (
               id TEXT PRIMARY KEY,
               title TEXT NOT NULL,
               provider TEXT NOT NULL,
               model TEXT,
               cwd TEXT NOT NULL,
               worktree_path TEXT,
               permission_mode TEXT NOT NULL,
               acp_session_id TEXT,
               created_at INTEGER NOT NULL
             );
             CREATE TABLE parts (
               session_id TEXT NOT NULL,
               seq INTEGER NOT NULL,
               role TEXT NOT NULL,
               part_json TEXT NOT NULL,
               PRIMARY KEY (session_id, seq)
             );
             CREATE TABLE projects (
               path TEXT PRIMARY KEY,
               name TEXT NOT NULL,
               last_opened_at INTEGER NOT NULL
             );
             CREATE TABLE schema_migrations (id TEXT PRIMARY KEY);",
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO sessions
               (id,title,provider,model,cwd,worktree_path,permission_mode,acp_session_id,created_at)
             VALUES (?1,?2,?3,NULL,?4,NULL,?5,NULL,?6),
                    (?7,?8,?3,NULL,?9,?10,?5,NULL,?11),
                    (?12,?13,?3,NULL,?14,NULL,?5,NULL,?15)",
            rusqlite::params![
                "session-local",
                "Alpha",
                "\"grok\"",
                "/legacy/repo",
                "\"ask\"",
                100,
                "session-worktree",
                "",
                "/isolated/worktree",
                "/isolated/worktree",
                -4,
                "session-local-two",
                "Beta",
                "/legacy/repo",
                101,
            ],
        )
        .unwrap();
    let part = serde_json::to_string(&Part::Text {
        text: "legacy transcript".to_owned(),
    })
    .unwrap();
    connection
        .execute(
            "INSERT INTO parts(session_id,seq,role,part_json) VALUES(?1,1,?2,?3)",
            rusqlite::params!["session-local", "\"user\"", part],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO projects(path,name,last_opened_at) VALUES(?1,?2,?3)",
            rusqlite::params!["/legacy/repo", "Legacy repo", 100],
        )
        .unwrap();
    connection
}

fn table_exists(connection: &Connection, name: &str) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
            [name],
            |row| row.get(0),
        )
        .unwrap()
}

fn column_exists(connection: &Connection, table: &str, column: &str) -> bool {
    connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pragma_table_info(?1) WHERE name=?2)",
            rusqlite::params![table, column],
            |row| row.get(0),
        )
        .unwrap()
}

fn marker_count(connection: &Connection, marker: &str) -> i64 {
    connection
        .query_row(
            "SELECT COUNT(*) FROM work_schema_migrations WHERE id=?1",
            [marker],
            |row| row.get(0),
        )
        .unwrap()
}

fn binding(store: &Store, session_id: &str) -> WorkRunBinding {
    store.work_run_binding(session_id).unwrap().unwrap()
}

fn backup_hash(path: &Path) -> blake3::Hash {
    blake3::hash(&fs::read(path).unwrap())
}

fn high_water(path: &Path) -> i64 {
    Connection::open(path)
        .unwrap()
        .query_row(
            "SELECT high_water FROM work_revision_clock WHERE singleton=1",
            [],
            |row| row.get(0),
        )
        .unwrap()
}

#[test]
fn legacy_wal_backup_restore_and_idempotent_backfill() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("legacy.db");
    let fixture = legacy_fixture(&path);
    let wal_path = PathBuf::from(format!("{}-wal", path.display()));
    assert!(fs::metadata(&wal_path).unwrap().len() > 0);
    let part_before: String = fixture
        .query_row(
            "SELECT part_json FROM parts WHERE session_id='session-local'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    let store = Store::open(path.to_str().unwrap()).unwrap();
    drop(fixture);
    let backup = store.pre_work_store_v1_backup_path().unwrap();
    assert_eq!(
        backup,
        PathBuf::from(format!("{}.pre-work-store-v1.bak", path.display()))
    );
    assert!(backup.is_file());
    #[cfg(unix)]
    assert_eq!(
        std::os::unix::fs::PermissionsExt::mode(&fs::metadata(&backup).unwrap().permissions())
            & 0o777,
        0o600
    );

    let backup_connection = Connection::open(&backup).unwrap();
    let integrity: String = backup_connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    assert!(!table_exists(&backup_connection, "workspaces"));
    assert!(!table_exists(&backup_connection, "work_schema_migrations"));
    assert!(!column_exists(&backup_connection, "sessions", "pinned"));
    assert!(!column_exists(
        &backup_connection,
        "sessions",
        "project_path"
    ));
    assert!(!column_exists(
        &backup_connection,
        "sessions",
        "activity_json"
    ));
    assert!(!column_exists(&backup_connection, "sessions", "task_id"));
    assert!(!column_exists(&backup_connection, "sessions", "run_index"));
    let legacy_session: (String, String, i64) = backup_connection
        .query_row(
            "SELECT title,cwd,created_at FROM sessions WHERE id='session-local'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        legacy_session,
        ("Alpha".to_owned(), "/legacy/repo".to_owned(), 100)
    );
    let legacy_project: (String, String, i64) = backup_connection
        .query_row(
            "SELECT path,name,last_opened_at FROM projects WHERE path='/legacy/repo'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(
        legacy_project,
        ("/legacy/repo".to_owned(), "Legacy repo".to_owned(), 100)
    );
    let part_after: String = backup_connection
        .query_row(
            "SELECT part_json FROM parts WHERE session_id='session-local'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(part_after, part_before);

    let local_workspace = store
        .work_workspace_for_root("/legacy/repo")
        .unwrap()
        .unwrap();
    assert_eq!(local_workspace.name, "Legacy repo");
    let local_task = store
        .work_task_for_session("session-local")
        .unwrap()
        .unwrap();
    assert_eq!(local_task.status, TaskStatus::Active);
    assert_eq!(local_task.workspace_id, local_workspace.id);
    assert_eq!(local_task.title, "Alpha");
    let local_binding = binding(&store, "session-local");
    assert_eq!(local_binding.task_id, local_task.id);
    assert_eq!(local_binding.run_index, 1);
    assert!(store
        .work_workspace_for_root("/isolated/worktree")
        .unwrap()
        .is_none());
    let local_two_task = store
        .work_task_for_session("session-local-two")
        .unwrap()
        .unwrap();
    assert_eq!(local_two_task.workspace_id, local_task.workspace_id);
    assert_ne!(local_two_task.id, local_task.id);
    assert_eq!(binding(&store, "session-local-two").run_index, 1);
    let worktree_task = store
        .work_task_for_session("session-worktree")
        .unwrap()
        .unwrap();
    assert_ne!(worktree_task.workspace_id, local_task.workspace_id);
    assert_eq!(worktree_task.title, "Untitled task");
    assert_eq!(worktree_task.created_at, 0);
    assert_eq!(binding(&store, "session-worktree").run_index, 1);

    let live = Connection::open(&path).unwrap();
    assert_eq!(marker_count(&live, "work_foundation_v1"), 1);
    assert_eq!(marker_count(&live, "work_store_v1"), 1);
    let foreign_key_errors: i64 = live
        .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(foreign_key_errors, 0);
    let head_count: i64 = live
        .query_row("SELECT COUNT(*) FROM work_entity_heads", [], |row| {
            row.get(0)
        })
        .unwrap();
    let mutation_count: i64 = live
        .query_row("SELECT COUNT(*) FROM work_mutations", [], |row| row.get(0))
        .unwrap();
    assert_eq!((head_count, mutation_count), (8, 8));
    assert_eq!(high_water(&path), 8);
    let before_ids = (local_workspace.id, local_task.id, local_binding);
    let before_backup_hash = backup_hash(&backup);
    drop(live);
    drop(store);

    let reopened = Store::open(path.to_str().unwrap()).unwrap();
    assert_eq!(reopened.pre_work_store_v1_backup_path().unwrap(), backup);
    assert_eq!(backup_hash(&backup), before_backup_hash);
    let reopened_workspace = reopened
        .work_workspace_for_root("/legacy/repo")
        .unwrap()
        .unwrap();
    let reopened_task = reopened
        .work_task_for_session("session-local")
        .unwrap()
        .unwrap();
    assert_eq!(
        (reopened_workspace.id, reopened_task.id),
        (before_ids.0.clone(), before_ids.1.clone())
    );
    assert_eq!(binding(&reopened, "session-local"), before_ids.2);
    assert_eq!(high_water(&path), 8);
    drop(reopened);

    let restore_path = temporary.path().join("restored.db");
    fs::copy(&backup, &restore_path).unwrap();
    let restored = Store::open(restore_path.to_str().unwrap()).unwrap();
    assert_eq!(
        restored
            .work_workspace_for_root("/legacy/repo")
            .unwrap()
            .unwrap()
            .id,
        before_ids.0
    );
    assert_eq!(
        restored
            .work_task_for_session("session-local")
            .unwrap()
            .unwrap()
            .id,
        before_ids.1
    );
    assert_eq!(binding(&restored, "session-local"), before_ids.2);
    assert_eq!(high_water(&restore_path), 8);
}

#[test]
fn duplicate_legacy_bindings_are_repaired_before_unique_index_creation() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("duplicate.db");
    let fixture = legacy_fixture(&path);
    fixture
        .execute_batch(
            "ALTER TABLE sessions ADD COLUMN task_id TEXT;
             ALTER TABLE sessions ADD COLUMN run_index INTEGER NOT NULL DEFAULT 1;
             UPDATE sessions SET task_id='legacy-task',run_index=1;",
        )
        .unwrap();
    drop(fixture);

    let store = Store::open(path.to_str().unwrap()).unwrap();
    let mut indexes = vec![
        binding(&store, "session-local").run_index,
        binding(&store, "session-local-two").run_index,
        binding(&store, "session-worktree").run_index,
    ];
    indexes.sort_unstable();
    assert_eq!(indexes, vec![1, 2, 3]);
    assert_eq!(binding(&store, "session-local").task_id, "legacy-task");
    let connection = Connection::open(&path).unwrap();
    let index_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='sessions_work_task_run'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(index_count, 1);
}

#[test]
fn fresh_store_upsert_is_bound_without_backup() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("fresh.db");
    let store = Store::open(path.to_str().unwrap()).unwrap();
    assert!(store.pre_work_store_v1_backup_path().is_none());
    assert!(!path
        .with_file_name("fresh.db.pre-work-store-v1.bak")
        .exists());

    let session = Session::new(ProviderId::Grok, "/fresh/repo");
    store.upsert_session(&session).unwrap();
    let first_task = store.work_task_for_session(&session.id).unwrap().unwrap();
    let first_binding = binding(&store, &session.id);
    assert_eq!(first_task.status, TaskStatus::Active);
    assert_eq!(first_binding.run_index, 1);
    assert_eq!(
        store
            .work_workspace_for_root("/fresh/repo")
            .unwrap()
            .unwrap()
            .id,
        first_task.workspace_id
    );
    let high_water_before = high_water(&path);
    store.upsert_session(&session).unwrap();
    assert_eq!(high_water(&path), high_water_before);
    assert_eq!(
        store
            .work_task_for_session(&session.id)
            .unwrap()
            .unwrap()
            .id,
        first_task.id
    );
    assert_eq!(binding(&store, &session.id), first_binding);
}

#[test]
fn invalid_existing_backup_blocks_migration_before_schema_writes() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("blocked.db");
    let fixture = legacy_fixture(&path);
    drop(fixture);
    let backup = PathBuf::from(format!("{}.pre-work-store-v1.bak", path.display()));
    fs::write(&backup, b"not a sqlite database").unwrap();
    assert!(Store::open(path.to_str().unwrap()).is_err());

    let connection = Connection::open(&path).unwrap();
    assert!(!table_exists(&connection, "workspaces"));
    assert!(!table_exists(&connection, "work_schema_migrations"));
    assert!(!column_exists(&connection, "sessions", "pinned"));
    assert!(!column_exists(&connection, "sessions", "project_path"));
    assert!(!column_exists(&connection, "sessions", "activity_json"));
    assert!(!column_exists(&connection, "sessions", "task_id"));
    assert!(!column_exists(&connection, "sessions", "run_index"));
}

#[test]
fn session_and_binding_writes_roll_back_together_on_binding_failure() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("atomic.db");
    let store = Store::open(path.to_str().unwrap()).unwrap();
    Connection::open(&path)
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER reject_atomic_workspace
             BEFORE INSERT ON workspaces
             WHEN NEW.root_path='/atomic/failure'
             BEGIN
               SELECT RAISE(ABORT, 'forced binding failure');
             END;",
        )
        .unwrap();

    let session = Session::new(ProviderId::Grok, "/atomic/failure");
    let error = store.upsert_session(&session).unwrap_err();
    assert!(matches!(error, StoreError::Sqlite(_)));
    assert!(store.get_session(&session.id).unwrap().is_none());
    let connection = Connection::open(&path).unwrap();
    let sessions: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sessions WHERE id=?1",
            [&session.id],
            |row| row.get(0),
        )
        .unwrap();
    let tasks: i64 = connection
        .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
        .unwrap();
    assert_eq!((sessions, tasks), (0, 0));
}

#[test]
fn work_projection_rows_require_a_preintegration_backup() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("projection-only.db");
    drop(Store::open(path.to_str().unwrap()).unwrap());
    let connection = Connection::open(&path).unwrap();
    connection
        .execute(
            "DELETE FROM work_schema_migrations WHERE id='work_store_v1'",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO workspaces(id,name,root_path,kind,created_at,updated_at)
             VALUES('projection-workspace','Projection',NULL,'external',0,0)",
            [],
        )
        .unwrap();
    drop(connection);

    let store = Store::open(path.to_str().unwrap()).unwrap();
    let backup = store.pre_work_store_v1_backup_path().unwrap();
    let backup_connection = Connection::open(backup).unwrap();
    let workspaces: i64 = backup_connection
        .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))
        .unwrap();
    assert_eq!(workspaces, 1);
    assert_eq!(marker_count(&backup_connection, "work_store_v1"), 0);
}

#[test]
fn arbitrary_application_rows_require_a_preintegration_backup() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("application-row.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE app_projection(id INTEGER PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO app_projection(id,value) VALUES(7,'keep me');",
        )
        .unwrap();
    drop(connection);

    let store = Store::open(path.to_str().unwrap()).unwrap();
    let backup = store.pre_work_store_v1_backup_path().unwrap();
    let backup_connection = Connection::open(backup).unwrap();
    let row: (i64, String) = backup_connection
        .query_row("SELECT id,value FROM app_projection", [], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .unwrap();
    assert_eq!(row, (7, "keep me".to_owned()));
}

#[test]
fn metadata_only_singletons_do_not_require_a_backup() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("metadata-only.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE schema_migrations(id TEXT PRIMARY KEY);
             INSERT INTO schema_migrations(id) VALUES('base-v1');
             CREATE TABLE work_revision_clock(singleton INTEGER PRIMARY KEY, high_water INTEGER NOT NULL);
             INSERT INTO work_revision_clock(singleton,high_water) VALUES(1,0);
             CREATE TABLE memory_settings(
               singleton INTEGER PRIMARY KEY,
               enabled INTEGER NOT NULL,
               capture INTEGER NOT NULL,
               inject INTEGER NOT NULL,
               include_external_context INTEGER NOT NULL
             );
             INSERT INTO memory_settings(singleton,enabled,capture,inject,include_external_context)
             VALUES(1,1,1,1,1);",
        )
        .unwrap();
    drop(connection);

    let store = Store::open(path.to_str().unwrap()).unwrap();
    assert!(store.pre_work_store_v1_backup_path().is_none());
    assert!(!PathBuf::from(format!("{}.pre-work-store-v1.bak", path.display())).exists());
}

#[test]
fn reopening_a_work_v1_store_installs_additive_artifact_tables() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("work-v1.db");
    drop(Store::open(path.to_str().unwrap()).unwrap());
    let connection = Connection::open(&path).unwrap();
    assert_eq!(marker_count(&connection, "work_store_v1"), 1);
    connection.execute("DROP TABLE deliverables", []).unwrap();
    assert!(!table_exists(&connection, "deliverables"));
    drop(connection);

    drop(Store::open(path.to_str().unwrap()).unwrap());
    let reopened = Connection::open(&path).unwrap();
    assert!(table_exists(&reopened, "deliverables"));
    assert!(table_exists(&reopened, "run_snapshots"));
    let integrity: String = reopened
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
}

#[test]
fn customized_memory_settings_require_a_preintegration_backup() {
    let temporary = TempDir::new().unwrap();
    let path = temporary.path().join("custom-memory-settings.db");
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE memory_settings(
               singleton INTEGER PRIMARY KEY,
               enabled INTEGER NOT NULL,
               capture INTEGER NOT NULL,
               inject INTEGER NOT NULL,
               include_external_context INTEGER NOT NULL
             );
             INSERT INTO memory_settings(singleton,enabled,capture,inject,include_external_context)
             VALUES(1,0,1,1,1);",
        )
        .unwrap();
    drop(connection);

    let store = Store::open(path.to_str().unwrap()).unwrap();
    let backup = store.pre_work_store_v1_backup_path().unwrap();
    let backup_connection = Connection::open(backup).unwrap();
    let enabled: i64 = backup_connection
        .query_row(
            "SELECT enabled FROM memory_settings WHERE singleton=1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(enabled, 0);
}
