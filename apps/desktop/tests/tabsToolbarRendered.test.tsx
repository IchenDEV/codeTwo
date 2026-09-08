// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, dom, flush, mount } from "./domTestHarness";

activateDom();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { Tabs, TabsList, TabsTrigger } =
  await import("../src/components/ui/tabs");

afterEach(() => {
  dom.document.body.replaceChildren();
});

function renderToolbarTabs() {
  return mount(
    <Tabs defaultValue="trajectory">
      <TabsList variant="toolbar">
        <TabsTrigger value="trajectory">Execution trajectory</TabsTrigger>
        <TabsTrigger value="browser">Browser</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

describe("toolbar Tabs selected state", () => {
  test("keeps the compact toolbar selection inside the active trigger", async () => {
    const view = renderToolbarTabs();
    await flush();

    const list = view.container.querySelector('[data-slot="tabs-list"]');
    const active = list?.querySelector("[data-active]");

    expect(list?.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(active?.className).toContain(
      "group-data-[variant=toolbar]/tabs-list:data-active:bg-secondary"
    );
    expect(active?.className).not.toContain(
      "group-data-[variant=toolbar]/tabs-list:data-active:bg-transparent"
    );

    view.unmount();
  });
});
