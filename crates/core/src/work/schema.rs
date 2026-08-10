use rusqlite::Transaction;

use crate::store::StoreError;

pub(crate) const SCHEMA_MARKER: &str = "work_foundation_v1";

const ENTITY_KINDS: &str = "'system','workspace','task','brief','run','snapshot','change','deliverable','template','automation','automation_run','memory_scope','memory','provider_capabilities'";

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 256),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 256),
  root_path TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('external','managed')),
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  updated_at INTEGER NOT NULL CHECK(updated_at >= created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_root_path
  ON workspaces(root_path) WHERE root_path IS NOT NULL;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 256),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 512),
  experience TEXT NOT NULL CHECK(experience IN ('code','work')),
  status TEXT NOT NULL CHECK(status IN ('draft','active','waiting','review','completed','failed','cancelled')),
  current_brief_revision INTEGER CHECK(current_brief_revision IS NULL OR current_brief_revision >= 1),
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  updated_at INTEGER NOT NULL CHECK(updated_at >= created_at),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1))
);
CREATE INDEX IF NOT EXISTS tasks_workspace ON tasks(workspace_id, archived, updated_at DESC);

CREATE TABLE IF NOT EXISTS brief_revisions (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 256),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  blocks_json TEXT NOT NULL,
  source TEXT NOT NULL CHECK(length(source) BETWEEN 1 AND 160),
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  UNIQUE(task_id, revision)
);
CREATE INDEX IF NOT EXISTS brief_revisions_task_revision
  ON brief_revisions(task_id, revision);

CREATE TABLE IF NOT EXISTS work_revision_clock (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  high_water INTEGER NOT NULL CHECK(high_water >= 0)
);
INSERT OR IGNORE INTO work_revision_clock(singleton, high_water) VALUES(1, 0);

CREATE TABLE IF NOT EXISTS work_entity_heads (
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ("#;

const SCHEMA_TAIL: &str = r#")),
  entity_id TEXT NOT NULL CHECK(length(entity_id) BETWEEN 1 AND 256),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  deleted INTEGER NOT NULL CHECK(deleted IN (0,1)),
  mutation_id INTEGER NOT NULL CHECK(mutation_id >= 1),
  updated_at INTEGER NOT NULL CHECK(updated_at >= 0),
  PRIMARY KEY(entity_kind, entity_id)
);

CREATE TABLE IF NOT EXISTS work_mutations (
  mutation_id INTEGER PRIMARY KEY CHECK(mutation_id >= 1),
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ("#;

const SCHEMA_END: &str = r#")),
  entity_id TEXT NOT NULL CHECK(length(entity_id) BETWEEN 1 AND 256),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  deleted INTEGER NOT NULL CHECK(deleted IN (0,1)),
  operation TEXT NOT NULL CHECK(length(operation) BETWEEN 1 AND 64),
  actor TEXT NOT NULL CHECK(length(actor) BETWEEN 1 AND 160),
  auth_subject TEXT NOT NULL CHECK(length(auth_subject) BETWEEN 1 AND 256),
  request_id TEXT NOT NULL CHECK(length(request_id) BETWEEN 1 AND 256),
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  UNIQUE(entity_kind, entity_id, revision),
  FOREIGN KEY(entity_kind, entity_id) REFERENCES work_entity_heads(entity_kind, entity_id)
);
CREATE INDEX IF NOT EXISTS work_mutations_entity_order
  ON work_mutations(entity_kind, entity_id, revision);
CREATE INDEX IF NOT EXISTS work_mutations_created_order
  ON work_mutations(created_at, mutation_id);
CREATE TRIGGER IF NOT EXISTS work_mutations_immutable_update
  BEFORE UPDATE ON work_mutations BEGIN
    SELECT RAISE(ABORT, 'work mutation history is immutable');
  END;
CREATE TRIGGER IF NOT EXISTS work_mutations_immutable_delete
  BEFORE DELETE ON work_mutations BEGIN
    SELECT RAISE(ABORT, 'work mutation history is immutable');
  END;

CREATE TABLE IF NOT EXISTS work_schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL CHECK(applied_at >= 0)
);
"#;

pub(crate) fn install(tx: &Transaction<'_>) -> Result<(), StoreError> {
    let sql = format!("{SCHEMA}{ENTITY_KINDS}{SCHEMA_TAIL}{ENTITY_KINDS}{SCHEMA_END}");
    tx.execute_batch(&sql)?;
    tx.execute(
        "INSERT OR IGNORE INTO work_schema_migrations(id, applied_at) VALUES(?1, ?2)",
        rusqlite::params![SCHEMA_MARKER, crate::work::ledger::now_millis()],
    )?;
    Ok(())
}
