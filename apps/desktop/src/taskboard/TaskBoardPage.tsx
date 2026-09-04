import {
  useDeferredValue,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Filter,
  Flag,
  GitPullRequest,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "@/components/ui/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/business/search-field";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useToast } from "@/ui/toast";
import { confirmNative, openExternal } from "@/bridge";
import type { SessionActivity } from "@/bridge";
import { useLanguage } from "@/i18n";
import type { Locale, Translate } from "@/i18n";

import {
  corruptBoardWarning,
  loadBoardWarning,
  PRIORITIES,
  saveBoardWarning,
  taskBoardLanes,
  taskStatuses,
  boardLabels,
  boardReducer,
  createBoardTask,
  filterBoardTasks,
  githubPullRequestIdentity,
  loadBoardSnapshot,
  saveBoardSnapshot,
  sortBoardTasks,
  taskBoardLane,
  unlinkTaskPullRequest,
} from "./taskBoard";
import type {
  BoardAction,
  BoardFilters,
  BoardTask,
  TaskBoardLane,
  TaskPriority,
  TaskStatus,
} from "./taskBoard";
import {
  TaskEditorDialog,
  taskPriorityLabel,
  taskStatusLabel,
} from "./TaskEditorDialog";
import type { TaskEditorValue } from "./TaskEditorDialog";

interface TaskBoardSession {
  id: string;
  title: string;
  archived?: boolean;
  activity?: SessionActivity;
  running?: boolean;
}

interface TaskBoardPageProps {
  readonly sessions?: TaskBoardSession[];
  readonly onOpenSession?: (id: string) => void;
  readonly onStartTask?: (task: BoardTask) => void;
  readonly headerLeadingAction?: ReactNode;
}

interface EditorState {
  task: BoardTask | null;
  initialStatus: TaskStatus;
}

interface SessionProjection extends TaskBoardSession {
  archived: boolean;
}

interface ProjectedTask {
  task: BoardTask;
  lane: TaskBoardLane;
  latestSession?: SessionProjection;
}

interface AttentionDetail {
  label: string;
  description: string;
  action: string;
}

const laneTones: Record<TaskBoardLane, string> = {
  done: "text-success",
  needs_you: "text-warning",
  queue: "text-foreground",
  running: "text-primary",
};

const priorityTones: Record<TaskPriority, string> = {
  high: "text-destructive",
  low: "text-muted-foreground",
  medium: "text-muted-foreground",
  none: "text-muted-foreground",
  urgent: "text-destructive",
};

const collapsedLaneLimit = 3;

function formatUpdatedAt(value: number, locale: Locale, t: Translate): string {
  const elapsed = Math.max(0, Date.now() - value);
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (elapsed < hour) {
    return t("taskboard.updatedNow");
  }
  if (elapsed < day) {
    return t("taskboard.updatedHours", { count: Math.floor(elapsed / hour) });
  }
  if (elapsed < day * 7) {
    return t("taskboard.updatedDays", { count: Math.floor(elapsed / day) });
  }
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(value);
  return t("taskboard.updatedOn", { date });
}

function warningText(warning: string, t: Translate): string {
  if (warning === corruptBoardWarning) {
    return t("taskboard.warning.corrupt");
  }
  if (warning === loadBoardWarning) {
    return t("taskboard.warning.load");
  }
  if (warning === saveBoardWarning) {
    return t("taskboard.warning.save");
  }
  return warning;
}

function nextColumnOrder(
  tasks: readonly BoardTask[],
  status: TaskStatus
): number {
  return tasks.filter((task) => task.status === status).length;
}

function removeFilterValue<T extends string>(
  values: readonly T[],
  value: T
): T[] {
  return values.filter((candidate) => candidate !== value);
}

function toggleFilterValue<T extends string>(
  values: readonly T[],
  value: T
): T[] {
  return values.includes(value)
    ? removeFilterValue(values, value)
    : [...values, value];
}

function laneLabel(t: Translate, lane: TaskBoardLane): string {
  if (lane === "queue") {
    return t("taskboard.lane.queue");
  }
  if (lane === "running") {
    return t("taskboard.lane.running");
  }
  if (lane === "needs_you") {
    return t("taskboard.lane.needsYou");
  }
  return t("taskboard.lane.done");
}

