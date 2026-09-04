import type {
  GitHubPullRequest,
  GitHubPullRequestDetail,
  GitHubPullRequestSummary,
  SourceControlInfo,
} from "../../bridge";
import type { GitHubPullRequestPanelApi } from "../../git/GitHubPullRequestPanel";
import { githubPullRequestReference } from "../../github/pullRequests";
import {
  associateTaskPullRequest,
  createBoardTask,
} from "../../taskboard/taskBoard";
import type { BoardTask } from "../../taskboard/taskBoard";

const stableTimestamp = "2099-01-01T10:00:00Z";

export const pullRequestSummary: GitHubPullRequestSummary = {
  id: "https://github.com/acme/code-two/pull/279",
  number: 279,
  title: "feat(dashboard): add sidebar usage widget",
  url: "https://github.com/acme/code-two/pull/279",
  repository: { name: "code-two", nameWithOwner: "acme/code-two" },
  author: { login: "stylesh" },
  isDraft: false,
  updatedAt: stableTimestamp,
  createdAt: stableTimestamp,
  labels: [
    { name: "dashboard", color: "8250df" },
    { name: "ready", color: "2da44e" },
  ],
  commentsCount: 5,
  authored: true,
  reviewRequested: false,
  reviewed: true,
};

export const reviewRequestSummary: GitHubPullRequestSummary = {
  ...pullRequestSummary,
  id: "https://github.com/acme/code-two/pull/276",
  number: 276,
  title: "fix(session): preserve generated title fallback",
  url: "https://github.com/acme/code-two/pull/276",
  author: { login: "octocat" },
  labels: [{ name: "session", color: "0969da" }],
  commentsCount: 2,
  authored: false,
  reviewRequested: true,
  reviewed: false,
};

export const pullRequestDetail: GitHubPullRequestDetail = {
  ...pullRequestSummary,
  body: [
    "## Summary",
    "",
    "- add a persistent sidebar usage card with compact AI and CI rings",
    "- keep wallet balance private by default and reveal it on demand",
    "- avoid hidden polling and report unpriced activity as pending",
    "",
    "## Verification",
    "",
    "- `bun test`",
    "- `bun run build`",
    "- live browser verification at desktop and narrow widths",
  ].join("\n"),
  additions: 769,
  deletions: 144,
  changedFiles: 30,
  baseRefName: "main",
  headRefName: "feat/sidebar-usage-widget",
  state: "OPEN",
  mergeStateStatus: "CLEAN",
  mergeable: "MERGEABLE",
  reviewDecision: "APPROVED",
  reviewers: [{ login: "octocat", state: "APPROVED" }],
  checks: [
    {
      name: "Desktop tests",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      detailsUrl: null,
    },
    {
      name: "Type check",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      detailsUrl: null,
    },
    {
      name: "Documentation",
      status: "COMPLETED",
      conclusion: "SUCCESS",
      detailsUrl: null,
    },
  ],
  files: [
    {
      path: "apps/desktop/src/App.tsx",
      additions: 210,
      deletions: 41,
      changeType: "MODIFIED",
    },
    {
      path: "apps/desktop/src/github/PullRequestsPage.tsx",
      additions: 418,
      deletions: 62,
      changeType: "ADDED",
    },
    {
      path: "apps/desktop/tests/githubPullRequestsRendered.test.tsx",
      additions: 141,
      deletions: 0,
      changeType: "ADDED",
    },
  ],
};

export const reviewRequestDetail: GitHubPullRequestDetail = {
  ...pullRequestDetail,
  ...reviewRequestSummary,
  body: "## Summary\n\n- retain a useful title when the provider sends an empty generated value",
  additions: 84,
  deletions: 17,
  changedFiles: 4,
  headRefName: "fix/session-title-fallback",
  reviewDecision: "REVIEW_REQUIRED",
  reviewers: [],
};

const task = createBoardTask(
  {
    title: "Ship sidebar usage widget",
    description: "Review the implementation and ship the dashboard usage card.",
    status: "in_review",
    priority: "high",
    labels: ["dashboard", "review"],
  },
  { id: "ui-lab-pr-task", now: 1 }
);

export const pullRequestTasks: readonly BoardTask[] = associateTaskPullRequest(
  [task],
  task.id,
  githubPullRequestReference(pullRequestSummary),
  1
) ?? [task];

export const loadPullRequests = async (): Promise<
  GitHubPullRequestSummary[]
> => [pullRequestSummary, reviewRequestSummary];

export const loadPullRequest = async (
  summary: GitHubPullRequestSummary
): Promise<GitHubPullRequestDetail> =>
  summary.id === reviewRequestSummary.id
    ? reviewRequestDetail
    : pullRequestDetail;

const sourceControl: SourceControlInfo = {
  remote_name: "origin",
  provider: "github",
  provider_name: "GitHub",
  host: "github.com",
  web_url: "https://github.com/acme/code-two",
  change_request_label: "PR",
  create_change_request_supported: true,
  required_cli: "gh",
  required_cli_available: true,
};

const dockPullRequest: GitHubPullRequest = {
  number: pullRequestDetail.number,
  title: pullRequestDetail.title,
  url: pullRequestDetail.url,
  state: pullRequestDetail.state,
  is_draft: pullRequestDetail.isDraft,
  head_ref: pullRequestDetail.headRefName,
  base_ref: pullRequestDetail.baseRefName,
  additions: pullRequestDetail.additions,
  deletions: pullRequestDetail.deletions,
  changed_files: pullRequestDetail.changedFiles,
  body: pullRequestDetail.body,
  review_decision: pullRequestDetail.reviewDecision,
  mergeable: pullRequestDetail.mergeable,
  merge_state_status: pullRequestDetail.mergeStateStatus,
  author: pullRequestDetail.author.login,
  comments_count: pullRequestDetail.commentsCount,
  reviews_count: pullRequestDetail.reviewers.length,
  checks: pullRequestDetail.checks.map((check) => ({
    name: check.name,
    status: check.status,
    conclusion: check.conclusion,
    details_url: check.detailsUrl,
    workflow_name: "Desktop",
  })),
  created_at: pullRequestDetail.createdAt,
  updated_at: pullRequestDetail.updatedAt,
};

export const pullRequestPanelApi: GitHubPullRequestPanelApi = {
  sourceControl: async () => sourceControl,
  currentPullRequest: async () => dockPullRequest,
  pullRequestDiff: async () => ({
    text: [
      "diff --git a/apps/desktop/src/App.tsx b/apps/desktop/src/App.tsx",
      "@@ -412,6 +412,7 @@ function App() {",
      "-  const showUsage = false;",
      "+  const showUsage = account !== null;",
      "   return <Workspace />;",
    ].join("\n"),
    truncated: false,
  }),
  review: async () => {
    /* empty */
  },
  merge: async () => {
    /* empty */
  },
  open: async () => {
    /* empty */
  },
};
