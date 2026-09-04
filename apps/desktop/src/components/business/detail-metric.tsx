import type { ReactNode } from "react";

interface DetailMetricProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly children: ReactNode;
}

function DetailMetric({ icon, label, children }: DetailMetricProps) {
  return (
    <div
      data-slot="detail-metric"
      className="text-body grid grid-cols-[9rem_minmax(0,1fr)] items-start gap-3"
    >
      <span
        data-slot="detail-metric-label"
        className="text-muted-foreground flex items-center gap-2"
      >
        {icon}
        {label}
      </span>
      <span
        data-slot="detail-metric-value"
        className="text-foreground/90 min-w-0"
      >
        {children}
      </span>
    </div>
  );
}

export { DetailMetric, type DetailMetricProps };
