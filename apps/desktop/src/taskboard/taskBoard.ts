export const taskStatuses = [
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const taskBoardLanes = [
  "queue",
  "running",
  "needs_you",
  "done",
] as const;

export type TaskBoardLane = (typeof taskBoardLanes)[number];

export type TaskSessionActivityKind =
  | "idle"
  | "running"
  | "awaiting_input"
  | "failed";

export const taskPriorities = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export const PRIORITIES = taskPriorities;

export type TaskPriority = (typeof taskPriorities)[number];

export interface GitHubPullRequestReference {
  provider: "github";
  host: "github.com";
  repository: string;
  number: number;
  url: string;
}

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
  /**
  Ordered oldest to newest. A Task owns its Session history, never only one Session.
  */
  sessionIds: string[];
  /**
  Durable identity for the one GitHub pull request this Task currently owns.
  */
  pullRequest: GitHubPullRequestReference | null;
  /**
  Incremented on every link change so stale UI actions cannot rewrite a newer association.
  */
  pullRequestLinkRevision: number;
}

export function taskBoardLane(
  task: Pick<BoardTask, "status">,
  activity: TaskSessionActivityKind = "idle"
): TaskBoardLane {
  if (task.status === "done") {
    return "done";
  }
  if (task.status === "in_review") {
    return "needs_you";
  }
  if (task.status === "todo") {
    return "queue";
  }
  if (activity === "awaiting_input" || activity === "failed") {
    return "needs_you";
  }
  if (activity === "running") {
    return "running";
  }
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

export const taskboardStorageKey = "codetwo.taskboard.v1";
export const taskboardSnapshotVersion = 3 as const;

export const corruptBoardWarning =
  "无法读取已保存的任务看板，已恢复为示例任务。";
export const loadBoardWarning = "无法访问本地任务数据，已恢复为示例任务。";
export const saveBoardWarning = "任务已更新，但暂时无法保存到本地。";

export interface BoardSnapshot {
  version: typeof taskboardSnapshotVersion;
  tasks: BoardTask[];
}

export type BoardSaveResult =
  | { ok: true }
  | { ok: false; warning: typeof saveBoardWarning };

const statusIndex: Record<TaskStatus, number> = {
  done: 3,
  in_progress: 1,
  in_review: 2,
  todo: 0,
};

const defaultTaskData: readonly Omit<
  BoardTask,
  "pullRequest" | "pullRequestLinkRevision"
>[] = [
  {
    createdAt: Date.UTC(2026, 7, 4, 9, 0),
    description: "和团队确认待处理、进行中、待审阅与已完成四个阶段的进入条件。",
    id: "seed-define-workflow",
    labels: ["产品", "流程"],
    order: 0,
    priority: "high",
    sessionIds: [],
    status: "done",
    title: "确认任务流转规则",
    updatedAt: Date.UTC(2026, 7, 6, 16, 30),
  },
  {
    createdAt: Date.UTC(2026, 7, 7, 10, 15),
    description: "保存看板快照，并在数据损坏或浏览器存储不可用时提供清晰反馈。",
    id: "seed-local-persistence",
    labels: ["工程", "可靠性"],
    order: 0,
    priority: "urgent",
    sessionIds: [],
    status: "in_progress",
    title: "接入任务本地持久化",
    updatedAt: Date.UTC(2026, 7, 12, 14, 20),
  },
  {
    createdAt: Date.UTC(2026, 7, 8, 11, 0),
    description: "验证窄屏下的横向浏览、任务操作菜单与筛选体验。",
    id: "seed-review-mobile-layout",
    labels: ["设计", "移动端"],
    order: 0,
    priority: "medium",
    sessionIds: [],
    status: "in_review",
    title: "审阅移动端看板布局",
    updatedAt: Date.UTC(2026, 7, 12, 18, 45),
  },
  {
    createdAt: Date.UTC(2026, 7, 10, 9, 40),
    description: "为第一次使用看板的成员准备简洁、可行动的中文引导。",
    id: "seed-empty-state-copy",
    labels: ["文案", "体验"],
    order: 0,
    priority: "low",
    sessionIds: [],
    status: "todo",
    title: "完善空状态与操作提示",
    updatedAt: Date.UTC(2026, 7, 10, 9, 40),
  },
  {
    createdAt: Date.UTC(2026, 7, 11, 13, 25),
    description:
      "让任务可以跳转到相关编码会话，同时保持任务状态由看板独立管理。",
    id: "seed-session-link",
    labels: ["产品", "会话"],
    order: 1,
    priority: "medium",
    sessionIds: [],
    status: "todo",
    title: "设计会话关联入口",
    updatedAt: Date.UTC(2026, 7, 11, 13, 25),
  },
  {
    createdAt: Date.UTC(2026, 7, 12, 8, 50),
    description: "覆盖焦点顺序、按钮名称以及不用拖拽也能移动任务的操作路径。",
    id: "seed-accessibility-notes",
    labels: ["无障碍", "文档"],
    order: 2,
    priority: "medium",
    sessionIds: [],
    status: "todo",
    title: "补充键盘操作与无障碍说明",
    updatedAt: Date.UTC(2026, 7, 12, 8, 50),
  },
  {
    createdAt: Date.UTC(2026, 7, 9, 14, 10),
    description: "支持按关键词、优先级和标签缩小任务范围，并保持原有排序。",
    id: "seed-filter-search",
    labels: ["工程", "搜索"],
    order: 1,
    priority: "high",
    sessionIds: [],
    status: "in_progress",
    title: "实现看板筛选与搜索",
    updatedAt: Date.UTC(2026, 7, 13, 9, 15),
  },
  {
    createdAt: Date.UTC(2026, 7, 10, 15, 35),
    description: "检查同列重排、跨列移动和筛选状态下的任务顺序是否稳定。",
    id: "seed-review-drag-order",
    labels: ["测试", "交互"],
    order: 1,
    priority: "high",
    sessionIds: [],
    status: "in_review",
    title: "验证跨列拖拽顺序",
    updatedAt: Date.UTC(2026, 7, 13, 11, 5),
  },
  {
    createdAt: Date.UTC(2026, 7, 5, 10, 20),
    description: "明确无、低、中、高和紧急五档优先级的使用场景。",
    id: "seed-priority-guidelines",
    labels: ["产品", "规范"],
    order: 1,
    priority: "medium",
    sessionIds: [],
    status: "done",
    title: "整理任务优先级规范",
    updatedAt: Date.UTC(2026, 7, 9, 17, 40),
  },
];

const englishSeedCopy: Record<
  string,
  Pick<BoardTask, "title" | "description" | "labels">
> = {
  "seed-accessibility-notes": {
    description:
      "Cover focus order, button names, and a non-drag path for moving tasks.",
    labels: ["Accessibility", "Docs"],
    title: "Document keyboard and accessibility behavior",
  },
  "seed-define-workflow": {
    description:
      "Agree on the entry criteria for To do, In progress, In review, and Done.",
    labels: ["Product", "Workflow"],
    title: "Confirm the task workflow",
  },
  "seed-empty-state-copy": {
    description: "Give first-time board users concise, actionable guidance.",
    labels: ["Copy", "Experience"],
    title: "Improve empty states and guidance",
  },
  "seed-filter-search": {
    description:
      "Narrow tasks by query, priority, and label without changing their order.",
    labels: ["Engineering", "Search"],
    title: "Implement task filters and search",
  },
  "seed-local-persistence": {
    description:
      "Save the board and explain clearly when stored data is damaged or unavailable.",
    labels: ["Engineering", "Reliability"],
    title: "Add local task persistence",
  },
  "seed-priority-guidelines": {
    description:
      "Clarify when to use no, low, medium, high, and urgent priority.",
    labels: ["Product", "Guidelines"],
    title: "Define task priority guidelines",
  },
  "seed-review-drag-order": {
    description:
      "Check same-column reordering, cross-column moves, and filtered task order.",
    labels: ["Testing", "Interaction"],
    title: "Verify drag ordering across columns",
  },
  "seed-review-mobile-layout": {
    description:
      "Verify horizontal browsing, task menus, and filters in a narrow window.",
    labels: ["Design", "Responsive"],
    title: "Review the narrow board layout",
  },
  "seed-session-link": {
    description:
      "Let a task open its coding sessions while the board remains the source of task state.",
    labels: ["Product", "Sessions"],
    title: "Design the session link entry point",
  },
};

function cloneTask(task: BoardTask): BoardTask {
  return {
    ...task,
    labels: [...task.labels],
    pullRequest: task.pullRequest ? { ...task.pullRequest } : null,
    sessionIds: [...task.sessionIds],
  };
}

export function seedTasks(locale: "en" | "zh-CN" = "zh-CN"): BoardTask[] {
  return defaultTaskData.map((task) => {
    return cloneTask({
      ...(locale === "en" ? { ...task, ...englishSeedCopy[task.id] } : task),
      pullRequest: null,
      pullRequestLinkRevision: 0,
    });
  });
}

export const defaultTasks: BoardTask[] = seedTasks();

export function createInitialTaskBoardState(
  locale: "en" | "zh-CN" = "zh-CN"
): TaskBoardState {
  return { tasks: seedTasks(locale), warning: null };
}

function normalizeLabels(labels: readonly string[] | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawLabel of labels ?? []) {
    const label = rawLabel.trim();
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    normalized.push(label);
  }
  return normalized;
}

