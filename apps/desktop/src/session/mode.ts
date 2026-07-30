import type { Sandbox } from "../bridge";

/**
 * The session's permission posture, as one choice.
 *
 * The engine keeps two orthogonal axes — the approval mode (when it interrupts you) and the sandbox
 * (what it may touch at all, which vetoes before the mode is consulted). That's the right model to
 * *enforce*, but it's the wrong one to *ask*: three by three is nine combinations, and most of them
 * are nonsense ("read-only YOLO" reads like a permission but denies everything). So the UI offers
 * the four that mean something and sets both axes from them.
 */
export type SessionMode = "read_only" | "ask" | "auto_edit" | "full_access";

/** What each choice resolves to underneath. Ordered as the picker and the cycle shortcut present it: loosest last. */
export const SESSION_MODES: readonly { id: SessionMode; mode: string; sandbox: Sandbox }[] = [
  { id: "read_only", mode: "ask", sandbox: "read_only" },
  { id: "ask", mode: "ask", sandbox: "workspace_write" },
  { id: "auto_edit", mode: "accept_edits", sandbox: "workspace_write" },
  { id: "full_access", mode: "yolo", sandbox: "danger_full_access" },
];

/**
 * Which choice a live policy reads as. Sessions predate this control and remote clients still set
 * the axes independently, so this has to name *any* pair, not just the four the picker can produce.
 * Checked loosest-veto-first, mirroring how the engine decides: a read-only sandbox denies mutations
 * whatever the mode says, so it names the session regardless of how permissive the mode looks.
 */
export function sessionMode(mode: string, sandbox: Sandbox): SessionMode {
  if (sandbox === "read_only") return "read_only";
  if (sandbox === "danger_full_access" || mode === "yolo") return "full_access";
  if (mode === "accept_edits") return "auto_edit";
  return "ask";
}

/** The next choice along, for the cycle-mode shortcut. Wraps. */
export function nextSessionMode(current: SessionMode): SessionMode {
  const i = SESSION_MODES.findIndex((m) => m.id === current);
  return SESSION_MODES[(i + 1) % SESSION_MODES.length].id;
}
