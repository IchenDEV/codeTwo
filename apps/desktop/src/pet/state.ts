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

const PET_BUBBLE_MAX_CHARACTERS = 160;

/**
 * Collapse C2's richer session lifecycle into the stable Codex Pet v2 rows.
 * Waiting wins over running because an approval request remains busy at the session level.
 */
export function petAnimationForActivity(
  activity: CodeTwoPetActivity
): CodeTwoPetAnimation {
  if (activity.loading || activity.awaitingInput) return "waiting";
  if (activity.running) return "running";
  if (activity.failed) return "failed";
  if (activity.completed) return "review";
  return "idle";
}

/** Keep the floating bubble glanceable while the transcript remains the canonical response. */
export function petConversationBubbleForActivity(
  activity: CodeTwoPetActivity,
  assistantText: string
): string | null {
  if (!activity.loading && !activity.running && !activity.awaitingInput)
    return null;

  const normalized = assistantText.replaceAll(/\s+/gu, " ").trim();
  if (!normalized) return null;

  const characters = [...normalized];
  if (characters.length <= PET_BUBBLE_MAX_CHARACTERS) return normalized;
  return `…${characters.slice(-(PET_BUBBLE_MAX_CHARACTERS - 1)).join("")}`;
}
