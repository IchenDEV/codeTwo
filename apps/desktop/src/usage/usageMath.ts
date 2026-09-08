import type { UsageHistory } from "../bridge";

/** Compact token labels for the usage panel ("1.2M", "3.4k"). */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Countdown until a rolling window frees up. */
export function fmtReset(secs: number): string {
  if (secs <= 0) return "—";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Fixed provider → semantic-color utility mapping. Color follows the entity, never its position in the
 * data, so filtering or re-ordering series can't repaint them. The claude/codex pair passes the
 * palette checks in both schemes; the muted fallback covers a hypothetical extra source and always
 * appears with a legend and bar gaps carrying identity alongside color.
 */
export function seriesColorClass(source: string): string {
  if (source === "claude") return "text-primary";
  if (source === "codex") return "text-status-success";
  return "text-content-muted";
}

export interface StackedBucket {
  startMs: number;
  total: number;
  /** Zero-value parts are dropped so stacks only render segments that exist. */
  parts: { source: string; value: number }[];
}

/** Turn the per-source series into per-bucket stacks plus the y-axis max. */
export function stackHistory(history: UsageHistory): {
  buckets: StackedBucket[];
  max: number;
} {
  const bucketMs = history.bucket_secs * 1000;
  const buckets: StackedBucket[] = [];
  let max = 0;
  for (let i = 0; i < history.bucket_count; i += 1) {
    const parts = history.series
      .map((s) => ({ source: s.source, value: s.totals[i] ?? 0 }))
      .filter((p) => p.value > 0);
    const total = parts.reduce((sum, p) => sum + p.value, 0);
    if (total > max) max = total;
    buckets.push({ startMs: history.start_ms + i * bucketMs, total, parts });
  }
  return { buckets, max };
}

/**
 * Display label for an estimated cost. `null` (nothing priceable) yields `null` so the caller can
 * show its "cost unknown" copy; tiny non-zero estimates read as a floor instead of "$0.00".
 */
export function fmtCost(costUsd: number | null): string | null {
  if (costUsd == null) return null;
  if (costUsd > 0 && costUsd < 0.005) return "≈$<0.01";
  return `≈$${costUsd.toFixed(2)}`;
}
