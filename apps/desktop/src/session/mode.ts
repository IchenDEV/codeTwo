import type { ExecutionPolicy, PermissionMode, Sandbox, SessionInfo } from "../bridge";

/**
 * The session's permission posture, as one choice.
 *
 * The engine keeps two orthogonal axes — the approval mode (when it interrupts you) and an ACP
 * tool-kind ceiling (the compatibility wire name is \`sandbox\`). That is the right permission model,
 * but the wrong question to expose as a three-by-three matrix. The UI offers four meaningful pairs.
 * This control mediates ACP permission requests; it is not OS or filesystem containment.
 */
export type SessionMode = "read_only" | "ask" | "auto_edit" | "full_access";

/** What each choice resolves to underneath. Ordered as the picker and the cycle shortcut present it: loosest last. */
export const SESSION_MODES: readonly {
  id: SessionMode;
  mode: PermissionMode;
  sandbox: Sandbox;
}[] = [
  { id: "read_only", mode: "ask", sandbox: "read_only" },
  { id: "ask", mode: "ask", sandbox: "workspace_write" },
  { id: "auto_edit", mode: "accept_edits", sandbox: "workspace_write" },
  { id: "full_access", mode: "yolo", sandbox: "danger_full_access" },
];

/**
 * Which choice a live policy reads as. Sessions predate this control and remote clients still set
 * the axes independently, so this has to name *any* pair, not just the four the picker can produce.
 * Checked restrictive-ceiling-first, mirroring how the engine decides: Read-only rejects reported
 * mutation and unknown tool kinds whatever the approval mode says.
 */
export function sessionMode(mode: PermissionMode, sandbox: Sandbox): SessionMode {
  if (sandbox === "read_only") return "read_only";
  if (sandbox === "danger_full_access" || mode === "yolo") return "full_access";
  if (mode === "accept_edits") return "auto_edit";
  return "ask";
}

/** Restore both axes from the durable session projection when navigation changes sessions. */
export function sessionExecutionPolicy(
  session:
    | Pick<SessionInfo, "permission_mode" | "sandbox_policy">
    | null
    | undefined,
): ExecutionPolicy | null {
  if (!session) return null;
  return { mode: session.permission_mode, sandbox: session.sandbox_policy };
}

/** Replace the durable policy projection for one session without disturbing the other rows. */
export function withSessionExecutionPolicy<
  T extends Pick<SessionInfo, "id" | "permission_mode" | "sandbox_policy">,
>(sessions: readonly T[], sessionId: string, policy: ExecutionPolicy): T[] {
  return sessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          permission_mode: policy.mode,
          sandbox_policy: policy.sandbox,
        }
      : session,
  );
}

/** The picker cannot truthfully change while creation or a durable policy write is pending. */
export function executionPolicyChangeDisabled(
  pendingCreation: boolean,
  activeSession: string | null,
  pendingSessions: { has(session: string): boolean },
): boolean {
  return pendingCreation || (activeSession !== null && pendingSessions.has(activeSession));
}

/** The next choice along, for the cycle-mode shortcut. Wraps. */
export function nextSessionMode(current: SessionMode): SessionMode {
  const i = SESSION_MODES.findIndex((m) => m.id === current);
  return SESSION_MODES[(i + 1) % SESSION_MODES.length].id;
}
