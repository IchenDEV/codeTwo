import { Brain, ChevronRight, CircleAlert, Loader2, ListTodo, Wrench } from "lucide-react";
import { isRunning, type Turn } from "./turns";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

function duration(t: Turn): string | null {
  if (!t.endedAt) return null;
  const s = Math.max(0, Math.round((t.endedAt - t.startedAt) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

/** A collapsible group of secondary detail (thinking / tools / plan). */
function Detail({
  icon: Icon,
  label,
  count,
  children,
}: {
  icon: typeof Brain;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group -ml-1 flex items-center gap-1.5 rounded px-1 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
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
  const running = isRunning(turn);
  const dur = duration(turn);
  const hasDetail = turn.tools.length + turn.thoughts.length + turn.plan.length > 0;

  return (
    <div className="py-5">
      {/* prompt */}
      <div className="flex justify-end">
        <div className="max-w-[86%] whitespace-pre-wrap break-words rounded-2xl bg-secondary px-3.5 py-2 text-[13px] leading-relaxed text-secondary-foreground">
          {turn.prompt}
        </div>
      </div>

      {/* answer */}
      {turn.text && (
        <p className="mt-3.5 whitespace-pre-wrap break-words text-[13.5px] leading-[1.7] text-foreground/90">
          {turn.text}
        </p>
      )}

      {running && !turn.text && (
        <p className="mt-3.5 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Working…
        </p>
      )}

      {turn.error && (
        <p className="mt-3.5 flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          {turn.error}
        </p>
      )}

      {/* secondary detail + outcome, on one quiet line */}
      {(hasDetail || dur || turn.stopReason || (running && turn.text)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <Detail icon={Wrench} label="tools" count={turn.tools.length}>
            <div className="space-y-0.5">
              {turn.tools.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-[11px]">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      t.status === "completed"
                        ? "bg-success"
                        : t.status === "failed"
                          ? "bg-destructive"
                          : "bg-warning",
                    )}
                  />
                  <span className="truncate font-mono">{t.title}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">{t.status}</span>
                </div>
              ))}
            </div>
          </Detail>

          <Detail icon={Brain} label="thinking" count={turn.thoughts.length}>
            <div className="space-y-1 text-[11px] italic text-muted-foreground">
              {turn.thoughts.map((t, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  {t}
                </p>
              ))}
            </div>
          </Detail>

          <Detail icon={ListTodo} label="plan" count={turn.plan.length}>
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {turn.plan.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </Detail>

          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {running ? (
              <Badge variant="secondary" className="gap-1 text-[9px] uppercase">
                <Loader2 className="size-2.5 animate-spin" /> running
              </Badge>
            ) : turn.error ? (
              <Badge variant="destructive" className="text-[9px] uppercase">
                failed
              </Badge>
            ) : (
              turn.stopReason && (
                <Badge variant="outline" className="text-[9px] uppercase">
                  {turn.stopReason}
                </Badge>
              )
            )}
            {dur && <span className="font-mono text-[10px] text-muted-foreground">{dur}</span>}
          </span>
        </div>
      )}
    </div>
  );
}
