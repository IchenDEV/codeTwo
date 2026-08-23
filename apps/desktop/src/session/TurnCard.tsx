import {
  Bot,
  Brain,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  ListTodo,
  MoreHorizontal,
  Wrench,
} from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { ActivityOrb } from "@/components/ui/activity-orb";
import { deriveAgentRoster } from "./agentActivity";
import {
  canvasExportDataUrl,
  collapsedPrompt,
  isLongPrompt,
  parseCanvasHistoryPrompt,
  type CanvasHistoryMarker,
} from "./promptPreview";
import { isRunning, type ToolEntry, type Turn } from "./turns";
import {
  canvasGetSnapshot,
  getArtifact,
  openExternal,
  revealArtifact,
  saveArtifactAs,
  type ArtifactRef,
  type CanvasSnapshot,
} from "../bridge";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage, useT } from "../i18n";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "./MarkdownContent";

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

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function safeResourceLink(uri: string): { uri: string; host: string } | null {
  try {
    const parsed = new URL(uri);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null;
    }
    return { uri: parsed.toString(), host: parsed.host };
  } catch {
    return null;
  }
}

function ArtifactImage({ artifact }: { artifact: ArtifactRef }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    void getArtifact(artifact.id)
      .then((bytes) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(
          new Blob([bytes.slice().buffer as ArrayBuffer], { type: artifact.mime_type }),
        );
        setUrl(objectUrl);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifact.id, artifact.mime_type]);

  return (
    <figure className="min-w-0 overflow-hidden rounded-(--ds-radius-module) border bg-fill-quiet">
      <div className="image-checker flex min-h-32 items-center justify-center">
        {url ? (
          <img
            src={url}
            alt={artifact.display_name}
            className="max-h-96 w-full object-contain"
            onError={() => setError(true)}
          />
        ) : (
          <span className={cn("px-4 py-10 text-fine text-muted-foreground", error && "text-destructive")}>
            {error ? "Image unavailable" : "Loading image…"}
          </span>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center gap-2 bg-background/60 px-2.5 py-2 text-fine text-muted-foreground">
        <span className="min-w-0 flex-1 truncate text-foreground">{artifact.display_name}</span>
        <span>{artifact.width} × {artifact.height}</span>
        <span>{prettySize(artifact.bytes)}</span>
        <button
          type="button"
          className="rounded p-1 hover:bg-accent hover:text-foreground"
          title="Save As"
          onClick={() => {
            setActionError(null);
            void saveArtifactAs(artifact.id, artifact.display_name).catch(() =>
              setActionError("Could not save image"),
            );
          }}
        >
          <Download className="size-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 hover:bg-accent hover:text-foreground"
          title="Reveal in Finder"
          onClick={() => {
            setActionError(null);
            void revealArtifact(artifact.id).catch(() => setActionError("Could not reveal image"));
          }}
        >
          <FolderOpen className="size-3.5" />
        </button>
        {actionError && <span className="basis-full text-destructive">{actionError}</span>}
      </figcaption>
    </figure>
  );
}

function ToolCallBlock({ tool }: { tool: ToolEntry }) {
  const textOutputs = (tool.outputs ?? []).flatMap((output) =>
    output.type === "text" ? [output.text] : [],
  );
  const images = (tool.outputs ?? []).flatMap((output) =>
    output.type === "image" ? [output.artifact] : [],
  );
  const resourceLinks = (tool.outputs ?? []).flatMap((output) => {
    if (output.type !== "resource_link") return [];
    const safe = safeResourceLink(output.uri);
    return safe ? [{ ...output, ...safe }] : [];
  });
  const hasOutput = textOutputs.length + images.length + resourceLinks.length > 0;
  const [open, setOpen] = useState(
    (tool.status !== "completed" && tool.status !== "failed") ||
      images.length + resourceLinks.length > 0,
  );
  const header = (
    <>
      <Wrench className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{tool.title}</span>
      {tool.kind ? (
        <span className="shrink-0 font-mono text-cap text-muted-foreground">{tool.kind}</span>
      ) : null}
      <span className="flex shrink-0 items-center gap-1.5 text-fine">
        <span className={cn("size-1.5 rounded-full", toolStatusDot(tool.status))} aria-hidden />
        {tool.status}
      </span>
    </>
  );

  if (!hasOutput) {
    return (
      <div
        className="my-3 flex min-w-0 items-center gap-2 px-1 py-1.5 text-ui text-muted-foreground"
        data-tool-call={tool.id}
      >
        {header}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="my-3 min-w-0" data-tool-call={tool.id}>
      <CollapsibleTrigger
        className="group flex w-full min-w-0 items-center gap-2 rounded-(--ds-radius-control) px-1 py-1.5 text-left text-ui text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {header}
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
      </CollapsibleTrigger>
        <CollapsibleContent className="mt-1.5 min-w-0 divide-y divide-border overflow-hidden rounded-(--ds-radius-module) border bg-fill-quiet">
          {textOutputs.map((output, index) => (
            <pre
              key={index}
              className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-code leading-relaxed"
            >
              <code>{output}</code>
            </pre>
          ))}
          {images.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2" aria-label="Generated images">
              {images.map((artifact) => (
                <ArtifactImage key={artifact.id} artifact={artifact} />
              ))}
            </div>
          ) : null}
          {resourceLinks.length > 0 ? (
            <div className="flex flex-col gap-1.5 p-2" aria-label="Tool links">
              {resourceLinks.map((link) => (
                <button
                  key={link.uri}
                  type="button"
                  className="flex min-w-0 items-center gap-2 rounded-(--ds-radius-control) px-2 py-1.5 text-left text-fine transition-colors hover:bg-accent/50"
                  title={link.uri}
                  onClick={() => void openExternal(link.uri)}
                >
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{link.name}</span>
                  <span className="max-w-52 truncate font-mono text-cap text-muted-foreground">
                    {link.host}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

type RenderBlock =
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: ToolEntry };

/** Join adjacent streamed chunks while retaining tool calls at their exact event boundary. */
function orderedBlocks(turn: Turn): RenderBlock[] {
  const tools = new Map(turn.tools.map((tool) => [tool.id, tool]));
  const seenTools = new Set<string>();
  const blocks: RenderBlock[] = [];
  for (const entry of turn.content ?? []) {
    if (entry.kind === "text") {
      const tail = blocks[blocks.length - 1];
      if (tail?.kind === "text") tail.text += entry.text;
      else blocks.push({ kind: "text", text: entry.text });
      continue;
    }
    const tool = tools.get(entry.toolId);
    if (!tool || seenTools.has(tool.id)) continue;
    seenTools.add(tool.id);
    blocks.push({ kind: "tool", tool });
  }
  // Compatibility for turns produced by older renderers and manually constructed fixtures.
  if (blocks.length === 0 && turn.text) blocks.push({ kind: "text", text: turn.text });
  for (const tool of turn.tools) {
    if (!seenTools.has(tool.id)) blocks.push({ kind: "tool", tool });
  }
  return blocks;
}

/**
 * Plan entries → checklist markdown (R4 plan-as-document). Transcript plan entries are plain
 * strings — the engine keeps only the entry content — so an entry already carrying a checkbox
 * marker keeps its state and everything else starts unchecked.
 */
export function planChecklistMarkdown(entries: readonly string[]): string {
  return entries
    .map((entry) => {
      const marked = /^\s*(?:-\s*)?\[([ xX])\]\s*(.*)$/.exec(entry);
      if (marked) return `- [${marked[1] === " " ? " " : "x"}] ${marked[2]}`;
      return `- [ ] ${entry}`;
    })
    .join("\n");
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

/** A collapsible group of secondary detail (agents / thinking / plan / memory). */
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
 * transcript reads as a conversation instead of a stack of equally-weighted cards. Tool calls keep
 * their streamed position; thinking and plan metadata stay collapsed underneath.
 */
export const TurnCard = memo(function TurnCard({
  turn,
  canvasSnapshotLoader = canvasGetSnapshot,
  onOpenPlanAsDocument,
  onPinPlanArtifact,
  canPinPlan = false,
  onSaveTemplate,
}: {
  turn: Turn;
  canvasSnapshotLoader?: typeof canvasGetSnapshot;
  /** Opens the plan in the composer document (R4). Absent → the affordance is hidden. */
  onOpenPlanAsDocument?: (entries: string[]) => void;
  /** Pins the plan as a scene artifact. Only offered while `canPinPlan` is set. */
  onPinPlanArtifact?: (markdown: string) => void;
  /** True when the active scene declares a `plan`-kind artifact. */
  canPinPlan?: boolean;
  /** Opens the R2 template dialog over this turn's prompt. Absent → the turn menu is hidden. */
  onSaveTemplate?: (promptText: string) => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const [promptExpanded, setPromptExpanded] = useState(false);
  const running = isRunning(turn);
  const dur = duration(turn);
  const agents = useMemo(() => deriveAgentRoster(turn.tools), [turn.tools]);
  const blocks = useMemo(() => orderedBlocks(turn), [turn.content, turn.text, turn.tools]);
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
      turn.thoughts.length +
      turn.plan.length +
      (turn.memory?.items.length ?? 0) >
    0;
  const promptIsLong = isLongPrompt(history.visiblePrompt);
  const visiblePrompt = promptIsLong && !promptExpanded
    ? collapsedPrompt(history.visiblePrompt)
    : history.visiblePrompt;

  return (
    // Turns arrive one at a time, so each one entering under its own animation reads as the
    // conversation advancing rather than the list redrawing.
    <article aria-busy={running} className="animate-rise-in py-7">
      {/* prompt */}
      <div className="group/prompt flex items-start justify-end gap-1">
        {/* Hover-visible turn menu (SessionRail hover-actions idiom). A menu rather than a bare
            button so future turn actions slot in beside "Save as template…". */}
        {onSaveTemplate && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<button
                type="button"
                aria-label={t("templateFrom.menu")}
                className="mt-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 group-hover/prompt:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="size-3.5" aria-hidden />
              </button>}
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSaveTemplate(history.visiblePrompt)}>
                {t("templateFrom.saveAs")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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

      {/* Streamed answer blocks keep provider order: text → tool → text → visual/chart. */}
      {blocks.length > 0 ? (
        <div className="mt-3.5 min-w-0">
          {blocks.map((block, index) =>
            block.kind === "text" ? (
              <MarkdownContent
                key={`text-${index}`}
                text={block.text}
                streaming={running && index === blocks.length - 1}
              />
            ) : (
              <ToolCallBlock key={block.tool.id} tool={block.tool} />
            ),
          )}
        </div>
      ) : null}

      {running && !turn.text && (
        <p
          role="status"
          aria-live="polite"
          className="mt-3.5 flex items-center gap-2 text-ui text-muted-foreground"
        >
          <ActivityOrb
            state={turn.thoughts.length > 0 ? "solving" : "working"}
            aria-hidden="true"
          />
          {t("turn.working")}
        </p>
      )}

      {turn.error && (
        <p className="mt-3.5 flex items-start gap-1.5 rounded-(--ds-radius-control) bg-destructive/10 px-3 py-2 text-ui text-destructive">
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
            {(onOpenPlanAsDocument || (canPinPlan && onPinPlanArtifact)) && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {onOpenPlanAsDocument && (
                  <button
                    type="button"
                    className="rounded-(--ds-radius-control) border px-2 py-1 text-cap text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                    onClick={() => onOpenPlanAsDocument([...turn.plan])}
                  >
                    {t("planDoc.open")}
                  </button>
                )}
                {canPinPlan && onPinPlanArtifact && (
                  <button
                    type="button"
                    className="rounded-(--ds-radius-control) border px-2 py-1 text-cap text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                    onClick={() => onPinPlanArtifact(planChecklistMarkdown(turn.plan))}
                  >
                    {t("planDoc.pin")}
                  </button>
                )}
              </div>
            )}
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
