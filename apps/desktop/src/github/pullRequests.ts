import type { GitHubPullRequestDetail, GitHubPullRequestSummary } from "../bridge";

export type PullRequestView = "all" | "reviewing" | "authored";
export type PullRequestReadiness = "all" | "draft" | "ready";

export interface PullRequestGroup {
  id: "review-requested" | "reviewed" | "authored";
  items: GitHubPullRequestSummary[];
}

function searchableText(item: GitHubPullRequestSummary): string {
  return [
    item.title,
    item.repository.nameWithOwner,
    item.author.login,
    String(item.number),
    ...item.labels.map((label) => label.name),
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

export function filterPullRequests(
  items: GitHubPullRequestSummary[],
  view: PullRequestView,
  readiness: PullRequestReadiness,
  query: string,
): GitHubPullRequestSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (view === "authored" && !item.authored) return false;
    if (view === "reviewing" && !item.reviewRequested && !item.reviewed) return false;
    if (readiness === "draft" && !item.isDraft) return false;
    if (readiness === "ready" && item.isDraft) return false;
    return !needle || searchableText(item).includes(needle);
  });
}

export function groupPullRequests(
  items: GitHubPullRequestSummary[],
  view: PullRequestView,
): PullRequestGroup[] {
  if (view === "authored") return [{ id: "authored", items }];
  const assigned = new Set<string>();
  const take = (predicate: (item: GitHubPullRequestSummary) => boolean) =>
    items.filter((item) => {
      if (assigned.has(item.id) || !predicate(item)) return false;
      assigned.add(item.id);
      return true;
    });
  const groups: PullRequestGroup[] = [
    { id: "review-requested", items: take((item) => item.reviewRequested) },
    { id: "reviewed", items: take((item) => item.reviewed) },
    { id: "authored", items: take((item) => item.authored) },
  ];
  return groups.filter((group) => group.items.length > 0);
}

export function shortPullRequestAge(timestamp: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(timestamp));
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  if (elapsed < 604_800_000) return `${Math.floor(elapsed / 86_400_000)}d`;
  return `${Math.floor(elapsed / 604_800_000)}w`;
}

export function pullRequestCheckState(detail: GitHubPullRequestDetail):
  | "none"
  | "pending"
  | "failed"
  | "passed" {
  if (detail.checks.length === 0) return "none";
  if (detail.checks.some((check) =>
    ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"].includes(
      check.conclusion.toLocaleUpperCase() || check.status.toLocaleUpperCase(),
    ))) return "failed";
  if (detail.checks.some((check) =>
    !check.conclusion || ["QUEUED", "IN_PROGRESS", "PENDING", "EXPECTED"].includes(
      check.status.toLocaleUpperCase(),
    ))) return "pending";
  return "passed";
}
