import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent,
} from "react"
import {
  CheckCircle2,
  ArrowRight,
  Circle,
  CircleDot,
  CircleEllipsis,
  ExternalLink,
  Filter,
  Flag,
  GripVertical,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useToast } from "@/ui/toast"
import { confirmNative } from "@/bridge"
import { useLanguage, type Locale, type Translate } from "@/i18n"

import {
  CORRUPT_BOARD_WARNING,
  LOAD_BOARD_WARNING,
  PRIORITIES,
  SAVE_BOARD_WARNING,
  TASK_STATUSES,
  boardLabels,
  boardReducer,
  createBoardTask,
  filterBoardTasks,
  loadBoardSnapshot,
  saveBoardSnapshot,
  sortBoardTasks,
  type BoardAction,
  type BoardFilters,
  type BoardTask,
  type TaskPriority,
  type TaskStatus,
} from "./taskBoard"
import {
  TaskEditorDialog,
  taskPriorityLabel,
  taskStatusLabel,
  type TaskEditorValue,
} from "./TaskEditorDialog"

interface TaskBoardPageProps {
  sessions?: Array<{ id: string; title: string; archived?: boolean }>
  onOpenSession?: (id: string) => void
  onStartTask?: (task: BoardTask) => void
}

interface EditorState {
  task: BoardTask | null
  initialStatus: TaskStatus
}

interface DragState {
  taskId: string
  status: TaskStatus
  beforeId?: string
}

const STATUS_ICONS = {
  todo: Circle,
  in_progress: CircleDot,
  in_review: CircleEllipsis,
  done: CheckCircle2,
} satisfies Record<TaskStatus, typeof Circle>

const STATUS_TONES: Record<TaskStatus, string> = {
  todo: "text-primary",
  in_progress: "text-success",
  in_review: "text-warning",
  done: "text-primary",
}

const STATUS_HEADER_TONES: Record<TaskStatus, string> = {
  todo: "bg-card",
  in_progress: "bg-card",
  in_review: "bg-card",
  done: "bg-card",
}

const PRIORITY_TONES: Record<TaskPriority, string> = {
  none: "text-muted-foreground",
  low: "text-success",
  medium: "text-warning",
  high: "text-destructive",
  urgent: "text-destructive",
}

function formatUpdatedAt(value: number, locale: Locale, t: Translate): string {
  const elapsed = Math.max(0, Date.now() - value)
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (elapsed < hour) return t("taskboard.updatedNow")
  if (elapsed < day) return t("taskboard.updatedHours", { count: Math.floor(elapsed / hour) })
  if (elapsed < day * 7) return t("taskboard.updatedDays", { count: Math.floor(elapsed / day) })
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(value)
  return t("taskboard.updatedOn", { date })
}

function warningText(warning: string, t: Translate): string {
  if (warning === CORRUPT_BOARD_WARNING) return t("taskboard.warning.corrupt")
  if (warning === LOAD_BOARD_WARNING) return t("taskboard.warning.load")
  if (warning === SAVE_BOARD_WARNING) return t("taskboard.warning.save")
  return warning
}

function nextColumnOrder(tasks: readonly BoardTask[], status: TaskStatus): number {
  return tasks.filter((task) => task.status === status).length
}

function removeFilterValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.filter((candidate) => candidate !== value)
}

function toggleFilterValue<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? removeFilterValue(values, value) : [...values, value]
}

function taskActionLabel(t: Translate, status: TaskStatus, continuesSession: boolean): string {
  if (continuesSession) return t("taskboard.continueTask")
  if (status === "in_progress") return t("taskboard.continueTask")
  if (status === "in_review") return t("taskboard.reviewTask")
  if (status === "done") return t("taskboard.revisitTask")
  return t("taskboard.startTask")
}

