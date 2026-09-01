// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test"
import { act as reactAct } from "react"

import {
  activateDom,
  button,
  dom,
  flush,
  mount,
  waitFor,
} from "./domTestHarness"

activateDom()
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { ToastProvider } = await import("../src/ui/toast")
const { I18nProvider } = await import("../src/i18n")
const { Simulate } = await import("react-dom/test-utils")
const {
  TASKBOARD_SNAPSHOT_VERSION,
  TASKBOARD_STORAGE_KEY,
  createBoardTask,
} = await import("../src/taskboard/taskBoard")
const { TaskBoardPage } = await import("../src/taskboard/TaskBoardPage")

const mountedRoots = []
const previousLocalStorage = globalThis.localStorage
const previousResizeObserver = globalThis.ResizeObserver
const originalConfirm = dom.window.confirm

function installStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: dom.window.localStorage,
  })
}

afterEach(async () => {
  for (const mounted of mountedRoots.splice(0)) {
    await reactAct(async () => mounted.unmount())
  }
  await flush()
  dom.document.body.replaceChildren()
  dom.window.localStorage.clear()
  dom.window.confirm = originalConfirm
  if (previousResizeObserver === undefined) delete globalThis.ResizeObserver
  else globalThis.ResizeObserver = previousResizeObserver
  if (previousLocalStorage === undefined) delete globalThis.localStorage
  else {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousLocalStorage,
    })
  }
})

async function renderBoard(props = {}, locale = "zh-CN", preserveResizeObserver = false) {
  activateDom()
  installStorage()
  if (!preserveResizeObserver) delete globalThis.ResizeObserver
  dom.window.localStorage.setItem("codetwo.language", locale)
  const mounted = mount(
    <I18nProvider>
      <ToastProvider>
        <TaskBoardPage loadPullRequest={async () => null} {...props} />
      </ToastProvider>
    </I18nProvider>,
  )
  mountedRoots.push(mounted)
  await flush()
  return mounted
}

async function setValue(element, value) {
  await reactAct(async () => {
    element.value = value
    Simulate.change(element, { target: { value } })
  })
  await flush()
}

async function click(element) {
  await reactAct(async () => {
    element.click()
  })
  await flush()
}

async function keyDown(element, key) {
  await reactAct(async () => {
    Simulate.keyDown(element, { key })
  })
  await flush()
}

async function openMenu(trigger) {
  await reactAct(async () => {
    trigger.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      }),
    )
    trigger.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
    )
  })
  await flush()
}

function menuItem(label) {
  return Array.from(
    dom.document.body.querySelectorAll('[data-slot="dropdown-menu-item"]'),
  ).find((item) => item.textContent?.replace(/\s+/g, " ").trim() === label)
}

function storeTasks(tasks) {
  installStorage()
  dom.window.localStorage.setItem(
    TASKBOARD_STORAGE_KEY,
    JSON.stringify({ version: TASKBOARD_SNAPSHOT_VERSION, tasks }),
  )
}

function githubPullRequest(number, options = {}) {
  return {
    number,
    url: `https://github.com/acme/repo/pull/${number}`,
    state: "OPEN",
    mergeable: "MERGEABLE",
    merge_state_status: "CLEAN",
    checks: [],
    ...options,
  }
}

