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
  Circle,
  CircleDot,
  CircleEllipsis,
  ExternalLink,
  Filter,
  Flag,
  GripVertical,
  Link2,
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

import {
  PRIORITIES,
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
  PRIORITY_LABELS,
  STATUS_LABELS,
  TaskEditorDialog,
  type TaskEditorValue,
} from "./TaskEditorDialog"

interface TaskBoardPageProps {
  sessions?: Array<{ id: string; title: string }>
  onOpenSession?: (id: string) => void
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

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
})

function formatUpdatedAt(value: number): string {
  const elapsed = Math.max(0, Date.now() - value)
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (elapsed < hour) return "刚刚"
  if (elapsed < day) return `${Math.floor(elapsed / hour)} 小时前`
  if (elapsed < day * 7) return `${Math.floor(elapsed / day)} 天前`
  return DATE_FORMATTER.format(value)
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

function TaskCard({
  task,
  linkedSessionTitle,
  dragTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onEdit,
  onDelete,
  onMove,
  onOpenSession,
}: {
  task: BoardTask
  linkedSessionTitle?: string
  dragTarget: boolean
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onEdit: () => void
  onDelete: () => void
  onMove: (status: TaskStatus) => void
  onOpenSession?: () => void
}) {
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
              aria-label={`拖动任务：${task.title}`}
              title="拖动任务"
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <GripVertical aria-hidden className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate font-mono text-fine text-muted-foreground">
              {task.id}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`任务操作：${task.title}`}
                  >
                    <MoreHorizontal data-icon="inline-start" aria-hidden />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil aria-hidden />
                    编辑任务
                  </DropdownMenuItem>
                  {onOpenSession ? (
                    <DropdownMenuItem onClick={onOpenSession}>
                      <ExternalLink aria-hidden />
                      打开关联会话
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {TASK_STATUSES.filter((status) => status !== task.status).map((status) => (
                    <DropdownMenuItem key={status} onClick={() => onMove(status)}>
                      移动到“{STATUS_LABELS[status]}”
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive" onClick={onDelete}>
                    <Trash2 aria-hidden />
                    删除任务
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
              {PRIORITY_LABELS[task.priority]}
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

          {task.linkedSessionId ? (
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 text-left text-hint text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:text-muted-foreground"
              disabled={!onOpenSession}
              onClick={onOpenSession}
            >
              <Link2 aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{linkedSessionTitle ?? "关联会话"}</span>
            </button>
          ) : null}

          <span className="text-fine text-muted-foreground">
            {formatUpdatedAt(task.updatedAt)}
          </span>
        </CardContent>
      </Card>
    </div>
  )
}

function BoardColumn({
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
}: {
  status: TaskStatus
  tasks: BoardTask[]
  totalCount: number
  filtered: boolean
  sessionsById: ReadonlyMap<string, string>
  dragState: DragState | null
  setDragState: (state: DragState | null) => void
  dispatch: (action: BoardAction) => void
  openEditor: (task: BoardTask | null, status: TaskStatus) => void
  deleteTask: (task: BoardTask) => void
  onOpenSession?: (id: string) => void
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
      className="flex min-h-0 w-72 shrink-0 flex-col rounded-(--ds-radius-module) bg-fill-quiet"
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
          {STATUS_LABELS[status]}
        </h2>
        <span
          className="ml-auto text-ui tabular-nums text-muted-foreground"
          aria-label={filtered ? `${tasks.length} 个可见，共 ${totalCount} 个` : `${totalCount} 个任务`}
        >
          {filtered ? `${tasks.length}/${totalCount}` : totalCount}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-current"
          aria-label={`在${STATUS_LABELS[status]}中新建任务`}
          onClick={() => openEditor(null, status)}
        >
          <Plus data-icon="inline-start" aria-hidden />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            linkedSessionTitle={
              task.linkedSessionId ? sessionsById.get(task.linkedSessionId) : undefined
            }
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
            onOpenSession={
              task.linkedSessionId && sessionsById.has(task.linkedSessionId) && onOpenSession
                ? () => onOpenSession(task.linkedSessionId as string)
                : undefined
            }
          />
        ))}

        {tasks.length === 0 ? (
          <div className="grid flex-1 place-content-center gap-2 px-4 py-8 text-center text-muted-foreground">
            <Circle aria-hidden className="mx-auto size-6 opacity-50" />
            <p className="text-ui font-medium">
              {filtered && totalCount > 0 ? "没有符合筛选条件的任务" : "此列暂无任务"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              onClick={() => openEditor(null, status)}
            >
              <Plus data-icon="inline-start" aria-hidden />
              添加任务
            </Button>
          </div>
        ) : null}

        <div
          data-task-drop-end={status}
          aria-label={`移动到${STATUS_LABELS[status]}末尾`}
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
}: TaskBoardPageProps) {
  const toast = useToast()
  const [state, dispatchBase] = useReducer(boardReducer, undefined, loadBoardSnapshot)
  const [query, setQuery] = useState("")
  const [priorities, setPriorities] = useState<TaskPriority[]>([])
  const [labels, setLabels] = useState<string[]>([])
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const didMount = useRef(false)

  useEffect(() => {
    if (state.warning) toast(state.warning, "error")
  }, [state.warning, toast])

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    const result = saveBoardSnapshot(state.tasks)
    if (!result.ok) toast(result.warning, "error")
  }, [state.tasks, toast])

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
    () => new Map(sessions.map((session) => [session.id, session.title])),
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
          linkedSessionId: value.linkedSessionId,
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
        toast(`已创建“${task.title}”，但它被当前筛选隐藏`, "info", {
          label: "清除筛选",
          run: clearFilters,
        })
      }
    }
    setEditor(null)
  }

  const deleteTask = async (task: BoardTask) => {
    const confirmed = await confirmNative(`确定删除“${task.title}”？此操作无法撤销。`)
    if (!confirmed) return
    dispatch({ type: "delete", id: task.id })
    toast(`已删除“${task.title}”`, "success")
  }

  return (
    <main className="animate-page-in flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
      <header className="shrink-0 bg-background pb-6 pt-10 sm:pt-14">
        <div data-page-header-content className="mx-auto w-full max-w-4xl px-6 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
            <div className="min-w-0 flex-1">
              <h1 className="text-display font-semibold tracking-tight">任务看板</h1>
              <p className="mt-2 max-w-2xl text-ui leading-relaxed text-muted-foreground">
                规划、推进并交付你的工作
              </p>
            </div>
            <Button
              type="button"
              className="shrink-0"
              size="compact"
              onClick={() => openEditor(null, "todo")}
            >
              <Plus data-icon="inline-start" aria-hidden />
              新建任务
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
                aria-label="搜索任务"
                placeholder="搜索任务"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
              {query ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2"
                  aria-label="清除搜索"
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
                    筛选
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
                  <PopoverTitle>筛选任务</PopoverTitle>
                  <PopoverDescription>可组合优先级和标签条件。</PopoverDescription>
                </PopoverHeader>

                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-hint font-medium">优先级</legend>
                  {PRIORITIES.map((priority) => (
                    <label key={priority} className="flex items-center gap-2 text-ui">
                      <Checkbox
                        checked={priorities.includes(priority)}
                        onCheckedChange={() =>
                          setPriorities((current) => toggleFilterValue(current, priority))
                        }
                      />
                      {PRIORITY_LABELS[priority]}
                    </label>
                  ))}
                </fieldset>

                <fieldset className="grid gap-2">
                  <legend className="mb-1 text-hint font-medium">标签</legend>
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
                    <p className="text-hint text-muted-foreground">暂无可用标签</p>
                  )}
                </fieldset>

                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  disabled={activeFilterCount === 0}
                  onClick={clearFilters}
                >
                  清除筛选
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      {state.warning ? (
        <p role="alert" className="bg-destructive/10 px-6 py-2 text-hint text-destructive">
          {state.warning}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-6 pb-6 pt-1">
        <div className="flex h-full min-w-max gap-4">
          {TASK_STATUSES.map((status) => (
            <BoardColumn
              key={status}
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
            />
          ))}
        </div>
      </div>

      {editor ? (
        <TaskEditorDialog
          key={editor.task?.id ?? `new-${editor.initialStatus}`}
          task={editor.task}
          initialStatus={editor.initialStatus}
          sessions={sessions}
          onCancel={() => setEditor(null)}
          onSave={saveEditor}
        />
      ) : null}
    </main>
  )
}
