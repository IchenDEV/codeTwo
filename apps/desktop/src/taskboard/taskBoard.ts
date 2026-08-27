export const TASK_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_BOARD_LANES = ["queue", "running", "needs_you", "done"] as const;

export type TaskBoardLane = (typeof TASK_BOARD_LANES)[number];

export type TaskSessionActivityKind = "idle" | "running" | "awaiting_input" | "failed";

export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export const PRIORITIES = TASK_PRIORITIES;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  order: number;
  createdAt: number;
  updatedAt: number;
  /** Ordered oldest to newest. A Task owns its Session history, never only one Session. */
  sessionIds: string[];
}

/**
 * Board lanes are a projection, not another persisted workflow field. A Task keeps its durable
 * stage while the latest Session supplies live execution and attention state.
 */
export function taskBoardLane(
  task: Pick<BoardTask, "status">,
  activity: TaskSessionActivityKind = "idle",
): TaskBoardLane {
  if (task.status === "done") return "done";
  if (task.status === "in_review") return "needs_you";
  if (task.status === "todo") return "queue";
  if (activity === "awaiting_input" || activity === "failed") return "needs_you";
  if (activity === "running") return "running";
  return "queue";
}

export interface BoardFilters {
  query: string;
  priorities: readonly TaskPriority[];
  labels: readonly string[];
}

export interface TaskBoardState {
  tasks: BoardTask[];
  warning: string | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const TASKBOARD_STORAGE_KEY = "codetwo.taskboard.v1";
export const TASKBOARD_SNAPSHOT_VERSION = 2 as const;

export const CORRUPT_BOARD_WARNING = "无法读取已保存的任务看板，已恢复为示例任务。";
export const LOAD_BOARD_WARNING = "无法访问本地任务数据，已恢复为示例任务。";
export const SAVE_BOARD_WARNING = "任务已更新，但暂时无法保存到本地。";

export interface BoardSnapshot {
  version: typeof TASKBOARD_SNAPSHOT_VERSION;
  tasks: BoardTask[];
}

export type BoardSaveResult =
  | { ok: true }
  | { ok: false; warning: typeof SAVE_BOARD_WARNING };

const STATUS_INDEX: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 1,
  in_review: 2,
  done: 3,
};

