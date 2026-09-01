import { GitBranch, GitPullRequest } from "@/components/ui/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusIndicator } from "@/components/business/status-indicator"
import type { Locale, Translate } from "@/i18n"
import { cn } from "@/lib/utils"
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus"

import type { BoardTask } from "./taskBoard"
import {
  checkoutLabel,
  formatUpdatedAt,
  PULL_REQUEST_TONES,
  pullRequestStatusLabel,
  sessionCheckoutPath,
  sessionStatusLabel,
  sessionStatusTone,
  sessionUpdatedAt,
} from "./workspaceModel"
import type { SessionProjection } from "./workspaceTypes"

interface TaskSessionRowProps {
  t: Translate
  locale: Locale
  task: BoardTask
  session: SessionProjection
  selected: boolean
  pullRequest: SidebarPullRequestStatus | null | undefined
  onSelect: () => void
}

export function TaskSessionRow({
  t,
  locale,
  task,
  session,
  selected,
  pullRequest,
  onSelect,
}: TaskSessionRowProps) {
  const checkoutPath = sessionCheckoutPath(session)
  const updated = sessionUpdatedAt(session, task.updatedAt)
  return (
    <Button
      type="button"
      variant="ghost"
      size="row"
      focusStyle="inset"
      data-task-session={session.id}
      data-selected={selected || undefined}
      className={cn(
        "task-board-session-row h-auto w-full rounded-none px-3 py-2 text-left font-normal",
        selected ? "bg-primary/8 text-foreground hover:bg-primary/10" : "hover:bg-accent/45",
      )}
      aria-label={t("taskboard.selectSession", {
        number: session.number,
        title: session.title,
        status: sessionStatusLabel(t, session),
      })}
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-2">
        <StatusIndicator
          tone={sessionStatusTone(session)}
          label={sessionStatusLabel(t, session)}
        />
        <span className="truncate font-medium">
          {t("taskboard.sessionOrdinal", { number: session.number })} · {session.title}
        </span>
        {session.current ? (
          <Badge variant="secondary" className="shrink-0 px-1.5 text-metadata font-medium text-primary">
            {t("taskboard.currentSession")}
          </Badge>
        ) : null}
        {session.archived ? (
          <span className="shrink-0 text-metadata text-muted-foreground">
            {t("taskboard.archivedSession")}
          </span>
        ) : null}
      </span>
      <span className="task-board-session-checkout flex min-w-0 items-center gap-1.5 text-metadata text-muted-foreground">
        <GitBranch aria-hidden className="size-3.5 shrink-0" />
        <span className="truncate" title={checkoutPath ?? undefined}>
          {checkoutLabel(t, session, checkoutPath)}
        </span>
      </span>
      <span className="task-board-session-pr min-w-0">
        {pullRequest === undefined ? (
          <span className="text-metadata text-muted-foreground">
            {t("taskboard.checkingPullRequest")}
          </span>
        ) : pullRequest ? (
          <span className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-control bg-fill-rest px-2 py-1 text-metadata font-medium",
            PULL_REQUEST_TONES[pullRequest.state],
          )}>
            <GitPullRequest aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">
              #{pullRequest.number} · {pullRequestStatusLabel(t, pullRequest.state)}
            </span>
          </span>
        ) : (
          <span className="text-metadata text-muted-foreground">{t("taskboard.noPullRequest")}</span>
        )}
      </span>
      <span className="task-board-session-updated text-right text-metadata tabular-nums text-muted-foreground">
        {formatUpdatedAt(updated, locale, t)}
      </span>
    </Button>
  )
}
