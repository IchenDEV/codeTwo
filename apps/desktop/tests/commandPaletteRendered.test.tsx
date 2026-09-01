// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { activateDom, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { CommandPalette } = await import("../src/palette/CommandPalette");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

let previousResizeObserver;

beforeEach(() => {
  activateDom();
  previousResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  dom.document.body.replaceChildren();
  globalThis.ResizeObserver = previousResizeObserver;
  restoreDom();
});

const commands = [
  { id: "run", label: "Run prompt", run: () => {} },
  { id: "session", category: "session", label: "Search polish", run: () => {} },
  { id: "settings", category: "setting", label: "Open settings", run: () => {} },
];

describe("CommandPalette", () => {
  test("renders the glass surface, grouped results, and keyboard footer", () => {
    const view = mount(
      <I18nProvider>
        <CommandPalette commands={commands} onClose={() => {}} />
      </I18nProvider>,
    );

    const body = dom.document.body;
    expect(body.querySelector(".command-palette-surface")).toBeTruthy();
    expect(body.querySelector('[data-slot="command-list"]')?.className).toContain("flex-1");
    expect(body.querySelector('[data-slot="command-list"]')?.className).toContain("max-h-none");
    expect(styles).toContain("height: min(32rem, calc(100dvh - var(--ds-space-page-section)));");
    expect(body.querySelector('[data-palette-group="session"]')).toBeTruthy();
    expect(body.querySelector('[data-palette-group="action"]')).toBeTruthy();
    expect(body.querySelector('[data-palette-group="setting"]')).toBeTruthy();
    expect(body.textContent).toContain("↑↓");
    expect(body.textContent).toContain("esc");
    view.unmount();
  });

  test("filters the result groups without changing the search command set", async () => {
    const view = mount(
      <I18nProvider>
        <CommandPalette commands={commands} onClose={() => {}} />
      </I18nProvider>,
    );

    const sessions = dom.document.body.querySelector('[data-palette-filter="session"]');
    click(sessions);
    await flush();

    expect(sessions.getAttribute("aria-pressed")).toBe("true");
    expect(dom.document.body.querySelector('[data-palette-group="session"]')).toBeTruthy();
    expect(dom.document.body.querySelector('[data-palette-group="action"]')).toBeNull();
    expect(dom.document.body.querySelector('[data-palette-group="setting"]')).toBeNull();
    view.unmount();
  });

  test("previews current and archived Session results without opening them", async () => {
    const opened = [];
    const view = mount(
      <I18nProvider>
        <CommandPalette
          commands={[
            {
              id: "current-session",
              category: "session",
              label: "Current implementation",
              preview: {
                title: "Current implementation",
                body: "The current transcript match",
                context: "CodeTwo",
                current: true,
              },
              run: () => opened.push("current"),
            },
            {
              id: "archived-session",
              category: "session",
              label: "Archived exploration",
              preview: {
                title: "Archived exploration",
                body: "A readable historical transcript match",
                context: "CodeTwo",
                archived: true,
              },
              run: () => opened.push("archived"),
            },
          ]}
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    await flush();

    const preview = dom.document.body.querySelector("[data-palette-preview]");
    expect(preview?.textContent).toContain("Read-only preview");
    expect(preview?.textContent).toContain("Current");
    expect(preview?.textContent).toContain("The current transcript match");
    expect(opened).toEqual([]);

    const archivedItem = Array.from(dom.document.body.querySelectorAll('[data-slot="command-item"]'))
      .find((item) => item.textContent?.includes("Archived exploration"));
    archivedItem?.dispatchEvent(new dom.window.MouseEvent("mousemove", { bubbles: true }));
    await flush();
    expect(preview?.textContent).toContain("Archived");
    expect(preview?.textContent).toContain("A readable historical transcript match");
    expect(opened).toEqual([]);
    view.unmount();
  });
});
