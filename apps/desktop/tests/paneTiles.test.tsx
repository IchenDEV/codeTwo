// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { PaneTiles } = await import("../src/session/PaneTiles");
const { singlePaneLayout, splitPane } =
  await import("../src/session/paneLayout");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

// [ p1 | (p2 / p3) ], focus lands on the last-created pane (p3).
function tiledLayout() {
  let layout = splitPane(singlePaneLayout("p1"), "p1", "row", "after", "p2");
  layout = splitPane(layout, "p2", "col", "after", "p3");
  return layout;
}

function mousedown(element: Element) {
  element.dispatchEvent(
    new dom.window.MouseEvent("mousedown", { bubbles: true, cancelable: true })
  );
}

describe("PaneTiles", () => {
  test("renders one frame per leaf and marks the focused pane", async () => {
    const rendered = mount(
      <PaneTiles
        layout={tiledLayout()}
        renderPane={(paneId) => <div data-content={paneId}>{paneId}</div>}
        onFocusPane={() => {}}
        onResizeSplit={() => {}}
      />
    );
    await flush();

    const frames = Array.from(
      rendered.container.querySelectorAll("[data-pane-id]")
    );
    expect(
      frames.map((frame) => frame.getAttribute("data-pane-id")).sort()
    ).toEqual(["p1", "p2", "p3"]);
    expect(
      rendered.container
        .querySelector("[data-focused]")
        ?.getAttribute("data-pane-id")
    ).toBe("p3");
    // Every leaf's content is mounted, not just the focused one.
    expect(
      rendered.container.querySelector("[data-content='p1']")
    ).not.toBeNull();
    expect(
      rendered.container.querySelector("[data-content='p2']")
    ).not.toBeNull();
    rendered.unmount();
  });

  test("pressing a non-focused pane requests focus; the focused one is inert", async () => {
    const focusRequests: string[] = [];
    const rendered = mount(
      <PaneTiles
        layout={tiledLayout()}
        renderPane={(paneId) => <div>{paneId}</div>}
        onFocusPane={(id) => focusRequests.push(id)}
        onResizeSplit={() => {}}
      />
    );
    await flush();

    mousedown(rendered.container.querySelector("[data-pane-id='p1']")!);
    await flush();
    expect(focusRequests).toEqual(["p1"]);

    // p3 is focused, so it carries no focus handler.
    mousedown(rendered.container.querySelector("[data-pane-id='p3']")!);
    await flush();
    expect(focusRequests).toEqual(["p1"]);
    rendered.unmount();
  });

  test("animates only newly split panes from their placement edge", async () => {
    const pane = (paneId: string) => <div>{paneId}</div>;
    let layout = singlePaneLayout("p1");
    const rendered = mount(
      <PaneTiles
        layout={layout}
        renderPane={pane}
        onFocusPane={() => {}}
        onResizeSplit={() => {}}
      />
    );
    await flush();

    const initialPane = rendered.container.querySelector(
      "[data-pane-id='p1']"
    )!;
    expect(initialPane.hasAttribute("data-pane-entrance")).toBe(false);

    layout = splitPane(layout, "p1", "row", "after", "p2");
    rendered.rerender(
      <PaneTiles
        layout={layout}
        renderPane={pane}
        onFocusPane={() => {}}
        onResizeSplit={() => {}}
      />
    );
    await flush();

    const rightPane = rendered.container.querySelector("[data-pane-id='p2']")!;
    expect(rightPane.getAttribute("data-pane-entrance")).toBe("right");
    expect(rightPane.classList.contains("pane-tile-enter-right")).toBe(true);
    expect(initialPane.classList.contains("pane-tile-enter")).toBe(false);

    rendered.rerender(
      <PaneTiles
        layout={layout}
        renderPane={pane}
        onFocusPane={() => {}}
        onResizeSplit={() => {}}
      />
    );
    await flush();
    expect(rendered.container.querySelector("[data-pane-id='p2']")).toBe(
      rightPane
    );
    expect(rightPane.classList.contains("pane-tile-enter-right")).toBe(true);

    layout = splitPane(layout, "p2", "col", "after", "p3");
    rendered.rerender(
      <PaneTiles
        layout={layout}
        renderPane={pane}
        onFocusPane={() => {}}
        onResizeSplit={() => {}}
      />
    );
    await flush();
    const bottomPane = rendered.container.querySelector("[data-pane-id='p3']")!;
    expect(bottomPane.getAttribute("data-pane-entrance")).toBe("bottom");
    expect(bottomPane.classList.contains("pane-tile-enter-bottom")).toBe(true);

    layout = splitPane(layout, "p1", "row", "before", "p4");
    rendered.rerender(
      <PaneTiles
        layout={layout}
        renderPane={pane}
        onFocusPane={() => {}}
        onResizeSplit={() => {}}
      />
    );
    await flush();
    expect(
      rendered.container
        .querySelector("[data-pane-id='p4']")
        ?.getAttribute("data-pane-entrance")
    ).toBe("left");

    layout = splitPane(layout, "p1", "col", "before", "p5");
    rendered.rerender(
      <PaneTiles
        layout={layout}
        renderPane={pane}
        onFocusPane={() => {}}
        onResizeSplit={() => {}}
      />
    );
    await flush();
    expect(
      rendered.container
        .querySelector("[data-pane-id='p5']")
        ?.getAttribute("data-pane-entrance")
    ).toBe("top");
    rendered.unmount();
  });

  test("renders a resize handle per split", async () => {
    const rendered = mount(
      <PaneTiles
        layout={tiledLayout()}
        renderPane={(paneId) => <div>{paneId}</div>}
        onFocusPane={() => {}}
        onResizeSplit={() => {}}
      />
    );
    await flush();
    expect(
      rendered.container.querySelectorAll("[data-divider-id]")
    ).toHaveLength(2);
    rendered.unmount();
  });
});
