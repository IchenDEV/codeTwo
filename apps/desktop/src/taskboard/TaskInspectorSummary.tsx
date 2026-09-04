import { Badge } from "@/components/ui/badge";
import type { Translate } from "@/i18n";
import type { SidebarPullRequestStatus } from "@/sidebar/sidebarGitStatus";

import { InspectorSection } from "./InspectorSection";
import type { BoardTask } from "./taskBoard";
import { taskPriorityLabel, taskStatusLabel } from "./TaskEditorDialog";
import type { SessionProjection } from "./workspaceTypes";

interface TaskInspectorSummaryProps {
  t: Translate;
  task: BoardTask;
  session: SessionProjection | null;
  pullRequest: SidebarPullRequestStatus | null | undefined;
}

export function TaskInspectorDetails({ t, task }: TaskInspectorSummaryProps) {
  return (
    <div className="grid gap-5">
      <InspectorSection title={t("taskboard.taskDetails")}>
        <div className="rounded-module bg-fill-rest text-body grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 p-3">
          <span className="text-muted-foreground">
            {t("taskboard.editor.status")}
          </span>
          <strong>{taskStatusLabel(t, task.status)}</strong>
          <span className="text-muted-foreground">
            {t("taskboard.editor.priority")}
          </span>
          <strong>{taskPriorityLabel(t, task.priority)}</strong>
          <span className="text-muted-foreground">
            {t("taskboard.sessionsHeader")}
          </span>
          <strong>
            {t("taskboard.sessionCount", { count: task.sessionIds.length })}
          </strong>
        </div>
      </InspectorSection>
      <InspectorSection title={t("taskboard.editor.description")}>
        <p className="rounded-module bg-fill-rest text-body text-foreground/85 p-3 leading-relaxed">
          {task.description || t("taskboard.noDescription")}
        </p>
      </InspectorSection>
      <InspectorSection title={t("taskboard.labels")}>
        <div className="flex flex-wrap gap-2">
          {task.labels.length > 0 ? (
            task.labels.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))
          ) : (
            <span className="text-body text-muted-foreground">
              {t("taskboard.noLabels")}
            </span>
          )}
        </div>
      </InspectorSection>
    </div>
  );
}

export function TaskInspectorInsights({
  t,
  task,
  session,
  pullRequest,
}: TaskInspectorSummaryProps) {
  return (
    <div className="grid gap-5">
      <InspectorSection title={t("taskboard.relationshipTitle")}>
        <p className="rounded-module bg-fill-rest text-body p-3 leading-relaxed">
          {t("taskboard.relationshipDescription")}
        </p>
      </InspectorSection>
      <InspectorSection title={t("taskboard.currentProjection")}>
        <div className="rounded-module bg-fill-rest text-body grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 p-3">
          <span className="text-muted-foreground">
            {t("taskboard.taskLabel")}
          </span>
          <strong className="truncate">{task.title}</strong>
          <span className="text-muted-foreground">
            {t("taskboard.selectedSession")}
          </span>
          <strong className="truncate">
            {session?.title ?? t("taskboard.none")}
          </strong>
          <span className="text-muted-foreground">
            {t("taskboard.primaryPullRequest")}
          </span>
          <strong>
            {pullRequest ? `#${pullRequest.number}` : t("taskboard.none")}
          </strong>
        </div>
      </InspectorSection>
    </div>
  );
}