function TaskCard({
  t,
  locale,
  task,
  latestSessionTitle,
  continuesSession,
  sessionCount,
  dragTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onEdit,
  onDelete,
  onMove,
  onContinue,
  onStartNewSession,
}: {
  t: Translate
  locale: Locale
  task: BoardTask
  latestSessionTitle?: string
  continuesSession: boolean
  sessionCount: number
  dragTarget: boolean
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onEdit: () => void
  onDelete: () => void
  onMove: (status: TaskStatus) => void
  onContinue?: () => void
  onStartNewSession?: () => void
}) {
  const primaryActionLabel = taskActionLabel(t, task.status, continuesSession)
  return (
    <div
      data-task-drop-before={task.id}
      className={cn(
        "rounded-(--ds-radius-module) outline-none transition-[background-color,box-shadow]",
        dragTarget && "ring-[3px] ring-primary/40"
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <Card className="gap-3 py-4">
        <CardContent className="grid gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              draggable
              className="cursor-grab touch-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
              aria-label={t("taskboard.dragTask", { title: task.title })}
              title={t("taskboard.dragTaskHint")}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="ml-auto"
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
                  {latestSessionTitle && onContinue ? (
                    <DropdownMenuItem onClick={onContinue}>
                      <ExternalLink aria-hidden />
                      {t("taskboard.openRecentSession")}
                    </DropdownMenuItem>
                  ) : null}
                  {onStartNewSession ? (
                    <DropdownMenuItem onClick={onStartNewSession}>
                      <MessageSquareText aria-hidden />
                      {sessionCount > 0
                        ? t("taskboard.startInNewSession")
                        : primaryActionLabel}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {TASK_STATUSES.filter((status) => status !== task.status).map((status) => (
                    <DropdownMenuItem key={status} onClick={() => onMove(status)}>
                      {t("taskboard.moveTo", { status: taskStatusLabel(t, status) })}
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

          <div className="grid gap-2">
            <button
              type="button"
              className="text-left text-title font-semibold leading-snug outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={onEdit}
            >
              {task.title}
            </button>
            {task.description ? (
              <p className="line-clamp-2 text-ui leading-relaxed text-muted-foreground">
                {task.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-hint font-medium",
                PRIORITY_TONES[task.priority]
              )}
            >
              <Flag aria-hidden className="size-3.5" />
              {taskPriorityLabel(t, task.priority)}
            </span>
            {task.labels.slice(0, 2).map((label) => (
              <Badge key={label} variant="secondary" className="text-cap font-medium">
                {label}
              </Badge>
            ))}
            {task.labels.length > 2 ? (
              <Badge
                variant="secondary"
                className="text-cap font-medium"
                title={task.labels.slice(2).join("、")}
              >
                +{task.labels.length - 2}
              </Badge>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {onContinue ? (
              <Button
                type="button"
                variant="ghost"
                size="compact"
                className="-ml-2 text-primary"
                onClick={onContinue}
              >
                {primaryActionLabel}
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            ) : null}
            <span className="ml-auto truncate text-fine text-muted-foreground">
              {sessionCount > 0 ? `${t("taskboard.sessionCount", { count: sessionCount })} · ` : ""}
              {formatUpdatedAt(task.updatedAt, locale, t)}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function BoardColumn({
  t,
  locale,
  status,
  tasks,
  totalCount,
  filtered,
  sessionsById,
  dragState,
  setDragState,
  dispatch,
  openEditor,
  deleteTask,
  onOpenSession,
  onStartTask,
}: {
  t: Translate
  locale: Locale
  status: TaskStatus
  tasks: BoardTask[]
  totalCount: number
  filtered: boolean
  sessionsById: ReadonlyMap<string, { title: string; archived: boolean }>
  dragState: DragState | null
  setDragState: (state: DragState | null) => void
  dispatch: (action: BoardAction) => void
  openEditor: (task: BoardTask | null, status: TaskStatus) => void
  deleteTask: (task: BoardTask) => void
  onOpenSession?: (id: string) => void
  onStartTask?: (task: BoardTask) => void
}) {
  const StatusIcon = STATUS_ICONS[status]
  const columnEndTarget = dragState?.status === status && dragState.beforeId === undefined

  const move = (taskId: string, targetStatus: TaskStatus, beforeId?: string) => {
    dispatch({ type: "move", id: taskId, status: targetStatus, beforeId, now: Date.now() })
    setDragState(null)
  }

  return (
    <section
      data-task-column={status}
      aria-labelledby={`taskboard-column-${status}`}
      className="flex min-h-0 w-72 min-w-72 flex-1 flex-col rounded-(--ds-radius-module) bg-fill-quiet"
    >
      <header
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-(--ds-radius-module) px-4 py-3",
          STATUS_HEADER_TONES[status],
          STATUS_TONES[status]
        )}
      >
        <StatusIcon aria-hidden className="size-4" />
        <h2 id={`taskboard-column-${status}`} className="text-title font-semibold">
          {taskStatusLabel(t, status)}
        </h2>
        <span
          className="ml-auto text-ui tabular-nums text-muted-foreground"
          aria-label={filtered
            ? t("taskboard.visibleCount", { visible: tasks.length, total: totalCount })
            : t("taskboard.taskCount", { count: totalCount })}
        >
          {filtered ? `${tasks.length}/${totalCount}` : totalCount}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-current"
          aria-label={t("taskboard.addInColumn", { status: taskStatusLabel(t, status) })}
          onClick={() => openEditor(null, status)}
        >
          <Plus data-icon="inline-start" aria-hidden />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
        {tasks.map((task) => {
          const availableSessions = task.sessionIds.filter(
            (id) => sessionsById.get(id)?.archived === false,
          )
          const latestSessionId = availableSessions[availableSessions.length - 1]
          const continueTask = latestSessionId && onOpenSession
            ? () => onOpenSession(latestSessionId)
            : onStartTask
              ? () => onStartTask(task)
              : undefined
          return (
            <TaskCard
              key={task.id}
              t={t}
              locale={locale}
              task={task}
              latestSessionTitle={
                latestSessionId ? sessionsById.get(latestSessionId)?.title : undefined
              }
              continuesSession={Boolean(latestSessionId && onOpenSession)}
              sessionCount={task.sessionIds.length}
              dragTarget={dragState?.status === status && dragState.beforeId === task.id}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", task.id)
                setDragState({ taskId: task.id, status })
              }}
              onDragEnd={() => setDragState(null)}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = "move"
                if (dragState?.taskId && dragState.taskId !== task.id) {
                  setDragState({ taskId: dragState.taskId, status, beforeId: task.id })
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const taskId = dragState?.taskId || event.dataTransfer.getData("text/plain")
                if (taskId && taskId !== task.id) move(taskId, status, task.id)
                else setDragState(null)
              }}
              onEdit={() => openEditor(task, status)}
              onDelete={() => deleteTask(task)}
              onMove={(targetStatus) => move(task.id, targetStatus)}
              onContinue={continueTask}
              onStartNewSession={onStartTask ? () => onStartTask(task) : undefined}
            />
          )
        })}

        {tasks.length === 0 ? (
          <div className="grid flex-1 place-content-center gap-2 px-4 py-8 text-center text-muted-foreground">
            <Circle aria-hidden className="mx-auto size-6 opacity-50" />
            <p className="text-ui font-medium">
              {filtered && totalCount > 0
                ? t("taskboard.emptyFiltered")
                : t("taskboard.emptyColumn")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={() => openEditor(null, status)}
            >
              <Plus data-icon="inline-start" aria-hidden />
              {t("taskboard.addTask")}
            </Button>
          </div>
        ) : null}

        <div
          data-task-drop-end={status}
          aria-label={t("taskboard.moveToEnd", { status: taskStatusLabel(t, status) })}
          className={cn(
            "min-h-16 flex-1 rounded-(--ds-radius-module) transition-[background-color,box-shadow]",
            columnEndTarget && "bg-fill-hover ring-[3px] ring-primary/40"
          )}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = "move"
            if (dragState?.taskId) setDragState({ taskId: dragState.taskId, status })
          }}
          onDrop={(event) => {
            event.preventDefault()
            const taskId = dragState?.taskId || event.dataTransfer.getData("text/plain")
            if (taskId) move(taskId, status)
          }}
        />
      </div>
    </section>
  )
}

export function TaskBoardPage({
  sessions = [],
  onOpenSession,
  onStartTask,
}: TaskBoardPageProps) {
  const { locale, t } = useLanguage()
  const toast = useToast()
  const [state, dispatchBase] = useReducer(
    boardReducer,
    undefined,
    () => loadBoardSnapshot(undefined, locale),
  )
  const [query, setQuery] = useState("")
  const [priorities, setPriorities] = useState<TaskPriority[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const didMount = useRef(false)

  useEffect(() => {
    if (state.warning) toast(warningText(state.warning, t), "error")
  }, [state.warning, t, toast])

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    const result = saveBoardSnapshot(state.tasks)
    if (!result.ok) toast(warningText(result.warning, t), "error")
  }, [state.tasks, t, toast])

  const filters: BoardFilters = useMemo(
    () => ({ query, priorities, labels }),
    [labels, priorities, query]
  )
  const visibleTasks = useMemo(
    () => sortBoardTasks(filterBoardTasks(state.tasks, filters)),
    [filters, state.tasks]
  )
  const availableLabels = useMemo(() => boardLabels(state.tasks), [state.tasks])
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [
      session.id,
      { title: session.title, archived: session.archived === true },
    ])),
    [sessions]
  )
  const activeFilterCount = (query.trim() ? 1 : 0) + priorities.length + labels.length
  const filtered = activeFilterCount > 0

  const dispatch = (action: BoardAction) => dispatchBase(action)
  const openEditor = (task: BoardTask | null, initialStatus: TaskStatus) => {
    setEditor({ task, initialStatus })
  }

  const clearFilters = () => {
    setQuery("")
    setPriorities([])
    setLabels([])
  }

  const saveEditor = (value: TaskEditorValue) => {
    if (!editor) return
    if (editor.task) {
      dispatch({
        type: "update",
        task: {
          ...editor.task,
          ...value,
          updatedAt: Math.max(Date.now(), editor.task.createdAt, editor.task.updatedAt),
        },
      })
    } else {
      const task = createBoardTask({
        ...value,
        order: nextColumnOrder(state.tasks, value.status),
      })
      dispatch({
        type: "create",
        task,
      })
      if (filterBoardTasks([task], filters).length === 0) {
        toast(t("taskboard.createdHidden", { title: task.title }), "info", {
          label: t("taskboard.clearFilters"),
          run: clearFilters,
        })
      }
    }
    setEditor(null)
  }

  const deleteTask = async (task: BoardTask) => {
    const confirmed = await confirmNative(t("taskboard.deleteConfirm", { title: task.title }))
    if (!confirmed) return
    dispatch({ type: "delete", id: task.id })
    toast(t("taskboard.deleted", { title: task.title }), "success")
  }

  return (
    <main className="animate-page-in flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
      <header className="shrink-0 bg-background pb-6 pt-10 sm:pt-14">
        <div data-page-header-content className="mx-auto w-full max-w-4xl px-6 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
            <div className="min-w-0 flex-1">
              <h1 className="text-display font-semibold tracking-tight">
                {t("taskboard.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-ui leading-relaxed text-muted-foreground">
                {t("taskboard.description")}
              </p>
            </div>
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

          <div data-page-header-controls className="mt-8 flex items-center gap-3">
            <div className="relative min-w-52 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="h-(--ds-control-field) rounded-(--ds-radius-control) bg-background pl-10 pr-10 ring-1 ring-inset ring-border"
                type="search"
                aria-label={t("taskboard.search")}
                placeholder={t("taskboard.search")}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              {query ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                  aria-label={t("taskboard.clearSearch")}
                  onClick={() => setQuery("")}
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </div>

            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger
                render={
                  <Button type="button" variant="secondary" size="compact">
                    <Filter data-icon="inline-start" aria-hidden />
                    {t("taskboard.filter")}
                    {activeFilterCount > 0 ? (
                      <Badge className="min-w-4 px-1 text-cap">{activeFilterCount}</Badge>
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
                  <PopoverDescription>{t("taskboard.filtersDescription")}</PopoverDescription>
                </PopoverHeader>

                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-hint font-medium">
                    {t("taskboard.priority")}
                  </legend>
                  {PRIORITIES.map((priority) => (
                    <label key={priority} className="flex items-center gap-2 text-ui">
                      <Checkbox
                        checked={priorities.includes(priority)}
                        onCheckedChange={() =>
                          setPriorities((current) => toggleFilterValue(current, priority))
                        }
                      />
                      {taskPriorityLabel(t, priority)}
                    </label>
                  ))}
                </fieldset>

                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-hint font-medium">
                    {t("taskboard.labels")}
                  </legend>
                  {availableLabels.length > 0 ? (
                    availableLabels.map((label) => (
                      <label key={label} className="flex items-center gap-2 text-ui">
                        <Checkbox
                          checked={labels.includes(label)}
                          onCheckedChange={() =>
                            setLabels((current) => toggleFilterValue(current, label))
                          }
                        />
                        {label}
                      </label>
                    ))
                  ) : (
                    <p className="text-hint text-muted-foreground">
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
          </div>
        </div>
      </header>

      {state.warning ? (
        <p role="alert" className="bg-destructive/10 px-6 py-2 text-hint text-destructive">
          {warningText(state.warning, t)}
        </p>
      ) : null}

      <div
        data-task-board-columns
        className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-6 pt-1"
      >
        <div
          data-task-board-content
          className="h-full w-full px-6 sm:px-8"
        >
          <div className="flex h-full min-w-max gap-4">
            {TASK_STATUSES.map((status) => (
              <BoardColumn
                key={status}
                t={t}
                locale={locale}
                status={status}
                tasks={visibleTasks.filter((task) => task.status === status)}
                totalCount={state.tasks.filter((task) => task.status === status).length}
                filtered={filtered}
                sessionsById={sessionsById}
                dragState={dragState}
                setDragState={setDragState}
                dispatch={dispatch}
                openEditor={openEditor}
                deleteTask={deleteTask}
                onOpenSession={onOpenSession}
                onStartTask={onStartTask}
              />
            ))}
          </div>
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
  )
}
