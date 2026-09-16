import { StatusIndicator } from "@/components/business/status-indicator";
import { Button } from "@/components/ui/button";
import { useDragDropZone } from "@/components/ui/drag-drop";
import { Plus } from "@/components/ui/icons";
import type { Locale, Translate } from "@/i18n";
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus";

import type { BoardTask, TaskBoardLane, TaskStatus } from "./taskBoard";
import { TaskBoardCard } from "./TaskBoardCard";
import { laneLabel, LANE_TONES } from "./workspaceModel";
import type { ProjectedTask } from "./workspaceTypes";

interface TaskBoardColumnProps {
  t: Translate;
  locale: Locale;
  lane: TaskBoardLane;
  tasks: readonly ProjectedTask[];
  activeFilterCount: number;
  dropTarget: boolean;
  dropEdgeTaskId: string | null;
  dropEdgeAfter: boolean;
  selectedTaskId: string | null;
  pullRequestsByPath: ReadonlyMap<string, SidebarPullRequestStatus | null>;
  onAddTask: () => void;
  onSelectTask: (task: ProjectedTask) => void;
  onEditTask: (task: BoardTask) => void;
  onDeleteTask: (task: BoardTask) => void;
  onMoveTask: (task: BoardTask, status: TaskStatus) => void;
  onStartTask?: (task: BoardTask) => void;
}

export function TaskBoardColumn(props: TaskBoardColumnProps) {
  const { t, lane, tasks } = props;
  const zone = useDragDropZone({
    id: `taskboard-lane:${lane}`,
    accept: "task",
    collisionPriority: 0,
    data: { lane },
  });
  const label = laneLabel(t, lane);
  const dropTarget = props.dropTarget || zone.isDropTarget;

  return (
    <section
      data-task-column={lane}
      data-drop-target={dropTarget || undefined}
      aria-labelledby={`taskboard-column-${lane}`}
      className="task-board-kanban-column"
    >
      <header className="gap-inline flex shrink-0 items-center px-1 pb-2">
        <h2 id={`taskboard-column-${lane}`} className="min-w-0 flex-1">
          <StatusIndicator tone={LANE_TONES[lane]} label={label} />
        </h2>
        <span className="text-metadata text-muted-foreground shrink-0 tabular-nums">
          {tasks.length}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground shrink-0"
          aria-label={t("taskboard.addInColumn", { status: label })}
          onClick={props.onAddTask}
        >
          <Plus aria-hidden />
        </Button>
      </header>
      <div
        ref={zone.ref}
        data-task-column-cards
        className="task-board-kanban-cards"
      >
        {tasks.map((projected, index) => (
          <TaskBoardCard
            key={projected.task.id}
            t={t}
            locale={props.locale}
            lane={lane}
            index={index}
            projected={projected}
            dropEdge={
              props.dropEdgeTaskId === projected.task.id
                ? props.dropEdgeAfter
                  ? "after"
                  : "before"
                : null
            }
            selected={props.selectedTaskId === projected.task.id}
            pullRequestsByPath={props.pullRequestsByPath}
            onSelect={() => props.onSelectTask(projected)}
            onEdit={() => props.onEditTask(projected.task)}
            onDelete={() => props.onDeleteTask(projected.task)}
            onMove={(status) => props.onMoveTask(projected.task, status)}
            onStartTask={props.onStartTask}
          />
        ))}
        {tasks.length === 0 ? (
          <p className="text-metadata text-muted-foreground px-3 py-8 text-center">
            {props.activeFilterCount > 0
              ? t("taskboard.emptyFiltered")
              : t("taskboard.emptyColumn")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
