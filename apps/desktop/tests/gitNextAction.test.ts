import { describe, expect, test } from "bun:test";

import type {
  GitHubPullRequest,
  GitStatus,
  SourceControlInfo,
} from "../src/bridge";
import {
  resolveGitNextAction,
  type GitNextActionInput,
} from "../src/git/nextAction";

const status = (overrides: Partial<GitStatus> = {}): GitStatus => ({
  is_repo: true,
  branch: "codex/next-action",
  ahead: 0,
  behind: 0,
  files: [],
  ...overrides,
});

const sourceControl = (
  overrides: Partial<SourceControlInfo> = {}
): SourceControlInfo => ({
  remote_name: "origin",
  provider: "github",
  provider_name: "GitHub",
  host: "github.com",
  web_url: "https://github.com/acme/code-two",
  change_request_label: "PR",
  create_change_request_supported: true,
  required_cli: "gh",
  required_cli_available: true,
  ...overrides,
});

const pullRequest = (
  overrides: Partial<GitHubPullRequest> = {}
): GitHubPullRequest => ({
  number: 42,
  title: "feat: next action",
  url: "https://github.com/acme/code-two/pull/42",
  state: "OPEN",
  is_draft: false,
  head_ref: "codex/next-action",
  base_ref: "main",
  additions: 12,
  deletions: 2,
  changed_files: 2,
  body: "",
  review_decision: "APPROVED",
  mergeable: "MERGEABLE",
  merge_state_status: "CLEAN",
  author: "octocat",
  comments_count: 0,
  reviews_count: 1,
  checks: [
    {
      name: "validate",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      details_url: null,
      workflow_name: "Desktop",
    },
  ],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T01:00:00Z",
  ...overrides,
});

const input = (
  overrides: Partial<GitNextActionInput> = {}
): GitNextActionInput => ({
  status: status(),
  loading: false,
  sourceControl: sourceControl(),
  pullRequest: null,
  forgeError: null,
  taskWorktree: true,
  canCleanup: true,
  ...overrides,
});

const ids = (value: ReturnType<typeof resolveGitNextAction>) => ({
  primary: value.primary.id,
  alternatives: value.alternatives.map((candidate) => candidate.id),
  reason: value.reason.id,
});