let fallbackId = 0;

function generatedTaskId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
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

export function createBoardTask(
  input: CreateBoardTaskInput,
  options: CreateBoardTaskOptions = {}
): BoardTask {
  const now = options.now ?? Date.now();
  const trimmedId = options.id?.trim();
  return {
    createdAt: now,
    description: input.description?.trim() ?? "",
    id: trimmedId != null && trimmedId !== "" ? trimmedId : generatedTaskId(),
    labels: normalizeLabels(input.labels),
    order: Number.isFinite(input.order) ? (input.order ?? 0) : 0,
    priority: input.priority ?? "none",
    pullRequest: null,
    pullRequestLinkRevision: 0,
    sessionIds: normalizeSessionIds(input.sessionIds),
    status: input.status ?? "todo",
    title: input.title.trim() || "未命名任务",
    updatedAt: now,
  };
}

function normalizeSessionIds(values: readonly string[] | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawValue of values ?? []) {
    const value = rawValue.trim();
    if (!value || seen.has(value)) {
      continue;
    }
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
  sessionId: string
): BoardTask | null {
  return tasks.find((task) => task.sessionIds.includes(sessionId)) ?? null;
}

export function githubPullRequestIdentity(
  reference: GitHubPullRequestReference
): string {
  return `${reference.provider}:${reference.host}/${reference.repository.toLowerCase()}#${reference.number}`;
}

