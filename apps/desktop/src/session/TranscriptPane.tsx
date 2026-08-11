import { ArrowDown, Copy, FileOutput, Loader2, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";

import { TurnCard } from "./TurnCard";
import type { Turn } from "./turns";
import type { TranscriptScrollController } from "./useTranscriptScroll";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

interface TranscriptPaneProps {
  variant: "main" | "side";
  presentation?: "code" | "work";
  workContext?: {
    task: string;
    workspace: string;
    deliverables: Array<{ path: string; version: number; updatedAt: number }>;
    onOpenFile: (path: string) => void;
    onRefresh: () => void;
  } | null;
  turns: readonly Turn[];
  loading: boolean;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
  scroll: TranscriptScrollController;
}

function WorkDeliveryResult({
  task,
  deliverable,
  onOpenFile,
  onRefresh,
}: {
  task: string;
  deliverable: { path: string; version: number; updatedAt: number };
  onOpenFile: (path: string) => void;
  onRefresh: () => void;
}) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const subject = task.replace(/^(launch|build|create)\s+/i, "");
  const resultText = `${subject.charAt(0).toUpperCase()}${subject.slice(1)} is ready. You can preview ${deliverable.path}.`;
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <article className="work-result work-turn py-4">
      <div className="work-message-grid">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-ui font-semibold">CodeTwo</span>
            <time className="text-fine text-muted-foreground">{time.format(deliverable.updatedAt)}</time>
          </div>
          <p className="mt-1 text-ui leading-[1.6] text-foreground/90">{resultText}</p>
          <button
            type="button"
            className="work-delivery-card mt-2.5 flex w-full items-center gap-2 border bg-background px-3 text-left hover:bg-accent/40"
            onClick={() => onOpenFile(deliverable.path)}
          >
            <FileOutput className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ui">{deliverable.path}</span>
              <span className="block text-fine text-muted-foreground">v{deliverable.version}</span>
            </span>
          </button>
          <div className="mt-3 flex items-center gap-1 text-muted-foreground">
            <button
              type="button"
              aria-label="Helpful"
              aria-pressed={feedback === "up"}
              onClick={() => setFeedback((value) => value === "up" ? null : "up")}
              className={cn("work-message-action", feedback === "up" && "text-primary")}
            >
              <ThumbsUp className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Not helpful"
              aria-pressed={feedback === "down"}
              onClick={() => setFeedback((value) => value === "down" ? null : "down")}
              className={cn("work-message-action", feedback === "down" && "text-primary")}
            >
              <ThumbsDown className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Copy result"
              onClick={() => void navigator.clipboard?.writeText(resultText)}
              className="work-message-action"
            >
              <Copy className="size-3.5" />
            </button>
            <button type="button" aria-label="Refresh task" onClick={onRefresh} className="work-message-action">
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/** One transcript renderer shared by the main column and document-mode side panel. */
export function TranscriptPane({
  variant,
  presentation = "code",
  workContext = null,
  turns,
  loading,
  hasEarlier,
  loadingEarlier,
  onLoadEarlier,
  scroll,
}: TranscriptPaneProps) {
  const t = useT();
  const Root = variant === "side" ? "aside" : "section";

  return (
    <Root
      aria-label={t("transcript.label")}
      className={cn(
        "relative min-h-0",
        variant === "side"
          ? "animate-slide-in-right order-2 w-[360px] max-w-[38%] shrink-0 border-s bg-fill-quiet"
          : cn("order-1 flex-1", presentation === "work" && "work-transcript"),
      )}
    >
      <div
        ref={(element) => {
          scroll.viewportRef.current = element;
        }}
        aria-busy={loading}
        className="size-full overflow-y-auto overscroll-contain"
        onScroll={scroll.onScroll}
        onPointerDownCapture={scroll.onPointerDownCapture}
        onKeyDownCapture={scroll.onKeyDownCapture}
      >
        <div
          className={cn(
            "mx-auto w-full",
            variant === "side"
              ? "px-4 pb-4 pt-2"
              : cn("max-w-[860px] px-6 pb-2 pt-3", presentation === "work" && "work-measure pt-7"),
          )}
        >
          {presentation === "work" && workContext ? (
            <p className="work-context-line mb-3 text-hint text-muted-foreground">
              You're working on <span className="text-primary">{workContext.task}</span> in{" "}
              <span className="text-primary">{workContext.workspace}</span>.
            </p>
          ) : null}
          {loading ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 py-12 text-ui text-muted-foreground"
            >
              {presentation === "code" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("session.loading")}
            </p>
          ) : (
            <>
              {hasEarlier ? (
                <div className="flex justify-center pb-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={loadingEarlier}
                    onClick={onLoadEarlier}
                  >
                    {loadingEarlier ? (
                      <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
                    ) : null}
                    {loadingEarlier
                      ? t("transcript.loadingEarlier")
                      : t("transcript.loadEarlier")}
                  </Button>
                </div>
              ) : null}
              <ol className="m-0 list-none p-0">
                {turns.map((turn, index) => (
                  <li
                    key={turn.transcriptStartSeq ?? turn.id}
                    style={{ contentVisibility: "auto", containIntrinsicSize: "auto 180px" }}
                  >
                    <TurnCard
                      turn={turn}
                      presentation={presentation}
                      showActions={index === turns.length - 1 && !workContext?.deliverables?.length}
                    />
                  </li>
                ))}
              </ol>
              {presentation === "work" && workContext?.deliverables?.[0] ? (
                <WorkDeliveryResult
                  task={workContext.task}
                  deliverable={workContext.deliverables[0]}
                  onOpenFile={workContext.onOpenFile}
                  onRefresh={workContext.onRefresh}
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      {scroll.showJumpToLatest ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute bottom-4 start-1/2 -translate-x-1/2 rounded-full shadow-lg"
          onClick={scroll.jumpToLatest}
        >
          <ArrowDown data-icon="inline-start" aria-hidden />
          {t("transcript.jumpLatest")}
        </Button>
      ) : null}
    </Root>
  );
}
