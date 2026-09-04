import {
  type ComponentProps,
  type KeyboardEventHandler,
  type ReactNode,
  forwardRef,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CompositeActionRowProps extends Omit<
  ComponentProps<"div">,
  "children" | "onClick"
> {
  readonly accessibilityLabel: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly current?: boolean;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly contentClassName?: string;
  readonly primaryClassName?: string;
  readonly onSelect: () => void;
  readonly onPrimaryKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
}

/**
 * A single semantic primary action with optional independent trailing controls.
 *
 * The full-row button sits behind non-interactive content. Trailing actions remain above it, so
 * callers never need a clickable div or nested buttons to build a dense navigation row.
 */
const CompositeActionRow = forwardRef<HTMLDivElement, CompositeActionRowProps>(
  function CompositeActionRow(
    {
      accessibilityLabel,
      children,
      actions,
      current = false,
      selected = false,
      disabled = false,
      className,
      contentClassName,
      primaryClassName,
      onSelect,
      onPrimaryKeyDown,
      ...props
    },
    ref
  ) {
    return (
      <div
        ref={ref}
        data-slot="composite-action-row"
        data-selected={selected ? "true" : "false"}
        className={cn("group relative flex min-w-0 items-center", className)}
        {...props}
      >
        <Button
          type="button"
          variant="ghost"
          focusStyle="inset"
          data-composite-row-select
          aria-label={accessibilityLabel}
          aria-current={current ? "page" : undefined}
          disabled={disabled}
          onClick={onSelect}
          onKeyDown={onPrimaryKeyDown}
          className={cn(
            "rounded-control absolute inset-0 z-0 h-auto w-full p-0 hover:bg-transparent",
            primaryClassName
          )}
        />
        <div
          data-slot="composite-action-row-content"
          className={cn(
            "pointer-events-none relative z-10 min-w-0 flex-1",
            contentClassName
          )}
        >
          {children}
        </div>
        {actions ? (
          <div
            data-slot="composite-action-row-actions"
            className="relative z-20 flex shrink-0 items-center"
          >
            {actions}
          </div>
        ) : null}
      </div>
    );
  }
);

export { CompositeActionRow, type CompositeActionRowProps };
