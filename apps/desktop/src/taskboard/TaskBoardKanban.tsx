import { StatusIndicator } from "@/components/business/status-indicator";
import { Button } from "@/components/ui/button";
import type { Locale, Translate } from "@/i18n";
import { cn } from "@/lib/utils";
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus";

import { TaskActionsMenu } from "./TaskActionsMenu";
import { TASK_BOARD_LANES } from "./taskBoard";
import type { BoardTask, TaskBoardLane, TaskStatus } from "./taskBoard";
import { taskPriorityLabel } from "./TaskEditorDialog";
import {
  formatUpdatedAt,
  LANE_TONES,
  laneLabel,
  openPullRequestCount,
} from "./workspaceModel";
import type { ProjectedTask } from "./workspaceTypes";

interface TaskBoardKanbanProps {
  t: Translate;
  locale: Locale;
  projectedTasks: readonly ProjectedTask[];
  activeFilterCount: number;
  selectedTaskId: string | null;
  pullRequestsByPath: ReadonlyMap<string, SidebarPullRequestStatus | null>;
  onSelectTask: (task: ProjectedTask) => void;
  onEditTask: (task: BoardTask) => void;
  onDeleteTask: (task: BoardTask) => void;
  onMoveTask: (task: BoardTask, status: TaskStatus) => void;
  onStartTask?: (task: BoardTask) => void;
}

function groupTasks(
  tasks: readonly ProjectedTask[]
): Record<TaskBoardLane, ProjectedTask[]> {
  const grouped: Record<TaskBoardLane, ProjectedTask[]> = {
    queue: [],
    running: [],
    needs_you: [],
    done: [],
  };
  for (const task of tasks) grouped[task.lane].push(task);
  return grouped;
}

function TaskBoardCard({
  t,
  locale,
  projected,
  selected,
  pullRequestsByPath,
  onSelect,
  onEdit,
  onDelete,
  onMove,
  onStartTask,
}: {
  t: Translate;
  locale: Locale;
  projected: ProjectedTask;
  selected: boolean;
  pullRequestsByPath: ReadonlyMap<string, SidebarPullRequestStatus | null>;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (status: TaskStatus) => void;
  onStartTask?: (task: BoardTask) => void;
}) {
  const { task, lane, sessions } = projected;
  const openPullRequests = openPullRequestCount(sessions, pullRequestsByPath);

  return (
    <article
      data-task-card={task.id}
      data-task-lane={lane}
      data-selected={selected || undefined}
      className={cn(
        "task-board-card group rounded-module bg-background shadow-surface min-w-0 overflow-hidden p-2.5 transition-colors",
        selected
          ? "bg-accent/50 ring-primary/30 ring-1 ring-inset"
          : "hover:bg-accent/30"
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="row"
          focusStyle="inset"
          className="rounded-control h-auto min-w-0 flex-1 justify-start px-1 py-0.5 text-left font-semibold"
          aria-label={t("taskboard.selectTaskCard", { title: task.title })}
          onClick={onSelect}
        >
          <span className="line-clamp-2 min-w-0 break-words">{task.title}</span>
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

      <div
        data-task-card-meta
        className="text-metadata text-muted-foreground mt-2 flex max-w-full min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 overflow-hidden"
      >
        {task.priority === "none" ? null : (
          <span>{taskPriorityLabel(t, task.priority)}</span>
        )}
        {sessions.length > 0 ? (
          <span>{t("taskboard.sessionCount", { count: sessions.length })}</span>
        ) : null}
        {openPullRequests !== null && openPullRequests > 0 ? (
          <span
            aria-label={t("taskboard.openPullRequestCount", {
              count: openPullRequests,
            })}
          >
            {t("taskboard.cardPullRequests", { count: openPullRequests })}
          </span>
        ) : null}
        <span className="ml-auto max-w-full shrink-0 truncate tabular-nums">
          {formatUpdatedAt(task.updatedAt, locale, t)}
        </span>
      </div>
    </article>
  );
}

export function TaskBoardKanban(props: TaskBoardKanbanProps) {
  const groupedTasks = groupTasks(props.projectedTasks);

  return (
    <div
      data-task-board-scroll
      className="task-board-kanban-shell min-h-0 max-w-full min-w-0 flex-1 overflow-x-auto overflow-y-auto px-4 pb-4"
    >
      <div
        className="task-board-kanban min-h-full gap-2"
        aria-label={props.t("taskboard.boardView")}
      >
        {TASK_BOARD_LANES.map((lane) => {
          const tasks = groupedTasks[lane];
          return (
            <section
              key={lane}
              data-task-column={lane}
              aria-labelledby={`taskboard-column-${lane}`}
              className="task-board-kanban-column rounded-module bg-fill-quiet flex min-h-0 min-w-0 flex-col p-2.5"
            >
              <header className="flex shrink-0 items-center gap-2 px-1 py-2">
                <h2 id={`taskboard-column-${lane}`} className="min-w-0 flex-1">
                  <StatusIndicator
                    tone={LANE_TONES[lane]}
                    label={laneLabel(props.t, lane)}
                  />
                </h2>
                <span className="text-metadata text-muted-foreground tabular-nums">
                  {tasks.length}
                </span>
              </header>
              <div className="grid content-start gap-2">
                {tasks.map((projected) => (
                  <TaskBoardCard
                    key={projected.task.id}
                    t={props.t}
                    locale={props.locale}
                    projected={projected}
                    selected={props.selectedTaskId === projected.task.id}
                    pullRequestsByPath={props.pullRequestsByPath}
                    onSelect={() => props.onSelectTask(projected)}
                    onEdit={() => props.onEditTask(projected.task)}
                    onDelete={() => props.onDeleteTask(projected.task)}
                    onMove={(status) =>
                      props.onMoveTask(projected.task, status)
                    }
                    onStartTask={props.onStartTask}
                  />
                ))}
                {tasks.length === 0 ? (
                  <p className="text-metadata text-muted-foreground px-3 py-8 text-center">
                    {props.activeFilterCount > 0
                      ? props.t("taskboard.emptyFiltered")
                      : props.t("taskboard.emptyColumn")}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
