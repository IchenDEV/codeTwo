import type {
  GitHubPullRequest,
  GitStatus,
  SourceControlInfo,
} from "../bridge";
import type { Translate } from "../i18n";

export type GitNextActionId =
  | "checking"
  | "unavailable"
  | "up_to_date"
  | "source_control"
  | "review_changes"
  | "push"
  | "create_change_request"
  | "resolve_conflicts"
  | "review_failed_checks"
  | "address_review"
  | "view_checks"
  | "review_remote_updates"
  | "review_draft"
  | "view_pull_request"
  | "merge_pull_request"
  | "cleanup_worktree";

export type GitNextActionDestination =
  | "none"
  | "source_control"
  | "push"
  | "pull_request"
  | "cleanup";

export interface GitNextActionItem {
  id: GitNextActionId;
  destination: GitNextActionDestination;
  disabled?: boolean;
}

export type GitNextActionReason =
  | { id: "checking" }
  | { id: "not_repository" }
  | { id: "local_changes"; count: number }
  | { id: "ahead"; count: number }
  | { id: "create_change_request" }
  | { id: "conflicts" }
  | { id: "failed_checks"; count: number }
  | { id: "requested_changes" }
  | { id: "pending_checks"; count: number }
  | { id: "behind"; count: number }
  | { id: "draft" }
  | { id: "awaiting_review" }
  | { id: "merge_ready" }
  | { id: "merged" }
  | { id: "closed" }
  | { id: "pull_request" }
  | { id: "forge_degraded" }
  | { id: "clean" };

export interface GitNextActionProjection {
  primary: GitNextActionItem;
  alternatives: GitNextActionItem[];
  reason: GitNextActionReason;
  changeRequestLabel:
    | SourceControlInfo["change_request_label"]
    | "change request";
}

export interface GitNextActionInput {
  status: GitStatus | null;
  loading: boolean;
  sourceControl: SourceControlInfo | null;
  pullRequest: GitHubPullRequest | null;
  forgeError: string | null;
  taskWorktree: boolean;
  canCleanup: boolean;
}

export interface GitNextActionHandlers {
  openSourceControl: () => void;
  push: () => void;
  openPullRequest: () => void;
  cleanupWorktree: () => void;
}

const action = (
  id: GitNextActionId,
  destination: GitNextActionDestination,
  disabled = false
): GitNextActionItem => ({ id, destination, disabled: disabled || undefined });

function checkTone(
  check: GitHubPullRequest["checks"][number]
): "success" | "failure" | "pending" {
  const conclusion = (check.conclusion ?? "").toLocaleUpperCase();
  const status = (check.status ?? "").toLocaleUpperCase();
  if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(conclusion)) return "success";
  if (
    [
      "FAILURE",
      "ACTION_REQUIRED",
      "TIMED_OUT",
      "CANCELLED",
      "STALE",
      "STARTUP_FAILURE",
      "ERROR",
    ].includes(conclusion)
  ) {
    return "failure";
  }
  if (status === "COMPLETED" && conclusion) return "failure";
  return "pending";
}

function canCreateChangeRequest(input: GitNextActionInput): boolean {
  const info = input.sourceControl;
  return (
    input.taskWorktree &&
    !input.pullRequest &&
    info?.create_change_request_supported === true &&
    (info.required_cli == null ||
      info.required_cli === "" ||
      info.required_cli_available)
  );
}

function alternativesFor(
  input: GitNextActionInput,
  primary: GitNextActionItem
): GitNextActionItem[] {
  const candidates: GitNextActionItem[] = [];
  if (input.status?.is_repo === true)
    candidates.push(action("source_control", "source_control"));
  if ((input.status?.ahead ?? 0) > 0) candidates.push(action("push", "push"));
  if (input.pullRequest)
    candidates.push(action("view_pull_request", "pull_request"));
  if (canCreateChangeRequest(input)) {
    candidates.push(action("create_change_request", "source_control"));
  }
  if (
    input.pullRequest?.state.toLocaleUpperCase() === "MERGED" &&
    input.canCleanup
  ) {
    candidates.push(action("cleanup_worktree", "cleanup"));
  }

  const destinations = new Set<GitNextActionDestination>([primary.destination]);
  return candidates.filter((candidate) => {
    if (destinations.has(candidate.destination)) return false;
    destinations.add(candidate.destination);
    return true;
  });
}

