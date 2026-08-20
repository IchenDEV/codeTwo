import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";

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

const BASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  title_origin TEXT NOT NULL DEFAULT 'default',
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
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
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS parts (
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  part_json TEXT NOT NULL,
  search_text TEXT,
  PRIMARY KEY (session_id, seq)
);
CREATE INDEX IF NOT EXISTS parts_session ON parts(session_id, seq);
CREATE TABLE IF NOT EXISTS projects (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_opened_at INTEGER NOT NULL,
  added_at INTEGER NOT NULL DEFAULT 0,
  default_worktree_mode TEXT
);
CREATE TABLE IF NOT EXISTS memory_settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  enabled INTEGER NOT NULL DEFAULT 1,
  capture INTEGER NOT NULL DEFAULT 1,
  inject INTEGER NOT NULL DEFAULT 1,
  include_external_context INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO memory_settings(singleton) VALUES(1);
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
  scope_id TEXT,
  scope_kind TEXT
);
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
`;

export interface NewSessionInput {
  provider: string;
  cwd: string;
  permissionMode: string;
  sandboxPolicy: string;
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
  }

  close(): void {
    this.db.close(false);
  }

  listProjects(): unknown[] {
    return this.db
      .query(
        `SELECT path,name,last_opened_at,default_worktree_mode
         FROM projects ORDER BY added_at DESC,path ASC`,
      )
      .all()
      .map((row) => ({
        path: text((row as Row).path),
        name: text((row as Row).name),
        last_opened_at: Number((row as Row).last_opened_at ?? 0),
        default_worktree_mode: nullableText((row as Row).default_worktree_mode),
      }));
  }

  addProject(path: string, name?: string | null): string {
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO projects(path,name,last_opened_at,added_at) VALUES(?,?,?,?)
         ON CONFLICT(path) DO UPDATE SET last_opened_at=excluded.last_opened_at`,
      )
      .run(path, name?.trim() || basename(path) || path, now, now);
    return path;
  }

  touchProject(path: string): void {
    this.db.query("UPDATE projects SET last_opened_at=? WHERE path=?").run(Date.now(), path);
  }

  renameProject(path: string, name: string): void {
    this.db.query("UPDATE projects SET name=? WHERE path=?").run(name, path);
  }

  setProjectWorktreeMode(path: string, mode: string | null): void {
    this.db.query("UPDATE projects SET default_worktree_mode=? WHERE path=?").run(mode, path);
  }

  removeProject(path: string): void {
    this.db.query("DELETE FROM projects WHERE path=?").run(path);
  }

  listSessions(archived = false): unknown[] {
    const order = archived ? "created_at DESC" : "pinned DESC,created_at DESC";
    const rows = this.db
      .query(
        `SELECT id,title,title_origin,pinned,activity_json,provider,model,cwd,project_path,
                worktree_path,worktree_baseline_json,worktree_identity_json,worktree_discarded,
                permission_mode,sandbox_policy,acp_session_id,memory_read,memory_write,created_at
         FROM sessions WHERE archived=? ORDER BY ${order}`,
      )
      .all(archived ? 1 : 0) as Row[];
    return rows.map((row) => this.sessionFromRow(row));
  }

  getSession(id: string): Record<string, unknown> | null {
    const row = this.db
      .query(
        `SELECT id,title,title_origin,pinned,activity_json,provider,model,cwd,project_path,
                worktree_path,worktree_baseline_json,worktree_identity_json,worktree_discarded,
                permission_mode,sandbox_policy,acp_session_id,memory_read,memory_write,created_at
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
           id,title,title_origin,pinned,archived,activity_json,provider,model,cwd,project_path,
           worktree_path,worktree_discarded,permission_mode,sandbox_policy,acp_session_id,
           memory_read,memory_write,created_at
         ) VALUES(?,?,'default',0,0,?,?,NULL,?,?,NULL,0,?,?,NULL,'inherit','inherit',?)`,
      )
      .run(
        id,
        "Untitled session",
        JSON.stringify(activity),
        JSON.stringify(input.provider),
        input.cwd,
        input.cwd,
        JSON.stringify(input.permissionMode),
        JSON.stringify(input.sandboxPolicy),
        now,
      );
    const session = this.getSession(id);
    if (!session) throw new Error("could not read newly created session");
    return session;
  }

  updateAcpSession(id: string, acpSessionId: string): void {
    this.db.query("UPDATE sessions SET acp_session_id=? WHERE id=?").run(acpSessionId, id);
  }

  updateModel(id: string, model: string): void {
    this.db.query("UPDATE sessions SET model=? WHERE id=?").run(model, id);
  }

  updatePolicy(id: string, mode: string, sandbox: string): void {
    this.db
      .query("UPDATE sessions SET permission_mode=?,sandbox_policy=? WHERE id=?")
      .run(JSON.stringify(mode), JSON.stringify(sandbox), id);
  }

  updateActivity(id: string, activity: unknown): void {
    this.db.query("UPDATE sessions SET activity_json=? WHERE id=?").run(JSON.stringify(activity), id);
  }

  renameSession(id: string, title: string, origin = "manual"): void {
    this.db.query("UPDATE sessions SET title=?,title_origin=? WHERE id=?").run(title, origin, id);
  }

  setSessionFlag(id: string, field: "archived" | "pinned", value: boolean): void {
    if (field === "archived") {
      this.db
        .query("UPDATE sessions SET archived=?,pinned=CASE WHEN ?=1 THEN 0 ELSE pinned END WHERE id=?")
        .run(value ? 1 : 0, value ? 1 : 0, id);
      return;
    }
    this.db.query("UPDATE sessions SET pinned=? WHERE id=? AND archived=0").run(value ? 1 : 0, id);
  }

  appendPart(sessionId: string, role: "user" | "agent", part: unknown, searchText?: string): number {
    const current = this.db
      .query("SELECT COALESCE(MAX(seq),0) AS seq FROM parts WHERE session_id=?")
      .get(sessionId) as Row;
    const seq = Number(current.seq ?? 0) + 1;
    this.db
      .query("INSERT INTO parts(session_id,seq,role,part_json,search_text) VALUES(?,?,?,?,?)")
      .run(sessionId, seq, role, JSON.stringify(part), searchText ?? null);
    return seq;
  }

  sessionPreviews(): [string, string][] {
    const rows = this.db
      .query(
        `SELECT p.session_id,p.part_json FROM parts p
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
         WHERE p.search_text LIKE ? ESCAPE '\\'
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

  memoryStats(projectPath: string): Record<string, number> {
    const rows = this.db
      .query("SELECT layer,COUNT(*) AS count FROM memories WHERE project_path=? AND active=1 GROUP BY layer")
      .all(projectPath) as Row[];
    const stats = { l0: 0, l1: 0, l2: 0, l3: 0, pending: 0 };
    for (const row of rows) {
      const key = text(row.layer).toLowerCase() as keyof typeof stats;
      if (key in stats) stats[key] = Number(row.count ?? 0);
    }
    return stats;
  }

  addMemory(projectPath: string, category: string, content: string, pinned: boolean): unknown {
    const id = crypto.randomUUID();
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO memories(
          id,project_path,session_id,layer,category,content,keywords_json,confidence,
          sources_json,pinned,active,created_at,updated_at,access_count
        ) VALUES(?,?,NULL,'L1',?,?,'[]',1.0,'[]',?,1,?,?,0)`,
      )
      .run(id, projectPath, category, content, pinned ? 1 : 0, now, now);
    const row = this.db.query("SELECT * FROM memories WHERE id=?").get(id) as Row;
    return this.memoryFromRow(row);
  }

  setMemoryFlag(id: string, field: "pinned" | "active", value: boolean): void {
    this.db.query(`UPDATE memories SET ${field}=?,updated_at=? WHERE id=?`).run(value ? 1 : 0, Date.now(), id);
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
      relevance: null,
      editable: text(row.layer) !== "L3",
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