const DEFAULT_TASK_DATA: readonly BoardTask[] = [
  {
    id: "seed-define-workflow",
    title: "确认任务流转规则",
    description: "和团队确认待处理、进行中、待审阅与已完成四个阶段的进入条件。",
    status: "done",
    priority: "high",
    labels: ["产品", "流程"],
    order: 0,
    createdAt: Date.UTC(2026, 7, 4, 9, 0),
    updatedAt: Date.UTC(2026, 7, 6, 16, 30),
    sessionIds: [],
  },
  {
    id: "seed-local-persistence",
    title: "接入任务本地持久化",
    description: "保存看板快照，并在数据损坏或浏览器存储不可用时提供清晰反馈。",
    status: "in_progress",
    priority: "urgent",
    labels: ["工程", "可靠性"],
    order: 0,
    createdAt: Date.UTC(2026, 7, 7, 10, 15),
    updatedAt: Date.UTC(2026, 7, 12, 14, 20),
    sessionIds: [],
  },
  {
    id: "seed-review-mobile-layout",
    title: "审阅移动端看板布局",
    description: "验证窄屏下的横向浏览、任务操作菜单与筛选体验。",
    status: "in_review",
    priority: "medium",
    labels: ["设计", "移动端"],
    order: 0,
    createdAt: Date.UTC(2026, 7, 8, 11, 0),
    updatedAt: Date.UTC(2026, 7, 12, 18, 45),
    sessionIds: [],
  },
  {
    id: "seed-empty-state-copy",
    title: "完善空状态与操作提示",
    description: "为第一次使用看板的成员准备简洁、可行动的中文引导。",
    status: "todo",
    priority: "low",
    labels: ["文案", "体验"],
    order: 0,
    createdAt: Date.UTC(2026, 7, 10, 9, 40),
    updatedAt: Date.UTC(2026, 7, 10, 9, 40),
    sessionIds: [],
  },
  {
    id: "seed-session-link",
    title: "设计会话关联入口",
    description: "让任务可以跳转到相关编码会话，同时保持任务状态由看板独立管理。",
    status: "todo",
    priority: "medium",
    labels: ["产品", "会话"],
    order: 1,
    createdAt: Date.UTC(2026, 7, 11, 13, 25),
    updatedAt: Date.UTC(2026, 7, 11, 13, 25),
    sessionIds: [],
  },
  {
    id: "seed-accessibility-notes",
    title: "补充键盘操作与无障碍说明",
    description: "覆盖焦点顺序、按钮名称以及不用拖拽也能移动任务的操作路径。",
    status: "todo",
    priority: "medium",
    labels: ["无障碍", "文档"],
    order: 2,
    createdAt: Date.UTC(2026, 7, 12, 8, 50),
    updatedAt: Date.UTC(2026, 7, 12, 8, 50),
    sessionIds: [],
  },
  {
    id: "seed-filter-search",
    title: "实现看板筛选与搜索",
    description: "支持按关键词、优先级和标签缩小任务范围，并保持原有排序。",
    status: "in_progress",
    priority: "high",
    labels: ["工程", "搜索"],
    order: 1,
    createdAt: Date.UTC(2026, 7, 9, 14, 10),
    updatedAt: Date.UTC(2026, 7, 13, 9, 15),
    sessionIds: [],
  },
  {
    id: "seed-review-drag-order",
    title: "验证跨列拖拽顺序",
    description: "检查同列重排、跨列移动和筛选状态下的任务顺序是否稳定。",
    status: "in_review",
    priority: "high",
    labels: ["测试", "交互"],
    order: 1,
    createdAt: Date.UTC(2026, 7, 10, 15, 35),
    updatedAt: Date.UTC(2026, 7, 13, 11, 5),
    sessionIds: [],
  },
  {
    id: "seed-priority-guidelines",
    title: "整理任务优先级规范",
    description: "明确无、低、中、高和紧急五档优先级的使用场景。",
    status: "done",
    priority: "medium",
    labels: ["产品", "规范"],
    order: 1,
    createdAt: Date.UTC(2026, 7, 5, 10, 20),
    updatedAt: Date.UTC(2026, 7, 9, 17, 40),
    sessionIds: [],
  },
];

const ENGLISH_SEED_COPY: Record<
  string,
  Pick<BoardTask, "title" | "description" | "labels">
> = {
  "seed-define-workflow": {
    title: "Confirm the task workflow",
    description: "Agree on the entry criteria for To do, In progress, In review, and Done.",
    labels: ["Product", "Workflow"],
  },
  "seed-local-persistence": {
    title: "Add local task persistence",
    description: "Save the board and explain clearly when stored data is damaged or unavailable.",
    labels: ["Engineering", "Reliability"],
  },
  "seed-review-mobile-layout": {
    title: "Review the narrow board layout",
    description: "Verify horizontal browsing, task menus, and filters in a narrow window.",
    labels: ["Design", "Responsive"],
  },
  "seed-empty-state-copy": {
    title: "Improve empty states and guidance",
    description: "Give first-time board users concise, actionable guidance.",
    labels: ["Copy", "Experience"],
  },
  "seed-session-link": {
    title: "Design the session link entry point",
    description: "Let a task open its coding sessions while the board remains the source of task state.",
    labels: ["Product", "Sessions"],
  },
  "seed-accessibility-notes": {
    title: "Document keyboard and accessibility behavior",
    description: "Cover focus order, button names, and a non-drag path for moving tasks.",
    labels: ["Accessibility", "Docs"],
  },
  "seed-filter-search": {
    title: "Implement task filters and search",
    description: "Narrow tasks by query, priority, and label without changing their order.",
    labels: ["Engineering", "Search"],
  },
  "seed-review-drag-order": {
    title: "Verify drag ordering across columns",
    description: "Check same-column reordering, cross-column moves, and filtered task order.",
    labels: ["Testing", "Interaction"],
  },
  "seed-priority-guidelines": {
    title: "Define task priority guidelines",
    description: "Clarify when to use no, low, medium, high, and urgent priority.",
    labels: ["Product", "Guidelines"],
  },
};

