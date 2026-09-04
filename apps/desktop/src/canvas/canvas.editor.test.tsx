// @ts-nocheck
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import React, { useEffect, useState } from "react";

import { activateDom, dom, restoreDom } from "../../tests/domTestHarness";

const canvasStyles = await Bun.file(
  new URL("styles.css", import.meta.url)
).text();

let act: any;
let cleanup: any;
let fireEvent: any;
let render: any;
let screen: any;

const fakeState = {
  elements: [],
  files: {},
  appState: {
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
    viewBackgroundColor: "white",
    viewModeEnabled: false,
  },
};
let latestProps: any = null;
let latestApi: any = null;
let lastExportOptions: any = null;
const exportDrawCalls: any[] = [];

function fakeCanvas(width = 1, height = 1) {
  const context = {
    drawImage: (...args: any[]) => exportDrawCalls.push(args),
  };
  return {
    width,
    height,
    getContext: () => context,
    toBlob: (callback: (blob: Blob | null) => void) =>
      callback(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })),
  };
}

function fakeImageElement(options: any) {
  return {
    id: `fake-image-${fakeState.elements.length + 1}`,
    type: "image",
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    angle: 0,
    strokeColor: options.strokeColor,
    backgroundColor: options.backgroundColor,
    fillStyle: options.fillStyle,
    strokeWidth: options.strokeWidth,
    strokeStyle: options.strokeStyle,
    roughness: options.roughness,
    roundness: null,
    opacity: options.opacity,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: null,
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    fileId: options.fileId,
    status: options.status ?? "saved",
    scale: [1, 1],
    crop: null,
  };
}

function fakeRectangleElement(id = "theme-rectangle") {
  return {
    id,
    type: "rectangle",
    x: 4,
    y: 8,
    width: 120,
    height: 60,
    angle: 0,
    strokeColor: "black",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roundness: null,
    roughness: 0,
    opacity: 100,
    seed: 1,
    version: 1,
    versionNonce: 1,
    index: "a0",
    isDeleted: false,
    groupIds: [],
    frameId: null,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  };
}

function FakeExcalidraw(props: any) {
  latestProps = props;
  const [rectangleSelected, setRectangleSelected] = useState(false);
  useEffect(() => {
    latestApi = {
      getAppState: () => fakeState.appState,
      getSceneElements: () => fakeState.elements,
      getFiles: () => fakeState.files,
      addFiles: (files: any[]) => {
        Object.assign(
          fakeState.files,
          Object.fromEntries(files.map((file) => [file.id, file]))
        );
      },
      updateScene: ({ elements, appState }: any) => {
        if (elements != null) fakeState.elements = elements;
        if (appState != null)
          fakeState.appState = { ...fakeState.appState, ...appState };
        latestProps?.onChange?.(
          fakeState.elements,
          fakeState.appState,
          fakeState.files
        );
      },
      resetScene: ({ elements, appState, files }: any) => {
        fakeState.elements = elements ?? [];
        fakeState.appState = { ...fakeState.appState, ...appState };
        fakeState.files = files ?? {};
      },
      refresh: () => {},
      setActiveTool: () => {},
    };
    props.excalidrawAPI?.(latestApi);
  }, [props]);
  return (
    <div data-testid="fake-excalidraw">
      <div className="main-menu-trigger">
        <button type="button">
          <span>Main menu</span>
        </button>
      </div>
      <button type="button" aria-label="Library">
        <span>Library</span>
      </button>
      <button
        type="button"
        aria-label="Keep selected tool active after drawing"
      >
        <span>Lock</span>
      </button>
      <button type="button" aria-label="More tools">
        <span>More tools</span>
      </button>
      <button type="button" aria-label="Help">
        <span>Help</span>
      </button>
      <button type="button" aria-label="Hand (panning tool)">
        <span>Hand</span>
      </button>
      <button type="button" aria-label="Draw — P or 7">
        <span>Draw</span>
      </button>
      <button
        type="button"
        aria-label="Rectangle"
        onClick={() => setRectangleSelected(true)}
      >
        <span>Rectangle</span>
      </button>
      <button type="button" aria-label="Undo">
        <span>Undo</span>
      </button>
      <button type="button" aria-label="Redo">
        <span>Redo</span>
      </button>
      {rectangleSelected ? (
        <section className="selected-shape-actions">
          <h2>Selected shape actions</h2>
          <button type="button" aria-label="Stroke">
            <span>Stroke</span>
          </button>
          <button type="button" aria-label="Background">
            <span>Background</span>
          </button>
        </section>
      ) : null}
    </div>
  );
}

