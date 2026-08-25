import { ChevronRight, PenLine } from "lucide-react";
import { useMemo, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";
import { diffLines, diffStats, type DiffLine } from "./lineDiff";
import { looksLikeUnifiedDiff, parseUnifiedDiff } from "./unifiedDiff";
import { DiffView } from "./DiffView";
import type { ToolEntry } from "./turns";

export interface FileChange {
  path: string;
  added: number;
  deleted: number;
  lines: DiffLine[];
}

/**
 * Latest diff per path across the whole turn. Protocol-level diff outputs win over the same
 * path recovered from a text-embedded unified diff.
 */
export function collectFileChanges(tools: readonly ToolEntry[]): FileChange[] {
  const byPath = new Map<string, FileChange>();
  const order: string[] = [];
  const upsert = (change: FileChange, replace: boolean) => {
    if (!byPath.has(change.path)) order.push(change.path);
    else if (!replace) return;
    byPath.set(change.path, change);
  };
  for (const tool of tools) {
    for (const output of tool.outputs ?? []) {
      if (output.type === "text" && looksLikeUnifiedDiff(output.text)) {
        for (const file of parseUnifiedDiff(output.text)) {
          upsert({ path: file.path, added: file.added, deleted: file.deleted, lines: file.lines }, false);
        }
      }
    }
  }
  for (const tool of tools) {
    for (const output of tool.outputs ?? []) {
      if (output.type === "diff") {
        const lines = diffLines(output.old_text, output.new_text);
        upsert({ path: output.path, lines, ...diffStats(lines) }, true);
      }
    }
  }
  return order.map((path) => byPath.get(path) as FileChange);
}

/**
 * "N files changed +A −D" summary card for a turn, with per-file expandable diffs.
 * Renders nothing when the turn produced no diff data.
 */
export function TurnChangesCard({ tools }: { tools: readonly ToolEntry[] }) {
  const t = useT();
  const changes = useMemo(() => collectFileChanges(tools), [tools]);
  const [openPath, setOpenPath] = useState<string | null>(null);
  if (changes.length === 0) return null;
  const totalAdded = changes.reduce((sum, change) => sum + change.added, 0);
  const totalDeleted = changes.reduce((sum, change) => sum + change.deleted, 0);

  return (
    <Collapsible
      defaultOpen
      className="mt-3.5 min-w-0 overflow-hidden rounded-(--ds-radius-module) border bg-fill-quiet"
      data-changes-card
    >
      <CollapsibleTrigger
        className="group flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-fine transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <PenLine className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {t("changes.title", { count: changes.length })}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-cap">
          <span className="text-success">+{totalAdded}</span>
          <span className="text-destructive">−{totalDeleted}</span>
        </span>
        <ChevronRight
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="min-w-0 divide-y divide-border">
        {changes.map((change) => (
          <div key={change.path}>
            <button
              type="button"
              aria-expanded={openPath === change.path}
              onClick={() => setOpenPath((current) => (current === change.path ? null : change.path))}
              className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-fine transition-colors hover:bg-accent/35 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-mono",
                  openPath === change.path ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {change.path}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-cap">
                <span className="text-success">+{change.added}</span>
                <span className="text-destructive">−{change.deleted}</span>
              </span>
            </button>
            {openPath === change.path ? (
              <div className="px-2 pb-2">
                <DiffView
                  path={change.path}
                  lines={change.lines}
                  added={change.added}
                  deleted={change.deleted}
                  labels={{
                    expandLines: (count) => t("diff.expandLines", { count }),
                    copy: t("turn.copy"),
                  }}
                />
              </div>
            ) : null}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
