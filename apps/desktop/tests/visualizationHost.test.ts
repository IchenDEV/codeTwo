import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { readVisualization } from "../src/electrobun/host/system";

const scratch: string[] = [];

afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "codetwo-visualization-test-"));
  scratch.push(directory);
  return directory;
}

describe("visualization host reads", () => {
  test("reads a bounded HTML fragment from the canonical temp root", () => {
    const directory = temporaryDirectory();
    const path = join(directory, "plot.html");
    writeFileSync(path, '<div id="plot">ok</div>');
    expect(readVisualization(path)).toBe('<div id="plot">ok</div>');
  });

  test("rejects files outside approved roots and symlink escapes", () => {
    const projectHtml = resolve("index.html");
    expect(() => readVisualization(projectHtml)).toThrow("outside approved roots");

    const directory = temporaryDirectory();
    const link = join(directory, "escaped.html");
    symlinkSync(projectHtml, link);
    expect(() => readVisualization(link)).toThrow("outside approved roots");
  });

  test("rejects binary, wrong-extension, and oversized payloads", () => {
    const directory = temporaryDirectory();
    const textPath = join(directory, "plot.txt");
    writeFileSync(textPath, "text");
    expect(() => readVisualization(textPath)).toThrow("absolute .html");

    const binaryPath = join(directory, "binary.html");
    writeFileSync(binaryPath, new Uint8Array([60, 0, 62]));
    expect(() => readVisualization(binaryPath)).toThrow("binary");

    const largePath = join(directory, "large.html");
    writeFileSync(largePath, "x".repeat(1024 * 1024 + 1));
    expect(() => readVisualization(largePath)).toThrow("larger than 1 MB");
  });
});
