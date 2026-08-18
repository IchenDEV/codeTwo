// @ts-nocheck
import { act as reactAct } from "react";
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, flush, mount, restoreDom, waitFor } from "./domTestHarness";

activateDom();
const { I18nProvider } = await import("../src/i18n");
const { EnvironmentPopover } = await import("../src/environment/EnvironmentPopover");
const { ToastProvider } = await import("../src/ui/toast");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function renderEnvironment(onRefresh = () => {}) {
  return mount(
    <I18nProvider>
      <ToastProvider>
        <EnvironmentPopover
          project="mini-game"
          projectPath="/tmp/mini-game"
          projects={[]}
          git={null}
          diffStat={{ added: 0, deleted: 0 }}
          onRefresh={onRefresh}
          onSelectProject={() => {}}
          onAddProject={() => {}}
          onCheckpoint={() => {}}
          onOpenSourceControl={() => {}}
          onOpenIssues={() => {}}
          onOpenUsage={() => {}}
          onOpenMarket={() => {}}
          onOpenSettings={() => {}}
        />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("EnvironmentPopover layout", () => {
  test("stays out of the reading surface until requested and dismisses on outside press", async () => {
    activateDom();
    let refreshes = 0;
    const outside = dom.document.createElement("button");
    outside.textContent = "Reading surface";
    dom.document.body.append(outside);
    const view = renderEnvironment(() => {
      refreshes += 1;
    });

    expect(dom.document.body.querySelector('[data-slot="popover-content"]')).toBeNull();

    const trigger = view.container.querySelector('[aria-label="Project environment"]');
    expect(trigger).toBeTruthy();
    await reactAct(async () => {
      trigger?.dispatchEvent(
        new dom.window.PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
        }),
      );
      trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    await flush();

    const content = dom.document.body.querySelector('[data-slot="popover-content"]');
    expect(content).toBeTruthy();
    expect(content?.className).toContain("max-h-(--available-height)");
    expect(content?.className).toContain("overflow-y-auto");
    expect(refreshes).toBe(1);

    await reactAct(async () => {
      outside.dispatchEvent(
        new dom.window.PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 2,
        }),
      );
      outside.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    await waitFor(() => {
      expect(dom.document.body.querySelector('[data-slot="popover-content"]')).toBeNull();
    });
    view.unmount();
  });
});
