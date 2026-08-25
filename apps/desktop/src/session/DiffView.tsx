import { ChevronRight, FileDiff } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";
import type { DiffLine } from "./lineDiff";

/** A run of context lines longer than this folds its middle behind an expander row. */
const CTX_FOLD_THRESHOLD = 10;
/** Context lines kept visible at each end of a folded run. */
const CTX_FOLD_EDGE = 5;

type Row =
  | { kind: "line"; line: DiffLine; index: number }
  /** `from`/`count` index into the original `lines` array for the hidden middle of a ctx run. */
  | { kind: "fold"; from: number; count: number };

/** Split into render rows, folding the middle of long context runs. */
function buildRows(lines: readonly DiffLine[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== "ctx") {
      rows.push({ kind: "line", line: lines[i], index: i });
      i++;
      continue;
    }
    let end = i;
    while (end < lines.length && lines[end].type === "ctx") end++;
    if (end - i > CTX_FOLD_THRESHOLD) {
      for (let k = i; k < i + CTX_FOLD_EDGE; k++) {
        rows.push({ kind: "line", line: lines[k], index: k });
      }
      rows.push({ kind: "fold", from: i + CTX_FOLD_EDGE, count: end - i - CTX_FOLD_EDGE * 2 });
      for (let k = end - CTX_FOLD_EDGE; k < end; k++) {
        rows.push({ kind: "line", line: lines[k], index: k });
      }
    } else {
      for (let k = i; k < end; k++) rows.push({ kind: "line", line: lines[k], index: k });
    }
    i = end;
  }
  return rows;
}

function DiffRow({ line }: { line: DiffLine }) {
  return (
    <div
      className={cn(
        "flex gap-2 px-3",
        line.type === "add" && "bg-success/10 text-success",
        line.type === "del" && "bg-destructive/10 text-destructive",
        line.type === "ctx" && "text-muted-foreground",
      )}
    >
      <span className="shrink-0 select-none" aria-hidden>
        {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
      </span>
      <span className="whitespace-pre-wrap break-words">{line.text}</span>
    </div>
  );
}

/**
 * One file's diff as a collapsible card, styled after the tool-output blocks in TurnCard.
 * Localisation is the integrator's job: pass `labels` to override the English defaults.
 */
export function DiffView({
  path,
  lines,
  added,
  deleted,
  defaultOpen = true,
  labels,
}: {
  path?: string;
  lines: readonly DiffLine[];
  added: number;
  deleted: number;
  defaultOpen?: boolean;
  labels?: { expandLines?: (count: number) => string; copy?: string };
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expandedFolds, setExpandedFolds] = useState<ReadonlySet<number>>(() => new Set());
  const expandLines = labels?.expandLines ?? ((count: number) => `Show ${count} more lines`);
  const copyLabel = labels?.copy ?? "Copy";
  const rows = useMemo(() => buildRows(lines), [lines]);
  const copyText = useMemo(
    () =>
      lines
        .map((line) => `${line.type === "add" ? "+" : line.type === "del" ? "-" : " "}${line.text}`)
        .join("\n"),
    [lines],
  );

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="my-3 min-w-0 overflow-hidden rounded-(--ds-radius-module) border bg-fill-quiet"
    >
      <div className="flex min-w-0 items-center gap-1 px-2 py-1.5">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 rounded-(--ds-radius-control) px-1 py-0.5 text-left text-fine text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <FileDiff className="size-3.5 shrink-0" aria-hidden />
          {path ? (
            <span className="min-w-0 flex-1 truncate font-mono text-foreground">{path}</span>
          ) : (
            <span className="min-w-0 flex-1" aria-hidden />
          )}
          <span className="flex shrink-0 items-center gap-1.5 font-mono">
            <span className="text-success">+{added}</span>
            <span className="text-destructive">−{deleted}</span>
          </span>
        </CollapsibleTrigger>
        <CopyButton text={copyText} label={copyLabel} />
        <button
          type="button"
          aria-label="Toggle diff"
          onClick={() => setOpen(!open)}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", open && "rotate-90")}
            aria-hidden
          />
        </button>
      </div>
      <CollapsibleContent className="min-w-0">
        <div className="max-h-96 overflow-auto py-1 font-mono text-code leading-relaxed">
          {rows.map((row) =>
            row.kind === "line" ? (
              <DiffRow key={row.index} line={row.line} />
            ) : expandedFolds.has(row.from) ? (
              <Fragment key={`fold-${row.from}`}>
                {lines.slice(row.from, row.from + row.count).map((line, offset) => (
                  <DiffRow key={row.from + offset} line={line} />
                ))}
              </Fragment>
            ) : (
              <button
                key={`fold-${row.from}`}
                type="button"
                onClick={() =>
                  setExpandedFolds((current) => {
                    const next = new Set(current);
                    next.add(row.from);
                    return next;
                  })
                }
                className="flex w-full items-center gap-2 px-3 py-0.5 text-left text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="shrink-0 select-none" aria-hidden>
                  {" "}
                </span>
                {expandLines(row.count)}
              </button>
            ),
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
