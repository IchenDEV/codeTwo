// @ts-nocheck
import { afterEach, describe, expect, mock, test } from "bun:test";
import React from "react";
import { activateDom, button, click, dom, flush, mount, maybeButton, restoreDom } from "./domTestHarness";

activateDom();
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ filter: "" }) as never;

const { CanvasBlockRuntimeContext, CanvasBlockView } = await import("../src/skillInline");

function envelope(revision = 3) {
  return JSON.stringify({
    engine: "@excalidraw/excalidraw",
    engineVersion: "0.18.1",
    schemaVersion: 1,
    revision,
    theme: "light",
    elements: [],
    appState: {
      viewBackgroundColor: "white",
      scrollX: 0,
      scrollY: 0,
      zoom: 1,
      gridSize: null,
      gridStep: 5,
      viewModeEnabled: false,
    },
    assetRefs: [],
  });
}

function runtime(events: string[], handleRef: any) {
  return {
    enabled: true,
    theme: "dark",
    normalizeMedia: async () => null,
    resolveAsset: async () => null,
    getAssets: () => [],
    onAsset: () => {},
    onCanvasActivity: () => {},
    saveDraft: async () => ({ id: "canvas", revision: 3, title: "Canvas", theme: "light", envelope: { scene: {} }, assets: [] }),
    freezeDraft: async () => ({}),
    onCanvasRemoved: () => events.push("removed"),
    onCanvasRestored: () => events.push("restored"),
    onCanvasUnmount: () => events.push("unmounted"),
    onCanvasFrozen: () => events.push("frozen"),
    onCanvasDeliveryError: (_id: string, message: string, kind?: string) => events.push(`${kind}:${message}`),
    register: (handle: any) => {
      handleRef.current = handle;
      return () => events.push("disposed");
    },
  };
}

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("mounted CanvasBlock host behavior", () => {
  test("registers a live handle and exposes provider-only structure fallback plus switch affordance", async () => {
    activateDom();
    const events: string[] = [];
    const handleRef: any = { current: null };
    const updates: any[] = [];
    const providerRequests: Event[] = [];
    const providerListener = (event: Event) => providerRequests.push(event);
    dom.window.addEventListener("codetwo-open-provider-picker", providerListener);
    const view = mount(
      <CanvasBlockRuntimeContext.Provider value={runtime(events, handleRef)}>
        <CanvasBlockView
          block={{ props: { id: "canvas", revision: 3, title: "Canvas", envelope: envelope(), pixelPolicy: "required" } }}
          editor={{ updateBlock: (_block: unknown, update: unknown) => updates.push(update) }}
        />
      </CanvasBlockRuntimeContext.Provider>,
    );
    expect(handleRef.current?.id).toBe("canvas");
    expect(view.container.querySelector("[data-canvas-theme]")?.getAttribute("data-canvas-theme")).toBe("dark");
    expect(maybeButton(view.container, "Send structure only")).toBeNull();
    await flush();
    await (async () => {
      handleRef.current.setError("provider rejected images", "provider_image");
    })();
    await flush();
    const structureOnly = button(view.container, "Send structure only");
    expect(structureOnly).toBeTruthy();
    expect(button(view.container, "Switch provider")).toBeTruthy();
    click(button(view.container, "Switch provider"));
    expect(providerRequests).toHaveLength(1);
    click(structureOnly);
    expect(updates.at(-1).props.pixelPolicy).toBe("structure_only");
    await (async () => {
      handleRef.current.setError("CAS stale", "other");
    })();
    await flush();
    expect(maybeButton(view.container, "Send structure only")).toBeNull();
    view.unmount();
    expect(events).toContain("disposed");
    dom.window.removeEventListener("codetwo-open-provider-picker", providerListener);
  });
});
