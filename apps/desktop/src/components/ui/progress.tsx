import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

type ProgressTone = "primary" | "success" | "warning" | "destructive"
type ProgressSize = "default" | "compact"

interface ProgressVisualProps {
  className?: string
  value?: number | null
  tone?: ProgressTone
  size?: ProgressSize
}

interface DecorativeProgressProps extends ProgressVisualProps {
  decorative: true
  children?: never
  "data-slot"?: string
  "data-density"?: string
}

type ProgressProps = DecorativeProgressProps | (
  ProgressPrimitive.Root.Props &
  ProgressVisualProps & {
    decorative?: false
  }
)

const indicatorToneClasses: Record<ProgressTone, string> = {
  primary: "bg-primary",
  success: "bg-status-success",
  warning: "bg-status-warning",
  destructive: "bg-status-destructive",
}

function Progress({
  className,
  children,
  value,
  tone = "primary",
  size = "default",
  decorative = false,
  ...props
}: ProgressProps) {
  const trackClassName = cn(
    size === "compact" ? "h-1" : "h-2 w-full",
    size === "compact" ? "bg-foreground/10" : "bg-fill-hover",
  )
  const indicatorClassName = indicatorToneClasses[tone]

  if (decorative) {
    const normalizedValue = typeof value === "number" && Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : 0
    const decorativeProps = props as Pick<DecorativeProgressProps, "data-slot" | "data-density">
    return (
      <span
        data-slot={decorativeProps["data-slot"] ?? "progress"}
        data-density={decorativeProps["data-density"]}
        data-size={size}
        data-tone={tone}
        aria-hidden="true"
        className={cn("inline-flex overflow-hidden rounded-full", trackClassName, className)}
      >
        <span
          data-slot="progress-indicator"
          className={cn("block h-full rounded-full transition-all", indicatorClassName)}
          style={{ width: `${normalizedValue}%` }}
        />
      </span>
    )
  }

  return (
    <ProgressPrimitive.Root
      value={value ?? null}
      data-slot="progress"
      data-size={size}
      data-tone={tone}
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack className={trackClassName}>
        <ProgressIndicator className={indicatorClassName} />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return (
    <ProgressPrimitive.Track
      data-slot="progress-track"
      className={cn(
        "relative flex items-center overflow-x-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

function ProgressIndicator({
  className,
  ...props
}: ProgressPrimitive.Indicator.Props) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      className={cn("h-full rounded-full transition-all", className)}
      {...props}
    />
  )
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return (
    <ProgressPrimitive.Label
      data-slot="progress-label"
      className={cn("text-ui font-medium", className)}
      {...props}
    />
  )
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return (
    <ProgressPrimitive.Value
      data-slot="progress-value"
      className={cn("ml-auto text-ui tabular-nums text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
  type ProgressProps,
  type ProgressSize,
  type ProgressTone,
}