function samePullRequestReference(
  left: GitHubPullRequestReference | null,
  right: GitHubPullRequestReference | null
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    githubPullRequestIdentity(left) === githubPullRequestIdentity(right) &&
    left.url === right.url
  );
}

export function taskForPullRequest(
  tasks: readonly BoardTask[],
  reference: GitHubPullRequestReference
): BoardTask | null {
  const identity = githubPullRequestIdentity(reference);
  return (
    tasks.find((task) => {
      return (
        task.pullRequest !== null &&
        githubPullRequestIdentity(task.pullRequest) === identity
      );
    }) ?? null
  );
}

export function associateTaskPullRequest(
  tasks: readonly BoardTask[],
  taskId: string,
  reference: GitHubPullRequestReference,
  now = Date.now()
): BoardTask[] | null {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return null;
  }
  const identity = githubPullRequestIdentity(reference);
  const target = tasks[index]!;
  const isLinkedElsewhere = tasks.some((task, taskIndex) => {
    return (
      taskIndex !== index &&
      task.pullRequest !== null &&
      githubPullRequestIdentity(task.pullRequest) === identity
    );
  });
  if (
    samePullRequestReference(target.pullRequest, reference) &&
    !isLinkedElsewhere
  ) {
    return tasks.map(cloneTask);
  }

  return tasks.map((task, taskIndex) => {
    if (taskIndex === index) {
      return {
        ...cloneTask(task),
        pullRequest: { ...reference },
        pullRequestLinkRevision: task.pullRequestLinkRevision + 1,
        updatedAt: Math.max(now, task.createdAt, task.updatedAt),
      };
    }
    if (
      task.pullRequest === null ||
      githubPullRequestIdentity(task.pullRequest) !== identity
    ) {
      return cloneTask(task);
    }
    return {
      ...cloneTask(task),
      pullRequest: null,
      pullRequestLinkRevision: task.pullRequestLinkRevision + 1,
      updatedAt: Math.max(now, task.createdAt, task.updatedAt),
    };
  });
}

