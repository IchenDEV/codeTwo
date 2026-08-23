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
const { Simulate } = await import("react-dom/test-utils")
const { TASKBOARD_SNAPSHOT_VERSION, TASKBOARD_STORAGE_KEY, createBoardTask } = await import(
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

async function renderBoard(props = {}) {
  activateDom()
  installStorage()
  const mounted = mount(
    <ToastProvider>
      <TaskBoardPage {...props} />
    </ToastProvider>,
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
  test("renders the full four-column task board with semantic counts", async () => {
    const view = await renderBoard()

    const header = view.container.querySelector("header")
    const title = header?.querySelector("h1")
    const description = header?.querySelector("p")
    const controls = header?.querySelector("[data-page-header-controls]")
    const content = header?.querySelector("[data-page-header-content]")
    const board = view.container.querySelector("[data-task-board-columns]")
    const boardContent = view.container.querySelector("[data-task-board-content]")

    expect(title?.textContent).toBe("任务看板")
    expect(title?.className).toContain("text-display")
    expect(title?.className).toContain("tracking-tight")
    expect(description?.className).toContain("mt-2")
    expect(description?.className).toContain("text-ui")
    expect(header?.className).toContain("pt-10")
    expect(header?.className).toContain("sm:pt-14")
    expect(content?.className).toContain("px-6")
    expect(content?.className).toContain("max-w-4xl")
    expect(content?.className).toContain("sm:px-8")
    expect(board?.className).not.toContain("px-6")
    expect(boardContent?.className).toContain("max-w-4xl")
    expect(boardContent?.className).toContain("px-6")
    expect(boardContent?.className).toContain("sm:px-8")
    expect(controls?.className).toContain("mt-8")
    expect(view.container.querySelector('button[aria-label="返回"]')).toBeNull()
    const columns = Array.from(
      view.container.querySelectorAll("[data-task-column]"),
    )
    expect(columns.map((column) => column.getAttribute("data-task-column"))).toEqual([
      "todo",
      "in_progress",
      "in_review",
      "done",
    ])
    expect(columns.map((column) => column.querySelectorAll("[data-task-drop-before]").length)).toEqual([
      3,
      2,
      2,
      2,
    ])
    expect(view.container.querySelectorAll('[draggable="true"]')).toHaveLength(9)
    expect(view.container.querySelectorAll("[data-task-drop-end]")).toHaveLength(4)
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

    await click(button(view.container, "保持独立的历史任务"))
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

    await click(button(view.container, "开始任务"))
    expect(started).toEqual(["TASK-2000"])
  })

  test("searches the rendered cards and preserves exactly four columns", async () => {
    const view = await renderBoard()
    const search = view.container.querySelector('input[aria-label="搜索任务"]')
    await setValue(search, "本地持久化")
    expect(search.value).toBe("本地持久化")

    expect(view.container.querySelectorAll("[data-task-column]")).toHaveLength(4)
    expect(view.container.querySelectorAll("[data-task-drop-before]")).toHaveLength(1)
    expect(view.container.textContent).toContain("接入任务本地持久化")
    expect(view.container.textContent).not.toContain("确认任务流转规则")
    expect(
      view.container.querySelector('[data-task-column="in_progress"] header')?.textContent,
    ).toContain("1/2")

    await click(button(view.container, "清除搜索"))
    expect(view.container.querySelectorAll("[data-task-drop-before]")).toHaveLength(9)
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

    expect(view.container.querySelectorAll("[data-task-drop-before]")).toHaveLength(1)
    expect(view.container.textContent).toContain("接入任务本地持久化")
    expect(view.container.textContent).not.toContain("实现看板筛选与搜索")

    await click(button(dom.document.body, "清除筛选"))
    expect(view.container.querySelectorAll("[data-task-drop-before]")).toHaveLength(9)
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

    expect(view.container.querySelectorAll("[data-task-drop-before]")).toHaveLength(0)
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

    expect(view.container.textContent).toContain("2 个会话")
    await click(button(view.container, "继续任务"))
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
})
