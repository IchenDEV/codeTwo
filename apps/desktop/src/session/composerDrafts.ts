import type {
  DocumentBlock as DocumentBlock,
  MemoryAccess,
  PermissionMode,
  Sandbox,
  WorktreeBaselineKind,
} from "../bridge";
import { asJsonObject, isJsonObject } from "../lib/jsonValue";

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

export type ComposerDraftScope =
  | { kind: "project"; projectPath: string }
  | { kind: "session"; sessionId: string; projectPath: string | null };

export interface ComposerDraftAttachment {
  id: string;
  kind: "appshot" | "attachment";
  name: string;
}

export interface ComposerDraftPosture {
  provider: string;
  model: string | null;
  mode: PermissionMode;
  sandbox: Sandbox;
  worktreeBase: WorktreeBaselineKind | null;
  planMode: boolean;
  memoryRead: MemoryAccess;
  memoryWrite: MemoryAccess;
  scene: string | null;
  autoScene: boolean;
}

export interface ComposerDraft {
  id: string;
  scope: ComposerDraftScope;
  doc: DocumentBlock[];
  attachments: ComposerDraftAttachment[];
  posture: ComposerDraftPosture;
  updatedAt: number;
}

export type ComposerDraftLoadWarning = "corrupt" | "unavailable";

export interface ComposerDraftCollection {
  drafts: Map<string, ComposerDraft>;
  warning: ComposerDraftLoadWarning | null;
}

export type ComposerDraftPromotion =
  | { outcome: "moved"; drafts: Map<string, ComposerDraft> }
  | { outcome: "missing" | "conflict"; drafts: Map<string, ComposerDraft> };

export const composerDraftStorageKey = "codetwo.composerDrafts:v1";
const composerDraftVersion = 1 as const;
const maxDrafts = 100;
const maxRawBytes = 4 * 1024 * 1024;
const maxBlocks = 2000;
const maxAttachments = 64;

function serializedBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

interface ComposerDraftSnapshot {
  version: typeof composerDraftVersion;
  drafts: ComposerDraft[];
}

function stringWithin(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function nullableStringWithin(
  value: unknown,
  max: number
): value is string | null {
  return value === null || stringWithin(value, max);
}

function parseScope(value: unknown): ComposerDraftScope | null {
  const scope = asJsonObject(value);
  if (scope == null) {
    return null;
  }
  if (
    scope.kind === "project" &&
    stringWithin(scope.projectPath, 4096) &&
    scope.projectPath
  ) {
    return { kind: "project", projectPath: scope.projectPath };
  }
  if (
    scope.kind === "session" &&
    stringWithin(scope.sessionId, 256) &&
    scope.sessionId &&
    nullableStringWithin(scope.projectPath, 4096)
  ) {
    return {
      kind: "session",
      projectPath: scope.projectPath,
      sessionId: scope.sessionId,
    };
  }
  return null;
}

function stringRecord(value: unknown): value is Record<string, string> {
  if (!isJsonObject(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, item]) => stringWithin(key, 256) && stringWithin(item, 16_384)
  );
}

function parseDocumentBlock(value: unknown): DocumentBlock | null {
  const block = asJsonObject(value);
  if (block == null) {
    return null;
  }
  switch (block.type) {
    case "text": {
      return stringWithin(block.text, 1_048_576)
        ? { text: block.text, type: "text" }
        : null;
    }
    case "skill": {
      return stringWithin(block.skill_id, 512) && stringRecord(block.params)
        ? {
            params: { ...block.params },
            skill_id: block.skill_id,
            type: "skill",
          }
        : null;
    }
    case "file":
    case "image": {
      return stringWithin(block.path, 16_384)
        ? { path: block.path, type: block.type }
        : null;
    }
    case "appshot": {
      return stringWithin(block.id, 256) &&
        (block.title === undefined || stringWithin(block.title, 512))
        ? {
            id: block.id,
            type: "appshot",
            ...(block.title != null &&
              block.title !== "" && { title: block.title }),
          }
        : null;
    }
    case "attachment": {
      return stringWithin(block.id, 256) &&
        (block.name === undefined || stringWithin(block.name, 512))
        ? {
            id: block.id,
            type: "attachment",
            ...(block.name != null &&
              block.name !== "" && { name: block.name }),
          }
        : null;
    }
    case "canvas": {
      const revision = block.frozen_revision;
      const pixelPolicy = block.pixel_policy;
      return stringWithin(block.id, 256) &&
        typeof revision === "number" &&
        Number.isSafeInteger(revision) &&
        revision >= 0 &&
        (pixelPolicy === undefined ||
          pixelPolicy === "required" ||
          pixelPolicy === "structure_only")
        ? {
            frozen_revision: revision,
            id: block.id,
            type: "canvas",
            ...(pixelPolicy && { pixel_policy: pixelPolicy }),
          }
        : null;
    }
    case "session": {
      const throughSeq = block.through_seq;
      return stringWithin(block.session_id, 256) &&
        (throughSeq === undefined ||
          (typeof throughSeq === "number" &&
            Number.isSafeInteger(throughSeq) &&
            throughSeq > 0))
        ? {
            session_id: block.session_id,
            type: "session",
            ...(typeof throughSeq === "number" && { through_seq: throughSeq }),
          }
        : null;
    }
    case "issue": {
      return stringWithin(block.source, 256) &&
        stringWithin(block.id, 512) &&
        stringWithin(block.title, 4096) &&
        stringWithin(block.url, 16_384) &&
        stringWithin(block.body, 1_048_576)
        ? {
            body: block.body,
            id: block.id,
            source: block.source,
            title: block.title,
            type: "issue",
            url: block.url,
          }
        : null;
    }
    default: {
      return null;
    }
  }
}

