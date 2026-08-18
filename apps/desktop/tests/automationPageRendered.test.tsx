// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { AutomationsPage } = await import("../src/automation/AutomationsPage");
const { I18nProvider } = await import("../src/i18n");
const { ToastProvider } = await import("../src/ui/toast");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("AutomationsPage layout", () => {
  test("keeps macOS titlebar controls clear and bounds the task list on wide windows", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <ToastProvider>
          <AutomationsPage
            projects={[{ name: "mini-game", path: "/tmp/mini-game", last_opened_at: Date.now() }]}
            providers={[]}
            defaultProject="/tmp/mini-game"
            defaultProvider="codex"
            onClose={() => {}}
            onOpenSession={() => {}}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    const header = view.container.querySelector("header");
    const title = view.container.querySelector("h1");
    const listPane = view.container.querySelector("[data-automation-list-pane]");
    const detailPane = view.container.querySelector("[data-automation-detail-pane]");

    expect(header?.className).toContain("pl-24");
    expect(title?.className).toContain("text-heading");
    expect(listPane?.className).toContain("w-72");
    expect(listPane?.className).toContain("xl:w-80");
    expect(listPane?.className).toContain("2xl:w-96");
    expect(listPane?.className).toContain("shrink-0");
    expect(listPane?.className).not.toContain("basis-2/5");
    expect(detailPane?.className).toContain("@container/automation-detail");
    expect(detailPane?.className).toContain("min-w-0");

    await flush();
    view.unmount();
  });
});
