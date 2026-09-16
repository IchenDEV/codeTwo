import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const normalizeSource = (source: string) => source.replaceAll(/\r\n?/gu, "\n");
const readSource = (relativePath: string) =>
  normalizeSource(
    readFileSync(new URL(relativePath, import.meta.url), "utf-8")
  );

const app = readSource("../src/App.tsx");
const headerActions = readSource("../src/session/SessionHeaderActions.tsx");
const styles = readSource("../src/styles.css");
const projectIcon = readSource("../src/projects/ProjectIcon.tsx");
const rail = readSource("../src/sidebar/SessionRail.tsx");
const composer = readSource("../src/session/Composer.tsx");

describe("shell chrome contract", () => {
  test("normalizes source contracts across platform line endings", () => {
    expect(normalizeSource("first\r\nsecond\rthird")).toBe(
      "first\nsecond\nthird"
    );
  });

  test("keeps one titlebar gap across controls and clusters", () => {
    const toolbarClass = /className="(session-header-toolbar [^"]+)"/u.exec(
      app
    )?.[1];
    expect(toolbarClass?.split(" ")).toContain("gap-inline");
    expect(toolbarClass).not.toContain("gap-4");
    const actionsClass = /className="(session-header-actions [^"]+)"/u.exec(
      headerActions
    )?.[1];
    expect(actionsClass?.split(" ")).toContain("gap-inline");
    expect(actionsClass).not.toContain("gap-2");
    expect(styles).not.toMatch(/\.session-header-actions\s*{[^}]*gap:/s);
  });

  test("renders the project mark without a tile fill or ring", () => {
    expect(projectIcon).not.toContain("bg-foreground/[0.055]");
    expect(projectIcon).not.toContain("ring-1");
    expect(projectIcon).toContain(
      '"rounded-control text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden"'
    );
  });

  test("renders workspace badges unfilled on the row's content edge", () => {
    const checkout = rail.slice(
      rail.indexOf("const checkoutBadge"),
      rail.indexOf("const pullRequestBadge")
    );
    const pullRequest = rail.slice(
      rail.indexOf("const pullRequestBadge"),
      rail.indexOf("const provenanceInSummary")
    );
    for (const badge of [checkout, pullRequest]) {
      expect(badge).not.toContain("bg-fill-quiet");
      expect(badge).not.toContain("rounded-micro");
      expect(badge).not.toContain("px-1");
    }
    expect(checkout).toContain("text-fine text-foreground/55");
    expect(pullRequest).toContain("text-fine flex shrink-0 items-center");
    expect(rail).toContain(
      'className="pointer-events-none relative z-10 pl-1.5"'
    );
  });

  test("carries the pull-request state by colour, not by words", () => {
    const badge = rail.slice(
      rail.indexOf("const pullRequestBadge"),
      rail.indexOf("const provenanceInSummary")
    );
    expect(badge).toContain("#{pullRequest.number}");
    expect(badge).not.toContain("{pullRequestLabel}</span>");
    expect(badge).toContain("pullRequestTone");
    expect(badge).toContain(
      "aria-label={`#${pullRequest.number} · ${pullRequestLabel}`}"
    );
  });

  test("drops the leading project mark and the rail selection bar", () => {
    expect(app).not.toContain("session-header-project-icon");
    expect(app).not.toContain('from "./projects/ProjectIcon"');
    expect(styles).not.toContain(".session-header-project-icon");
    expect(rail).not.toContain("before:inset-y-3");
    expect(rail).not.toContain("before:rounded-full");
    expect(rail).toContain("bg-fill-selected hover:bg-fill-selected-hover");
  });

  test("keeps one composer control row with the session chips in it", () => {
    const spacer = composer.indexOf('<div className="flex-1" />');
    const chips = composer.indexOf("<SessionControls");
    expect(chips).toBeGreaterThan(-1);
    expect(chips).toBeLessThan(spacer);
    expect(composer).toContain(
      '"flex min-w-0 items-center gap-0.5",\n                docMode'
    );
    expect(composer).not.toContain('"flex flex-col gap-1"');
    expect(composer.match(/<SessionControls/gu)).toHaveLength(1);
  });
});
