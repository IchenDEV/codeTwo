import type { ReactNode } from "react"

import type { ElicitationAnswer, GitHubPullRequest, SessionActivity } from "@/bridge"
import type { PermissionQueueItem } from "@/session/sessionEvents"

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
  onAskSession?: (id: string, prompt: string) => boolean | Promise<boolean>
  onStartTask?: (task: BoardTask) => void
  loadTranscript?: (id: string) => Promise<TaskBoardTranscriptPreview>
  pendingInputs?: readonly PermissionQueueItem[]
  onAnswerPermission?: (request: PermissionQueueItem, optionId: string | null) => Promise<boolean>
  onAnswerElicitation?: (request: PermissionQueueItem, answer: ElicitationAnswer) => Promise<boolean>
  onSplitSession?: (id: string, edge: "right" | "bottom") => void
  onForkSession?: (id: string, throughSeq: number, title: string) => void
  headerLeadingAction?: ReactNode
  loadPullRequest?: (path: string) => Promise<GitHubPullRequest | null>
}

export interface TaskBoardTranscriptLine {
  seq: number
  role: "user" | "agent"
  text: string
}

export interface TaskBoardTranscriptPreview {
  entries: TaskBoardTranscriptLine[]
  latestTurnSeq: number | null
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

export type InspectorTab = "agent" | "details"
export type TaskBoardView = "all" | "attention"

export type TranscriptPreviewState =
  | { sessionId: null; status: "idle"; preview: null }
  | { sessionId: string; status: "loading" | "error"; preview: null }
  | { sessionId: string; status: "success"; preview: TaskBoardTranscriptPreview }
