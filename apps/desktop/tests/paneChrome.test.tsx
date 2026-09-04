import { afterEach, describe, expect, test } from "bun:test";

// @ts-nocheck
import { act as reactAct } from "react";

import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { PaneToolbar, PaneLayoutToolbar, PanePreview, PaneDivider } =
  await import("../src/session/PaneChrome");
const { TooltipProvider } = await import("../src/components/ui/tooltip");
const { computeDividers, singlePaneLayout, splitPane } =
  await import("../src/session/paneLayout");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

const LABELS = {
  splitRight: "Split right",
  splitDown: "Split down",
  close: "Close pane",
};
const SHORTCUTS = { splitRight: "⌘⌥R", splitDown: "⌘⌥D", sidePanel: "⌘⌥P" };

function click(element: Element) {
  element.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })
  );
}

async function press(element: Element) {
  await reactAct(async () => {
    element.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
      })
    );
    element.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true, cancelable: true })
    );
  });
  await flush();
}

describe("PaneChrome", () => {
  test("toolbar wires split and close, and hides close when it can't", async () => {
    const calls: string[] = [];
    const rendered = mount(
      <PaneToolbar
        onSplitRight={() => calls.push("right")}
        onSplitDown={() => calls.push("down")}
        onClose={() => calls.push("close")}
        canClose={false}
        labels={LABELS}
      />
    );
    await flush();

    const buttons = [...rendered.container.querySelectorAll("button")];
    // No close button while canClose is false.
    expect(buttons).toHaveLength(2);
    for (const toolbarButton of buttons) {
      expect(toolbarButton.dataset.variant).toBe("ghost");
      expect(toolbarButton.classList.contains("size-7")).toBe(true);
      expect(toolbarButton.classList.contains("text-muted-foreground")).toBe(
        true
      );
      expect(
        toolbarButton.classList.contains("hover:text-muted-foreground")
      ).toBe(true);
    }
    click(rendered.container.querySelector("[aria-label='Split right']")!);
    click(rendered.container.querySelector("[aria-label='Split down']")!);
    await flush();
    expect(calls).toEqual(["right", "down"]);
    rendered.unmount();
  });

  test("groups pane and side-panel commands in one labeled View menu", async () => {
    const calls: string[] = [];
    const rendered = mount(
      <TooltipProvider>
        <PaneLayoutToolbar
          onSplitRight={() => calls.push("right")}
          onSplitDown={() => calls.push("down")}
          onClose={() => calls.push("close")}
          canClose={false}
          labels={LABELS}
          groupLabel="Pane and panel layout"
          viewLabel="View"
          shortcuts={SHORTCUTS}
          panelLabel="Side panel"
          panelActive
          onTogglePanel={() => calls.push("panel")}
        />
      </TooltipProvider>
    );
    await flush();

    const group = rendered.container.querySelector(
      '[role="group"][aria-label="Pane and panel layout"]'
    );
    expect(group?.classList.contains("session-header-layout-actions")).toBe(
      true
    );
    const buttons = [...(group?.querySelectorAll("button") ?? [])];
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("View");
    expect(
      buttons[0].querySelector(".session-header-layout-label")?.textContent
    ).toBe("View");
    expect(buttons[0].classList.contains("bg-fill-rest")).toBe(true);

    await press(buttons[0]);
    expect(dom.document.body.textContent).toContain("Split right");
    expect(dom.document.body.textContent).toContain("Split down");
    expect(dom.document.body.textContent).not.toContain("Close pane");
    const panel = dom.document.body.querySelector('[role="menuitemcheckbox"]');
    expect(panel?.textContent).toContain("Side panel");
    expect(panel?.querySelector("span")?.textContent).toBe("⌘⌥P");
    expect(panel?.dataset.checked).not.toBeNull();
    if (!panel) throw new Error("Side panel menu item not found");
    await press(panel);
    expect(calls).toEqual(["panel"]);

    const splitRight = [
      ...dom.document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes("Split right"));
    if (!splitRight) throw new Error("Split right menu item not found");
    expect(splitRight.querySelector("span")?.textContent).toBe("⌘⌥R");
    const splitDown = [
      ...dom.document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes("Split down"));
    expect(splitDown?.querySelector("span")?.textContent).toBe("⌘⌥D");
    await press(splitRight);
    expect(calls).toEqual(["panel", "right"]);
    rendered.unmount();
  });

  test("offers close pane from the layout menu only when multiple panes exist", async () => {
    const calls: string[] = [];
    const rendered = mount(
      <TooltipProvider>
        <PaneLayoutToolbar
          onSplitRight={() => calls.push("right")}
          onSplitDown={() => calls.push("down")}
          onClose={() => calls.push("close")}
          canClose
          labels={LABELS}
          groupLabel="Pane and panel layout"
          viewLabel="View"
          shortcuts={SHORTCUTS}
          panelLabel="Side panel"
          panelActive={false}
          onTogglePanel={() => calls.push("panel")}
        />
      </TooltipProvider>
    );
    await flush();

    await press(rendered.container.querySelector('[aria-label="View"]')!);
    const closePane = [
      ...dom.document.body.querySelectorAll('[role="menuitem"]'),
    ].find((item) => item.textContent?.includes("Close pane"));
    if (!closePane) throw new Error("Close pane menu item not found");
    await press(closePane);
    expect(calls).toEqual(["close"]);
    rendered.unmount();
  });

  test("preview shows its empty state and a running indicator", async () => {
    const rendered = mount(
      <PanePreview
        title="Session A"
        running
        turns={[]}
        emptyLabel="No messages yet"
        toolbar={{
          onSplitRight: () => {},
          onSplitDown: () => {},
          onClose: () => {},
          canClose: true,
          labels: LABELS,
        }}
      />
    );
    await flush();

    expect(rendered.container.textContent).toContain("Session A");
    expect(rendered.container.textContent).toContain("No messages yet");
    // Running dot + all three toolbar buttons (canClose true).
    expect(rendered.container.querySelectorAll("button")).toHaveLength(3);
    rendered.unmount();
  });

  test("divider reports a clamped ratio while dragging", async () => {
    // A single horizontal split: one divider at x = 0.5 across the unit square.
    const layout = splitPane(
      singlePaneLayout("p1"),
      "p1",
      "row",
      "after",
      "p2"
    );
    const [divider] = computeDividers(layout.root);
    const ratios: number[] = [];

    // A fake 1000x500 container so client coordinates map to a known fraction.
    const container = {
      current: {
        getBoundingClientRect: () => ({
          left: 0,
          top: 0,
          width: 1000,
          height: 500,
        }),
      },
    };

    const rendered = mount(
      <PaneDivider
        divider={divider}
        containerRef={container}
        onResize={(r) => ratios.push(r)}
      />
    );
    await flush();

    const handle = rendered.container.querySelector("[data-divider-id]")!;
    let capturedPointer = null;
    handle.setPointerCapture = (pointerId) => {
      capturedPointer = pointerId;
    };
    handle.hasPointerCapture = (pointerId) => capturedPointer === pointerId;
    handle.releasePointerCapture = () => {
      capturedPointer = null;
    };
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-valuenow")).toBe("0.5");
    handle.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      })
    );
    expect(ratios.at(-1)).toBeCloseTo(0.52, 5);

    handle.dispatchEvent(
      new dom.window.PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 7,
        clientX: 500,
      })
    );
    // Drag to x = 300 → ratio 0.3.
    handle.dispatchEvent(
      new dom.window.PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 7,
        clientX: 300,
        clientY: 250,
      })
    );
    // Drag past the left edge → clamped, never below the minimum.
    handle.dispatchEvent(
      new dom.window.PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 7,
        clientX: -100,
        clientY: 250,
      })
    );
    handle.dispatchEvent(
      new dom.window.PointerEvent("pointerup", { bubbles: true, pointerId: 7 })
    );
    await flush();

    expect(ratios.length).toBeGreaterThanOrEqual(2);
    expect(ratios).toContainEqual(0.3);
    expect(ratios.at(-1)).toBeGreaterThanOrEqual(0.1);
    rendered.unmount();
  });
});