describe("Git next action", () => {
  test("keeps loading and non-repository states explicit and disabled", () => {
    const loading = resolveGitNextAction(input({ loading: true }));
    expect(ids(loading)).toEqual({
      primary: "checking",
      alternatives: [],
      reason: "checking",
    });
    expect(loading.primary.disabled).toBe(true);

    const unavailable = resolveGitNextAction(
      input({ status: status({ is_repo: false }) })
    );
    expect(ids(unavailable)).toEqual({
      primary: "unavailable",
      alternatives: [],
      reason: "not_repository",
    });
    expect(unavailable.primary.disabled).toBe(true);
  });

  test("prioritizes local files, then unpushed commits, over forge state", () => {
    const dirty = resolveGitNextAction(
      input({
        status: status({
          ahead: 2,
          files: [
            {
              path: "src/app.ts",
              original_path: null,
              staged: false,
              unstaged: true,
              state: "modified",
              staged_state: null,
              unstaged_state: "modified",
            },
          ],
        }),
        pullRequest: pullRequest({
          mergeable: "CONFLICTING",
          merge_state_status: "DIRTY",
        }),
      })
    );
    expect(ids(dirty)).toEqual({
      primary: "review_changes",
      alternatives: ["push", "view_pull_request"],
      reason: "local_changes",
    });

    const ahead = resolveGitNextAction(
      input({
        status: status({ ahead: 2 }),
        pullRequest: pullRequest({
          checks: [
            {
              name: "validate",
              status: "COMPLETED",
              conclusion: "FAILURE",
              details_url: null,
              workflow_name: null,
            },
          ],
        }),
      })
    );
    expect(ids(ahead)).toEqual({
      primary: "push",
      alternatives: ["source_control", "view_pull_request"],
      reason: "ahead",
    });
  });

  test("offers change-request creation only for a capable task worktree", () => {
    expect(ids(resolveGitNextAction(input()))).toEqual({
      primary: "create_change_request",
      alternatives: [],
      reason: "create_change_request",
    });

    const checkout = resolveGitNextAction(
      input({ taskWorktree: false, canCleanup: false })
    );
    expect(ids(checkout)).toEqual({
      primary: "up_to_date",
      alternatives: [],
      reason: "clean",
    });

    const missingCli = resolveGitNextAction(
      input({
        sourceControl: sourceControl({ required_cli_available: false }),
      })
    );
    expect(ids(missingCli)).toEqual({
      primary: "up_to_date",
      alternatives: [],
      reason: "clean",
    });
  });

  test("orders pull-request blockers before review and merge readiness", () => {
    const conflicting = resolveGitNextAction(
      input({
        pullRequest: pullRequest({
          mergeable: "CONFLICTING",
          merge_state_status: "DIRTY",
        }),
      })
    );
    expect(ids(conflicting)).toEqual({
      primary: "resolve_conflicts",
      alternatives: ["view_pull_request"],
      reason: "conflicts",
    });

    const failed = resolveGitNextAction(
      input({
        pullRequest: pullRequest({
          review_decision: "CHANGES_REQUESTED",
          checks: [
            {
              name: "validate",
              status: "COMPLETED",
              conclusion: "FAILURE",
              details_url: null,
              workflow_name: null,
            },
          ],
        }),
      })
    );
    expect(ids(failed)).toEqual({
      primary: "review_failed_checks",
      alternatives: ["source_control"],
      reason: "failed_checks",
    });

    const requested = resolveGitNextAction(
      input({
        pullRequest: pullRequest({ review_decision: "CHANGES_REQUESTED" }),
      })
    );
    expect(ids(requested)).toEqual({
      primary: "address_review",
      alternatives: ["source_control"],
      reason: "requested_changes",
    });
  });

  test("keeps pending checks, behind branches, and drafts ahead of merge", () => {
    const pending = resolveGitNextAction(
      input({
        pullRequest: pullRequest({
          checks: [
            {
              name: "validate",
              status: "IN_PROGRESS",
              conclusion: null,
              details_url: null,
              workflow_name: null,
            },
          ],
        }),
      })
    );
    expect(ids(pending)).toEqual({
      primary: "view_checks",
      alternatives: ["source_control"],
      reason: "pending_checks",
    });

    const behind = resolveGitNextAction(
      input({
        status: status({ behind: 3 }),
        pullRequest: pullRequest(),
      })
    );
    expect(ids(behind)).toEqual({
      primary: "review_remote_updates",
      alternatives: ["view_pull_request"],
      reason: "behind",
    });

    const draft = resolveGitNextAction(
      input({ pullRequest: pullRequest({ is_draft: true }) })
    );
    expect(ids(draft)).toEqual({
      primary: "review_draft",
      alternatives: ["source_control"],
      reason: "draft",
    });
  });

  test("routes merge-ready and merged worktrees through existing guarded surfaces", () => {
    const merge = resolveGitNextAction(input({ pullRequest: pullRequest() }));
    expect(ids(merge)).toEqual({
      primary: "merge_pull_request",
      alternatives: ["source_control"],
      reason: "merge_ready",
    });

    const cleanup = resolveGitNextAction(
      input({
        pullRequest: pullRequest({ state: "MERGED" }),
      })
    );
    expect(ids(cleanup)).toEqual({
      primary: "cleanup_worktree",
      alternatives: ["source_control", "view_pull_request"],
      reason: "merged",
    });

    const retained = resolveGitNextAction(
      input({
        pullRequest: pullRequest({ state: "MERGED" }),
        canCleanup: false,
      })
    );
    expect(ids(retained)).toEqual({
      primary: "view_pull_request",
      alternatives: ["source_control"],
      reason: "merged",
    });
  });

  test("never advertises merge while required review or an unknown blocker remains", () => {
    const awaitingReview = resolveGitNextAction(
      input({
        pullRequest: pullRequest({ review_decision: "REVIEW_REQUIRED" }),
      })
    );
    expect(ids(awaitingReview)).toEqual({
      primary: "view_pull_request",
      alternatives: ["source_control"],
      reason: "awaiting_review",
    });

    const blocked = resolveGitNextAction(
      input({
        pullRequest: pullRequest({
          review_decision: "APPROVED",
          merge_state_status: "BLOCKED",
        }),
      })
    );
    expect(ids(blocked)).toEqual({
      primary: "view_pull_request",
      alternatives: ["source_control"],
      reason: "pull_request",
    });
  });

  test("degrades forge inspection without hiding valid local Git", () => {
    const degraded = resolveGitNextAction(
      input({
        sourceControl: null,
        forgeError: "gh timed out",
      })
    );
    expect(ids(degraded)).toEqual({
      primary: "source_control",
      alternatives: [],
      reason: "forge_degraded",
    });

    const dirty = resolveGitNextAction(
      input({
        sourceControl: null,
        forgeError: "gh timed out",
        status: status({
          files: [
            {
              path: "README.md",
              original_path: null,
              staged: true,
              unstaged: false,
              state: "modified",
              staged_state: "modified",
              unstaged_state: null,
            },
          ],
        }),
      })
    );
    expect(dirty.primary.id).toBe("review_changes");
    expect(dirty.reason.id).toBe("local_changes");
  });
});
