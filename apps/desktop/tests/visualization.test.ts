import { describe, expect, test } from "bun:test";

import { parseChartSpec } from "../src/session/ChartBlock";
import {
  splitRichText,
  visualizationDocument,
} from "../src/session/visualization";

describe("visualize transcript references", () => {
  test("extracts a complete local reference between Markdown segments", () => {
    const segments = splitRichText(
      'Before\n\nvisualize{"path":"/tmp/latency.html","mode":"wide","title":"Latency"}\n\nAfter',
    );
    expect(segments).toEqual([
      { kind: "markdown", text: "Before\n\n" },
      {
        kind: "visualization",
        reference: { path: "/tmp/latency.html", mode: "wide", title: "Latency" },
      },
      { kind: "markdown", text: "\n\nAfter" },
    ]);
  });

  test("hides only an incomplete streamed directive", () => {
    expect(splitRichText('Ready\nvisualize{"path":"/tmp/chart', true)).toEqual([
      { kind: "markdown", text: "Ready\n" },
    ]);
    expect(splitRichText('Ready\nvisualize{"path":"/tmp/chart', false)).toEqual([
      { kind: "markdown", text: 'Ready\n' },
      { kind: "markdown", text: 'visualize{"path":"/tmp/chart' },
    ]);
  });

  test("keeps invalid or non-local references as text", () => {
    const literal = 'visualize{"path":"https://example.com/chart.html"}';
    expect(splitRichText(literal)).toEqual([{ kind: "markdown", text: literal }]);
  });

  test("wraps fragments with a no-connect CSP and the follow-up bridge", () => {
    const document = visualizationDocument(
      '<div id="plot">Plot</div>',
      { "--foreground": "oklch(0.9 0 0)", "--background": "oklch(0.1 0 0)" },
      "safe-token",
    );
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("form-action 'none'");
    expect(document).toContain("window.openai={sendFollowUpMessage");
    expect(document).toContain("background:var(--background)");
    expect(document).toContain("document.body.scrollHeight");
    expect(document).toContain(".viz-icon{");
    expect(document).not.toContain("<script src=");
    expect(document).toContain('<div id="plot">Plot</div>');
    expect(document).toContain("safe-token");
  });
});

describe("fenced chart schema", () => {
  test("accepts bounded line and bar charts", () => {
    const spec = parseChartSpec(JSON.stringify({
      type: "line",
      title: "Latency",
      xLabel: "Release",
      yLabel: "Milliseconds",
      labels: ["1.0", "1.1"],
      series: [{ name: "p95", values: [120, 90] }],
    }));
    expect(spec).toEqual({
      type: "line",
      title: "Latency",
      xLabel: "Release",
      yLabel: "Milliseconds",
      labels: ["1.0", "1.1"],
      series: [{ name: "p95", values: [120, 90] }],
    });
  });

  test("rejects malformed, unbounded, or non-finite data", () => {
    expect(parseChartSpec("not json")).toBeNull();
    expect(parseChartSpec(JSON.stringify({
      type: "bar",
      title: "Broken",
      xLabel: "X",
      yLabel: "Y",
      labels: ["A"],
      series: [{ name: "value", values: ["not-a-number"] }],
    }))).toBeNull();
    expect(parseChartSpec(JSON.stringify({
      type: "line",
      title: "Too large",
      xLabel: "X",
      yLabel: "Y",
      labels: Array.from({ length: 101 }, (_, index) => String(index)),
      series: [{ name: "value", values: Array.from({ length: 101 }, () => 1) }],
    }))).toBeNull();
  });
});
