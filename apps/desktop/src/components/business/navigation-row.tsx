import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavigationRowProps {
  readonly label: string;
  readonly leading: ReactNode;
  readonly meta?: ReactNode;
  readonly current?: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly accessibilityLabel?: string;
  readonly tooltip?: string;
  readonly className?: string;
  readonly labelClassName?: string;
  readonly onSelect: () => void;
}

const NavigationRow = ({
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
}: NavigationRowProps) => {
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
      {meta ? (
        <span
          data-slot="navigation-row-meta"
          className="gap-control-group flex shrink-0 items-center"
        >
          {meta}
        </span>
      ) : null}
    </Button>
  );

  if (!tooltip) {
    return row;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
};

export { NavigationRow, type NavigationRowProps };
