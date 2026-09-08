// Pure logic for the Composer statusline (roadmap R7): context tone thresholds, burn-rate
// derivation from cumulative usage samples, and cost formatting. No React, no bridge.

export type StatusTone = "ok" | "warn" | "critical";

/** Fraction of the context window (0–1) where the statusline starts nudging. */
export const CONTEXT_WARN = 0.6;
export const CONTEXT_CRITICAL = 0.85;

/**
 * Tone for a context-fill fraction. Boundary semantics: exactly `CONTEXT_WARN` and exactly
 * `CONTEXT_CRITICAL` are both "warn" — critical only strictly above the threshold, so the red
 * dot means "you are past 85%", not "you just reached it".
 */
export function contextTone(pct: number | null): StatusTone | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct > CONTEXT_CRITICAL) return "critical";
  if (pct >= CONTEXT_WARN) return "warn";
  return "ok";
}

export interface UsageSample {
  /** Milliseconds (epoch or any monotonic base — only differences matter). */
  at: number;
  /** Cumulative input tokens at this instant. */
  input: number;
  /** Cumulative output tokens at this instant. */
  output: number;
}

/** Sliding window the burn rate is measured over, ending at the newest sample. */
export const BURN_WINDOW_MS = 5 * 60_000;
/** Below this span the rate is too noisy to show. */
export const BURN_MIN_SPAN_MS = 60_000;

/**
 * Output tokens per minute over the trailing five-minute window. Returns null when the window
 * holds fewer than two samples, spans less than a minute, or the counter went backwards
 * (session restart) — no number is better than a wrong one.
 */
export function deriveBurnRate(samples: UsageSample[]): number | null {
  if (samples.length < 2) return null;
  const ordered = [...samples].toSorted((a, b) => a.at - b.at);
  const newest = ordered.at(-1)!;
  const inWindow = ordered.filter((s) => newest.at - s.at <= BURN_WINDOW_MS);
  if (inWindow.length < 2) return null;
  const oldest = inWindow[0];
  const spanMs = newest.at - oldest.at;
  if (spanMs < BURN_MIN_SPAN_MS) return null;
  const deltaOutput = newest.output - oldest.output;
  if (deltaOutput < 0) return null;
  return deltaOutput / (spanMs / 60_000);
}

/** "$0.42" — two decimals; anything positive under a cent reads "<$0.01" rather than "$0.00". */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return "—";
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
