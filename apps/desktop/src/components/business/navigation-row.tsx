import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavigationRowProps {
  label: string;
  leading: ReactNode;
  meta?: ReactNode;
  current?: boolean;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  tooltip?: string;
  className?: string;
  labelClassName?: string;
  onSelect: () => void;
}

function NavigationRow({
  label,
  leading,
  meta,
  current = false,
  disabled = false,
  busy = false,
  accessibilityLabel,
  tooltip,
  className,
  labelClassName,
  onSelect,
}: NavigationRowProps) {
  const row = (
    <Button
      type="button"
      variant="selectable"
      size="row"
      focusStyle="inset"
      data-slot="navigation-row"
      data-selected={current ? "true" : "false"}
      aria-current={current ? "page" : undefined}
      aria-label={accessibilityLabel}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={onSelect}
      className={cn("min-w-0 items-center", className)}
    >
      <span
        data-slot="navigation-row-leading"
        className={cn(
          "flex shrink-0 items-center justify-center",
          current ? "text-current" : "text-muted-foreground"
        )}
        aria-hidden="true"
      >
        {leading}
      </span>
      <span
        data-slot="navigation-row-label"
        className={cn("min-w-0 flex-1 truncate", labelClassName)}
      >
        {label}
      </span>
      {meta == null ? null : (
        <span
          data-slot="navigation-row-meta"
          className="gap-control-group flex shrink-0 items-center"
        >
          {meta}
        </span>
      )}
    </Button>
  );

  if (tooltip == null || tooltip === "") return row;
  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export { NavigationRow, type NavigationRowProps };