function sessionActivityKind(session?: SessionProjection) {
  const kind = session?.activity?.state.kind ?? "idle";
  return session?.running && kind === "idle" ? "running" : kind;
}

function latestAvailableSession(
  task: BoardTask,
  sessionsById: ReadonlyMap<string, SessionProjection>
): SessionProjection | undefined {
  for (let index = task.sessionIds.length - 1; index >= 0; index -= 1) {
    const session = sessionsById.get(task.sessionIds[index]!);
    if (session && !session.archived) {
      return session;
    }
  }
  return undefined;
}

function projectTasks(
  tasks: readonly BoardTask[],
  sessionsById: ReadonlyMap<string, SessionProjection>
): ProjectedTask[] {
  return tasks.map((task) => {
    const latestSession = latestAvailableSession(task, sessionsById);
    return {
      lane: taskBoardLane(task, sessionActivityKind(latestSession)),
      latestSession,
      task,
    };
  });
}

function groupProjectedTasks(
  tasks: readonly ProjectedTask[]
): Record<TaskBoardLane, ProjectedTask[]> {
  const grouped: Record<TaskBoardLane, ProjectedTask[]> = {
    done: [],
    needs_you: [],
    queue: [],
    running: [],
  };
  for (const task of tasks) {
    grouped[task.lane].push(task);
  }
  return grouped;
}

function attentionDetail(
  t: Translate,
  task: BoardTask,
  session?: SessionProjection
): AttentionDetail {
  if (task.status === "in_review") {
    return {
      action: t("taskboard.reviewTask"),
      description: t("taskboard.attention.reviewReadyDescription"),
      label: t("taskboard.attention.reviewReady"),
    };
  }
  const state = session?.activity?.state;
  if (state?.kind === "awaiting_input") {
    const pending = state.pending[0];
    const isQuestion = pending?.kind === "elicitation";
    return {
      action: t(
        isQuestion ? "taskboard.answerTask" : "taskboard.reviewRequest"
      ),
      description: pending?.title ?? t("taskboard.attention.inputDescription"),
      label: t(
        isQuestion
          ? "taskboard.attention.answerNeeded"
          : "taskboard.attention.permissionNeeded"
      ),
    };
  }
  if (state?.kind === "failed") {
    return {
      action: t("taskboard.reviewFailure"),
      description: state.message,
      label: t("taskboard.attention.failed"),
    };
  }
  return {
    action: t("taskboard.reviewTask"),
    description: t("taskboard.attention.reviewReadyDescription"),
    label: t("taskboard.attention.reviewReady"),
  };
}

