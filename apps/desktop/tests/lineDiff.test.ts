import { describe, expect, test } from "bun:test";

import { diffLines, diffStats, type DiffLine } from "../src/session/lineDiff";

const types = (lines: DiffLine[]) => lines.map((line) => line.type);
const texts = (lines: DiffLine[]) => lines.map((line) => line.text);

describe("diffLines", () => {
  test("identical input is all context", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(types(lines)).toEqual(["ctx", "ctx", "ctx"]);
    expect(diffStats(lines)).toEqual({ added: 0, deleted: 0 });
  });

  test("appended lines come out as ctx then add", () => {
    const lines = diffLines("a", "a\nb\nc");
    expect(types(lines)).toEqual(["ctx", "add", "add"]);
    expect(texts(lines)).toEqual(["a", "b", "c"]);
    expect(diffStats(lines)).toEqual({ added: 2, deleted: 0 });
  });

  test("removed lines come out as del", () => {
    const lines = diffLines("a\nb\nc", "a");
    expect(types(lines)).toEqual(["ctx", "del", "del"]);
    expect(diffStats(lines)).toEqual({ added: 0, deleted: 2 });
  });

  test("a changed line in the middle is del then add, surrounded by ctx", () => {
    const lines = diffLines("a\nb\nc", "a\nx\nc");
    expect(types(lines)).toEqual(["ctx", "del", "add", "ctx"]);
    expect(texts(lines)).toEqual(["a", "b", "x", "c"]);
  });

  test("empty input is zero lines, trailing newlines are ignored", () => {
    expect(diffLines("", "")).toEqual([]);
    expect(diffLines("a\n", "a")).toEqual([{ type: "ctx", text: "a" }]);
    expect(diffLines("", "\n\n")).toEqual([]);
    expect(diffLines("", "a\nb")).toEqual([
      { type: "add", text: "a" },
      { type: "add", text: "b" },
    ]);
    expect(diffLines("a\nb", "")).toEqual([
      { type: "del", text: "a" },
      { type: "del", text: "b" },
    ]);
  });

  test("completely different small files are del block then add block", () => {
    const lines = diffLines("a\nb\nc", "x\ny\nz");
    expect(types(lines)).toEqual(["del", "del", "del", "add", "add", "add"]);
  });

  test("large inputs with a small change use prefix/suffix trimming and stay precise", () => {
    const prefix = Array.from({ length: 1500 }, (_, i) => `same-head-${i}`);
    const suffix = Array.from({ length: 800 }, (_, i) => `same-tail-${i}`);
    const oldMiddle = Array.from({ length: 10 }, (_, i) => `old-mid-${i}`);
    const newMiddle = Array.from({ length: 15 }, (_, i) => `new-mid-${i}`);
    // 2310 / 2315 lines each — over the 2000-line guard before trimming.
    const lines = diffLines(
      [...prefix, ...oldMiddle, ...suffix].join("\n"),
      [...prefix, ...newMiddle, ...suffix].join("\n"),
    );
    expect(lines.length).toBe(1500 + 10 + 15 + 800);
    expect(types(lines).slice(0, 1500).every((t) => t === "ctx")).toBe(true);
    expect(texts(lines).slice(1500, 1510)).toEqual(oldMiddle);
    expect(types(lines).slice(1500, 1510).every((t) => t === "del")).toBe(true);
    expect(texts(lines).slice(1510, 1525)).toEqual(newMiddle);
    expect(types(lines).slice(1510, 1525).every((t) => t === "add")).toBe(true);
    expect(types(lines).slice(1525).every((t) => t === "ctx")).toBe(true);
    expect(diffStats(lines)).toEqual({ added: 15, deleted: 10 });
  });

  test("over-budget middle degrades to all del + all add without crashing", () => {
    const oldLines = Array.from({ length: 2500 }, (_, i) => `old-${i}`);
    const newLines = Array.from({ length: 2500 }, (_, i) => `new-${i}`);
    const lines = diffLines(oldLines.join("\n"), newLines.join("\n"));
    expect(lines.length).toBe(5000);
    expect(types(lines).slice(0, 2500).every((t) => t === "del")).toBe(true);
    expect(types(lines).slice(2500).every((t) => t === "add")).toBe(true);
    expect(texts(lines).slice(0, 2500)).toEqual(oldLines);
    expect(texts(lines).slice(2500)).toEqual(newLines);
  });

  test("degradation covers the whole file, including a common prefix", () => {
    const oldLines = ["common", ...Array.from({ length: 2499 }, (_, i) => `old-${i}`)];
    const newLines = ["common", ...Array.from({ length: 2499 }, (_, i) => `new-${i}`)];
    const lines = diffLines(oldLines.join("\n"), newLines.join("\n"));
    expect(diffStats(lines)).toEqual({ added: 2500, deleted: 2500 });
    expect(types(lines).every((t) => t !== "ctx")).toBe(true);
  });

  test("exactly at the 2000-line budget still runs the real diff", () => {
    const oldLines = Array.from({ length: 2000 }, (_, i) => `old-${i}`);
    const newLines = Array.from({ length: 2000 }, (_, i) => `new-${i}`);
    const lines = diffLines(oldLines.join("\n"), newLines.join("\n"));
    expect(lines.length).toBe(4000);
    expect(diffStats(lines)).toEqual({ added: 2000, deleted: 2000 });
  });
});
