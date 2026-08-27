import { describe, expect, test } from "bun:test";

import type { UsageHistory } from "../src/bridge";
import { fmtCost, fmtReset, fmtTokens, seriesColorClass, stackHistory } from "../src/usage/usageMath";

const HOUR = 3600;

function history(series: { source: string; totals: number[] }[], bucketCount: number): UsageHistory {
  return { bucket_secs: HOUR, bucket_count: bucketCount, start_ms: 1_000_000_000_000, series };
}

describe("stackHistory", () => {
  test("stacks per bucket, drops zero parts, and reports the max total", () => {
    const stacked = stackHistory(
      history(
        [
          { source: "claude", totals: [100, 0, 40] },
          { source: "codex", totals: [50, 0, 200] },
        ],
        3,
      ),
    );
    expect(stacked.max).toBe(240);
    expect(stacked.buckets).toHaveLength(3);
    expect(stacked.buckets[0].total).toBe(150);
    expect(stacked.buckets[0].parts).toEqual([
      { source: "claude", value: 100 },
      { source: "codex", value: 50 },
    ]);
    expect(stacked.buckets[1].total).toBe(0);
    expect(stacked.buckets[1].parts).toEqual([]);
    // Bucket timestamps advance by bucket_secs from start_ms.
    expect(stacked.buckets[2].startMs - stacked.buckets[0].startMs).toBe(2 * HOUR * 1000);
  });

  test("missing series values are treated as zero rather than NaN", () => {
    const stacked = stackHistory(history([{ source: "claude", totals: [7] }], 3));
    expect(stacked.buckets.map((b) => b.total)).toEqual([7, 0, 0]);
    expect(stacked.max).toBe(7);
  });

  test("an empty history yields no buckets and a zero max", () => {
    const stacked = stackHistory(history([], 0));
    expect(stacked.buckets).toEqual([]);
    expect(stacked.max).toBe(0);
  });
});

describe("seriesColorClass", () => {
  test("color follows the provider identity, never its position", () => {
    expect(seriesColorClass("claude")).toBe("text-primary");
    expect(seriesColorClass("codex")).toBe("text-status-success");
    // Unknown providers share the muted fallback slot.
    expect(seriesColorClass("something-new")).toBe("text-content-muted");
  });
});

describe("fmtCost", () => {
  test("null estimate stays null so the UI can render 'cost unknown'", () => {
    expect(fmtCost(null)).toBeNull();
  });

  test("labels estimates with ≈ and floors tiny non-zero values", () => {
    expect(fmtCost(1.234)).toBe("≈$1.23");
    expect(fmtCost(0)).toBe("≈$0.00");
    expect(fmtCost(0.001)).toBe("≈$<0.01");
  });
});

describe("token and countdown labels", () => {
  test("fmtTokens compacts to k/M", () => {
    expect(fmtTokens(999)).toBe("999");
    expect(fmtTokens(1_500)).toBe("1.5k");
    expect(fmtTokens(2_400_000)).toBe("2.4M");
  });

  test("fmtReset spans minutes, hours, and days", () => {
    expect(fmtReset(0)).toBe("—");
    expect(fmtReset(5 * 60)).toBe("5m");
    expect(fmtReset(3 * 3600 + 120)).toBe("3h 2m");
    expect(fmtReset(26 * 3600)).toBe("1d 2h");
  });
});
