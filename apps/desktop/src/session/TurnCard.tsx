import {
  Bot,
  Brain,
  BrainCircuit,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Loader2,
  ListTodo,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { deriveAgentRoster } from "./agentActivity";
import { collapsedPrompt, isLongPrompt } from "./promptPreview";
import { isRunning, type Turn } from "./turns";
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
      <CollapsibleTrigger className="group -ml-1 flex items-center gap-1.5 rounded px-1 py-1 text-fine text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
        <Icon className="size-3" />
        {label} ({count})
      </CollapsibleTrigger>
      <CollapsibleContent className="py-1 pl-4">{children}</CollapsibleContent>
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
export function TurnCard({ turn }: { turn: Turn }) {
  const t = useT();
  const { locale } = useLanguage();
  const [promptExpanded, setPromptExpanded] = useState(false);
  const running = isRunning(turn);
  const dur = duration(turn);
  const agents = useMemo(() => deriveAgentRoster(turn.tools), [turn.tools]);
  const hasDetail =
    agents.length +
      turn.tools.length +
      turn.thoughts.length +
      turn.plan.length +
      (turn.memory?.items.length ?? 0) >
    0;
  const promptIsLong = isLongPrompt(turn.prompt);
  const visiblePrompt = promptIsLong && !promptExpanded ? collapsedPrompt(turn.prompt) : turn.prompt;

  return (
    // Turns arrive one at a time, so each one entering under its own animation reads as the
    // conversation advancing rather than the list redrawing.
    <div className="animate-rise-in py-5">
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
            <div className="space-y-1">
              {agents.map((agent) => (
                <div key={agent.id} className="rounded-md bg-fill-quiet px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2 text-fine">
                    <span className={cn("size-1.5 shrink-0 rounded-full", agentStatusDot(agent.status))} />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{agent.title}</span>
                    <span className="shrink-0 text-cap uppercase text-muted-foreground">{agent.role}</span>
                    <span className="shrink-0 text-muted-foreground">{agent.status}</span>
                  </div>
                  {agent.task && (
                    <p className="mt-0.5 line-clamp-2 pl-3.5 text-fine leading-relaxed text-muted-foreground">
                      {agent.task}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Detail>

          <Detail icon={Wrench} label={t("turn.tools")} count={turn.tools.length}>
            <div className="space-y-0.5">
              {turn.tools.map((tool) => (
                <div key={tool.id} className="flex items-center gap-2 text-fine">
                  <span className={cn("size-1.5 shrink-0 rounded-full", toolStatusDot(tool.status))} />
                  <span className="truncate font-mono">{tool.title}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{tool.status}</span>
                </div>
              ))}
            </div>
          </Detail>

          <Detail icon={Brain} label={t("turn.thinking")} count={turn.thoughts.length}>
            <div className="space-y-1 text-fine italic text-muted-foreground">
              {turn.thoughts.map((thought, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {thought}
                </p>
              ))}
            </div>
          </Detail>

          <Detail icon={ListTodo} label={t("turn.plan")} count={turn.plan.length}>
            <ol className="list-decimal space-y-0.5 pl-4 text-fine text-muted-foreground">
              {turn.plan.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </Detail>

          <Detail icon={BrainCircuit} label={t("turn.memory")} count={turn.memory?.items.length ?? 0}>
            {turn.memory && (
              <div className="space-y-2 text-fine">
                <p className="text-muted-foreground">
                  {t("turn.memoryTokens", {
                    count: new Intl.NumberFormat(locale).format(turn.memory.estimated_tokens),
                  })}
                </p>
                <ul className="space-y-1.5">
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

          <span className="ml-auto flex shrink-0 items-center gap-1.5">
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
    </div>
  );
}
