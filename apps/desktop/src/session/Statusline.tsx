import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Gauge } from "@/components/ui/icons";
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
import { cn } from "@/lib/utils";

import { useT } from "../i18n";
import { ContextBreakdown } from "./ContextBreakdown";
import {
  describeContextWindow,
  formatExactContextTokens,
  formatContextWindowPercentage,
} from "./contextWindow";
import type { ContextWindow } from "./contextWindow";
// Explicit extension: this dir holds both `statusline.ts` (logic) and `Statusline.tsx` (this
// file), and bun's resolver matches the pair case-insensitively without it.
import { contextTone, formatCost } from "./statusline.ts";

export interface StatuslineUsage {
  costUsd: number | null;
  /**
  Output tokens per minute, derived from successive usage polls.
  */
  burnRate: number | null;
}

export function Statusline({
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
}) {
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
    if ((cost == null || cost === "") && (burn == null || burn === "")) {
      return null;
    }
    return (
      <span className="text-metadata text-muted-foreground flex shrink-0 items-center gap-1.5 px-0 py-1 @lg/composer:px-1.5">
        {cost != null && cost !== "" ? <span>{cost}</span> : null}
        {burn != null && burn !== "" ? <span>{burn}</span> : null}
      </span>
    );
  }
  const exact = t("composer.contextWindowExact", {
    capacity: formatExactContextTokens(contextWindow.contextWindow),
    percentage: formatContextWindowPercentage(contextWindow),
    used: formatExactContextTokens(contextWindow.usedTokens),
  });
  const tone = contextTone(
    display.percentage === null ? null : display.percentage / 100
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
      {usage && (cost || burn) ? (
        <span
          aria-hidden="true"
          className="hidden items-center gap-1.5 @lg/composer:flex"
        >
          {cost != null && cost !== "" ? (
            <>
              <span>·</span>
              <span>{cost}</span>
            </>
          ) : null}
          {burn != null && burn !== "" ? (
            <>
              <span>·</span>
              <span>{burn}</span>
            </>
          ) : null}
        </span>
      ) : null}
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
            {cost != null && cost !== "" ? (
              <div>{t("statusline.cost", { cost })}</div>
            ) : null}
            {burn != null && burn !== "" ? <div>{burn}</div> : null}
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