export function unlinkTaskPullRequest(
  tasks: readonly BoardTask[],
  taskId: string,
  expectedIdentity: string,
  expectedRevision: number,
  now = Date.now()
): BoardTask[] | null {
  const index = tasks.findIndex((task) => task.id === taskId);
  const task = tasks[index];
  if (
    index === -1 ||
    !task?.pullRequest ||
    task.pullRequestLinkRevision !== expectedRevision ||
    githubPullRequestIdentity(task.pullRequest) !== expectedIdentity
  ) {
    return null;
  }
  return tasks.map((candidate, candidateIndex) => {
    return candidateIndex === index
      ? {
          ...cloneTask(candidate),
          pullRequest: null,
          pullRequestLinkRevision: candidate.pullRequestLinkRevision + 1,
          updatedAt: Math.max(now, candidate.createdAt, candidate.updatedAt),
        }
      : cloneTask(candidate);
  });
}

export function associateTaskSession(
  tasks: readonly BoardTask[],
  taskId: string,
  sessionId: string,
  now = Date.now()
): BoardTask[] | null {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return null;
  }
  const task = tasks[index]!;
  const isAlreadyLinked = task.sessionIds.includes(sessionId);
  const isLinkedElsewhere = tasks.some(
    (candidate, candidateIndex) =>
      candidateIndex !== index && candidate.sessionIds.includes(sessionId)
  );
  const status = task.status === "todo" ? "in_progress" : task.status;
  const updatedAt = Math.max(now, task.createdAt, task.updatedAt);
  if (
    isAlreadyLinked &&
    !isLinkedElsewhere &&
    status === task.status &&
    updatedAt === task.updatedAt
  ) {
    return tasks.map(cloneTask);
  }
  const updated: BoardTask = {
    ...task,
    sessionIds: isAlreadyLinked
      ? [...task.sessionIds]
      : [...task.sessionIds, sessionId],
    status,
    updatedAt,
  };
  return tasks.map((candidate, candidateIndex) => {
    if (candidateIndex === index) {
      return updated;
    }
    if (!candidate.sessionIds.includes(sessionId)) {
      return cloneTask(candidate);
    }
    return {
      ...candidate,
      labels: [...candidate.labels],
      sessionIds: candidate.sessionIds.filter((id) => id !== sessionId),
      updatedAt: Math.max(now, candidate.createdAt, candidate.updatedAt),
    };
  });
}

export function sortBoardTasks(tasks: readonly BoardTask[]): BoardTask[] {
  return tasks
    .map((task, index) => ({ index, task }))
    .sort((a, b) => {
      return (
        statusIndex[a.task.status] - statusIndex[b.task.status] ||
        a.task.order - b.task.order ||
        a.index - b.index
      );
    })
    .map(({ task }) => task);
}

export const sortTasks = sortBoardTasks;

function normalizedSearchValue(value: string): string {
  return value.toLocaleLowerCase().trim();
}

export function filterBoardTasks(
  tasks: readonly BoardTask[],
  filters: BoardFilters
): BoardTask[] {
  const query = normalizedSearchValue(filters.query);
  const priorities = new Set(filters.priorities);
  const labels = new Set(filters.labels);

  return tasks.filter((task) => {
    if (priorities.size > 0 && !priorities.has(task.priority)) {
      return false;
    }
    if (labels.size > 0 && !task.labels.some((label) => labels.has(label))) {
      return false;
    }
    if (!query) {
      return true;
    }
    const searchable = [
      task.id,
      task.title,
      task.description,
      ...task.labels,
      ...(task.pullRequest
        ? [
            task.pullRequest.repository,
            String(task.pullRequest.number),
            `${task.pullRequest.repository} #${task.pullRequest.number}`,
            task.pullRequest.url,
          ]
        : []),
    ];
    return searchable.some((value) =>
      normalizedSearchValue(value).includes(query)
    );
  });
}

export const filterTasks = filterBoardTasks;

