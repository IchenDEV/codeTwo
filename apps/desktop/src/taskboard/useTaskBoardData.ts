import { useDeferredValue, useEffect, useMemo, useReducer, useRef } from "react"

import type { Locale, Translate } from "@/i18n"
import { useToast } from "@/ui/toast"

import {
  boardLabels,
  boardReducer,
  CORRUPT_BOARD_WARNING,
  filterBoardTasks,
  LOAD_BOARD_WARNING,
  loadBoardSnapshot,
  SAVE_BOARD_WARNING,
  saveBoardSnapshot,
  sortBoardTasks,
  type BoardFilters,
  type TaskPriority,
} from "./taskBoard"
import { projectTasks } from "./workspaceModel"
import type { SessionProjection, TaskBoardSession } from "./workspaceTypes"

function warningText(warning: string, t: Translate): string {
  if (warning === CORRUPT_BOARD_WARNING) return t("taskboard.warning.corrupt")
  if (warning === LOAD_BOARD_WARNING) return t("taskboard.warning.load")
  if (warning === SAVE_BOARD_WARNING) return t("taskboard.warning.save")
  return warning
}

export function useTaskBoardData(
  locale: Locale,
  t: Translate,
  sessions: readonly TaskBoardSession[],
  query: string,
  priorities: readonly TaskPriority[],
  labels: readonly string[],
) {
  const toast = useToast()
  const [state, dispatch] = useReducer(
    boardReducer,
    undefined,
    () => loadBoardSnapshot(undefined, locale),
  )
  const didMount = useRef(false)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    if (state.warning) toast(warningText(state.warning, t), "error")
  }, [state.warning, t, toast])

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true
      return
    }
    const result = saveBoardSnapshot(state.tasks)
    if (!result.ok) toast(warningText(result.warning, t), "error")
  }, [state.tasks, t, toast])

  const filters: BoardFilters = useMemo(
    () => ({ query: deferredQuery, priorities: [...priorities], labels: [...labels] }),
    [deferredQuery, labels, priorities],
  )
  const visibleTasks = useMemo(
    () => sortBoardTasks(filterBoardTasks(state.tasks, filters)),
    [filters, state.tasks],
  )
  const availableLabels = useMemo(() => boardLabels(state.tasks), [state.tasks])
  const sessionsById = useMemo(
    () => new Map(sessions.map((session) => [
      session.id,
      { ...session, archived: session.archived === true },
    ] satisfies [string, Omit<SessionProjection, "number" | "current">])),
    [sessions],
  )
  const projectedTasks = useMemo(
    () => projectTasks(visibleTasks, sessionsById),
    [sessionsById, visibleTasks],
  )
  const allProjectedTasks = useMemo(
    () => projectTasks(sortBoardTasks(state.tasks), sessionsById),
    [sessionsById, state.tasks],
  )

  return {
    state,
    warning: state.warning ? warningText(state.warning, t) : null,
    dispatch,
    filters,
    projectedTasks,
    allProjectedTasks,
    availableLabels,
    deferredQuery,
    toast,
  }
}
