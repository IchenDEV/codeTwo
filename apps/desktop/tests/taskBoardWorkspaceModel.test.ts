import { afterEach, describe, expect, test } from "bun:test";

import type { Translate } from "../src/i18n";
import type { SidebarPullRequestStatus } from "../src/sidebar/sidebarGitStatus";
import type { BoardTask } from "../src/taskboard/taskBoard";
import {
  checkoutLabel,
  formatUpdatedAt,
  LANE_TONES,
  laneLabel,
  openPullRequestCount,
  projectTasks,
  PULL_REQUEST_TONES,
  pullRequestStatusLabel,
  sessionActivityDescription,
  sessionActivityKind,
  sessionCheckoutPath,
  sessionStatusLabel,
  sessionStatusTone,
  sessionUpdatedAt,
} from "../src/taskboard/workspaceModel";
import type { SessionProjection } from "../src/taskboard/workspaceTypes";

const originalNow = Date.now;
const t: Translate = (key, values) =>
  `${key}:${values?.count ?? values?.date ?? ""}`;

function task(overrides: Partial<BoardTask> = {}): BoardTask {
  return {
    id: "task-1",
    title: "Task",
    description: "",
    status: "in_progress",
    priority: "medium",
    labels: [],
    order: 1,
    createdAt: 100,
    updatedAt: 200,
    sessionIds: [],
    pullRequest: null,
    pullRequestLinkRevision: 0,
    ...overrides,
  };
}

function session(
  overrides: Partial<SessionProjection> = {}
): SessionProjection {
  return {
    id: "session-1",
    title: "Session",
    archived: false,
    number: 1,
    current: false,
    ...overrides,
  };
}

function pullRequest(
  state: SidebarPullRequestStatus["state"]
): SidebarPullRequestStatus {
  return { number: 1, url: "https://example.test/pull/1", state };
}

afterEach(() => {
  Date.now = originalNow;
});

