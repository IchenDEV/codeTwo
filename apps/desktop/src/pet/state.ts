export type CodeTwoPetAnimation =
  "idle" | "running" | "waiting" | "failed" | "review";

export interface CodeTwoPetActivity {
  loading: boolean;
  running: boolean;
  awaitingInput: boolean;
  failed: boolean;
  completed: boolean;
}

const petBubbleMaxCharacters = 160;

export function petAnimationForActivity(
  activity: CodeTwoPetActivity
): CodeTwoPetAnimation {
  if (activity.loading || activity.awaitingInput) {
    return "waiting";
  }
  if (activity.running) {
    return "running";
  }
  if (activity.failed) {
    return "failed";
  }
  if (activity.completed) {
    return "review";
  }
  return "idle";
}

export function petConversationBubbleForActivity(
  activity: CodeTwoPetActivity,
  assistantText: string
): string | null {
  if (!activity.loading && !activity.running && !activity.awaitingInput) {
    return null;
  }

  const normalized = assistantText.replaceAll(/\s+/gu, " ").trim();
  if (!normalized) {
    return null;
  }

  const characters = [...normalized];
  if (characters.length <= petBubbleMaxCharacters) {
    return normalized;
  }
  return `…${characters.slice(-(petBubbleMaxCharacters - 1)).join("")}`;
}