/**
 * Resolve one useful next step from workspace-owned Git and forge state.
 *
 * This function never mutates Git and never guesses a task branch from its name. A change request
 * becomes a candidate only when the active session owns a real task worktree and the inspected
 * adapter advertises creation support.
 */
export function resolveGitNextAction(
  input: GitNextActionInput
): GitNextActionProjection {
  const changeRequestLabel =
    input.sourceControl?.change_request_label ?? "change request";
  const finish = (
    primary: GitNextActionItem,
    reason: GitNextActionReason
  ): GitNextActionProjection => ({
    primary,
    alternatives:
      primary.disabled === true ? [] : alternativesFor(input, primary),
    reason,
    changeRequestLabel,
  });

  if (input.loading || input.status === null) {
    return finish(action("checking", "none", true), { id: "checking" });
  }
  if (!input.status.is_repo) {
    return finish(action("unavailable", "none", true), {
      id: "not_repository",
    });
  }

  if (input.status.files.length > 0) {
    return finish(action("review_changes", "source_control"), {
      id: "local_changes",
      count: input.status.files.length,
    });
  }
  if (input.status.ahead > 0) {
    return finish(action("push", "push"), {
      id: "ahead",
      count: input.status.ahead,
    });
  }

  const { pullRequest } = input;
  if (!pullRequest) {
    if (canCreateChangeRequest(input)) {
      return finish(action("create_change_request", "source_control"), {
        id: "create_change_request",
      });
    }
    if (input.forgeError != null && input.forgeError !== "") {
      return finish(action("source_control", "source_control"), {
        id: "forge_degraded",
      });
    }
    return finish(action("up_to_date", "none", true), { id: "clean" });
  }

  const state = pullRequest.state.toLocaleUpperCase();
  if (state === "MERGED") {
    if (input.canCleanup) {
      return finish(action("cleanup_worktree", "cleanup"), { id: "merged" });
    }
    return finish(action("view_pull_request", "pull_request"), {
      id: "merged",
    });
  }
  if (state !== "OPEN") {
    return finish(action("view_pull_request", "pull_request"), {
      id: "closed",
    });
  }

  const mergeable = pullRequest.mergeable.toLocaleUpperCase();
  const mergeState = pullRequest.merge_state_status.toLocaleUpperCase();
  if (mergeable === "CONFLICTING" || mergeState === "DIRTY") {
    return finish(action("resolve_conflicts", "source_control"), {
      id: "conflicts",
    });
  }

  let failedChecks = 0;
  let pendingChecks = 0;
  for (const check of pullRequest.checks) {
    const tone = checkTone(check);
    if (tone === "failure") failedChecks += 1;
    else if (tone === "pending") pendingChecks += 1;
  }
  if (failedChecks > 0) {
    return finish(action("review_failed_checks", "pull_request"), {
      id: "failed_checks",
      count: failedChecks,
    });
  }

  if (
    pullRequest.review_decision?.toLocaleUpperCase() === "CHANGES_REQUESTED"
  ) {
    return finish(action("address_review", "pull_request"), {
      id: "requested_changes",
    });
  }
  if (pendingChecks > 0) {
    return finish(action("view_checks", "pull_request"), {
      id: "pending_checks",
      count: pendingChecks,
    });
  }
  if (input.status.behind > 0) {
    return finish(action("review_remote_updates", "source_control"), {
      id: "behind",
      count: input.status.behind,
    });
  }
  if (pullRequest.is_draft) {
    return finish(action("review_draft", "pull_request"), { id: "draft" });
  }
  if (pullRequest.review_decision?.toLocaleUpperCase() === "REVIEW_REQUIRED") {
    return finish(action("view_pull_request", "pull_request"), {
      id: "awaiting_review",
    });
  }
  if (mergeState === "CLEAN") {
    return finish(action("merge_pull_request", "pull_request"), {
      id: "merge_ready",
    });
  }
  return finish(action("view_pull_request", "pull_request"), {
    id: "pull_request",
  });
}