describe("TaskBoard workspace model", () => {
  test("keeps every lane and pull-request tone explicit", () => {
    expect(LANE_TONES).toEqual({
      queue: "neutral",
      running: "success",
      needs_you: "warning",
      done: "success",
    });
    expect(PULL_REQUEST_TONES).toEqual({
      merged: "text-success",
      conflicting: "text-destructive",
      ci_failed: "text-destructive",
      ci_running: "text-warning",
      open: "text-primary",
      closed: "text-muted-foreground",
    });
  });

  test("labels every projected task lane", () => {
    expect(laneLabel(t, "queue")).toBe("taskboard.lane.queue:");
    expect(laneLabel(t, "running")).toBe("taskboard.lane.running:");
    expect(laneLabel(t, "needs_you")).toBe("taskboard.lane.needsYou:");
    expect(laneLabel(t, "done")).toBe("taskboard.lane.done:");
  });

  test("formats each relative-time boundary and the dated fallback", () => {
    const now = Date.UTC(2026, 0, 10, 12);
    Date.now = () => now;
    expect(formatUpdatedAt(now + 1, "en-US", t)).toBe("taskboard.updatedNow:");
    expect(formatUpdatedAt(now - 3_599_999, "en-US", t)).toBe(
      "taskboard.updatedNow:"
    );
    expect(formatUpdatedAt(now - 3_600_000, "en-US", t)).toBe(
      "taskboard.updatedHours:1"
    );
    expect(formatUpdatedAt(now - 86_400_000, "en-US", t)).toBe(
      "taskboard.updatedDays:1"
    );
    expect(formatUpdatedAt(now - 604_800_000, "en-US", t)).toBe(
      "taskboard.updatedOn:Jan 3"
    );
  });

  test("derives activity without hiding a provider state", () => {
    expect(sessionActivityKind()).toBe("idle");
    expect(sessionActivityKind(session({ running: false }))).toBe("idle");
    expect(sessionActivityKind(session({ running: true }))).toBe("running");
    expect(
      sessionActivityKind(
        session({
          running: true,
          activity: {
            revision: 1,
            state: { kind: "failed", reason: "provider_error", message: "bad" },
          },
        })
      )
    ).toBe("failed");
  });

  test("uses timestamps and checkout identities in precedence order", () => {
    expect(
      sessionUpdatedAt(session({ lastActiveAt: 0, createdAt: 2 }), 3)
    ).toBe(0);
    expect(sessionUpdatedAt(session({ createdAt: 2 }), 3)).toBe(2);
    expect(sessionUpdatedAt(session(), 3)).toBe(3);
    expect(sessionCheckoutPath()).toBeNull();
    expect(
      sessionCheckoutPath(
        session({ worktreeDiscarded: true, worktreePath: "/w" })
      )
    ).toBeNull();
    expect(
      sessionCheckoutPath(session({ worktreePath: "/w", cwd: "/c" }))
    ).toBe("/w");
    expect(sessionCheckoutPath(session({ cwd: "/c" }))).toBe("/c");
    expect(sessionCheckoutPath(session())).toBeNull();
  });

  test("labels checkouts without leaking an irrelevant path prefix", () => {
    expect(checkoutLabel(t, session({ worktreeDiscarded: true }), "/a/b")).toBe(
      "taskboard.worktreeDiscarded:"
    );
    expect(checkoutLabel(t, session(), "/a/b/c")).toBe("b/c");
    expect(checkoutLabel(t, session(), "/a//b")).toBe("a/b");
    expect(checkoutLabel(t, session(), "C:\\a\\b")).toBe("a/b");
    expect(checkoutLabel(t, session(), "/")).toBe("/");
    expect(checkoutLabel(t, session(), null)).toBe("taskboard.noCheckout:");
  });

  test("maps every activity state to status copy and tone", () => {
    const awaiting = session({
      activity: {
        revision: 1,
        state: { kind: "awaiting_input", turn_id: "t", pending: [] },
      },
    });
    const failed = session({
      activity: {
        revision: 1,
        state: { kind: "failed", reason: "provider_error", message: "bad" },
      },
    });
    const running = session({
      activity: { revision: 1, state: { kind: "running", turn_id: "t" } },
    });
    expect(sessionStatusLabel(t, awaiting)).toBe("session.awaitingInput:");
    expect(sessionStatusLabel(t, failed)).toBe("session.failed:");
    expect(sessionStatusLabel(t, running)).toBe("session.running:");
    expect(sessionStatusLabel(t, session())).toBe("session.completed:");
    expect(sessionStatusTone(awaiting)).toBe("warning");
    expect(sessionStatusTone(failed)).toBe("destructive");
    expect(sessionStatusTone(running)).toBe("success");
    expect(sessionStatusTone({ ...running, archived: true })).toBe("success");
    expect(sessionStatusTone(session({ archived: true }))).toBe("neutral");
    expect(sessionStatusTone(session())).toBe("success");
  });

  test("describes attention, failure, and ordinary activity", () => {
    const awaiting = (pending: boolean): SessionProjection =>
      session({
        activity: {
          revision: 1,
          state: {
            kind: "awaiting_input",
            turn_id: "t",
            pending: pending
              ? [
                  {
                    input_id: "i",
                    kind: "permission",
                    title: "Choose",
                    options: [],
                    sequence: 1,
                  },
                ]
              : [],
          },
        },
      });
    expect(sessionActivityDescription(t, awaiting(true))).toBe("Choose");
    expect(sessionActivityDescription(t, awaiting(false))).toBe(
      "taskboard.attention.inputDescription:"
    );
    expect(
      sessionActivityDescription(
        t,
        session({
          activity: {
            revision: 1,
            state: {
              kind: "failed",
              reason: "interrupted",
              message: "Stopped",
            },
          },
        })
      )
    ).toBe("Stopped");
    expect(sessionActivityDescription(t, session())).toBe("session.completed:");
  });

  test("projects newest-first history and selects the latest available session", () => {
    const sessions = new Map([
      ["s1", session({ id: "s1", title: "Old", archived: false })],
      ["s2", session({ id: "s2", title: "New", archived: true })],
    ]);
    const [projected] = projectTasks(
      [task({ sessionIds: ["s1", "missing", "s2"] })],
      sessions
    );
    expect(
      projected.sessions.map(({ id, number, current }) => ({
        id,
        number,
        current,
      }))
    ).toEqual([
      { id: "s2", number: 3, current: false },
      { id: "s1", number: 1, current: true },
    ]);
    expect(projected.currentSession?.id).toBe("s1");
    expect(projected.lane).toBe("queue");
    const [allArchived] = projectTasks(
      [task({ sessionIds: ["s2"] })],
      sessions
    );
    expect(allArchived.currentSession).toBeUndefined();
    const activeSessions = new Map([
      ["s1", session({ id: "s1", archived: false })],
      ["s2", session({ id: "s2", archived: false })],
    ]);
    const [latestActive] = projectTasks(
      [task({ sessionIds: ["s1", "s2"] })],
      activeSessions
    );
    expect(latestActive.currentSession?.id).toBe("s2");
  });

  test("counts only open delivery states for usable checkouts", () => {
    const states: SidebarPullRequestStatus["state"][] = [
      "merged",
      "closed",
      "open",
      "conflicting",
      "ci_failed",
      "ci_running",
    ];
    const sessions = states.map((state, index) =>
      session({ id: state, cwd: `/${index}` })
    );
    sessions.push(
      session({ id: "none" }),
      session({ id: "discarded", cwd: "/x", worktreeDiscarded: true })
    );
    const pullRequests = new Map(
      states.map((state, index) => [`/${index}`, pullRequest(state)])
    );
    expect(openPullRequestCount(sessions, pullRequests)).toBe(4);
    expect(openPullRequestCount([], pullRequests)).toBe(0);
    expect(openPullRequestCount(sessions, new Map())).toBeNull();
  });

  test("uses the matching pull-request translation key", () => {
    for (const state of [
      "merged",
      "conflicting",
      "ci_failed",
      "ci_running",
      "open",
      "closed",
    ] as const) {
      expect(pullRequestStatusLabel(t, state)).toBe(
        `rail.pullRequest.${state}:`
      );
    }
  });
});
