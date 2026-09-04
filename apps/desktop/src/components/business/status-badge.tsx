import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

type StatusTone = "neutral" | "success" | "warning" | "destructive";

interface StatusBadgeProps {
  readonly tone: StatusTone;
  readonly children: ReactNode;
}

function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <Badge
      variant="ghost"
      size="status"
      tone={tone}
      data-slot="status-badge"
      data-tone={tone}
    >
      {children}
    </Badge>
  );
}

export { StatusBadge, type StatusBadgeProps, type StatusTone };