export function runGitNextAction(
  item: GitNextActionItem,
  handlers: GitNextActionHandlers
): void {
  switch (item.destination) {
    case "source_control": {
      handlers.openSourceControl();
      break;
    }
    case "push": {
      handlers.push();
      break;
    }
    case "pull_request": {
      handlers.openPullRequest();
      break;
    }
    case "cleanup": {
      handlers.cleanupWorktree();
      break;
    }
    case "none": {
      break;
    }
  }
}

export function gitNextActionLabel(
  t: Translate,
  item: GitNextActionItem,
  changeRequestLabel: GitNextActionProjection["changeRequestLabel"]
): string {
  switch (item.id) {
    case "checking": {
      return t("git.next.checking");
    }
    case "unavailable": {
      return t("git.next.unavailable");
    }
    case "up_to_date": {
      return t("git.next.upToDate");
    }
    case "source_control": {
      return t("action.open_source_control");
    }
    case "review_changes": {
      return t("git.next.reviewChanges");
    }
    case "push": {
      return t("header.push");
    }
    case "create_change_request": {
      return t("git.next.createChangeRequest", { label: changeRequestLabel });
    }
    case "resolve_conflicts": {
      return t("git.next.resolveConflicts");
    }
    case "review_failed_checks": {
      return t("git.next.reviewFailedChecks");
    }
    case "address_review": {
      return t("git.next.addressReview");
    }
    case "view_checks": {
      return t("git.next.viewChecks");
    }
    case "review_remote_updates": {
      return t("git.next.reviewRemoteUpdates");
    }
    case "review_draft": {
      return t("git.next.reviewDraft");
    }
    case "view_pull_request": {
      return t("git.next.viewChangeRequest", { label: changeRequestLabel });
    }
    case "merge_pull_request": {
      return t("git.next.mergeChangeRequest", { label: changeRequestLabel });
    }
    case "cleanup_worktree": {
      return t("git.next.cleanupWorktree");
    }
  }
}

export function gitNextActionReason(
  t: Translate,
  projection: GitNextActionProjection
): string {
  const { reason } = projection;
  switch (reason.id) {
    case "checking": {
      return t("git.next.reason.checking");
    }
    case "not_repository": {
      return t("git.next.reason.notRepository");
    }
    case "local_changes": {
      return t("git.next.reason.localChanges", { count: reason.count });
    }
    case "ahead": {
      return t("git.next.reason.ahead", { count: reason.count });
    }
    case "create_change_request": {
      return t("git.next.reason.createChangeRequest", {
        label: projection.changeRequestLabel,
      });
    }
    case "conflicts": {
      return t("git.next.reason.conflicts");
    }
    case "failed_checks": {
      return t("git.next.reason.failedChecks", { count: reason.count });
    }
    case "requested_changes": {
      return t("git.next.reason.requestedChanges");
    }
    case "pending_checks": {
      return t("git.next.reason.pendingChecks", { count: reason.count });
    }
    case "behind": {
      return t("git.next.reason.behind", { count: reason.count });
    }
    case "draft": {
      return t("git.next.reason.draft");
    }
    case "awaiting_review": {
      return t("git.next.reason.awaitingReview");
    }
    case "merge_ready": {
      return t("git.next.reason.mergeReady");
    }
    case "merged": {
      return t("git.next.reason.merged");
    }
    case "closed": {
      return t("git.next.reason.closed");
    }
    case "pull_request": {
      return t("git.next.reason.pullRequest");
    }
    case "forge_degraded": {
      return t("git.next.reason.forgeDegraded");
    }
    case "clean": {
      return t("git.next.reason.clean");
    }
  }
}
