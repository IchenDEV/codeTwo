import type {
  ExecutionPolicy,
  PermissionMode,
  Sandbox,
  SessionInfo,
} from "../bridge";

/**
 * The session's permission posture, as one choice.
 *
 * The engine keeps two orthogonal axes — the approval mode (when it interrupts you) and an ACP
 * tool-kind ceiling (the compatibility wire name is \`sandbox\`). That is the right permission model,
 * but the wrong question to expose as a three-by-three matrix. The UI offers four meaningful pairs.
 * This control mediates ACP permission requests; it is not OS or filesystem containment.
 */
export type SessionMode = "read_only" | "ask" | "auto_edit" | "full_access";

/**
What each choice resolves to underneath. Ordered as the picker and the cycle shortcut present it: loosest last.
*/
export const sessionModes: readonly {
  id: SessionMode;
  mode: PermissionMode;
  sandbox: Sandbox;
}[] = [
  { id: "read_only", mode: "ask", sandbox: "read_only" },
  { id: "ask", mode: "ask", sandbox: "workspace_write" },
  { id: "auto_edit", mode: "accept_edits", sandbox: "workspace_write" },
  { id: "full_access", mode: "yolo", sandbox: "danger_full_access" },
];

export function sessionMode(
  mode: PermissionMode,
  sandbox: Sandbox
): SessionMode {
  if (sandbox === "read_only") {
    return "read_only";
  }
  if (sandbox === "danger_full_access" || mode === "yolo") {
    return "full_access";
  }
  if (mode === "accept_edits") {
    return "auto_edit";
  }
  return "ask";
}

export function sessionExecutionPolicy(
  session:
    Pick<SessionInfo, "permission_mode" | "sandbox_policy"> | null | undefined
): ExecutionPolicy | null {
  if (!session) {
    return null;
  }
  return { mode: session.permission_mode, sandbox: session.sandbox_policy };
}

export function withSessionExecutionPolicy<
  T extends Pick<SessionInfo, "id" | "permission_mode" | "sandbox_policy">,
>(sessions: readonly T[], sessionId: string, policy: ExecutionPolicy): T[] {
  return sessions.map((session) => {
    return session.id === sessionId
      ? {
          ...session,
          permission_mode: policy.mode,
          sandbox_policy: policy.sandbox,
        }
      : session;
  });
}

export function executionPolicyChangeDisabled(
  isPendingCreation: boolean,
  activeSession: string | null,
  pendingSessions: { has: (session: string) => boolean }
): boolean {
  return (
    isPendingCreation ||
    (activeSession !== null && pendingSessions.has(activeSession))
  );
}

export function nextSessionMode(current: SessionMode): SessionMode {
  const index = sessionModes.findIndex((m) => m.id === current);
  return sessionModes[(index + 1) % sessionModes.length].id;
}
