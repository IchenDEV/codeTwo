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
  test("renders the sidebar recovery action supplied by the persistent shell", async () => {
    activateDom();
    const view = mount(
      <I18nProvider>
        <ToastProvider>
          <AutomationsPage
            projects={[]}
            providers={[]}
            defaultProject="."
            defaultProvider="codex"
            onOpenSession={() => {}}
            headerLeadingAction={<button aria-label="Expand the sidebar" />}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    expect(view.container.querySelector('button[aria-label="Expand the sidebar"]')).not.toBeNull();

    await flush();
    view.unmount();
  });

  test("uses the pull-request split list and detail layout", async () => {
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
    const listPane = view.container.querySelector("[data-automation-list-pane]");
    const detailPane = view.container.querySelector("[data-automation-detail-pane]");
    const search = view.container.querySelector("[data-automation-search]");
    const filters = view.container.querySelector("[data-automation-filters]");
    const detailTabs = detailPane?.querySelector('[role="tablist"]');

    expect(page?.className).toContain("flex-1");
    expect(page?.className).toContain("automations-page");
    expect(page?.getAttribute("data-compact-detail")).toBe("false");
    expect([...view.container.querySelectorAll("button")].some((item) => item.textContent?.trim() === "Back")).toBeFalse();
    expect(listPane?.className).toContain("automation-list-pane");
    expect(listPane?.className).toContain("bg-sidebar");
    expect(detailPane?.className).toContain("automation-detail-pane");
    expect(detailPane?.textContent).toContain("Select an automation");
    expect(search?.getAttribute("type")).toBe("search");
    expect(filters?.getAttribute("role")).toBe("tablist");
    expect(filters?.querySelectorAll('[role="tab"]').length).toBe(3);
    expect(detailTabs?.querySelectorAll('[role="tab"]').length).toBe(2);
    expect(detailTabs?.querySelectorAll('[role="tab"]:disabled').length).toBe(2);
    expect(view.container.querySelector("[data-automation-task-center]")).toBeNull();
    expect(view.container.querySelector("[data-automation-inline-detail]")).toBeNull();

    await flush();
    view.unmount();
  });

  test("is mounted inside the persistent session shell instead of replacing the whole window", () => {
    expect(appSource).not.toContain(") : showAutomations ? (");
    expect(appSource).toContain("{showAutomations && (");
    expect(appSource).toMatch(
      /showTaskBoard\s*\|\|\s*showPluginManager\s*\|\|\s*showAutomations/,
    );
    const automationsCall = appSource.match(/<AutomationsPage\b[\s\S]*?\n\s*\/>/)?.[0] ?? "";
    const taskBoardCall = appSource.match(/<TaskBoardPage\b[\s\S]*?\n\s*\/>/)?.[0] ?? "";
    expect(automationsCall).toContain("headerLeadingAction=");
    expect(taskBoardCall).toContain("headerLeadingAction=");
  });

  test("keeps create and edit work in the detail pane instead of opening a dialog", async () => {
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
    expect(view.container.querySelector("[data-automation-search]")).not.toBeNull();
    expect(view.container.querySelector("[data-automation-detail-pane] [data-automation-editor]")).not.toBeNull();
    expect(view.container.querySelector("[data-automation-page]")?.getAttribute("data-compact-detail")).toBe("true");

    click(button(view.container, "Back to automations"));
    await flush();

    expect(view.container.querySelector("[data-automation-editor]")).toBeNull();
    expect(view.container.querySelector("[data-automation-page]")?.getAttribute("data-compact-detail")).toBe("false");

    await flush();
    view.unmount();
  });
});
