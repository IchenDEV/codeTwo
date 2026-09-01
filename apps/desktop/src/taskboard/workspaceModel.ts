import type { Locale, Translate } from "@/i18n"
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus"

import { taskBoardLane, type BoardTask, type TaskSessionActivityKind } from "./taskBoard"
import type { ProjectedTask, SessionProjection } from "./workspaceTypes"

export const INITIAL_TASK_LIMIT = 40

export const LANE_DOT_TONES: Record<ProjectedTask["lane"], string> = {
  queue: "bg-muted-foreground/55",
  running: "bg-primary",
  needs_you: "bg-warning",
  done: "bg-success",
}

export const PULL_REQUEST_TONES: Record<SidebarPullRequestStatus["state"], string> = {
  merged: "text-success",
  conflicting: "text-destructive",
  ci_failed: "text-destructive",
  ci_running: "text-warning",
  open: "text-primary",
  closed: "text-muted-foreground",
}

export function formatUpdatedAt(value: number, locale: Locale, t: Translate): string {
  const elapsed = Math.max(0, Date.now() - value)
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (elapsed < hour) return t("taskboard.updatedNow")
  if (elapsed < day) return t("taskboard.updatedHours", { count: Math.floor(elapsed / hour) })
  if (elapsed < day * 7) return t("taskboard.updatedDays", { count: Math.floor(elapsed / day) })
  const date = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(value)
  return t("taskboard.updatedOn", { date })
}

export function sessionActivityKind(session?: SessionProjection): TaskSessionActivityKind {
  const kind = session?.activity?.state.kind ?? "idle"
  return session?.running && kind === "idle" ? "running" : kind
}

export function sessionUpdatedAt(session: SessionProjection, fallback: number): number {
  return session.lastActiveAt ?? session.createdAt ?? fallback
}

export function sessionCheckoutPath(session?: SessionProjection): string | null {
  if (!session || session.worktreeDiscarded) return null
  return session.worktreePath ?? session.cwd ?? null
}

function checkoutDisplay(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join("/") || path
}

export function checkoutLabel(
  t: Translate,
  session: SessionProjection,
  path: string | null,
): string {
  if (session.worktreeDiscarded) return t("taskboard.worktreeDiscarded")
  if (path) return checkoutDisplay(path)
  return t("taskboard.noCheckout")
}

export function sessionStatusLabel(t: Translate, session: SessionProjection): string {
  const kind = sessionActivityKind(session)
  if (kind === "awaiting_input") return t("session.awaitingInput")
  if (kind === "failed") return t("session.failed")
  if (kind === "running") return t("session.running")
  return t("session.completed")
}

export function sessionStatusTone(session: SessionProjection): string {
  const kind = sessionActivityKind(session)
  if (kind === "awaiting_input") return "bg-warning"
  if (kind === "failed") return "bg-destructive"
  if (kind === "running") return "bg-primary"
  return session.archived ? "bg-muted-foreground/40" : "bg-success"
}

export function sessionActivityDescription(t: Translate, session: SessionProjection): string {
  const state = session.activity?.state
  if (state?.kind === "awaiting_input") {
    return state.pending[0]?.title ?? t("taskboard.attention.inputDescription")
  }
  if (state?.kind === "failed") return state.message
  return sessionStatusLabel(t, session)
}

function taskSessions(
  task: BoardTask,
  sessionsById: ReadonlyMap<string, Omit<SessionProjection, "number" | "current">>,
): SessionProjection[] {
  const oldestFirst: Omit<SessionProjection, "current">[] = task.sessionIds.flatMap((id, index) => {
    const session = sessionsById.get(id)
    return session ? [{ ...session, number: index + 1 }] : []
  })
  const latestAvailable = [...oldestFirst].reverse().find((session) => !session.archived)
  return oldestFirst
    .map((session) => ({ ...session, current: session.id === latestAvailable?.id }))
    .reverse()
}

export function projectTasks(
  tasks: readonly BoardTask[],
  sessionsById: ReadonlyMap<string, Omit<SessionProjection, "number" | "current">>,
): ProjectedTask[] {
  return tasks.map((task) => {
    const sessions = taskSessions(task, sessionsById)
    const currentSession = sessions.find((session) => session.current)
    return {
      task,
      sessions,
      currentSession,
      lane: taskBoardLane(task, sessionActivityKind(currentSession)),
    }
  })
}

export function openPullRequestCount(
  sessions: readonly SessionProjection[],
  pullRequestsByPath: ReadonlyMap<string, SidebarPullRequestStatus | null>,
): number {
  return sessions.filter((session) => {
    const path = sessionCheckoutPath(session)
    const state = path ? pullRequestsByPath.get(path)?.state : null
    return Boolean(state && state !== "merged" && state !== "closed")
  }).length
}

export function pullRequestStatusLabel(
  t: Translate,
  state: SidebarPullRequestStatus["state"],
): string {
  return t(`rail.pullRequest.${state}` as "rail.pullRequest.open")
}
