import { useState } from "react";
import { Check, Lock } from "@/components/ui/icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useT } from "../i18n";
import type { PipelineInstanceDetail, PipelineStageStatus, SceneArtifactRecord } from "../bridge";

/**
 * The horizontal stage track (docs/scenes.md §UI contract): a pipeline-bound session renders its
 * instance as one chip per stage — done ✓ / current highlighted / pending muted, a ×n loop badge
 * when a stage has been entered more than once, and a lock glyph on confirm-gated stages. A chip
 * expands to a small popover listing the stage's captured artifacts and its sessions.
 */

/** Newest version per artifact key (`list_for_instance` orders versions DESC within a key). */
function newestPerKey(artifacts: SceneArtifactRecord[]): SceneArtifactRecord[] {
  const seen = new Set<string>();
  const out: SceneArtifactRecord[] = [];
  for (const record of artifacts) {
    if (seen.has(record.artifact_key)) continue;
    seen.add(record.artifact_key);
    out.push(record);
  }
  return out;
}

function StagePopover({
  stage,
  onSelectSession,
}: {
  stage: PipelineStageStatus;
  onSelectSession: (sessionId: string) => void;
}) {
  const t = useT();
  const artifacts = newestPerKey(stage.artifacts);
  return (
    <PopoverContent
      align="start"
      className="w-64 p-2"
      data-testid={`stage-popover-${stage.id}`}
    >
      <PopoverTitle className="sr-only">{stage.title}</PopoverTitle>
      <p className="px-1 pb-1 text-cap text-muted-foreground">{t("stage.artifacts")}</p>
      {artifacts.length === 0 ? (
        <p className="px-1 pb-1 text-hint text-muted-foreground">{t("stage.empty")}</p>
      ) : (
        <ul className="pb-1">
          {artifacts.map((record) => (
            <li key={record.id} className="flex items-baseline gap-1.5 px-1 py-0.5 text-ui">
              <span className="min-w-0 flex-1 truncate">{record.title}</span>
              <span className="shrink-0 text-hint text-muted-foreground">v{record.version}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 pb-1 text-cap text-muted-foreground">{t("stage.sessions")}</p>
      {stage.sessions.length === 0 ? (
        <p className="px-1 text-hint text-muted-foreground">{t("stage.empty")}</p>
      ) : (
        stage.sessions.map((sessionId) => (
          <Button
            key={sessionId}
            type="button"
            variant="ghost"
            size="row"
            focusStyle="inset"
            data-testid={`stage-session-${sessionId}`}
            onClick={() => onSelectSession(sessionId)}
          >
            <span className="truncate">{sessionId}</span>
          </Button>
        ))
      )}
    </PopoverContent>
  );
}

export function StageTrack({
  detail,
  onSelectSession,
}: {
  detail: PipelineInstanceDetail;
  onSelectSession: (sessionId: string) => void;
}) {
  const t = useT();
  const [openStage, setOpenStage] = useState<string | null>(null);
  return (
    <div className="shrink-0 px-4 pt-2" data-testid="stage-track">
      <div
        className="mx-auto flex w-full flex-wrap items-center gap-2"
        role="list"
        aria-label={t("stage.track")}
      >
        {detail.stages.map((stage) => (
          <div key={stage.id} role="listitem">
            <Popover
              open={openStage === stage.id}
              onOpenChange={(open) => setOpenStage(open ? stage.id : null)}
            >
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="selectable"
                    data-selected={stage.state === "current" ? "true" : undefined}
                    data-testid={`stage-${stage.id}`}
                    data-state={stage.state}
                    title={t(`stage.state.${stage.state}` as "stage.state.done")}
                    className={cn(
                      "max-w-full gap-control-group px-3",
                      stage.state !== "current" && "text-content-muted",
                      stage.state === "pending" && "opacity-60",
                    )}
                  />
                }
              >
                {stage.state === "done" && (
                  <Check data-icon="inline-start" aria-label={t("stage.state.done")} />
                )}
                <span className="truncate">{stage.title}</span>
                {stage.loop_count > 1 && (
                  <span
                    className="shrink-0 text-cap text-muted-foreground"
                    data-testid={`stage-loop-${stage.id}`}
                    data-count={stage.loop_count}
                  >
                    {t("stage.loop", { count: stage.loop_count })}
                  </span>
                )}
                {stage.gate === "confirm" && (
                  <Lock data-icon="inline-end" aria-label={t("stage.confirmGate")} />
                )}
              </PopoverTrigger>
              {openStage === stage.id && (
                <StagePopover
                  stage={stage}
                  onSelectSession={(sessionId) => {
                    setOpenStage(null);
                    onSelectSession(sessionId);
                  }}
                />
              )}
            </Popover>
          </div>
        ))}
      </div>
    </div>
  );
}