export function boardLabels(tasks: readonly BoardTask[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    for (const label of task.labels) {
      if (seen.has(label)) {
        continue;
      }
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

export const collectLabels = boardLabels;

export function countTasksByStatus(
  tasks: readonly BoardTask[]
): Record<TaskStatus, number> {
  const counts: Record<TaskStatus, number> = {
    done: 0,
    in_progress: 0,
    in_review: 0,
    todo: 0,
  };
  for (const task of tasks) {
    counts[task.status] += 1;
  }
  return counts;
}

export const boardStatusCounts = countTasksByStatus;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    typeof value === "string" &&
    (taskStatuses as readonly string[]).includes(value)
  );
}

function isTaskPriority(value: unknown): value is TaskPriority {
  return (
    typeof value === "string" &&
    (taskPriorities as readonly string[]).includes(value)
  );
}

function isGitHubRepository(value: string): boolean {
  const [owner, name, extra] = value.split("/");
  return (
    extra === undefined &&
    owner !== undefined &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(owner) &&
    name !== undefined &&
    name.length <= 100 &&
    /^[A-Za-z0-9._-]+$/u.test(name)
  );
}

function parseGitHubPullRequestReference(
  value: unknown
): GitHubPullRequestReference | null | undefined {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const { provider, host, repository, number, url } = value;
  if (
    provider !== "github" ||
    typeof host !== "string" ||
    host.toLowerCase() !== "github.com" ||
    typeof repository !== "string" ||
    typeof number !== "number" ||
    !Number.isSafeInteger(number) ||
    number <= 0 ||
    typeof url !== "string"
  ) {
    return undefined;
  }
  const normalizedRepository = repository.trim();
  if (!isGitHubRepository(normalizedRepository)) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split("/").filter(Boolean);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.toLowerCase() !== "github.com" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      path.length !== 4 ||
      path[2] !== "pull" ||
      path[3] !== String(number) ||
      `${path[0]}/${path[1]}`.toLowerCase() !==
        normalizedRepository.toLowerCase()
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return {
    host: "github.com",
    number,
    provider: "github",
    repository: normalizedRepository,
    url: `https://github.com/${normalizedRepository}/pull/${number}`,
  };
}

type SupportedBoardSnapshotVersion = 1 | 2 | typeof taskboardSnapshotVersion;

function parseTask(
  value: unknown,
  version: SupportedBoardSnapshotVersion
): BoardTask | null {
  if (!isRecord(value)) {
    return null;
  }
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
    pullRequest,
    pullRequestLinkRevision,
  } = value;
  const persistedSessionIds =
    version === 1
      ? typeof linkedSessionId === "string"
        ? [linkedSessionId]
        : []
      : sessionIds;
  const persistedPullRequest =
    version < 3 ? null : parseGitHubPullRequestReference(pullRequest);
  const persistedPullRequestRevision =
    version < 3 ? 0 : pullRequestLinkRevision;
  if (
    typeof id !== "string" ||
    !id.trim() ||
    typeof title !== "string" ||
    !title.trim() ||
    typeof description !== "string" ||
    !isTaskStatus(status) ||
    !isTaskPriority(priority) ||
    !Array.isArray(labels) ||
    !labels.every((label) => typeof label === "string") ||
    typeof order !== "number" ||
    !Number.isFinite(order) ||
    typeof createdAt !== "number" ||
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0 ||
    typeof updatedAt !== "number" ||
    !Number.isSafeInteger(updatedAt) ||
    updatedAt < createdAt ||
    !Array.isArray(persistedSessionIds) ||
    !persistedSessionIds.every(
      (sessionId) => typeof sessionId === "string" && sessionId.trim() !== ""
    ) ||
    persistedPullRequest === undefined ||
    typeof persistedPullRequestRevision !== "number" ||
    !Number.isSafeInteger(persistedPullRequestRevision) ||
    persistedPullRequestRevision < 0 ||
    persistedPullRequestRevision >= Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }
  return {
    createdAt,
    description,
    id: id.trim(),
    labels: normalizeLabels(labels),
    order,
    priority,
    pullRequest: persistedPullRequest,
    pullRequestLinkRevision: persistedPullRequestRevision,
    sessionIds: normalizeSessionIds(persistedSessionIds),
    status,
    title: title.trim(),
    updatedAt,
  };
}

