import type { GitHubPullRequest } from "../bridge";

export type SidebarPullRequestState =
  "merged" | "conflicting" | "ci_failed" | "ci_running" | "open" | "closed";

export interface SidebarPullRequestStatus {
  number: number;
  url: string;
  state: SidebarPullRequestState;
}

const failedCheckConclusions = new Set([
  "ACTION_REQUIRED",
  "CANCELLED",
  "ERROR",
  "FAILURE",
  "STALE",
  "STARTUP_FAILURE",
  "TIMED_OUT",
]);

const successfulCheckConclusions = new Set(["NEUTRAL", "SKIPPED", "SUCCESS"]);

export function sidebarPullRequestStatus(
  pullRequest: GitHubPullRequest | null
): SidebarPullRequestStatus | null {
  if (!pullRequest) {
    return null;
  }
  const state = pullRequest.state.toLocaleUpperCase();
  if (state === "MERGED") {
    return {
      number: pullRequest.number,
      state: "merged",
      url: pullRequest.url,
    };
  }
  if (state !== "OPEN") {
    return {
      number: pullRequest.number,
      state: "closed",
      url: pullRequest.url,
    };
  }
  if (
    pullRequest.mergeable.toLocaleUpperCase() === "CONFLICTING" ||
    pullRequest.merge_state_status.toLocaleUpperCase() === "DIRTY"
  ) {
    return {
      number: pullRequest.number,
      state: "conflicting",
      url: pullRequest.url,
    };
  }
  if (
    pullRequest.checks.some((check) =>
      failedCheckConclusions.has((check.conclusion ?? "").toLocaleUpperCase())
    )
  ) {
    return {
      number: pullRequest.number,
      state: "ci_failed",
      url: pullRequest.url,
    };
  }
  if (
    pullRequest.checks.some((check) => {
      const conclusion = (check.conclusion ?? "").toLocaleUpperCase();
      const status = (check.status ?? "").toLocaleUpperCase();
      return (
        !successfulCheckConclusions.has(conclusion) &&
        (conclusion === "" ||
          status === "IN_PROGRESS" ||
          status === "QUEUED" ||
          status === "PENDING")
      );
    })
  ) {
    return {
      number: pullRequest.number,
      state: "ci_running",
      url: pullRequest.url,
    };
  }
  return { number: pullRequest.number, state: "open", url: pullRequest.url };
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
      if (!path) {
        continue;
      }
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
