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

export interface GitHubPullRequestSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: {
    name: string;
    nameWithOwner: string;
  };
  author: {
    login: string;
  };
  isDraft: boolean;
  updatedAt: string;
  createdAt: string;
  labels: Array<{ name: string; color: string }>;
  commentsCount: number;
  authored: boolean;
  reviewRequested: boolean;
  reviewed: boolean;
}

export interface GitHubPullRequestDetail extends GitHubPullRequestSummary {
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  baseRefName: string;
  headRefName: string;
  state: string;
  mergeStateStatus: string;
  mergeable: string;
  reviewDecision: string;
  reviewers: Array<{ login: string; state: string }>;
  checks: Array<{
    name: string;
    status: string;
    conclusion: string;
    detailsUrl: string | null;
  }>;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    changeType: string;
  }>;
}

const SEARCH_FIELDS = [
  "number",
  "title",
  "url",
  "repository",
  "author",
  "isDraft",
  "updatedAt",
  "createdAt",
  "labels",
  "commentsCount",
].join(",");

const DETAIL_FIELDS = [
  "additions",
  "author",
  "baseRefName",
  "body",
  "changedFiles",
  "comments",
  "deletions",
  "files",
  "headRefName",
  "isDraft",
  "latestReviews",
  "mergeStateStatus",
  "mergeable",
  "number",
  "reviewDecision",
  "reviewRequests",
  "state",
  "statusCheckRollup",
  "title",
  "updatedAt",
  "url",
].join(",");

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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
function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function bool(value: unknown): boolean {
  return value === true;
}

function pullRequestCoordinates(url: string): { owner: string; repo: string; number: number } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Pull request URL is invalid");
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  const number = Number(parts[3]);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parts.length !== 4 ||
    parts[2] !== "pull" ||
    !Number.isSafeInteger(number) ||
    number <= 0
  ) {
    throw new Error("Only canonical github.com pull request URLs are supported");
  }
  return { owner: parts[0] ?? "", repo: parts[1] ?? "", number };
}

function searchSummary(
  value: unknown,
  relation: "authored" | "reviewRequested" | "reviewed",
): GitHubPullRequestSummary | null {
  const row = object(value);
  const repository = object(row.repository);
  const author = object(row.author);
  const url = text(row.url);
  const number = integer(row.number);
  const nameWithOwner = text(repository.nameWithOwner);
  if (!url || !number || !nameWithOwner) return null;
  return {
    id: url,
    number,
    title: text(row.title),
    url,
    repository: {
      name: text(repository.name) || nameWithOwner.split("/").slice(-1)[0] || nameWithOwner,
      nameWithOwner,
    },
    author: { login: text(author.login) || "unknown" },
    isDraft: bool(row.isDraft),
    updatedAt: text(row.updatedAt),
    createdAt: text(row.createdAt),
    labels: array(row.labels).map((item) => {
      const label = object(item);
      return { name: text(label.name), color: text(label.color) };
    }).filter((label) => label.name.length > 0),
    commentsCount: integer(row.commentsCount),
    authored: relation === "authored",
    reviewRequested: relation === "reviewRequested",
    reviewed: relation === "reviewed",
  };
}

function detailFromJson(
  value: unknown,
  summary: GitHubPullRequestSummary,
): GitHubPullRequestDetail {
  const row = object(value);
  const reviewRequests = array(row.reviewRequests).map((item) => object(item));
  const latestReviews = array(row.latestReviews).map((item) => object(item));
  const reviewers = new Map<string, string>();
  for (const request of reviewRequests) {
    const login = text(request.login) || text(object(request.author).login);
    if (login) reviewers.set(login, "REQUESTED");
  }
  for (const review of latestReviews) {
    const login = text(object(review.author).login);
    if (login) reviewers.set(login, text(review.state) || "REVIEWED");
  }

  return {
    ...summary,
    title: text(row.title) || summary.title,
    url: text(row.url) || summary.url,
    number: integer(row.number) || summary.number,
    author: { login: text(object(row.author).login) || summary.author.login },
    isDraft: typeof row.isDraft === "boolean" ? row.isDraft : summary.isDraft,
    updatedAt: text(row.updatedAt) || summary.updatedAt,
    commentsCount: array(row.comments).length || summary.commentsCount,
    body: text(row.body),
    additions: integer(row.additions),
    deletions: integer(row.deletions),
    changedFiles: integer(row.changedFiles),
    baseRefName: text(row.baseRefName),
    headRefName: text(row.headRefName),
    state: text(row.state),
    mergeStateStatus: text(row.mergeStateStatus),
    mergeable: text(row.mergeable),
    reviewDecision: text(row.reviewDecision),
    reviewers: [...reviewers].map(([login, state]) => ({ login, state })),
    checks: array(row.statusCheckRollup).map((item) => {
      const check = object(item);
      return {
        name: text(check.name) || text(check.context) || "Check",
        status: text(check.status) || text(check.state),
        conclusion: text(check.conclusion),
        detailsUrl: text(check.detailsUrl) || text(check.targetUrl) || null,
      };
    }),
    files: array(row.files).map((item) => {
      const file = object(item);
      return {
        path: text(file.path),
        additions: integer(file.additions),
        deletions: integer(file.deletions),
        changeType: text(file.changeType),
      };
    }).filter((file) => file.path.length > 0),
  };
}

