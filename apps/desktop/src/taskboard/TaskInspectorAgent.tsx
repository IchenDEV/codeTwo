import type { FormEvent } from "react"

import { openExternal } from "@/bridge"
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  MessageSquareText,
  Plus,
  Send,
} from "@/components/ui/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StatusIndicator } from "@/components/business/status-indicator"
import type { Translate } from "@/i18n"
import { cn } from "@/lib/utils"
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus"

import { InspectorSection } from "./InspectorSection"
import type { BoardTask } from "./taskBoard"
import {
  checkoutLabel,
  PULL_REQUEST_TONES,
  pullRequestStatusLabel,
  sessionActivityDescription,
  sessionCheckoutPath,
  sessionStatusLabel,
  sessionStatusTone,
} from "./workspaceModel"
import type { SessionProjection } from "./workspaceTypes"

interface TaskInspectorAgentProps {
  t: Translate
  task: BoardTask
  session: SessionProjection | null
  pullRequest: SidebarPullRequestStatus | null | undefined
  prompt: string
  onPromptChange: (value: string) => void
  onSubmitPrompt: (event: FormEvent<HTMLFormElement>) => void
  onOpenSession?: (id: string) => void
  onStartTask?: (task: BoardTask) => void
  onCopyCheckout: (path: string) => void
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

  const checkoutPath = sessionCheckoutPath(session)
  const statusDescription = sessionActivityDescription(t, session)
  const pullRequestTone = props.pullRequest
    ? PULL_REQUEST_TONES[props.pullRequest.state]
    : "text-muted-foreground"

  return (
    <div className="flex min-h-full flex-col gap-5">
      <InspectorSection title={t("taskboard.selectedSession")}>
        <div className="rounded-module bg-fill-rest p-3">
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
          <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-metadata">
            <span className="text-muted-foreground">{t("taskboard.taskLabel")}</span>
            <strong className="truncate">{task.title}</strong>
            <span className="text-muted-foreground">{t("taskboard.activityLabel")}</span>
            <strong className="truncate">{sessionStatusLabel(t, session)}</strong>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title={t("taskboard.checkoutTitle")}>
        <div className="flex min-w-0 items-center gap-2 rounded-module bg-fill-rest p-3">
          <GitBranch aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-body" title={checkoutPath ?? undefined}>
              {checkoutLabel(t, session, checkoutPath)}
            </strong>
            <span className="text-metadata text-muted-foreground">
              {session.worktreePath ? t("checkout.worktreeBadge") : t("checkout.projectBadge")}
            </span>
          </div>
          {checkoutPath ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("taskboard.copyCheckout")}
              onClick={() => props.onCopyCheckout(checkoutPath)}
            >
              <Copy aria-hidden />
            </Button>
          ) : null}
        </div>
      </InspectorSection>

      <InspectorSection title={t("taskboard.primaryPullRequest")}>
        {props.pullRequest === undefined ? (
          <div className="rounded-module bg-fill-rest px-3 py-4 text-metadata text-muted-foreground">
            {t("taskboard.checkingPullRequest")}
          </div>
        ) : props.pullRequest ? (
          <div className="rounded-module bg-fill-rest p-3">
            <div className="flex items-center gap-2">
              <GitPullRequest aria-hidden className={cn("size-4", pullRequestTone)} />
              <strong className={cn("min-w-0 flex-1 truncate text-body", pullRequestTone)}>
                #{props.pullRequest.number} · {pullRequestStatusLabel(t, props.pullRequest.state)}
              </strong>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("taskboard.openPullRequest")}
                onClick={() => void openExternal(props.pullRequest?.url ?? "")}
              >
                <ExternalLink aria-hidden />
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-module bg-fill-rest px-3 py-4 text-metadata text-muted-foreground">
            {t("taskboard.noPullRequestForSession")}
          </div>
        )}
      </InspectorSection>

      <InspectorSection title={t("taskboard.checksTitle")}>
        <div className="rounded-module bg-fill-rest p-3">
          <div className="flex items-center gap-2 text-body">
            {props.pullRequest?.state === "merged" || props.pullRequest?.state === "open" ? (
              <CheckCircle2 aria-hidden className="size-4 text-success" />
            ) : (
              <GitPullRequest aria-hidden className={cn("size-4", pullRequestTone)} />
            )}
            <span className="min-w-0 flex-1 truncate">{t("taskboard.deliveryCheck")}</span>
            <span className={cn("text-metadata", pullRequestTone)}>
              {props.pullRequest === undefined
                ? t("taskboard.checkingPullRequest")
                : props.pullRequest
                  ? pullRequestStatusLabel(t, props.pullRequest.state)
                  : t("taskboard.notAvailable")}
            </span>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title={t("taskboard.recentActivity")}>
        <div className="rounded-module bg-fill-rest p-3">
          <StatusIndicator tone={sessionStatusTone(session)} label={statusDescription} />
        </div>
      </InspectorSection>

      {props.onOpenSession ? (
        <form className="mt-auto grid gap-2 rounded-module bg-fill-rest p-3" onSubmit={props.onSubmitPrompt}>
          <label htmlFor="task-board-agent-prompt" className="text-metadata font-medium text-muted-foreground">
            {t("taskboard.askAgent")}
          </label>
          <Textarea
            id="task-board-agent-prompt"
            rows={3}
            value={props.prompt}
            placeholder={t("taskboard.askAgentPlaceholder")}
            onChange={(event) => props.onPromptChange(event.currentTarget.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="compact" onClick={() => props.onOpenSession?.(session.id)}>
              {t("taskboard.openSession")}
            </Button>
            <Button type="submit" size="icon-sm" aria-label={t("taskboard.continueWithPrompt")} disabled={!props.prompt.trim()}>
              <Send aria-hidden />
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