function parseAttachment(value: unknown): ComposerDraftAttachment | null {
  const attachment = asJsonObject(value);
  if (attachment == null) {
    return null;
  }
  return stringWithin(attachment.id, 256) &&
    attachment.id &&
    (attachment.kind === "appshot" || attachment.kind === "attachment") &&
    stringWithin(attachment.name, 512)
    ? { id: attachment.id, kind: attachment.kind, name: attachment.name }
    : null;
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === "ask" || value === "accept_edits" || value === "yolo";
}

function isSandbox(value: unknown): value is Sandbox {
  return (
    value === "read_only" ||
    value === "workspace_write" ||
    value === "danger_full_access"
  );
}

function isMemoryAccess(value: unknown): value is MemoryAccess {
  return value === "inherit" || value === "allow" || value === "deny";
}

function isWorktreeBase(value: unknown): value is WorktreeBaselineKind | null {
  return value === null || value === "current" || value === "origin_default";
}

function parsePosture(value: unknown): ComposerDraftPosture | null {
  const posture = asJsonObject(value);
  if (posture == null) {
    return null;
  }
  if (
    !stringWithin(posture.provider, 128) ||
    !posture.provider ||
    !nullableStringWithin(posture.model, 512) ||
    !isPermissionMode(posture.mode) ||
    !isSandbox(posture.sandbox) ||
    !isWorktreeBase(posture.worktreeBase) ||
    typeof posture.planMode !== "boolean" ||
    !isMemoryAccess(posture.memoryRead) ||
    !isMemoryAccess(posture.memoryWrite) ||
    !nullableStringWithin(posture.scene, 512) ||
    typeof posture.autoScene !== "boolean"
  ) {
    return null;
  }
  return {
    autoScene: posture.autoScene,
    memoryRead: posture.memoryRead,
    memoryWrite: posture.memoryWrite,
    mode: posture.mode,
    model: posture.model,
    planMode: posture.planMode,
    provider: posture.provider,
    sandbox: posture.sandbox,
    scene: posture.scene,
    worktreeBase: posture.worktreeBase,
  };
}

