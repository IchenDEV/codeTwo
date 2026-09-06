import type { GitHubPullRequest } from "../bridge";

export type SidebarPullRequestState =
  | "merged"
  | "conflicting"
  | "ci_failed"
  | "ci_running"
  | "open"
  | "closed";

export interface SidebarPullRequestStatus {
  number: number;
  url: string;
  state: SidebarPullRequestState;
}

const FAILED_CHECK_CONCLUSIONS = new Set([
  "ACTION_REQUIRED",
  "CANCELLED",
  "ERROR",
  "FAILURE",
  "STALE",
  "STARTUP_FAILURE",
  "TIMED_OUT",
]);

const SUCCESSFUL_CHECK_CONCLUSIONS = new Set(["NEUTRAL", "SKIPPED", "SUCCESS"]);

export function sidebarPullRequestStatus(
  pullRequest: GitHubPullRequest | null
): SidebarPullRequestStatus | null {
  if (!pullRequest) return null;
  const state = pullRequest.state.toLocaleUpperCase();
  if (state === "MERGED") {
    return {
      number: pullRequest.number,
      url: pullRequest.url,
      state: "merged",
    };
  }
  if (state !== "OPEN") {
    return {
      number: pullRequest.number,
      url: pullRequest.url,
      state: "closed",
    };
  }
  if (
    pullRequest.mergeable.toLocaleUpperCase() === "CONFLICTING" ||
    pullRequest.merge_state_status.toLocaleUpperCase() === "DIRTY"
  ) {
    return {
      number: pullRequest.number,
      url: pullRequest.url,
      state: "conflicting",
    };
  }
  if (
    pullRequest.checks.some((check) =>
      FAILED_CHECK_CONCLUSIONS.has((check.conclusion ?? "").toLocaleUpperCase())
    )
  ) {
    return {
      number: pullRequest.number,
      url: pullRequest.url,
      state: "ci_failed",
    };
  }
  if (
    pullRequest.checks.some((check) => {
      const conclusion = (check.conclusion ?? "").toLocaleUpperCase();
      const status = (check.status ?? "").toLocaleUpperCase();
      return (
        !SUCCESSFUL_CHECK_CONCLUSIONS.has(conclusion) &&
        (conclusion === "" ||
          status === "IN_PROGRESS" ||
          status === "QUEUED" ||
          status === "PENDING")
      );
    })
  ) {
    return {
      number: pullRequest.number,
      url: pullRequest.url,
      state: "ci_running",
    };
  }
  return { number: pullRequest.number, url: pullRequest.url, state: "open" };
}

export interface SidebarGitTarget {
  path: string;
}

export async function loadSidebarPullRequests(
  targets: readonly SidebarGitTarget[],
  load: (path: string) => Promise<GitHubPullRequest | null>,
  concurrency = 3
): Promise<Map<string, SidebarPullRequestStatus | null>> {
  const paths = [
    ...new Set(targets.map((target) => target.path).filter(Boolean)),
  ];
  const result = new Map<string, SidebarPullRequestStatus | null>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      if (!path) continue;
      try {
        result.set(path, sidebarPullRequestStatus(await load(path)));
      } catch {
        // Authentication/network/repository failures stay quiet; local checkout provenance remains.
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), paths.length) },
      worker
    )
  );
  return result;
}
