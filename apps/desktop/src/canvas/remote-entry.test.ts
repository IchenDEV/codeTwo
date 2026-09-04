// @ts-nocheck
import { describe, expect, test } from "bun:test";
import { activateDom, dom, restoreDom } from "../../tests/domTestHarness";

const normalizeLineEndings = (value: string) => value.replaceAll("\r\n", "\n");
const source = normalizeLineEndings(
  await Bun.file(new URL("remote-entry.tsx", import.meta.url)).text()
);
const remoteShell = normalizeLineEndings(
  await Bun.file(
    new URL("../../../../crates/server/src/client.html", import.meta.url)
  ).text()
);
const shellScriptMatch = /<script>\n([\s\S]*?)\n {4}<\/script>/u.exec(
  remoteShell
)?.[1];
const shellScript =
  shellScriptMatch != null && shellScriptMatch !== "" ? shellScriptMatch : "";
let restoreRemoteGlobals: (() => void) | null = null;

function response(body, status = 200) {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function canvasDraft(id = "draft-1", revision = 1) {
  return {
    assets: [],
    envelope: {
      assets: [],
      engine: "@excalidraw/excalidraw",
      engineVersion: "0.18.1",
      revision,
      scene: { appState: { activeTool: "selection" }, elements: [] },
      schemaVersion: 1,
      theme: "light",
    },
    id,
    manifest: { objects: [] },
    revision,
    theme: "light",
    title: "Canvas",
  };
}

async function mountRemoteShell(isFeatureEnabled = true) {
  const previousGlobals = {
    WebSocket,
    document,
    fetch,
    history,
    localStorage,
    location,
    navigator,
    window,
  };
  restoreRemoteGlobals = () => {
    for (const [key, value] of Object.entries(previousGlobals)) {
      if (value === undefined) {
        delete (globalThis as any)[key];
      } else {
        (globalThis as any)[key] = value;
      }
    }
    restoreRemoteGlobals = null;
  };
  activateDom();
  dom.document.open();
  dom.document.write(remoteShell.replace(/<script>[\s\S]*<\/script>/u, ""));
  dom.document.close();
  dom.window.__CODETWO_REMOTE_TEST__ = true;
  dom.window.localStorage.setItem("codetwo.remote.bearer", "test-bearer");
  let socket: any = null;
  let mountedCanvasOptions: any = null;
  const queuedDraftCreateResponses: any[] = [];
  (dom.window as any).CodeTwoCanvasIsland = {
    mount(root: HTMLElement, options: any) {
      mountedCanvasOptions = options;
      root.dataset.canvasMounted = "true";
    },
    prepareDraft() {
      const value = mountedCanvasOptions?.value;
      if (Boolean(value)) {
        return {
          envelope: {
            ...value,
            appState: { ...value.appState },
            elements: Array.isArray(value.elements) ? [...value.elements] : [],
          },
          manifest: { objects: [] },
          theme: Boolean(value.theme) || "light",
        };
      }
      return {
        envelope: {
          appState: { activeTool: "selection" },
          assetReferences: [],
          elements: [],
          engine: "@excalidraw/excalidraw",
          engineVersion: "0.18.1",
          revision: 1,
          schemaVersion: 1,
          theme: "light",
        },
        manifest: { objects: [] },
        theme: "light",
      };
    },
    prepareFreeze: async () => {
      return {
        envelope: {
          appState: { activeTool: "selection" },
          assetReferences: [],
          elements: [],
          engine: "@excalidraw/excalidraw",
          engineVersion: "0.18.1",
          revision: 1,
          schemaVersion: 1,
          theme: "light",
        },
        exports: [],
        manifest: { objects: [] },
        theme: "light",
      };
    },
    reset(_root: HTMLElement, value: any) {
      if (Boolean(mountedCanvasOptions)) {
        mountedCanvasOptions.value = value;
      }
    },
    unmount(root: HTMLElement) {
      root.replaceChildren();
      delete root.dataset.canvasMounted;
    },
  };
  const requests = [];
  (globalThis as any).fetch = async (path, options = {}) => {
    requests.push([String(path), options]);
    if (String(path) === "/api/ws-ticket") {
      return response({ ticket: "test-ticket" });
    }
    if (String(path) === "/api/canvas/feature") {
      return response({
        enabled: isFeatureEnabled,
        status: "not production-enabled",
      });
    }
    if (String(path) === "/api/canvas/drafts" && options.method === "POST") {
      return queuedDraftCreateResponses.length > 0
        ? queuedDraftCreateResponses.shift()
        : response(canvasDraft());
    }
    return response({});
  };
  class FakeWebSocket {
    static OPEN = 1;
    readyState = 1;
    sent: any[] = [];
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    constructor() {
      socket = this;
      queueMicrotask(() => this.onopen?.());
    }
    send(payload: string) {
      this.sent.push(JSON.parse(payload));
    }
    close() {
      this.onclose?.();
    }
  }
  (globalThis as any).WebSocket = FakeWebSocket;
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.document;
  (globalThis as any).location = dom.window.location;
  (globalThis as any).history = dom.window.history;
  (globalThis as any).navigator = dom.window.navigator;
  (globalThis as any).localStorage = dom.window.localStorage;
  (globalThis as any).WebSocket = FakeWebSocket;
  new Function(shellScript)();
  await new Promise((resolve) => setTimeout(resolve, 5));
  return {
    api: (dom.window as any).__CodeTwoRemoteCanvasTest,
    get mountedCanvasOptions() {
      return mountedCanvasOptions;
    },
    queueDraftCreate: (nextResponse: any) =>
      queuedDraftCreateResponses.push(nextResponse),
    requests,
    socket,
  };
}

function cleanupRemoteShell() {
  (dom.window as any).__CodeTwoRemoteCanvasTest?.cancelRetry?.();
  dom.document.body.replaceChildren();
  delete (dom.window as any).__CodeTwoRemoteCanvasTest;
  delete (dom.window as any).CodeTwoCanvasIsland;
  restoreRemoteGlobals?.();
}

function canvasPrompt() {
  return [
    { text: "before", type: "text" },
    {
      frozen_revision: 3,
      id: "draft-1",
      pixel_policy: "required",
      type: "canvas",
    },
    { text: "after", type: "text" },
  ];
}

describe("Remote Canvas island draft seam", () => {
  test("exposes cheap prepareDraft separately from PNG freeze", () => {
    expect(source).toContain("prepareCanvasIslandDraft");
    expect(source).toContain("export const prepareDraft");
    expect(source).toContain("prepareDraft:");
    expect(source).toContain("deriveCanvasManifest(envelope.elements)");
    expect(source).toContain("prepareCanvasIslandFreeze");
  });

  test("does not add browser persistence to the Remote entry", () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/iu);
  });

  test("keeps rejected provider recovery explicit and avoids dead mutable-head restoration", () => {
    expect(remoteShell).toContain(
      "if (restoreOnFailure && wasPending && !recoveryForFailure)"
    );
    expect(remoteShell).toContain(
      "if (pendingRecoveryForError) providerRecoveryByRequest.delete(ev.request_id)"
    );
    expect(remoteShell).toContain(
      "submitPrompt(accepted.session, doc, false, null, accepted)"
    );
    expect(remoteShell).toContain('id="canvas-menu-canvas"');
    expect(remoteShell).toContain("Array.from(marker.title).length");
  });

  test("executes strict marker/menu/command behavior in the actual vanilla shell", async () => {
    const { api } = await mountRemoteShell(false);
    const emojiTitle = "😀".repeat(200);
    const marker = `[canvas-history-json ${JSON.stringify({ id: "history-1", revision: 4, text_originals: [], title: emojiTitle, version: 1 })}]`;
    expect(api.parseCanvasHistoryMarker(marker).title).toBe(emojiTitle);
    expect(api.parseCanvasHistoryMarker(`${marker}x`)).toBeNull();
    const historyTarget = dom.document.createElement("div");
    const escapedTitle = "line\n] bracket";
    const escapedMarker = `[canvas-history-json ${JSON.stringify({ id: "history-2", revision: 1, text_originals: [], title: escapedTitle, version: 1 })}]`;
    api.renderPromptWithHistory(escapedMarker, "user", historyTarget);
    expect(
      historyTarget.querySelector(".canvas-history-card b")?.textContent
    ).toBe(escapedTitle);
    const malformedTarget = dom.document.createElement("div");
    const malformed = "[canvas-history-json {not-json}]";
    api.renderPromptWithHistory(malformed, "user", malformedTarget);
    expect(malformedTarget.textContent).toContain(malformed);
    api.setPromptBlocks([
      { text: "before", type: "text" },
      { id: "draft-1", type: "canvas" },
      { text: "after", type: "text" },
    ]);
    expect(
      api
        .promptDocument()
        .map((block) => (block.type === "canvas" ? block.id : block.text))
    ).toEqual(["before", "draft-1", "after"]);
    api.setCanvasFeature(true);
    api.menuButton.dispatchEvent(
      new dom.window.MouseEvent("click", { bubbles: true })
    );
    expect(dom.document.querySelector(":scope #canvas-menu-panel").hidden).toBe(
      false
    );
    expect(api.menuCanvasButton.getAttribute("aria-label")).toBe("Canvas");
    api.setCanvasFeature(false);
    api.setPromptBlocks([{ text: "/canvas", type: "text" }]);
    await api.run();
    expect(api.status.textContent).toContain("not production-enabled");
    cleanupRemoteShell();
    restoreDom();
  });

  test("typed /canvas uses the enabled lazy island and creates an ordered draft", async () => {
    const remote = await mountRemoteShell(true);
    const { api } = remote;
    api.setPromptBlocks([{ text: "/canvas", type: "text" }]);
    await api.run();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(api.getPromptBlocks().map((block) => block.type)).toEqual([
      "text",
      "canvas",
      "text",
    ]);
    expect(api.getPromptBlocks()[1].id).toBe("draft-1");
    expect(
      dom.document
        .querySelector(".canvas-mount")
        ?.getAttribute("data-canvas-mounted")
    ).toBe("true");
    expect(remote.mountedCanvasOptions?.theme).toBe("dark");
    cleanupRemoteShell();
    restoreDom();
  });

  test("failed reconnect creation preserves the old page-memory draft without cleanup requests", async () => {
    const remote = await mountRemoteShell(true);
    try {
      const { api, socket, requests } = remote;
      api.setPromptBlocks([{ text: "/canvas", type: "text" }]);
      await api.run();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const oldState = api.canvasState("draft-1");
      expect(oldState).not.toBeNull();
      const retainedElement = {
        id: "retained-scene",
        text: "still in memory",
        type: "text",
        x: 12,
        y: 24,
      };
      oldState.envelope.elements = [retainedElement];
      oldState.envelope.appState = {
        activeTool: "selection",
        viewBackgroundColor: "white",
      };

      const requestStart = requests.length;
      remote.queueDraftCreate(response({ error: "offline" }, 503));
      socket.close();
      await api.reconnectCanvasDrafts();
      await new Promise((resolve) => setTimeout(resolve, 5));

      const trace = requests
        .slice(requestStart)
        .map(
          ([path, options]) => `${Boolean(options.method) || "GET"} ${path}`
        );
      expect(trace).toEqual(["POST /api/canvas/drafts"]);
      expect(
        trace.some(
          (entry) => entry.includes("/tombstone") || entry.includes("/purge")
        )
      ).toBe(false);
      expect(api.canvasStateIds()).toEqual(["draft-1"]);
      expect(api.canvasState("draft-1")).toBe(oldState);
      expect(oldState.envelope.elements).toEqual([retainedElement]);
      expect(oldState.needsReconnect).toBe(true);
      expect(oldState.removed).toBe(false);
    } finally {
      cleanupRemoteShell();
      restoreDom();
    }
  });

  test("successful reconnect rekeys before old-head cleanup and autosaves the retained scene", async () => {
    const remote = await mountRemoteShell(true);
    try {
      const { api, socket, requests } = remote;
      api.setPromptBlocks([{ text: "/canvas", type: "text" }]);
      await api.run();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const oldState = api.canvasState("draft-1");
      expect(oldState).not.toBeNull();
      const retainedElement = {
        id: "retained-scene",
        text: "still in memory",
        type: "text",
        x: 12,
        y: 24,
      };
      oldState.envelope.elements = [retainedElement];
      oldState.envelope.appState = {
        activeTool: "selection",
        viewBackgroundColor: "white",
      };

      const requestStart = requests.length;
      remote.queueDraftCreate(response(canvasDraft("draft-2")));
      socket.close();
      await api.reconnectCanvasDrafts();
      const newState = api.canvasState("draft-2");
      await newState.saveQueue;
      await new Promise((resolve) => setTimeout(resolve, 5));

      const trace = requests
        .slice(requestStart)
        .map(
          ([path, options]) => `${Boolean(options.method) || "GET"} ${path}`
        );
      expect(trace).toEqual([
        "POST /api/canvas/drafts",
        "POST /api/canvas/drafts/draft-1/tombstone",
        "POST /api/canvas/drafts/draft-1/purge",
        "PUT /api/canvas/drafts/draft-2",
      ]);
      expect(api.canvasState("draft-1")).toBeNull();
      expect(newState).toBe(oldState);
      expect(newState.id).toBe("draft-2");
      expect(newState.needsReconnect).toBe(false);
      expect(newState.envelope.elements).toEqual([retainedElement]);
      expect(api.getPromptBlocks()[1].id).toBe("draft-2");
    } finally {
      cleanupRemoteShell();
      restoreDom();
    }
  });

  test("sync recovery failure keeps explicit choices without restoring [Canvas] text", async () => {
    const { api, socket } = await mountRemoteShell(true);
    const sourceBlocks = canvasPrompt();
    const accepted = {
      doc: sourceBlocks.map((block) => ({ ...block })),
      session: "session-1",
      sourceBlocks,
    };
    api.setPromptBlocks([{ text: "", type: "text" }]);
    socket.readyState = 0;
    expect(
      api.submitPrompt("session-1", accepted.doc, true, sourceBlocks, accepted)
    ).toBe(false);
    expect(api.pendingRecovery()).toEqual(accepted);
    expect(
      api
        .getPromptBlocks()
        .map((block) => (block.type === "canvas" ? block.id : block.text))
    ).toEqual([""]);
    expect(api.status.textContent).toContain("Provider rejected Canvas pixels");
    expect(api.status.textContent).not.toContain("[Canvas]");
    cleanupRemoteShell();
    restoreDom();
  });

  test("correlated pre-TurnStarted provider error releases ownership and keeps choices", async () => {
    const { api, socket } = await mountRemoteShell(true);
    const sourceBlocks = canvasPrompt();
    const accepted = {
      doc: sourceBlocks.map((block) => ({ ...block })),
      session: "session-1",
      sourceBlocks,
    };
    api.setPromptBlocks([{ text: "", type: "text" }]);
    expect(
      api.submitPrompt("session-1", accepted.doc, true, sourceBlocks, accepted)
    ).toBe(true);
    const requestId = socket.sent.at(-1).request_id;
    expect(api.providerRecoverySize()).toBe(1);
    api.handleMessage({
      event: {
        event: "error",
        message: "provider image rejected",
        request_id: requestId,
        session: "session-1",
        terminal: true,
      },
      kind: "event",
    });
    expect(api.providerRecoverySize()).toBe(0);
    expect(
      api
        .getPromptBlocks()
        .map((block) => (block.type === "canvas" ? block.id : block.text))
    ).toEqual([""]);
    expect(api.status.textContent).toContain("Provider rejected Canvas pixels");
    expect(api.status.textContent).not.toContain("[Canvas]");
    cleanupRemoteShell();
    restoreDom();
  });

  test("normal rejection restores exact source order without overwriting newer text", async () => {
    const { api, socket } = await mountRemoteShell(true);
    const sourceBlocks = canvasPrompt();
    api.setPromptBlocks([{ text: "", type: "text" }]);
    expect(
      api.submitPrompt("session-1", sourceBlocks, true, sourceBlocks)
    ).toBe(true);
    const requestId = socket.sent.at(-1).request_id;
    api.setPromptBlocks([{ text: "newer text", type: "text" }]);
    api.handleMessage({
      event: {
        event: "error",
        message: "prompt rejected",
        request_id: requestId,
        session: "session-1",
        terminal: true,
      },
      kind: "event",
    });
    expect(
      api
        .getPromptBlocks()
        .map((block) => (block.type === "canvas" ? block.id : block.text))
    ).toEqual(["newer text", "", "before", "draft-1", "after"]);
    cleanupRemoteShell();
    restoreDom();
  });
});
