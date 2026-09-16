import { laneStatus, TASK_BOARD_LANES } from "./taskBoard";
import type { TaskBoardLane, TaskStatus } from "./taskBoard";
import type { ProjectedTask } from "./workspaceTypes";
/** Durable outcome of one board drop. `beforeId` is the exact anchor inside `status`. */
export interface BoardDrop {
  status: TaskStatus;
  beforeId?: string;
}

/** Durable outcome plus the card the insertion indicator attaches to. */
export interface BoardDropPreview extends BoardDrop {
  edge: { taskId: string; after: boolean } | null;
}

export interface BoardDragData {
  lane: TaskBoardLane;
  taskId?: string;
}

export function isTaskBoardLane(value: unknown): value is TaskBoardLane {
  return (
    typeof value === "string" &&
    (TASK_BOARD_LANES as readonly string[]).includes(value)
  );
}

/**
 * Reads the drag target's data. Cards carry `{taskId, lane}` and lane scrollers carry `{lane}`, so
 * both a card hover and a background hover resolve to the same lane.
 */
export function boardDragData(value: unknown): BoardDragData | null {
  if (value == null || typeof value !== "object") return null;
  const candidate = value as { lane?: unknown; taskId?: unknown };
  if (!isTaskBoardLane(candidate.lane)) return null;
  return {
    lane: candidate.lane,
    taskId: typeof candidate.taskId === "string" ? candidate.taskId : undefined,
  };
}

/**
 * Resolves a drop into one reducer `move`. `laneTasks` is the lane's projected order including the
 * dragged card; `index` is the insertion index in that list *without* the dragged card. The anchor
 * is the first task at or after the insertion point whose durable status matches the lane's status
 * — a lane can only mix statuses in `needs_you` (`in_review` plus attention-carrying
 * `in_progress`), and the reducer orders by status before `order`, so the nearest achievable
 * anchor wins over the literal pixel.
 */
export function boardDropTarget(
  laneTasks: readonly ProjectedTask[],
  activeTaskId: string,
  lane: TaskBoardLane,
  index: number
): BoardDrop {
  const status = laneStatus(lane);
  const remaining = laneTasks.filter(
    (projected) => projected.task.id !== activeTaskId
  );
  const bounded = Math.min(Math.max(0, Math.trunc(index)), remaining.length);
  const anchor = remaining
    .slice(bounded)
    .find((projected) => projected.task.status === status);
  return anchor ? { status, beforeId: anchor.task.id } : { status };
}

/**
 * Insertion side for a keyboard drag: the hovered card is the one the pressed arrow moved toward,
 * so the dragged card lands after it only when that card sits further along the lane than the
 * previously hovered card (or the dragged card at drag start). Moving one card down therefore
 * lands after it, and moving back up lands before it again.
 */
export function boardDropAfterKeyboard(
  laneTasks: readonly ProjectedTask[],
  targetTaskId: string,
  previousTaskId: string | null
): boolean {
  if (previousTaskId == null || previousTaskId === targetTaskId) return false;
  const targetIndex = laneTasks.findIndex(
    (projected) => projected.task.id === targetTaskId
  );
  const previousIndex = laneTasks.findIndex(
    (projected) => projected.task.id === previousTaskId
  );
  return (
    previousIndex !== -1 && targetIndex !== -1 && targetIndex > previousIndex
  );
}

/**
 * Drop resolution for a hovered card (or lane background) plus the pointer's position relative to
 * the target. Dropping on the dragged card itself keeps the current position, so a self-hover is a
 * no-op instead of an accidental append.
 */
export function boardDropPreview(
  laneTasks: readonly ProjectedTask[],
  activeTaskId: string,
  lane: TaskBoardLane,
  targetTaskId: string | null,
  after: boolean
): BoardDropPreview {
  const remaining = laneTasks.filter(
    (projected) => projected.task.id !== activeTaskId
  );
  if (targetTaskId === activeTaskId) {
    const activeIndex = laneTasks.findIndex(
      (projected) => projected.task.id === activeTaskId
    );
    return {
      ...boardDropTarget(
        laneTasks,
        activeTaskId,
        lane,
        activeIndex === -1 ? remaining.length : activeIndex
      ),
      edge: null,
    };
  }
  if (targetTaskId == null) {
    return {
      ...boardDropTarget(laneTasks, activeTaskId, lane, remaining.length),
      edge: null,
    };
  }
  const targetIndex = remaining.findIndex(
    (projected) => projected.task.id === targetTaskId
  );
  if (targetIndex === -1) {
    return {
      ...boardDropTarget(laneTasks, activeTaskId, lane, remaining.length),
      edge: null,
    };
  }
  return {
    ...boardDropTarget(
      laneTasks,
      activeTaskId,
      lane,
      targetIndex + (after ? 1 : 0)
    ),
    edge: { taskId: targetTaskId, after },
  };
}

/**
 * Whether a pointer drag currently floats below the hovered card's midpoint. Board cards are
 * draggable without the library's optimistic DOM reordering (React owns the card tree), so the
 * insertion side is read from the two real element rectangles rather than from a sortable index.
 * Keyboard drags do not have a meaningful midpoint (the shape is snapped onto the hovered card),
 * so they resolve their side from the arrow history instead — see `boardDropAfterKeyboard`.
 */
export function boardDropAfter(
  source: Element | null | undefined,
  target: Element | null | undefined
): boolean {
  if (!source || !target) return false;
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  return (
    sourceRect.top + sourceRect.height / 2 >
    targetRect.top + targetRect.height / 2
  );
}
