import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  CircleDot,
  ListTodo,
} from "@/components/ui/icons";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type { PlanEntry } from "../bridge";
import { useT } from "../i18n";
import type { Turn } from "./turns";

export type TaskPlanStatus = "pending" | "in_progress" | "completed";

const CHECKBOX_MARKER = /^\s*(?:-\s*)?\[([ xX])\]\s*(.*)$/u;

export function taskPlanStatus(entry: PlanEntry): TaskPlanStatus {
  const status = (entry.status ?? "").trim().toLowerCase().replaceAll("-", "_");
  if (
    ["completed", "complete", "done", "succeeded", "success"].includes(status)
  ) {
    return "completed";
  }
  if (["in_progress", "active", "running", "started"].includes(status)) {
    return "in_progress";
  }
  if (status) return "pending";
  return CHECKBOX_MARKER.exec(entry.content)?.[1]?.toLowerCase() === "x"
    ? "completed"
    : "pending";
}

export function taskPlanLabel(entry: PlanEntry): string {
  return CHECKBOX_MARKER.exec(entry.content)?.[2] ?? entry.content;
}

export function planChecklistMarkdown(
  entries: readonly (PlanEntry | string)[]
): string {
  return entries
    .map((entry) => {
      const normalized = typeof entry === "string" ? { content: entry } : entry;
      const marked = CHECKBOX_MARKER.exec(normalized.content);
      const explicitStatus = "status" in normalized ? normalized.status : null;
      if (marked && explicitStatus == null) {
        return `- [${marked[1] === " " ? " " : "x"}] ${marked[2]}`;
      }
      const checked = taskPlanStatus(normalized) === "completed" ? "x" : " ";
      return `- [${checked}] ${marked?.[2] ?? normalized.content}`;
    })
    .join("\n");
}

export function currentTaskPlan(turns: readonly Turn[]): readonly PlanEntry[] {
  return turns.at(-1)?.plan ?? [];
}

function StatusIcon({ status }: { status: TaskPlanStatus }) {
  const t = useT();
  if (status === "completed") {
    return (
      <CheckCircle2
        className="text-success mt-0.5 size-4 shrink-0"
        aria-label={t("taskPlan.status.completed")}
      />
    );
  }
  if (status === "in_progress") {
    return (
      <CircleDot
        className="text-primary mt-0.5 size-4 shrink-0"
        aria-label={t("taskPlan.status.inProgress")}
      />
    );
  }
  return (
    <Circle
      className="text-muted-foreground mt-0.5 size-4 shrink-0"
      aria-label={t("taskPlan.status.pending")}
    />
  );
}

export function TaskPlanPanel({
  turns,
  onOpenPlanAsDocument,
  onPinPlanArtifact,
  canPinPlan = false,
}: {
  turns: readonly Turn[];
  onOpenPlanAsDocument?: (entries: PlanEntry[]) => void;
  onPinPlanArtifact?: (markdown: string) => void;
  canPinPlan?: boolean;
}) {
  const t = useT();
  const entries = currentTaskPlan(turns);
  const statuses = entries.map(taskPlanStatus);
  const completed = statuses.filter((status) => status === "completed").length;
  const currentIndex = statuses.indexOf("in_progress");
  const currentStep =
    currentIndex === -1
      ? entries.length > 0
        ? Math.min(completed + 1, entries.length)
        : 0
      : currentIndex + 1;
  const progress = entries.length > 0 ? (completed / entries.length) * 100 : 0;

  if (entries.length === 0) {
    return null;
  }

  return (
    <section
      data-task-plan-panel
      aria-label={t("taskPlan.title")}
      className="mt-2"
    >
      <Separator className="mb-2" />
      <div className="flex h-(--ds-control-normal) items-center gap-2 px-2">
        <ListTodo
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden
        />
        <h2 className="text-body min-w-0 flex-1 truncate font-medium">
          {t("taskPlan.title")}
        </h2>
        <p
          role="status"
          aria-live="polite"
          className="text-metadata text-muted-foreground shrink-0 font-medium tabular-nums"
        >
          {t("taskPlan.step", { current: currentStep, total: entries.length })}
        </p>
      </div>
      <div className="px-2 pb-1">
        <Progress
          value={progress}
          aria-label={t("taskPlan.progress", {
            completed,
            total: entries.length,
          })}
          className="gap-0 [&_[data-slot=progress-track]]:h-1"
        />
      </div>

      <ol className="space-y-0.5" aria-label={t("taskPlan.list")}>
        {entries.map((entry, index) => {
          const status = statuses[index] ?? "pending";
          return (
            <li
              key={`${index}:${entry.content}`}
              data-task-plan-status={status}
              className={cn(
                "rounded-control text-callout flex items-start gap-2 px-2 py-1.5",
                status === "in_progress" && "bg-accent/50",
                status === "completed" && "text-muted-foreground"
              )}
            >
              <StatusIcon status={status} />
              <span
                className={cn(
                  "min-w-0 break-words",
                  status === "completed" && "line-through"
                )}
              >
                {taskPlanLabel(entry)}
              </span>
            </li>
          );
        })}
      </ol>

      {(onOpenPlanAsDocument != null ||
        (canPinPlan && onPinPlanArtifact != null)) && (
        <div className="flex flex-wrap gap-1 px-2 pt-2">
          {onOpenPlanAsDocument && (
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={() =>
                onOpenPlanAsDocument(entries.map((entry) => ({ ...entry })))
              }
            >
              {t("planDoc.open")}
            </Button>
          )}
          {canPinPlan && onPinPlanArtifact && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => onPinPlanArtifact(planChecklistMarkdown(entries))}
            >
              {t("planDoc.pin")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
