/**
 * The board auto-names a task from the submitted prompt (`summarizeDoc`, whitespace-collapsed and
 * sliced to 72 characters), while its session carries the core's automatic first-sentence title
 * (`initial_session_title`: leading markdown dropped, first sentence only, bounded to 8 words / 40
 * characters, 24 for unspaced scripts). Both name the same thread, so the session header must treat
 * them as one name instead of printing the title twice.
 */

/** Case-folded comparison key: whitespace collapsed, leading markdown and trailing punctuation dropped. */
export function threadTitleKey(value: string): string {
  return value
    .replaceAll(/\s+/gu, " ")
    .trim()
    .replace(/^[#>*-+`"']+\s*/u, "")
    .replace(/[.!?。？！;；:：,，、"'“”‘’]+$/u, "")
    .toLocaleLowerCase();
}

/**
 * Whether two display names describe one thread. A prefix counts because the prompt slice and the
 * automatic title stop at independent bounds.
 */
export function sameThreadTitle(left: string, right: string): boolean {
  const a = threadTitleKey(left);
  const b = threadTitleKey(right);
  if (a === "" || b === "") return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

/**
 * The session name to trail after the task title, or `null` when the task already names the thread.
 * An empty session title never renders.
 */
export function sessionTitleTail(
  taskTitle: string,
  sessionTitle: string | null | undefined
): string | null {
  if (sessionTitle == null || sessionTitle.trim() === "") return null;
  return sameThreadTitle(taskTitle, sessionTitle) ? null : sessionTitle;
}
