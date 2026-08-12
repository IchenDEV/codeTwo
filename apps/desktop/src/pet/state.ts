export type CodeTwoPetAnimation =
  | "idle"
  | "running"
  | "waiting"
  | "failed"
  | "review";

export interface CodeTwoPetActivity {
  loading: boolean;
  running: boolean;
  awaitingInput: boolean;
  failed: boolean;
  completed: boolean;
}

/**
 * Collapse CodeTwo's richer session lifecycle into the stable Codex Pet v2 rows.
 * Waiting wins over running because an approval request remains busy at the session level.
 */
export function petAnimationForActivity(activity: CodeTwoPetActivity): CodeTwoPetAnimation {
  if (activity.loading || activity.awaitingInput) return "waiting";
  if (activity.running) return "running";
  if (activity.failed) return "failed";
  if (activity.completed) return "review";
  return "idle";
}
