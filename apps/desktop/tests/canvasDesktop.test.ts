// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { GlobalWindow } from "happy-dom";

const dom = new GlobalWindow({ url: "http://localhost/" });
for (const key of [
  "window",
  "document",
  "Node",
  "Element",
  "SVGElement",
  "navigator",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLCanvasElement",
  "HTMLImageElement",
  "CanvasRenderingContext2D",
  "MutationObserver",
  "KeyboardEvent",
  "ClipboardEvent",
  "DataTransfer",
  "File",
  "Blob",
]) {
  globalThis[key] = dom[key];
}
globalThis.btoa = dom.btoa.bind(dom);
globalThis.devicePixelRatio = 1;
dom.window.HTMLCanvasElement.prototype.getContext = () => ({}) as never;

const { canvasFeatureState } = await import("../src/bridge");
const {
  CanvasDraftSaveQueue,
  canvasBlockPropsFromDraft,
  canvasDraftToEnvelope,
  canvasThemeForMode,
  docToBlocks,
  resolveCanvasSnapshotForFreeze,
} = await import("../src/skillInline");
const { parseCanvasHistoryPrompt } =
  await import("../src/session/promptPreview");
const {
  canvasAcceptedRequestKey,
  canvasIdsToPurgeAfterTurnStart,
  canvasRetryRefsForTerminal,
  canvasRetryDocument,
  canvasRetryTargetSession,
  canvasUnmountPlan,
  sameDocBlocks,
} = await import("../src/session/turns");

