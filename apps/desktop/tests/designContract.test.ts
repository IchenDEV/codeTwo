import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const normalizeSource = (source: string) => source.replaceAll(/\r\n?/gu, "\n");
const readSource = (relativePath: string) =>
  normalizeSource(
    readFileSync(new URL(relativePath, import.meta.url), "utf-8")
  );

const layoutSpec = JSON.parse(readSource("../layout-spec.json")) as {
  spacing: Record<string, number>;
  shell: {
    titlebarHeight: number;
    regions: Record<
      string,
      { defaultWidth: number; minWidth?: number; maxWidth?: number }
    >;
  };
  content: {
    primaryColumn: { maxWidth: number };
    settings: { maxWidth: number };
  };
  verticalRhythm: Record<string, number>;
};
const tokens = readSource("../src/design/tokens.css");
const styles = readSource("../src/styles.css");
const app = readSource("../src/App.tsx");
const pullRequests = readSource("../src/github/PullRequestsPage.tsx");

const declarations = new Map<string, string>();
for (const match of tokens.matchAll(/--([\w-]+):\s*([^;]+);/gu)) {
  declarations.set(match[1], match[2].trim());
}

// Semantic roles alias foundations (`--ds-space-page: var(--ds-foundation-space-24)`), and the
// foundation names embed their size, so walk the chain and read the trailing number.
const resolvePx = (name: string): number | null => {
  const value = declarations.get(name);
  if (value == null) return null;
  const px = /^(\d+)px$/u.exec(value);
  if (px != null) return Number(px[1]);
  const ref = /^var\(--([\w-]+)\)$/u.exec(value);
  if (ref != null) return resolvePx(ref[1]);
  const trailing = /-(\d+)$/u.exec(name);
  return trailing == null ? null : Number(trailing[1]);
};

describe("design contract alignment", () => {
  test("normalizes source contracts across platform line endings", () => {
    expect(normalizeSource("first\r\nsecond\rthird")).toBe(
      "first\nsecond\nthird"
    );
  });

  test("keeps the layout spec on the token vertical rhythm", () => {
    expect(resolvePx("ds-titlebar-height")).toBe(
      layoutSpec.verticalRhythm.titlebarHeight
    );
    expect(resolvePx("ds-titlebar-height")).toBe(
      layoutSpec.shell.titlebarHeight
    );
    expect(resolvePx("ds-control-normal")).toBe(
      layoutSpec.verticalRhythm.normalControlHeight
    );
    expect(resolvePx("ds-control-field")).toBe(
      layoutSpec.verticalRhythm.fieldControlHeight
    );
    expect(styles).toContain("height: var(--ds-titlebar-height);");
  });

  test("keeps the layout spec on the token spacing scale", () => {
    for (const [name, value] of Object.entries(layoutSpec.spacing)) {
      const camel = name.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`);
      expect(resolvePx(`ds-space-${camel}`)).toBe(value);
    }
  });

  test("keeps the shell defaults and clamps on the spec", () => {
    const rail = layoutSpec.shell.regions.navigationRail;
    const dock = layoutSpec.shell.regions.dock;
    expect(app).toContain(`"codetwo.railWidth",\n    ${rail.defaultWidth}`);
    expect(app).toContain(
      `Math.min(${rail.maxWidth}, Math.max(${rail.minWidth}, railWidth))`
    );
    expect(app).toContain(`"codetwo.dockWidth",\n    ${dock.defaultWidth}`);
  });

  test("keeps the content measure on the spec", () => {
    const column = layoutSpec.content.primaryColumn.maxWidth;
    expect(column).toBe(768);
    expect(layoutSpec.content.settings.maxWidth).toBe(column);
    expect(column / 16).toBe(48);
  });

  test("routes the pull-request blocking states through LoadFeedback", () => {
    expect(pullRequests).toContain(
      'import { LoadFeedback } from "@/components/business/load-feedback";'
    );
    expect(pullRequests.match(/<LoadFeedback/gu)).toHaveLength(4);
    expect(pullRequests).not.toContain('pullRequests.loadingDetail")}</div>');
    expect(pullRequests).not.toContain(
      'role="status"\n              className="text-body text-muted-foreground flex items-center justify-center gap-2 py-12"'
    );
  });
});
