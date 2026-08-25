import { AlertTriangle, Bell, ChevronRight, Info, X } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useT } from "../i18n";

/**
 * An asynchronous event worth surfacing outside the transcript flow: a background session
 * finishing or failing, an automation run needing attention, a warning that belongs to no open
 * turn. Notices are in-memory only — dismissing just drops the row.
 */
export interface SessionNotice {
  /** Stable id; a re-fired event replaces its earlier row instead of stacking. */
  id: string;
  kind: "info" | "warning" | "error";
  title: string;
  detail?: string;
  time: number;
}

export const MAX_SESSION_NOTICES = 20;

/** Merge a notice into the list, replacing the same-id row and bounding the tail. */
export function pushSessionNotice(
  current: readonly SessionNotice[],
  notice: SessionNotice,
): SessionNotice[] {
  return [...current.filter((item) => item.id !== notice.id), notice].slice(
    -MAX_SESSION_NOTICES,
  );
}

function useRelativeTime(): (time: number) => string {
  const t = useT();
  return (time) => {
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 60) return t("notices.justNow");
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t("notices.minutesAgo", { count: minutes });
    return t("notices.hoursAgo", { count: Math.floor(minutes / 60) });
  };
}

/**
 * The notification card above the composer. Collapses behind a "N notifications" header when
 * there are more than three; each row can be dismissed individually.
 */
export function SessionNotices({
  notices,
  onDismiss,
}: {
  notices: readonly SessionNotice[];
  onDismiss: (id: string) => void;
}) {
  const t = useT();
  const relativeTime = useRelativeTime();
  const [open, setOpen] = useState(notices.length <= 3);
  if (notices.length === 0) return null;
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mx-auto mb-2 w-full max-w-3xl overflow-hidden rounded-(--ds-radius-module) border bg-fill-quiet"
      data-session-notices
    >
      <CollapsibleTrigger
        className="group flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-fine transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Bell className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {t("notices.title", { count: notices.length })}
        </span>
        <span className="flex shrink-0 gap-1" aria-hidden>
          {notices.slice(0, 5).map((notice) => (
            <span
              key={notice.id}
              className={
                notice.kind === "info"
                  ? "size-1.5 rounded-full bg-muted-foreground/50"
                  : "size-1.5 rounded-full bg-destructive"
              }
            />
          ))}
        </span>
        <ChevronRight
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="min-w-0 divide-y divide-border">
        {notices.map((notice) => (
          <div key={notice.id} className="flex min-w-0 items-start gap-2 px-3 py-2 text-fine">
            {notice.kind === "info" ? (
              <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{notice.title}</p>
              {notice.detail ? (
                <p className="truncate text-muted-foreground" title={notice.detail}>
                  {notice.detail}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-cap text-muted-foreground">
              {relativeTime(notice.time)}
            </span>
            <button
              type="button"
              aria-label={t("notices.dismiss")}
              title={t("notices.dismiss")}
              className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={() => onDismiss(notice.id)}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