function cloneTask(task: BoardTask): BoardTask {
  return { ...task, labels: [...task.labels], sessionIds: [...task.sessionIds] };
}

/** Returns a fresh localized starter board so consumers cannot mutate the shared template. */
export function seedTasks(locale: "en" | "zh-CN" = "zh-CN"): BoardTask[] {
  return DEFAULT_TASK_DATA.map((task) =>
    cloneTask(locale === "en" ? { ...task, ...ENGLISH_SEED_COPY[task.id] } : task),
  );
}

export const DEFAULT_TASKS: BoardTask[] = seedTasks();

export function createInitialTaskBoardState(locale: "en" | "zh-CN" = "zh-CN"): TaskBoardState {
  return { tasks: seedTasks(locale), warning: null };
}

function normalizeLabels(labels: readonly string[] | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawLabel of labels ?? []) {
    const label = rawLabel.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    normalized.push(label);
  }
  return normalized;
}

let fallbackId = 0;

function generatedTaskId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackId += 1;
  return `task-${Date.now().toString(36)}-${fallbackId.toString(36)}`;
}

export interface CreateBoardTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: readonly string[];
  order?: number;
  sessionIds?: readonly string[];
}

export interface CreateBoardTaskOptions {
  id?: string;
  now?: number;
}

/** Builds a complete task outside the reducer, keeping reducer evaluation deterministic and pure. */
export function createBoardTask(
  input: CreateBoardTaskInput,
  options: CreateBoardTaskOptions = {},
): BoardTask {
  const now = options.now ?? Date.now();
  return {
    id: options.id?.trim() || generatedTaskId(),
    title: input.title.trim() || "未命名任务",
    description: input.description?.trim() ?? "",
    status: input.status ?? "todo",
    priority: input.priority ?? "none",
    labels: normalizeLabels(input.labels),
    order: Number.isFinite(input.order) ? (input.order ?? 0) : 0,
    createdAt: now,
    updatedAt: now,
    sessionIds: normalizeSessionIds(input.sessionIds),
  };
}

function normalizeSessionIds(values: readonly string[] | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values ?? []) {
    const value = rawValue.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

export function latestTaskSessionId(task: BoardTask): string | null {
  return task.sessionIds[task.sessionIds.length - 1] ?? null;
}

export function taskForSession(
  tasks: readonly BoardTask[],
  sessionId: string,
): BoardTask | null {
  return tasks.find((task) => task.sessionIds.includes(sessionId)) ?? null;
}

/**
 * Records the durable Session created for a Task. The first actual run starts a todo Task, while
 * completed/review Tasks keep their explicit board state when a Session is merely inspected.
 */
export function associateTaskSession(
  tasks: readonly BoardTask[],
  taskId: string,
  sessionId: string,
  now = Date.now(),
): BoardTask[] | null {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return null;
  const task = tasks[index]!;
  const alreadyLinked = task.sessionIds.includes(sessionId);
  const linkedElsewhere = tasks.some(
    (candidate, candidateIndex) =>
      candidateIndex !== index && candidate.sessionIds.includes(sessionId),
  );
  const status = task.status === "todo" ? "in_progress" : task.status;
  const updatedAt = Math.max(now, task.createdAt, task.updatedAt);
  if (
    alreadyLinked
    && !linkedElsewhere
    && status === task.status
    && updatedAt === task.updatedAt
  ) {
    return tasks.map(cloneTask);
  }
  const updated: BoardTask = {
    ...task,
    status,
    updatedAt,
    sessionIds: alreadyLinked ? [...task.sessionIds] : [...task.sessionIds, sessionId],
  };
  return tasks.map((candidate, candidateIndex) => {
    if (candidateIndex === index) return updated;
    if (!candidate.sessionIds.includes(sessionId)) return cloneTask(candidate);
    return {
      ...candidate,
      updatedAt: Math.max(now, candidate.createdAt, candidate.updatedAt),
      labels: [...candidate.labels],
      sessionIds: candidate.sessionIds.filter((id) => id !== sessionId),
    };
  });
}

/** Non-mutating, stable ordering by board column and then each task's explicit order. */
export function sortBoardTasks(tasks: readonly BoardTask[]): BoardTask[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (a, b) =>
        STATUS_INDEX[a.task.status] - STATUS_INDEX[b.task.status]
        || a.task.order - b.task.order
        || a.index - b.index,
    )
    .map(({ task }) => task);
}

