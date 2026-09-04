import type { SessionInfo } from "../bridge";
import {
  contextWindowPercentage,
  type ContextWindowBySession,
} from "../session/contextWindow";
import { sessionActivity } from "../session/sessionEvents";

/** The four glanceable states a session can be in, mirroring the rail's row derivation. */
export type MissionState = "running" | "awaiting_input" | "failed" | "idle";

export interface MissionRow {
  session: SessionInfo;
  state: MissionState;
  /** "What needs me": a question waiting on the user, or a failure to look at. */
  needsMe: boolean;
  /** The scene reference bound to this session, when one is remembered. */
  scene: string | null;
  /** Context occupancy 0–100, when the provider has reported a window. */
  contextPct: number | null;
}

/**
 * One session's mission state, derived exactly the way `SessionRail.sessionRow` does it:
 * awaiting-input and failed come from the core activity projection; running additionally
 * respects the frontend's in-flight set so a just-started turn shows immediately.
 */
export function missionState(
  session: Pick<SessionInfo, "id" | "activity">,
  runningSessions: ReadonlySet<string>
): MissionState {
  const kind = sessionActivity(session).state.kind;
  if (kind === "awaiting_input") return "awaiting_input";
  if (kind === "failed") return "failed";
  if (runningSessions.has(session.id) || kind === "running") return "running";
  return "idle";
}

/** Attention rows for the rail badge: sessions waiting on input or sitting on a failure. */
export function needsMeCount(
  sessions: readonly Pick<SessionInfo, "id" | "activity">[]
): number {
  return sessions.filter((session) => {
    const kind = sessionActivity(session).state.kind;
    return kind === "awaiting_input" || kind === "failed";
  }).length;
}

/**
 * Every session as a mission row, ordered by urgency: what needs me first, then what's still
 * working, then the idle rest — stable within each group, so rows keep their list order.
 */
export function missionRows(
  sessions: readonly SessionInfo[],
  runningSessions: ReadonlySet<string>,
  contextWindows: ContextWindowBySession,
  sceneBySession: ReadonlyMap<string, string>
): MissionRow[] {
  const rows = sessions.map((session): MissionRow => {
    const state = missionState(session, runningSessions);
    const window = contextWindows[session.id] ?? null;
    return {
      session,
      state,
      needsMe: state === "awaiting_input" || state === "failed",
      scene: sceneBySession.get(session.id) ?? null,
      contextPct: window ? contextWindowPercentage(window) : null,
    };
  });
  const rank = (row: MissionRow) =>
    row.needsMe ? 0 : row.state === "running" ? 1 : 2;
  // `Array.prototype.sort` is stable, so equal ranks keep the caller's ordering.
  return rows.sort((a, b) => rank(a) - rank(b));
}