function parseDraft(value: unknown): ComposerDraft | null {
  const draft = asJsonObject(value);
  if (draft == null) {
    return null;
  }
  const scope = parseScope(draft.scope);
  const posture = parsePosture(draft.posture);
  if (
    !stringWithin(draft.id, 256) ||
    !draft.id ||
    !scope ||
    !posture ||
    !Array.isArray(draft.doc) ||
    draft.doc.length > maxBlocks ||
    !Array.isArray(draft.attachments) ||
    draft.attachments.length > maxAttachments ||
    typeof draft.updatedAt !== "number" ||
    !Number.isSafeInteger(draft.updatedAt) ||
    draft.updatedAt < 0
  ) {
    return null;
  }
  const documentValue: Array<DocumentBlock | null> =
    draft.doc.map(parseDocumentBlock);
  const attachments: Array<ComposerDraftAttachment | null> =
    draft.attachments.map(parseAttachment);
  if (documentValue.includes(null) || attachments.includes(null)) {
    return null;
  }
  return {
    attachments: attachments.filter(
      (entry): entry is ComposerDraftAttachment => entry !== null
    ),
    doc: documentValue.filter(
      (entry): entry is DocumentBlock => entry !== null
    ),
    id: draft.id,
    posture,
    scope,
    updatedAt: draft.updatedAt,
  };
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function cloneBlock(block: DocumentBlock): DocumentBlock {
  return block.type === "skill"
    ? { ...block, params: { ...block.params } }
    : { ...block };
}

function cloneDraft(draft: ComposerDraft): ComposerDraft {
  return {
    ...draft,
    attachments: draft.attachments.map((attachment) => ({ ...attachment })),
    doc: draft.doc.map(cloneBlock),
    posture: { ...draft.posture },
    scope: { ...draft.scope },
  };
}

export function composerDraftScopeKey(scope: ComposerDraftScope): string {
  return scope.kind === "project"
    ? `project:${encodeURIComponent(scope.projectPath)}`
    : `session:${encodeURIComponent(scope.sessionId)}`;
}

export function composerDraftIsInvested(
  documentValue: readonly DocumentBlock[],
  attachments: readonly ComposerDraftAttachment[]
): boolean {
  return documentValue.length > 0 || attachments.length > 0;
}

export function updateComposerDraft(
  drafts: ReadonlyMap<string, ComposerDraft>,
  input: Omit<ComposerDraft, "id" | "updatedAt">,
  options: { now?: number; createId?: () => string } = {}
): Map<string, ComposerDraft> {
  const next = new Map(drafts);
  const key = composerDraftScopeKey(input.scope);
  if (!composerDraftIsInvested(input.doc, input.attachments)) {
    next.delete(key);
    return next;
  }
  const existing = drafts.get(key);
  next.set(key, {
    ...input,
    attachments: input.attachments
      .slice(0, maxAttachments)
      .map((item) => ({ ...item })),
    doc: input.doc.slice(0, maxBlocks).map(cloneBlock),
    id: existing?.id ?? options.createId?.() ?? crypto.randomUUID(),
    posture: { ...input.posture },
    scope: { ...input.scope },
    updatedAt: options.now ?? Date.now(),
  });
  return next;
}

export function promoteComposerDraft(
  drafts: ReadonlyMap<string, ComposerDraft>,
  from: ComposerDraftScope,
  to: ComposerDraftScope,
  now = Date.now()
): ComposerDraftPromotion {
  const fromKey = composerDraftScopeKey(from);
  const toKey = composerDraftScopeKey(to);
  const source = drafts.get(fromKey);
  if (!source) {
    return { drafts: new Map(drafts), outcome: "missing" };
  }
  const destination = drafts.get(toKey);
  if (destination && destination.id !== source.id) {
    return { drafts: new Map(drafts), outcome: "conflict" };
  }
  const next = new Map(drafts);
  next.delete(fromKey);
  next.set(toKey, cloneDraft({ ...source, scope: { ...to }, updatedAt: now }));
  return { drafts: next, outcome: "moved" };
}

export function loadComposerDrafts(
  storage?: StorageLike | null
): ComposerDraftCollection {
  const resolved = storage === undefined ? defaultStorage() : storage;
  if (!resolved) {
    return { drafts: new Map(), warning: "unavailable" };
  }
  let raw: string | null;
  try {
    raw = resolved.getItem(composerDraftStorageKey);
  } catch {
    return { drafts: new Map(), warning: "unavailable" };
  }
  if (raw === null) {
    return { drafts: new Map(), warning: null };
  }
  if (raw.length > maxRawBytes || serializedBytes(raw) > maxRawBytes) {
    return { drafts: new Map(), warning: "corrupt" };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const snapshot = asJsonObject(parsed);
    if (snapshot === null) {
      return { drafts: new Map(), warning: "corrupt" };
    }
    if (
      snapshot.version !== composerDraftVersion ||
      !Array.isArray(snapshot.drafts) ||
      snapshot.drafts.length > maxDrafts
    ) {
      return { drafts: new Map(), warning: "corrupt" };
    }
    const records = snapshot.drafts.map(parseDraft);
    if (records.includes(null)) {
      return { drafts: new Map(), warning: "corrupt" };
    }
    const drafts = new Map<string, ComposerDraft>();
    const ids = new Set<string>();
    for (const draft of records.filter(
      (entry): entry is ComposerDraft => entry !== null
    )) {
      const key = composerDraftScopeKey(draft.scope);
      if (
        drafts.has(key) ||
        ids.has(draft.id) ||
        !composerDraftIsInvested(draft.doc, draft.attachments)
      ) {
        return { drafts: new Map(), warning: "corrupt" };
      }
      drafts.set(key, cloneDraft(draft));
      ids.add(draft.id);
    }
    return { drafts, warning: null };
  } catch {
    return { drafts: new Map(), warning: "corrupt" };
  }
}

export function saveComposerDrafts(
  drafts: ReadonlyMap<string, ComposerDraft>,
  storage?: StorageLike | null
): boolean {
  const resolved = storage === undefined ? defaultStorage() : storage;
  if (!resolved) {
    return false;
  }
  try {
    const records = [...drafts.values()]
      .filter((draft) => composerDraftIsInvested(draft.doc, draft.attachments))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, maxDrafts)
      .map(cloneDraft);
    if (records.length === 0 && resolved.removeItem) {
      resolved.removeItem(composerDraftStorageKey);
      return true;
    }
    const snapshot: ComposerDraftSnapshot = {
      drafts: records,
      version: composerDraftVersion,
    };
    const raw = JSON.stringify(snapshot);
    if (serializedBytes(raw) > maxRawBytes) {
      return false;
    }
    resolved.setItem(composerDraftStorageKey, raw);
    return true;
  } catch {
    return false;
  }
}
