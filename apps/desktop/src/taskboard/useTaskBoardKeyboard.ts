import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  SetStateAction,
} from "react"

import type { BoardTask } from "./taskBoard"
import type {
  InspectorTab,
  ProjectedTask,
  SessionProjection,
} from "./workspaceTypes"

interface TaskBoardKeyboardOptions {
  pageRef: RefObject<HTMLElement | null>
  renderedTasks: readonly ProjectedTask[]
  selectedTask: BoardTask | null
  selectedSession: SessionProjection | null
  setSelectedTaskId: Dispatch<SetStateAction<string | null>>
  setSelectedSessionId: Dispatch<SetStateAction<string | null>>
  setInspectorTab: Dispatch<SetStateAction<InspectorTab>>
  setInspectorOpen: Dispatch<SetStateAction<boolean>>
  onOpenSession?: (id: string) => void
  onStartTask?: (task: BoardTask) => void
}

function shouldIgnoreKey(event: ReactKeyboardEvent<HTMLElement>): boolean {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return true
  const target = event.target as HTMLElement
  if (target.closest("input, textarea, select, [contenteditable='true'], [role='menu'], [role='dialog']")) return true
  return Boolean(target.closest("button, a") && !target.closest("[data-task-select]"))
}

function navigationDirection(key: string): -1 | 1 | null {
  if (key === "arrowdown" || key === "j") return 1
  if (key === "arrowup" || key === "k") return -1
  return null
}

function selectAdjacentTask(
  options: TaskBoardKeyboardOptions,
  direction: -1 | 1,
  focusTaskControl: (taskId: string) => void,
): void {
  if (options.renderedTasks.length === 0) return
  const current = options.renderedTasks.findIndex(({ task }) => task.id === options.selectedTask?.id)
  const index = current < 0
    ? 0
    : Math.min(options.renderedTasks.length - 1, Math.max(0, current + direction))
  const projected = options.renderedTasks[index]
  options.setSelectedTaskId(projected.task.id)
  options.setSelectedSessionId(projected.currentSession?.id ?? projected.sessions[0]?.id ?? null)
  focusTaskControl(projected.task.id)
}

function activateSelection(event: ReactKeyboardEvent<HTMLElement>, options: TaskBoardKeyboardOptions): void {
  if (options.selectedSession && options.onOpenSession) {
    event.preventDefault()
    options.onOpenSession(options.selectedSession.id)
    return
  }
  if (options.selectedTask && options.onStartTask) {
    event.preventDefault()
    options.onStartTask(options.selectedTask)
  }
}

export function useTaskBoardKeyboard(options: TaskBoardKeyboardOptions) {
  const focusTaskControl = (taskId: string): void => {
    window.requestAnimationFrame(() => {
      const controls = options.pageRef.current?.querySelectorAll<HTMLElement>("[data-task-select]") ?? []
      Array.from(controls).find((control) => control.dataset.taskSelect === taskId)?.focus()
    })
  }

  return (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (shouldIgnoreKey(event)) return
    const key = event.key.toLowerCase()
    const direction = navigationDirection(key)
    if (direction) {
      event.preventDefault()
      selectAdjacentTask(options, direction, focusTaskControl)
      return
    }
    if (event.key === " " && !event.repeat) {
      event.preventDefault()
      options.setInspectorTab("agent")
      options.setInspectorOpen(true)
      return
    }
    if (event.key === "Enter" && !event.repeat) activateSelection(event, options)
  }
}
