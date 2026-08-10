// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, button, click, dom, image, mount, restoreDom, text, waitFor } from "./domTestHarness";

const snapshot = {
  id: "history-canvas",
  owner: "desktop-test",
  revision: 4,
  title: "Board",
  theme: "light",
  envelope: {
    engine: "@excalidraw/excalidraw",
    engineVersion: "0.18.1",
    schemaVersion: 1,
    revision: 4,
    theme: "light",
    assets: [],
    scene: { elements: [], appState: {} },
  },
  manifest: { objects: [] },
  assets: [],
  createdAt: 1,
  updatedAt: 1,
  frozenAt: 2,
  objectCount: 3,
  summary: "Board summary",
  exports: [
    {
      id: "history-overview",
      kind: "overview",
      index: null,
      mimeType: "image/png",
      width: 1,
      height: 1,
      bytes: [1, 2, 3],
    },
  ],
};

activateDom();
const { TurnCard } = await import("../src/session/TurnCard");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

describe("Canvas history rendered behavior", () => {
  test("history card is read-only, exposes metadata/PNG, and duplicates by canonical ref", async () => {
    activateDom();
    const duplicate: unknown[] = [];
    const onDuplicate = (event) => duplicate.push(event.detail);
    dom.window.addEventListener("codetwo-canvas-duplicate", onDuplicate);
    const turn = {
      id: 1,
      accepted: true,
      streamBoundaryKnown: true,
      prompt: "before\n\n[canvas-history history-canvas@4] Board\ncanvas-text: note",
      text: "",
      textDeltas: [],
      observedTextDeltas: 0,
      observedThoughtDeltas: 0,
      pendingTextDeltaSkips: 0,
      pendingThoughtDeltaSkips: 0,
      thoughts: [],
      tools: [],
      plan: [],
      startedAt: 1,
    };
    const rendered = mount(<TurnCard turn={turn} canvasSnapshotLoader={async () => snapshot} />);
    await waitFor(() => expect(image(rendered.container, "Board thumbnail")).toBeTruthy());
    expect(text(rendered.container, "rev 4")).toBeTruthy();
    expect(text(rendered.container, "3 objects")).toBeTruthy();
    const exportButton = button(rendered.container, "Export PNG");
    expect(exportButton.disabled).toBe(false);
    click(exportButton);
    click(button(rendered.container, "Duplicate into Composer"));
    expect(duplicate).toEqual([{ id: "history-canvas", revision: 4 }]);
    expect(rendered.container.querySelector("textarea,input")).toBeNull();
    rendered.unmount();
    dom.window.removeEventListener("codetwo-canvas-duplicate", onDuplicate);
  });
});
