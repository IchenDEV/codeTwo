import { describe, expect, test } from "bun:test";

import type { WorktreeStatusEntry } from "../src/bridge";
import {
  worktreeBranchDisplay,
  worktreeDiscardRoute,
  worktreeStatusBadges,
} from "../src/settings/worktrees";

const entry = (
  overrides: Partial<WorktreeStatusEntry>
): WorktreeStatusEntry => ({
  path: "/repo/.codetwo-worktrees/one",
  kind: "session",
  registered: true,
  checkout_present: true,
  session_archived: false,
  worktree_discarded: false,
  ...overrides,
});

describe("project worktree management rows", () => {
  test("shows the branch name people type, not the full ref", () => {
    expect(worktreeBranchDisplay("refs/heads/codetwo/fix")).toBe("codetwo/fix");
    expect(worktreeBranchDisplay("codetwo/fix")).toBe("codetwo/fix");
    expect(worktreeBranchDisplay()).toBeNull();
  });

  test("derives status badges in display order", () => {
    expect(worktreeStatusBadges(entry({}))).toEqual([]);
    expect(
      worktreeStatusBadges(
        entry({
          session_archived: true,
          worktree_discarded: true,
          checkout_present: false,
        })
      )
    ).toEqual(["archived", "discarded", "checkoutMissing"]);
    expect(worktreeStatusBadges(entry({ checkout_present: false }))).toEqual([
      "checkoutMissing",
    ]);
  });

  test("routes session-claimed checkouts through their session and the rest by path", () => {
    expect(worktreeDiscardRoute(entry({ session_id: "s-1" }))).toEqual({
      kind: "session",
      session: "s-1",
    });
    expect(worktreeDiscardRoute(entry({ kind: "orphan" }))).toEqual({
      kind: "orphan",
      worktreePath: "/repo/.codetwo-worktrees/one",
    });
    // A session row that somehow lost its id still cleans up by path rather than doing nothing.
    expect(worktreeDiscardRoute(entry({ session_id: undefined }))).toEqual({
      kind: "orphan",
      worktreePath: "/repo/.codetwo-worktrees/one",
    });
  });
});