void mock.module("./styles.css", () => ({}));
void mock.module("./excalidrawAdapter", () => ({
  Excalidraw: FakeExcalidraw,
  newImageElement: fakeImageElement,
  exportToCanvas: async (options: any) => {
    lastExportOptions = options;
    return fakeCanvas(5000, 3000);
  },
}));

let CanvasEditor: any;

activateDom();
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "MutationObserver",
  "KeyboardEvent",
  "ClipboardEvent",
  "DataTransfer",
  "File",
  "Blob",
]) {
  (globalThis as any)[key] = (dom as any)[key];
}
({ act, cleanup, fireEvent, render, screen } =
  await import("@testing-library/react"));
({ CanvasEditor } = await import("./CanvasEditor"));
await import("./remote-entry");

afterEach(() => {
  cleanup();
  latestProps = null;
  latestApi = null;
  fakeState.elements = [];
  fakeState.files = {};
  lastExportOptions = null;
  exportDrawCalls.length = 0;
  fakeState.appState = {
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
    viewBackgroundColor: "white",
    viewModeEnabled: false,
  };
  restoreDom();
});

beforeEach(() => {
  activateDom();
});

describe("CanvasEditor behavioral interaction contract", () => {
  test("scopes fallback tokens for the vanilla Remote shell", () => {
    for (const token of [
      "color-surface",
      "color-raised",
      "color-text",
      "color-text-muted",
      "color-primary",
      "color-focus",
      "color-fill-rest",
      "color-fill-hover",
      "color-primary-text",
      "color-destructive",
      "radius-module",
      "radius-control",
      "button-radius",
      "space-inline",
      "space-control-group",
      "space-section",
      "space-module-inset",
      "type-dialog-size",
      "type-dialog-leading",
      "type-callout-size",
      "type-callout-leading",
      "type-caption-size",
      "type-body-size",
      "type-body-leading",
    ]) {
      expect(canvasStyles).toContain(`var(--ds-${token},`);
    }
    expect(canvasStyles.match(/var\(--ds-[^,)\s]+\)/g) ?? []).toEqual([]);
    expect(canvasStyles).toContain(
      "--canvas-radius-module: var(--ds-radius-module, 16px);"
    );
    expect(canvasStyles).toContain(
      "--canvas-radius-control: var(--ds-radius-control, 12px);"
    );
    expect(canvasStyles).toContain(
      "--canvas-button-radius: var(--ds-button-radius, 12px);"
    );
    expect(canvasStyles).toContain('.canvas-editor[data-canvas-theme="light"]');
  });

  test("keeps C2 chrome in a bounded second row without toolbar overlap", () => {
    const chromeRule =
      /\.canvas-editor__chrome \{([\s\S]*?)\n\}/.exec(canvasStyles)?.[1] ?? "";
    expect(chromeRule).toContain(
      "inset-block-start: var(--canvas-chrome-offset)"
    );
    expect(chromeRule).toContain(
      "inset-inline-start: var(--canvas-space-module-inset)"
    );
    expect(chromeRule).toContain(
      "inset-inline-end: var(--canvas-space-module-inset)"
    );
    expect(chromeRule).toContain(
      "width: calc(100% - (var(--canvas-space-module-inset) * 2))"
    );
    expect(chromeRule).toContain("overflow: hidden");
    expect(canvasStyles).toContain(".canvas-editor__presets {");
    expect(canvasStyles).toContain("flex: 1 1 auto;");
    expect(canvasStyles).toContain("max-width: none;");
    expect(canvasStyles).toContain("min-width: 0;");
    expect(canvasStyles).toContain("overflow-x: auto;");
    expect(canvasStyles).toContain(".canvas-editor__done,");
    expect(canvasStyles).toContain(".canvas-editor__media-button {");
    expect(chromeRule).not.toContain(
      "inset-block-start: var(--canvas-space-module-inset)"
    );
    const narrowRule =
      /@media screen and \(max-width: 450px\) \{([\s\S]*?)\n\}/.exec(
        canvasStyles
      )?.[1] ?? "";
    expect(narrowRule).toContain("--canvas-chrome-offset: 8rem;");
  });

  test("edit mode uses the explicit current theme while frozen modes preserve the envelope theme", async () => {
    const value = {
      engine: "@excalidraw/excalidraw",
      engineVersion: "0.18.1",
      schemaVersion: 1,
      revision: 2,
      theme: "light",
      elements: [],
      appState: {
        viewBackgroundColor: "white",
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        gridSize: 20,
        gridStep: 5,
        viewModeEnabled: false,
      },
      assetRefs: [],
    };
    const editRef = React.createRef<any>();
    const { container } = render(
      <CanvasEditor
        ref={editRef}
        value={value}
        theme="dark"
        initiallyExpanded
      />
    );
    await act(async () => {});
    expect(latestProps.theme).toBe("dark");
    expect(
      (container.firstElementChild as HTMLElement).dataset.canvasTheme
    ).toBe("dark");
    expect(editRef.current.getEnvelope().theme).toBe("dark");

    cleanup();
    const historicalRef = React.createRef<any>();
    const historical = render(
      <CanvasEditor
        ref={historicalRef}
        value={value}
        theme="dark"
        mode="historical"
        initiallyExpanded
      />
    );
    await act(async () => {});
    expect(latestProps.theme).toBe("light");
    expect(
      (historical.container.firstElementChild as HTMLElement).dataset
        .canvasTheme
    ).toBe("light");
    expect(historicalRef.current.getEnvelope().theme).toBe("light");
  });

  test("expands and collapses with Escape while historical mode remains view-only", async () => {
    const { container } = render(
      <CanvasEditor mode="historical" name="History" />
    );
    expect(screen.getByRole("button", { name: "Open History" })).toBeTruthy();
    expect(screen.getByText("Click to expand and view")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open History" }));
    expect(
      container.querySelector('[data-canvas-collapsed="false"]')
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Image" })).toBeNull();
    fireEvent.keyDown(container.firstElementChild as HTMLElement, {
      key: "Escape",
    });
    expect(
      container.querySelector('[data-canvas-collapsed="true"]')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open History" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(
      container.querySelector('[data-canvas-collapsed="true"]')
    ).toBeTruthy();
  });

  test("debounces autosave without incrementing the core-owned revision", async () => {
    const onChange = mock(() => {});
    const value = {
      engine: "@excalidraw/excalidraw",
      engineVersion: "0.18.1",
      schemaVersion: 1,
      revision: 7,
      theme: "light",
      elements: [],
      appState: {
        viewBackgroundColor: "white",
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        gridSize: 20,
        gridStep: 5,
        viewModeEnabled: false,
      },
      assetRefs: [],
    };
    render(
      <CanvasEditor
        initiallyExpanded
        value={value}
        autosaveDebounceMs={20}
        onChange={onChange}
      />
    );
    await act(async () => {});
    await act(async () => {
      latestProps.onChange([], fakeState.appState, {});
    });
    expect(onChange).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].revision).toBe(7);
  });

  test("normalizes an image before addFiles and places an image element", async () => {
    const normalizer = mock(async () => ({
      ref: "trusted-image-1",
      bytes: new Uint8Array([137, 80, 78, 71]),
      mimeType: "image/png" as const,
      width: 80,
      height: 40,
    }));
    const onChange = mock(() => {});
    render(
      <CanvasEditor
        initiallyExpanded
        mediaNormalizer={normalizer}
        autosaveDebounceMs={10}
        onChange={onChange}
      />
    );
    const input = screen.getByLabelText(
      "Choose image files"
    ) as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "input.gif", {
      type: "image/gif",
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(normalizer).toHaveBeenCalledTimes(1);
    expect(Object.values(fakeState.files)).toHaveLength(1);
    expect(Object.keys(fakeState.files)[0]).toBe("trusted-image-1");
    expect(
      fakeState.elements.some((element: any) => element.type === "image")
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].assetRefs[0].ref).toBe("trusted-image-1");
    const { deserializeEnvelope, rehydrateEnvelope, serializeEnvelope } =
      await import("./serialize");
    const reopened = await rehydrateEnvelope(
      deserializeEnvelope(serializeEnvelope(onChange.mock.calls[0][0])),
      [
        {
          ref: "trusted-image-1",
          fileId: "trusted-image-1",
          mimeType: "image/png",
          bytes: new Uint8Array([137, 80, 78, 71]),
        },
      ]
    );
    expect(
      reopened.elements.find((element: any) => element.type === "image")?.fileId
    ).toBe("trusted-image-1");
    expect(reopened.files["trusted-image-1"]?.mimeType).toBe("image/png");
  });

  test("exposes only bounded C2 style presets and focuses the editor root", () => {
    const onFocusChange = mock(() => {});
    const { container } = render(
      <CanvasEditor initiallyExpanded onFocusChange={onFocusChange} />
    );
    expect(
      screen.getByRole("button", { name: "Stroke color black" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stroke width 2" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Fill color transparent" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Font Monospace" })).toBeTruthy();
    expect(latestProps.gridModeEnabled).toBe(true);
    expect(latestProps.objectsSnapModeEnabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Fill color blue" }));
    fireEvent.click(screen.getByRole("button", { name: "Stroke width 4" }));
    expect(fakeState.appState.currentItemBackgroundColor).toBe("blue");
    expect(fakeState.appState.currentItemFillStyle).toBe("solid");
    expect(fakeState.appState.currentItemStrokeWidth).toBe(4);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.focus(root);
    fireEvent.blur(root);
    expect(onFocusChange).toHaveBeenNthCalledWith(1, true);
    expect(onFocusChange).toHaveBeenNthCalledWith(2, false);
  });

  test("prunes third-party chrome while keeping approved tools, presets, Image, and Done", async () => {
    const { container } = render(<CanvasEditor initiallyExpanded />);
    await act(async () => {});
    const root = container.firstElementChild as HTMLElement;
    expect(root.querySelector(".main-menu-trigger")?.hidden).toBe(true);
    expect(root.querySelector('[aria-label="Library"]')?.hidden).toBe(true);
    expect(
      root.querySelector(
        '[aria-label="Keep selected tool active after drawing"]'
      )?.hidden
    ).toBe(true);
    expect(root.querySelector('[aria-label="More tools"]')?.hidden).toBe(true);
    expect(root.querySelector('[aria-label="Help"]')?.hidden).toBe(true);
    expect(
      root.querySelector('[aria-label="Hand (panning tool)"]')?.hidden
    ).toBe(false);
    expect(root.querySelector('[aria-label="Draw — P or 7"]')?.hidden).toBe(
      false
    );
    expect(root.querySelector('[aria-label="Rectangle"]')?.hidden).toBe(false);
    expect(root.querySelector('[aria-label="Undo"]')?.hidden).toBe(false);
    expect(root.querySelector('[aria-label="Redo"]')?.hidden).toBe(false);
    expect(screen.getByRole("button", { name: "Image" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Stroke color black" })
    ).toBeTruthy();
    fireEvent.click(root.querySelector('[aria-label="Rectangle"]'));
    await act(async () => {});
    expect(root.querySelector(".selected-shape-actions")?.hidden).toBe(true);
    expect(
      screen.getByRole("button", { name: "Fill color blue" })
    ).toBeTruthy();
  });

  test("blocks unsupported shortcut-entry tools while preserving approved shortcuts", () => {
    const { container } = render(<CanvasEditor initiallyExpanded />);
    const root = container.firstElementChild as HTMLElement;
    for (const key of ["3", "9", "d", "f", "i", "k", "m"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      root.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    for (const init of [
      { key: "k", ctrlKey: true },
      { key: "f", metaKey: true },
      { key: "l", ctrlKey: true, shiftKey: true },
    ]) {
      const event = new KeyboardEvent("keydown", {
        ...init,
        bubbles: true,
        cancelable: true,
      });
      root.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    for (const key of ["a", "t"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      root.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  test("collapsed edit drafts keep the explicit theme through prepareDraft and prepareFreeze", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const value = {
      engine: "@excalidraw/excalidraw",
      engineVersion: "0.18.1",
      schemaVersion: 1,
      revision: 3,
      theme: "light",
      elements: [fakeRectangleElement()],
      appState: {
        viewBackgroundColor: "white",
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        gridSize: 20,
        gridStep: 5,
        viewModeEnabled: false,
      },
      assetRefs: [],
    };
    const globalContract = (window as any).CodeTwoCanvasIsland;
    await act(async () => {
      globalContract.mount(root, { value, theme: "dark" });
    });
    expect(root.querySelector('[data-canvas-collapsed="true"]')).toBeTruthy();
    expect(globalContract.prepareDraft(root).envelope.theme).toBe("dark");
    const originalCreateElement = document.createElement.bind(document);
    (document as any).createElement = (tagName: string) =>
      tagName === "canvas" ? fakeCanvas() : originalCreateElement(tagName);
    try {
      const freeze = await globalContract.prepareFreeze(root, {
        budget: { maxBytes: 100_000_000 },
      });
      expect(freeze.envelope.theme).toBe("dark");
      expect(freeze.theme).toBe("dark");
      expect(freeze.envelope.elements).toHaveLength(1);
      expect(lastExportOptions.appState.theme).toBe("dark");
    } finally {
      (document as any).createElement = originalCreateElement;
      await act(async () => {
        globalContract.unmount(root);
      });
    }
  });

  test("exports negative/positive scenes with the engine margin and aligned detail tiles", async () => {
    const { exportCanvasPng, getCanvasExportBounds } = await import("./export");
    const scene = [
      {
        id: "rectangle-1",
        type: "rectangle",
        x: -100,
        y: 50,
        width: 5000,
        height: 3000,
        angle: 0,
        strokeColor: "black",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roundness: null,
        roughness: 0,
        opacity: 100,
        seed: 1,
        version: 1,
        versionNonce: 1,
        index: "a0",
        isDeleted: false,
        groupIds: [],
        frameId: null,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
      },
    ];
    const bounds = getCanvasExportBounds(scene, 24);
    expect(bounds).toEqual({ minX: -124, minY: 26, maxX: 4924, maxY: 3074 });
    const originalCreateElement = document.createElement.bind(document);
    (document as any).createElement = (tagName: string) =>
      tagName === "canvas" ? fakeCanvas() : originalCreateElement(tagName);
    try {
      const results = await exportCanvasPng(
        scene,
        fakeState.appState as any,
        {},
        { maxBytes: 100_000_000 }
      );
      expect(lastExportOptions.exportPadding).toBe(24);
      expect(lastExportOptions.appState.gridModeEnabled).toBe(false);
      expect(results.map((result: any) => result.kind)).toEqual([
        "overview",
        "detail",
        "detail",
        "detail",
        "detail",
        "detail",
        "detail",
      ]);
      const detailSourceRects = exportDrawCalls
        .slice(1)
        .map((args) => args.slice(1, 5))
        .filter((args) => args.length === 4);
      expect(detailSourceRects.slice(1, 4)).toEqual([
        [0, 0, 2048, 2048],
        [2048, 0, 2048, 2048],
        [4096, 0, 904, 2048],
      ]);
    } finally {
      (document as any).createElement = originalCreateElement;
    }
  });

  test("public Remote global prepareFreeze returns live envelope, manifest, bounded exports, and theme", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const globalContract = (window as any).CodeTwoCanvasIsland;
    expect(typeof globalContract.mount).toBe("function");
    expect(typeof globalContract.prepareFreeze).toBe("function");
    expect(typeof globalContract.setMediaCallbacks).toBe("function");
    await act(async () => {
      globalContract.mount(root, { initiallyExpanded: true, theme: "dark" });
    });
    await act(async () => {
      globalContract.setMediaCallbacks(root, {
        mediaNormalizer: async () => null,
      });
    });
    const rectangle = {
      id: "remote-rectangle",
      type: "rectangle",
      x: -4,
      y: 8,
      width: 120,
      height: 60,
      angle: 0,
      strokeColor: "black",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roundness: null,
      roughness: 0,
      opacity: 100,
      seed: 1,
      version: 1,
      versionNonce: 1,
      index: "a0",
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
    };
    await act(async () => {
      latestApi.updateScene({ elements: [rectangle] });
    });
    const originalCreateElement = document.createElement.bind(document);
    (document as any).createElement = (tagName: string) =>
      tagName === "canvas" ? fakeCanvas() : originalCreateElement(tagName);
    try {
      const freeze = await globalContract.prepareFreeze(root, {
        budget: { maxBytes: 100_000_000 },
      });
      expect(freeze.envelope.theme).toBe("dark");
      expect(freeze.manifest.objects[0].id).toBe("remote-rectangle");
      expect(freeze.exports[0].kind).toBe("overview");
      expect(freeze.pixelPolicy).toBe("required");
    } finally {
      (document as any).createElement = originalCreateElement;
      await act(async () => {
        globalContract.unmount(root);
      });
    }
  });

  test("public Remote global freeze reloads a collapsed image through the asset resolver", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const image = fakeImageElement({
      fileId: "trusted-image-2",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      strokeColor: "black",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      status: "saved",
    });
    const value = {
      engine: "@excalidraw/excalidraw",
      engineVersion: "0.18.1",
      schemaVersion: 1,
      revision: 4,
      theme: "light",
      elements: [image],
      appState: {
        viewBackgroundColor: "white",
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        gridSize: 20,
        gridStep: 5,
        viewModeEnabled: false,
      },
      assetRefs: [
        {
          ref: "trusted-image-2",
          fileId: "trusted-image-2",
          mimeType: "image/png",
          byteLength: 4,
          width: 80,
          height: 40,
        },
      ],
    };
    const globalContract = (window as any).CodeTwoCanvasIsland;
    await act(async () => {
      globalContract.mount(root, {
        value,
        assetResolver: async (asset: any) => ({
          ref: asset.ref,
          fileId: asset.fileId,
          mimeType: asset.mimeType,
          bytes: new Uint8Array([137, 80, 78, 71]),
        }),
      });
    });
    expect(root.querySelector('[data-canvas-collapsed="true"]')).toBeTruthy();
    const originalCreateElement = document.createElement.bind(document);
    (document as any).createElement = (tagName: string) =>
      tagName === "canvas" ? fakeCanvas() : originalCreateElement(tagName);
    try {
      const freeze = await globalContract.prepareFreeze(root, {
        budget: { maxBytes: 100_000_000 },
      });
      expect(freeze.manifest.objects[0].type).toBe("image");
      expect(
        freeze.envelope.elements.some(
          (element: any) => element.fileId === "trusted-image-2"
        )
      ).toBe(true);
      expect(freeze.exports.length).toBeGreaterThan(0);
    } finally {
      (document as any).createElement = originalCreateElement;
      await act(async () => {
        globalContract.unmount(root);
      });
    }
  });
});
