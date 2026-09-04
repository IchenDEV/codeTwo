import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { Locale, Translate } from "@/i18n"
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus"

import { TaskListItem } from "./TaskListItem"
import type { BoardTask, TaskStatus } from "./taskBoard"
import { INITIAL_TASK_LIMIT } from "./workspaceModel"
import type { ProjectedTask } from "./workspaceTypes"

interface TaskBoardListProps {
  t: Translate
  locale: Locale
  projectedTasks: readonly ProjectedTask[]
  renderedTasks: readonly ProjectedTask[]
  remainingTaskCount: number
  activeFilterCount: number
  expandedTaskIds: ReadonlySet<string>
  selectedTaskId: string | null
  selectedSessionId: string | null
  pullRequestsByPath: ReadonlyMap<string, SidebarPullRequestStatus | null>
  onToggleTask: (task: ProjectedTask) => void
  onSelectSession: (taskId: string, sessionId: string) => void
  onEditTask: (task: BoardTask) => void
  onDeleteTask: (task: BoardTask) => void
  onMoveTask: (task: BoardTask, status: TaskStatus) => void
  onStartTask?: (task: BoardTask) => void
  onShowMore: () => void
}

export function TaskBoardList(props: TaskBoardListProps) {
  const { t } = props
  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 pb-4 sm:px-6 sm:pb-6">
      <Separator />
      <div className="task-board-list min-w-0">
        <div className="task-board-list-header items-center px-3 py-2 text-metadata text-muted-foreground" aria-hidden>
          <span>{t("taskboard.titleHeader")}</span>
          <span className="task-board-task-sessions text-center">{t("taskboard.sessionsHeader")}</span>
          <span className="task-board-task-prs text-center">{t("taskboard.openPullRequestsHeader")}</span>
          <span className="text-right">{t("taskboard.updatedHeader")}</span>
        </div>
        <Separator />
        {props.renderedTasks.length > 0 ? (
          <ul aria-label={t("taskboard.taskList")}>
            {props.renderedTasks.map((projected) => (
              <TaskListItem
                key={projected.task.id}
                t={t}
                locale={props.locale}
                projected={projected}
                expanded={props.expandedTaskIds.has(projected.task.id)}
                selectedTaskId={props.selectedTaskId}
                selectedSessionId={props.selectedSessionId}
                pullRequestsByPath={props.pullRequestsByPath}
                onToggle={() => props.onToggleTask(projected)}
                onSelectSession={(sessionId) => props.onSelectSession(projected.task.id, sessionId)}
                onEdit={() => props.onEditTask(projected.task)}
                onDelete={() => props.onDeleteTask(projected.task)}
                onMove={(status) => props.onMoveTask(projected.task, status)}
                onStartTask={props.onStartTask}
              />
            ))}
          </ul>
        ) : (
          <div className="px-4 py-16 text-center text-body text-muted-foreground">
            {props.activeFilterCount > 0 ? t("taskboard.emptyFiltered") : t("taskboard.emptyList")}
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-metadata text-muted-foreground">
        <span>
          {t("taskboard.visibleCount", {
            visible: props.renderedTasks.length,
            total: props.projectedTasks.length,
          })}
        </span>
        {props.remainingTaskCount > 0 ? (
          <Button type="button" variant="ghost" size="compact" onClick={props.onShowMore}>
            {t("taskboard.more", {
              count: Math.min(INITIAL_TASK_LIMIT, props.remainingTaskCount),
            })}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
