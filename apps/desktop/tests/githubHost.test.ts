import { describe, expect, test } from "bun:test";

import {
  githubCurrentPullRequest,
  githubMergePullRequest,
  githubPullRequestDiff,
  githubReviewPullRequest,
  type GitHubCommandDependencies,
} from "../src/electrobun/host/github";

const rawPullRequest = (overrides: Record<string, unknown> = {}) => ({
  number: 42,
  title: "feat: review from the dock",
  url: "https://github.com/acme/code-two/pull/42",
  state: "OPEN",
  isDraft: false,
  headRefName: "codex/review-dock",
  baseRefName: "main",
  additions: 24,
  deletions: 3,
  changedFiles: 2,
  body: "## Summary\n\nReady for review.",
  reviewDecision: "",
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  statusCheckRollup: [
    {
      __typename: "CheckRun",
      name: "validate",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      detailsUrl: "https://github.com/acme/code-two/actions/runs/1",
      workflowName: "Desktop",
    },
  ],
  author: { login: "octocat" },
  comments: [{ id: "one" }],
  reviews: [{ id: "two" }],
  createdAt: "2026-08-23T10:00:00Z",
  updatedAt: "2026-08-23T11:00:00Z",
  ...overrides,
});

function dependencies(...results: { stdout: string; stderr?: string; exitCode?: number }[]): {
  value: GitHubCommandDependencies;
  commands: string[][];
} {
  const commands: string[][] = [];
  return {
    commands,
    value: {
      find: () => "/opt/homebrew/bin/gh",
      run: async (command) => {
        commands.push(command);
        const next = results.shift();
        if (!next) throw new Error("unexpected command");
        return {
          stdout: next.stdout,
          stderr: next.stderr ?? "",
          exitCode: next.exitCode ?? 0,
        };
      },
    },
  };
}

describe("GitHub pull request host", () => {
  test("normalizes the current branch pull request and its check union", async () => {
    const harness = dependencies({ stdout: JSON.stringify(rawPullRequest()) });
    const pullRequest = await githubCurrentPullRequest("/repo", harness.value);

    expect(pullRequest).toMatchObject({
      number: 42,
      is_draft: false,
      head_ref: "codex/review-dock",
      base_ref: "main",
      comments_count: 1,
      reviews_count: 1,
      checks: [
        {
          name: "validate",
          conclusion: "SUCCESS",
          workflow_name: "Desktop",
        },
      ],
    });
    expect(harness.commands[0]?.slice(0, 4)).toEqual(["gh", "pr", "view", "--json"]);
  });

  test("treats an unlinked branch as an honest empty state", async () => {
    const harness = dependencies({
      stdout: "",
      stderr: 'no pull requests found for branch "main"',
      exitCode: 1,
    });
    await expect(githubCurrentPullRequest("/repo", harness.value)).resolves.toBeNull();
  });

  test("loads only the diff for the still-linked pull request", async () => {
    const stale = dependencies({ stdout: JSON.stringify(rawPullRequest()) });
    await expect(githubPullRequestDiff("/repo", 7, stale.value)).rejects.toThrow(
      "is no longer linked",
    );
    expect(stale.commands).toHaveLength(1);

    const current = dependencies(
      { stdout: JSON.stringify(rawPullRequest()) },
      { stdout: "diff --git a/a.ts b/a.ts\n+new line" },
    );
    await expect(githubPullRequestDiff("/repo", 42, current.value)).resolves.toEqual({
      text: "diff --git a/a.ts b/a.ts\n+new line",
      truncated: false,
    });
    expect(current.commands[1]).toEqual(["gh", "pr", "diff", "42", "--patch"]);
  });

  test("maps review actions to non-interactive gh arguments", async () => {
    const harness = dependencies(
      { stdout: JSON.stringify(rawPullRequest()) },
      { stdout: "" },
    );
    await githubReviewPullRequest(
      "/repo",
      42,
      "request_changes",
      "Please cover the failure state.",
      harness.value,
    );
    expect(harness.commands[1]).toEqual([
      "gh",
      "pr",
      "review",
      "42",
      "--request-changes",
      "--body",
      "Please cover the failure state.",
    ]);
  });

  test("blocks unsafe merges before invoking GitHub and executes an explicit strategy", async () => {
    const draft = dependencies({ stdout: JSON.stringify(rawPullRequest({ isDraft: true })) });
    await expect(githubMergePullRequest("/repo", 42, "squash", draft.value)).rejects.toThrow(
      "still a draft",
    );
    expect(draft.commands).toHaveLength(1);

    const ready = dependencies(
      { stdout: JSON.stringify(rawPullRequest()) },
      { stdout: "✓ Pull request merged" },
    );
    await githubMergePullRequest("/repo", 42, "squash", ready.value);
    expect(ready.commands[1]).toEqual(["gh", "pr", "merge", "42", "--squash"]);
  });
});
