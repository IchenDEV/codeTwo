import type { ReactNode } from "react";

import { ChevronDown } from "./icons";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { Button } from "./button";

interface SplitButtonAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

type SplitButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost";
type SplitButtonSize = "default" | "sm" | "compact" | "field";

interface SplitButtonProps {
  /** Text shown on the primary (left) half. */
  label: ReactNode;
  /** Accessible name when the visible label is responsive or otherwise composite. */
  primaryLabel?: string;
  /** Handler for the primary button click. */
  onClick: () => void;
  /** Alternative actions rendered inside the chevron dropdown. */
  actions: SplitButtonAction[];
  variant?: SplitButtonVariant;
  size?: SplitButtonSize;
  disabled?: boolean;
  className?: string;
  primaryClassName?: string;
  menuButtonClassName?: string;
  menuLabel?: string;
  /** Where the dropdown aligns relative to the trigger. */
  menuAlign?: "start" | "center" | "end";
  menuSide?: "top" | "bottom";
}

const separatorClass: Record<SplitButtonVariant, string> = {
  default: "before:bg-primary-foreground/25",
  destructive: "before:bg-destructive-foreground/25",
  outline: "before:bg-border",
  secondary: "before:bg-secondary-foreground/20",
  ghost: "before:bg-border",
};

/**
 * A two-segment button: the left half fires the primary action, the right half opens a dropdown
 * of alternatives. Mirrors the pattern Cursor uses for "Commit & Push ▾".
 */
function SplitButton({
  label,
  primaryLabel,
  onClick,
  actions,
  variant = "default",
  size = "default",
  disabled = false,
  className,
  primaryClassName,
  menuButtonClassName,
  menuLabel = "More actions",
  menuAlign = "end",
  menuSide = "top",
}: SplitButtonProps) {
  if (actions.length === 0) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label={primaryLabel}
        className={cn(className, primaryClassName)}
        onClick={onClick}
      >
        {label}
      </Button>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-stretch rounded-control",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label={primaryLabel}
        className={cn("rounded-r-none focus-visible:z-10", primaryClassName)}
        onClick={onClick}
      >
        {label}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant={variant}
              size={size}
              disabled={disabled}
              aria-label={menuLabel}
              className={cn(
                "relative rounded-l-none px-1.5 focus-visible:z-10 before:absolute before:left-0 before:h-4 before:w-px",
                separatorClass[variant],
                menuButtonClassName,
              )}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align={menuAlign} side={menuSide}>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

export { SplitButton, type SplitButtonAction, type SplitButtonProps };
