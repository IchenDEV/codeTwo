import { useEffect, useState } from "react";

import type { ProjectedTask } from "./workspaceTypes";

export function useTaskBoardSelection(
  allTasks: readonly ProjectedTask[],
  visibleTasks: readonly ProjectedTask[]
) {
  const [expandedTaskIds, setExpandedTaskIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const selectedProjectedTask =
    allTasks.find(({ task }) => task.id === selectedTaskId) ??
    visibleTasks[0] ??
    allTasks[0] ??
    null;
  const selectedTask = selectedProjectedTask?.task ?? null;
  const selectedSession =
    selectedProjectedTask?.sessions.find(
      ({ id }) => id === selectedSessionId
    ) ??
    selectedProjectedTask?.currentSession ??
    selectedProjectedTask?.sessions[0] ??
    null;

  useEffect(() => {
    if (selectedProjectedTask == null) {
      if (selectedTaskId !== null) setSelectedTaskId(null);
      if (selectedSessionId !== null) setSelectedSessionId(null);
      return;
    }
    // The Inspector falls back to the first visible Task, but the board and list only highlight a
    // Task the user actually picked: the fallback is never written into the selection, and a
    // deleted selection is dropped instead of jumping to another row.
    if (
      selectedTaskId !== null &&
      !allTasks.some(({ task }) => task.id === selectedTaskId)
    ) {
      setSelectedTaskId(null);
    }
    const nextSessionId = selectedSession?.id ?? null;
    if (selectedSessionId !== nextSessionId)
      setSelectedSessionId(nextSessionId);
  }, [
    allTasks,
    selectedProjectedTask,
    selectedSession,
    selectedSessionId,
    selectedTaskId,
  ]);

  return {
    expandedTaskIds,
    selectedTaskId,
    selectedSessionId,
    selectedTask,
    selectedSession,
    setExpandedTaskIds,
    setSelectedTaskId,
    setSelectedSessionId,
  };
}
