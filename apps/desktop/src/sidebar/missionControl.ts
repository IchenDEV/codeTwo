import type { SessionInfo } from "../bridge";
import { contextWindowPercentage } from "../session/contextWindow";
import type { ContextWindowBySession } from "../session/contextWindow";
import { sessionActivity } from "../session/sessionEvents";

/**
The four glanceable states a session can be in, mirroring the rail's row derivation.
*/
export type MissionState = "running" | "awaiting_input" | "failed" | "idle";

export interface MissionRow {
  session: SessionInfo;
  state: MissionState;
  /**
  "What needs me": a question waiting on the user, or a failure to look at.
  */
  needsMe: boolean;
  /**
  The scene reference bound to this session, when one is remembered.
  */
  scene: string | null;
  /**
  Context occupancy 0–100, when the provider has reported a window.
  */
  contextPct: number | null;
}

export function missionState(
  session: Pick<SessionInfo, "id" | "activity">,
  runningSessions: ReadonlySet<string>
): MissionState {
  const { kind } = sessionActivity(session).state;
  if (kind === "awaiting_input") {
    return "awaiting_input";
  }
  if (kind === "failed") {
    return "failed";
  }
  if (runningSessions.has(session.id) || kind === "running") {
    return "running";
  }
  return "idle";
}

export function needsMeCount(
  sessions: readonly Pick<SessionInfo, "id" | "activity">[]
): number {
  return sessions.filter((session) => {
    const { kind } = sessionActivity(session).state;
    return kind === "awaiting_input" || kind === "failed";
  }).length;
}

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
      contextPct: window ? contextWindowPercentage(window) : null,
      needsMe: state === "awaiting_input" || state === "failed",
      scene: sceneBySession.get(session.id) ?? null,
      session,
      state,
    };
  });
  const rank = (row: MissionRow) =>
    row.needsMe ? 0 : row.state === "running" ? 1 : 2;
  // `Array.prototype.sort` is stable, so equal ranks keep the caller's ordering.
  return rows.sort((a, b) => rank(a) - rank(b));
}
