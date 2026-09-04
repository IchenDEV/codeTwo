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

type SplitButtonVariant =
  "default" | "destructive" | "outline" | "secondary" | "ghost";
type SplitButtonSize = "default" | "sm" | "compact" | "field";

interface SplitButtonProps {
  /** Text shown on the primary (left) half. */
  readonly label: string;
  /** Handler for the primary button click. */
  readonly onClick: () => void;
  /** Alternative actions rendered inside the chevron dropdown. */
  readonly actions: SplitButtonAction[];
  readonly variant?: SplitButtonVariant;
  readonly size?: SplitButtonSize;
  readonly disabled?: boolean;
  readonly className?: string;
  /** Where the dropdown aligns relative to the trigger. */
  readonly menuAlign?: "start" | "center" | "end";
  readonly menuSide?: "top" | "bottom";
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
const SplitButton = ({
  label,
  onClick,
  actions,
  variant = "default",
  size = "default",
  disabled = false,
  className,
  menuAlign = "end",
  menuSide = "top",
}: SplitButtonProps) => {
  if (actions.length === 0) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        className={className}
        onClick={onClick}
      >
        {label}
      </Button>
    );
  }

  return (
    <span
      className={cn(
        "rounded-control inline-flex items-stretch",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        className="rounded-r-none focus-visible:z-10"
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
              aria-label="More actions"
              className={cn(
                "relative rounded-l-none px-1.5 before:absolute before:left-0 before:h-4 before:w-px focus-visible:z-10",
                separatorClass[variant]
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
