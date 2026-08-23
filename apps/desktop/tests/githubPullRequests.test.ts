import { describe, expect, test } from "bun:test";

import { githubPullRequestInternals } from "../src/electrobun/host/github";
import { builtinPluginForCommand } from "../src/electrobun/host/builtinPlugins";
import {
  filterPullRequests,
  groupPullRequests,
  pullRequestCheckState,
  shortPullRequestAge,
} from "../src/github/pullRequests";
import type { GitHubPullRequestDetail, GitHubPullRequestSummary } from "../src/bridge";

const NOW = Date.UTC(2026, 7, 24, 12);

function summary(
  id: string,
  relation: Partial<Pick<GitHubPullRequestSummary, "authored" | "reviewRequested" | "reviewed">>,
): GitHubPullRequestSummary {
  return {
    id,
    number: Number(id),
    title: `Pull request ${id}`,
    url: `https://github.com/acme/repo/pull/${id}`,
    repository: { name: "repo", nameWithOwner: "acme/repo" },
    author: { login: "octocat" },
    isDraft: id === "3",
    updatedAt: new Date(NOW - Number(id) * 3_600_000).toISOString(),
    createdAt: new Date(NOW - Number(id) * 86_400_000).toISOString(),
    labels: [],
    commentsCount: 0,
    authored: false,
    reviewRequested: false,
    reviewed: false,
    ...relation,
  };
}

describe("GitHub pull request host normalization", () => {
  test("keeps GitHub PR commands inside the existing Git plugin", () => {
    expect(builtinPluginForCommand("github.pull_requests").id).toBe("git");
    expect(builtinPluginForCommand("github.pull_request").id).toBe("git");
  });

  test("accepts only canonical github.com pull request URLs", () => {
    expect(githubPullRequestInternals.pullRequestCoordinates(
      "https://github.com/acme/repo/pull/42",
    )).toEqual({ owner: "acme", repo: "repo", number: 42 });
    expect(() => githubPullRequestInternals.pullRequestCoordinates(
      "https://github.example/acme/repo/pull/42",
    )).toThrow("canonical github.com");
    expect(() => githubPullRequestInternals.pullRequestCoordinates(
      "https://github.com/acme/repo/issues/42",
    )).toThrow("canonical github.com");
  });

  test("normalizes search relations and detailed check, reviewer, and file data", () => {
    const row = githubPullRequestInternals.searchSummary({
      number: 7,
      title: "Ship it",
      url: "https://github.com/acme/repo/pull/7",
      repository: { name: "repo", nameWithOwner: "acme/repo" },
      author: { login: "octocat" },
      isDraft: false,
      updatedAt: "2026-08-24T10:00:00Z",
      createdAt: "2026-08-23T10:00:00Z",
      labels: [{ name: "ui", color: "123456" }],
      commentsCount: 2,
    }, "reviewRequested");
    expect(row).toMatchObject({ id: "https://github.com/acme/repo/pull/7", reviewRequested: true });
    const detail = githubPullRequestInternals.detailFromJson({
      title: "Ship it",
      url: row?.url,
      number: 7,
      author: { login: "octocat" },
      body: "## Change\n\n- Ready",
      additions: 10,
      deletions: 2,
      changedFiles: 1,
      baseRefName: "main",
      headRefName: "feature",
      state: "OPEN",
      reviewRequests: [{ login: "reviewer" }],
      latestReviews: [{ author: { login: "approver" }, state: "APPROVED" }],
      statusCheckRollup: [{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" }],
      files: [{ path: "src/app.ts", additions: 10, deletions: 2, changeType: "MODIFIED" }],
    }, row!);
    expect(detail.reviewers).toEqual([
      { login: "reviewer", state: "REQUESTED" },
      { login: "approver", state: "APPROVED" },
    ]);
    expect(detail.files).toEqual([
      { path: "src/app.ts", additions: 10, deletions: 2, changeType: "MODIFIED" },
    ]);
    expect(pullRequestCheckState(detail)).toBe("passed");
  });
});

describe("GitHub pull request projections", () => {
  const items = [
    summary("1", { reviewRequested: true }),
    summary("2", { reviewed: true, authored: true }),
    summary("3", { authored: true }),
  ];

  test("filters by relationship, readiness, and searchable repository metadata", () => {
    expect(filterPullRequests(items, "reviewing", "all", "").map((item) => item.id))
      .toEqual(["1", "2"]);
    expect(filterPullRequests(items, "authored", "draft", "").map((item) => item.id))
      .toEqual(["3"]);
    expect(filterPullRequests(items, "all", "all", "ACME/REPO")).toHaveLength(3);
  });

  test("assigns each pull request to the highest-priority visible group once", () => {
    expect(groupPullRequests(items, "all").map((group) => [
      group.id,
      group.items.map((item) => item.id),
    ])).toEqual([
      ["review-requested", ["1"]],
      ["reviewed", ["2"]],
      ["authored", ["3"]],
    ]);
  });

  test("formats compact ages at stable boundaries", () => {
    expect(shortPullRequestAge(new Date(NOW - 30_000).toISOString(), NOW)).toBe("now");
    expect(shortPullRequestAge(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)).toBe("2h");
    expect(shortPullRequestAge(new Date(NOW - 15 * 86_400_000).toISOString(), NOW)).toBe("2w");
  });

  test("reports failed and pending checks before success", () => {
    const base = {
      ...items[0],
      body: "",
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      baseRefName: "main",
      headRefName: "feature",
      state: "OPEN",
      mergeStateStatus: "CLEAN",
      mergeable: "MERGEABLE",
      reviewDecision: "",
      reviewers: [],
      files: [],
    } satisfies Omit<GitHubPullRequestDetail, "checks">;
    expect(pullRequestCheckState({ ...base, checks: [] })).toBe("none");
    expect(pullRequestCheckState({ ...base, checks: [{ name: "test", status: "IN_PROGRESS", conclusion: "", detailsUrl: null }] })).toBe("pending");
    expect(pullRequestCheckState({ ...base, checks: [{ name: "test", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: null }] })).toBe("failed");
  });
});
