import { X } from "lucide-react";

import type { ContextCategory, ContextWindow } from "./contextWindow";
import { formatContextTokens, contextWindowPercentage } from "./contextWindow";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

/**
 * Fixed palette for context categories. Color follows the category identity,
 * never its position, so reordering cannot repaint them.
 */
const CATEGORY_COLORS: Record<string, string> = {
  system_prompt: "var(--ds-color-text-muted)",
  tool_definitions: "var(--ds-color-chart-1)",
  rules: "var(--ds-color-chart-2)",
  skills: "var(--ds-color-chart-3)",
  mcp_dynamic_tools: "var(--ds-color-chart-4)",
  subagent_definitions: "var(--ds-color-chart-5)",
  conversation: "var(--ds-color-chart-6)",
};

function categoryColor(id: string): string {
  return CATEGORY_COLORS[id] ?? "var(--ds-color-text-muted)";
}

function CategoryRow({ category }: { category: ContextCategory }) {
  const t = useT();
  const key = `context.category.${category.id}` as "context.category.system_prompt";
  const label = t(key);

  return (
    <div className="flex items-center gap-3 py-1">
      <span
        className="size-2.5 shrink-0 rounded-(--ds-radius-micro)"
        style={{ background: categoryColor(category.id) }}
      />
      <span className="min-w-0 flex-1 truncate text-ui text-foreground/90">{label}</span>
      <span className="shrink-0 font-mono text-hint tabular-nums text-muted-foreground">
        {formatContextTokens(category.tokens)}
      </span>
    </div>
  );
}

/**
 * A segmented bar that shows how each context category fills the total window.
 * Each segment's width is proportional to its token count relative to the total capacity.
 */
function SegmentedBar({
  categories,
  capacity,
}: {
  categories: ContextCategory[];
  capacity: number;
}) {
  if (capacity <= 0) return null;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
      {categories.map((cat) => {
        const pct = (cat.tokens / capacity) * 100;
        if (pct < 0.2) return null;
        return (
          <div
            key={cat.id}
            className="h-full transition-[width] duration-(--ds-motion-page)"
            style={{
              width: `${pct}%`,
              backgroundColor: categoryColor(cat.id),
            }}
          />
        );
      })}
    </div>
  );
}

export function ContextBreakdown({
  contextWindow,
  onClose,
}: {
  contextWindow: ContextWindow;
  onClose: () => void;
}) {
  const t = useT();
  const percentage = contextWindowPercentage(contextWindow);
  const percentLabel = percentage !== null ? Math.round(percentage) : 0;
  const breakdown = contextWindow.breakdown;

  return (
    <div className="w-80">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-ui font-semibold text-foreground">
            {t("context.title")}
          </h3>
          <p className="mt-0.5 text-fine text-muted-foreground">
            {t("context.percentFull", { percent: String(percentLabel) })}
            <span className="ml-3">
              {t("context.tokenSummary", {
                used: formatContextTokens(contextWindow.usedTokens),
                capacity: formatContextTokens(contextWindow.contextWindow),
              })}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-(--ds-radius-micro) p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {breakdown && breakdown.length > 0 ? (
        <>
          <div className="mt-3">
            <SegmentedBar categories={breakdown} capacity={contextWindow.contextWindow} />
          </div>
          <div className="mt-3 space-y-0">
            {breakdown.map((cat) => (
              <CategoryRow key={cat.id} category={cat} />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mt-3">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-(--ds-motion-page)",
                  percentLabel > 85
                    ? "bg-destructive"
                    : percentLabel > 60
                      ? "bg-warning"
                      : "bg-primary",
                )}
                style={{ width: `${percentLabel}%` }}
              />
            </div>
          </div>
          <p className="mt-3 text-fine text-muted-foreground">
            {t("context.noBreakdown")}
          </p>
        </>
      )}
    </div>
  );
}
