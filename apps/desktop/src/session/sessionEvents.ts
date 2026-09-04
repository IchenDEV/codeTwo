import type {
  CoreEvent,
  ElicitationForm,
  PermissionContext,
  ResolvedWorktreeBaseline,
  SessionActivity,
  SessionInfo,
  WorktreeBaselineKind,
  WorktreeBaselineOption,
} from "../bridge";

/**
 * One thing the agent is waiting on the user for. Permissions and structured questions (ACP
 * elicitations) share the queue because they share the rule that matters: one turn, one blocked
 * agent, answered oldest first. `form` is what tells them apart at render time.
 */
export interface PermissionQueueItem {
  session: string;
  requestId: string;
  title: string;
  options: [string, string][];
  sequence?: number;
  context?: PermissionContext;
  /**
  Set when this is a question to answer rather than a permission to grant.
  */
  form?: ElicitationForm | null;
}

export const idleSessionActivity: SessionActivity = {
  revision: 0,
  state: { kind: "idle" },
};

export function sessionActivity(
  session: Pick<SessionInfo, "activity">
): SessionActivity {
  return session.activity ?? idleSessionActivity;
}

export function activityIsBusy(activity: SessionActivity | undefined): boolean {
  const kind = activity?.state.kind ?? "idle";
  return kind === "running" || kind === "awaiting_input";
}

export function latestActivity(
  current: SessionActivity | undefined,
  incoming: SessionActivity | undefined
): SessionActivity {
  if (!incoming) {
    return current ?? idleSessionActivity;
  }
  if (!current || incoming.revision >= current.revision) {
    return incoming;
  }
  return current;
}

export function permissionsFromSessions(
  sessions: readonly Pick<SessionInfo, "id" | "activity">[]
): PermissionQueueItem[] {
  return sessions
    .flatMap((session) => {
      const { state } = sessionActivity(session);
      if (state.kind !== "awaiting_input") {
        return [];
      }
      return state.pending.map((pending) => {
        return {
          context: pending.context,
          form: pending.form,
          options: pending.options,
          requestId: pending.input_id,
          sequence: pending.sequence,
          session: session.id,
          title: pending.title,
        };
      });
    })
    .sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
}

export function pendingInputsForSession(
  queue: readonly PermissionQueueItem[],
  session: string | null
): PermissionQueueItem[] {
  if (session == null || session === "") {
    return [];
  }
  return queue.filter((request) => request.session === session);
}

export function permissionQueueAfterActivity(
  queue: readonly PermissionQueueItem[],
  session: string,
  activity: SessionActivity
): PermissionQueueItem[] {
  const pending = permissionsFromSessions([{ activity, id: session }]);
  return [
    ...queue.filter((request) => request.session !== session),
    ...pending,
  ].sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0));
}

export function permissionQueueAfterAnswer(
  queue: readonly PermissionQueueItem[],
  session: string,
  requestId: string,
  isAccepted: boolean
): PermissionQueueItem[] {
  if (!isAccepted) {
    return [...queue];
  }
  return queue.filter(
    (request) => request.session !== session || request.requestId !== requestId
  );
}

export function enqueuePermission(
  queue: PermissionQueueItem[],
  request: PermissionQueueItem
): PermissionQueueItem[] {
  const existing = queue.findIndex(
    (item) =>
      item.session === request.session && item.requestId === request.requestId
  );
  return existing === -1
    ? [...queue, request]
    : queue.map((item, index) => (index === existing ? request : item));
}

export function shouldRenderSessionEvent(
  event: CoreEvent,
  activeSession: string | null,
  awaitingCreationRequest: string | null = null,
  paneSessions: ReadonlySet<string> | null = null
): boolean {
  if (
    event.event === "permission_request" ||
    event.event === "elicitation_request"
  ) {
    return true;
  }
  if (
    event.event === "session_created" ||
    event.event === "session_title_changed" ||
    event.event === "session_activity_changed"
  ) {
    return false;
  }
  // Session creation is broadcast to every connected client. A correlated global failure is
  // transcript-worthy only for the client that owns that request.
  if (
    event.event === "error" &&
    event.session === null &&
    event.request_id !== null &&
    event.request_id !== undefined
  ) {
    return (
      awaitingCreationRequest !== null &&
      event.request_id === awaitingCreationRequest
    );
  }
  if (event.session === null || event.session === activeSession) {
    return true;
  }
  return paneSessions !== null && paneSessions.has(event.session);
}

export function paneBoundToSession(
  panes: Readonly<Record<string, { sessionId: string | null }>>,
  session: string
): string | null {
  for (const [paneId, content] of Object.entries(panes)) {
    if (content.sessionId === session) {
      return paneId;
    }
  }
  return null;
}

