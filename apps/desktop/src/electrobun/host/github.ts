import { runProcess, which, type ProcessResult } from "./system";

const PULL_REQUEST_FIELDS = [
  "number",
  "title",
  "url",
  "state",
  "isDraft",
  "headRefName",
  "baseRefName",
  "additions",
  "deletions",
  "changedFiles",
  "body",
  "reviewDecision",
  "mergeable",
  "mergeStateStatus",
  "statusCheckRollup",
  "author",
  "comments",
  "reviews",
  "createdAt",
  "updatedAt",
].join(",");

const MAX_DIFF_PREVIEW_CHARS = 1_500_000;

type JsonObject = Record<string, unknown>;

export interface GitHubCommandDependencies {
  run: (
    command: string[],
    cwd?: string,
    timeoutMs?: number,
    env?: Record<string, string>,
  ) => Promise<ProcessResult>;
  find: (command: string) => string | null;
}

const DEFAULT_DEPENDENCIES: GitHubCommandDependencies = {
  run: runProcess,
  find: which,
};

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pullRequestNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error("pull request number must be a positive integer");
  }
  return value;
}

function githubAvailable(dependencies: GitHubCommandDependencies): void {
  if (!dependencies.find("gh")) throw new Error("GitHub CLI is not installed");
}

function noPullRequestFound(message: string): boolean {
  const normalized = message.toLocaleLowerCase();
  return (
    normalized.includes("no pull requests found for branch") ||
    normalized.includes("could not find pull request for branch")
  );
}

function normalizeCheck(value: unknown): unknown {
  const check = object(value);
  return {
    name: text(check.name) || text(check.context) || "Check",
    status: optionalText(check.status),
    conclusion: optionalText(check.conclusion) ?? optionalText(check.state),
    details_url: optionalText(check.detailsUrl) ?? optionalText(check.targetUrl),
    workflow_name: optionalText(check.workflowName),
  };
}

/** Keep the renderer contract small and stable across GitHub's CheckRun/StatusContext union. */
export function normalizePullRequest(value: unknown): unknown {
  const pullRequest = object(value);
  const author = object(pullRequest.author);
  const checks = Array.isArray(pullRequest.statusCheckRollup)
    ? pullRequest.statusCheckRollup.map(normalizeCheck)
    : [];
  return {
    number: pullRequestNumber(pullRequest.number),
    title: text(pullRequest.title),
    url: text(pullRequest.url),
    state: text(pullRequest.state),
    is_draft: pullRequest.isDraft === true,
    head_ref: text(pullRequest.headRefName),
    base_ref: text(pullRequest.baseRefName),
    additions: numeric(pullRequest.additions),
    deletions: numeric(pullRequest.deletions),
    changed_files: numeric(pullRequest.changedFiles),
    body: text(pullRequest.body),
    review_decision: optionalText(pullRequest.reviewDecision),
    mergeable: text(pullRequest.mergeable),
    merge_state_status: text(pullRequest.mergeStateStatus),
    author: text(author.login),
    comments_count: Array.isArray(pullRequest.comments) ? pullRequest.comments.length : 0,
    reviews_count: Array.isArray(pullRequest.reviews) ? pullRequest.reviews.length : 0,
    checks,
    created_at: text(pullRequest.createdAt),
    updated_at: text(pullRequest.updatedAt),
  };
}

export async function githubCurrentPullRequest(
  cwd: string,
  dependencies: GitHubCommandDependencies = DEFAULT_DEPENDENCIES,
): Promise<unknown | null> {
  githubAvailable(dependencies);
  const result = await dependencies.run(
    ["gh", "pr", "view", "--json", PULL_REQUEST_FIELDS],
    cwd,
    30_000,
  );
  if (result.exitCode !== 0) {
    const message = result.stderr.trim() || result.stdout.trim();
    if (noPullRequestFound(message)) return null;
    throw new Error(message || "Could not inspect the current GitHub pull request");
  }
  try {
    return normalizePullRequest(JSON.parse(result.stdout));
  } catch (error) {
    throw new Error(`GitHub returned an invalid pull request response: ${String(error)}`);
  }
}

async function requireCurrentPullRequest(
  cwd: string,
  expectedNumber: unknown,
  dependencies: GitHubCommandDependencies,
): Promise<JsonObject> {
  const number = pullRequestNumber(expectedNumber);
  const current = await githubCurrentPullRequest(cwd, dependencies);
  if (!current || object(current).number !== number) {
    throw new Error(`PR #${number} is no longer linked to the current branch`);
  }
  return object(current);
}

export async function githubPullRequestDiff(
  cwd: string,
  expectedNumber: unknown,
  dependencies: GitHubCommandDependencies = DEFAULT_DEPENDENCIES,
): Promise<unknown> {
  const pullRequest = await requireCurrentPullRequest(cwd, expectedNumber, dependencies);
  const number = pullRequestNumber(pullRequest.number);
  const result = await dependencies.run(
    ["gh", "pr", "diff", String(number), "--patch"],
    cwd,
    60_000,
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Could not load the pull request diff");
  }
  return {
    text: result.stdout.slice(0, MAX_DIFF_PREVIEW_CHARS),
    truncated: result.stdout.length > MAX_DIFF_PREVIEW_CHARS,
  };
}

export type GitHubReviewAction = "approve" | "comment" | "request_changes";

export async function githubReviewPullRequest(
  cwd: string,
  expectedNumber: unknown,
  action: unknown,
  body: unknown,
  dependencies: GitHubCommandDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const pullRequest = await requireCurrentPullRequest(cwd, expectedNumber, dependencies);
  const number = pullRequestNumber(pullRequest.number);
  if (pullRequest.state !== "OPEN") throw new Error(`PR #${number} is not open`);
  if (action !== "approve" && action !== "comment" && action !== "request_changes") {
    throw new Error("unsupported pull request review action");
  }
  const reviewBody = typeof body === "string" ? body.trim() : "";
  if ((action === "comment" || action === "request_changes") && !reviewBody) {
    throw new Error("a review comment is required for this action");
  }
  const flag = action === "request_changes" ? "--request-changes" : `--${action}`;
  const command = ["gh", "pr", "review", String(number), flag];
  if (reviewBody) command.push("--body", reviewBody);
  const result = await dependencies.run(command, cwd, 60_000);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Could not submit the pull request review");
  }
}

export type GitHubMergeStrategy = "merge" | "squash" | "rebase";

export async function githubMergePullRequest(
  cwd: string,
  expectedNumber: unknown,
  strategy: unknown,
  dependencies: GitHubCommandDependencies = DEFAULT_DEPENDENCIES,
): Promise<void> {
  const pullRequest = await requireCurrentPullRequest(cwd, expectedNumber, dependencies);
  const number = pullRequestNumber(pullRequest.number);
  if (pullRequest.state !== "OPEN") throw new Error(`PR #${number} is not open`);
  if (pullRequest.is_draft === true) throw new Error(`PR #${number} is still a draft`);
  if (pullRequest.mergeable === "CONFLICTING") throw new Error(`PR #${number} has merge conflicts`);
  if (strategy !== "merge" && strategy !== "squash" && strategy !== "rebase") {
    throw new Error("unsupported pull request merge strategy");
  }
  const result = await dependencies.run(
    ["gh", "pr", "merge", String(number), `--${strategy}`],
    cwd,
    120_000,
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "Could not merge the pull request");
  }
}
