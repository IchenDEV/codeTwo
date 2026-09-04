import { describe, expect, test } from "bun:test";

import {
  filterPullRequests,
  githubPullRequestReference,
  groupPullRequests,
  pullRequestCheckState,
  shortPullRequestAge,
} from "../src/github/pullRequests";
import type {
  GitHubPullRequestDetail,
  GitHubPullRequestSummary,
} from "../src/bridge";

const NOW = Date.UTC(2026, 7, 24, 12);

function summary(
  id: string,
  relation: Partial<
    Pick<GitHubPullRequestSummary, "authored" | "reviewRequested" | "reviewed">
  >
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

describe("GitHub pull request projections", () => {
  const items = [
    summary("1", { reviewRequested: true }),
    summary("2", { reviewed: true, authored: true }),
    summary("3", { authored: true }),
  ];

  test("filters by relationship, readiness, and searchable repository metadata", () => {
    expect(
      filterPullRequests(items, "reviewing", "all", "").map((item) => item.id)
    ).toEqual(["1", "2"]);
    expect(
      filterPullRequests(items, "authored", "draft", "").map((item) => item.id)
    ).toEqual(["3"]);
    expect(filterPullRequests(items, "all", "all", "ACME/REPO")).toHaveLength(
      3
    );
  });

  test("assigns each pull request to the highest-priority visible group once", () => {
    expect(
      groupPullRequests(items, "all").map((group) => [
        group.id,
        group.items.map((item) => item.id),
      ])
    ).toEqual([
      ["review-requested", ["1"]],
      ["reviewed", ["2"]],
      ["authored", ["3"]],
    ]);
  });

  test("formats compact ages at stable boundaries", () => {
    expect(shortPullRequestAge(new Date(NOW - 30_000).toISOString(), NOW)).toBe(
      "now"
    );
    expect(
      shortPullRequestAge(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)
    ).toBe("2h");
    expect(
      shortPullRequestAge(new Date(NOW - 15 * 86_400_000).toISOString(), NOW)
    ).toBe("2w");
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
    expect(
      pullRequestCheckState({
        ...base,
        checks: [
          {
            name: "test",
            status: "IN_PROGRESS",
            conclusion: "",
            detailsUrl: null,
          },
        ],
      })
    ).toBe("pending");
    expect(
      pullRequestCheckState({
        ...base,
        checks: [
          {
            name: "test",
            status: "COMPLETED",
            conclusion: "FAILURE",
            detailsUrl: null,
          },
        ],
      })
    ).toBe("failed");
  });

  test("projects the stable GitHub identity stored by task links", () => {
    expect(githubPullRequestReference(items[0]!)).toEqual({
      provider: "github",
      host: "github.com",
      repository: "acme/repo",
      number: 1,
      url: "https://github.com/acme/repo/pull/1",
    });
  });
});
