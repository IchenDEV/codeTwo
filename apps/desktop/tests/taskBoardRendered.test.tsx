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
  associateTaskPullRequest,
  createBoardTask,
} = await import(
  "../src/taskboard/taskBoard"
)
const { TaskBoardPage } = await import("../src/taskboard/TaskBoardPage")

const mountedRoots = []
const previousLocalStorage = globalThis.localStorage
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
  if (previousLocalStorage === undefined) delete globalThis.localStorage
  else {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousLocalStorage,
    })
  }
})

async function renderBoard(props = {}, locale = "zh-CN") {
  activateDom()
  installStorage()
  dom.window.localStorage.setItem("codetwo.language", locale)
  const mounted = mount(
    <I18nProvider>
      <ToastProvider>
        <TaskBoardPage {...props} />
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

async function selectItem(element) {
  await reactAct(async () => {
    element.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      }),
    )
    element.dispatchEvent(
      new dom.window.PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      }),
    )
    element.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
    )
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

async function openSelect(trigger) {
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

describe("TaskBoardPage rendered", () => {
  test("renders the sidebar recovery action supplied by the persistent shell", async () => {
    const view = await renderBoard({
      headerLeadingAction: <button aria-label="展开侧栏" />,
    })

    expect(view.container.querySelector('button[aria-label="展开侧栏"]')).not.toBeNull()
  })

  test("renders the full four-column task board with semantic counts", async () => {
    const view = await renderBoard()

    const header = view.container.querySelector("header")
    const title = header?.querySelector("h1")
    const attention = header?.querySelector("p")
    const controls = header?.querySelector("[data-page-header-controls]")
    const content = header?.querySelector("[data-page-header-content]")
    const board = view.container.querySelector("[data-task-board-columns]")
    const boardContent = view.container.querySelector("[data-task-board-content]")

    expect(title?.textContent).toBe("任务看板")
    expect(title?.className).toContain("text-page")
    expect(title?.className).toContain("tracking-tight")
    expect(attention?.textContent).toContain("有 2 项任务需要你处理")
    expect(header?.className).toContain("py-4")
    expect(header?.className).toContain("px-6")
    expect(content?.className).toContain("grid")
    expect(content?.className).toContain("xl:grid-cols-")
    expect(content?.className).not.toContain("max-w-4xl")
    expect(board?.className).toContain("px-6")
    expect(board?.className).toContain("overflow-auto")
    expect(boardContent?.className).toContain("min-h-full")
    expect(controls?.className).toContain("min-w-0")
    expect(controls?.className).toContain("xl:justify-end")
    expect(view.container.querySelector('button[aria-label="返回"]')).toBeNull()
    const columns = Array.from(
      view.container.querySelectorAll("[data-task-column]"),
    )
    expect(columns.map((column) => column.getAttribute("data-task-column"))).toEqual([
      "queue",
      "running",
      "needs_you",
      "done",
    ])
    expect(columns.every((column) => column.className.includes("min-w-72"))).toBe(true)
    expect(columns.every((column) => column.className.includes("flex-1"))).toBe(true)
    expect(columns.every((column) => !column.className.includes("shrink-0"))).toBe(true)
    expect(columns.map((column) => column.querySelectorAll("[data-task-card]").length)).toEqual([
      3,
      0,
      2,
      2,
    ])
    expect(view.container.querySelectorAll('[draggable="true"]')).toHaveLength(0)
    expect(view.container.textContent).toContain("还有 2 项")
    expect(view.container.textContent).not.toContain("TASK-")
  })

  test("uses the selected language for board chrome and starter content", async () => {
    const view = await renderBoard({}, "en")

    expect(view.container.querySelector("h1")?.textContent).toBe("Task board")
    expect(view.container.textContent).toContain("Confirm the task workflow")
    expect(view.container.textContent).toContain("Queue")
    expect(view.container.textContent).toContain("Needs you")
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
    await flush()

    const snapshot = JSON.parse(dom.window.localStorage.getItem(TASKBOARD_STORAGE_KEY))
    expect(snapshot.tasks.some((task) => task.title === "完成渲染测试")).toBe(true)
  })

  test("keeps session management out of the task editor", async () => {
    installStorage()
    const task = createBoardTask(
      { title: "保持独立的历史任务", status: "todo" },
      { id: "TASK-2000", now: 1_700_000_000_000 },
    )
    dom.window.localStorage.setItem(
      TASKBOARD_STORAGE_KEY,
      JSON.stringify({ version: TASKBOARD_SNAPSHOT_VERSION, tasks: [task] }),
    )
    const view = await renderBoard()

    await click(button(view.container, "编辑任务：保持独立的历史任务"))
    expect(dom.document.body.textContent).not.toContain("关联会话")
  })

  test("starts a task without a live session from its card", async () => {
    installStorage()
    const task = createBoardTask(
      { title: "开始待办任务", status: "todo" },
      { id: "TASK-2000", now: 1_700_000_000_000 },
    )
    dom.window.localStorage.setItem(
      TASKBOARD_STORAGE_KEY,
      JSON.stringify({ version: TASKBOARD_SNAPSHOT_VERSION, tasks: [task] }),
    )
    const started = []
    const view = await renderBoard({ onStartTask: (selected) => started.push(selected.id) })

    await click(button(view.container, "开始任务：开始待办任务"))
    expect(started).toEqual(["TASK-2000"])
  })

  test("projects live sessions into running and attention lanes", async () => {
    installStorage()
    const tasks = [
      createBoardTask({ title: "队列任务", status: "todo" }, { id: "queue", now: 1 }),
      createBoardTask({ title: "运行任务", status: "in_progress", sessionIds: ["running"] }, { id: "running", now: 2 }),
      createBoardTask({ title: "提问任务", status: "in_progress", sessionIds: ["question"] }, { id: "question", now: 3 }),
      createBoardTask({ title: "完成任务", status: "done", sessionIds: ["done"] }, { id: "done", now: 4 }),
    ]
    dom.window.localStorage.setItem(
      TASKBOARD_STORAGE_KEY,
      JSON.stringify({ version: TASKBOARD_SNAPSHOT_VERSION, tasks }),
    )
    const opened = []
    const view = await renderBoard({
      sessions: [
        { id: "running", title: "运行任务", activity: { revision: 1, state: { kind: "running", turn_id: "turn-1" } } },
        {
          id: "question",
          title: "提问任务",
          activity: {
            revision: 2,
            state: {
              kind: "awaiting_input",
              turn_id: "turn-2",
              pending: [{ input_id: "input-1", kind: "elicitation", title: "请选择布局", options: [], sequence: 1 }],
            },
          },
        },
        { id: "done", title: "完成任务" },
      ],
      onOpenSession: (id) => opened.push(id),
      onStartTask: () => {},
    })

    expect(view.container.querySelector('[data-task-column="queue"]')?.textContent).toContain("队列任务")
    expect(view.container.querySelector('[data-task-column="running"]')?.textContent).toContain("运行任务")
    expect(view.container.querySelector('[data-task-column="needs_you"]')?.textContent).toContain("提问任务")
    expect(view.container.querySelector('[data-task-column="done"]')?.textContent).toContain("完成任务")
    expect(view.container.textContent).toContain("有 1 项任务需要你处理")
    expect(view.container.textContent).toContain("请选择布局")
    await click(button(view.container, "回答"))
    expect(opened).toEqual(["question"])
  })

  test("searches the rendered cards and preserves exactly four columns", async () => {
    const view = await renderBoard()
    const search = view.container.querySelector('input[aria-label="搜索任务"]')
    await setValue(search, "本地持久化")
    expect(search.value).toBe("本地持久化")

    expect(view.container.querySelectorAll("[data-task-column]")).toHaveLength(4)
    expect(view.container.querySelectorAll("[data-task-card]")).toHaveLength(1)
    expect(view.container.textContent).toContain("接入任务本地持久化")
    expect(view.container.textContent).not.toContain("确认任务流转规则")
    expect(
      view.container.querySelector('[data-task-column="queue"] header')?.textContent,
    ).toContain("1/5")

    await click(button(view.container, "清除搜索"))
    expect(view.container.querySelectorAll("[data-task-card]")).toHaveLength(7)
  })

  test("filters rendered tasks by priority and clears the active facet", async () => {
    const view = await renderBoard()
    await click(button(view.container, "筛选"))
    const urgentLabel = Array.from(dom.document.body.querySelectorAll("label")).find(
      (label) => label.textContent?.trim() === "紧急",
    )
    const urgentCheckbox = urgentLabel?.querySelector('[role="checkbox"]')
    await reactAct(async () => {
      Simulate.click(urgentCheckbox)
    })
    await flush()
    expect(urgentCheckbox?.hasAttribute("data-checked")).toBe(true)

    expect(view.container.querySelectorAll("[data-task-card]")).toHaveLength(1)
    expect(view.container.textContent).toContain("接入任务本地持久化")
    expect(view.container.textContent).not.toContain("实现看板筛选与搜索")

    await click(button(dom.document.body, "清除筛选"))
    expect(view.container.querySelectorAll("[data-task-card]")).toHaveLength(7)
  })

  test("offers to clear filters when a newly created task is hidden", async () => {
    const view = await renderBoard()
    const search = view.container.querySelector('input[aria-label="搜索任务"]')
    await setValue(search, "不会匹配新任务")
    await click(button(view.container, "新建任务"))
    const title = dom.document.body.querySelector(
      'input[placeholder="例如：完善任务筛选体验"]',
    )
    await setValue(title, "隐藏后可找回的任务")
    await click(button(dom.document.body, "创建任务"))

    expect(view.container.querySelectorAll("[data-task-card]")).toHaveLength(0)
    const toast = Array.from(dom.document.body.querySelectorAll('[role="status"]')).find(
      (status) => status.textContent?.includes("但它被当前筛选隐藏"),
    )
    expect(toast).toBeTruthy()
    await click(button(toast, "清除筛选"))
    expect(view.container.textContent).toContain("隐藏后可找回的任务")
    expect(search.value).toBe("")
  })

  test("moves a task from its menu without requiring drag and persists the result", async () => {
    const view = await renderBoard()
    const trigger = view.container.querySelector(
      '[aria-label="任务操作：完善空状态与操作提示"]',
    )
    await openMenu(trigger)

    const moveToDone = menuItem('移动到“已完成”')
    expect(moveToDone).toBeTruthy()
    await click(moveToDone)

    const done = view.container.querySelector('[data-task-column="done"]')
    expect(done.textContent).toContain("完善空状态与操作提示")
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

  test("opens a linked session from a task card", async () => {
    installStorage()
    const task = createBoardTask(
      {
        title: "继续会话中的实现",
        status: "in_progress",
        sessionIds: ["session-old", "session-1"],
      },
      { id: "TASK-2001", now: 1_700_000_000_000 },
    )
    dom.window.localStorage.setItem(
      TASKBOARD_STORAGE_KEY,
      JSON.stringify({ version: TASKBOARD_SNAPSHOT_VERSION, tasks: [task] }),
    )
    const opened = []
    const view = await renderBoard({
      sessions: [{ id: "session-1", title: "任务看板实现" }],
      onOpenSession: (id) => opened.push(id),
    })

    expect(view.container.textContent).toContain("可继续处理")
    await click(button(view.container, "打开最近会话：继续会话中的实现"))
    expect(opened).toEqual(["session-1"])
  })

  test("can deliberately continue a linked task in a fresh session", async () => {
    installStorage()
    const task = createBoardTask(
      {
        title: "取消会话关联",
        status: "todo",
        sessionIds: ["session-1"],
      },
      { id: "TASK-2002", now: 1_700_000_000_000 },
    )
    dom.window.localStorage.setItem(
      TASKBOARD_STORAGE_KEY,
      JSON.stringify({ version: TASKBOARD_SNAPSHOT_VERSION, tasks: [task] }),
    )
    const started = []
    const view = await renderBoard({
      sessions: [{ id: "session-1", title: "旧会话" }],
      onOpenSession: () => {},
      onStartTask: (selected) => started.push(selected.id),
    })

    const trigger = view.container.querySelector('[aria-label="任务操作：取消会话关联"]')
    await openMenu(trigger)
    await click(menuItem("在新会话中继续"))
    expect(started).toEqual(["TASK-2002"])
  })

  test("renders and explicitly unlinks a durable pull request reference", async () => {
    installStorage()
    const task = createBoardTask(
      { title: "审阅关联的 PR", status: "in_review" },
      { id: "TASK-PR", now: 1_700_000_000_000 },
    )
    const linked = associateTaskPullRequest([task], task.id, {
      provider: "github",
      host: "github.com",
      repository: "acme/repo",
      number: 42,
      url: "https://github.com/acme/repo/pull/42",
    })
    dom.window.localStorage.setItem(
      TASKBOARD_STORAGE_KEY,
      JSON.stringify({ version: TASKBOARD_SNAPSHOT_VERSION, tasks: linked }),
    )
    const view = await renderBoard()

    expect(view.container.textContent).toContain("acme/repo #42")
    const trigger = view.container.querySelector('[aria-label="任务操作：审阅关联的 PR"]')
    await openMenu(trigger)
    await click(menuItem("解除 pull request 关联"))
    await waitFor(() => expect(view.container.textContent).not.toContain("acme/repo #42"))
    const snapshot = JSON.parse(dom.window.localStorage.getItem(TASKBOARD_STORAGE_KEY))
    expect(snapshot.tasks[0]).toMatchObject({
      pullRequest: null,
      pullRequestLinkRevision: 2,
    })
  })
})
