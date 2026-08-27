import { type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NavigationRowProps {
  label: string
  leading: ReactNode
  meta?: ReactNode
  current?: boolean
  disabled?: boolean
  busy?: boolean
  accessibilityLabel?: string
  title?: string
  className?: string
  labelClassName?: string
  onSelect: () => void
}

function NavigationRow({
  label,
  leading,
  meta,
  current = false,
  disabled = false,
  busy = false,
  accessibilityLabel,
  title,
  className,
  labelClassName,
  onSelect,
}: NavigationRowProps) {
  return (
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
      title={title}
      disabled={disabled}
      onClick={onSelect}
      className={cn("min-w-0 items-center", className)}
    >
      <span
        data-slot="navigation-row-leading"
        className="flex shrink-0 items-center justify-center"
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
          className="flex shrink-0 items-center gap-control-group"
        >
          {meta}
        </span>
      ) : null}
    </Button>
  )
}

export { NavigationRow, type NavigationRowProps }
