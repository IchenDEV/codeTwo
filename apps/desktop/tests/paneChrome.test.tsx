// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { PaneToolbar, PanePreview, PaneDivider } = await import(
  "../src/session/PaneChrome"
);
const { computeDividers, singlePaneLayout, splitPane } = await import(
  "../src/session/paneLayout"
);

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

const LABELS = { splitRight: "Split right", splitDown: "Split down", close: "Close pane" };

function click(element: Element) {
  element.dispatchEvent(
    new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
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
      />,
    );
    await flush();

    const buttons = Array.from(rendered.container.querySelectorAll("button"));
    // No close button while canClose is false.
    expect(buttons).toHaveLength(2);
    click(rendered.container.querySelector("[aria-label='Split right']")!);
    click(rendered.container.querySelector("[aria-label='Split down']")!);
    await flush();
    expect(calls).toEqual(["right", "down"]);
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
      />,
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
    const layout = splitPane(singlePaneLayout("p1"), "p1", "row", "after", "p2");
    const [divider] = computeDividers(layout.root);
    const ratios: number[] = [];

    // A fake 1000x500 container so client coordinates map to a known fraction.
    const container = { current: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 500 }) } };

    const rendered = mount(
      <PaneDivider divider={divider} containerRef={container} onResize={(r) => ratios.push(r)} />,
    );
    await flush();

    const handle = rendered.container.querySelector("[data-divider-id]")!;
    handle.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    // Drag to x = 300 → ratio 0.3.
    dom.window.dispatchEvent(new dom.window.MouseEvent("pointermove", { clientX: 300, clientY: 250 }));
    // Drag past the left edge → clamped, never below the minimum.
    dom.window.dispatchEvent(new dom.window.MouseEvent("pointermove", { clientX: -100, clientY: 250 }));
    dom.window.dispatchEvent(new dom.window.MouseEvent("pointerup", {}));
    await flush();

    expect(ratios.length).toBeGreaterThanOrEqual(2);
    expect(ratios[0]).toBeCloseTo(0.3, 5);
    expect(ratios[ratios.length - 1]).toBeGreaterThanOrEqual(0.1);
    rendered.unmount();
  });
});
