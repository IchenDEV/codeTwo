// Pure logic for the Composer statusline (roadmap R7): context tone thresholds, burn-rate
// derivation from cumulative usage samples, and cost formatting. No React, no bridge.

export type StatusTone = "ok" | "warn" | "critical";

/**
Fraction of the context window (0–1) where the statusline starts nudging.
*/
export const contextWarn = 0.6;
export const contextCritical = 0.85;

export function contextTone(pct: number | null): StatusTone | null {
  if (pct === null || !Number.isFinite(pct)) {
    return null;
  }
  if (pct > contextCritical) {
    return "critical";
  }
  if (pct >= contextWarn) {
    return "warn";
  }
  return "ok";
}

export interface UsageSample {
  /**
  Milliseconds (epoch or any monotonic base — only differences matter).
  */
  at: number;
  /**
  Cumulative input tokens at this instant.
  */
  input: number;
  /**
  Cumulative output tokens at this instant.
  */
  output: number;
}

/**
Sliding window the burn rate is measured over, ending at the newest sample.
*/
export const burnWindowMs = 5 * 60_000;
/**
Below this span the rate is too noisy to show.
*/
export const burnMinSpanMs = 60_000;

export function deriveBurnRate(samples: UsageSample[]): number | null {
  if (samples.length < 2) {
    return null;
  }
  const ordered = [...samples].sort((a, b) => a.at - b.at);
  const newest = ordered[ordered.length - 1]!!;
  const inWindow = ordered.filter((s) => newest.at - s.at <= burnWindowMs);
  if (inWindow.length < 2) {
    return null;
  }
  const oldest = inWindow[0];
  const spanMs = newest.at - oldest.at;
  if (spanMs < burnMinSpanMs) {
    return null;
  }
  const deltaOutput = newest.output - oldest.output;
  if (deltaOutput < 0) {
    return null;
  }
  return deltaOutput / (spanMs / 60_000);
}

export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) {
    return "—";
  }
  if (usd > 0 && usd < 0.01) {
    return "<$0.01";
  }
  return `$${usd.toFixed(2)}`;
}