function corruptBoardState(locale: "en" | "zh-CN" = "zh-CN"): TaskBoardState {
  return { tasks: seedTasks(locale), warning: corruptBoardWarning };
}

export function parseBoardSnapshot(
  raw: string,
  locale: "en" | "zh-CN" = "zh-CN"
): TaskBoardState {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      (value.version !== 1 &&
        value.version !== 2 &&
        value.version !== taskboardSnapshotVersion) ||
      !Array.isArray(value.tasks)
    ) {
      return corruptBoardState(locale);
    }
    const { version } = value;
    const tasks: BoardTask[] = [];
    const ids = new Set<string>();
    const claimedSessions = new Set<string>();
    const claimedPullRequests = new Set<string>();
    for (const valueTask of value.tasks) {
      const task = parseTask(valueTask, version);
      if (!task || ids.has(task.id)) {
        return corruptBoardState(locale);
      }
      ids.add(task.id);
      task.sessionIds = task.sessionIds.filter((sessionId) => {
        if (claimedSessions.has(sessionId)) {
          return false;
        }
        claimedSessions.add(sessionId);
        return true;
      });
      if (task.pullRequest) {
        const identity = githubPullRequestIdentity(task.pullRequest);
        if (claimedPullRequests.has(identity)) {
          task.pullRequest = null;
          task.pullRequestLinkRevision += 1;
        } else {
          claimedPullRequests.add(identity);
        }
      }
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
  locale: "en" | "zh-CN" = "zh-CN"
): TaskBoardState {
  const resolvedStorage = storage === undefined ? defaultStorage() : storage;
  if (!resolvedStorage) {
    return createInitialTaskBoardState(locale);
  }
  try {
    const raw = resolvedStorage.getItem(taskboardStorageKey);
    return raw === null
      ? createInitialTaskBoardState(locale)
      : parseBoardSnapshot(raw, locale);
  } catch {
    return { tasks: seedTasks(locale), warning: loadBoardWarning };
  }
}

export const loadTaskBoard = loadBoardSnapshot;

export function saveBoardSnapshot(
  value: readonly BoardTask[] | TaskBoardState,
  storage?: StorageLike | null
): BoardSaveResult {
  const resolvedStorage = storage === undefined ? defaultStorage() : storage;
  if (!resolvedStorage) {
    return { ok: false, warning: saveBoardWarning };
  }
  const tasks = "tasks" in value ? value.tasks : value;
  try {
    const snapshot: BoardSnapshot = {
      tasks: tasks.map(cloneTask),
      version: taskboardSnapshotVersion,
    };
    resolvedStorage.setItem(taskboardStorageKey, JSON.stringify(snapshot));
    return { ok: true };
  } catch {
    return { ok: false, warning: saveBoardWarning };
  }
}

export const saveTaskBoard = saveBoardSnapshot;

export type BoardAction =
  | { type: "create"; task: BoardTask }
  | { type: "update"; task: BoardTask }
  | { type: "delete"; id: string }
  | {
      type: "move";
      id: string;
      status: TaskStatus;
      beforeId?: string;
      now?: number;
    }
  | { type: "hydrate"; tasks: BoardTask[]; warning?: string | null };

export type TaskBoardAction = BoardAction;

function tasksInStatus(
  tasks: readonly BoardTask[],
  status: TaskStatus,
  omittedId?: string
): BoardTask[] {
  return sortBoardTasks(tasks).filter(
    (task) => task.status === status && task.id !== omittedId
  );
}

function reindexStatuses(
  tasks: readonly BoardTask[],
  orderedByStatus: ReadonlyMap<TaskStatus, readonly BoardTask[]>
): BoardTask[] {
  const placement = new Map<string, { status: TaskStatus; order: number }>();
  for (const [status, statusTasks] of orderedByStatus) {
    statusTasks.forEach((task, order) =>
      placement.set(task.id, { order, status })
    );
  }
  return tasks.map((task) => {
    const next = placement.get(task.id);
    if (!next || (task.status === next.status && task.order === next.order)) {
      return task;
    }
    return { ...task, order: next.order, status: next.status };
  });
}

