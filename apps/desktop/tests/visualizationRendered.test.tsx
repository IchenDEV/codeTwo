// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { VisualizationFrame } =
  await import("../src/session/VisualizationFrame");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("visualization frame", () => {
  test("loads a fragment into a script-only sandbox with the host CSP", async () => {
    activateDom();
    const rendered = mount(
      <VisualizationFrame
        reference={{ path: "/tmp/plot.html", title: "Latency" }}
        loader={async () => '<div id="plot">Latency</div>'}
      />
    );
    await Promise.resolve();
    await flush();
    const iframe = rendered.container.querySelector("iframe");

    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe?.getAttribute("title")).toBe("Latency");
    expect(iframe?.getAttribute("srcdoc")).toContain("connect-src 'none'");
    expect(iframe?.getAttribute("srcdoc")).toContain(
      '<div id="plot">Latency</div>'
    );
    rendered.unmount();
  });

  test("routes a token-bound iframe follow-up into the host event seam", async () => {
    activateDom();
    const rendered = mount(
      <VisualizationFrame
        reference={{ path: "/tmp/plot.html", title: "Latency" }}
        loader={async () => '<button id="follow">Follow up</button>'}
      />
    );
    await Promise.resolve();
    await flush();
    const iframe = rendered.container.querySelector("iframe");
    const token = /const token="([^"]+)"/.exec(
      iframe?.getAttribute("srcdoc") ?? ""
    )?.[1];
    let detail: unknown;
    dom.window.addEventListener(
      "codetwo-visualize-follow-up",
      (event) => {
        detail = (event as CustomEvent).detail;
      },
      { once: true }
    );
    dom.window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        source: iframe?.contentWindow,
        data: {
          type: "codetwo-visualize-follow-up",
          token,
          prompt: "Compare with last week",
          title: "Latency follow-up",
        },
      })
    );
    expect(detail).toEqual({
      prompt: "Compare with last week",
      title: "Latency follow-up",
    });
    rendered.unmount();
  });

  test("shows a bounded error state when the host rejects the path", async () => {
    activateDom();
    const rendered = mount(
      <VisualizationFrame
        reference={{ path: "/tmp/missing.html" }}
        loader={async () => {
          throw new Error("missing");
        }}
      />
    );
    await Promise.resolve();
    await flush();
    expect(rendered.container.querySelector('[role="alert"]')).toBeTruthy();
    expect(rendered.container.querySelector("iframe")).toBeNull();
    rendered.unmount();
  });
});
