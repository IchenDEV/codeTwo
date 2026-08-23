import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";

import {
  DEVICE_SYNC_SCHEMA_VERSION,
  type DeviceSyncDocument,
  type DeviceSyncEntity,
} from "./deviceSyncDocument";

type Row = Record<string, unknown>;

function jsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function bool(value: unknown): boolean {
  return Number(value ?? 0) !== 0;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const MEMORY_CATEGORIES = new Set([
  "constraint",
  "preference",
  "fact",
  "relationship",
  "event",
  "episode",
]);

function memoryCategory(value: string): string {
  if (!MEMORY_CATEGORIES.has(value))
    throw new Error("unsupported memory category");
  return value;
}

function redactMemoryEvidence(value: string): string {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY))\s*=\s*\S+/g,
      "$1=[REDACTED]",
    )
    .replace(
      /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
      "[REDACTED PRIVATE MATERIAL]",
    );
}

function partText(value: unknown): string {
  const part = jsonValue<Record<string, unknown>>(value, {});
  const content = text(part.text ?? part.display)
    .replace(/\s+/g, " ")
    .trim();
  return redactMemoryEvidence(content).slice(0, 600);
}

function optionalInterruptedActivity(value: unknown): Record<string, unknown> {
  const activity = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const revision = Number(activity.revision ?? 0) + 1;
  return {
    revision,
    state: {
      kind: "failed",
      reason: "interrupted",
      message: "Transferred to this device and ready to resume",
    },
  };
}

const BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  title_origin TEXT NOT NULL DEFAULT 'default',
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  transient INTEGER NOT NULL DEFAULT 0,
  activity_json TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  cwd TEXT NOT NULL,
  project_path TEXT,
  worktree_path TEXT,
  worktree_baseline_json TEXT,
  worktree_common_dir TEXT,
  worktree_git_dir TEXT,
  worktree_identity_json TEXT,
  worktree_discarded INTEGER NOT NULL DEFAULT 0,
  permission_mode TEXT NOT NULL,
  sandbox_policy TEXT NOT NULL DEFAULT '"workspace_write"',
  acp_session_id TEXT,
  memory_read TEXT NOT NULL DEFAULT 'inherit',
  memory_write TEXT NOT NULL DEFAULT 'inherit',
  handoff_epoch INTEGER NOT NULL DEFAULT 0,
  handoff_state TEXT NOT NULL DEFAULT 'active',
  handoff_id TEXT,
  handoff_context_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parts (
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  sync_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  part_json TEXT NOT NULL,
  search_text TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE INDEX IF NOT EXISTS parts_session ON parts(session_id, seq);
CREATE TABLE IF NOT EXISTS projects (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_opened_at INTEGER NOT NULL,
  added_at INTEGER NOT NULL DEFAULT 0,
  default_worktree_mode TEXT,
  icon_path TEXT,
  icon_updated_at INTEGER NOT NULL DEFAULT 0,
  default_provider TEXT,
  default_model TEXT,
  default_reasoning_effort TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS memory_settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  capture INTEGER NOT NULL DEFAULT 1,
  inject INTEGER NOT NULL DEFAULT 1,
  include_external_context INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO memory_settings(singleton) VALUES(1);
CREATE TABLE IF NOT EXISTS memory_project_settings (
  project_path TEXT PRIMARY KEY,
  capture TEXT NOT NULL DEFAULT 'inherit',
  inject TEXT NOT NULL DEFAULT 'inherit',
  include_external_context TEXT NOT NULL DEFAULT 'inherit'
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  session_id TEXT,
  layer TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0.9,
  sources_json TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  accessed_at INTEGER,
  access_count INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'automatic',
  forgotten_at INTEGER,
  supersedes_id TEXT,
  conflict_with_id TEXT,
  conflict_reason TEXT,
  scope_id TEXT,
  scope_kind TEXT
);
CREATE INDEX IF NOT EXISTS memories_project_activity
  ON memories(project_path,active,pinned,accessed_at,updated_at);
CREATE TABLE IF NOT EXISTS memory_receipts (
  session_id TEXT NOT NULL,
  user_part_seq INTEGER NOT NULL,
  project_path TEXT NOT NULL,
  query TEXT NOT NULL,
  estimated_tokens INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(session_id, user_part_seq)
);
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  project_path TEXT NOT NULL,
  provider TEXT NOT NULL,
  cron TEXT NOT NULL,
  timezone TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  use_worktree INTEGER NOT NULL DEFAULT 1,
  permission_mode TEXT NOT NULL,
  sandbox_policy TEXT NOT NULL,
  next_run_at INTEGER,
  last_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL,
  scheduled_for INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  error TEXT
);
CREATE TABLE IF NOT EXISTS sync_tombstones (
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY(entity, entity_id)
);
`;

export interface NewSessionInput {
  provider: string;
  model: string | null;
  cwd: string;
  permissionMode: string;
  sandboxPolicy: string;
  transient?: boolean;
}

export class BunDatabase {
  readonly path: string;
  private readonly db: Database;

  constructor(readonly dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.path = join(dataDir, "codetwo.db");
    this.db = new Database(this.path, { create: true, strict: true });
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    this.db.exec(BASE_SCHEMA);
    this.migrateSessionLifecycle();
    this.migrateProjectProfiles();
    this.migrateMemoryManagement();
    this.migrateHandoffs();
    this.migrateDeviceSync();
  }

  private migrateSessionLifecycle(): void {
    try {
      this.db.exec("ALTER TABLE sessions ADD COLUMN transient INTEGER NOT NULL DEFAULT 0");
    } catch (error) {
      if (!String(error).toLowerCase().includes("duplicate column")) throw error;
    }
    // A renderer or process crash may bypass the normal host shutdown path. Side chats are
    // intentionally app-lifetime data, so the next host start is the final cleanup boundary.
    this.purgeTransientSessions();
  }

  private migrateProjectProfiles(): void {
    const additions = [
      "ALTER TABLE projects ADD COLUMN icon_path TEXT",
      "ALTER TABLE projects ADD COLUMN icon_updated_at INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE projects ADD COLUMN default_provider TEXT",
      "ALTER TABLE projects ADD COLUMN default_model TEXT",
      "ALTER TABLE projects ADD COLUMN default_reasoning_effort TEXT",
    ];
    for (const statement of additions) {
      try {
        this.db.exec(statement);
      } catch (error) {
        if (!String(error).toLowerCase().includes("duplicate column")) throw error;
      }
    }
  }

  private migrateMemoryManagement(): void {
    const additions = [
      "ALTER TABLE memories ADD COLUMN origin TEXT NOT NULL DEFAULT 'automatic'",
      "ALTER TABLE memories ADD COLUMN forgotten_at INTEGER",
      "ALTER TABLE memories ADD COLUMN supersedes_id TEXT",
      "ALTER TABLE memories ADD COLUMN conflict_with_id TEXT",
      "ALTER TABLE memories ADD COLUMN conflict_reason TEXT",
    ];
    for (const statement of additions) {
      try {
        this.db.exec(statement);
      } catch (error) {
        if (!String(error).toLowerCase().includes("duplicate column"))
          throw error;
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_project_settings (
        project_path TEXT PRIMARY KEY,
        capture TEXT NOT NULL DEFAULT 'inherit',
        inject TEXT NOT NULL DEFAULT 'inherit',
        include_external_context TEXT NOT NULL DEFAULT 'inherit'
      );
      CREATE INDEX IF NOT EXISTS memories_project_activity
        ON memories(project_path,active,pinned,accessed_at,updated_at);
      UPDATE memories SET origin=CASE
        WHEN layer='L3' THEN 'profile'
        WHEN session_id IS NULL AND sources_json='[]' THEN 'manual'
        ELSE origin
      END
      WHERE origin='automatic';
    `);
  }

  private migrateHandoffs(): void {
    const additions = [
      "ALTER TABLE sessions ADD COLUMN handoff_epoch INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE sessions ADD COLUMN handoff_state TEXT NOT NULL DEFAULT 'active'",
      "ALTER TABLE sessions ADD COLUMN handoff_id TEXT",
      "ALTER TABLE sessions ADD COLUMN handoff_context_json TEXT",
    ];
    for (const statement of additions) {
      try {
        this.db.exec(statement);
      } catch (error) {
        if (!String(error).toLowerCase().includes("duplicate column")) throw error;
      }
    }
  }

  private migrateDeviceSync(): void {
    const additions = [
      "ALTER TABLE sessions ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE parts ADD COLUMN sync_id TEXT",
      "ALTER TABLE parts ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE projects ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0",
    ];
    for (const statement of additions) {
      try {
        this.db.exec(statement);
      } catch (error) {
        if (!String(error).toLowerCase().includes("duplicate column")) throw error;
      }
    }
    this.db.exec(`
      UPDATE sessions SET updated_at=created_at WHERE updated_at=0;
      UPDATE projects SET updated_at=MAX(last_opened_at,added_at) WHERE updated_at=0;
      UPDATE parts SET sync_id=session_id || ':' || seq WHERE sync_id IS NULL OR sync_id='';
      UPDATE parts SET created_at=(
        SELECT sessions.created_at + parts.seq FROM sessions WHERE sessions.id=parts.session_id
      ) WHERE created_at=0;
      CREATE UNIQUE INDEX IF NOT EXISTS parts_sync_id ON parts(sync_id);
      CREATE TABLE IF NOT EXISTS sync_tombstones (
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        deleted_at INTEGER NOT NULL,
        PRIMARY KEY(entity, entity_id)
      );
    `);
  }

  close(): void {
    this.db.close(false);
  }

  listProjects(): unknown[] {
    return this.db
      .query(
        `SELECT path,name,last_opened_at,default_worktree_mode,icon_path,icon_updated_at,
                default_provider,default_model,default_reasoning_effort
         FROM projects ORDER BY added_at DESC,path ASC`,
      )
      .all()
      .map((row) => ({
        path: text((row as Row).path),
        name: text((row as Row).name),
        last_opened_at: Number((row as Row).last_opened_at ?? 0),
        default_worktree_mode: nullableText((row as Row).default_worktree_mode),
        has_icon: nullableText((row as Row).icon_path) !== null,
        icon_updated_at: Number((row as Row).icon_updated_at ?? 0),
        default_provider: nullableText((row as Row).default_provider),
        default_model: nullableText((row as Row).default_model),
        default_reasoning_effort: nullableText((row as Row).default_reasoning_effort),
      }));
  }

  addProject(path: string, name?: string | null): string {
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO projects(path,name,last_opened_at,added_at,updated_at) VALUES(?,?,?,?,?)
         ON CONFLICT(path) DO UPDATE SET last_opened_at=excluded.last_opened_at,updated_at=excluded.updated_at`,
      )
      .run(path, name?.trim() || basename(path) || path, now, now, now);
    this.clearTombstone("project", path);
    return path;
  }

  touchProject(path: string): void {
    const now = Date.now();
    this.db.query("UPDATE projects SET last_opened_at=?,updated_at=? WHERE path=?").run(now, now, path);
  }

  renameProject(path: string, name: string): void {
    const normalized = name.trim();
    if (!normalized || normalized.length > 80) {
      throw new Error("project name must be between 1 and 80 characters");
    }
    this.db.query("UPDATE projects SET name=?,updated_at=? WHERE path=?").run(normalized, Date.now(), path);
  }

  setProjectWorktreeMode(path: string, mode: string | null): void {
    this.db.query("UPDATE projects SET default_worktree_mode=?,updated_at=? WHERE path=?").run(mode, Date.now(), path);
  }

  setProjectAgentDefaults(
    path: string,
    provider: string | null,
    model: string | null,
    reasoningEffort: string | null,
  ): void {
    const allowedEfforts = new Set(["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
    if (reasoningEffort && !allowedEfforts.has(reasoningEffort)) {
      throw new Error("unsupported project reasoning effort");
    }
    this.db
      .query(
        "UPDATE projects SET default_provider=?,default_model=?,default_reasoning_effort=? WHERE path=?",
      )
      .run(provider, provider ? model : null, provider ? reasoningEffort : null, path);
  }

  projectIconPath(path: string): string | null {
    const row = this.db.query("SELECT icon_path FROM projects WHERE path=?").get(path) as Row | null;
    return row ? nullableText(row.icon_path) : null;
  }

  setProjectIcon(path: string, iconPath: string | null, updatedAt: number): number {
    const row = this.db.query("SELECT icon_updated_at FROM projects WHERE path=?").get(path) as Row | null;
    const revision = Math.max(updatedAt, Number(row?.icon_updated_at ?? 0) + 1);
    this.db
      .query("UPDATE projects SET icon_path=?,icon_updated_at=? WHERE path=?")
      .run(iconPath, revision, path);
    return revision;
  }

  removeProject(path: string): void {
    const run = this.db.transaction(() => {
      this.recordTombstone("project", path);
      this.db.query("DELETE FROM projects WHERE path=?").run(path);
    });
    run();
  }

  listSessions(archived = false): unknown[] {
    const order = archived ? "created_at DESC" : "pinned DESC,created_at DESC";
    const rows = this.db
      .query(
        `SELECT id,title,title_origin,pinned,transient,activity_json,provider,model,cwd,project_path,
                worktree_path,worktree_baseline_json,worktree_identity_json,worktree_discarded,
                permission_mode,sandbox_policy,acp_session_id,memory_read,memory_write,
                handoff_epoch,handoff_state,handoff_id,handoff_context_json,created_at
         FROM sessions WHERE archived=? AND transient=0 AND handoff_state!='accepted' ORDER BY ${order}`,
      )
      .all(archived ? 1 : 0) as Row[];
    return rows.map((row) => this.sessionFromRow(row));
  }

  getSession(id: string): Record<string, unknown> | null {
    const row = this.db
      .query(
        `SELECT id,title,title_origin,pinned,transient,activity_json,provider,model,cwd,project_path,
                worktree_path,worktree_baseline_json,worktree_identity_json,worktree_discarded,
                permission_mode,sandbox_policy,acp_session_id,memory_read,memory_write,
                handoff_epoch,handoff_state,handoff_id,handoff_context_json,created_at
         FROM sessions WHERE id=?`,
      )
      .get(id) as Row | null;
    return row ? this.sessionFromRow(row) : null;
  }

  createSession(input: NewSessionInput): Record<string, unknown> {
    const id = crypto.randomUUID();
    const activity = { revision: 0, state: { kind: "idle" } };
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO sessions(
         id,title,title_origin,pinned,archived,transient,activity_json,provider,model,cwd,project_path,
           worktree_path,worktree_discarded,permission_mode,sandbox_policy,acp_session_id,
           memory_read,memory_write,created_at,updated_at
         ) VALUES(?,?,'default',0,0,?,?,?,?,?,?,NULL,0,?,?,NULL,'inherit','inherit',?,?)`,
      )
      .run(
        id,
        "Untitled session",
        input.transient ? 1 : 0,
        JSON.stringify(activity),
        JSON.stringify(input.provider),
        input.model,
        input.cwd,
        input.cwd,
        JSON.stringify(input.permissionMode),
        JSON.stringify(input.sandboxPolicy),
        now,
        now,
      );
    const session = this.getSession(id);
    if (!session) throw new Error("could not read newly created session");
    return session;
  }

  deleteTransientSession(id: string): boolean {
    const remove = this.db.transaction((sessionId: string) => {
      const row = this.db
        .query("SELECT transient FROM sessions WHERE id=?")
        .get(sessionId) as Row | null;
      if (!row || !bool(row.transient)) return false;
      this.db.query("DELETE FROM memory_receipts WHERE session_id=?").run(sessionId);
      this.db.query("DELETE FROM memories WHERE session_id=?").run(sessionId);
      this.db.query("DELETE FROM parts WHERE session_id=?").run(sessionId);
      return this.db.query("DELETE FROM sessions WHERE id=? AND transient=1").run(sessionId)
        .changes > 0;
    });
    return remove(id);
  }

  purgeTransientSessions(): number {
    const rows = this.db.query("SELECT id FROM sessions WHERE transient=1").all() as Row[];
    let removed = 0;
    for (const row of rows) {
      if (this.deleteTransientSession(text(row.id))) removed += 1;
    }
    return removed;
  }

  updateAcpSession(id: string, acpSessionId: string): void {
    this.db.query("UPDATE sessions SET acp_session_id=? WHERE id=?").run(acpSessionId, id);
  }

  updateModel(id: string, model: string): void {
    this.db.query("UPDATE sessions SET model=?,updated_at=? WHERE id=?").run(model, Date.now(), id);
  }

  updatePolicy(id: string, mode: string, sandbox: string): void {
    this.db
      .query("UPDATE sessions SET permission_mode=?,sandbox_policy=?,updated_at=? WHERE id=?")
      .run(JSON.stringify(mode), JSON.stringify(sandbox), Date.now(), id);
  }

  setSessionMemoryPolicy(id: string, read: string, write: string): void {
    const allowed = new Set(["inherit", "allow", "deny"]);
    if (!allowed.has(read)) throw new Error("read must be inherit, allow, or deny");
    if (!allowed.has(write)) throw new Error("write must be inherit, allow, or deny");
    this.db
      .query("UPDATE sessions SET memory_read=?,memory_write=?,updated_at=? WHERE id=?")
      .run(read, write, Date.now(), id);
  }

  updateActivity(id: string, activity: unknown): void {
    this.db.query("UPDATE sessions SET activity_json=? WHERE id=?").run(JSON.stringify(activity), id);
  }

  assertSessionActive(id: string): void {
    const row = this.db.query("SELECT handoff_state FROM sessions WHERE id=?").get(id) as Row | null;
    if (!row) throw new Error(`session not found: ${id}`);
    if (text(row.handoff_state, "active") !== "active") {
      throw new Error(`session ${id} is fenced by a task handoff`);
    }
  }

  prepareHandoff(id: string, handoffId: string): { epoch: number; session: Record<string, unknown>; parts: unknown[] } {
    const prepare = this.db.transaction(() => {
      const row = this.db
        .query("SELECT handoff_epoch,handoff_state FROM sessions WHERE id=?")
        .get(id) as Row | null;
      if (!row) throw new Error(`session not found: ${id}`);
      if (text(row.handoff_state, "active") !== "active") throw new Error("session already has a handoff in progress");
      const epoch = Number(row.handoff_epoch ?? 0) + 1;
      this.db
        .query("UPDATE sessions SET handoff_epoch=?,handoff_state='prepared',handoff_id=? WHERE id=?")
        .run(epoch, handoffId, id);
      return epoch;
    });
    const epoch = prepare();
    const session = this.getSession(id);
    if (!session) throw new Error(`session not found after handoff prepare: ${id}`);
    const parts = (this.db
      .query("SELECT seq,role,part_json FROM parts WHERE session_id=? ORDER BY seq ASC")
      .all(id) as Row[]).map((row) => ({
      seq: Number(row.seq),
      role: text(row.role),
      part: jsonValue(row.part_json, { kind: "text", text: "" }),
    }));
    return { epoch, session, parts };
  }

  commitSourceHandoff(id: string, handoffId: string, epoch: number): void {
    const changed = this.db
      .query(
        `UPDATE sessions SET handoff_state='transferred',archived=1,pinned=0
         WHERE id=? AND handoff_id=? AND handoff_epoch=? AND handoff_state='prepared'`,
      )
      .run(id, handoffId, epoch).changes;
    if (changed !== 1) throw new Error("source handoff fence no longer matches");
  }

  rollbackSourceHandoff(id: string, handoffId: string, epoch: number): void {
    const changed = this.db
      .query(
        `UPDATE sessions SET handoff_state='active',handoff_id=NULL,archived=0
         WHERE id=? AND handoff_id=? AND handoff_epoch=? AND handoff_state IN ('prepared','transferred')`,
      )
      .run(id, handoffId, epoch).changes;
    if (changed !== 1) throw new Error("source handoff cannot be rolled back from its current state");
  }

  acceptHandoff(input: {
    handoffId: string;
    epoch: number;
    session: Record<string, unknown>;
    parts: unknown[];
    cwd: string;
    context: unknown;
  }): void {
    const accept = this.db.transaction(() => {
      const id = text(input.session.id);
      if (!id) throw new Error("handoff session id is missing");
      const existing = this.db.query("SELECT handoff_id,handoff_epoch,handoff_state FROM sessions WHERE id=?").get(id) as Row | null;
      if (existing) {
        if (
          text(existing.handoff_id) === input.handoffId
          && Number(existing.handoff_epoch) === input.epoch
          && text(existing.handoff_state) === "accepted"
        ) return;
        throw new Error(`destination already contains session ${id}`);
      }
      const activity = optionalInterruptedActivity(input.session.activity);
      this.db.query(
        `INSERT INTO sessions(
          id,title,title_origin,pinned,archived,transient,activity_json,provider,model,cwd,project_path,
          worktree_path,worktree_baseline_json,worktree_common_dir,worktree_git_dir,
          worktree_identity_json,worktree_discarded,permission_mode,sandbox_policy,acp_session_id,
          memory_read,memory_write,handoff_epoch,handoff_state,handoff_id,handoff_context_json,
          created_at,updated_at
        ) VALUES(?,?,?,?,0,0,?,?,?,?,?,NULL,NULL,NULL,NULL,NULL,0,?,?,?,?,?,?,'accepted',?,?,?,?)`,
      ).run(
        id,
        text(input.session.title, "Untitled session"),
        text(input.session.title_origin, "default"),
        bool(input.session.pinned) ? 1 : 0,
        JSON.stringify(activity),
        JSON.stringify(input.session.provider ?? "codex"),
        nullableText(input.session.model),
        input.cwd,
        input.cwd,
        JSON.stringify(input.session.permission_mode ?? "ask"),
        JSON.stringify(input.session.sandbox_policy ?? "workspace_write"),
        nullableText(input.session.acp_session_id),
        text(input.session.memory_read, "inherit"),
        text(input.session.memory_write, "inherit"),
        input.epoch,
        input.handoffId,
        JSON.stringify(input.context),
        Number(input.session.created_at ?? Date.now()),
        Number(input.session.updated_at ?? input.session.created_at ?? Date.now()),
      );
      const insert = this.db.query(
        "INSERT INTO parts(session_id,seq,sync_id,role,part_json,search_text,created_at) VALUES(?,?,?,?,?,?,?)",
      );
      for (const value of input.parts) {
        const part = value && typeof value === "object" ? value as Row : {};
        const role = text(part.role);
        if (role !== "user" && role !== "agent") throw new Error("handoff transcript role is invalid");
        const payload = part.part ?? { kind: "text", text: "" };
        const seq = Number(part.seq);
        insert.run(
          id,
          seq,
          `${id}:${seq}`,
          role,
          JSON.stringify(payload),
          partText(JSON.stringify(payload)) || null,
          Number(input.session.created_at ?? Date.now()) + seq,
        );
      }
    });
    accept();
  }

  activateTargetHandoff(id: string, handoffId: string, epoch: number): void {
    const changed = this.db
      .query(
        `UPDATE sessions SET handoff_state='active'
         WHERE id=? AND handoff_id=? AND handoff_epoch=? AND handoff_state='accepted'`,
      )
      .run(id, handoffId, epoch).changes;
    if (changed !== 1) {
      const current = this.db.query("SELECT handoff_id,handoff_epoch,handoff_state FROM sessions WHERE id=?").get(id) as Row | null;
      if (current && text(current.handoff_id) === handoffId && Number(current.handoff_epoch) === epoch && text(current.handoff_state) === "active") return;
      throw new Error("target handoff fence no longer matches");
    }
  }

  rollbackTargetHandoff(id: string, handoffId: string, epoch: number): void {
    const rollback = this.db.transaction(() => {
      const row = this.db.query("SELECT handoff_id,handoff_epoch,handoff_state FROM sessions WHERE id=?").get(id) as Row | null;
      if (!row) return;
      if (text(row.handoff_id) !== handoffId || Number(row.handoff_epoch) !== epoch) {
        throw new Error("target handoff fence no longer matches");
      }
      if (text(row.handoff_state) !== "accepted") throw new Error("an active target handoff cannot be rolled back automatically");
      this.db.query("DELETE FROM parts WHERE session_id=?").run(id);
      this.db.query("DELETE FROM sessions WHERE id=?").run(id);
    });
    rollback();
  }

  clearHandoffContext(id: string): void {
    this.db.query("UPDATE sessions SET handoff_context_json=NULL WHERE id=?").run(id);
  }

  renameSession(id: string, title: string, origin = "manual"): void {
    this.db.query("UPDATE sessions SET title=?,title_origin=?,updated_at=? WHERE id=?").run(title, origin, Date.now(), id);
  }

  setSessionFlag(id: string, field: "archived" | "pinned", value: boolean): void {
    if (field === "archived") {
      this.db
        .query("UPDATE sessions SET archived=?,pinned=CASE WHEN ?=1 THEN 0 ELSE pinned END,updated_at=? WHERE id=?")
        .run(value ? 1 : 0, value ? 1 : 0, Date.now(), id);
      return;
    }
    this.db.query("UPDATE sessions SET pinned=?,updated_at=? WHERE id=? AND archived=0").run(value ? 1 : 0, Date.now(), id);
  }

  appendPart(sessionId: string, role: "user" | "agent", part: unknown, searchText?: string): number {
    const current = this.db
      .query("SELECT COALESCE(MAX(seq),0) AS seq FROM parts WHERE session_id=?")
      .get(sessionId) as Row;
    const seq = Number(current.seq ?? 0) + 1;
    const now = Date.now();
    this.db
      .query("INSERT INTO parts(session_id,seq,sync_id,role,part_json,search_text,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(sessionId, seq, crypto.randomUUID(), role, JSON.stringify(part), searchText ?? null, now);
    this.db.query("UPDATE sessions SET updated_at=? WHERE id=?").run(now, sessionId);
    return seq;
  }

  sessionPreviews(): [string, string][] {
    const rows = this.db
      .query(
        `SELECT p.session_id,p.part_json FROM parts p
         JOIN sessions s ON s.id=p.session_id AND s.transient=0
         WHERE p.seq=(
           SELECT MAX(q.seq) FROM parts q
           WHERE q.session_id=p.session_id
             AND json_extract(q.part_json,'$.kind') IN ('text','prompt')
         )`,
      )
      .all() as Row[];
    return rows.flatMap((row) => {
      const part = jsonValue<Record<string, unknown>>(row.part_json, {});
      const value = text(part.text ?? part.display).replace(/\s+/g, " ").trim().slice(0, 160);
      return value ? [[text(row.session_id), value] as [string, string]] : [];
    });
  }

  transcriptPage(sessionId: string, before: number | null, limit: number): unknown {
    const boundary = before ?? Number.MAX_SAFE_INTEGER;
    const rows = this.db
      .query(
        `SELECT seq,role,part_json FROM parts
         WHERE session_id=? AND seq<? ORDER BY seq DESC LIMIT 1000`,
      )
      .all(sessionId, boundary) as Row[];
    const selected: Row[] = [];
    let userTurns = 0;
    for (const row of rows) {
      const part = jsonValue<Record<string, unknown>>(row.part_json, {});
      if (row.role === "user" && (part.kind === "prompt" || part.kind === "text")) {
        userTurns += 1;
        if (userTurns > Math.max(1, Math.min(limit, 50))) break;
      }
      selected.push(row);
    }
    selected.reverse();
    const entries = selected.map((row) => ({
      seq: Number(row.seq),
      role: text(row.role) as "user" | "agent",
      part: jsonValue(row.part_json, { kind: "text", text: "" }),
    }));
    const firstUser = entries.find((entry) => entry.role === "user")?.seq ?? null;
    const older = firstUser === null
      ? false
      : Boolean(
          this.db
            .query("SELECT 1 AS found FROM parts WHERE session_id=? AND seq<? LIMIT 1")
            .get(sessionId, firstUser),
        );
    const snapshot = this.db
      .query("SELECT MAX(seq) AS seq FROM parts WHERE session_id=?")
      .get(sessionId) as Row;
    return {
      entries,
      next_before: older ? firstUser : null,
      snapshot_through: snapshot.seq == null ? null : Number(snapshot.seq),
    };
  }

  searchSessions(query: string, limit: number): unknown[] {
    const needle = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    return (this.db
      .query(
        `SELECT s.id AS session_id,s.title,s.cwd,s.archived,p.role,p.search_text,p.seq
         FROM parts p JOIN sessions s ON s.id=p.session_id
         WHERE s.transient=0 AND p.search_text LIKE ? ESCAPE '\\'
         ORDER BY p.seq DESC LIMIT ?`,
      )
      .all(needle, Math.max(1, Math.min(limit, 200))) as Row[]).map((row) => ({
      session_id: text(row.session_id),
      title: text(row.title),
      cwd: text(row.cwd),
      archived: bool(row.archived),
      role: text(row.role),
      snippet: text(row.search_text).slice(0, 320),
      seq: Number(row.seq ?? 0),
    }));
  }

  memorySettings(): Record<string, boolean> {
    const row = this.db.query("SELECT * FROM memory_settings WHERE singleton=1").get() as Row | null;
    return {
      enabled: bool(row?.enabled ?? 1),
      capture: bool(row?.capture ?? 1),
      inject: bool(row?.inject ?? 1),
      include_external_context: bool(row?.include_external_context ?? 1),
    };
  }

  setMemorySettings(settings: Record<string, unknown>): void {
    this.db
      .query(
        `UPDATE memory_settings SET enabled=?,capture=?,inject=?,include_external_context=?
         WHERE singleton=1`,
      )
      .run(
        settings.enabled ? 1 : 0,
        settings.capture ? 1 : 0,
        settings.inject ? 1 : 0,
        settings.include_external_context ? 1 : 0,
      );
  }

  memoryProjectPolicy(projectPath: string): Record<string, string> {
    const row = this.db
      .query("SELECT * FROM memory_project_settings WHERE project_path=?")
      .get(projectPath) as Row | null;
    return {
      project_path: projectPath,
      capture: text(row?.capture, "inherit"),
      inject: text(row?.inject, "inherit"),
      include_external_context: text(row?.include_external_context, "inherit"),
    };
  }

  setMemoryProjectPolicy(
    projectPath: string,
    policy: Record<string, unknown>,
  ): void {
    const allowed = new Set(["inherit", "allow", "deny"]);
    const value = (key: string) => {
      const candidate = text(policy[key], "inherit");
      if (!allowed.has(candidate))
        throw new Error(`${key} must be inherit, allow, or deny`);
      return candidate;
    };
    this.db
      .query(
        `INSERT INTO memory_project_settings(project_path,capture,inject,include_external_context)
         VALUES(?,?,?,?) ON CONFLICT(project_path) DO UPDATE SET
           capture=excluded.capture,
           inject=excluded.inject,
           include_external_context=excluded.include_external_context`,
      )
      .run(
        projectPath,
        value("capture"),
        value("inject"),
        value("include_external_context"),
      );
  }

  listMemories(projectPath: string, limit: number, query?: string): unknown[] {
    const where = query
      ? "project_path=? AND active=1 AND content LIKE ? ESCAPE '\\'"
      : "project_path=? AND active=1";
    const params: (string | number)[] = [projectPath];
    if (query) params.push(`%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
    params.push(Math.max(1, Math.min(limit, 500)));
    return (this.db
      .query(
        `SELECT * FROM memories WHERE ${where}
         ORDER BY pinned DESC,updated_at DESC LIMIT ?`,
      )
      .all(...params) as Row[]).map((row) => this.memoryFromRow(row));
  }

  listManagedMemories(projectPath: string, limit: number): unknown[] {
    return (
      this.db
        .query(
          `SELECT * FROM memories WHERE project_path=?
         ORDER BY CASE WHEN conflict_with_id IS NOT NULL THEN 0 ELSE 1 END,
                  active DESC,pinned DESC,
                  MAX(COALESCE(accessed_at,0),updated_at) DESC LIMIT ?`,
        )
        .all(projectPath, Math.max(1, Math.min(limit, 500))) as Row[]
    ).map((row) => this.memoryFromRow(row));
  }

  memoryStats(projectPath: string): Record<string, number> {
    const rows = this.db
      .query("SELECT layer,COUNT(*) AS count FROM memories WHERE project_path=? AND active=1 GROUP BY layer")
      .all(projectPath) as Row[];
    const stats = {
      l0: 0,
      l1: 0,
      l2: 0,
      l3: 0,
      pending: 0,
      active: 0,
      pinned: 0,
      recent: 0,
      forgotten: 0,
      conflicts: 0,
    };
    for (const row of rows) {
      const key = text(row.layer).toLowerCase() as keyof typeof stats;
      if (key in stats) stats[key] = Number(row.count ?? 0);
    }
    const summary = this.db
      .query(
        `SELECT
           SUM(CASE WHEN active=1 AND layer!='L3' THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN active=1 AND pinned=1 AND layer!='L3' THEN 1 ELSE 0 END) AS pinned,
           SUM(CASE WHEN active=1 AND accessed_at>=? AND layer!='L3' THEN 1 ELSE 0 END) AS recent,
           SUM(CASE WHEN active=0 AND forgotten_at IS NOT NULL THEN 1 ELSE 0 END) AS forgotten,
           SUM(CASE WHEN conflict_with_id IS NOT NULL THEN 1 ELSE 0 END) AS conflicts
         FROM memories WHERE project_path=?`,
      )
      .get(Date.now() - 30 * 24 * 60 * 60 * 1000, projectPath) as Row | null;
    stats.active = Number(summary?.active ?? 0);
    stats.pinned = Number(summary?.pinned ?? 0);
    stats.recent = Number(summary?.recent ?? 0);
    stats.forgotten = Number(summary?.forgotten ?? 0);
    stats.conflicts = Number(summary?.conflicts ?? 0);
    return stats;
  }

  addMemory(projectPath: string, category: string, content: string, pinned: boolean): unknown {
    if (!content.trim()) throw new Error("memory content is required");
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO memories(
          id,project_path,session_id,layer,category,content,keywords_json,confidence,
          sources_json,pinned,active,created_at,updated_at,access_count,origin
        ) VALUES(?,?,NULL,'L1',?,?,'[]',1.0,'[]',?,1,?,?,0,'manual')`,
      )
      .run(
        id,
        projectPath,
        memoryCategory(category),
        content.trim(),
        pinned ? 1 : 0,
        now,
        now,
      );
    const row = this.db.query("SELECT * FROM memories WHERE id=?").get(id) as Row;
    return this.memoryFromRow(row);
  }

  setMemoryFlag(id: string, field: "pinned" | "active", value: boolean): void {
    const now = Date.now();
    if (field === "active") {
      this.db
        .query(
          "UPDATE memories SET active=?,forgotten_at=?,updated_at=? WHERE id=?",
        )
        .run(value ? 1 : 0, value ? null : now, now, id);
      return;
    }
    this.db
      .query("UPDATE memories SET pinned=?,updated_at=? WHERE id=?")
      .run(value ? 1 : 0, now, id);
  }

  updateMemory(id: string, category: string, content: string): unknown {
    if (!content.trim()) throw new Error("memory content is required");
    const row = this.db
      .query("SELECT origin FROM memories WHERE id=?")
      .get(id) as Row | null;
    if (!row) throw new Error("memory not found");
    if (!new Set(["manual", "user_correction"]).has(text(row.origin))) {
      throw new Error(
        "automatic memory must be corrected instead of overwritten",
      );
    }
    this.db
      .query("UPDATE memories SET category=?,content=?,updated_at=? WHERE id=?")
      .run(memoryCategory(category), content.trim(), Date.now(), id);
    return this.memoryFromRow(
      this.db.query("SELECT * FROM memories WHERE id=?").get(id) as Row,
    );
  }

  setMemoryCategory(id: string, category: string): unknown {
    this.db
      .query("UPDATE memories SET category=?,updated_at=? WHERE id=?")
      .run(memoryCategory(category), Date.now(), id);
    const row = this.db
      .query("SELECT * FROM memories WHERE id=?")
      .get(id) as Row | null;
    if (!row) throw new Error("memory not found");
    return this.memoryFromRow(row);
  }

  correctMemory(id: string, category: string, content: string): unknown {
    if (!content.trim()) throw new Error("memory content is required");
    const run = this.db.transaction(() => {
      const original = this.db
        .query("SELECT * FROM memories WHERE id=?")
        .get(id) as Row | null;
      if (!original) throw new Error("memory not found");
      if (text(original.layer) === "L3")
        throw new Error("project profile is regenerated from stable memories");
      const now = Date.now();
      const correctionId = crypto.randomUUID();
      this.db
        .query(
          "UPDATE memories SET active=0,forgotten_at=?,updated_at=? WHERE id=?",
        )
        .run(now, now, id);
      this.db
        .query(
          `INSERT INTO memories(
             id,project_path,session_id,layer,category,content,keywords_json,confidence,
             sources_json,pinned,active,created_at,updated_at,access_count,origin,supersedes_id
           ) VALUES(?,?,NULL,'L1',?,?,'[]',1.0,?,1,1,?,?,0,'user_correction',?)`,
        )
        .run(
          correctionId,
          text(original.project_path),
          memoryCategory(category),
          content.trim(),
          text(original.sources_json, "[]"),
          now,
          now,
          id,
        );
      return this.memoryFromRow(
        this.db
          .query("SELECT * FROM memories WHERE id=?")
          .get(correctionId) as Row,
      );
    });
    return run();
  }

  deleteMemory(id: string): void {
    const run = this.db.transaction(() => {
      this.recordTombstone("memory", id);
      const receipts = this.db
        .query("SELECT rowid,items_json FROM memory_receipts")
        .all() as Row[];
      for (const receipt of receipts) {
        const items = jsonValue<Record<string, unknown>[]>(
          receipt.items_json,
          [],
        );
        const kept = items.filter((item) => item.id !== id);
        if (kept.length !== items.length) {
          if (kept.length === 0) {
            this.db
              .query("DELETE FROM memory_receipts WHERE rowid=?")
              .run(Number(receipt.rowid));
          } else {
            this.db
              .query("UPDATE memory_receipts SET items_json=? WHERE rowid=?")
              .run(JSON.stringify(kept), Number(receipt.rowid));
          }
        }
      }
      this.db
        .query("UPDATE memories SET supersedes_id=NULL WHERE supersedes_id=?")
        .run(id);
      this.db
        .query(
          "UPDATE memories SET conflict_with_id=NULL,conflict_reason=NULL WHERE conflict_with_id=?",
        )
        .run(id);
      this.db.query("DELETE FROM memories WHERE id=?").run(id);
    });
    run();
  }

  memoryEvidence(id: string, reveal = false): unknown[] {
    const row = this.db
      .query("SELECT sources_json FROM memories WHERE id=?")
      .get(id) as Row | null;
    if (!row) return [];
    const sources = jsonValue<{ session_id: string; part_seq: number }[]>(
      row.sources_json,
      [],
    );
    return sources.map((source) => {
      const evidence = this.db
        .query(
          `SELECT s.title,s.created_at,p.part_json FROM sessions s
           LEFT JOIN parts p ON p.session_id=s.id AND p.seq=? WHERE s.id=?`,
        )
        .get(source.part_seq, source.session_id) as Row | null;
      const part = jsonValue<Record<string, unknown>>(evidence?.part_json, {});
      const rawExcerpt = text(part.text ?? part.display)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600);
      return {
        session_id: source.session_id,
        session_title: text(evidence?.title, source.session_id.slice(0, 8)),
        part_seq: source.part_seq,
        created_at: Number(evidence?.created_at ?? 0),
        excerpt: evidence?.part_json
          ? reveal
            ? rawExcerpt
            : partText(evidence.part_json)
          : "",
        available: Boolean(evidence?.part_json),
        redacted: !reveal,
      };
    });
  }

  memoryUsages(id: string): unknown[] {
    const rows = this.db
      .query(
        `SELECT r.session_id,r.user_part_seq,r.created_at,s.title,r.items_json
         FROM memory_receipts r LEFT JOIN sessions s ON s.id=r.session_id
         ORDER BY r.created_at DESC`,
      )
      .all() as Row[];
    return rows.flatMap((row) => {
      const used = jsonValue<Record<string, unknown>[]>(
        row.items_json,
        [],
      ).some((item) => item.id === id);
      return used
        ? [
            {
              session_id: text(row.session_id),
              session_title: text(row.title, text(row.session_id).slice(0, 8)),
              user_part_seq: Number(row.user_part_seq ?? 0),
              created_at: Number(row.created_at ?? 0),
            },
          ]
        : [];
    });
  }

  memoryReceipts(sessionId: string): unknown[] {
    return (this.db
      .query("SELECT * FROM memory_receipts WHERE session_id=? ORDER BY user_part_seq")
      .all(sessionId) as Row[]).map((row) => ({
      session_id: text(row.session_id),
      user_part_seq: Number(row.user_part_seq ?? 0),
      project_path: text(row.project_path),
      query: text(row.query),
      estimated_tokens: Number(row.estimated_tokens ?? 0),
      items: jsonValue(row.items_json, []),
      created_at: Number(row.created_at ?? 0),
    }));
  }

  listAutomations(): unknown[] {
    return (this.db.query("SELECT * FROM automations ORDER BY created_at DESC").all() as Row[]).map((row) =>
      this.automationFromRow(row),
    );
  }

  createAutomation(input: Record<string, unknown>): unknown {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO automations(
          id,name,prompt,project_path,provider,cron,timezone,enabled,use_worktree,
          permission_mode,sandbox_policy,next_run_at,last_run_at,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?)`,
      )
      .run(
        id,
        text(input.name),
        text(input.prompt),
        text(input.projectPath ?? input.project_path),
        JSON.stringify(input.provider ?? "codex"),
        text(input.cron),
        text(input.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone),
        input.enabled === false ? 0 : 1,
        input.useWorktree === false || input.use_worktree === false ? 0 : 1,
        JSON.stringify(input.permissionMode ?? input.permission_mode ?? "ask"),
        JSON.stringify(input.sandboxPolicy ?? input.sandbox_policy ?? "workspace_write"),
        now,
        now,
      );
    return this.getAutomation(id);
  }

  updateAutomation(id: string, input: Record<string, unknown>): unknown {
    this.db
      .query(
        `UPDATE automations SET name=?,prompt=?,project_path=?,provider=?,cron=?,timezone=?,
          enabled=?,use_worktree=?,permission_mode=?,sandbox_policy=?,updated_at=? WHERE id=?`,
      )
      .run(
        text(input.name),
        text(input.prompt),
        text(input.projectPath ?? input.project_path),
        JSON.stringify(input.provider ?? "codex"),
        text(input.cron),
        text(input.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone),
        input.enabled === false ? 0 : 1,
        input.useWorktree === false || input.use_worktree === false ? 0 : 1,
        JSON.stringify(input.permissionMode ?? input.permission_mode ?? "ask"),
        JSON.stringify(input.sandboxPolicy ?? input.sandbox_policy ?? "workspace_write"),
        Date.now(),
        id,
      );
    return this.getAutomation(id);
  }

  setAutomationEnabled(id: string, enabled: boolean): unknown {
    this.db.query("UPDATE automations SET enabled=?,updated_at=? WHERE id=?").run(enabled ? 1 : 0, Date.now(), id);
    return this.getAutomation(id);
  }

  deleteAutomation(id: string): boolean {
    return this.db.query("DELETE FROM automations WHERE id=?").run(id).changes > 0;
  }

  automationRuns(automationId: string | null, limit: number): unknown[] {
    const sql = automationId
      ? "SELECT * FROM automation_runs WHERE automation_id=? ORDER BY started_at DESC LIMIT ?"
      : "SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT ?";
    const rows = automationId
      ? this.db.query(sql).all(automationId, limit)
      : this.db.query(sql).all(limit);
    return (rows as Row[]).map((row) => ({
      id: text(row.id),
      automation_id: text(row.automation_id),
      session_id: nullableText(row.session_id),
      status: text(row.status),
      scheduled_for: Number(row.scheduled_for ?? 0),
      started_at: Number(row.started_at ?? 0),
      finished_at: row.finished_at == null ? null : Number(row.finished_at),
      error: nullableText(row.error),
    }));
  }

  deviceSyncSnapshot(deviceId: string): DeviceSyncDocument {
    const projects = (this.db.query(
      `SELECT path,name,last_opened_at,added_at,default_worktree_mode,updated_at
       FROM projects`,
    ).all() as Row[]).map((row) => ({
      path: text(row.path),
      name: text(row.name),
      last_opened_at: Number(row.last_opened_at ?? 0),
      added_at: Number(row.added_at ?? 0),
      default_worktree_mode: nullableText(row.default_worktree_mode),
      updated_at: Number(row.updated_at ?? 0),
    }));
    const sessions = (this.db.query(
      `SELECT id,title,title_origin,pinned,archived,provider,model,cwd,project_path,
              permission_mode,sandbox_policy,memory_read,memory_write,created_at,updated_at
       FROM sessions WHERE transient=0`,
    ).all() as Row[]).map((row) => ({
      id: text(row.id),
      title: text(row.title, "Untitled session"),
      title_origin: text(row.title_origin, "default"),
      pinned: bool(row.pinned),
      archived: bool(row.archived),
      provider: text(row.provider, '"codex"'),
      model: nullableText(row.model),
      cwd: text(row.cwd),
      project_path: nullableText(row.project_path),
      permission_mode: text(row.permission_mode, '"ask"'),
      sandbox_policy: text(row.sandbox_policy, '"workspace_write"'),
      memory_read: text(row.memory_read, "inherit"),
      memory_write: text(row.memory_write, "inherit"),
      created_at: Number(row.created_at ?? 0),
      updated_at: Number(row.updated_at ?? row.created_at ?? 0),
    }));
    const parts = (this.db.query(
      `SELECT p.sync_id,p.session_id,p.seq,p.role,p.part_json,p.search_text,p.created_at
       FROM parts p JOIN sessions s ON s.id=p.session_id WHERE s.transient=0`,
    ).all() as Row[]).map((row) => ({
      sync_id: text(row.sync_id),
      session_id: text(row.session_id),
      seq: Number(row.seq ?? 0),
      role: text(row.role),
      part_json: text(row.part_json, "{}"),
      search_text: nullableText(row.search_text),
      created_at: Number(row.created_at ?? 0),
    }));
    // L3 profiles and evidence receipts are derived locally. The synced copy keeps the durable
    // memory itself, but not raw evidence pointers whose transcript sequence can diverge after an
    // offline merge.
    const memories = (this.db.query(
      `SELECT id,project_path,session_id,layer,category,content,keywords_json,confidence,
              pinned,active,created_at,updated_at,origin,forgotten_at,supersedes_id,
              conflict_with_id,conflict_reason
       FROM memories
       WHERE layer!='L3' AND (
         session_id IS NULL OR session_id IN (SELECT id FROM sessions WHERE transient=0)
       )`,
    ).all() as Row[]).map((row) => ({
      id: text(row.id),
      project_path: text(row.project_path),
      session_id: nullableText(row.session_id),
      layer: text(row.layer),
      category: text(row.category),
      content: text(row.content),
      keywords_json: text(row.keywords_json, "[]"),
      confidence: Number(row.confidence ?? 0),
      pinned: bool(row.pinned),
      active: bool(row.active),
      created_at: Number(row.created_at ?? 0),
      updated_at: Number(row.updated_at ?? 0),
      origin: text(row.origin, "automatic"),
      forgotten_at: row.forgotten_at == null ? null : Number(row.forgotten_at),
      supersedes_id: nullableText(row.supersedes_id),
      conflict_with_id: nullableText(row.conflict_with_id),
      conflict_reason: nullableText(row.conflict_reason),
    }));
    const tombstones: DeviceSyncDocument["tombstones"] = (this.db.query(
      "SELECT entity,entity_id,deleted_at FROM sync_tombstones",
    ).all() as Row[]).flatMap<DeviceSyncDocument["tombstones"][number]>((row) => {
      const entity = text(row.entity);
      return entity === "project" || entity === "memory"
        ? [{ entity, id: text(row.entity_id), deleted_at: Number(row.deleted_at ?? 0) }]
        : [];
    });

    return {
      schema_version: DEVICE_SYNC_SCHEMA_VERSION,
      revision: 0,
      generated_at: Date.now(),
      writer_device_id: deviceId,
      projects,
      sessions,
      parts,
      memories,
      tombstones,
    };
  }

  importDeviceSyncDocument(document: DeviceSyncDocument): {
    projects: number;
    sessions: number;
    parts: number;
    memories: number;
  } {
    const counts = { projects: 0, sessions: 0, parts: 0, memories: 0 };
    const run = this.db.transaction(() => {
      for (const tombstone of document.tombstones) {
        this.recordTombstone(tombstone.entity, tombstone.id, tombstone.deleted_at);
        if (tombstone.entity === "project") {
          this.db.query("DELETE FROM projects WHERE path=? AND updated_at<=?")
            .run(tombstone.id, tombstone.deleted_at);
        } else {
          this.db.query("DELETE FROM memories WHERE id=? AND updated_at<=?")
            .run(tombstone.id, tombstone.deleted_at);
        }
      }

      for (const project of document.projects) {
        const current = this.db.query("SELECT updated_at FROM projects WHERE path=?").get(project.path) as Row | null;
        if (current && Number(current.updated_at ?? 0) >= project.updated_at) continue;
        this.db.query(
          `INSERT INTO projects(path,name,last_opened_at,added_at,default_worktree_mode,updated_at)
           VALUES(?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET
             name=excluded.name,last_opened_at=excluded.last_opened_at,added_at=excluded.added_at,
             default_worktree_mode=excluded.default_worktree_mode,updated_at=excluded.updated_at`,
        ).run(
          project.path,
          project.name,
          project.last_opened_at,
          project.added_at,
          project.default_worktree_mode,
          project.updated_at,
        );
        this.clearTombstoneIfOlder("project", project.path, project.updated_at);
        counts.projects += 1;
      }

      for (const session of document.sessions) {
        const current = this.db.query("SELECT updated_at FROM sessions WHERE id=?").get(session.id) as Row | null;
        if (current && Number(current.updated_at ?? 0) >= session.updated_at) continue;
        if (current) {
          this.db.query(
            `UPDATE sessions SET title=?,title_origin=?,pinned=?,archived=?,provider=?,model=?,cwd=?,
               project_path=?,permission_mode=?,sandbox_policy=?,memory_read=?,memory_write=?,
               created_at=?,updated_at=? WHERE id=?`,
          ).run(
            session.title,
            session.title_origin,
            session.pinned ? 1 : 0,
            session.archived ? 1 : 0,
            session.provider,
            session.model,
            session.cwd,
            session.project_path,
            session.permission_mode,
            session.sandbox_policy,
            session.memory_read,
            session.memory_write,
            session.created_at,
            session.updated_at,
            session.id,
          );
        } else {
          this.db.query(
            `INSERT INTO sessions(
              id,title,title_origin,pinned,archived,activity_json,provider,model,cwd,project_path,
              worktree_path,worktree_discarded,permission_mode,sandbox_policy,acp_session_id,
              memory_read,memory_write,created_at,updated_at
            ) VALUES(?,?,?,?,?,'{"revision":0,"state":{"kind":"idle"}}',?,?,?,?,NULL,0,?,?,NULL,?,?,?,?)`,
          ).run(
            session.id,
            session.title,
            session.title_origin,
            session.pinned ? 1 : 0,
            session.archived ? 1 : 0,
            session.provider,
            session.model,
            session.cwd,
            session.project_path,
            session.permission_mode,
            session.sandbox_policy,
            session.memory_read,
            session.memory_write,
            session.created_at,
            session.updated_at,
          );
        }
        counts.sessions += 1;
      }

      for (const part of document.parts) {
        if (this.db.query("SELECT 1 AS found FROM parts WHERE sync_id=?").get(part.sync_id)) continue;
        if (!this.db.query("SELECT 1 AS found FROM sessions WHERE id=?").get(part.session_id)) continue;
        const row = this.db.query("SELECT COALESCE(MAX(seq),0) AS seq FROM parts WHERE session_id=?")
          .get(part.session_id) as Row;
        this.db.query(
          `INSERT INTO parts(session_id,seq,sync_id,role,part_json,search_text,created_at)
           VALUES(?,?,?,?,?,?,?)`,
        ).run(
          part.session_id,
          Number(row.seq ?? 0) + 1,
          part.sync_id,
          part.role,
          part.part_json,
          part.search_text,
          part.created_at,
        );
        counts.parts += 1;
      }

      for (const memory of document.memories) {
        const current = this.db.query("SELECT updated_at FROM memories WHERE id=?").get(memory.id) as Row | null;
        if (current && Number(current.updated_at ?? 0) >= memory.updated_at) continue;
        this.db.query(
          `INSERT INTO memories(
             id,project_path,session_id,layer,category,content,keywords_json,confidence,
             sources_json,pinned,active,created_at,updated_at,access_count,origin,forgotten_at,
             supersedes_id,conflict_with_id,conflict_reason
           ) VALUES(?,?,?,?,?,?,?,?,'[]',?,?,?,?,0,?,?,?,?,?)
           ON CONFLICT(id) DO UPDATE SET
             project_path=excluded.project_path,session_id=excluded.session_id,layer=excluded.layer,
             category=excluded.category,content=excluded.content,keywords_json=excluded.keywords_json,
             confidence=excluded.confidence,pinned=excluded.pinned,active=excluded.active,
             created_at=excluded.created_at,updated_at=excluded.updated_at,origin=excluded.origin,
             forgotten_at=excluded.forgotten_at,supersedes_id=excluded.supersedes_id,
             conflict_with_id=excluded.conflict_with_id,conflict_reason=excluded.conflict_reason`,
        ).run(
          memory.id,
          memory.project_path,
          memory.session_id,
          memory.layer,
          memory.category,
          memory.content,
          memory.keywords_json,
          memory.confidence,
          memory.pinned ? 1 : 0,
          memory.active ? 1 : 0,
          memory.created_at,
          memory.updated_at,
          memory.origin,
          memory.forgotten_at,
          memory.supersedes_id,
          memory.conflict_with_id,
          memory.conflict_reason,
        );
        this.clearTombstoneIfOlder("memory", memory.id, memory.updated_at);
        counts.memories += 1;
      }
    });
    run();
    return counts;
  }

  private recordTombstone(entity: DeviceSyncEntity, id: string, deletedAt = Date.now()): void {
    this.db.query(
      `INSERT INTO sync_tombstones(entity,entity_id,deleted_at) VALUES(?,?,?)
       ON CONFLICT(entity,entity_id) DO UPDATE SET deleted_at=MAX(deleted_at,excluded.deleted_at)`,
    ).run(entity, id, deletedAt);
  }

  private clearTombstone(entity: DeviceSyncEntity, id: string): void {
    this.db.query("DELETE FROM sync_tombstones WHERE entity=? AND entity_id=?").run(entity, id);
  }

  private clearTombstoneIfOlder(entity: DeviceSyncEntity, id: string, updatedAt: number): void {
    this.db.query(
      "DELETE FROM sync_tombstones WHERE entity=? AND entity_id=? AND deleted_at<?",
    ).run(entity, id, updatedAt);
  }

  private getAutomation(id: string): unknown {
    const row = this.db.query("SELECT * FROM automations WHERE id=?").get(id) as Row | null;
    if (!row) throw new Error(`automation not found: ${id}`);
    return this.automationFromRow(row);
  }

  private sessionFromRow(row: Row): Record<string, unknown> {
    return {
      id: text(row.id),
      title: text(row.title, "Untitled session"),
      title_origin: text(row.title_origin, "default"),
      pinned: bool(row.pinned),
      transient: bool(row.transient),
      activity: jsonValue(row.activity_json, { revision: 0, state: { kind: "idle" } }),
      provider: jsonValue(row.provider, text(row.provider, "codex")),
      model: nullableText(row.model),
      cwd: text(row.cwd),
      project_path: nullableText(row.project_path),
      worktree_path: nullableText(row.worktree_path),
      worktree_baseline: jsonValue(row.worktree_baseline_json, null),
      worktree_identity: jsonValue(row.worktree_identity_json, null),
      worktree_discarded: bool(row.worktree_discarded),
      permission_mode: jsonValue(row.permission_mode, text(row.permission_mode, "ask")),
      sandbox_policy: jsonValue(row.sandbox_policy, text(row.sandbox_policy, "workspace_write")),
      acp_session_id: nullableText(row.acp_session_id),
      memory_read: text(row.memory_read, "inherit"),
      memory_write: text(row.memory_write, "inherit"),
      handoff_epoch: Number(row.handoff_epoch ?? 0),
      handoff_state: text(row.handoff_state, "active"),
      handoff_id: nullableText(row.handoff_id),
      handoff_context: jsonValue(row.handoff_context_json, null),
      created_at: Number(row.created_at ?? 0),
    };
  }

  private memoryFromRow(row: Row): Record<string, unknown> {
    return {
      id: text(row.id),
      project_path: text(row.project_path),
      session_id: nullableText(row.session_id),
      layer: text(row.layer),
      category: text(row.category),
      content: text(row.content),
      keywords: jsonValue(row.keywords_json, []),
      confidence: Number(row.confidence ?? 0),
      sources: jsonValue(row.sources_json, []),
      pinned: bool(row.pinned),
      active: bool(row.active),
      created_at: Number(row.created_at ?? 0),
      updated_at: Number(row.updated_at ?? 0),
      accessed_at: row.accessed_at == null ? null : Number(row.accessed_at),
      access_count: Number(row.access_count ?? 0),
      origin: text(
        row.origin,
        text(row.layer) === "L3" ? "profile" : "automatic",
      ),
      forgotten_at: row.forgotten_at == null ? null : Number(row.forgotten_at),
      supersedes_id: nullableText(row.supersedes_id),
      conflict_with_id: nullableText(row.conflict_with_id),
      conflict_reason: nullableText(row.conflict_reason),
      relevance: null,
      editable: new Set(["manual", "user_correction"]).has(text(row.origin)),
    };
  }

  private automationFromRow(row: Row): Record<string, unknown> {
    return {
      id: text(row.id),
      name: text(row.name),
      prompt: text(row.prompt),
      project_path: text(row.project_path),
      provider: jsonValue(row.provider, text(row.provider, "codex")),
      cron: text(row.cron),
      timezone: text(row.timezone),
      enabled: bool(row.enabled),
      use_worktree: bool(row.use_worktree),
      permission_mode: jsonValue(row.permission_mode, text(row.permission_mode, "ask")),
      sandbox_policy: jsonValue(row.sandbox_policy, text(row.sandbox_policy, "workspace_write")),
      next_run_at: row.next_run_at == null ? null : Number(row.next_run_at),
      last_run_at: row.last_run_at == null ? null : Number(row.last_run_at),
      created_at: Number(row.created_at ?? 0),
      updated_at: Number(row.updated_at ?? 0),
    };
  }
}
