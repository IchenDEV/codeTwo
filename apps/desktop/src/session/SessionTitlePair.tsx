import { sessionTitleTail } from "./title";

/**
 * The automatic session title that trails a pane's task title for context. A task created from a
 * single-prompt thread already names the thread, so this renders nothing when both names agree
 * (`session/title.ts` owns the comparison) and never renders an empty session title.
 */
export function SessionTitlePair({
  taskTitle,
  sessionTitle,
}: {
  taskTitle: string;
  sessionTitle: string | null | undefined;
}) {
  const trailing = sessionTitleTail(taskTitle, sessionTitle);
  if (trailing == null) return null;
  return (
    <>
      <span className="text-ui text-muted-foreground/50 shrink-0">/</span>
      <span className="electrobun-webkit-app-region-drag text-fine text-muted-foreground max-w-64 truncate">
        {trailing}
      </span>
    </>
  );
}