function draft(id: string, revision = 1) {
  return {
    id,
    owner: "desktop-test",
    revision,
    title: "Test canvas",
    theme: "light",
    envelope: {
      engine: "@excalidraw/excalidraw",
      engineVersion: "0.18.1",
      schemaVersion: 1,
      revision,
      theme: "light",
      assets: [],
      scene: { elements: [], appState: {} },
    },
    manifest: { objects: [] },
    assets: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("Desktop Canvas Composer integration seams", () => {
  test("feature gate is hidden by default and never reports production enabled", async () => {
    await expect(canvasFeatureState()).resolves.toEqual({
      feature: "CODETWO_CANVAS_INPUT_V1",
      enabled: false,
      status: "not production-enabled",
    });
  });

  test("Canvas is a first-class block and serializes only an immutable reference", () => {
    const props = canvasBlockPropsFromDraft(draft("canvas-a", 3));
    const blocks = docToBlocks({
      document: [
        { type: "paragraph", content: [{ type: "text", text: "before" }] },
        { type: "canvas", props },
        { type: "paragraph", content: [{ type: "text", text: "after" }] },
      ],
    });
    expect(blocks).toEqual([
      { type: "text", text: "before" },
      {
        type: "canvas",
        id: "canvas-a",
        frozen_revision: 3,
        pixel_policy: "required",
      },
      { type: "text", text: "after" },
    ]);
    expect(JSON.stringify(blocks)).not.toContain("elements");
    expect(blocks[1]).not.toHaveProperty("theme");
  });

  test("editable Canvas follows the live Composer scheme while readonly/history keeps its envelope theme", () => {
    const lightDraft = canvasDraftToEnvelope(draft("theme", 1));
    expect(canvasThemeForMode("edit", "dark", lightDraft.theme)).toBe("dark");
    expect(canvasThemeForMode("edit", "light", lightDraft.theme)).toBe("light");
    expect(canvasThemeForMode("readonly", "dark", lightDraft.theme)).toBe(
      "light"
    );
    expect(canvasThemeForMode("historical", "dark", lightDraft.theme)).toBe(
      "light"
    );
  });

  test("multiple Canvas blocks preserve document order and policy", () => {
    const first = canvasBlockPropsFromDraft(draft("canvas-a", 1));
    const second = {
      ...canvasBlockPropsFromDraft(draft("canvas-b", 2)),
      pixelPolicy: "structure_only",
    };
    const blocks = docToBlocks({
      document: [
        { type: "canvas", props: first },
        { type: "canvas", props: second },
      ],
    });
    expect(blocks.map((block) => block.type === "canvas" && block.id)).toEqual([
      "canvas-a",
      "canvas-b",
    ]);
    expect(blocks[1]).toMatchObject({
      pixel_policy: "structure_only",
      frozen_revision: 2,
    });
    expect(sameDocBlocks(blocks, blocks)).toBe(true);
  });

  test("history compatibility markers are stripped from visible prompt", () => {
    const parsed = parseCanvasHistoryPrompt(
      "before\n\n[canvas-history canvas-a@7] Whiteboard\ncanvas-text: User note\ncanvas-text: Another note\n\nafter"
    );
    expect(parsed.visiblePrompt).toBe("before\n\nafter");
    expect(parsed.canvases).toEqual([
      {
        id: "canvas-a",
        revision: 7,
        title: "Whiteboard",
        textOriginals: ["User note", "Another note"],
      },
    ]);
    expect(parsed.visiblePrompt).not.toContain("canvas-history");
    expect(parsed.visiblePrompt).not.toContain("canvas-text:");
  });

  test("literal canvas-text prompt lines remain visible without a marker", () => {
    const parsed = parseCanvasHistoryPrompt(
      "canvas-text: keep this line\nordinary text"
    );
    expect(parsed.visiblePrompt).toBe(
      "canvas-text: keep this line\nordinary text"
    );
    expect(parsed.canvases).toEqual([]);
  });

  test("strict JSON history markers decode multiline originals and reject marker-like user text", () => {
    const parsed = parseCanvasHistoryPrompt(
      'before\n[canvas-history-json {"version":1,"id":"canvas-json","revision":8,"title":"Title ] with newline","text_originals":["first\\nsecond","quote \\"x\\""]}]\nafter'
    );
    expect(parsed.visiblePrompt).toBe("before\nafter");
    expect(parsed.canvases).toEqual([
      {
        id: "canvas-json",
        revision: 8,
        title: "Title ] with newline",
        textOriginals: ["first\nsecond", 'quote "x"'],
      },
    ]);

    const malformed = parseCanvasHistoryPrompt(
      '[canvas-history-json {"version":1,"id":"broken","revision":"8","title":"Nope","text_originals":[]}]\ncanvas-text: keep user line'
    );
    expect(malformed.visiblePrompt).toContain("canvas-history-json");
    expect(malformed.visiblePrompt).toContain("canvas-text: keep user line");
    expect(malformed.canvases).toEqual([]);
  });

  test("JSON history validation matches core bounds and accepts an empty title", () => {
    const valid = parseCanvasHistoryPrompt(
      `[canvas-history-json ${JSON.stringify({
        version: 1,
        id: "canvas-bounded",
        revision: 1,
        title: "",
        text_originals: ["🙂".repeat(2_000)],
      })}]`
    );
    expect(valid.visiblePrompt).toBe("");
    expect(valid.canvases[0]?.title).toBe("");
    expect(valid.canvases[0]?.textOriginals[0]).toBe("🙂".repeat(2_000));

    const malformed = parseCanvasHistoryPrompt(
      [
        `[canvas-history-json ${JSON.stringify({ version: 1, id: "bad-revision", revision: 0, title: "", text_originals: [] })}]`,
        `[canvas-history-json ${JSON.stringify({ version: 1, id: "too-many", revision: 1, title: "", text_originals: Array.from({ length: 65 }, () => "x") })}]`,
        `[canvas-history-json ${JSON.stringify({ version: 1, id: "too-long", revision: 1, title: "", text_originals: ["x".repeat(2_001)] })}]`,
      ].join("\n")
    );
    expect(malformed.canvases).toEqual([]);
    expect(malformed.visiblePrompt).toContain("bad-revision");
    expect(malformed.visiblePrompt).toContain("too-many");
    expect(malformed.visiblePrompt).toContain("too-long");
  });

  test("CAS autosave serializes A/B and keeps the latest local scene while rebasing", async () => {
    const savedRevisions: number[] = [];
    const acknowledgements: Array<{ isLatest: boolean; elements: unknown[] }> =
      [];
    let active = 0;
    let maximumActive = 0;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const base = canvasDraftToEnvelope(draft("queue", 4));
    const sceneA = { ...base, elements: [{ id: "a", type: "rectangle" }] };
    const sceneB = { ...base, elements: [{ id: "b", type: "rectangle" }] };
    const save = async (envelope: any) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      savedRevisions.push(envelope.revision);
      if (savedRevisions.length === 1) await firstGate;
      active -= 1;
      return {
        ...draft("queue", envelope.revision + 1),
        revision: envelope.revision + 1,
        envelope: {
          ...base,
          revision: envelope.revision + 1,
          scene: { elements: envelope.elements, appState: envelope.appState },
        },
      };
    };
    const queue = new CanvasDraftSaveQueue({
      initialRevision: 4,
      save,
      onSaved: (saved: any, request: any, isLatest: boolean) => {
        acknowledgements.push({ isLatest, elements: [...request.elements] });
        // The actual block handler updates only the authoritative revision for stale A; this
        // assertion makes the no-rollback contract explicit for the exported queue seam.
        expect(saved.revision).toBe(request.revision + 1);
      },
      onError: () => {},
    });
    const first = queue.enqueue(sceneA, []);
    const second = queue.enqueue(sceneB, []);
    expect(maximumActive).toBe(1);
    releaseFirst();
    await Promise.all([first, second]);
    expect(maximumActive).toBe(1);
    expect(savedRevisions).toEqual([4, 5]);
    expect(acknowledgements).toEqual([
      { isLatest: false, elements: sceneA.elements },
      { isLatest: true, elements: sceneB.elements },
    ]);
    expect(queue.authoritativeRevision).toBe(6);
  });

  test("collapsed loaded Canvas rehydrates its nonempty envelope for freeze/export", async () => {
    const envelope = {
      ...canvasDraftToEnvelope(draft("collapsed", 9)),
      elements: [
        { id: "rect-1", type: "rectangle", x: 1, y: 2, width: 40, height: 20 },
      ],
      appState: {
        viewBackgroundColor: "white",
        scrollX: 0,
        scrollY: 0,
        zoom: 1,
        gridSize: null,
        gridStep: 5,
        viewModeEnabled: false,
      },
    };
    const snapshot = await resolveCanvasSnapshotForFreeze(envelope, [], {
      elements: [],
      appState: envelope.appState,
      files: {},
    });
    expect(snapshot.elements).toHaveLength(1);
    expect(snapshot.elements[0]?.id).toBe("rect-1");
  });

  test("accepted TurnStarted requests purge only mutable heads; rejection requests none", () => {
    const ids = ["canvas-a", "canvas-a", "canvas-b"];
    expect(canvasIdsToPurgeAfterTurnStart(true, ids)).toEqual([
      "canvas-a",
      "canvas-b",
    ]);
    expect(canvasIdsToPurgeAfterTurnStart(false, ids)).toEqual([]);
    expect(canvasIdsToPurgeAfterTurnStart(true, ids, false)).toEqual([]);
  });

  test("unmount tombstones and purges live mutable heads without purging immutable history", () => {
    expect(canvasUnmountPlan(true, false)).toEqual({
      tombstone: true,
      purge: true,
    });
    expect(canvasUnmountPlan(false, true)).toEqual({
      tombstone: false,
      purge: true,
    });
    expect(canvasUnmountPlan(false, false)).toEqual({
      tombstone: false,
      purge: false,
    });
  });

  test("accepted async provider-image errors restore immutable refs for an explicit new-session retry", () => {
    const refs = [{ id: "canvas-frozen", revision: 9 }];
    expect(canvasAcceptedRequestKey("session-failed", "request-1")).toBe(
      "session-failed:request-1"
    );
    expect(
      canvasRetryRefsForTerminal(
        "error",
        "provider does not support image pixels",
        refs
      )
    ).toEqual(refs);
    expect(canvasRetryRefsForTerminal("error", "CAS conflict", refs)).toEqual(
      []
    );
    expect(
      canvasRetryRefsForTerminal(
        "success",
        "provider does not support image pixels",
        refs
      )
    ).toEqual([]);
    expect(canvasRetryTargetSession("session-failed", false)).toBe(
      "session-failed"
    );
    expect(canvasRetryTargetSession("session-failed", true)).toBeNull();
  });

  test("provider retry replaces Canvas refs without dropping surrounding prompt order", () => {
    const original = [
      { type: "text", text: "instruction before" },
      {
        type: "canvas",
        id: "canvas-a",
        frozen_revision: 4,
        pixel_policy: "required",
      },
      { type: "text", text: "instruction between" },
      {
        type: "canvas",
        id: "canvas-b",
        frozen_revision: 5,
        pixel_policy: "structure_only",
      },
    ] as const;
    const retry = canvasRetryDocument(
      original,
      new Map([
        ["canvas-a", { id: "duplicate-a", revision: 1 }],
        ["canvas-b", { id: "duplicate-b", revision: 2 }],
      ])
    );
    expect(retry).toEqual([
      { type: "text", text: "instruction before" },
      {
        type: "canvas",
        id: "duplicate-a",
        frozen_revision: 1,
        pixel_policy: "required",
      },
      { type: "text", text: "instruction between" },
      {
        type: "canvas",
        id: "duplicate-b",
        frozen_revision: 2,
        pixel_policy: "structure_only",
      },
    ]);
  });
});
