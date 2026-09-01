import { openExternal } from "@/bridge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  GitBranch,
  GitPullRequest,
} from "@/components/ui/icons"
import type { Translate } from "@/i18n"
import { cn } from "@/lib/utils"
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus"

import { InspectorSection } from "./InspectorSection"
import { taskPriorityLabel, taskStatusLabel } from "./TaskEditorDialog"
import type { BoardTask } from "./taskBoard"
import {
  checkoutLabel,
  PULL_REQUEST_TONES,
  pullRequestStatusLabel,
  sessionCheckoutPath,
} from "./workspaceModel"
import type { SessionProjection } from "./workspaceTypes"

interface TaskInspectorDetailsProps {
  t: Translate
  task: BoardTask
  session: SessionProjection | null
  pullRequest: SidebarPullRequestStatus | null | undefined
  onCopyCheckout: (path: string) => void
}

export function TaskInspectorDetails(props: TaskInspectorDetailsProps) {
  const { t, task, session, pullRequest } = props
  const checkoutPath = sessionCheckoutPath(session ?? undefined)

  return (
    <div className="grid gap-5">
      <InspectorSection title={t("taskboard.taskDetails")}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 border-y border-border py-3 text-body">
          <dt className="text-muted-foreground">{t("taskboard.editor.status")}</dt>
          <dd className="font-semibold">{taskStatusLabel(t, task.status)}</dd>
          <dt className="text-muted-foreground">{t("taskboard.editor.priority")}</dt>
          <dd className="font-semibold">{taskPriorityLabel(t, task.priority)}</dd>
          <dt className="text-muted-foreground">{t("taskboard.sessionsHeader")}</dt>
          <dd className="font-semibold">{t("taskboard.sessionCount", { count: task.sessionIds.length })}</dd>
        </dl>
      </InspectorSection>

      {session ? (
        <>
          <InspectorSection title={t("taskboard.checkoutTitle")}>
            <div className="flex min-w-0 items-center gap-2 border-y border-border py-3">
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
            <div className="flex min-h-12 items-center gap-2 border-y border-border py-3 text-body">
              {pullRequest === undefined ? (
                <span className="text-muted-foreground">{t("taskboard.checkingPullRequest")}</span>
              ) : pullRequest ? (
                <>
                  {pullRequest.state === "merged" || pullRequest.state === "open" ? (
                    <CheckCircle2 aria-hidden className="size-4 text-success" />
                  ) : (
                    <GitPullRequest aria-hidden className={cn("size-4", PULL_REQUEST_TONES[pullRequest.state])} />
                  )}
                  <strong className={cn("min-w-0 flex-1 truncate", PULL_REQUEST_TONES[pullRequest.state])}>
                    #{pullRequest.number} · {pullRequestStatusLabel(t, pullRequest.state)}
                  </strong>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("taskboard.openPullRequest")}
                    onClick={() => void openExternal(pullRequest.url)}
                  >
                    <ExternalLink aria-hidden />
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground">{t("taskboard.noPullRequestForSession")}</span>
              )}
            </div>
          </InspectorSection>
        </>
      ) : null}

      <InspectorSection title={t("taskboard.editor.description")}>
        <p className="border-y border-border py-3 text-body leading-relaxed text-foreground/85">
          {task.description || t("taskboard.noDescription")}
        </p>
      </InspectorSection>
      <InspectorSection title={t("taskboard.labels")}>
        <div className="flex flex-wrap gap-2">
          {task.labels.length > 0 ? task.labels.map((label) => (
            <Badge key={label} variant="secondary">{label}</Badge>
          )) : <span className="text-body text-muted-foreground">{t("taskboard.noLabels")}</span>}
        </div>
      </InspectorSection>
    </div>
  )
}
