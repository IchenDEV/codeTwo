import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

const appSource = source("src/App.tsx");
const styleSource = source("src/styles.css");
const sessionRailSource = source("src/sidebar/SessionRail.tsx");
const sideChatSource = source("src/session/SideChatPanel.tsx");
const tabsSource = source("src/components/ui/tabs.tsx");
const composerSource = source("src/session/Composer.tsx");
const packageSource = source("package.json");
const lockSource = source("bun.lock");
const taskBoardSearchSource = [
  source("src/taskboard/TaskBoardPage.tsx"),
  source("src/taskboard/TaskBoardHeader.tsx"),
  source("src/taskboard/useTaskBoardData.ts"),
].join("\n");
const pageSources = [
  source("src/taskboard/TaskBoardPage.tsx"),
  source("src/github/PullRequestsPage.tsx"),
  source("src/automation/AutomationsPage.tsx"),
  source("src/plugins/PluginManagerPage.tsx"),
  source("src/docker/DockerPage.tsx"),
];

describe("desktop interaction performance contracts", () => {
  test("keeps the removed liquid renderer out of dependencies and interaction surfaces", () => {
    for (const implementation of [
      tabsSource,
      composerSource,
      sessionRailSource,
      sideChatSource,
    ]) {
      expect(implementation).not.toMatch(
        /liquid-gooey|LiquidSelectionGroup|LiquidActionSurface|data-gooey|<Liquid\b|Liquid\./
      );
    }

    expect(packageSource).not.toContain('"liquid-gooey"');
    expect(lockSource).not.toContain('"liquid-gooey"');
    expect(tabsSource).not.toMatch(
      /MutationObserver|ResizeObserver|getBoundingClientRect|useLiquidIndicator/
    );
    expect(sessionRailSource).not.toContain("typeof ResizeObserver");
  });

  test("keeps optional full-page implementations out of the initial renderer module", () => {
    expect(appSource).toContain("lazy(");
    expect(appSource).toContain("<Suspense");

    for (const modulePath of [
      "./taskboard/TaskBoardPage",
      "./github/PullRequestsPage",
      "./automation/AutomationsPage",
      "./plugins/PluginManagerPage",
      "./docker/DockerPage",
    ]) {
      expect(appSource).toContain(`import(\"${modulePath}\")`);
    }

    expect(appSource).not.toContain(
      'import { TaskBoardPage } from "./taskboard/TaskBoardPage"'
    );
    expect(appSource).not.toContain(
      'import { AutomationsPage } from "./automation/AutomationsPage"'
    );
  });

  test("uses one opacity-only entrance for every optional data page", () => {
    for (const pageSource of pageSources) {
      expect(pageSource).toContain("animate-data-page-in");
    }

    const keyframes = styleSource.match(
      /@keyframes data-page-in\s*\{([\s\S]*?)\n\s*\}/
    )?.[1];
    expect(keyframes).toContain("opacity:");
    expect(keyframes).not.toContain("transform:");
    expect(styleSource).toMatch(
      /\.animate-data-page-in\s*\{[\s\S]*animation:\s*data-page-in\s+var\(--motion-slow\)/
    );
  });

  test("defers collection filtering while search inputs stay controlled", () => {
    for (const pageSource of [
      taskBoardSearchSource,
      source("src/github/PullRequestsPage.tsx"),
      source("src/plugins/PluginManagerPage.tsx"),
    ]) {
      expect(pageSource).toContain("useDeferredValue");
      expect(pageSource).toContain("deferredQuery");
      expect(pageSource).toMatch(/value=\{(?:props\.)?query\}/);
    }
  });

  test("defers off-screen session-row paint without virtualizing rows out of the DOM", () => {
    expect(sessionRailSource).toContain("session-rail-row");
    expect(styleSource).toMatch(
      /\.session-rail-row\s*\{[\s\S]*content-visibility:\s*auto;[\s\S]*contain-intrinsic-size:/
    );
    expect(styleSource).toMatch(
      /\.session-rail-row:has\(\[aria-current="page"\]\)\s*\{[\s\S]*content-visibility:\s*visible;/
    );
    expect(sessionRailSource).not.toContain("react-window");
    expect(sessionRailSource).not.toContain("react-virtualized");
  });
});
