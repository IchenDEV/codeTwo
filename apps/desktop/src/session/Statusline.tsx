import { useState } from "react";
import { Gauge } from "@/components/ui/icons";

import {
  describeContextWindow,
  formatExactContextTokens,
  formatContextWindowPercentage,
  type ContextWindow,
} from "./contextWindow";
import { ContextBreakdown } from "./ContextBreakdown";
// Explicit extension: this dir holds both `statusline.ts` (logic) and `Statusline.tsx` (this
// file), and bun's resolver matches the pair case-insensitively without it.
import { contextTone, formatCost } from "./statusline.ts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

export interface StatuslineUsage {
  costUsd: number | null;
  /** Output tokens per minute, derived from successive usage polls. */
  burnRate: number | null;
}

/**
 * The per-session statusline in the Composer controls row (roadmap R7): the context-window
 * meter that used to be `ContextWindowStatus`, now with a tone dot at 60%/85% fill, plus a
 * cost segment that only appears once the core's per-session usage command exists (the bridge
 * feature-detects it; `usage` stays null until then). One Chip-sized control either way.
 *
 * Clicking opens a detailed context breakdown popover showing per-category token allocation.
 */
export const Statusline = ({
  contextWindow,
  usage,
  onCompact,
  compactDisabled = false,
  compactDisabledReason = null,
}: {
  readonly contextWindow: ContextWindow | null;
  readonly usage: StatuslineUsage | null;
  readonly onCompact?: () => void;
  readonly compactDisabled?: boolean;
  readonly compactDisabledReason?: string | null;
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const display = describeContextWindow(contextWindow);
  const cost =
    usage && usage.costUsd !== null ? formatCost(usage.costUsd) : null;
  const burn =
    usage && usage.burnRate !== null && Number.isFinite(usage.burnRate)
      ? t("statusline.burn", { rate: String(Math.round(usage.burnRate)) })
      : null;
  if (!contextWindow || !display) {
    if (!cost && !burn) return null;
    return (
      <span className="text-metadata text-muted-foreground flex shrink-0 items-center gap-1.5 px-0 py-1 @lg/composer:px-1.5">
        {cost ? <span>{cost}</span> : null}
        {burn ? <span>{burn}</span> : null}
      </span>
    );
  }
  const exact = t("composer.contextWindowExact", {
    used: formatExactContextTokens(contextWindow.usedTokens),
    capacity: formatExactContextTokens(contextWindow.contextWindow),
    percentage: formatContextWindowPercentage(contextWindow),
  });
  const tone = contextTone(
    display.percentage !== null ? display.percentage / 100 : null
  );

  const chipContent = (
    <>
      {(tone === "warn" || tone === "critical") && (
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            tone === "critical" ? "bg-destructive" : "bg-warning"
          )}
        />
      )}
      <Gauge
        className="hidden size-3.5 shrink-0 @lg/composer:inline"
        aria-hidden="true"
      />
      <span className="hidden @lg/composer:inline" aria-hidden="true">
        {display.compact}
      </span>
      <span className="@lg/composer:hidden" aria-hidden="true">
        {display.capacity}
      </span>
      {usage && (cost || burn) ? <span
          aria-hidden="true"
          className="hidden items-center gap-1.5 @lg/composer:flex"
        >
          {cost ? <>
              <span>·</span>
              <span>{cost}</span>
            </> : null}
          {burn ? <>
              <span>·</span>
              <span>{burn}</span>
            </> : null}
        </span> : null}
    </>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <PopoverTrigger
          render={
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  focusStyle="inset"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={contextWindow.contextWindow}
                  aria-valuenow={Math.min(
                    contextWindow.usedTokens,
                    contextWindow.contextWindow
                  )}
                  aria-valuetext={exact}
                  aria-label={exact}
                  className={cn(
                    "text-metadata shrink-0 gap-1.5 px-0 @lg/composer:px-1.5",
                    tone === "warn" && "text-warning",
                    tone === "critical" && "text-destructive",
                    (tone === "ok" || tone === null) && "text-muted-foreground"
                  )}
                >
                  {chipContent}
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          <div className="space-y-0.5">
            <div>
              {t("statusline.contextTitle")}: {exact}
            </div>
            {cost ? <div>{t("statusline.cost", { cost })}</div> : null}
            {burn ? <div>{burn}</div> : null}
          </div>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={12}
        className="w-auto p-3"
      >
        <ContextBreakdown
          contextWindow={contextWindow}
          onClose={() => setOpen(false)}
          onCompact={
            onCompact
              ? () => {
                  onCompact();
                  setOpen(false);
                }
              : undefined
          }
          compactDisabled={compactDisabled}
          compactDisabledReason={compactDisabledReason}
        />
      </PopoverContent>
    </Popover>
  );
}
