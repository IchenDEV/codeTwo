import type { FormEvent } from "react"

import { StatusIndicator, type StatusIndicatorTone } from "@/components/business/status-indicator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  GitFork,
  Loader2,
  MessageSquareText,
  PanelBottom,
  PanelRight,
  Plus,
  Send,
} from "@/components/ui/icons"
import { Textarea } from "@/components/ui/textarea"
import type { Translate } from "@/i18n"
import type { PermissionQueueItem } from "@/session/sessionEvents"

import { InspectorSection } from "./InspectorSection"
import { TaskBoardPendingInput, type TaskBoardPendingInputProps } from "./TaskBoardPendingInput"
import type { BoardTask } from "./taskBoard"
import { sessionActivityDescription, sessionActivityKind } from "./workspaceModel"
import type { SessionProjection, TranscriptPreviewState } from "./workspaceTypes"

interface TaskInspectorAgentProps {
  t: Translate
  task: BoardTask
  session: SessionProjection | null
  transcript: TranscriptPreviewState
  pendingInput: PermissionQueueItem | null
  prompt: string
  promptSubmitting: boolean
  canAskSession: boolean
  onPromptChange: (value: string) => void
  onSubmitPrompt: (event: FormEvent<HTMLFormElement>) => void
  onOpenSession?: (id: string) => void
  onStartTask?: (task: BoardTask) => void
  onAnswerPermission?: TaskBoardPendingInputProps["onAnswerPermission"]
  onAnswerElicitation?: TaskBoardPendingInputProps["onAnswerElicitation"]
  onAttentionAccepted: () => void
  onSplitSession?: (id: string, edge: "right" | "bottom") => void
  onForkSession?: (id: string, throughSeq: number, title: string) => void
}

function indicatorTone(session: SessionProjection): StatusIndicatorTone {
  const activity = sessionActivityKind(session)
  if (activity === "awaiting_input") return "warning"
  if (activity === "failed") return "destructive"
  return activity === "running" || session.archived ? "neutral" : "success"
}

export function TaskInspectorAgent(props: TaskInspectorAgentProps) {
  const { t, task, session } = props
  if (!session) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
        <MessageSquareText aria-hidden className="size-6 text-muted-foreground" />
        <div>
          <h2 className="text-dialog font-semibold">{t("taskboard.noSessions")}</h2>
          <p className="mt-1 text-body text-muted-foreground">{t("taskboard.noSessionsDescription")}</p>
        </div>
        {props.onStartTask ? (
          <Button type="button" size="compact" onClick={() => props.onStartTask?.(task)}>
            <Plus aria-hidden />
            {t("taskboard.startTask")}
          </Button>
        ) : null}
      </div>
    )
  }

  const preview = props.transcript.status === "success" ? props.transcript.preview : null
  return (
    <div className="flex min-h-full flex-col gap-4">
      <header className="border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <strong className="min-w-0 flex-1 truncate text-body">
            {t("taskboard.sessionOrdinal", { number: session.number })} · {session.title}
          </strong>
          {session.current ? (
            <Badge variant="secondary" className="px-1.5 text-metadata text-primary">
              {t("taskboard.currentSession")}
            </Badge>
          ) : null}
        </div>
        <div className="mt-2">
          <StatusIndicator tone={indicatorTone(session)} label={sessionActivityDescription(t, session)} />
        </div>
      </header>

      {props.pendingInput ? (
        <TaskBoardPendingInput
          t={t}
          request={props.pendingInput}
          onAnswerPermission={props.onAnswerPermission}
          onAnswerElicitation={props.onAnswerElicitation}
          onAccepted={props.onAttentionAccepted}
        />
      ) : null}

      <InspectorSection title={t("taskboard.transcript.title")}>
        <div data-task-board-transcript className="divide-y divide-border border-y border-border">
          {props.transcript.status === "loading" ? (
            <div className="flex items-center gap-2 py-4 text-body text-muted-foreground">
              <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              {t("taskboard.transcript.loading")}
            </div>
          ) : props.transcript.status === "error" ? (
            <p className="py-4 text-body text-muted-foreground">{t("taskboard.transcript.failed")}</p>
          ) : preview && preview.entries.length > 0 ? preview.entries.map((entry) => (
            <div key={entry.seq} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 py-3 text-body">
              <span className="text-metadata font-medium text-muted-foreground">
                {t(entry.role === "user" ? "taskboard.transcript.you" : "taskboard.transcript.agent")}
              </span>
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-foreground/85">{entry.text}</p>
            </div>
          )) : (
            <p className="py-4 text-body text-muted-foreground">{t("taskboard.transcript.empty")}</p>
          )}
        </div>
      </InspectorSection>

      {props.canAskSession ? (
        <form className="grid gap-2 border-t border-border pt-3" onSubmit={props.onSubmitPrompt}>
          <label htmlFor="task-board-agent-prompt" className="text-metadata font-medium text-muted-foreground">
            {t("taskboard.askAgent")}
          </label>
          <Textarea
            id="task-board-agent-prompt"
            rows={3}
            value={props.prompt}
            placeholder={t("taskboard.askAgentPlaceholder")}
            disabled={props.promptSubmitting}
            onChange={(event) => props.onPromptChange(event.currentTarget.value)}
          />
          <div className="flex justify-end">
            <Button type="submit" size="compact" disabled={props.promptSubmitting || !props.prompt.trim()}>
              {props.promptSubmitting
                ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
                : <Send aria-hidden />}
              {t("taskboard.continueWithPrompt")}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
        {props.onOpenSession ? (
          <Button type="button" size="compact" onClick={() => props.onOpenSession?.(session.id)}>
            {t("taskboard.openSession")}
          </Button>
        ) : null}
        {props.onForkSession ? (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={session.archived || preview?.latestTurnSeq == null}
            onClick={() => {
              if (preview?.latestTurnSeq != null) {
                props.onForkSession?.(session.id, preview.latestTurnSeq, session.title)
              }
            }}
          >
            <GitFork aria-hidden />
            {t("taskboard.forkFromPreview")}
          </Button>
        ) : null}
        {props.onSplitSession ? (
          <>
            <Button type="button" variant="ghost" size="compact" onClick={() => props.onSplitSession?.(session.id, "right")}>
              <PanelRight aria-hidden />
              {t("taskboard.splitRight")}
            </Button>
            <Button type="button" variant="ghost" size="compact" onClick={() => props.onSplitSession?.(session.id, "bottom")}>
              <PanelBottom aria-hidden />
              {t("taskboard.splitBelow")}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
