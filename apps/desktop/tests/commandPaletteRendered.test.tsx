// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { CommandPalette } = await import("../src/palette/CommandPalette");

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
});
