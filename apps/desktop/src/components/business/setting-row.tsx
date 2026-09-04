import { useId } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SettingRowDensity = "default" | "compact";
type SettingRowSurface = "plain" | "card";
type SettingRowControlSize = "auto" | "wide";

interface SettingRowProps {
  readonly label: string;
  readonly description?: ReactNode;
  readonly leading?: ReactNode;
  readonly children: ReactNode;
  readonly density?: SettingRowDensity;
  readonly surface?: SettingRowSurface;
  readonly controlSize?: SettingRowControlSize;
  readonly disabled?: boolean;
  readonly controlId?: string;
  readonly className?: string;
  readonly controlClassName?: string;
}

const SettingRow = ({
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
}: SettingRowProps) => {
  const generatedId = useId();
  const accessibleId = controlId ?? generatedId;
  const labelId = `${accessibleId}-label`;
  const descriptionId = description ? `${accessibleId}-description` : undefined;
  const labelClassName = cn(
    "block truncate text-body font-medium text-content",
    disabled && "text-content-muted"
  );

  return (
    <div
      data-slot="setting-row"
      data-density={density}
      data-surface={surface}
      data-control-size={controlSize}
      data-disabled={disabled ? "true" : undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        "min-h-control-field gap-x-page-section flex min-w-0 flex-wrap items-center justify-between",
        density === "compact"
          ? "gap-y-inline py-inline"
          : "gap-y-module-inset py-module-inset",
        surface === "card" &&
          "rounded-control bg-surface px-surface-inset shadow-surface",
        className
      )}
    >
      <div
        data-slot="setting-row-main"
        className="gap-surface-inset flex min-w-48 flex-1 items-center"
      >
        {leading ? (
          <span
            data-slot="setting-row-leading"
            className="text-content-muted flex shrink-0 items-center"
            aria-hidden="true"
          >
            {leading}
          </span>
        ) : null}
        <div data-slot="setting-row-content" className="max-w-md min-w-0">
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
            <div
              id={labelId}
              data-slot="setting-row-label"
              className={labelClassName}
            >
              {label}
            </div>
          )}
          {description ? (
            <div
              id={descriptionId}
              data-slot="setting-row-description"
              className="mt-optical text-callout text-content-muted min-w-0"
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
          "gap-control-group flex max-w-full min-w-0 flex-wrap items-center",
          controlSize === "wide"
            ? "w-72 flex-none justify-end max-md:justify-start"
            : "flex-none",
          controlClassName
        )}
      >
        {children}
      </div>
    </div>
  );
};

export {
  SettingRow,
  type SettingRowControlSize,
  type SettingRowDensity,
  type SettingRowProps,
  type SettingRowSurface,
};
