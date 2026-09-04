import { forwardRef, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ControlChipProps = ComponentProps<typeof Button> & {
  readonly tone?: "neutral" | "warning";
};

/** Compact text control for composer and toolbar status rows. */
const ControlChip = forwardRef<HTMLButtonElement, ControlChipProps>(
  ({ children, tone = "neutral", className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="compact"
      focusStyle="inset"
      data-slot="control-chip"
      className={cn(
        "text-metadata shrink-0 gap-1.5",
        tone === "warning"
          ? "text-warning"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </Button>
  )
);
ControlChip.displayName = "ControlChip";

export { ControlChip, type ControlChipProps };