export const sortTasks = sortBoardTasks;

function normalizedSearchValue(value: string): string {
  return value.toLocaleLowerCase().trim();
}

/** Applies facets without sorting, preserving the caller's (including a filtered drag view's) order. */
export function filterBoardTasks(
  tasks: readonly BoardTask[],
  filters: BoardFilters,
): BoardTask[] {
  const query = normalizedSearchValue(filters.query);
  const priorities = new Set(filters.priorities);
  const labels = new Set(filters.labels);

  return tasks.filter((task) => {
    if (priorities.size > 0 && !priorities.has(task.priority)) return false;
    if (labels.size > 0 && !task.labels.some((label) => labels.has(label))) return false;
    if (!query) return true;
    const searchable = [task.id, task.title, task.description, ...task.labels];
    return searchable.some((value) => normalizedSearchValue(value).includes(query));
  });
}

export const filterTasks = filterBoardTasks;

/** Returns unique labels in first-seen order, which stays stable as filters are applied. */
export function boardLabels(tasks: readonly BoardTask[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    for (const label of task.labels) {
      if (seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

export const collectLabels = boardLabels;

export function countTasksByStatus(tasks: readonly BoardTask[]): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
  };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}

export const boardStatusCounts = countTasksByStatus;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value);
}

function parseTask(value: unknown, version: 1 | typeof TASKBOARD_SNAPSHOT_VERSION): BoardTask | null {
  if (!isRecord(value)) return null;
  const {
    id,
    title,
    description,
    status,
    priority,
    labels,
    order,
    createdAt,
    updatedAt,
    sessionIds,
    linkedSessionId,
  } = value;
  const persistedSessionIds = version === 1
    ? (typeof linkedSessionId === "string" ? [linkedSessionId] : [])
    : sessionIds;
  if (
    typeof id !== "string"
    || !id.trim()
    || typeof title !== "string"
    || !title.trim()
    || typeof description !== "string"
    || !isTaskStatus(status)
    || !isTaskPriority(priority)
    || !Array.isArray(labels)
    || !labels.every((label) => typeof label === "string")
    || typeof order !== "number"
    || !Number.isFinite(order)
    || typeof createdAt !== "number"
    || !Number.isSafeInteger(createdAt)
    || createdAt < 0
    || typeof updatedAt !== "number"
    || !Number.isSafeInteger(updatedAt)
    || updatedAt < createdAt
    || !Array.isArray(persistedSessionIds)
    || !persistedSessionIds.every((sessionId) => typeof sessionId === "string" && sessionId.trim())
  ) {
    return null;
  }
  return {
    id: id.trim(),
    title: title.trim(),
    description,
    status,
    priority,
    labels: normalizeLabels(labels),
    order,
    createdAt,
    updatedAt,
    sessionIds: normalizeSessionIds(persistedSessionIds),
  };
}

