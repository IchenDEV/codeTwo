// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { act as reactAct } from "react";

import { activateDom, dom, flush, mount } from "./domTestHarness";

activateDom();

const { resetAppearanceSettings, setAppearanceSettings } =
  await import("../src/appearance");
const { I18nProvider } = await import("../src/i18n");
const { ThemeProvider } = await import("../src/theme");
const { UiLab } = await import("../src/design/ui-lab/UiLab");
const {
  loadPullRequest,
  loadPullRequests,
  pullRequestPanelApi,
  pullRequestTasks,
} = await import("../src/design/ui-lab/fixtures");

const layoutSpec = JSON.parse(
  readFileSync(new URL("../layout-spec.json", import.meta.url), "utf8")
);
const mainSource = readFileSync(
  new URL("../src/main.tsx", import.meta.url),
  "utf8"
);

const mounted = [];
let restoreCanvasContext = null;

function renderUiLab({ route = "home", theme = "dark", language = "en" } = {}) {
  activateDom();
  if (!restoreCanvasContext) {
    const getContext = dom.HTMLCanvasElement.prototype.getContext;
    dom.HTMLCanvasElement.prototype.getContext = () => null;
    restoreCanvasContext = () => {
      dom.HTMLCanvasElement.prototype.getContext = getContext;
    };
  }
  const view = mount(
    <ThemeProvider preferenceOverride={theme}>
      <I18nProvider preferenceOverride={language}>
        <UiLab route={route} />
      </I18nProvider>
    </ThemeProvider>
  );
  mounted.push(view);
  return view;
}

afterEach(async () => {
  for (const view of mounted.splice(0))
    await reactAct(async () => view.unmount());
  restoreCanvasContext?.();
  restoreCanvasContext = null;
  resetAppearanceSettings();
  dom.window.localStorage.removeItem("codetwo.language");
  dom.document.documentElement.classList.remove("dark", "scheme-mismatch");
  dom.document.documentElement.lang = "en";
  dom.document.body.replaceChildren();
  await flush();
});

describe("UI Lab", () => {
  test("publishes a stable catalog contract backed by the layout spec", () => {
    const view = renderUiLab();

    expect(view.container.querySelector("main h1")?.textContent).toBe("UI Lab");
    expect(
      view.container.querySelector(
        'nav[aria-label="UI Lab sections"] a[aria-current="page"]'
      )?.textContent
    ).toBe("Catalog");
    expect(layoutSpec.content.uiLab).toEqual({
      navigationWidth: 196,
      catalogMaxWidth: 1160,
      scenarioToolbarHeight: 48,
      cardMinWidth: 280,
      compactAt: 760,
      behavior:
        "Keep a persistent catalog rail at standard widths, move it above content at compact widths, and let each production scenario retain its own container-query breakpoints.",
    });

    const links = Array.from(view.container.querySelectorAll("a")).map((link) =>
      link.getAttribute("href")
    );
    expect(links).toContain("?ui-lab=design-system&theme=dark&lang=en");
    expect(links).toContain("?ui-lab=pull-requests&theme=dark&lang=en");
    expect(links).toContain("?ui-lab=pr-dock&theme=dark&lang=en");
    expect(links).toContain("?rich-transcript=1");
    expect(links).toContain("?pet-preview=1");
    expect(view.container.textContent).toContain(
      "never call a bridge or remote service"
    );
  });

  test("composes the production PR workspace with deterministic fixtures", async () => {
    const view = renderUiLab({ route: "pull-requests" });

    expect(
      view.container.querySelector(".ui-lab-scenario-toolbar")?.textContent
    ).toContain("Deterministic fixture");
    expect(
      view.container.querySelector(".pull-requests-list-pane h1")?.textContent
    ).toBe("Pull requests");
    expect(view.container.querySelector(".pull-requests-page")).not.toBeNull();

    const summaries = await loadPullRequests();
    const detail = await loadPullRequest(summaries[0]);
    expect(summaries.map((item) => item.number)).toEqual([279, 276]);
    expect(detail.files[0].path).toBe("apps/desktop/src/App.tsx");
    expect(pullRequestTasks[0].pullRequest?.number).toBe(279);
  });

  test("composes the production PR review panel beside the conversation", async () => {
    const view = renderUiLab({ route: "pr-dock" });

    expect(
      view.container.querySelector("main[aria-label='Conversation fixture']")
        ?.textContent
    ).toContain("Usage sidebar review");
    expect(
      view.container.querySelector("[data-dock-placement='right']")
    ).not.toBeNull();
    expect(
      view.container.querySelector('section[aria-label="GitHub pull request"]')
    ).not.toBeNull();

    const pullRequest = await pullRequestPanelApi.currentPullRequest(
      "/ui-lab/acme/code-two"
    );
    const diff = await pullRequestPanelApi.pullRequestDiff(
      "/ui-lab/acme/code-two",
      279
    );
    expect(pullRequest?.number).toBe(279);
    expect(diff.text).toContain("const showUsage = account !== null;");
  });

  test("uses URL theme and language without overwriting normal preferences", async () => {
    setAppearanceSettings({ preference: "light" });
    dom.window.localStorage.setItem("codetwo.language", "en");
    const appearanceBefore = dom.window.localStorage.getItem(
      "codetwo.appearance.v1"
    );

    renderUiLab({ theme: "dark", language: "zh-CN" });
    await flush();

    expect(dom.document.documentElement.classList.contains("dark")).toBe(true);
    expect(dom.document.documentElement.lang).toBe("zh-CN");
    expect(dom.window.localStorage.getItem("codetwo.language")).toBe("en");
    expect(dom.window.localStorage.getItem("codetwo.appearance.v1")).toBe(
      appearanceBefore
    );
  });

  test("keeps the UI Lab route development-only and preserves the legacy design-system route", () => {
    expect(mainSource).toContain(
      'import.meta.env.DEV ? searchParams.get("ui-lab") : null'
    );
    expect(mainSource).toContain(
      'import.meta.env.DEV && searchParams.has("design-system")'
    );
    expect(mainSource).toContain('import("./design/ui-lab/UiLab")');
  });
});
