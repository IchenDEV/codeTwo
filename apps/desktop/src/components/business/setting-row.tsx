import { useId, type ReactNode } from "react"

import { cn } from "@/lib/utils"

type SettingRowDensity = "default" | "compact"
type SettingRowSurface = "plain" | "card"
type SettingRowControlSize = "auto" | "wide"

interface SettingRowProps {
  label: string
  description?: ReactNode
  leading?: ReactNode
  children: ReactNode
  density?: SettingRowDensity
  surface?: SettingRowSurface
  controlSize?: SettingRowControlSize
  disabled?: boolean
  controlId?: string
  className?: string
  controlClassName?: string
}

function SettingRow({
  label,
  description,
  leading,
  children,
  density = "default",
  surface = "plain",
  controlSize = "auto",
  disabled = false,
  controlId,
  className,
  controlClassName,
}: SettingRowProps) {
  const generatedId = useId()
  const accessibleId = controlId ?? generatedId
  const labelId = `${accessibleId}-label`
  const descriptionId = description ? `${accessibleId}-description` : undefined
  const labelClassName = cn(
    "block truncate text-body font-medium text-content",
    disabled && "text-content-muted",
  )

  return (
    <div
      data-slot="setting-row"
      data-density={density}
      data-surface={surface}
      data-control-size={controlSize}
      data-disabled={disabled ? "true" : undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex min-h-control-field min-w-0 flex-wrap items-center justify-between gap-x-page-section",
        density === "compact"
          ? "gap-y-inline py-inline"
          : "gap-y-module-inset py-module-inset",
        surface === "card" && "rounded-control bg-surface px-surface-inset shadow-surface",
        className,
      )}
    >
      <div
        data-slot="setting-row-main"
        className="flex min-w-48 flex-1 items-center gap-surface-inset"
      >
        {leading ? (
          <span
            data-slot="setting-row-leading"
            className="flex shrink-0 items-center text-content-muted"
            aria-hidden="true"
          >
            {leading}
          </span>
        ) : null}
        <div data-slot="setting-row-content" className="min-w-0 max-w-md">
          {controlId ? (
            <label
              id={labelId}
              data-slot="setting-row-label"
              className={labelClassName}
              htmlFor={controlId}
            >
              {label}
            </label>
          ) : (
            <div id={labelId} data-slot="setting-row-label" className={labelClassName}>
              {label}
            </div>
          )}
          {description ? (
            <div
              id={descriptionId}
              data-slot="setting-row-description"
              className="mt-optical min-w-0 text-callout text-content-muted"
            >
              {description}
            </div>
          ) : null}
        </div>
      </div>
      <div
        data-slot="setting-row-control"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className={cn(
          "flex max-w-full min-w-0 flex-wrap items-center gap-control-group",
          controlSize === "wide"
            ? "w-72 flex-none justify-end max-md:justify-start"
            : "flex-none",
          controlClassName,
        )}
      >
        {children}
      </div>
    </div>
  )
}

export {
  SettingRow,
  type SettingRowControlSize,
  type SettingRowDensity,
  type SettingRowProps,
  type SettingRowSurface,
}
