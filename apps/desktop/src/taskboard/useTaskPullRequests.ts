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
  loadPullRequest: (path: string) => Promise<GitHubPullRequest | null>,
  selectedPath?: string | null,
): ReadonlyMap<string, SidebarPullRequestStatus | null> {
  const [refresh, setRefresh] = useState(0)
  const [pullRequestsByPath, setPullRequestsByPath] = useState<
    ReadonlyMap<string, SidebarPullRequestStatus | null>
  >(() => new Map())
  const targetPaths = useMemo(() => {
    const paths = [...new Set(
      tasks
        .flatMap(({ sessions }) => sessions)
        .flatMap((session) => {
          const path = sessionCheckoutPath(session)
          return path ? [path] : []
        }),
    )].slice(0, 48)
    if (selectedPath && !paths.includes(selectedPath)) paths.push(selectedPath)
    return paths
  }, [selectedPath, tasks])
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
      if (active) setPullRequestsByPath(statuses)
    })
    return () => {
      active = false
    }
  }, [refresh, targetKey, loadPullRequest])

  return pullRequestsByPath
}
