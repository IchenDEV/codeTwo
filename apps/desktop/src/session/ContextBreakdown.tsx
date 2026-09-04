import { Button } from "@/components/ui/button";
import { Minimize2, X } from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { useT } from "../i18n";
import type { ContextCategory, ContextWindow } from "./contextWindow";
import { formatContextTokens, contextWindowPercentage } from "./contextWindow";

/**
 * Fixed palette for context categories. Color follows the category identity,
 * never its position, so reordering cannot repaint them.
 */
const categoryColors: Record<string, string> = {
  conversation: "var(--ds-color-chart-6)",
  mcp_dynamic_tools: "var(--ds-color-chart-4)",
  rules: "var(--ds-color-chart-2)",
  skills: "var(--ds-color-chart-3)",
  subagent_definitions: "var(--ds-color-chart-5)",
  system_prompt: "var(--ds-color-text-muted)",
  tool_definitions: "var(--ds-color-chart-1)",
};

function categoryColor(id: string): string {
  return categoryColors[id] ?? "var(--ds-color-text-muted)";
}

function CategoryRow({ category }: { readonly category: ContextCategory }) {
  const t = useT();
  const key =
    `context.category.${category.id}` as "context.category.system_prompt";
  const label = t(key);

  return (
    <div className="flex items-center gap-3 py-1">
      <span
        className="rounded-control size-2.5 shrink-0"
        style={{ background: categoryColor(category.id) }}
      />
      <span className="text-body text-foreground/90 min-w-0 flex-1 truncate">
        {label}
      </span>
      <span className="text-metadata text-muted-foreground shrink-0 font-mono tabular-nums">
        {formatContextTokens(category.tokens)}
      </span>
    </div>
  );
}

function SegmentedBar({
  categories,
  capacity,
}: {
  readonly categories: ContextCategory[];
  readonly capacity: number;
}) {
  if (capacity <= 0) {
    return null;
  }
  return (
    <div className="bg-muted/60 flex h-2.5 w-full overflow-hidden rounded-full">
      {categories.map((cat) => {
        const pct = (cat.tokens / capacity) * 100;
        if (pct < 0.2) {
          return null;
        }
        return (
          <div
            key={cat.id}
            className="h-full transition-[width] duration-(--ds-motion-page)"
            style={{
              backgroundColor: categoryColor(cat.id),
              width: `${pct}%`,
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
  onCompact,
  compactDisabled = false,
  compactDisabledReason = null,
}: {
  readonly contextWindow: ContextWindow;
  readonly onClose: () => void;
  readonly onCompact?: () => void;
  readonly compactDisabled?: boolean;
  readonly compactDisabledReason?: string | null;
}) {
  const t = useT();
  const percentage = contextWindowPercentage(contextWindow);
  const percentLabel = percentage === null ? 0 : Math.round(percentage);
  const { breakdown } = contextWindow;

  return (
    <div className="w-80">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-body text-foreground font-semibold">
            {t("context.title")}
          </h3>
          <p className="text-callout text-muted-foreground mt-0.5">
            {t("context.percentFull", { percent: String(percentLabel) })}
            <span className="ml-3">
              {t("context.tokenSummary", {
                capacity: formatContextTokens(contextWindow.contextWindow),
                used: formatContextTokens(contextWindow.usedTokens),
              })}
            </span>
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          className="text-muted-foreground shrink-0"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {breakdown && breakdown.length > 0 ? (
        <>
          <div className="mt-3">
            <SegmentedBar
              categories={breakdown}
              capacity={contextWindow.contextWindow}
            />
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
            <div className="bg-muted/60 flex h-2.5 w-full overflow-hidden rounded-full">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-(--ds-motion-page)",
                  percentLabel > 85
                    ? "bg-destructive"
                    : percentLabel > 60
                      ? "bg-warning"
                      : "bg-primary"
                )}
                style={{ width: `${percentLabel}%` }}
              />
            </div>
          </div>
          <p className="text-callout text-muted-foreground mt-3">
            {t("context.noBreakdown")}
          </p>
        </>
      )}

      {onCompact ? (
        <div className="mt-3">
          <Separator className="mb-3" />
          <p className="text-callout text-muted-foreground">
            {t("context.nativeCompaction")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2 w-full"
            disabled={compactDisabled}
            onClick={onCompact}
          >
            <Minimize2 className="size-3.5" />
            {t("context.compact")}
          </Button>
          {compactDisabled &&
          compactDisabledReason != null &&
          compactDisabledReason !== "" ? (
            <p className="text-callout text-muted-foreground mt-1.5">
              {compactDisabledReason}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