export function isTerminalSessionEvent(event: CoreEvent): boolean {
  return (
    event.event === "turn_ended" || (event.event === "error" && event.terminal)
  );
}

export function matchesSessionCreation(
  event: Extract<CoreEvent, { event: "session_created" }>,
  requestId: string | null
): boolean {
  return requestId !== null && event.request_id === requestId;
}

export function sessionProjectPath(
  session: Pick<SessionInfo, "cwd" | "worktree_path" | "project_path">
): string | null {
  return (
    session.project_path ??
    (session.worktree_path === null ? session.cwd : null)
  );
}

export function sessionCreationSource(
  activeProject: string | null,
  cwd: string,
  current:
    | Pick<SessionInfo, "cwd" | "worktree_path" | "project_path">
    | null
    | undefined,
  hasActiveSession = false
): string | null {
  // An active id without either a list shell or a correlated creation receipt is ambiguous: `cwd`
  // may be inside an isolated checkout, so using it would create a nested worktree.
  if (hasActiveSession && !current) {
    return null;
  }
  if (activeProject != null && activeProject !== "") {
    return activeProject;
  }
  if (current?.worktree_path !== null && current?.worktree_path !== undefined) {
    return current.project_path != null && current.project_path !== ""
      ? current.project_path
      : null;
  }
  if (current?.project_path != null && current.project_path !== "") {
    return current.project_path;
  }
  if (current?.cwd != null && current.cwd !== "") {
    return current.cwd;
  }
  return cwd != null && cwd !== "" ? cwd : ".";
}

export function sessionCreationBaseline(
  current:
    | Pick<
        SessionInfo,
        "worktree_path" | "worktree_baseline" | "worktree_identity"
      >
    | null
    | undefined
): WorktreeBaselineKind | null | undefined {
  if (!current) {
    return undefined;
  }
  if (current.worktree_path === null) {
    return null;
  }
  // A ref+SHA proves the commit a legacy checkout started from, not that the pathname still names
  // the same directory. Do not treat it as a fully verified worktree without durable FS identity.
  if (!current.worktree_identity) {
    return undefined;
  }
  return current.worktree_baseline?.kind;
}

export function worktreeGatingReason(
  hasSession: boolean,
  options: WorktreeBaselineOption[],
  isLoading: boolean
): string | null {
  if (hasSession || isLoading || options.length === 0) {
    return null;
  }
  if (options.some((option) => option.unavailable_reason === null)) {
    return null;
  }
  return options[0].unavailable_reason;
}

export function sessionCreationBaselineSha(
  baseline: WorktreeBaselineKind | null,
  options: WorktreeBaselineOption[],
  isLoading: boolean
): string | null | undefined {
  if (baseline === null) {
    return null;
  }
  if (isLoading) {
    return undefined;
  }
  return options.find((option) => option.kind === baseline)?.resolved?.sha;
}

export type SessionCreationShell = Pick<
  SessionInfo,
  | "cwd"
  | "project_path"
  | "worktree_path"
  | "worktree_baseline"
  | "worktree_identity"
>;

export function sessionShellWithReceipt(
  activeSession: string | null,
  stored: SessionCreationShell | undefined,
  receipt: { session: string; shell: SessionCreationShell } | null
): SessionCreationShell | undefined {
  return (
    stored ?? (receipt?.session === activeSession ? receipt.shell : undefined)
  );
}

export function activeSessionWorktreeState(
  activeSession: string | null,
  stored: SessionCreationShell | undefined,
  receipt: { session: string; shell: SessionCreationShell } | null
): { baseline: ResolvedWorktreeBaseline | null; legacyUnknown: boolean } {
  const shell = sessionShellWithReceipt(activeSession, stored, receipt);
  if (shell?.worktree_path == null || shell?.worktree_path === "") {
    return { baseline: null, legacyUnknown: false };
  }
  return {
    baseline: shell.worktree_baseline ?? null,
    // A persisted row must carry filesystem identity. A just-created receipt has not reached the
    // list yet, so its bundled baseline is sufficient to render the creation result truthfully.
    legacyUnknown: stored
      ? !stored.worktree_identity
      : !shell.worktree_baseline,
  };
}

export function sessionCreationReceipt(
  event: Extract<CoreEvent, { event: "session_created" }>
): SessionCreationShell | null {
  // New producers always persist a source project. Its absence means the event predates provenance
  // receipts; `cwd` alone cannot distinguish a normal checkout from an isolated worktree.
  if (
    event.cwd == null ||
    event.cwd === "" ||
    event.project_path == null ||
    event.project_path === ""
  ) {
    return null;
  }
  return {
    cwd: event.cwd,
    project_path: event.project_path,
    worktree_baseline: event.worktree_baseline ?? null,
    worktree_path: event.worktree_path ?? null,
  };
}