describe("TaskBoardPage rendered", () => {
  test("renders the sidebar recovery action supplied by the persistent shell", async () => {
    const view = await renderBoard({
      headerLeadingAction: <button aria-label="展开侧栏" />,
    })

    expect(view.container.querySelector('button[aria-label="展开侧栏"]')).not.toBeNull()
  })

  test("renders the accepted flat Task list and persistent inspector", async () => {
    const view = await renderBoard()

    expect(view.container.querySelector("h1")?.textContent).toBe("全部任务")
    expect(view.container.textContent).toContain("每个 Session 最多对应一个当前 pull request")
    expect(view.container.querySelector("[data-task-board-page]")).not.toBeNull()
    expect(view.container.querySelectorAll("[data-task-column]")).toHaveLength(0)
    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(9)
    expect(view.container.querySelector('[aria-label="任务列表"]')?.getAttribute("tabindex")).toBe("0")
    expect(view.container.querySelector('[aria-label="任务检查器"]')).not.toBeNull()
    expect(view.container.textContent).toContain("标题Sessions打开的 PR更新时间")
  })

  test("switches to the existing needs-you projection and selects from its visible tasks", async () => {
    const view = await renderBoard()
    const attentionView = button(view.container, "有 2 项任务需要你处理")

    expect(attentionView.getAttribute("aria-pressed")).toBe("false")
    await click(attentionView)

    expect(view.container.querySelector("h1")?.textContent).toBe("需要你处理")
    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(2)
    expect(view.container.textContent).toContain("审阅移动端看板布局")
    expect(view.container.textContent).toContain("验证跨列拖拽顺序")
    expect(view.container.textContent).not.toContain("接入任务本地持久化")
    expect(
      view.container.querySelector('[data-task-row="seed-review-mobile-layout"]')?.getAttribute("data-selected"),
    ).toBe("true")
    expect(attentionView.getAttribute("aria-pressed")).toBe("true")

    await click(button(view.container, "全部任务"))
    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(9)
  })

  test("explains when the needs-you projection is empty", async () => {
    const task = createBoardTask(
      { title: "无需处理", status: "todo" },
      { id: "TASK-QUIET", now: 1_700_000_000_000 },
    )
    storeTasks([task])
    const view = await renderBoard()

    await click(button(view.container, "有 0 项任务需要你处理"))

    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(0)
    expect(view.container.textContent).toContain("当前没有需要你处理的任务")
  })

  test("keeps a large persisted list progressive on first render", async () => {
    const statuses = ["todo", "in_progress", "in_review", "done"]
    const tasks = Array.from({ length: 160 }, (_, index) =>
      createBoardTask(
        {
          title: `Large board task ${index}`,
          status: statuses[index % statuses.length],
        },
        { id: `TASK-LARGE-${index}`, now: 1_700_000_000_000 + index },
      ),
    )
    storeTasks(tasks)

    const view = await renderBoard()
    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(40)
    expect(view.container.textContent).toContain("还有 40 项")

    await click(button(view.container, "还有 40 项"))
    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(80)
  })

  test("uses the selected language for workspace chrome and starter content", async () => {
    const view = await renderBoard({}, "en")

    expect(view.container.querySelector("h1")?.textContent).toBe("All tasks")
    expect(view.container.textContent).toContain("Confirm the task workflow")
    expect(view.container.textContent).toContain("Each Session owns at most one current pull request")
    expect(view.container.textContent).not.toContain("任务看板")
  })

  test("validates, creates, renders, and persists a new task", async () => {
    const view = await renderBoard()
    await click(button(view.container, "新建任务"))

    await click(button(dom.document.body, "创建任务"))
    expect(dom.document.body.textContent).toContain("请输入任务标题")

    const title = dom.document.body.querySelector(
      'input[placeholder="例如：完善任务筛选体验"]',
    )
    const description = dom.document.body.querySelector(
      'textarea[placeholder="补充背景、验收标准或实现提示…"]',
    )
    await setValue(title, "完成渲染测试")
    await setValue(description, "覆盖创建流程与本地保存。")
    await click(button(dom.document.body, "创建任务"))

    await waitFor(() => {
      expect(view.container.textContent).toContain("完成渲染测试")
      expect(dom.document.body.querySelector('[data-slot="dialog-content"]')).toBeNull()
    })
    const snapshot = JSON.parse(dom.window.localStorage.getItem(TASKBOARD_STORAGE_KEY))
    expect(snapshot.tasks.some((task) => task.title === "完成渲染测试")).toBe(true)
  })

  test("keeps Session management out of the Task editor", async () => {
    const task = createBoardTask(
      { title: "保持独立的历史任务", status: "todo" },
      { id: "TASK-2000", now: 1_700_000_000_000 },
    )
    storeTasks([task])
    const view = await renderBoard()

    await openMenu(view.container.querySelector('[aria-label="任务操作：保持独立的历史任务"]'))
    await click(menuItem("编辑任务"))
    expect(dom.document.body.textContent).not.toContain("关联会话")
  })

  test("starts a Task without a Session from its expanded row", async () => {
    const task = createBoardTask(
      { title: "开始待办任务", status: "todo" },
      { id: "TASK-2000", now: 1_700_000_000_000 },
    )
    storeTasks([task])
    const started = []
    const view = await renderBoard({ onStartTask: (selected) => started.push(selected.id) })

    await click(button(view.container, "展开任务：开始待办任务"))
    await click(button(view.container, "开始任务"))
    expect(started).toEqual(["TASK-2000"])
  })

  test("shows newest-first Session history and scopes worktrees and PRs per Session", async () => {
    const task = createBoardTask(
      {
        title: "优化任务管理",
        status: "in_progress",
        sessionIds: ["session-old", "session-current"],
      },
      { id: "TASK-SESSIONS", now: 1_700_000_000_000 },
    )
    storeTasks([task])
    const loadedPaths = []
    const opened = []
    const view = await renderBoard({
      sessions: [
        {
          id: "session-old",
          title: "历史实现",
          archived: true,
          cwd: "/repo",
          worktreePath: "/worktrees/session-old",
          createdAt: 1_700_000_000_000,
        },
        {
          id: "session-current",
          title: "当前实现",
          cwd: "/repo",
          worktreePath: "/worktrees/session-current",
          createdAt: 1_700_100_000_000,
          activity: { revision: 1, state: { kind: "running", turn_id: "turn-1" } },
        },
      ],
      loadPullRequest: async (path) => {
        loadedPaths.push(path)
        return githubPullRequest(path.endsWith("session-current") ? 102 : 101)
      },
      onOpenSession: (id) => opened.push(id),
    })

    await click(button(view.container, "展开任务：优化任务管理"))
    await waitFor(() => expect(view.container.textContent).toContain("#102 · 未合并"))

    const rows = Array.from(view.container.querySelectorAll("[data-task-session]"))
    expect(rows.map((row) => row.getAttribute("data-task-session"))).toEqual([
      "session-current",
      "session-old",
    ])
    expect(rows[0]?.textContent).toContain("S-2 · 当前实现当前")
    expect(rows[0]?.textContent).toContain("worktrees/session-current")
    expect(rows[0]?.textContent).toContain("#102")
    expect(rows[1]?.textContent).toContain("S-1 · 历史实现已归档")
    expect(rows[1]?.textContent).toContain("#101")
    expect(new Set(loadedPaths)).toEqual(new Set([
      "/worktrees/session-old",
      "/worktrees/session-current",
    ]))

    await click(button(view.container, "选择 Session 1：历史实现"))
    const inspector = view.container.querySelector('[aria-label="任务检查器"]')
    expect(inspector?.textContent).toContain("S-1 · 历史实现")
    await click(button(inspector, "详情"))
    expect(inspector?.textContent).toContain("#101 · 未合并")
    expect(inspector?.textContent).toContain("worktrees/session-old")
    await click(button(inspector, "Agent"))
    await click(button(inspector, "打开 Session"))
    expect(opened).toEqual(["session-old"])
  })

  test("moves an Inspector prompt into the selected Session", async () => {
    const task = createBoardTask(
      { title: "继续执行", status: "in_progress", sessionIds: ["session-1"] },
      { id: "TASK-PROMPT", now: 1_700_000_000_000 },
    )
    storeTasks([task])
    const prompts = []
    const view = await renderBoard({
      sessions: [{ id: "session-1", title: "执行", cwd: "/repo" }],
      onOpenSession: () => {},
      onAskSession: (id, prompt) => {
        prompts.push([id, prompt])
        return true
      },
    })

    const prompt = view.container.querySelector('textarea[placeholder="添加提示并在这个 Session 中继续…"]')
    await setValue(prompt, "检查这个方案")
    await click(button(view.container, "带提示继续"))
    expect(prompts).toEqual([["session-1", "检查这个方案"]])
    expect(prompt.value).toBe("")
  })

  test("previews a bounded transcript before exposing the existing fork and split actions", async () => {
    const task = createBoardTask(
      { title: "预览后操作", status: "in_progress", sessionIds: ["session-preview"] },
      { id: "TASK-PREVIEW", now: 1_700_000_000_000 },
    )
    storeTasks([task])
    const forks = []
    const splits = []
    const view = await renderBoard({
      sessions: [{ id: "session-preview", title: "实现预览", cwd: "/repo" }],
      loadTranscript: async () => ({
        entries: [
          { seq: 10, role: "user", text: "检查现有交互" },
          { seq: 11, role: "agent", text: "已完成第一轮检查。" },
        ],
        latestTurnSeq: 10,
      }),
      onForkSession: (...args) => forks.push(args),
      onSplitSession: (...args) => splits.push(args),
    })

    await waitFor(() => expect(view.container.textContent).toContain("已完成第一轮检查。"))
    expect(view.container.textContent).not.toContain("洞察")
    await click(button(view.container, "从预览分叉"))
    await click(button(view.container, "向右分屏"))
    await click(button(view.container, "向下分屏"))

    expect(forks).toEqual([["session-preview", 10, "实现预览"]])
    expect(splits).toEqual([
      ["session-preview", "right"],
      ["session-preview", "bottom"],
    ])
  })

  test("answers a permission inline and advances only after Core accepts it", async () => {
    const first = createBoardTask(
      { title: "第一项授权", status: "in_progress", order: 0, sessionIds: ["session-1"] },
      { id: "TASK-PERMISSION-1", now: 1_700_000_000_000 },
    )
    const second = createBoardTask(
      { title: "第二项授权", status: "in_progress", order: 1, sessionIds: ["session-2"] },
      { id: "TASK-PERMISSION-2", now: 1_700_000_000_001 },
    )
    storeTasks([first, second])
    const activity = (inputId, title) => ({
      revision: 1,
      state: {
        kind: "awaiting_input",
        turn_id: `turn-${inputId}`,
        pending: [{ input_id: inputId, kind: "permission", title, options: [["allow", "允许"]], sequence: 1 }],
      },
    })
    const pendingInputs = [
      { session: "session-1", requestId: "input-1", title: "允许修改文件？", options: [["allow", "允许"]] },
      { session: "session-2", requestId: "input-2", title: "允许运行检查？", options: [["allow", "允许"]] },
    ]
    let accepted = false
    const answers = []
    const view = await renderBoard({
      sessions: [
        { id: "session-1", title: "实现一", activity: activity("input-1", "允许修改文件？") },
        { id: "session-2", title: "实现二", activity: activity("input-2", "允许运行检查？") },
      ],
      pendingInputs,
      onAnswerPermission: async (request, optionId) => {
        answers.push([request.requestId, optionId])
        return accepted
      },
    })

    expect(view.container.textContent).toContain("允许修改文件？")
    await click(button(view.container, "允许"))
    expect(view.container.querySelector('[data-task-row="TASK-PERMISSION-1"]')?.getAttribute("data-selected")).toBe("true")

    accepted = true
    await click(button(view.container, "允许"))
    expect(view.container.querySelector('[data-task-row="TASK-PERMISSION-2"]')?.getAttribute("data-selected")).toBe("true")
    expect(view.container.textContent).toContain("允许运行检查？")
    expect(answers).toEqual([
      ["input-1", "allow"],
      ["input-1", "allow"],
    ])
  })

  test("preserves an inline question draft when Core rejects the answer", async () => {
    const task = createBoardTask(
      { title: "回答问题", status: "in_progress", sessionIds: ["session-question"] },
      { id: "TASK-QUESTION", now: 1_700_000_000_000 },
    )
    storeTasks([task])
    const request = {
      session: "session-question",
      requestId: "question-1",
      title: "选择方案",
      options: [],
      form: {
        message: "说明选择原因",
        fields: [{ key: "reason", kind: "text", title: "原因", required: true }],
      },
    }
    const answers = []
    const view = await renderBoard({
      sessions: [{
        id: "session-question",
        title: "问答实现",
        activity: {
          revision: 1,
          state: {
            kind: "awaiting_input",
            turn_id: "turn-question",
            pending: [{ input_id: "question-1", kind: "elicitation", title: "选择方案", options: [], sequence: 1, form: request.form }],
          },
        },
      }],
      pendingInputs: [request],
      onAnswerElicitation: async (_pending, answer) => {
        answers.push(answer)
        return false
      },
    })
    const input = view.container.querySelector('input[aria-label="原因"]')
    await reactAct(async () => {
      input.value = "保留现有架构"
      Simulate.input(input, { target: { value: "保留现有架构" } })
    })
    await flush()
    await click(button(view.container, "提交"))

    expect(input.value).toBe("保留现有架构")
    expect(view.container.textContent).toContain("说明选择原因")
    expect(answers).toEqual([{ action: "accept", content: { reason: "保留现有架构" } }])
  })

  test("uses contextual list shortcuts without intercepting the Session prompt field", async () => {
    const first = createBoardTask(
      { title: "键盘任务一", status: "in_progress", order: 0, sessionIds: ["session-key-1"] },
      { id: "TASK-KEY-1", now: 1_700_000_000_000 },
    )
    const second = createBoardTask(
      { title: "键盘任务二", status: "in_progress", order: 1, sessionIds: ["session-key-2"] },
      { id: "TASK-KEY-2", now: 1_700_000_000_001 },
    )
    storeTasks([first, second])
    const opened = []
    const view = await renderBoard({
      sessions: [
        { id: "session-key-1", title: "键盘一" },
        { id: "session-key-2", title: "键盘二" },
      ],
      onOpenSession: (id) => opened.push(id),
      onAskSession: async () => true,
    })
    const firstControl = view.container.querySelector('[data-task-select="TASK-KEY-1"]')
    firstControl.focus()
    await keyDown(firstControl, "j")
    expect(view.container.querySelector('[data-task-row="TASK-KEY-2"]')?.getAttribute("data-selected")).toBe("true")

    await click(button(view.container, "隐藏检查器"))
    await keyDown(firstControl, " ")
    expect(view.container.querySelector("[data-task-board-page]")?.getAttribute("data-inspector-open")).toBe("true")

    const prompt = view.container.querySelector('textarea[placeholder="添加提示并在这个 Session 中继续…"]')
    await keyDown(prompt, "k")
    expect(view.container.querySelector('[data-task-row="TASK-KEY-2"]')?.getAttribute("data-selected")).toBe("true")

    await keyDown(firstControl, "Enter")
    expect(opened).toEqual(["session-key-2"])
    expect(view.container.textContent).toContain("↑↓ / J K")
    expect(view.container.textContent).toContain("Space")
  })

  test("loads a selected historical Session PR beyond the initial lookup cap", async () => {
    const sessionIds = Array.from({ length: 49 }, (_, index) => `session-${index + 1}`)
    const task = createBoardTask(
      { title: "大型历史", status: "in_progress", sessionIds },
      { id: "TASK-LARGE-HISTORY", now: 1_700_000_000_000 },
    )
    storeTasks([task])
    const loadedPaths = []
    let resolveSelectedPullRequest = null
    const view = await renderBoard({
      sessions: sessionIds.map((id, index) => ({
        id,
        title: `历史 ${index + 1}`,
        worktreePath: `/worktrees/${id}`,
      })),
      loadPullRequest: async (path) => {
        loadedPaths.push(path)
        if (path === "/worktrees/session-1") {
          return new Promise((resolve) => {
            resolveSelectedPullRequest = () => resolve(githubPullRequest(1))
          })
        }
        return githubPullRequest(Number(path.match(/\d+$/)?.[0] ?? 0))
      },
    })

    await waitFor(() => expect(new Set(loadedPaths).size).toBe(48))
    expect(loadedPaths).not.toContain("/worktrees/session-1")
    await click(button(view.container, "展开任务：大型历史"))
    await click(button(view.container, "选择 Session 1：历史 1"))
    await click(button(view.container, "详情"))

    await waitFor(() => expect(loadedPaths).toContain("/worktrees/session-1"))
    expect(view.container.querySelector('[aria-label="任务检查器"]')?.textContent).toContain("正在检查 PR…")
    expect(view.container.querySelector('[aria-label="任务检查器"]')?.textContent).not.toContain("这个 Session 的检出目录没有当前 pull request。")
    await reactAct(async () => resolveSelectedPullRequest?.())
    await waitFor(() => expect(
      view.container.querySelector('[aria-label="任务检查器"]')?.textContent,
    ).toContain("#1 · 未合并"))
  })

  test("searches from the Filter popover and clears the query", async () => {
    const view = await renderBoard()
    await click(button(view.container, "筛选"))
    const search = dom.document.body.querySelector('input[aria-label="搜索任务"]')
    await setValue(search, "本地持久化")

    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(1)
    expect(view.container.textContent).toContain("接入任务本地持久化")
    expect(view.container.textContent).not.toContain("确认任务流转规则")

    await click(button(dom.document.body, "清除搜索"))
    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(9)
  })

  test("filters Tasks by priority and clears the active facet", async () => {
    const view = await renderBoard()
    await click(button(view.container, "筛选"))
    const urgentLabel = Array.from(dom.document.body.querySelectorAll("label")).find(
      (label) => label.textContent?.trim() === "紧急",
    )
    const urgentCheckbox = urgentLabel?.querySelector('[role="checkbox"]')
    await reactAct(async () => Simulate.click(urgentCheckbox))
    await flush()

    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(1)
    expect(view.container.textContent).toContain("接入任务本地持久化")

    await click(button(dom.document.body, "清除筛选"))
    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(9)
  })

  test("offers to clear filters when a newly created Task is hidden", async () => {
    const view = await renderBoard()
    await click(button(view.container, "筛选"))
    const search = dom.document.body.querySelector('input[aria-label="搜索任务"]')
    await setValue(search, "不会匹配新任务")
    await click(button(view.container, "新建任务"))
    const title = dom.document.body.querySelector(
      'input[placeholder="例如：完善任务筛选体验"]',
    )
    await setValue(title, "隐藏后可找回的任务")
    await click(button(dom.document.body, "创建任务"))

    expect(view.container.querySelectorAll("[data-task-item]")).toHaveLength(0)
    const toast = Array.from(dom.document.body.querySelectorAll('[role="status"]')).find(
      (status) => status.textContent?.includes("但它被当前筛选隐藏"),
    )
    expect(toast).toBeTruthy()
    await click(button(toast, "清除筛选"))
    expect(view.container.textContent).toContain("隐藏后可找回的任务")
  })

  test("offers to leave the needs-you view when it hides a newly created Task", async () => {
    const view = await renderBoard()
    await click(button(view.container, "有 2 项任务需要你处理"))
    await click(button(view.container, "新建任务"))
    const title = dom.document.body.querySelector(
      'input[placeholder="例如：完善任务筛选体验"]',
    )
    await setValue(title, "稍后处理的新任务")
    await click(button(dom.document.body, "创建任务"))

    expect(view.container.querySelector('[aria-label="任务操作：稍后处理的新任务"]')).toBeNull()
    const toast = Array.from(dom.document.body.querySelectorAll('[role="status"]')).find(
      (status) => status.textContent?.includes("但它被当前筛选隐藏"),
    )
    expect(toast).toBeTruthy()
    await click(button(toast, "清除筛选"))
    expect(view.container.querySelector("h1")?.textContent).toBe("全部任务")
    expect(view.container.textContent).toContain("稍后处理的新任务")
  })

  test("moves a Task from its menu and persists the stage", async () => {
    const view = await renderBoard()
    const trigger = view.container.querySelector(
      '[aria-label="任务操作：完善空状态与操作提示"]',
    )
    await openMenu(trigger)
    await click(menuItem('移动到“已完成”'))

    const snapshot = JSON.parse(dom.window.localStorage.getItem(TASKBOARD_STORAGE_KEY))
    expect(
      snapshot.tasks.find((task) => task.title === "完善空状态与操作提示").status,
    ).toBe("done")
  })

  test("asks before deleting and persists only a confirmed deletion", async () => {
    const view = await renderBoard()
    const taskTitle = "完善空状态与操作提示"
    let message = ""
    dom.window.confirm = (value) => {
      message = value
      return false
    }

    const openTaskMenu = async () => {
      const trigger = view.container.querySelector(`[aria-label="任务操作：${taskTitle}"]`)
      await openMenu(trigger)
    }

    await openTaskMenu()
    await click(menuItem("删除任务"))
    expect(message).toBe(`确定删除“${taskTitle}”？此操作无法撤销。`)
    expect(view.container.textContent).toContain(taskTitle)

    dom.window.confirm = () => true
    await openTaskMenu()
    await click(menuItem("删除任务"))
    expect(view.container.querySelector(`[aria-label="任务操作：${taskTitle}"]`)).toBeNull()
    const snapshot = JSON.parse(dom.window.localStorage.getItem(TASKBOARD_STORAGE_KEY))
    expect(snapshot.tasks.some((task) => task.title === taskTitle)).toBe(false)
  })

  test("can deliberately continue a linked Task in a fresh Session", async () => {
    const task = createBoardTask(
      {
        title: "继续历史任务",
        status: "todo",
        sessionIds: ["session-1"],
      },
      { id: "TASK-2002", now: 1_700_000_000_000 },
    )
    storeTasks([task])
    const started = []
    const view = await renderBoard({
      sessions: [{ id: "session-1", title: "旧会话" }],
      onStartTask: (selected) => started.push(selected.id),
    })

    await openMenu(view.container.querySelector('[aria-label="任务操作：继续历史任务"]'))
    await click(menuItem("在新会话中继续"))
    expect(started).toEqual(["TASK-2002"])
  })

  test("closes and restores the Inspector without losing selection", async () => {
    const view = await renderBoard()
    const page = view.container.querySelector("[data-task-board-page]")

    await click(button(view.container, "隐藏检查器"))
    expect(page?.getAttribute("data-inspector-open")).toBe("false")
    const showInspector = button(view.container, "显示检查器")
    showInspector.focus()
    await click(showInspector)
    expect(page?.getAttribute("data-inspector-open")).toBe("true")
  })

  test("keeps Task expansion in the list and uses the shared modal for the narrow Inspector", async () => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      disconnect() {}
    }
    const view = await renderBoard({}, "zh-CN", true)
    const page = view.container.querySelector("[data-task-board-page]")

    expect(page?.getAttribute("data-inspector-open")).toBe("false")
    await click(button(view.container, "展开任务：确认任务流转规则"))
    expect(page?.getAttribute("data-inspector-open")).toBe("false")

    const showInspector = button(view.container, "显示检查器")
    await click(showInspector)
    const dialog = dom.document.body.querySelector('[data-slot="dialog-content"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute("role")).toBe("dialog")
    expect(view.container.querySelector(".task-board-workspace")?.hasAttribute("inert")).toBe(true)
    expect(dialog?.contains(dom.document.activeElement)).toBe(true)

    await click(button(dom.document.body, "隐藏检查器"))
    expect(page?.getAttribute("data-inspector-open")).toBe("false")
    await waitFor(() => expect(dom.document.activeElement).toBe(button(view.container, "显示检查器")))
  })
})
