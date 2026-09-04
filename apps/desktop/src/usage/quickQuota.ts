import type { ProviderQuotaReport, ProviderQuotaWindow } from "../bridge";

export interface QuickQuotaSummary {
  provider: string;
  remainingPercent: number;
  windowMinutes: number | null;
  resetsAt: number | null;
}

export function quickQuotaProviderFor(
  currentProvider: string,
  activeProvider: string | null,
  recentProviders: readonly string[]
): string {
  if (activeProvider != null && activeProvider !== "") return activeProvider;
  if (currentProvider === "codex") return currentProvider;
  return recentProviders.includes("codex") ? "codex" : currentProvider;
}

/**
 * The rail shows the most constrained provider-owned window. A single conservative number is
 * easier to scan than two competing percentages, while Settings > Usage keeps every window and
 * its reset time available for inspection.
 */
export function quickQuotaSummary(
  report: ProviderQuotaReport | null
): QuickQuotaSummary | null {
  if (report?.status !== "available" || report.windows.length === 0)
    return null;

  const window = report.windows.reduce((lowest, candidate) =>
    remainingPercent(candidate) < remainingPercent(lowest) ? candidate : lowest
  );

  return {
    provider: report.provider,
    remainingPercent: remainingPercent(window),
    windowMinutes: window.window_minutes,
    resetsAt: window.resets_at,
  };
}

function remainingPercent(window: ProviderQuotaWindow): number {
  return Math.round(Math.max(0, Math.min(100, 100 - window.used_percent)));
}
