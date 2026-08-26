import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { buttonVariants } from "./button";

interface SplitButtonAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

type SplitButtonVariant = "default" | "destructive" | "outline" | "secondary" | "ghost";
type SplitButtonSize = "default" | "sm" | "compact" | "field";

interface SplitButtonProps {
  /** Text shown on the primary (left) half. */
  label: string;
  /** Handler for the primary button click. */
  onClick: () => void;
  /** Alternative actions rendered inside the chevron dropdown. */
  actions: SplitButtonAction[];
  variant?: SplitButtonVariant;
  size?: SplitButtonSize;
  disabled?: boolean;
  className?: string;
  /** Where the dropdown aligns relative to the trigger. */
  menuAlign?: "start" | "center" | "end";
  menuSide?: "top" | "bottom";
}

const separatorColor: Record<SplitButtonVariant, string> = {
  default: "border-primary-foreground/25",
  destructive: "border-white/25",
  outline: "border-border",
  secondary: "border-secondary-foreground/20",
  ghost: "border-border",
};

/**
 * A two-segment button: the left half fires the primary action, the right half opens a dropdown
 * of alternatives. Mirrors the pattern Cursor uses for "Commit & Push ▾".
 */
function SplitButton({
  label,
  onClick,
  actions,
  variant = "default",
  size = "default",
  disabled = false,
  className,
  menuAlign = "end",
  menuSide = "top",
}: SplitButtonProps) {
  if (actions.length === 0) {
    return (
      <button
        type="button"
        disabled={disabled}
        className={cn(buttonVariants({ variant, size }), className)}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-stretch rounded-md",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled}
        className={cn(
          buttonVariants({ variant, size }),
          "rounded-r-none border-r-0 focus-visible:z-10",
        )}
        onClick={onClick}
      >
        {label}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              aria-label="More actions"
              className={cn(
                buttonVariants({ variant, size }),
                "rounded-l-none border-l px-1.5 focus-visible:z-10",
                separatorColor[variant],
              )}
            >
              <ChevronDown className="size-3.5" />
            </button>
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
