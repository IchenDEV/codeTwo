import type { WorktreeStatusEntry } from "../bridge";

/** "refs/heads/codetwo/x" → "codetwo/x" — rows show the name people type, not the full ref. */
export function worktreeBranchDisplay(
  branch: string | null | undefined
): string | null {
  if (branch == null || branch === "") return null;
  return branch.startsWith("refs/heads/")
    ? branch.slice("refs/heads/".length)
    : branch;
}

export type WorktreeStatusBadge = "archived" | "discarded" | "checkoutMissing";

/** Status badges for one row, in display order. */
export function worktreeStatusBadges(
  entry: WorktreeStatusEntry
): WorktreeStatusBadge[] {
  const badges: WorktreeStatusBadge[] = [];
  if (entry.session_archived) badges.push("archived");
  if (entry.worktree_discarded) badges.push("discarded");
  if (!entry.checkout_present) badges.push("checkoutMissing");
  return badges;
}

export type WorktreeDiscardRoute =
  | { kind: "session"; session: string }
  | { kind: "orphan"; worktreePath: string };

/** Route a row's Discard: a session-claimed checkout goes through its session, the rest by path. */
export function worktreeDiscardRoute(
  entry: WorktreeStatusEntry
): WorktreeDiscardRoute {
  return entry.kind === "session" &&
    entry.session_id != null &&
    entry.session_id !== ""
    ? { kind: "session", session: entry.session_id }
    : { kind: "orphan", worktreePath: entry.path };
}
