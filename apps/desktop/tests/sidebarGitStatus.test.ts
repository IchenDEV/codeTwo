import { describe, expect, test } from "bun:test";

import type { GitHubPullRequest } from "../src/bridge";
import {
  loadSidebarPullRequests,
  sidebarPullRequestStatus,
} from "../src/sidebar/sidebarGitStatus";

function pullRequest(
  overrides: Partial<GitHubPullRequest> = {}
): GitHubPullRequest {
  return {
    number: 42,
    title: "Sidebar",
    url: "https://github.com/example/repo/pull/42",
    state: "OPEN",
    is_draft: false,
    head_ref: "feature",
    base_ref: "main",
    additions: 1,
    deletions: 0,
    changed_files: 1,
    body: "",
    review_decision: null,
    mergeable: "MERGEABLE",
    merge_state_status: "CLEAN",
    author: "author",
    comments_count: 0,
    reviews_count: 0,
    checks: [],
    created_at: "2026-08-31T00:00:00Z",
    updated_at: "2026-08-31T00:00:00Z",
    ...overrides,
  };
}

describe("sidebar GitHub status", () => {
  test("distinguishes merged, conflict, failed CI, running CI, open, and closed PRs", () => {
    expect(
      sidebarPullRequestStatus(pullRequest({ state: "MERGED" }))?.state
    ).toBe("merged");
    expect(
      sidebarPullRequestStatus(pullRequest({ mergeable: "CONFLICTING" }))?.state
    ).toBe("conflicting");
    expect(
      sidebarPullRequestStatus(
        pullRequest({
          checks: [
            {
              name: "test",
              status: "COMPLETED",
              conclusion: "FAILURE",
              details_url: null,
              workflow_name: null,
            },
          ],
        })
      )?.state
    ).toBe("ci_failed");
    expect(
      sidebarPullRequestStatus(
        pullRequest({
          checks: [
            {
              name: "test",
              status: "IN_PROGRESS",
              conclusion: null,
              details_url: null,
              workflow_name: null,
            },
          ],
        })
      )?.state
    ).toBe("ci_running");
    expect(sidebarPullRequestStatus(pullRequest())?.state).toBe("open");
    expect(
      sidebarPullRequestStatus(pullRequest({ state: "CLOSED" }))?.state
    ).toBe("closed");
    expect(sidebarPullRequestStatus(null)).toBeNull();
  });

  test("deduplicates checkout paths and isolates lookup failures", async () => {
    const calls: string[] = [];
    const statuses = await loadSidebarPullRequests(
      [{ path: "/one" }, { path: "/one" }, { path: "/two" }],
      async (path) => {
        calls.push(path);
        if (path === "/two") throw new Error("offline");
        return pullRequest({ number: 7 });
      },
      2
    );

    expect(calls.toSorted()).toEqual(["/one", "/two"]);
    expect(statuses.get("/one")).toEqual({
      number: 7,
      url: "https://github.com/example/repo/pull/42",
      state: "open",
    });
    expect(statuses.has("/two")).toBe(false);
  });
});
