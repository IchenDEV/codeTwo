import type { ReactNode } from "react"

import type { GitHubPullRequest, SessionActivity } from "@/bridge"

import type { BoardTask, TaskBoardLane, TaskStatus } from "./taskBoard"

export interface TaskBoardSession {
  id: string
  title: string
  archived?: boolean
  activity?: SessionActivity
  running?: boolean
  cwd?: string
  worktreePath?: string | null
  projectPath?: string | null
  worktreeDiscarded?: boolean
  createdAt?: number
  lastActiveAt?: number
}

export interface TaskBoardPageProps {
  sessions?: TaskBoardSession[]
  onOpenSession?: (id: string) => void
  onAskSession?: (id: string, prompt: string) => void
  onStartTask?: (task: BoardTask) => void
  headerLeadingAction?: ReactNode
  loadPullRequest?: (path: string) => Promise<GitHubPullRequest | null>
}

export interface SessionProjection extends TaskBoardSession {
  archived: boolean
  number: number
  current: boolean
}

export interface ProjectedTask {
  task: BoardTask
  lane: TaskBoardLane
  sessions: SessionProjection[]
  currentSession?: SessionProjection
}

export interface EditorState {
  task: BoardTask | null
  initialStatus: TaskStatus
}

export type InspectorTab = "agent" | "details" | "insights"