const TaskCard = ({
  t,
  locale,
  projected,
  onEdit,
  onDelete,
  onMove,
  onOpenSession,
  onStartTask,
  onUnlinkPullRequest,
}: {
  readonly t: Translate;
  readonly locale: Locale;
  readonly projected: ProjectedTask;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onMove: (status: TaskStatus) => void;
  readonly onOpenSession?: (id: string) => void;
  readonly onStartTask?: (task: BoardTask) => void;
  readonly onUnlinkPullRequest?: () => void;
}) => {
  const { task, lane, latestSession } = projected;
  const pullRequest = task.pullRequest;
  const attention =
    lane === "needs_you" ? attentionDetail(t, task, latestSession) : null;
  const openLatest =
    latestSession && onOpenSession
      ? () => onOpenSession(latestSession.id)
      : undefined;
  const startNew = onStartTask ? () => onStartTask(task) : undefined;
  const primaryAction = openLatest ?? startNew ?? onEdit;
  const primaryActionLabel =
    lane === "needs_you" && attention
      ? attention.action
      : openLatest
        ? t("taskboard.openRecentSession")
        : startNew
          ? t("taskboard.startTask")
          : t("taskboard.edit");

  return (
    <article
      data-task-card={task.id}
      data-task-lane={lane}
      className="group rounded-module bg-card hover:bg-accent/30 p-4 shadow-(--ds-elevation-surface) transition-colors"
    >
      <div className="flex min-w-0 items-start gap-2">
        <Button
          type="button"
          variant="ghost"
          size="row"
          focusStyle="inset"
          className="text-dialog hover:text-primary line-clamp-2 h-auto min-w-0 flex-1 justify-start px-0 py-0 font-semibold"
          aria-label={t("taskboard.cardAction", {
            action: primaryActionLabel,
            title: task.title,
          })}
          onClick={primaryAction}
        >
          {task.title}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="-mt-1 -mr-1 shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                aria-label={t("taskboard.taskActions", { title: task.title })}
              >
                <MoreHorizontal data-icon="inline-start" aria-hidden />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil aria-hidden />
                {t("taskboard.edit")}
              </DropdownMenuItem>
              {openLatest ? (
                <DropdownMenuItem onClick={openLatest}>
                  <ExternalLink aria-hidden />
                  {t("taskboard.openRecentSession")}
                </DropdownMenuItem>
              ) : null}
              {startNew ? (
                <DropdownMenuItem onClick={startNew}>
                  <MessageSquareText aria-hidden />
                  {task.sessionIds.length > 0
                    ? t("taskboard.startInNewSession")
                    : t("taskboard.startTask")}
                </DropdownMenuItem>
              ) : null}
              {pullRequest ? (
                <DropdownMenuItem
                  onClick={() => void openExternal(pullRequest.url)}
                >
                  <GitPullRequest aria-hidden />
                  {t("taskboard.openPullRequest")}
                </DropdownMenuItem>
              ) : null}
              {pullRequest && onUnlinkPullRequest ? (
                <DropdownMenuItem onClick={onUnlinkPullRequest}>
                  <X aria-hidden />
                  {t("taskboard.unlinkPullRequest")}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {taskStatuses
                .filter((status) => status !== task.status)
                .map((status) => (
                  <DropdownMenuItem key={status} onClick={() => onMove(status)}>
                    {t("taskboard.moveTo", {
                      status: taskStatusLabel(t, status),
                    })}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 aria-hidden />
                {t("taskboard.delete")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {pullRequest ? (
        <Button
          type="button"
          variant="link"
          size="compact"
          className="text-metadata text-muted-foreground hover:text-primary mt-4 h-auto min-w-0 justify-start gap-1.5 px-0 py-0"
          title={pullRequest.url}
          onClick={() => void openExternal(pullRequest.url)}
        >
          <GitPullRequest aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            {pullRequest.repository} #{pullRequest.number}
          </span>
          <ExternalLink aria-hidden className="size-3 shrink-0" />
        </Button>
      ) : null}

      {lane === "queue" && (task.priority !== "none" || latestSession) ? (
        <div className="text-metadata text-muted-foreground mt-4 flex min-w-0 items-center gap-2">
          {task.priority !== "none" ? (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                priorityTones[task.priority]
              )}
            >
              <Flag aria-hidden className="size-3" />
              {taskPriorityLabel(t, task.priority)}
            </span>
          ) : null}
          {latestSession ? (
            <span className="ml-auto truncate">
              {t("taskboard.readyToContinue")}
            </span>
          ) : null}
        </div>
      ) : null}

      {lane === "running" ? (
        <div className="text-metadata text-muted-foreground mt-4 grid gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="bg-primary size-2 shrink-0 animate-pulse rounded-full"
            />
            <span className="text-primary font-medium">
              {t("taskboard.runningNow")}
            </span>
            <span className="ml-auto truncate">
              {formatUpdatedAt(task.updatedAt, locale, t)}
            </span>
          </div>
          {latestSession && latestSession.title.trim() !== task.title.trim() ? (
            <p className="truncate">{latestSession.title}</p>
          ) : null}
        </div>
      ) : null}

      {lane === "needs_you" && attention ? (
        <div className="mt-4 grid gap-3">
          <Badge
            variant="secondary"
            className="bg-warning/10 text-metadata text-warning w-fit font-medium shadow-none"
          >
            {attention.label}
          </Badge>
          <p className="text-metadata text-muted-foreground line-clamp-2">
            {attention.description}
          </p>
          <Button
            type="button"
            size="compact"
            className="ml-auto"
            onClick={primaryAction}
          >
            {attention.action}
          </Button>
        </div>
      ) : null}

      {lane === "done" ? (
        <div className="text-metadata text-muted-foreground mt-4 grid gap-2">
          <span className="text-success inline-flex items-center gap-1.5 font-medium">
            <CheckCircle2 aria-hidden className="size-3.5" />
            {t("taskboard.completed")}
          </span>
          <span>
            {task.sessionIds.length > 0
              ? `${t("taskboard.sessionCount", { count: task.sessionIds.length })} · `
              : ""}
            {formatUpdatedAt(task.updatedAt, locale, t)}
          </span>
        </div>
      ) : null}
    </article>
  );
};

const BoardColumn = ({
  t,
  locale,
  lane,
  tasks,
  totalCount,
  filtered,
  expanded,
  onExpandedChange,
  dispatch,
  openEditor,
  deleteTask,
  onOpenSession,
  onStartTask,
}: {
  readonly t: Translate;
  readonly locale: Locale;
  readonly lane: TaskBoardLane;
  readonly tasks: ProjectedTask[];
  readonly totalCount: number;
  readonly filtered: boolean;
  readonly expanded: boolean;
  readonly onExpandedChange: (isExpanded: boolean) => void;
  readonly dispatch: (action: BoardAction) => void;
  readonly openEditor: (task: BoardTask | null, status: TaskStatus) => void;
  readonly deleteTask: (task: BoardTask) => void;
  readonly onOpenSession?: (id: string) => void;
  readonly onStartTask?: (task: BoardTask) => void;
}) => {
  const visibleTasks = expanded ? tasks : tasks.slice(0, collapsedLaneLimit);
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);
  const visualCount = filtered ? `${tasks.length}/${totalCount}` : totalCount;

  return (
    <section
      data-task-column={lane}
      aria-labelledby={`taskboard-column-${lane}`}
      className="rounded-module bg-fill-quiet flex min-h-full w-72 min-w-72 flex-1 flex-col p-3"
    >
      <header className="bg-fill-quiet sticky top-0 z-10 -mx-1 mb-2 flex shrink-0 items-center gap-2 px-1 py-2">
        <h2
          id={`taskboard-column-${lane}`}
          className={cn("text-dialog font-semibold", laneTones[lane])}
        >
          {laneLabel(t, lane)}
        </h2>
        <span
          className="text-metadata text-muted-foreground ml-auto tabular-nums"
          aria-label={
            filtered
              ? t("taskboard.visibleCount", {
                  total: totalCount,
                  visible: tasks.length,
                })
              : t("taskboard.taskCount", { count: totalCount })
          }
        >
          {visualCount}
        </span>
      </header>

      <div className="grid content-start gap-3">
        {visibleTasks.map((projected) => (
          <TaskCard
            key={projected.task.id}
            t={t}
            locale={locale}
            projected={projected}
            onEdit={() => openEditor(projected.task, projected.task.status)}
            onDelete={() => deleteTask(projected.task)}
            onMove={(status) => {
              dispatch({
                id: projected.task.id,
                now: Date.now(),
                status,
                type: "move",
              });
            }}
            onOpenSession={onOpenSession}
            onStartTask={onStartTask}
            onUnlinkPullRequest={
              projected.task.pullRequest
                ? () => {
                    const pullRequest = projected.task.pullRequest;
                    if (!pullRequest) {
                      return;
                    }
                    const unlinked = unlinkTaskPullRequest(
                      [projected.task],
                      projected.task.id,
                      githubPullRequestIdentity(pullRequest),
                      projected.task.pullRequestLinkRevision
                    );
                    const updated = unlinked?.[0];
                    if (updated) {
                      dispatch({ task: updated, type: "update" });
                    }
                  }
                : undefined
            }
          />
        ))}

        {tasks.length === 0 ? (
          <p className="text-metadata text-muted-foreground px-3 py-8 text-center">
            {filtered && totalCount > 0
              ? t("taskboard.emptyFiltered")
              : t("taskboard.emptyColumn")}
          </p>
        ) : null}

        {hiddenCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="compact"
            aria-expanded={false}
            onClick={() => onExpandedChange(true)}
          >
            {t("taskboard.more", { count: hiddenCount })}
          </Button>
        ) : expanded && tasks.length > collapsedLaneLimit ? (
          <Button
            type="button"
            variant="ghost"
            size="compact"
            aria-expanded
            onClick={() => onExpandedChange(false)}
          >
            {t("taskboard.showLess")}
          </Button>
        ) : null}
      </div>
    </section>
  );
};

export const TaskBoardPage = ({
  sessions = [],
  onOpenSession,
  onStartTask,
  headerLeadingAction,
}: TaskBoardPageProps) => {
  const { locale, t } = useLanguage();
  const toast = useToast();
  const [state, dispatchBase] = useReducer(boardReducer, undefined, () =>
    loadBoardSnapshot(undefined, locale)
  );
  const [query, setQuery] = useState("");
  const [priorities, setPriorities] = useState<TaskPriority[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedLanes, setExpandedLanes] = useState<
    Partial<Record<TaskBoardLane, boolean>>
  >({});
  const didMount = useRef(false);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (state.warning) {
      toast(warningText(state.warning, t), "error");
    }
  }, [state.warning, t, toast]);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const result = saveBoardSnapshot(state.tasks);
    if (!result.ok) {
      toast(warningText(result.warning, t), "error");
    }
  }, [state.tasks, t, toast]);

  const filters: BoardFilters = { labels, priorities, query: deferredQuery };
  const visibleTasks = sortBoardTasks(filterBoardTasks(state.tasks, filters));
  const availableLabels = boardLabels(state.tasks);
  const sessionsById = new Map(
    sessions.map(
      (session) =>
        [
          session.id,
          { ...session, archived: session.archived === true },
        ] satisfies [string, SessionProjection]
    )
  );
  const allProjectedTasks = projectTasks(
    sortBoardTasks(state.tasks),
    sessionsById
  );
  const visibleProjectedTasks = projectTasks(visibleTasks, sessionsById);
  const allTasksByLane = groupProjectedTasks(allProjectedTasks);
  const visibleTasksByLane = groupProjectedTasks(visibleProjectedTasks);
  const activeFilterCount =
    (query.trim() ? 1 : 0) + priorities.length + labels.length;
  const isFiltered = activeFilterCount > 0;
  const attentionCount = allTasksByLane.needs_you.length;

  const dispatch = (action: BoardAction) => dispatchBase(action);
  const openEditor = (task: BoardTask | null, initialStatus: TaskStatus) => {
    setEditor({ initialStatus, task });
  };

  const clearFilters = () => {
    setQuery("");
    setPriorities([]);
    setLabels([]);
  };

  const saveEditor = (value: TaskEditorValue) => {
    if (!editor) {
      return;
    }
    if (editor.task) {
      dispatch({
        task: {
          ...editor.task,
          ...value,
          updatedAt: Math.max(
            Date.now(),
            editor.task.createdAt,
            editor.task.updatedAt
          ),
        },
        type: "update",
      });
    } else {
      const task = createBoardTask({
        ...value,
        order: nextColumnOrder(state.tasks, value.status),
      });
      dispatch({ task, type: "create" });
      setExpandedLanes((current) => ({ ...current, queue: true }));
      if (filterBoardTasks([task], filters).length === 0) {
        toast(t("taskboard.createdHidden", { title: task.title }), "info", {
          label: t("taskboard.clearFilters"),
          run: clearFilters,
        });
      }
    }
    setEditor(null);
  };

  const deleteTask = async (task: BoardTask) => {
    const isConfirmed = await confirmNative(
      t("taskboard.deleteConfirm", { title: task.title })
    );
    if (!isConfirmed) {
      return;
    }
    dispatch({ id: task.id, type: "delete" });
    toast(t("taskboard.deleted", { title: task.title }), "success");
  };

  return (
    <main className="animate-data-page-in bg-background text-foreground flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="bg-background shrink-0 px-6 py-4 sm:px-8">
        <div
          data-page-header-content
          className="grid min-w-0 items-center gap-3 xl:grid-cols-[minmax(0,auto)_minmax(24rem,1fr)]"
        >
          <div className="flex min-w-0 items-center gap-3">
            {headerLeadingAction ? (
              <div data-taskboard-leading-action className="shrink-0">
                {headerLeadingAction}
              </div>
            ) : null}
            <h1 className="text-page shrink-0 font-semibold tracking-tight">
              {t("taskboard.title")}
            </h1>
            {attentionCount > 0 ? (
              <p className="text-metadata text-muted-foreground flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="bg-warning size-2 shrink-0 rounded-full"
                />
                <span className="truncate">
                  {t("taskboard.attentionSummary", { count: attentionCount })}
                </span>
              </p>
            ) : null}
          </div>

          <div
            data-page-header-controls
            className="flex min-w-0 items-center gap-2 xl:justify-end"
          >
            <SearchField
              className="max-w-sm min-w-0 flex-1"
              inputClassName="bg-fill-rest shadow-surface"
              label={t("taskboard.search")}
              placeholder={t("taskboard.search")}
              value={query}
              clearLabel={t("taskboard.clearSearch")}
              onClear={() => setQuery("")}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />

            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger
                render={
                  <Button type="button" variant="secondary" size="compact">
                    <Filter data-icon="inline-start" aria-hidden />
                    {t("taskboard.filter")}
                    {activeFilterCount > 0 ? (
                      <Badge className="text-metadata min-w-4 px-1">
                        {activeFilterCount}
                      </Badge>
                    ) : null}
                  </Button>
                }
              />
              <PopoverContent
                align="end"
                className="grid max-h-(--available-height) gap-4 overflow-y-auto"
              >
                <PopoverHeader>
                  <PopoverTitle>{t("taskboard.filtersTitle")}</PopoverTitle>
                  <PopoverDescription>
                    {t("taskboard.filtersDescription")}
                  </PopoverDescription>
                </PopoverHeader>

                <fieldset className="grid gap-2">
                  <legend className="text-metadata mb-1 font-medium">
                    {t("taskboard.priority")}
                  </legend>
                  {PRIORITIES.map((priority) => (
                    <label
                      key={priority}
                      className="text-body flex items-center gap-2"
                    >
                      <Checkbox
                        checked={priorities.includes(priority)}
                        onCheckedChange={() =>
                          setPriorities((current) =>
                            toggleFilterValue(current, priority)
                          )
                        }
                      />
                      {taskPriorityLabel(t, priority)}
                    </label>
                  ))}
                </fieldset>

                <fieldset className="grid gap-2">
                  <legend className="text-metadata mb-1 font-medium">
                    {t("taskboard.labels")}
                  </legend>
                  {availableLabels.length > 0 ? (
                    availableLabels.map((label) => (
                      <label
                        key={label}
                        className="text-body flex items-center gap-2"
                      >
                        <Checkbox
                          checked={labels.includes(label)}
                          onCheckedChange={() =>
                            setLabels((current) =>
                              toggleFilterValue(current, label)
                            )
                          }
                        />
                        {label}
                      </label>
                    ))
                  ) : (
                    <p className="text-metadata text-muted-foreground">
                      {t("taskboard.noLabels")}
                    </p>
                  )}
                </fieldset>

                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  disabled={activeFilterCount === 0}
                  onClick={clearFilters}
                >
                  {t("taskboard.clearFilters")}
                </Button>
              </PopoverContent>
            </Popover>

            <Button
              type="button"
              className="shrink-0"
              size="compact"
              onClick={() => openEditor(null, "todo")}
            >
              <Plus data-icon="inline-start" aria-hidden />
              {t("taskboard.new")}
            </Button>
          </div>
        </div>
      </header>

      {state.warning ? (
        <p
          role="alert"
          className="bg-destructive/10 text-metadata text-destructive px-6 py-2"
        >
          {warningText(state.warning, t)}
        </p>
      ) : null}

      <div
        data-task-board-columns
        className="min-h-0 flex-1 overflow-auto px-6 pb-6 sm:px-8"
      >
        <div
          data-task-board-content
          className="flex min-h-full min-w-max gap-4"
        >
          {taskBoardLanes.map((lane) => (
            <BoardColumn
              key={lane}
              t={t}
              locale={locale}
              lane={lane}
              tasks={visibleTasksByLane[lane]}
              totalCount={allTasksByLane[lane].length}
              filtered={isFiltered}
              expanded={expandedLanes[lane] === true}
              onExpandedChange={(expanded) => {
                setExpandedLanes((current) => ({
                  ...current,
                  [lane]: expanded,
                }));
              }}
              dispatch={dispatch}
              openEditor={openEditor}
              deleteTask={deleteTask}
              onOpenSession={onOpenSession}
              onStartTask={onStartTask}
            />
          ))}
        </div>
      </div>

      {editor ? (
        <TaskEditorDialog
          key={editor.task?.id ?? `new-${editor.initialStatus}`}
          task={editor.task}
          initialStatus={editor.initialStatus}
          onCancel={() => setEditor(null)}
          onSave={saveEditor}
        />
      ) : null}
    </main>
  );
};
