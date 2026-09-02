import { useEffect, useMemo, useState } from "react"

import type { GitHubPullRequest } from "@/bridge"
import {
  loadSidebarPullRequests,
  type SidebarPullRequestStatus,
} from "@/sidebar/sidebarGitStatus"

import { sessionCheckoutPath } from "./workspaceModel"
import type { ProjectedTask } from "./workspaceTypes"

export function useTaskPullRequests(
  tasks: readonly ProjectedTask[],
  selectedCheckoutPath: string | null,
  loadPullRequest: (path: string) => Promise<GitHubPullRequest | null>,
): ReadonlyMap<string, SidebarPullRequestStatus | null> {
  const [refresh, setRefresh] = useState(0)
  const [pullRequestsByPath, setPullRequestsByPath] = useState<
    ReadonlyMap<string, SidebarPullRequestStatus | null>
  >(() => new Map())
  const targetPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const { sessions } of tasks) {
      for (const session of sessions) {
        const path = sessionCheckoutPath(session)
        if (path) paths.add(path)
        if (paths.size === 48) break
      }
      if (paths.size === 48) break
    }
    if (selectedCheckoutPath) paths.add(selectedCheckoutPath)
    return [...paths]
  }, [tasks, selectedCheckoutPath])
  const targetKey = targetPaths.join("\u0000")

  useEffect(() => {
    const timer = window.setInterval(() => setRefresh((current) => current + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    void loadSidebarPullRequests(
      targetPaths.map((path) => ({ path })),
      loadPullRequest,
    ).then((statuses) => {
      if (!active) return
      const completedStatuses = new Map(statuses)
      for (const path of targetPaths) {
        if (!completedStatuses.has(path)) completedStatuses.set(path, null)
      }
      setPullRequestsByPath(completedStatuses)
    })
    return () => {
      active = false
    }
  }, [refresh, targetKey, loadPullRequest])

  return pullRequestsByPath
}
