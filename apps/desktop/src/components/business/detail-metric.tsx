import { type ReactNode } from "react"

interface DetailMetricProps {
  icon: ReactNode
  label: string
  children: ReactNode
}

/** Consistent label/value row for master-detail metadata panels. */
function DetailMetric({ icon, label, children }: DetailMetricProps) {
  return (
    <div data-slot="detail-metric" className="grid grid-cols-[9rem_minmax(0,1fr)] items-start gap-3 text-body">
      <span data-slot="detail-metric-label" className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span data-slot="detail-metric-value" className="min-w-0 text-foreground/90">
        {children}
      </span>
    </div>
  )
}

export { DetailMetric, type DetailMetricProps }
