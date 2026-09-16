import { StatusBadge } from "@/components/business/status-badge";
import type { StatusTone } from "@/components/business/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  OptimisticSortingPlugin,
  useDragDropSortable,
} from "@/components/ui/drag-drop";
import type { UseSortableInput } from "@/components/ui/drag-drop";
import { Flag, GripVertical, MessageSquare } from "@/components/ui/icons";
import type { Locale, StringKey, Translate } from "@/i18n";
import { cn } from "@/lib/utils";
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus";

import { TaskActionsMenu } from "./TaskActionsMenu";
import type { BoardTask, TaskBoardLane, TaskStatus } from "./taskBoard";
import { taskPriorityLabel } from "./TaskEditorDialog";
import {
  formatUpdatedAt,
  openPullRequestCount,
  sessionActivityKind,
} from "./workspaceModel";
import type { ProjectedTask } from "./workspaceTypes";

export interface BoardCardDragData {
  taskId: string;
  lane: TaskBoardLane;
}

/**
 * The board resolves drops itself (`boardDnd.ts`) and React stays the only writer of the card
 * tree, so the library's optimistic DOM reordering is disabled: it moves the dragged card into
 * another lane's DOM, which React later tries to unmount from its original parent.
 */
export const boardCardPlugins: NonNullable<
  UseSortableInput<BoardCardDragData>["plugins"]
> = (defaults) =>
  defaults.filter((plugin) => plugin !== OptimisticSortingPlugin);

const MAX_LABEL_CHIPS = 2;

const CARD_ACTIVITY: Record<
  "running" | "awaiting_input" | "failed",
  { tone: StatusTone; label: StringKey }
> = {
  running: { tone: "success", label: "session.running" },
  awaiting_input: { tone: "warning", label: "session.awaitingInput" },
  failed: { tone: "destructive", label: "session.failed" },
};

function cardActivity(
  t: Translate,
  projected: ProjectedTask
): { tone: StatusTone; label: string } | null {
  const kind = sessionActivityKind(projected.currentSession);
  if (kind === "idle") return null;
  const activity = CARD_ACTIVITY[kind];
  return { tone: activity.tone, label: t(activity.label) };
}

interface TaskBoardCardProps {
  t: Translate;
  locale: Locale;
  lane: TaskBoardLane;
  index: number;
  projected: ProjectedTask;
  /** Insertion indicator: the drop lands before or after this card. */
  dropEdge: "before" | "after" | null;
  selected: boolean;
  pullRequestsByPath: ReadonlyMap<string, SidebarPullRequestStatus | null>;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (status: TaskStatus) => void;
  onStartTask?: (task: BoardTask) => void;
}

export function TaskBoardCard(props: TaskBoardCardProps) {
  const { t, locale, lane, projected, selected } = props;
  const { task, sessions } = projected;
  const sortable = useDragDropSortable<BoardCardDragData>({
    id: task.id,
    index: props.index,
    group: lane,
    type: "task",
    accept: "task",
    plugins: boardCardPlugins,
    data: { taskId: task.id, lane },
  });
  const openPullRequests = openPullRequestCount(
    sessions,
    props.pullRequestsByPath
  );
  const activity = cardActivity(t, projected);
  const labels = task.labels.slice(0, MAX_LABEL_CHIPS);
  const hiddenLabels = task.labels.length - labels.length;
  const description = task.description.trim();

  return (
    <article
      ref={sortable.ref}
      data-task-card={task.id}
      data-task-lane={lane}
      data-selected={selected || undefined}
      data-dragging={sortable.isDragging || undefined}
      data-drop-edge={props.dropEdge ?? undefined}
      className={cn(
        "task-board-card group rounded-module min-w-0 overflow-hidden p-3 transition-colors",
        selected
          ? "bg-accent/35 hover:bg-accent/50"
          : "bg-surface hover:bg-fill-hover"
      )}
    >
      <div className="gap-inline flex min-w-0 items-center">
        <GripVertical
          aria-hidden
          className="task-board-card-grip text-muted-foreground size-3.5 shrink-0"
        />
        <span className="text-caption text-muted-foreground shrink-0 tabular-nums">
          {t("taskboard.taskNumber", { number: task.number })}
        </span>
        <div className="gap-inline ml-auto flex min-w-0 shrink-0 items-center">
          {activity ? (
            <StatusBadge tone={activity.tone}>{activity.label}</StatusBadge>
          ) : null}
          <TaskActionsMenu
            t={t}
            task={task}
            onEdit={props.onEdit}
            onDelete={props.onDelete}
            onMove={props.onMove}
            onStartTask={props.onStartTask}
          />
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="row"
        focusStyle="inset"
        className="text-body mt-1 h-auto w-full min-w-0 justify-start px-0 py-0 text-left font-medium"
        aria-label={t("taskboard.selectTaskCard", { title: task.title })}
        onClick={props.onSelect}
      >
        <span className="line-clamp-2 min-w-0 break-words">{task.title}</span>
      </Button>

      {description === "" ? null : (
        <p className="text-metadata text-muted-foreground mt-1 line-clamp-1">
          {description}
        </p>
      )}

      <div
        data-task-card-meta
        className="text-metadata text-muted-foreground gap-inline mt-2.5 flex max-w-full min-w-0 flex-wrap items-center overflow-hidden"
      >
        {task.priority === "none" ? null : (
          <span className="gap-optical flex min-w-0 items-center">
            <Flag aria-hidden className="size-3 shrink-0" />
            <span className="truncate">
              {taskPriorityLabel(t, task.priority)}
            </span>
          </span>
        )}
        {labels.map((label) => (
          <Badge
            key={label}
            variant="outline"
            className="max-w-24 font-normal"
            data-task-label
          >
            <span className="truncate">{label}</span>
          </Badge>
        ))}
        {hiddenLabels > 0 ? (
          <span className="shrink-0">
            {t("taskboard.labelOverflow", { count: hiddenLabels })}
          </span>
        ) : null}
        {sessions.length > 0 ? (
          <span
            className="gap-optical flex shrink-0 items-center"
            data-session-count={sessions.length}
          >
            <MessageSquare aria-hidden className="size-3 shrink-0" />
            <span>
              {t("taskboard.sessionCount", { count: sessions.length })}
            </span>
          </span>
        ) : null}
        {openPullRequests !== null && openPullRequests > 0 ? (
          <span
            className="shrink-0"
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
