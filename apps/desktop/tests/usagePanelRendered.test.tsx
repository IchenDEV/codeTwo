// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { UsagePanel } = await import("../src/usage/Usage");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("UsagePanel", () => {
  test("renders the existing usage report as an embedded settings panel", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <UsagePanel />
      </I18nProvider>,
    );

    expect(view.container.querySelector("h1")?.textContent).toBe("Usage");
    expect(view.container.textContent).toContain("Review local model usage");
    expect(view.container.querySelector('[title="Rescan"]')).toBeTruthy();
    expect(view.container.textContent).toContain("7d");
    expect(view.container.textContent).toContain("30d");
    expect(dom.document.body.querySelector('[data-slot="dialog-content"]')).toBeNull();

    await flush();
    view.unmount();
  });
});