function sameTask(left: BoardTask, right: BoardTask): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.description === right.description &&
    left.status === right.status &&
    left.priority === right.priority &&
    left.order === right.order &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.pullRequestLinkRevision === right.pullRequestLinkRevision &&
    samePullRequestReference(left.pullRequest, right.pullRequest) &&
    left.sessionIds.length === right.sessionIds.length &&
    left.sessionIds.every(
      (sessionId, index) => sessionId === right.sessionIds[index]
    ) &&
    left.labels.length === right.labels.length &&
    left.labels.every((label, index) => label === right.labels[index])
  );
}

export function boardReducer(
  state: TaskBoardState,
  action: BoardAction
): TaskBoardState {
  switch (action.type) {
    case "create": {
      if (state.tasks.some((task) => task.id === action.task.id)) {
        return state;
      }
      const current = tasksInStatus(state.tasks, action.task.status);
      const task = cloneTask(action.task);
      task.order = current.length;
      return {
        ...state,
        tasks: reindexStatuses(
          [...state.tasks, task],
          new Map([[task.status, [...current, task]]])
        ),
      };
    }
    case "update": {
      const previous = state.tasks.find((task) => task.id === action.task.id);
      if (!previous || sameTask(previous, action.task)) {
        return state;
      }
      const replacement = cloneTask(action.task);
      if (previous.status === replacement.status) {
        return {
          ...state,
          tasks: state.tasks.map((task) =>
            task.id === replacement.id ? replacement : task
          ),
        };
      }
      const source = tasksInStatus(state.tasks, previous.status, previous.id);
      const target = tasksInStatus(
        state.tasks,
        replacement.status,
        previous.id
      );
      replacement.order = target.length;
      const replaced = state.tasks.map((task) =>
        task.id === replacement.id ? replacement : task
      );
      return {
        ...state,
        tasks: reindexStatuses(
          replaced,
          new Map([
            [previous.status, source],
            [replacement.status, [...target, replacement]],
          ])
        ),
      };
    }
    case "delete": {
      const task = state.tasks.find((candidate) => candidate.id === action.id);
      if (!task) {
        return state;
      }
      const tasks = state.tasks.filter(
        (candidate) => candidate.id !== action.id
      );
      return {
        ...state,
        tasks: reindexStatuses(
          tasks,
          new Map([[task.status, tasksInStatus(tasks, task.status)]])
        ),
      };
    }
    case "move": {
      const moving = state.tasks.find((task) => task.id === action.id);
      if (!moving || action.beforeId === moving.id) {
        return state;
      }
      const target = tasksInStatus(state.tasks, action.status, moving.id);
      let insertionIndex = target.length;
      if (action.beforeId !== undefined) {
        insertionIndex = target.findIndex(
          (task) => task.id === action.beforeId
        );
        // A supplied anchor is exact: stale or cross-column IDs must not turn into an append.
        if (insertionIndex < 0) {
          return state;
        }
      }
      const nextTarget = [...target];
      nextTarget.splice(insertionIndex, 0, moving);
      const currentTargetIds = tasksInStatus(state.tasks, action.status).map(
        (task) => task.id
      );
      const nextTargetIds = nextTarget.map((task) => task.id);
      if (
        moving.status === action.status &&
        currentTargetIds.length === nextTargetIds.length &&
        currentTargetIds.every((id, index) => id === nextTargetIds[index])
      ) {
        return state;
      }

      const orderings = new Map<TaskStatus, readonly BoardTask[]>([
        [action.status, nextTarget],
      ]);
      if (moving.status !== action.status) {
        orderings.set(
          moving.status,
          tasksInStatus(state.tasks, moving.status, moving.id)
        );
      }
      const timestampedTasks =
        action.now === undefined
          ? state.tasks
          : state.tasks.map((task) => {
              return task.id === moving.id
                ? {
                    ...task,
                    updatedAt: Math.max(
                      action.now!,
                      task.createdAt,
                      task.updatedAt
                    ),
                  }
                : task;
            });
      return { ...state, tasks: reindexStatuses(timestampedTasks, orderings) };
    }
    case "hydrate": {
      return {
        tasks: action.tasks.map(cloneTask),
        warning: action.warning ?? null,
      };
    }
  }
}

export const taskBoardReducer = boardReducer;
