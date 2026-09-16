import { useRef, useState } from "react";

import { DragDropRoot } from "@/components/ui/drag-drop";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "@/components/ui/drag-drop";
import type { Locale, Translate } from "@/i18n";
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus";

import {
  boardDragData,
  boardDropAfter,
  boardDropAfterKeyboard,
  boardDropPreview,
} from "./boardDnd";
import type { BoardTask, TaskBoardLane, TaskStatus } from "./taskBoard";
import { TASK_BOARD_LANES } from "./taskBoard";
import { TaskBoardColumn } from "./TaskBoardColumn";
import { useBoardDragPan } from "./useBoardDragPan";
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
  onMoveTask: (task: BoardTask, status: TaskStatus, beforeId?: string) => void;
  onAddTask: (lane: TaskBoardLane) => void;
  onStartTask?: (task: BoardTask) => void;
}

interface BoardDropState {
  lane: TaskBoardLane;
  status: TaskStatus;
  beforeId?: string;
  /** Card carrying the insertion indicator, and whether the drop lands after it. */
  edgeTaskId: string | null;
  edgeAfter: boolean;
}

/** Structural slice of dnd-kit's drag operation that the board resolves drops from. */
interface BoardDragOperation {
  source?: { id: unknown; element?: Element | null } | null;
  target?: { data?: unknown; element?: Element | null } | null;
  activatorEvent?: Event | null;
}

function isKeyboardDrag(activatorEvent: Event | null | undefined): boolean {
  return activatorEvent != null && "key" in activatorEvent;
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

function sameDropState(
  left: BoardDropState | null,
  right: BoardDropState | null
): boolean {
  if (left === right) return true;
  if (left == null || right == null) return false;
  return (
    left.lane === right.lane &&
    left.beforeId === right.beforeId &&
    left.edgeTaskId === right.edgeTaskId &&
    left.edgeAfter === right.edgeAfter
  );
}

export function TaskBoardKanban(props: TaskBoardKanbanProps) {
  const groupedTasks = groupTasks(props.projectedTasks);
  const [dropState, setDropState] = useState<BoardDropState | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  // Last hovered keyboard target and the insertion side computed for it. Repeated drag-over and
  // drag-move events for the same target must not recompute (and flip) the side.
  const keyboardTargetRef = useRef<{ taskId: string; after: boolean } | null>(
    null
  );
  const pan = useBoardDragPan<HTMLDivElement>();
  const tasksById = new Map(
    props.projectedTasks.map((projected) => [projected.task.id, projected.task])
  );

  // The board owns its drag resolution instead of the library's optimistic DOM reordering: React
  // stays the only writer of the card tree, so a lane change can never leave React removing a node
  // that the drag layer already moved.
  const resolveDropState = (
    operation: BoardDragOperation,
    activeTaskId: string | null
  ): BoardDropState | null => {
    if (activeTaskId == null) return null;
    const target = boardDragData(operation.target?.data);
    if (!target) return null;
    const laneTasks = groupedTasks[target.lane];
    const keyboard = isKeyboardDrag(operation.activatorEvent);
    let after = false;
    if (keyboard) {
      const previous = keyboardTargetRef.current;
      if (target.taskId != null) {
        if (previous != null && previous.taskId === target.taskId) {
          after = previous.after;
        } else {
          after = boardDropAfterKeyboard(
            laneTasks,
            target.taskId,
            previous?.taskId ?? activeTaskId
          );
          keyboardTargetRef.current = { taskId: target.taskId, after };
        }
      }
    } else {
      after = boardDropAfter(
        operation.source?.element,
        operation.target?.element
      );
    }
    const preview = boardDropPreview(
      laneTasks,
      activeTaskId,
      target.lane,
      target.taskId ?? null,
      after
    );
    return {
      lane: target.lane,
      status: preview.status,
      beforeId: preview.beforeId,
      edgeTaskId: preview.edge?.taskId ?? null,
      edgeAfter: preview.edge?.after ?? false,
    };
  };

  const updateDropState = (operation: BoardDragOperation) => {
    const next = resolveDropState(operation, activeTaskIdRef.current);
    setDropState((previous) =>
      sameDropState(previous, next) ? previous : next
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.operation.source?.id;
    const activeTaskId = typeof id === "string" ? id : null;
    activeTaskIdRef.current = activeTaskId;
    keyboardTargetRef.current = null;
    setDropState(resolveDropState(event.operation, activeTaskId));
  };

  const handleDragOver = (event: DragOverEvent) => {
    updateDropState(event.operation);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    updateDropState(event.operation);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeTaskId = activeTaskIdRef.current;
    activeTaskIdRef.current = null;
    keyboardTargetRef.current = null;
    const drop = resolveDropState(event.operation, activeTaskId);
    setDropState(null);
    if (event.canceled || activeTaskId == null) return;
    const task = tasksById.get(activeTaskId);
    if (!drop || !task) return;
    props.onMoveTask(task, drop.status, drop.beforeId);
  };

  return (
    <div
      ref={pan.ref}
      data-task-board-scroll
      className="task-board-kanban-shell min-h-0 max-w-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4"
      onPointerDown={pan.onPointerDown}
      onPointerMove={pan.onPointerMove}
      onPointerUp={pan.onPointerUp}
      onPointerCancel={pan.onPointerCancel}
      onLostPointerCapture={pan.onLostPointerCapture}
    >
      <DragDropRoot
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <div
          className="task-board-kanban"
          aria-label={props.t("taskboard.boardView")}
        >
          {TASK_BOARD_LANES.map((lane) => (
            <TaskBoardColumn
              key={lane}
              t={props.t}
              locale={props.locale}
              lane={lane}
              tasks={groupedTasks[lane]}
              activeFilterCount={props.activeFilterCount}
              dropTarget={dropState?.lane === lane}
              dropEdgeTaskId={
                dropState?.lane === lane ? dropState.edgeTaskId : null
              }
              dropEdgeAfter={dropState?.edgeAfter ?? false}
              selectedTaskId={props.selectedTaskId}
              pullRequestsByPath={props.pullRequestsByPath}
              onAddTask={() => props.onAddTask(lane)}
              onSelectTask={props.onSelectTask}
              onEditTask={props.onEditTask}
              onDeleteTask={props.onDeleteTask}
              onMoveTask={props.onMoveTask}
              onStartTask={props.onStartTask}
            />
          ))}
        </div>
      </DragDropRoot>
    </div>
  );
}
