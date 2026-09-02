import { useEffect, useState } from "react"

import type { TaskBoardView } from "./workspaceTypes"

export const TASKBOARD_VIEW_STORAGE_KEY = "codetwo.taskboard.view.v1"

function loadTaskBoardView(): TaskBoardView {
  try {
    const stored = typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(TASKBOARD_VIEW_STORAGE_KEY)
    return stored === "board" ? "board" : "list"
  } catch {
    return "list"
  }
}

export function useTaskBoardView() {
  const [view, setView] = useState<TaskBoardView>(loadTaskBoardView)

  useEffect(() => {
    try {
      localStorage.setItem(TASKBOARD_VIEW_STORAGE_KEY, view)
    } catch {
      // The preference is optional; the Task data remains available when storage is unavailable.
    }
  }, [view])

  return [view, setView] as const
}