function corruptBoardState(locale: "en" | "zh-CN" = "zh-CN"): TaskBoardState {
  return { tasks: seedTasks(locale), warning: CORRUPT_BOARD_WARNING };
}

/** Parses and validates the complete snapshot boundary; no unchecked persisted value reaches the UI. */
export function parseBoardSnapshot(
  raw: string,
  locale: "en" | "zh-CN" = "zh-CN",
): TaskBoardState {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value)
      || (value.version !== 1 && value.version !== TASKBOARD_SNAPSHOT_VERSION)
      || !Array.isArray(value.tasks)
    ) {
      return corruptBoardState(locale);
    }
    const version = value.version;
    const tasks: BoardTask[] = [];
    const ids = new Set<string>();
    const claimedSessions = new Set<string>();
    for (const valueTask of value.tasks) {
      const task = parseTask(valueTask, version);
      if (!task || ids.has(task.id)) return corruptBoardState(locale);
      ids.add(task.id);
      task.sessionIds = task.sessionIds.filter((sessionId) => {
        if (claimedSessions.has(sessionId)) return false;
        claimedSessions.add(sessionId);
        return true;
      });
      tasks.push(task);
    }
    return { tasks, warning: null };
  } catch {
    return corruptBoardState(locale);
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadBoardSnapshot(
  storage?: StorageLike | null,
  locale: "en" | "zh-CN" = "zh-CN",
): TaskBoardState {
  const resolvedStorage = storage === undefined ? defaultStorage() : storage;
  if (!resolvedStorage) return createInitialTaskBoardState(locale);
  try {
    const raw = resolvedStorage.getItem(TASKBOARD_STORAGE_KEY);
    return raw === null ? createInitialTaskBoardState(locale) : parseBoardSnapshot(raw, locale);
  } catch {
    return { tasks: seedTasks(locale), warning: LOAD_BOARD_WARNING };
  }
}

export const loadTaskBoard = loadBoardSnapshot;

export function saveBoardSnapshot(
  value: readonly BoardTask[] | TaskBoardState,
  storage?: StorageLike | null,
): BoardSaveResult {
  const resolvedStorage = storage === undefined ? defaultStorage() : storage;
  if (!resolvedStorage) return { ok: false, warning: SAVE_BOARD_WARNING };
  const tasks = "tasks" in value ? value.tasks : value;
  try {
    const snapshot: BoardSnapshot = {
      version: TASKBOARD_SNAPSHOT_VERSION,
      tasks: tasks.map(cloneTask),
    };
    resolvedStorage.setItem(TASKBOARD_STORAGE_KEY, JSON.stringify(snapshot));
    return { ok: true };
  } catch {
    return { ok: false, warning: SAVE_BOARD_WARNING };
  }
}

export const saveTaskBoard = saveBoardSnapshot;

export type BoardAction =
  | { type: "create"; task: BoardTask }
  | { type: "update"; task: BoardTask }
  | { type: "delete"; id: string }
  | { type: "move"; id: string; status: TaskStatus; beforeId?: string; now?: number }
  | { type: "hydrate"; tasks: BoardTask[]; warning?: string | null };

export type TaskBoardAction = BoardAction;

function tasksInStatus(tasks: readonly BoardTask[], status: TaskStatus, omittedId?: string): BoardTask[] {
  return sortBoardTasks(tasks).filter((task) => task.status === status && task.id !== omittedId);
}

function reindexStatuses(
  tasks: readonly BoardTask[],
  orderedByStatus: ReadonlyMap<TaskStatus, readonly BoardTask[]>,
): BoardTask[] {
  const placement = new Map<string, { status: TaskStatus; order: number }>();
  for (const [status, statusTasks] of orderedByStatus) {
    statusTasks.forEach((task, order) => placement.set(task.id, { status, order }));
  }
  return tasks.map((task) => {
    const next = placement.get(task.id);
    if (!next || (task.status === next.status && task.order === next.order)) return task;
    return { ...task, status: next.status, order: next.order };
  });
}

function sameTask(left: BoardTask, right: BoardTask): boolean {
  return left.id === right.id
    && left.title === right.title
    && left.description === right.description
    && left.status === right.status
    && left.priority === right.priority
    && left.order === right.order
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.sessionIds.length === right.sessionIds.length
    && left.sessionIds.every((sessionId, index) => sessionId === right.sessionIds[index])
    && left.labels.length === right.labels.length
    && left.labels.every((label, index) => label === right.labels[index]);
}

/** Pure board state transitions. Time and ID generation deliberately happen before dispatch. */
export function boardReducer(state: TaskBoardState, action: BoardAction): TaskBoardState {
  switch (action.type) {
    case "create": {
      if (state.tasks.some((task) => task.id === action.task.id)) return state;
      const current = tasksInStatus(state.tasks, action.task.status);
      const task = cloneTask(action.task);
      task.order = current.length;
      return {
        ...state,
        tasks: reindexStatuses([...state.tasks, task], new Map([[task.status, [...current, task]]])),
      };
    }
    case "update": {
      const previous = state.tasks.find((task) => task.id === action.task.id);
      if (!previous || sameTask(previous, action.task)) return state;
      const replacement = cloneTask(action.task);
      if (previous.status === replacement.status) {
        return {
          ...state,
          tasks: state.tasks.map((task) => (task.id === replacement.id ? replacement : task)),
        };
      }
      const source = tasksInStatus(state.tasks, previous.status, previous.id);
      const target = tasksInStatus(state.tasks, replacement.status, previous.id);
      replacement.order = target.length;
      const replaced = state.tasks.map((task) => (task.id === replacement.id ? replacement : task));
      return {
        ...state,
        tasks: reindexStatuses(
          replaced,
          new Map([
            [previous.status, source],
            [replacement.status, [...target, replacement]],
          ]),
        ),
      };
    }
    case "delete": {
      const task = state.tasks.find((candidate) => candidate.id === action.id);
      if (!task) return state;
      const tasks = state.tasks.filter((candidate) => candidate.id !== action.id);
      return {
        ...state,
        tasks: reindexStatuses(tasks, new Map([[task.status, tasksInStatus(tasks, task.status)]])),
      };
    }
    case "move": {
      const moving = state.tasks.find((task) => task.id === action.id);
      if (!moving || action.beforeId === moving.id) return state;
      const target = tasksInStatus(state.tasks, action.status, moving.id);
      let insertionIndex = target.length;
      if (action.beforeId !== undefined) {
        insertionIndex = target.findIndex((task) => task.id === action.beforeId);
        // A supplied anchor is exact: stale or cross-column IDs must not turn into an append.
        if (insertionIndex < 0) return state;
      }
      const nextTarget = [...target];
      nextTarget.splice(insertionIndex, 0, moving);
      const currentTargetIds = tasksInStatus(state.tasks, action.status).map((task) => task.id);
      const nextTargetIds = nextTarget.map((task) => task.id);
      if (
        moving.status === action.status
        && currentTargetIds.length === nextTargetIds.length
        && currentTargetIds.every((id, index) => id === nextTargetIds[index])
      ) {
        return state;
      }

      const orderings = new Map<TaskStatus, readonly BoardTask[]>([[action.status, nextTarget]]);
      if (moving.status !== action.status) {
        orderings.set(moving.status, tasksInStatus(state.tasks, moving.status, moving.id));
      }
      const timestampedTasks = action.now === undefined
        ? state.tasks
        : state.tasks.map((task) => (
            task.id === moving.id
              ? { ...task, updatedAt: Math.max(action.now!, task.createdAt, task.updatedAt) }
              : task
          ));
      return { ...state, tasks: reindexStatuses(timestampedTasks, orderings) };
    }
    case "hydrate":
      return {
        tasks: action.tasks.map(cloneTask),
        warning: action.warning ?? null,
      };
  }
}

export const taskBoardReducer = boardReducer;
