export const DEVICE_SYNC_SCHEMA_VERSION = 1 as const;

export interface DeviceSyncProject {
  path: string;
  name: string;
  last_opened_at: number;
  added_at: number;
  default_worktree_mode: string | null;
  updated_at: number;
}

export interface DeviceSyncSession {
  id: string;
  title: string;
  title_origin: string;
  pinned: boolean;
  archived: boolean;
  provider: string;
  model: string | null;
  cwd: string;
  project_path: string | null;
  permission_mode: string;
  sandbox_policy: string;
  memory_read: string;
  memory_write: string;
  created_at: number;
  updated_at: number;
}

export interface DeviceSyncPart {
  sync_id: string;
  session_id: string;
  seq: number;
  role: string;
  part_json: string;
  search_text: string | null;
  created_at: number;
}

export interface DeviceSyncMemory {
  id: string;
  project_path: string;
  session_id: string | null;
  layer: string;
  category: string;
  content: string;
  keywords_json: string;
  confidence: number;
  pinned: boolean;
  active: boolean;
  created_at: number;
  updated_at: number;
  origin: string;
  forgotten_at: number | null;
  supersedes_id: string | null;
  conflict_with_id: string | null;
  conflict_reason: string | null;
}

export type DeviceSyncEntity = "project" | "memory";

export interface DeviceSyncTombstone {
  entity: DeviceSyncEntity;
  id: string;
  deleted_at: number;
}

export interface DeviceSyncDocument {
  schema_version: typeof DEVICE_SYNC_SCHEMA_VERSION;
  revision: number;
  generated_at: number;
  writer_device_id: string;
  projects: DeviceSyncProject[];
  sessions: DeviceSyncSession[];
  parts: DeviceSyncPart[];
  memories: DeviceSyncMemory[];
  tombstones: DeviceSyncTombstone[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string" && value[key] !== "";
}

function hasNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "number" && Number.isFinite(value[key]);
}

/** Reject malformed or newer device-sync documents before any value reaches SQLite. */
export function parseDeviceSyncDocument(value: unknown): DeviceSyncDocument {
  const document = record(value);
  if (!document || document.schema_version !== DEVICE_SYNC_SCHEMA_VERSION) {
    throw new Error("unsupported device sync document");
  }
  if (!hasNumber(document, "revision") || !hasNumber(document, "generated_at") || !hasString(document, "writer_device_id")) {
    throw new Error("invalid device sync document header");
  }
  for (const key of ["projects", "sessions", "parts", "memories", "tombstones"] as const) {
    if (!Array.isArray(document[key])) throw new Error(`invalid device sync document field: ${key}`);
  }

  const projects = (document.projects as unknown[]).map((value) => {
    const item = record(value);
    if (!item || !hasString(item, "path") || !hasString(item, "name") || !hasNumber(item, "updated_at")) {
      throw new Error("invalid project in device sync document");
    }
    return value as unknown as DeviceSyncProject;
  });
  const sessions = (document.sessions as unknown[]).map((value) => {
    const item = record(value);
    if (!item || !hasString(item, "id") || !hasString(item, "provider") || !hasNumber(item, "updated_at")) {
      throw new Error("invalid session in device sync document");
    }
    return value as unknown as DeviceSyncSession;
  });
  const parts = (document.parts as unknown[]).map((value) => {
    const item = record(value);
    if (!item || !hasString(item, "sync_id") || !hasString(item, "session_id") || !hasString(item, "part_json")) {
      throw new Error("invalid transcript part in device sync document");
    }
    return value as unknown as DeviceSyncPart;
  });
  const memories = (document.memories as unknown[]).map((value) => {
    const item = record(value);
    if (!item || !hasString(item, "id") || !hasString(item, "project_path") || !hasNumber(item, "updated_at")) {
      throw new Error("invalid memory in device sync document");
    }
    return value as unknown as DeviceSyncMemory;
  });
  const tombstones = (document.tombstones as unknown[]).map((value) => {
    const item = record(value);
    if (
      !item ||
      !["project", "memory"].includes(String(item.entity)) ||
      !hasString(item, "id") ||
      !hasNumber(item, "deleted_at")
    ) {
      throw new Error("invalid tombstone in device sync document");
    }
    return value as unknown as DeviceSyncTombstone;
  });

  return {
    schema_version: DEVICE_SYNC_SCHEMA_VERSION,
    revision: document.revision as number,
    generated_at: document.generated_at as number,
    writer_device_id: document.writer_device_id as string,
    projects,
    sessions,
    parts,
    memories,
    tombstones,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function mergeLatest<T extends { updated_at: number }>(
  documents: DeviceSyncDocument[],
  select: (document: DeviceSyncDocument) => T[],
  key: (item: T) => string,
): Map<string, T> {
  const merged = new Map<string, T>();
  for (const document of documents) {
    for (const item of select(document)) {
      const id = key(item);
      const current = merged.get(id);
      if (
        !current ||
        item.updated_at > current.updated_at ||
        (item.updated_at === current.updated_at && stable(item) > stable(current))
      ) {
        merged.set(id, item);
      }
    }
  }
  return merged;
}

/**
 * Merge is deterministic: mutable rows are last-write-wins by their own timestamp, transcript
 * parts are an append-only set, and deletion markers win over an older row. CloudKit's record
 * change tag protects the resulting document from a concurrent overwrite.
 */
export function mergeDeviceSyncDocuments(
  input: DeviceSyncDocument[],
  writerDeviceId: string,
  now = Date.now(),
): DeviceSyncDocument {
  const documents = input.map(parseDeviceSyncDocument);
  const projects = mergeLatest(documents, (document) => document.projects, (item) => item.path);
  const sessions = mergeLatest(documents, (document) => document.sessions, (item) => item.id);
  const memories = mergeLatest(documents, (document) => document.memories, (item) => item.id);

  const tombstones = new Map<string, DeviceSyncTombstone>();
  for (const document of documents) {
    for (const item of document.tombstones) {
      const key = `${item.entity}:${item.id}`;
      const current = tombstones.get(key);
      if (!current || item.deleted_at > current.deleted_at) tombstones.set(key, item);
    }
  }
  for (const item of tombstones.values()) {
    if (item.entity === "project") {
      const project = projects.get(item.id);
      if (!project || item.deleted_at >= project.updated_at) projects.delete(item.id);
    } else {
      const memory = memories.get(item.id);
      if (!memory || item.deleted_at >= memory.updated_at) memories.delete(item.id);
    }
  }

  const parts = new Map<string, DeviceSyncPart>();
  for (const document of documents) {
    for (const item of document.parts) {
      if (!sessions.has(item.session_id)) continue;
      const current = parts.get(item.sync_id);
      if (!current || stable(item) > stable(current)) parts.set(item.sync_id, item);
    }
  }

  return {
    schema_version: DEVICE_SYNC_SCHEMA_VERSION,
    revision: Math.max(0, ...documents.map((document) => document.revision)) + 1,
    generated_at: now,
    writer_device_id: writerDeviceId,
    projects: [...projects.values()].sort((left, right) => left.path.localeCompare(right.path)),
    sessions: [...sessions.values()].sort((left, right) => left.id.localeCompare(right.id)),
    parts: [...parts.values()].sort(
      (left, right) => left.session_id.localeCompare(right.session_id) || left.seq - right.seq || left.sync_id.localeCompare(right.sync_id),
    ),
    memories: [...memories.values()].sort((left, right) => left.id.localeCompare(right.id)),
    tombstones: [...tombstones.values()].sort(
      (left, right) => left.entity.localeCompare(right.entity) || left.id.localeCompare(right.id),
    ),
  };
}
