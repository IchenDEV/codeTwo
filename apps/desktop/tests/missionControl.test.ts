import { describe, expect, test } from "bun:test";

import {
  missionRows,
  missionState,
  needsMeCount,
} from "../src/sidebar/missionControl.ts";
import type { SessionInfo } from "../src/bridge";

let counter = 0;

function session(
  id: string,
  activityKind: "running" | "awaiting_input" | "failed" | "idle" | null = null
): SessionInfo {
  const state =
    activityKind === "awaiting_input"
      ? { kind: "awaiting_input" as const, turn_id: "t1", pending: [] }
      : activityKind === "failed"
        ? {
            kind: "failed" as const,
            reason: "provider_error" as const,
            message: "boom",
          }
        : activityKind === "running"
          ? { kind: "running" as const, turn_id: "t1" }
          : { kind: "idle" as const };
  return {
    id,
    title: `Session ${id}`,
    title_origin: "default",
    pinned: false,
    provider: "claude_code",
    model: null,
    cwd: "/tmp/repo",
    worktree_path: null,
    project_path: "/tmp/repo",
    permission_mode: "ask",
    sandbox_policy: "workspace_write",
    acp_session_id: null,
    memory_read: "inherit",
    memory_write: "inherit",
    created_at: ++counter,
    ...(activityKind === null ? {} : { activity: { revision: 1, state } }),
  } as SessionInfo;
}

const none = new Set<string>();
const noScenes = new Map<string, string>();

describe("missionState", () => {
  test("mirrors the rail: activity first, then the frontend running set", () => {
    expect(missionState(session("a", "awaiting_input"), none)).toBe(
      "awaiting_input"
    );
    expect(missionState(session("b", "failed"), none)).toBe("failed");
    expect(missionState(session("c", "running"), none)).toBe("running");
    expect(missionState(session("d", "idle"), none)).toBe("idle");
    // A session with no activity projection at all (older core) is idle.
    expect(missionState(session("e", null), none)).toBe("idle");
  });

  test("the in-flight set marks a session running before the core projection lands", () => {
    expect(missionState(session("a", "idle"), new Set(["a"]))).toBe("running");
    expect(missionState(session("b", null), new Set(["b"]))).toBe("running");
  });

  test("awaiting input and failed win over the running set", () => {
    expect(missionState(session("a", "awaiting_input"), new Set(["a"]))).toBe(
      "awaiting_input"
    );
    expect(missionState(session("b", "failed"), new Set(["b"]))).toBe("failed");
  });
});

describe("missionRows", () => {
  test("needsMe is exactly awaiting input or failed", () => {
    const rows = missionRows(
      [
        session("run", "running"),
        session("ask", "awaiting_input"),
        session("bad", "failed"),
        session("idle", "idle"),
      ],
      none,
      {},
      noScenes
    );
    const byId = Object.fromEntries(rows.map((r) => [r.session.id, r]));
    expect(byId.ask.needsMe).toBe(true);
    expect(byId.bad.needsMe).toBe(true);
    expect(byId.run.needsMe).toBe(false);
    expect(byId.idle.needsMe).toBe(false);
  });

  test("orders needsMe first, then running, then idle — stable within groups", () => {
    const rows = missionRows(
      [
        session("idle1", "idle"),
        session("run1", "running"),
        session("ask1", "awaiting_input"),
        session("idle2", "idle"),
        session("bad1", "failed"),
        session("run2", "running"),
      ],
      none,
      {},
      noScenes
    );
    expect(rows.map((r) => r.session.id)).toEqual([
      "ask1",
      "bad1",
      "run1",
      "run2",
      "idle1",
      "idle2",
    ]);
  });

  test("carries the remembered scene and the context percentage", () => {
    const rows = missionRows(
      [session("a", "idle"), session("b", "idle")],
      none,
      { a: { usedTokens: 50_000, contextWindow: 200_000 }, b: null },
      new Map([["a", "builtin:develop"]])
    );
    expect(rows[0].scene).toBe("builtin:develop");
    expect(rows[0].contextPct).toBe(25);
    expect(rows[1].scene).toBeNull();
    expect(rows[1].contextPct).toBeNull();
  });
});

describe("needsMeCount", () => {
  test("counts only sessions waiting on input or failed", () => {
    expect(
      needsMeCount([
        session("a", "running"),
        session("b", "awaiting_input"),
        session("c", "failed"),
        session("d", "idle"),
        session("e", null),
      ])
    ).toBe(2);
    expect(needsMeCount([])).toBe(0);
  });
});
