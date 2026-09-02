import { useEffect, useState } from "react"

import type { ProjectedTask } from "./workspaceTypes"

export function useTaskBoardSelection(
  allTasks: readonly ProjectedTask[],
  visibleTasks: readonly ProjectedTask[],
) {
  const [expandedTaskIds, setExpandedTaskIds] = useState<ReadonlySet<string>>(() => new Set())
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const selectedProjectedTask = allTasks.find(({ task }) => task.id === selectedTaskId)
    ?? visibleTasks[0]
    ?? allTasks[0]
    ?? null
  const selectedTask = selectedProjectedTask?.task ?? null
  const selectedSession = selectedProjectedTask?.sessions.find(({ id }) => id === selectedSessionId)
    ?? selectedProjectedTask?.currentSession
    ?? selectedProjectedTask?.sessions[0]
    ?? null

  useEffect(() => {
    if (!selectedProjectedTask) {
      if (selectedTaskId !== null) setSelectedTaskId(null)
      if (selectedSessionId !== null) setSelectedSessionId(null)
      return
    }
    if (selectedTaskId !== selectedProjectedTask.task.id) {
      setSelectedTaskId(selectedProjectedTask.task.id)
    }
    const nextSessionId = selectedSession?.id ?? null
    if (selectedSessionId !== nextSessionId) setSelectedSessionId(nextSessionId)
  }, [selectedProjectedTask, selectedSession, selectedSessionId, selectedTaskId])

  return {
    expandedTaskIds,
    selectedTaskId,
    selectedSessionId,
    selectedTask,
    selectedSession,
    setExpandedTaskIds,
    setSelectedTaskId,
    setSelectedSessionId,
  }
}
