import { ChevronRight, Plus } from "@/components/ui/icons"
import { Button } from "@/components/ui/button"
import type { Locale, Translate } from "@/i18n"
import { cn } from "@/lib/utils"
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus"

import { TaskActionsMenu } from "./TaskActionsMenu"
import { TaskSessionRow } from "./TaskSessionRow"
import type { BoardTask, TaskStatus } from "./taskBoard"
import {
  formatUpdatedAt,
  LANE_DOT_TONES,
  openPullRequestCount,
  sessionCheckoutPath,
} from "./workspaceModel"
import type { ProjectedTask } from "./workspaceTypes"

interface TaskListItemProps {
  t: Translate
  locale: Locale
  projected: ProjectedTask
  expanded: boolean
  selectedTaskId: string | null
  selectedSessionId: string | null
  pullRequestsByPath: ReadonlyMap<string, SidebarPullRequestStatus | null>
  onToggle: () => void
  onSelectSession: (id: string) => void
  onEdit: () => void
  onDelete: () => void
  onMove: (status: TaskStatus) => void
  onStartTask?: (task: BoardTask) => void
}

export function TaskListItem({
  t,
  locale,
  projected,
  expanded,
  selectedTaskId,
  selectedSessionId,
  pullRequestsByPath,
  onToggle,
  onSelectSession,
  onEdit,
  onDelete,
  onMove,
  onStartTask,
}: TaskListItemProps) {
  const { task, lane, sessions } = projected
  const openPrs = openPullRequestCount(sessions, pullRequestsByPath)
  const selected = selectedTaskId === task.id

  return (
    <li data-task-item={task.id} className="border-b border-border last:border-b-0">
      <div
        data-task-row={task.id}
        data-selected={selected || undefined}
        className={cn(
          "task-board-task-row group min-w-0 items-center transition-colors",
          selected ? "bg-accent/35" : "hover:bg-accent/25",
        )}
      >
        <div className="flex min-w-0 items-center gap-1 px-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            focusStyle="inset"
            className="shrink-0"
            aria-label={expanded
              ? t("taskboard.collapseTask", { title: task.title })
              : t("taskboard.expandTask", { title: task.title })}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            <ChevronRight
              aria-hidden
              className={cn(
                "size-3.5 transition-transform motion-reduce:transition-none",
                expanded && "rotate-90",
              )}
            />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="row"
            focusStyle="inset"
            className="h-auto min-w-0 flex-1 justify-start rounded-none px-1 py-3 text-left font-semibold"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", LANE_DOT_TONES[lane])} />
            <span className="truncate">{task.title}</span>
          </Button>
          <TaskActionsMenu
            t={t}
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
            onStartTask={onStartTask}
          />
        </div>
        <span
          className="task-board-task-sessions text-center text-body tabular-nums text-muted-foreground"
          aria-label={t("taskboard.sessionCount", { count: sessions.length })}
        >
          {sessions.length}
        </span>
        <span
          className="task-board-task-prs text-center text-body tabular-nums text-muted-foreground"
          aria-label={t("taskboard.openPullRequestCount", { count: openPrs })}
        >
          {openPrs}
        </span>
        <span className="pr-4 text-right text-metadata tabular-nums text-muted-foreground">
          {formatUpdatedAt(task.updatedAt, locale, t)}
        </span>
      </div>

      {expanded ? (
        <div
          className="task-board-session-stack ml-8 border-l border-border"
          aria-label={t("taskboard.taskSessions", { title: task.title })}
        >
          {sessions.length > 0 ? sessions.map((session) => {
            const path = sessionCheckoutPath(session)
            return (
              <TaskSessionRow
                key={session.id}
                t={t}
                locale={locale}
                task={task}
                session={session}
                selected={session.id === selectedSessionId}
                pullRequest={path ? pullRequestsByPath.get(path) ?? null : null}
                onSelect={() => onSelectSession(session.id)}
              />
            )
          }) : (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-metadata text-muted-foreground">
              <span>{t("taskboard.noSessions")}</span>
              {onStartTask ? (
                <Button type="button" variant="ghost" size="compact" onClick={() => onStartTask(task)}>
                  <Plus aria-hidden />
                  {t("taskboard.startTask")}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </li>
  )
}
