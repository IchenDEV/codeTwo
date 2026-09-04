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
  if (activeProvider != null && activeProvider !== "") {
    return activeProvider;
  }
  if (currentProvider === "codex") {
    return currentProvider;
  }
  return recentProviders.includes("codex") ? "codex" : currentProvider;
}

export function quickQuotaSummary(
  report: ProviderQuotaReport | null
): QuickQuotaSummary | null {
  if (report?.status !== "available" || report.windows.length === 0) {
    return null;
  }

  const window = report.windows.reduce((lowest, candidate) =>
    remainingPercent(candidate) < remainingPercent(lowest) ? candidate : lowest
  );

  return {
    provider: report.provider,
    remainingPercent: remainingPercent(window),
    resetsAt: window.resets_at,
    windowMinutes: window.window_minutes,
  };
}

function remainingPercent(window: ProviderQuotaWindow): number {
  return Math.round(Math.max(0, Math.min(100, 100 - window.used_percent)));
}