async function githubJson(command: string[], timeoutMs = 60_000): Promise<unknown> {
  const result = await runProcess(command, undefined, timeoutMs, {
    GH_PROMPT_DISABLED: "1",
    GH_PAGER: "cat",
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `${command.slice(0, 3).join(" ")} failed`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("GitHub CLI returned invalid JSON");
  }
}

async function search(
  relation: "authored" | "reviewRequested" | "reviewed",
  qualifier: string,
): Promise<GitHubPullRequestSummary[]> {
  const raw = await githubJson([
    "gh",
    "search",
    "prs",
    "--state=open",
    qualifier,
    "--limit=50",
    "--sort=updated",
    "--order=desc",
    `--json=${SEARCH_FIELDS}`,
  ]);
  return array(raw)
    .map((item) => searchSummary(item, relation))
    .filter((item): item is GitHubPullRequestSummary => item !== null);
}

export async function listGitHubPullRequests(): Promise<GitHubPullRequestSummary[]> {
  if (!which("gh")) throw new Error("GitHub CLI is not installed");
  const [authored, reviewRequested, reviewed] = await Promise.all([
    search("authored", "--author=@me"),
    search("reviewRequested", "--review-requested=@me"),
    search("reviewed", "--reviewed-by=@me"),
  ]);
  const merged = new Map<string, GitHubPullRequestSummary>();
  for (const item of [...authored, ...reviewRequested, ...reviewed]) {
    const previous = merged.get(item.id);
    merged.set(item.id, previous ? {
      ...previous,
      authored: previous.authored || item.authored,
      reviewRequested: previous.reviewRequested || item.reviewRequested,
      reviewed: previous.reviewed || item.reviewed,
    } : item);
  }
  return [...merged.values()].sort((left, right) =>
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      || left.repository.nameWithOwner.localeCompare(right.repository.nameWithOwner)
      || left.number - right.number,
  );
}

export function parseGitHubPullRequestSummary(value: unknown): GitHubPullRequestSummary {
  const row = object(value);
  const summary = searchSummary(
    row,
    bool(row.reviewRequested) ? "reviewRequested" : bool(row.reviewed) ? "reviewed" : "authored",
  );
  if (!summary) throw new Error("Pull request selection is invalid");
  return {
    ...summary,
    authored: bool(row.authored),
    reviewRequested: bool(row.reviewRequested),
    reviewed: bool(row.reviewed),
  };
}

export async function getGitHubPullRequest(
  url: string,
  summaryValue: unknown,
): Promise<GitHubPullRequestDetail> {
  const summary = parseGitHubPullRequestSummary(summaryValue);
  const coordinates = pullRequestCoordinates(url);
  const expected = `${coordinates.owner}/${coordinates.repo}`.toLocaleLowerCase();
  if (summary.url !== url || summary.repository.nameWithOwner.toLocaleLowerCase() !== expected) {
    throw new Error("Pull request selection does not match its repository");
  }
  const raw = await githubJson([
    "gh",
    "pr",
    "view",
    url,
    `--json=${DETAIL_FIELDS}`,
  ]);
  return detailFromJson(raw, summary);
}

export const githubPullRequestInternals = {
  detailFromJson,
  parseGitHubPullRequestSummary,
  pullRequestCoordinates,
  searchSummary,
};
