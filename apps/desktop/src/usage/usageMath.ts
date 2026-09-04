import type { UsageHistory } from "../bridge";

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}k`;
  }
  return String(n);
}

export function fmtReset(secs: number): string {
  if (secs <= 0) {
    return "—";
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h >= 24) {
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  }
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

export function seriesColorClass(source: string): string {
  if (source === "claude") {
    return "text-primary";
  }
  if (source === "codex") {
    return "text-status-success";
  }
  return "text-content-muted";
}

export interface StackedBucket {
  startMs: number;
  total: number;
  /**
  Zero-value parts are dropped so stacks only render segments that exist.
  */
  parts: { source: string; value: number }[];
}

export function stackHistory(history: UsageHistory): {
  buckets: StackedBucket[];
  max: number;
} {
  const bucketMs = history.bucket_secs * 1000;
  const buckets: StackedBucket[] = [];
  let max = 0;
  for (let index = 0; index < history.bucket_count; index++) {
    const parts = history.series
      .map((s) => ({ source: s.source, value: s.totals[index] ?? 0 }))
      .filter((p) => p.value > 0);
    const total = parts.reduce((sum, p) => sum + p.value, 0);
    if (total > max) {
      max = total;
    }
    buckets.push({
      parts,
      startMs: history.start_ms + index * bucketMs,
      total,
    });
  }
  return { buckets, max };
}

export function fmtCost(costUsd: number | null): string | null {
  if (costUsd === null || costUsd === undefined) {
    return null;
  }
  if (costUsd > 0 && costUsd < 0.005) {
    return "≈$<0.01";
  }
  return `≈$${costUsd.toFixed(2)}`;
}
