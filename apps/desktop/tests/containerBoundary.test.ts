import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const sourceRoot = resolve(import.meta.dir, "../src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function isDesktopImplementation(path: string): boolean {
  const name = relative(sourceRoot, path);
  return (
    name === "container.ts"
    || name === "browser/electrobun.ts"
    || name.startsWith("electrobun/")
  );
}

describe("desktop container boundary", () => {
  test("keeps Electrobun imports out of product content", () => {
    const violations = sourceFiles(sourceRoot)
      .filter((path) => !isDesktopImplementation(path))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return [...source.matchAll(/\b(?:from\s+|import\s*(?:\(\s*)?)["']([^"']+)["']/g)]
          .map((match) => match[1])
          .filter((specifier) =>
            specifier === "electrobun"
            || specifier.startsWith("electrobun/")
            || /(?:^|\/)electrobun(?:\/|$)/.test(specifier)
          )
          .map((specifier) => `${relative(sourceRoot, path)} -> ${specifier}`);
      });

    expect(violations).toEqual([]);
  });

  test("routes the product bridge through the container port", () => {
    const bridge = readFileSync(resolve(sourceRoot, "bridge.ts"), "utf8");
    const container = readFileSync(resolve(sourceRoot, "container.ts"), "utf8");

    expect(bridge).toContain('from "./container"');
    expect(bridge).not.toContain('from "./electrobun/');
    expect(bridge).not.toContain('from "./browser/electrobun"');
    expect(container).toContain('from "./electrobun/client"');
    expect(container).toContain('from "./browser/electrobun"');
  });
});
