import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname, platform, arch } from "node:os";
import { basename, dirname, join } from "node:path";

import type { DesktopEvent } from "../rpc";
import type { RemoteHostCall } from "./remote";

const CONTRACT_VERSION = "0.0.33-codetwo.2";
const ENVIRONMENT_FILE = "t3-environment-id";
const COMPATIBILITY_FILE = "t3-compatibility.json";
const MAX_COMMAND_RECEIPTS = 2_048;

type JsonObject = Record<string, unknown>;

export interface T3Socket {
  send(value: string): unknown;
}

interface Subscription {
  requestId: unknown;
  kind: "config" | "lifecycle" | "shell" | "thread" | "terminal" | "terminal-events" | "terminal-metadata" | "vcs";
  threadId?: string;
  terminalId?: string;
  internalTerminalId?: string;
  cwd?: string;
  awaitingAck: boolean;
  pendingUpdate: boolean;
  pendingValues?: unknown[];
}

interface TerminalRecord {
  internalId: string;
  threadId: string;
  terminalId: string;
  cwd: string;
  worktreePath: string | null;
  status: "running" | "exited";
  label: string;
  exitCode: number | null;
  exitSignal: number | null;
  updatedAt: string;
}

interface SocketState {
  scopes: Set<string>;
  subscriptions: Subscription[];
}

interface CompatibilityState {
  version: 1;
  aliases: Record<string, string>;
  interactionModes: Record<string, "default" | "plan">;
  commandReceipts: Array<{ commandId: string; sequence: number }>;
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected a JSON object");
  }
  return value as JsonObject;
}

function optionalObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function requiredString(value: JsonObject, field: string): string {
  const result = value[field];
  if (typeof result !== "string" || !result.trim()) throw new Error(`${field} is required`);
  return result;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function providerId(value: unknown): string {
  if (typeof value === "string") return value;
  const record = optionalObject(value);
  return optionalString(record.custom) ?? "codex";
}

function iso(value = Date.now()): string {
  return new Date(value).toISOString();
}

function atomicWrite(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, contents, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
}

function loadEnvironmentId(dataDir: string): string {
  const path = join(dataDir, ENVIRONMENT_FILE);
  if (existsSync(path)) {
    const value = readFileSync(path, "utf8").trim();
    if (/^[0-9a-f-]{36}$/i.test(value)) return value;
    throw new Error("stored T3 environment identity is invalid");
  }
  const value = randomUUID();
  atomicWrite(path, `${value}\n`);
  return value;
}

function loadCompatibility(dataDir: string): CompatibilityState {
  const path = join(dataDir, COMPATIBILITY_FILE);
  if (!existsSync(path)) {
    return { version: 1, aliases: {}, interactionModes: {}, commandReceipts: [] };
  }
  const parsed = object(JSON.parse(readFileSync(path, "utf8")));
  if (parsed.version !== 1) throw new Error("unsupported T3 compatibility metadata version");
  const aliases = optionalObject(parsed.aliases);
  const interactionModes = optionalObject(parsed.interactionModes);
  const receipts = Array.isArray(parsed.commandReceipts) ? parsed.commandReceipts : [];
  return {
    version: 1,
    aliases: Object.fromEntries(Object.entries(aliases).filter((entry): entry is [string, string] => (
      typeof entry[1] === "string"
    ))),
    interactionModes: Object.fromEntries(Object.entries(interactionModes).filter((entry): entry is [string, "default" | "plan"] => (
      entry[1] === "default" || entry[1] === "plan"
    ))),
    commandReceipts: receipts.flatMap((value) => {
      const receipt = optionalObject(value);
      return typeof receipt.commandId === "string" && typeof receipt.sequence === "number"
        ? [{ commandId: receipt.commandId, sequence: receipt.sequence }]
        : [];
    }),
  };
}

function projectId(path: string): string {
  return `codetwo-project-${createHash("sha256").update(path).digest("hex").slice(0, 24)}`;
}

function runtimeMode(session: JsonObject): string {
  const mode = optionalString(session.permission_mode) ?? "ask";
  const sandbox = optionalString(session.sandbox_policy) ?? "workspace_write";
  if (mode === "ask") return "approval-required";
  if (mode === "accept_edits") return "auto-accept-edits";
  if (mode === "yolo" && sandbox === "danger_full_access") return "full-access";
  return "auto";
}

function policyForRuntime(mode: string): { mode: string; sandbox: string } {
  if (mode === "approval-required") return { mode: "ask", sandbox: "workspace_write" };
  if (mode === "auto-accept-edits") return { mode: "accept_edits", sandbox: "workspace_write" };
  if (mode === "auto") return { mode: "yolo", sandbox: "workspace_write" };
  if (mode === "full-access") return { mode: "yolo", sandbox: "danger_full_access" };
  throw new Error(`unknown runtime mode: ${mode}`);
}

function activityState(session: JsonObject): JsonObject {
  return optionalObject(optionalObject(session.activity).state);
}

function projectPath(session: JsonObject, fallback: string): string {
  return optionalString(session.project_path) ?? optionalString(session.cwd) ?? fallback;
}

function modelSelection(session: JsonObject): JsonObject {
  return {
    instanceId: providerId(session.provider),
    model: optionalString(session.model) ?? "default",
  };
}

function sessionStatus(session: JsonObject): {
  latestTurn: JsonObject | null;
  status: string;
  activeTurnId: string | null;
  lastError: string | null;
} {
  const state = activityState(session);
  const kind = optionalString(state.kind) ?? "idle";
  const turnId = optionalString(state.turn_id);
  const at = iso(Number(session.created_at ?? Date.now()));
  if (kind === "running" || kind === "awaiting_input") {
    return {
      latestTurn: {
        turnId: turnId ?? `codetwo-turn-${String(session.id)}`,
        state: "running",
        requestedAt: at,
        startedAt: at,
        completedAt: null,
        assistantMessageId: null,
      },
      status: "running",
      activeTurnId: turnId,
      lastError: null,
    };
  }
  if (kind === "failed") {
    const interrupted = state.reason === "interrupted";
    return {
      latestTurn: turnId ? {
        turnId,
        state: interrupted ? "interrupted" : "error",
        requestedAt: at,
        startedAt: at,
        completedAt: at,
        assistantMessageId: null,
      } : null,
      status: interrupted ? "interrupted" : "error",
      activeTurnId: null,
      lastError: optionalString(state.message),
    };
  }
  return { latestTurn: null, status: "ready", activeTurnId: null, lastError: null };
}

function pendingActivities(session: JsonObject, at: string): JsonObject[] {
  const state = activityState(session);
  if (state.kind !== "awaiting_input" || !Array.isArray(state.pending)) return [];
  return state.pending.map((value, index) => {
    const pending = optionalObject(value);
    const requestId = optionalString(pending.input_id) ?? `unknown-${index}`;
    return {
      id: `codetwo-approval-${requestId}`,
      tone: "approval",
      kind: pending.kind === "elicitation" ? "user-input.requested" : "approval.requested",
      summary: optionalString(pending.title) ?? "Input requested",
      payload: {
        requestId,
        requestKind: pending.kind === "elicitation" ? "user-input" : "command",
        detail: optionalString(pending.title) ?? "Input requested",
        options: Array.isArray(pending.options) ? pending.options : [],
        form: pending.form ?? null,
      },
      turnId: optionalString(state.turn_id),
      sequence: typeof pending.sequence === "number" ? Math.max(0, pending.sequence) : 0,
      createdAt: at,
    };
  });
}

function success(requestId: unknown, value: unknown): JsonObject {
  return { _tag: "Exit", requestId, exit: { _tag: "Success", value } };
}

function failure(requestId: unknown, tag: string, message: string, requiredScope?: string): JsonObject {
  return {
    _tag: "Exit",
    requestId,
    exit: {
      _tag: "Failure",
      cause: [{
        _tag: "Fail",
        error: { _tag: tag, message, ...(requiredScope ? { requiredScope } : {}) },
      }],
    },
  };
}

export class T3MobileAdapter {
  readonly environmentId: string;
  private readonly compatibilityPath: string;
  private readonly cwd: string;
  private compatibility: CompatibilityState;
  private sequence = 0;
  private readonly sockets = new Map<T3Socket, SocketState>();
  private readonly terminals = new Map<string, TerminalRecord>();
  private dispatchTail: Promise<void> = Promise.resolve();

  constructor(dataDir: string, private readonly callHost: RemoteHostCall) {
    this.environmentId = loadEnvironmentId(dataDir);
    this.compatibilityPath = join(dataDir, COMPATIBILITY_FILE);
    this.compatibility = loadCompatibility(dataDir);
    this.sequence = this.compatibility.commandReceipts.reduce(
      (maximum, receipt) => Math.max(maximum, receipt.sequence),
      0,
    );
    this.cwd = process.cwd();
  }

  descriptor(): JsonObject {
    const os = platform();
    const machine = arch();
    return {
      environmentId: this.environmentId,
      label: hostname() || "C2",
      platform: {
        os: os === "darwin" || os === "linux" || os === "win32" ? (os === "win32" ? "windows" : os) : "unknown",
        arch: machine === "arm64" || machine === "x64" ? machine : "other",
      },
      serverVersion: CONTRACT_VERSION,
      capabilities: {
        repositoryIdentity: false,
        connectionProbe: true,
      },
    };
  }

  authDescriptor(): JsonObject {
    return {
      policy: "remote-reachable",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["bearer-access-token"],
      sessionCookieName: "codetwo-t3-session",
    };
  }

  open(socket: T3Socket, scopes: string[]): void {
    this.sockets.set(socket, { scopes: new Set(scopes), subscriptions: [] });
  }

  close(socket: T3Socket): void {
    this.sockets.delete(socket);
  }

  publish(event: DesktopEvent): void {
    if (event.name === "engine-event") {
      this.sequence += 1;
      for (const [socket, state] of this.sockets) {
        for (const subscription of state.subscriptions) {
          if (subscription.kind !== "shell" && subscription.kind !== "thread" && subscription.kind !== "vcs") continue;
          if (subscription.awaitingAck) {
            subscription.pendingUpdate = true;
            continue;
          }
          void this.pushSubscription(socket, subscription);
        }
      }
      return;
    }
    if (event.name !== "pty-output" && event.name !== "pty-title" && event.name !== "pty-exit") return;
    const payload = optionalObject(event.payload);
    const internalId = optionalString(payload.id);
    if (!internalId) return;
    const terminal = this.terminals.get(internalId);
    if (terminal) this.sequence += 1;
    if (terminal && event.name === "pty-title") {
      terminal.label = String(payload.title ?? "Terminal").slice(0, 128);
      terminal.updatedAt = iso();
    }
    const terminalEvent = terminal
      ? event.name === "pty-output"
        ? {
          type: "output",
          threadId: terminal.threadId,
          terminalId: terminal.terminalId,
          sequence: this.sequence,
          data: String(payload.data ?? ""),
        }
        : event.name === "pty-exit"
          ? {
            type: "exited",
            threadId: terminal.threadId,
            terminalId: terminal.terminalId,
            sequence: this.sequence,
            exitCode: null,
            exitSignal: null,
          }
          : {
            type: "activity",
            threadId: terminal.threadId,
            terminalId: terminal.terminalId,
            sequence: this.sequence,
            hasRunningSubprocess: false,
            label: terminal.label,
          }
      : null;
    for (const [socket, state] of this.sockets) {
      for (const subscription of state.subscriptions) {
        if (subscription.kind === "terminal-metadata" && terminal) {
          const value = event.name === "pty-exit"
            ? { type: "remove", threadId: terminal.threadId, terminalId: terminal.terminalId }
            : { type: "upsert", terminal: this.terminalSummary(terminal) };
          this.enqueueSubscriptionValue(socket, subscription, value);
          continue;
        }
        if (!terminalEvent) continue;
        if (subscription.kind !== "terminal-events" && (
          subscription.kind !== "terminal" || subscription.internalTerminalId !== internalId
        )) continue;
        this.enqueueSubscriptionValue(socket, subscription, terminalEvent);
      }
    }
    if (event.name === "pty-exit") this.terminals.delete(internalId);
  }

  async serverConfig(): Promise<JsonObject> {
    const providers = await this.providers();
    const defaultCwd = await this.defaultCwd();
    const home = process.env.HOME ?? defaultCwd;
    return {
      environment: this.descriptor(),
      auth: this.authDescriptor(),
      cwd: defaultCwd,
      keybindingsConfigPath: join(home, ".config", "codetwo", "keymap.json"),
      keybindings: [],
      issues: [],
      providers,
      availableEditors: [],
      observability: {
        logsDirectoryPath: join(home, ".codetwo", "logs"),
        localTracingEnabled: false,
        otlpTracesEnabled: false,
        otlpMetricsEnabled: false,
      },
      settings: {},
      shellResumeCompletionMarker: false,
      threadResumeCompletionMarker: false,
      threadSnapshotPagination: false,
    };
  }

  async shellSnapshot(archived = false): Promise<JsonObject> {
    const sessions = await this.sessions(archived);
    const configuredProjects = await this.projects();
    const defaultCwd = await this.defaultCwd();
    const paths = new Map<string, string>();
    for (const project of configuredProjects) {
      const path = optionalString(project.path);
      if (path) paths.set(path, optionalString(project.name) ?? (basename(path) || "C2"));
    }
    for (const session of sessions) {
      const path = projectPath(session, defaultCwd);
      if (!paths.has(path)) paths.set(path, basename(path) || "C2");
    }
    if (paths.size === 0) paths.set(defaultCwd, basename(defaultCwd) || "C2");
    const updatedAt = iso();
    return {
      snapshotSequence: this.sequence,
      projects: [...paths].map(([path, title]) => {
        const related = sessions.filter((session) => projectPath(session, defaultCwd) === path);
        const created = Math.min(...related.map((session) => Number(session.created_at ?? Date.now())), Date.now());
        return {
          id: projectId(path),
          title,
          workspaceRoot: path,
          defaultModelSelection: related[0] ? modelSelection(related[0]) : null,
          scripts: [],
          createdAt: iso(created),
          updatedAt,
        };
      }),
      threads: sessions.map((session) => this.threadShell(session, defaultCwd, updatedAt, archived)),
      updatedAt,
    };
  }

  async threadSnapshot(publicId: string): Promise<JsonObject> {
    const sessions = await this.sessions();
    const coreId = this.coreThreadId(publicId);
    const session = sessions.find((candidate) => candidate.id === coreId);
    if (!session) throw new Error(`unknown thread: ${publicId}`);
    const entries = await this.fullTranscript(coreId);
    const updatedAt = iso();
    const thread = this.threadShell(session, await this.defaultCwd(), updatedAt);
    const messages: JsonObject[] = [];
    const activities = pendingActivities(session, updatedAt);
    let assistant: { seq: number; at: string; text: string } | null = null;
    let latestUserMessageAt: string | null = null;
    const flushAssistant = () => {
      if (!assistant) return;
      messages.push(this.message(coreId, assistant.seq, "assistant", assistant.text, assistant.at));
      assistant = null;
    };
    for (const entry of entries) {
      const seq = typeof entry.seq === "number" ? entry.seq : 0;
      const at = iso(Number(session.created_at ?? Date.now()) + Math.max(0, seq));
      const part = optionalObject(entry.part);
      const kind = optionalString(part.kind) ?? "text";
      if (entry.role === "user" && (kind === "prompt" || kind === "text")) {
        flushAssistant();
        const text = String(part.display ?? part.text ?? "");
        messages.push(this.message(coreId, seq, "user", text, at));
        latestUserMessageAt = at;
      } else if (entry.role === "agent" && kind === "text") {
        const text = String(part.text ?? "");
        if (assistant) assistant.text += text;
        else assistant = { seq, at, text };
      } else if (kind === "reasoning") {
        activities.push(this.activity(coreId, seq, "info", "assistant.reasoning", "Reasoning", part, at));
      } else if (kind === "tool_call") {
        activities.push(this.activity(
          coreId,
          seq,
          "tool",
          "tool.lifecycle",
          optionalString(part.title) ?? "Tool call",
          part,
          at,
        ));
      } else if (kind === "plan") {
        activities.push(this.activity(coreId, seq, "info", "assistant.plan", "Plan", part, at));
      }
    }
    flushAssistant();
    return {
      snapshotSequence: this.sequence,
      thread: {
        ...thread,
        deletedAt: null,
        messages,
        proposedPlans: [],
        activities,
        checkpoints: [],
        latestUserMessageAt,
      },
    };
  }

  async handle(socket: T3Socket, text: string): Promise<void> {
    const state = this.sockets.get(socket);
    if (!state) return;
    const parsed = JSON.parse(text) as unknown;
    const frames = Array.isArray(parsed) ? parsed : [parsed];
    for (const raw of frames) await this.handleFrame(socket, state, object(raw));
  }

  async dispatchCommand(command: JsonObject): Promise<{ sequence: number }> {
    return { sequence: await this.dispatch(command) };
  }

  private async handleFrame(socket: T3Socket, state: SocketState, frame: JsonObject): Promise<void> {
    const tag = optionalString(frame._tag) ?? "";
    if (tag === "Ping") {
      this.send(socket, { _tag: "Pong" });
      return;
    }
    if (tag === "Interrupt") {
      const requestId = frame.requestId;
      state.subscriptions = state.subscriptions.filter((subscription) => subscription.requestId !== requestId);
      return;
    }
    if (tag === "Ack") {
      const subscription = state.subscriptions.find((candidate) => candidate.requestId === frame.requestId);
      if (!subscription) return;
      subscription.awaitingAck = false;
      if (subscription.pendingValues && subscription.pendingValues.length > 0) {
        const values = subscription.pendingValues.splice(0);
        this.send(socket, { _tag: "Chunk", requestId: subscription.requestId, values });
        subscription.awaitingAck = true;
        return;
      }
      if (subscription.pendingUpdate) {
        subscription.pendingUpdate = false;
        await this.pushSubscription(socket, subscription);
      }
      return;
    }
    if (tag !== "Request") return;
    const requestId = frame.id ?? null;
    const method = optionalString(frame.tag) ?? "";
    const payload = optionalObject(frame.payload);
    const requiredScope = method.startsWith("terminal.") || method === "subscribeTerminalEvents" || method === "subscribeTerminalMetadata"
      ? "terminal:operate"
      : method === "orchestration.dispatchCommand" || method === "projects.writeFile"
        ? "orchestration:operate"
        : "orchestration:read";
    if (!state.scopes.has(requiredScope)) {
      this.send(socket, failure(requestId, "EnvironmentAuthorizationError", `missing ${requiredScope}`, requiredScope));
      return;
    }
    try {
      if (method === "server.getConfig") {
        this.send(socket, success(requestId, await this.serverConfig()));
      } else if (method === "server.getSettings") {
        this.send(socket, success(requestId, {}));
      } else if (method === "server.probe") {
        this.send(socket, success(requestId, {}));
      } else if (method === "server.reportClientActivity") {
        this.send(socket, success(requestId, null));
      } else if (method === "subscribeServerConfig") {
        this.send(socket, { _tag: "Chunk", requestId, values: [{ version: 1, type: "snapshot", config: await this.serverConfig() }] });
        state.subscriptions.push({ requestId, kind: "config", awaitingAck: true, pendingUpdate: false });
      } else if (method === "subscribeServerLifecycle") {
        const cwd = await this.defaultCwd();
        this.send(socket, {
          _tag: "Chunk",
          requestId,
          values: [
            { version: 1, sequence: 0, type: "welcome", payload: { environment: this.descriptor(), cwd, projectName: basename(cwd) || "C2" } },
            { version: 1, sequence: 1, type: "ready", payload: { at: iso(), environment: this.descriptor() } },
          ],
        });
        state.subscriptions.push({ requestId, kind: "lifecycle", awaitingAck: true, pendingUpdate: false });
      } else if (method === "orchestration.subscribeShell") {
        this.send(socket, { _tag: "Chunk", requestId, values: [{ kind: "snapshot", snapshot: await this.shellSnapshot() }] });
        state.subscriptions.push({ requestId, kind: "shell", awaitingAck: true, pendingUpdate: false });
      } else if (method === "orchestration.subscribeThread") {
        const threadId = requiredString(payload, "threadId");
        this.send(socket, { _tag: "Chunk", requestId, values: [{ kind: "snapshot", snapshot: await this.threadSnapshot(threadId) }] });
        state.subscriptions.push({ requestId, kind: "thread", threadId, awaitingAck: true, pendingUpdate: false });
      } else if (method === "orchestration.getArchivedShellSnapshot") {
        this.send(socket, success(requestId, await this.shellSnapshot(true)));
      } else if (method === "orchestration.searchThreads") {
        this.send(socket, success(requestId, await this.searchThreads(payload)));
      } else if (method === "orchestration.dispatchCommand") {
        this.send(socket, success(requestId, { sequence: await this.dispatch(payload) }));
      } else if (method === "subscribeTerminalEvents") {
        state.subscriptions.push({ requestId, kind: "terminal-events", awaitingAck: false, pendingUpdate: false, pendingValues: [] });
      } else if (method === "subscribeTerminalMetadata") {
        this.send(socket, {
          _tag: "Chunk",
          requestId,
          values: [{ type: "snapshot", terminals: [...this.terminals.values()].map((record) => this.terminalSummary(record)) }],
        });
        state.subscriptions.push({ requestId, kind: "terminal-metadata", awaitingAck: true, pendingUpdate: false, pendingValues: [] });
      } else if (method === "subscribeVcsStatus") {
        const cwd = requiredString(payload, "cwd");
        this.send(socket, { _tag: "Chunk", requestId, values: [await this.vcsStreamSnapshot({ cwd })] });
        state.subscriptions.push({ requestId, kind: "vcs", cwd, awaitingAck: true, pendingUpdate: false });
      } else if (method.startsWith("terminal.")) {
        await this.handleTerminalRpc(socket, state, requestId, method, payload);
      } else if (method.startsWith("projects.")) {
        this.send(socket, success(requestId, await this.handleProjectRpc(method, payload)));
      } else if (method === "vcs.refreshStatus") {
        this.send(socket, success(requestId, await this.vcsStatus(payload)));
      } else {
        this.send(socket, failure(requestId, "EnvironmentAuthorizationError", `unsupported T3 RPC method: ${method}`, requiredScope));
      }
    } catch (error) {
      const errorTag = method === "orchestration.dispatchCommand"
        ? "OrchestrationDispatchCommandError"
        : "OrchestrationGetSnapshotError";
      this.send(socket, failure(requestId, errorTag, error instanceof Error ? error.message : String(error)));
    }
  }

  private async pushSubscription(socket: T3Socket, subscription: Subscription): Promise<void> {
    try {
      const value = subscription.kind === "shell"
        ? { kind: "snapshot", snapshot: await this.shellSnapshot() }
        : subscription.kind === "thread"
          ? { kind: "snapshot", snapshot: await this.threadSnapshot(subscription.threadId ?? "") }
          : await this.vcsStreamSnapshot({ cwd: subscription.cwd ?? "" });
      this.send(socket, { _tag: "Chunk", requestId: subscription.requestId, values: [value] });
      subscription.awaitingAck = true;
    } catch {
      // A later event or explicit snapshot request can recover a transient projection failure.
    }
  }

  private enqueueSubscriptionValue(socket: T3Socket, subscription: Subscription, value: unknown): void {
    if (subscription.awaitingAck) {
      subscription.pendingValues ??= [];
      subscription.pendingValues.push(value);
      return;
    }
    this.send(socket, { _tag: "Chunk", requestId: subscription.requestId, values: [value] });
    subscription.awaitingAck = true;
  }

  private terminalInternalId(threadId: string, terminalId: string): string {
    return `t3-${createHash("sha256").update(`${threadId}\0${terminalId}`).digest("hex").slice(0, 24)}`;
  }

  private async handleTerminalRpc(
    socket: T3Socket,
    state: SocketState,
    requestId: unknown,
    method: string,
    payload: JsonObject,
  ): Promise<void> {
    const threadId = requiredString(payload, "threadId");
    const terminalId = method === "terminal.close" && payload.terminalId == null
      ? null
      : requiredString(payload, "terminalId");
    if (method === "terminal.close" && terminalId === null) {
      const records = [...this.terminals.values()].filter((record) => record.threadId === threadId);
      for (const record of records) {
        await this.callHost("terminal.kill", { id: record.internalId });
      }
      state.subscriptions = state.subscriptions.filter((candidate) => candidate.kind !== "terminal" || candidate.threadId !== threadId);
      this.send(socket, success(requestId, null));
      return;
    }
    if (!terminalId) throw new Error("terminalId is required");
    const internalTerminalId = this.terminalInternalId(threadId, terminalId);
    if (method === "terminal.write") {
      await this.callHost("terminal.write", { id: internalTerminalId, data: requiredString(payload, "data") });
      this.send(socket, success(requestId, null));
      return;
    }
    if (method === "terminal.resize") {
      await this.callHost("terminal.resize", {
        id: internalTerminalId,
        rows: Number(payload.rows ?? 24),
        cols: Number(payload.cols ?? 80),
      });
      this.send(socket, success(requestId, null));
      return;
    }
    if (method === "terminal.clear") {
      await this.callHost("terminal.clear", { id: internalTerminalId });
      this.send(socket, success(requestId, null));
      return;
    }
    if (method === "terminal.close") {
      await this.callHost("terminal.kill", { id: internalTerminalId });
      state.subscriptions = state.subscriptions.filter((candidate) => candidate.internalTerminalId !== internalTerminalId);
      this.send(socket, success(requestId, null));
      return;
    }
    const cwd = optionalString(payload.cwd) ?? await this.threadCwd(threadId);
    if (method === "terminal.restart") await this.callHost("terminal.kill", { id: internalTerminalId });
    const attached = optionalObject(await this.callHost("terminal.spawn", {
      id: internalTerminalId,
      cwd,
      rows: Number(payload.rows ?? 24),
      cols: Number(payload.cols ?? 80),
    }));
    const snapshot = {
      threadId,
      terminalId,
      cwd,
      worktreePath: payload.worktreePath ?? null,
      status: "running",
      pid: null,
      history: String(attached.restore ?? ""),
      exitCode: null,
      exitSignal: null,
      label: basename(cwd) || "Terminal",
      updatedAt: iso(),
      sequence: this.sequence,
    };
    const record: TerminalRecord = {
      internalId: internalTerminalId,
      threadId,
      terminalId,
      cwd,
      worktreePath: optionalString(payload.worktreePath),
      status: "running",
      label: basename(cwd) || "Terminal",
      exitCode: null,
      exitSignal: null,
      updatedAt: String(snapshot.updatedAt),
    };
    this.terminals.set(internalTerminalId, record);
    if (method === "terminal.attach") {
      this.send(socket, { _tag: "Chunk", requestId, values: [{ type: "snapshot", snapshot }] });
      state.subscriptions.push({
        requestId,
        kind: "terminal",
        threadId,
        terminalId,
        internalTerminalId,
        awaitingAck: true,
        pendingUpdate: false,
        pendingValues: [],
      });
    } else {
      this.send(socket, success(requestId, snapshot));
      this.broadcastTerminalLifecycle(record, {
        type: method === "terminal.restart" ? "restarted" : "started",
        threadId,
        terminalId,
        sequence: this.sequence,
        snapshot,
      });
    }
  }

  private broadcastTerminalLifecycle(record: TerminalRecord, event: unknown): void {
    for (const [socket, state] of this.sockets) {
      for (const subscription of state.subscriptions) {
        if (subscription.kind === "terminal-events") {
          this.enqueueSubscriptionValue(socket, subscription, event);
        } else if (subscription.kind === "terminal-metadata") {
          this.enqueueSubscriptionValue(socket, subscription, { type: "upsert", terminal: this.terminalSummary(record) });
        }
      }
    }
  }

  private async handleProjectRpc(method: string, payload: JsonObject): Promise<unknown> {
    const cwd = requiredString(payload, "cwd");
    if (method === "projects.listEntries") {
      const values = await this.callHost("workspace.list_files", { cwd, query: "", limit: 5_000 });
      const paths = Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
      return { entries: paths.map((path) => ({ path, kind: "file" })), truncated: paths.length >= 5_000 };
    }
    if (method === "projects.searchEntries") {
      const limit = Math.max(1, Math.min(200, Number(payload.limit ?? 50)));
      const values = await this.callHost("workspace.list_files", {
        cwd,
        query: String(payload.query ?? ""),
        limit,
      });
      const paths = Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
      return { entries: paths.map((path) => ({ path, kind: "file" })), truncated: paths.length >= limit };
    }
    if (method === "projects.readFile") {
      const relativePath = requiredString(payload, "relativePath");
      const contents = String(await this.callHost("workspace.read_text", { cwd, path: relativePath }));
      return { relativePath, contents, byteLength: new TextEncoder().encode(contents).byteLength, truncated: false };
    }
    if (method === "projects.writeFile") {
      const relativePath = requiredString(payload, "relativePath");
      await this.callHost("workspace.write_text", { cwd, path: relativePath, content: String(payload.contents ?? "") });
      return { relativePath };
    }
    if (method === "projects.searchContents") {
      const result = optionalObject(await this.callHost("workspace.search", {
        cwd,
        query: requiredString(payload, "query"),
        limit: Math.max(1, Math.min(500, Number(payload.limit ?? 200))),
        options: {
          regex: payload.useRegex === true,
          case_sensitive: payload.caseSensitive === true,
          whole_word: payload.wholeWord === true,
        },
      }));
      const matches = Array.isArray(result.matches) ? result.matches.map((value) => {
        const match = optionalObject(value);
        const line = String(match.preview ?? "");
        const start = Math.max(0, Number(match.column ?? 1) - 1);
        return {
          path: String(match.path ?? "unknown"),
          lineNumber: Math.max(1, Number(match.line ?? 1)),
          lineContent: line,
          matchRanges: [{ start, end: Math.min(line.length, start + String(payload.query ?? "").length) }],
        };
      }) : [];
      return { matches, truncated: result.truncated === true };
    }
    throw new Error(`unsupported T3 project RPC method: ${method}`);
  }

  private async searchThreads(payload: JsonObject): Promise<JsonObject> {
    const query = requiredString(payload, "query");
    if (query.length < 2 || query.length > 200) throw new Error("query must be between 2 and 200 characters");
    const limit = Math.max(1, Math.min(50, Number(payload.limit ?? 20)));
    const rows = await this.callHost("sessions.search", { query, limit });
    return {
      matches: (Array.isArray(rows) ? rows : []).map((value) => {
        const row = optionalObject(value);
        const coreId = requiredString(row, "session_id");
        const cwd = requiredString(row, "cwd");
        return {
          threadId: this.publicThreadId(coreId),
          projectId: projectId(cwd),
          source: row.role === "agent" ? "assistant" : "user",
          snippet: String(row.snippet ?? "").slice(0, 240),
          messageCreatedAt: null,
        };
      }),
    };
  }

  private async vcsStatus(payload: JsonObject): Promise<JsonObject> {
    const cwd = requiredString(payload, "cwd");
    const status = optionalObject(await this.callHost("git.status", { cwd }));
    const files = Array.isArray(status.files) ? status.files.map((value) => ({
      path: String(optionalObject(value).path ?? "unknown"),
      insertions: 0,
      deletions: 0,
    })) : [];
    return {
      isRepo: status.is_repo === true,
      hasPrimaryRemote: false,
      isDefaultRef: false,
      refName: optionalString(status.branch),
      hasWorkingTreeChanges: files.length > 0,
      workingTree: { files, insertions: 0, deletions: 0 },
      hasUpstream: Number(status.ahead ?? 0) > 0 || Number(status.behind ?? 0) > 0,
      aheadCount: Math.max(0, Number(status.ahead ?? 0)),
      behindCount: Math.max(0, Number(status.behind ?? 0)),
      pr: null,
    };
  }

  private async vcsStreamSnapshot(payload: JsonObject): Promise<JsonObject> {
    const status = await this.vcsStatus(payload);
    const {
      hasUpstream,
      aheadCount,
      behindCount,
      aheadOfDefaultCount,
      pr,
      ...local
    } = status;
    return {
      _tag: "snapshot",
      local,
      remote: status.isRepo === true
        ? { hasUpstream, aheadCount, behindCount, ...(aheadOfDefaultCount == null ? {} : { aheadOfDefaultCount }), pr }
        : null,
    };
  }

  private terminalSummary(record: TerminalRecord): JsonObject {
    return {
      threadId: record.threadId,
      terminalId: record.terminalId,
      cwd: record.cwd,
      worktreePath: record.worktreePath,
      status: record.status,
      pid: null,
      exitCode: record.exitCode,
      exitSignal: record.exitSignal,
      hasRunningSubprocess: false,
      label: record.label,
      updatedAt: record.updatedAt,
    };
  }

  private async threadCwd(publicId: string): Promise<string> {
    const session = (await this.sessions()).find((candidate) => candidate.id === this.coreThreadId(publicId));
    if (!session) throw new Error(`unknown thread: ${publicId}`);
    return requiredString(session, "cwd");
  }

  private async dispatch(command: JsonObject): Promise<number> {
    const commandId = requiredString(command, "commandId");
    const known = this.compatibility.commandReceipts.find((receipt) => receipt.commandId === commandId);
    if (known) return known.sequence;
    let release!: () => void;
    const prior = this.dispatchTail;
    this.dispatchTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      const repeated = this.compatibility.commandReceipts.find((receipt) => receipt.commandId === commandId);
      if (repeated) return repeated.sequence;
      await this.dispatchUncached(commandId, command);
      this.sequence += 1;
      this.compatibility.commandReceipts.push({ commandId, sequence: this.sequence });
      if (this.compatibility.commandReceipts.length > MAX_COMMAND_RECEIPTS) {
        this.compatibility.commandReceipts.splice(0, this.compatibility.commandReceipts.length - MAX_COMMAND_RECEIPTS);
      }
      this.persistCompatibility();
      return this.sequence;
    } finally {
      release();
    }
  }

  private async dispatchUncached(commandId: string, command: JsonObject): Promise<void> {
    const type = requiredString(command, "type");
    if (type === "thread.turn.start") {
      const publicId = requiredString(command, "threadId");
      const message = object(command.message);
      const text = requiredString(message, "text");
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      let coreId = this.coreThreadId(publicId);
      const sessions = await this.sessions();
      if (!sessions.some((session) => session.id === coreId)) {
        coreId = await this.createThread(commandId, publicId, command, sessions);
      }
      const doc: JsonObject[] = [];
      if (this.interactionMode(publicId) === "plan") {
        doc.push({ type: "text", text: "[skill:plan-first]" });
      }
      doc.push({ type: "text", text });
      for (const value of attachments) {
        const attachment = optionalObject(value);
        if (attachment.type !== "image") throw new Error("unsupported mobile attachment type");
        const dataUrl = requiredString(attachment, "dataUrl");
        doc.push({
          type: "image_data",
          data_url: dataUrl,
          name: optionalString(attachment.name) ?? "mobile-image",
        });
      }
      await this.callHost("engine.prompt", {
        session: coreId,
        doc,
        request_id: `t3:${commandId}`,
      });
      return;
    }
    const publicId = requiredString(command, "threadId");
    const coreId = this.coreThreadId(publicId);
    const sessions = await this.sessions();
    const session = sessions.find((candidate) => candidate.id === coreId);
    if (!session) throw new Error(`unknown thread: ${publicId}`);
    if (type === "thread.turn.interrupt" || type === "thread.session.stop") {
      await this.callHost("engine.cancel", { session: coreId });
    } else if (type === "thread.runtime-mode.set") {
      const policy = policyForRuntime(requiredString(command, "runtimeMode"));
      await this.callHost("engine.set_execution_policy", { session: coreId, ...policy, request_id: `t3:${commandId}` });
    } else if (type === "thread.interaction-mode.set") {
      const mode = requiredString(command, "interactionMode");
      if (mode !== "default" && mode !== "plan") throw new Error(`unsupported T3 interaction mode: ${mode}`);
      this.compatibility.interactionModes[publicId] = mode;
      this.persistCompatibility();
    } else if (type === "thread.meta.update") {
      const selection = optionalObject(command.modelSelection);
      const model = optionalString(selection.model);
      if (!model) throw new Error("C2 currently supports model changes, not T3 title/branch edits");
      await this.callHost("engine.set_model", { session: coreId, model });
    } else if (type === "thread.approval.respond") {
      await this.answerApproval(coreId, session, command);
    } else if (type === "thread.user-input.respond") {
      await this.callHost("engine.answer_elicitation", {
        session: coreId,
        request_id: requiredString(command, "requestId"),
        answer: { action: "accept", content: optionalObject(command.answers) },
      });
    } else {
      throw new Error(`unsupported T3 command: ${type}`);
    }
  }

  private async createThread(
    commandId: string,
    publicId: string,
    command: JsonObject,
    before: JsonObject[],
  ): Promise<string> {
    const bootstrap = optionalObject(command.bootstrap);
    const create = object(bootstrap.createThread);
    if (bootstrap.prepareWorktree != null || bootstrap.runSetupScript === true || create.worktreePath != null || create.branch != null) {
      throw new Error("C2's T3 adapter does not yet support mobile Git/worktree bootstrap options");
    }
    const project = requiredString(create, "projectId");
    const paths = await this.projectPaths(before);
    const cwd = paths.get(project);
    if (!cwd) throw new Error(`unknown project: ${project}`);
    const selection = optionalObject(create.modelSelection ?? command.modelSelection);
    const runtime = policyForRuntime(optionalString(create.runtimeMode ?? command.runtimeMode) ?? "approval-required");
    const interaction = optionalString(create.interactionMode ?? command.interactionMode) ?? "default";
    if (interaction !== "default" && interaction !== "plan") throw new Error(`unsupported T3 interaction mode: ${interaction}`);
    const createdValue = await this.callHost("engine.new_session", {
      provider: optionalString(selection.instanceId) ?? "codex",
      model: optionalString(selection.model),
      cwd,
      use_worktree: false,
      initial_policy: runtime,
      request_id: `t3-create:${commandId}`,
    });
    const createdId = typeof createdValue === "string"
      ? createdValue
      : (await this.sessions()).find((session) => !new Set(before.map((value) => String(value.id))).has(String(session.id)))?.id;
    if (typeof createdId !== "string") throw new Error("C2 did not return the newly created session");
    this.compatibility.aliases[publicId] = createdId;
    this.compatibility.interactionModes[publicId] = interaction;
    this.persistCompatibility();
    return createdId;
  }

  private async answerApproval(coreId: string, session: JsonObject, command: JsonObject): Promise<void> {
    const requestId = requiredString(command, "requestId");
    const decision = requiredString(command, "decision");
    if (decision === "cancel") {
      await this.callHost("engine.answer_permission", { session: coreId, request_id: requestId, option_id: null });
      return;
    }
    const pending = Array.isArray(activityState(session).pending)
      ? (activityState(session).pending as unknown[]).map(optionalObject).find((entry) => entry.input_id === requestId)
      : null;
    if (!pending) throw new Error("the approval request is no longer pending");
    const options = Array.isArray(pending.options) ? pending.options : [];
    const pattern = decision === "decline" ? /reject|decline|deny/i : decision === "acceptForSession" ? /always|session/i : /allow|accept|once/i;
    const selected = options
      .map((entry) => Array.isArray(entry) ? entry : [])
      .find((entry) => typeof entry[0] === "string" && pattern.test(String(entry[1] ?? entry[0])));
    if (!selected) throw new Error(`the provider did not offer a matching ${decision} approval option`);
    await this.callHost("engine.answer_permission", { session: coreId, request_id: requestId, option_id: selected[0] });
  }

  private threadShell(session: JsonObject, fallback: string, updatedAt: string, archived = false): JsonObject {
    const coreId = requiredString(session, "id");
    const publicId = this.publicThreadId(coreId);
    const status = sessionStatus(session);
    const path = projectPath(session, fallback);
    const pending = pendingActivities(session, updatedAt);
    return {
      id: publicId,
      projectId: projectId(path),
      title: optionalString(session.title) ?? "Untitled session",
      modelSelection: modelSelection(session),
      runtimeMode: runtimeMode(session),
      interactionMode: this.interactionMode(publicId),
      branch: null,
      worktreePath: optionalString(session.worktree_path),
      latestTurn: status.latestTurn,
      createdAt: iso(Number(session.created_at ?? Date.now())),
      updatedAt,
      archivedAt: archived ? updatedAt : null,
      settledOverride: null,
      settledAt: null,
      session: {
        threadId: publicId,
        status: status.status,
        providerName: providerId(session.provider),
        providerInstanceId: providerId(session.provider),
        runtimeMode: runtimeMode(session),
        activeTurnId: status.activeTurnId,
        lastError: status.lastError,
        updatedAt,
      },
      latestUserMessageAt: null,
      hasPendingApprovals: pending.some((item) => item.kind === "approval.requested"),
      hasPendingUserInput: pending.some((item) => item.kind === "user-input.requested"),
      hasActionableProposedPlan: false,
    };
  }

  private message(sessionId: string, seq: number, role: string, text: string, at: string): JsonObject {
    return {
      id: `codetwo-message-${sessionId}-${seq}`,
      role,
      text,
      turnId: null,
      streaming: false,
      createdAt: at,
      updatedAt: at,
    };
  }

  private activity(
    sessionId: string,
    seq: number,
    tone: string,
    kind: string,
    summary: string,
    payload: unknown,
    at: string,
  ): JsonObject {
    return {
      id: `codetwo-${kind}-${sessionId}-${seq}`,
      tone,
      kind,
      summary,
      payload,
      turnId: null,
      sequence: Math.max(0, seq),
      createdAt: at,
    };
  }

  private async providers(): Promise<JsonObject[]> {
    const values = await this.callHost("providers.list", {});
    const checkedAt = iso();
    return (Array.isArray(values) ? values : []).map((value) => {
      const provider = optionalObject(value);
      const id = optionalString(provider.id) ?? "codex";
      const available = provider.available === true && provider.enabled !== false;
      const models = Array.isArray(provider.models) ? provider.models : [];
      return {
        instanceId: id,
        driver: id,
        displayName: optionalString(provider.display_name) ?? id,
        enabled: provider.enabled !== false,
        installed: provider.available === true,
        version: null,
        status: available ? "ready" : "warning",
        auth: { status: "unknown" },
        checkedAt,
        models: models.map((value, index) => {
          const model = optionalObject(value);
          const slug = optionalString(model.id) ?? "default";
          return {
            slug,
            name: optionalString(model.name) ?? slug,
            isCustom: false,
            isDefault: index === 0,
            capabilities: null,
          };
        }),
        slashCommands: [],
        skills: [],
        ...(!available ? { message: "Provider command was not found or is disabled" } : {}),
      };
    });
  }

  private async sessions(archived = false): Promise<JsonObject[]> {
    const values = await this.callHost(archived ? "sessions.archived" : "sessions.list", {});
    return (Array.isArray(values) ? values : []).map(optionalObject);
  }

  private async projects(): Promise<JsonObject[]> {
    const values = await this.callHost("projects.list", {});
    return (Array.isArray(values) ? values : []).map(optionalObject);
  }

  private async defaultCwd(): Promise<string> {
    try {
      const value = await this.callHost("workspace.default_cwd", {});
      return optionalString(value) ?? this.cwd;
    } catch {
      return this.cwd;
    }
  }

  private async projectPaths(sessions: JsonObject[]): Promise<Map<string, string>> {
    const fallback = await this.defaultCwd();
    const paths = new Set<string>([fallback]);
    for (const project of await this.projects()) {
      const path = optionalString(project.path);
      if (path) paths.add(path);
    }
    for (const session of sessions) paths.add(projectPath(session, fallback));
    return new Map([...paths].map((path) => [projectId(path), path]));
  }

  private async fullTranscript(session: string): Promise<JsonObject[]> {
    let before: number | null = null;
    const pages: JsonObject[][] = [];
    do {
      const page = object(await this.callHost("sessions.transcript", { session, before, limit: 50 }));
      pages.push(Array.isArray(page.entries) ? page.entries.map(optionalObject) : []);
      before = typeof page.next_before === "number" ? page.next_before : null;
    } while (before !== null);
    return pages.reverse().flat();
  }

  private publicThreadId(coreId: string): string {
    return Object.entries(this.compatibility.aliases).find(([, core]) => core === coreId)?.[0] ?? coreId;
  }

  private coreThreadId(publicId: string): string {
    return this.compatibility.aliases[publicId] ?? publicId;
  }

  private interactionMode(publicId: string): "default" | "plan" {
    return this.compatibility.interactionModes[publicId] ?? "default";
  }

  private persistCompatibility(): void {
    atomicWrite(this.compatibilityPath, `${JSON.stringify(this.compatibility, null, 2)}\n`);
  }

  private send(socket: T3Socket, value: unknown): void {
    try {
      socket.send(JSON.stringify(value));
    } catch {
      this.sockets.delete(socket);
    }
  }
}
