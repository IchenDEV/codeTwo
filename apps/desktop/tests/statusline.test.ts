import { describe, expect, test } from "bun:test";

import {
  burnMinSpanMs,
  burnWindowMs,
  contextCritical,
  contextWarn,
  contextTone,
  deriveBurnRate,
  formatCost,
} from "../src/session/statusline.ts";

const MINUTE = 60_000;

describe("contextTone", () => {
  test("null passes through", () => {
    expect(contextTone(null)).toBeNull();
  });

  test("non-finite input yields no tone", () => {
    expect(contextTone(Number.NaN)).toBeNull();
    expect(contextTone(Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("below the warn threshold is ok", () => {
    expect(contextTone(0)).toBe("ok");
    expect(contextTone(0.59)).toBe("ok");
    expect(contextTone(contextWarn - 0.0001)).toBe("ok");
  });

  test("exactly 0.6 is warn (inclusive lower bound)", () => {
    expect(contextTone(contextWarn)).toBe("warn");
    expect(contextTone(0.6)).toBe("warn");
  });

  test("between the thresholds is warn", () => {
    expect(contextTone(0.7)).toBe("warn");
    expect(contextTone(0.84)).toBe("warn");
  });

  test("exactly 0.85 is still warn — critical only strictly above", () => {
    expect(contextTone(contextCritical)).toBe("warn");
    expect(contextTone(0.85)).toBe("warn");
  });

  test("just above 0.85 is critical", () => {
    expect(contextTone(0.8501)).toBe("critical");
    expect(contextTone(1)).toBe("critical");
    expect(contextTone(1.5)).toBe("critical");
  });
});

describe("deriveBurnRate", () => {
  const sample = (at: number, output: number, input = 0) => {
    return {
      at,
      input,
      output,
    };
  };

  test("null with no samples or a single sample", () => {
    expect(deriveBurnRate([])).toBeNull();
    expect(deriveBurnRate([sample(0, 100)])).toBeNull();
  });

  test("output tokens per minute across the span", () => {
    // 240 output tokens over 2 minutes → 120 tok/min.
    expect(deriveBurnRate([sample(0, 0), sample(2 * MINUTE, 240)])).toBe(120);
  });

  test("intermediate samples do not skew the endpoint rate", () => {
    expect(
      deriveBurnRate([
        sample(0, 0),
        sample(MINUTE, 500),
        sample(4 * MINUTE, 400),
      ])
    ).toBe(100);
  });

  test("null when the window spans less than a minute", () => {
    expect(deriveBurnRate([sample(0, 0), sample(30_000, 300)])).toBeNull();
    expect(
      deriveBurnRate([sample(0, 0), sample(burnMinSpanMs - 1, 300)])
    ).toBeNull();
  });

  test("a span of exactly one minute qualifies", () => {
    expect(deriveBurnRate([sample(0, 0), sample(burnMinSpanMs, 90)])).toBe(90);
  });

  test("samples older than five minutes fall out of the window", () => {
    // The t=0 sample is 6 minutes before the newest — excluded, so the rate is measured
    // between t=2min (100) and t=6min (700): 600 tokens over 4 minutes.
    expect(
      deriveBurnRate([
        sample(0, 0),
        sample(2 * MINUTE, 100),
        sample(6 * MINUTE, 700),
      ])
    ).toBe(150);
  });

  test("a sample exactly five minutes old is still inside the window", () => {
    expect(deriveBurnRate([sample(0, 0), sample(burnWindowMs, 500)])).toBe(100);
  });

  test("null when only one sample remains inside the window", () => {
    expect(deriveBurnRate([sample(0, 0), sample(10 * MINUTE, 500)])).toBeNull();
  });

  test("unordered input is sorted before measuring", () => {
    expect(deriveBurnRate([sample(2 * MINUTE, 240), sample(0, 0)])).toBe(120);
  });

  test("null when the counter goes backwards (session reset)", () => {
    expect(
      deriveBurnRate([sample(0, 500), sample(2 * MINUTE, 100)])
    ).toBeNull();
  });
});

describe("formatCost", () => {
  test("two decimals for ordinary amounts", () => {
    expect(formatCost(0.42)).toBe("$0.42");
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(12)).toBe("$12.00");
  });

  test("zero is a plain $0.00, not a fraction-of-a-cent claim", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  test("anything positive under a cent reads <$0.01", () => {
    expect(formatCost(0.001)).toBe("<$0.01");
    expect(formatCost(0.0099)).toBe("<$0.01");
  });

  test("exactly one cent is $0.01", () => {
    expect(formatCost(0.01)).toBe("$0.01");
  });

  test("invalid input renders as a dash", () => {
    expect(formatCost(-1)).toBe("—");
    expect(formatCost(Number.NaN)).toBe("—");
  });
});
