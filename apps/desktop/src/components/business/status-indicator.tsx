type StatusIndicatorTone = "neutral" | "success" | "warning" | "destructive";

interface StatusIndicatorProps {
  readonly tone: StatusIndicatorTone;
  readonly label: string;
}

const dotToneClasses: Record<StatusIndicatorTone, string> = {
  neutral: "bg-muted-foreground/50",
  success: "bg-status-success",
  warning: "bg-status-warning",
  destructive: "bg-status-destructive",
};

const StatusIndicator = ({ tone, label }: StatusIndicatorProps) => {
  return (
    <span
      data-slot="status-indicator"
      data-tone={tone}
      className="gap-control-group text-metadata text-muted-foreground inline-flex items-center"
    >
      <span
        data-slot="status-indicator-dot"
        className={`size-1.5 shrink-0 rounded-full ${dotToneClasses[tone]}`}
        aria-hidden="true"
      />
      <span data-slot="status-indicator-label">{label}</span>
    </span>
  );
}

export { StatusIndicator, type StatusIndicatorProps, type StatusIndicatorTone };
