// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { activateDom, button, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { AutomationsPage } = await import("../src/automation/AutomationsPage");
const { I18nProvider } = await import("../src/i18n");
const { ToastProvider } = await import("../src/ui/toast");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("AutomationsPage layout", () => {
  test("uses a centered Codex-style task center instead of a split list and detail view", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <ToastProvider>
          <AutomationsPage
            projects={[{ name: "mini-game", path: "/tmp/mini-game", last_opened_at: Date.now() }]}
            providers={[]}
            defaultProject="/tmp/mini-game"
            defaultProvider="codex"
            onOpenSession={() => {}}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    const page = view.container.querySelector("[data-automation-page]");
    const title = view.container.querySelector("h1");
    const header = view.container.querySelector("header");
    const description = header?.querySelector("p");
    const taskCenter = view.container.querySelector("[data-automation-task-center]");
    const search = view.container.querySelector("[data-automation-search]");
    const filters = view.container.querySelector("[data-automation-filters]");

    expect(page?.className).toContain("flex-1");
    expect(header?.className).toContain("flex-col");
    expect(header?.className).toContain("sm:flex-row");
    expect(title?.className).toContain("text-display");
    expect(title?.className).toContain("tracking-tight");
    expect(description?.className).toContain("max-w-2xl");
    expect(description?.className).toContain("leading-relaxed");
    expect([...view.container.querySelectorAll("button")].some((item) => item.textContent?.trim() === "Back")).toBeFalse();
    expect(title?.textContent).toBe("Scheduled tasks");
    expect(taskCenter?.className).toContain("max-w-4xl");
    expect(search?.getAttribute("type")).toBe("search");
    expect(filters?.getAttribute("role")).toBe("tablist");
    expect(filters?.querySelectorAll('[role="tab"]').length).toBe(3);
    expect(view.container.querySelector("[data-automation-list-pane]")).toBeNull();
    expect(view.container.querySelector("[data-automation-detail-pane]")).toBeNull();

    await flush();
    view.unmount();
  });

  test("is mounted inside the persistent session shell instead of replacing the whole window", () => {
    expect(appSource).not.toContain(") : showAutomations ? (");
    expect(appSource).toContain("{showAutomations && (");
    expect(appSource).toMatch(
      /showTaskBoard\s*\|\|\s*showPluginManager\s*\|\|\s*showAutomations/,
    );
  });

  test("keeps create and edit work in the task center instead of opening a dialog", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <ToastProvider>
          <AutomationsPage
            projects={[{ name: "mini-game", path: "/tmp/mini-game", last_opened_at: Date.now() }]}
            providers={[{ id: "codex", display_name: "Codex", available: true }]}
            defaultProject="/tmp/mini-game"
            defaultProvider="codex"
            onOpenSession={() => {}}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    click(button(view.container, "New automation"));
    await flush();

    expect(view.container.querySelector("[data-automation-editor]")).not.toBeNull();
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(view.container.querySelector("[data-automation-search]")).toBeNull();

    await flush();
    view.unmount();
  });
});
