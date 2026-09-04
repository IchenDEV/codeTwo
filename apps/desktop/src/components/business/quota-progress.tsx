import { Progress } from "@/components/ui/progress";

type QuotaProgressDensity = "detail" | "rail";
type QuotaProgressTone = "success" | "warning" | "destructive";

interface QuotaProgressProps {
  label: string;
  remainingPercent: number;
  density?: QuotaProgressDensity;
}

function quotaTone(remainingPercent: number): QuotaProgressTone {
  if (remainingPercent <= 5) return "destructive";
  if (remainingPercent <= 20) return "warning";
  return "success";
}

function QuotaProgress({
  label,
  remainingPercent,
  density = "detail",
}: QuotaProgressProps) {
  const clampedPercent = Number.isFinite(remainingPercent)
    ? Math.min(100, Math.max(0, remainingPercent))
    : 0;
  const value = Math.round(clampedPercent);
  const tone = quotaTone(clampedPercent);

  if (density === "rail") {
    return (
      <Progress
        value={value}
        tone={tone}
        size="compact"
        decorative
        data-slot="quota-progress"
        data-density="rail"
        className="w-10"
      />
    );
  }

  return (
    <Progress
      value={value}
      aria-label={label}
      data-slot="quota-progress"
      data-density="detail"
      data-tone={tone}
      tone={tone}
      className="block gap-0"
    />
  );
}

export {
  QuotaProgress,
  type QuotaProgressDensity,
  type QuotaProgressProps,
  type QuotaProgressTone,
};
