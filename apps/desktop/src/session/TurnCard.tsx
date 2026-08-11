import {
  Bot,
  Brain,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  CircleAlert,
  Copy,
  Loader2,
  ListTodo,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { deriveAgentRoster } from "./agentActivity";
import {
  canvasExportDataUrl,
  collapsedPrompt,
  isLongPrompt,
  parseCanvasHistoryPrompt,
  type CanvasHistoryMarker,
} from "./promptPreview";
import { isRunning, type Turn } from "./turns";
import { canvasGetSnapshot, type CanvasSnapshot } from "../bridge";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLanguage, useT } from "../i18n";
import { cn } from "@/lib/utils";

function duration(t: Turn): string | null {
  if (!t.endedAt) return null;
  const s = Math.max(0, Math.round((t.endedAt - t.startedAt) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function agentStatusDot(status: string): string {
  const value = status.toLowerCase().replace(/[\s-]+/g, "_");
  if (["completed", "done", "success", "succeeded"].includes(value)) return "bg-success";
  if (["cancelled", "canceled", "denied", "error", "failed", "rejected"].includes(value)) {
    return "bg-destructive";
  }
  return "bg-warning";
}

function toolStatusDot(status: string): string {
  if (status === "completed") return "bg-success";
  if (status === "failed") return "bg-destructive";
  return "bg-warning";
}

function canvasKey(canvas: CanvasHistoryMarker): string {
  return `${canvas.id}:${canvas.revision}`;
}

function downloadCanvasPng(canvas: CanvasHistoryMarker, snapshot: CanvasSnapshot | undefined): void {
  const exportItem = snapshot?.exports.find((item) => item.kind === "overview") ?? snapshot?.exports[0];
  if (!exportItem || typeof document === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = canvasExportDataUrl(exportItem);
  anchor.download = `${canvas.id}-${canvas.revision}.png`;
  anchor.click();
}

function requestCanvasDuplicate(canvas: CanvasHistoryMarker): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("codetwo-canvas-duplicate", {
      detail: { id: canvas.id, revision: canvas.revision },
    }),
  );
}

/** A collapsible group of secondary detail (agents / thinking / tools / plan). */
function Detail({
  icon: Icon,
  label,
  count,
  children,
  wide = false,
}: {
  icon: typeof Brain;
  label: string;
  count: number;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (count === 0) return null;
  return (
    <Collapsible className={cn("min-w-0", wide && "basis-full")}>
      <CollapsibleTrigger className="group -ms-1 flex items-center gap-1.5 rounded px-1 py-1 text-fine text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
        <Icon className="size-3" />
        {label} ({count})
      </CollapsibleTrigger>
      <CollapsibleContent className="py-1 ps-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/**
 * One prompt → response cycle.
 *
 * The prompt sits in a bubble on the right and the answer runs full width beneath it, so a long
 * transcript reads as a conversation instead of a stack of equally-weighted cards. Thinking, tool
 * calls and the plan stay collapsed underneath.
 */
export const TurnCard = memo(function TurnCard({
  turn,
  presentation = "code",
  showActions = true,
  canvasSnapshotLoader = canvasGetSnapshot,
}: {
  turn: Turn;
  presentation?: "code" | "work";
  showActions?: boolean;
  canvasSnapshotLoader?: typeof canvasGetSnapshot;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const running = isRunning(turn);
  const dur = duration(turn);
  const agents = useMemo(() => deriveAgentRoster(turn.tools), [turn.tools]);
  const history = useMemo(() => parseCanvasHistoryPrompt(turn.prompt), [turn.prompt]);
  const historySnapshots = useMemo(() => new Map<string, CanvasSnapshot>(), []);
  const [snapshots, setSnapshots] = useState<Record<string, CanvasSnapshot>>({});
  useEffect(() => {
    let cancelled = false;
    for (const canvas of history.canvases) {
      void canvasSnapshotLoader(canvas.id, canvas.revision)
        .then((snapshot) => {
          if (cancelled || !snapshot) return;
          historySnapshots.set(canvasKey(canvas), snapshot);
          setSnapshots((current) => ({ ...current, [canvasKey(canvas)]: snapshot }));
        })
        .catch(() => {
          // Browser/dev fallback has no native bridge; marker metadata remains read-only.
        });
    }
    return () => {
      cancelled = true;
      historySnapshots.clear();
    };
  }, [canvasSnapshotLoader, history.canvases, historySnapshots]);
  const hasDetail =
    agents.length +
      turn.tools.length +
      turn.thoughts.length +
      turn.plan.length +
      (turn.memory?.items.length ?? 0) >
    0;
  const promptIsLong = isLongPrompt(history.visiblePrompt);
  const visiblePrompt = promptIsLong && !promptExpanded
    ? collapsedPrompt(history.visiblePrompt)
    : history.visiblePrompt;

  if (presentation === "work") {
    const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
    const completedItems = [
      ...turn.plan,
      ...turn.tools.map((tool) => tool.title),
    ].filter((item, index, items) => items.indexOf(item) === index);
    return (
      <article aria-busy={running} className="work-turn py-4">
        <div className="work-message-grid">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-ui font-semibold">You</span>
              <time className="text-fine text-muted-foreground">{time.format(turn.startedAt)}</time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-ui leading-[1.55] text-foreground/90">
              {visiblePrompt}
            </p>
            {promptIsLong && (
              <button
                type="button"
                aria-expanded={promptExpanded}
                onClick={() => setPromptExpanded((value) => !value)}
                className="mt-1 text-fine font-medium text-muted-foreground hover:text-foreground"
              >
                {t(promptExpanded ? "turn.showLess" : "turn.showMore")}
              </button>
            )}
          </div>
        </div>

        <div className="work-message-grid mt-8">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-ui font-semibold">CodeTwo</span>
              <time className="text-fine text-muted-foreground">
                {time.format(turn.endedAt ?? turn.startedAt)}
              </time>
            </div>
            {turn.text && (
              <p className="mt-1 whitespace-pre-wrap break-words text-ui leading-[1.6] text-foreground/90">
                {turn.text}
              </p>
            )}
            {running && !turn.text && (
              <p className="mt-1 flex items-center gap-2 text-ui text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                {t("turn.working")}
              </p>
            )}
            {turn.error && (
              <p className="mt-2 flex items-start gap-1.5 rounded-(--ds-radius-control) bg-destructive/10 px-3 py-2 text-ui text-destructive">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                {turn.error}
              </p>
            )}
            {completedItems.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {completedItems.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-hint text-foreground/85">
                    <span className="work-check-icon mt-px" aria-hidden>
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
            {!running && turn.text && showActions && (
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
                  aria-label="Copy response"
                  onClick={() => void navigator.clipboard?.writeText(turn.text)}
                  className="work-message-action"
                >
                  <Copy className="size-3.5" />
                </button>
                {dur && <span className="ml-1 font-mono text-cap">{dur}</span>}
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    // Turns arrive one at a time, so each one entering under its own animation reads as the
    // conversation advancing rather than the list redrawing.
    <article aria-busy={running} className="animate-rise-in py-5">
      {/* prompt */}
      <div className="flex justify-end">
        <div className="max-w-[86%] rounded-2xl bg-secondary px-3.5 py-2 text-ui leading-relaxed text-secondary-foreground">
          <p className="whitespace-pre-wrap break-words">{visiblePrompt}</p>
          {promptIsLong && (
            <button
              type="button"
              aria-expanded={promptExpanded}
              onClick={() => setPromptExpanded((value) => !value)}
              className="mt-1.5 flex items-center gap-1 rounded-sm text-fine font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {promptExpanded ? (
                <ChevronUp className="size-3" aria-hidden />
              ) : (
                <ChevronDown className="size-3" aria-hidden />
              )}
              {t(promptExpanded ? "turn.showLess" : "turn.showMore")}
            </button>
          )}
        </div>
      </div>

      {history.canvases.length > 0 && (
        <div className="mt-3 flex flex-col gap-2" aria-label="Canvas history">
          {history.canvases.map((canvas) => {
            const snapshot = snapshots[canvasKey(canvas)];
            const thumbnail = snapshot?.exports.find((item) => item.kind === "overview") ?? snapshot?.exports[0];
            return (
              <section key={canvasKey(canvas)} className="canvas-ui-module border bg-fill-quiet p-2.5 text-fine">
                <div className="flex items-start gap-2">
                  {thumbnail && (
                    <img
                      src={canvasExportDataUrl(thumbnail)}
                      alt={`${canvas.title} thumbnail`}
                      className="size-14 shrink-0 rounded border object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-foreground">{canvas.title}</h3>
                    <p className="text-muted-foreground">
                      rev {canvas.revision}
                      {snapshot ? ` · ${snapshot.objectCount} objects` : ""}
                      {snapshot?.frozenAt ? ` · ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(snapshot.frozenAt)}` : ""}
                    </p>
                    {canvas.textOriginals.length > 0 && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                        {canvas.textOriginals.join("\n")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="canvas-ui-control border px-2 py-1 text-cap text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!snapshot?.exports.length}
                    onClick={() => downloadCanvasPng(canvas, snapshot)}
                  >
                    Export PNG
                  </button>
                  <button
                    type="button"
                    className="canvas-ui-control border px-2 py-1 text-cap text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    onClick={() => requestCanvasDuplicate(canvas)}
                  >
                    Duplicate into Composer
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* answer */}
      {turn.text && (
        <p className="mt-3.5 whitespace-pre-wrap break-words text-ui leading-[1.7] text-foreground/90">
          {turn.text}
        </p>
      )}

      {running && !turn.text && (
        <p className="mt-3.5 flex items-center gap-2 text-ui text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("turn.working")}
        </p>
      )}

      {turn.error && (
        <p className="mt-3.5 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-ui text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {turn.error}
        </p>
      )}

      {/* secondary detail + outcome, on one quiet line */}
      {(hasDetail || dur || turn.stopReason || (running && turn.text)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <Detail icon={Bot} label={t("turn.agents")} count={agents.length} wide>
            <div className="flex flex-col gap-1">
              {agents.map((agent) => (
                <div key={agent.id} className="rounded-md bg-fill-quiet px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2 text-fine">
                    <span className={cn("size-1.5 shrink-0 rounded-full", agentStatusDot(agent.status))} />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{agent.title}</span>
                    <span className="shrink-0 text-cap uppercase text-muted-foreground">{agent.role}</span>
                    <span className="shrink-0 text-muted-foreground">{agent.status}</span>
                  </div>
                  {agent.task && (
                    <p className="mt-0.5 line-clamp-2 ps-3.5 text-fine leading-relaxed text-muted-foreground">
                      {agent.task}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Detail>

          <Detail icon={Wrench} label={t("turn.tools")} count={turn.tools.length}>
            <div className="flex flex-col gap-0.5">
              {turn.tools.map((tool) => (
                <div key={tool.id} className="flex items-center gap-2 text-fine">
                  <span className={cn("size-1.5 shrink-0 rounded-full", toolStatusDot(tool.status))} />
                  <span className="truncate font-mono">{tool.title}</span>
                  <span className="ms-auto shrink-0 text-muted-foreground">{tool.status}</span>
                </div>
              ))}
            </div>
          </Detail>

          <Detail icon={Brain} label={t("turn.thinking")} count={turn.thoughts.length}>
            <div className="flex flex-col gap-1 text-fine italic text-muted-foreground">
              {turn.thoughts.map((thought, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {thought}
                </p>
              ))}
            </div>
          </Detail>

          <Detail icon={ListTodo} label={t("turn.plan")} count={turn.plan.length}>
            <ol className="grid list-decimal gap-0.5 ps-4 text-fine text-muted-foreground">
              {turn.plan.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </Detail>

          <Detail icon={BrainCircuit} label={t("turn.memory")} count={turn.memory?.items.length ?? 0}>
            {turn.memory && (
              <div className="flex flex-col gap-2 text-fine">
                <p className="text-muted-foreground">
                  {t("turn.memoryTokens", {
                    count: new Intl.NumberFormat(locale).format(turn.memory.estimated_tokens),
                  })}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {turn.memory.items.map((item) => {
                    const source = item.source
                      ? `${item.source.session_id.slice(0, 8)}:${item.source.part_seq}`
                      : t("memory.manual");
                    return (
                      <li key={item.id} className="rounded-md bg-fill-quiet px-2 py-1.5">
                        <div className="flex items-center gap-1.5 text-cap text-muted-foreground">
                          <span className="font-mono">{item.layer}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.category}</span>
                          <span className="ms-auto font-mono">{source}</span>
                        </div>
                        <p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-foreground/80">
                          {item.content}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Detail>

          <span className="ms-auto flex shrink-0 items-center gap-1.5">
            {running ? (
              <Badge variant="secondary" className="gap-1 text-cap uppercase">
                <Loader2 className="size-2.5 animate-spin" /> {t("turn.running")}
              </Badge>
            ) : turn.error ? (
              <Badge variant="destructive" className="text-cap uppercase">
                {t("turn.failed")}
              </Badge>
            ) : (
              turn.stopReason && (
                <Badge variant="outline" className="text-cap uppercase">
                  {turn.stopReason}
                </Badge>
              )
            )}
            {dur && <span className="font-mono text-cap text-muted-foreground">{dur}</span>}
          </span>
        </div>
      )}
    </article>
  );
});
