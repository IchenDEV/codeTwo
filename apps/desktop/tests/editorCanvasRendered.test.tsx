// @ts-nocheck
import { afterEach, describe, expect, mock, test } from "bun:test";
import React from "react";
import { activateDom, button, dom, flush, mount, restoreDom } from "./domTestHarness";

// Canvas/BlockNote imports touch the browser globals at module evaluation; own the shared DOM
// before loading them so this rendered host test is safe both standalone and in the combined gate.
activateDom();
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ filter: "" }) as never;

let fakeEditor: any;
let latestViewProps: any;
let latestCanvasRuntime: any;
let createCount = 0;
let editorScheme: "light" | "dark" = "light";
let mountedCanvasBlock: React.ReactNode = null;

function newFakeEditor() {
  const editor: any = {
    document: [{ type: "paragraph", content: [] }],
    insertBlocks(blocks: any[], reference: any) {
      const index = editor.document.indexOf(reference);
      editor.document.splice(index < 0 ? editor.document.length : index + 1, 0, ...blocks);
    },
    insertInlineContent() {},
    replaceBlocks(blocks: any[], replacement: any[]) {
      const first = editor.document.indexOf(blocks[0]);
      editor.document.splice(first < 0 ? 0 : first, blocks.length, ...replacement);
    },
    removeBlocks(blocks: any[]) {
      editor.document = editor.document.filter((block: any) => !blocks.includes(block));
    },
    updateBlock() {},
    focus() {},
    openSuggestionMenu() {},
  };
  return editor;
}

const realCore = await import("@blocknote/core");
const realMantine = await import("@blocknote/mantine");
const realReact = await import("@blocknote/react");
const realSkillInline = await import("../src/skillInline");
const realSlotCard = await import("../src/editor/slotCard");
const actualCanvasRuntimeContext = realSkillInline.CanvasBlockRuntimeContext;
const mockedCanvasRuntimeContext = React.createContext<any>(null);
const realFileMenu = await import("../src/editor/FileMenu");
const realTheme = await import("../src/theme");
const realI18n = await import("../src/i18n");
const realBridge = await import("../src/bridge");

mock.module("@blocknote/core", () => ({
  ...realCore,
  filterSuggestionItems: (items: any[]) => items,
}));
mock.module("@blocknote/mantine", () => ({
  ...realMantine,
  BlockNoteView: (props: any) => {
    const runtime = React.useContext(mockedCanvasRuntimeContext);
    latestCanvasRuntime = runtime;
    latestViewProps = props;
    return React.createElement(
      actualCanvasRuntimeContext.Provider,
      { value: runtime },
      React.createElement(React.Fragment, null, props.children, mountedCanvasBlock),
    );
  },
}));
mock.module("@blocknote/react", () => ({
  ...realReact,
  SuggestionMenuController: () => null,
  getDefaultReactSlashMenuItems: () => [],
  useCreateBlockNote: () => {
    if (!fakeEditor) fakeEditor = newFakeEditor();
    createCount += 1;
    return fakeEditor;
  },
}));
mock.module("../src/skillInline", () => ({
  ...realSkillInline,
  CanvasBlockRuntimeContext: mockedCanvasRuntimeContext,
  canvasBlockPropsFromDraft: (draft: any, options: any = {}) => ({
    id: draft.id,
    revision: draft.revision,
    title: draft.title,
    envelope: "{}",
    pixelPolicy: options.pixelPolicy ?? "required",
    deliveryError: options.deliveryError,
    deliveryErrorKind: options.deliveryErrorKind,
  }),
  docToBlocks: (editor: any) => editor.document.flatMap((block: any) => {
    if (block.type === "canvas") {
      return [{ type: "canvas", id: block.props.id, frozen_revision: block.props.revision, pixel_policy: block.props.pixelPolicy }];
    }
    // Keep the fake faithful for slot cards: bun module mocks leak across test files, so later
    // suites exercising slotCard serialization must still see the real behavior.
    if (block.type === "slotCard") return realSlotCard.slotCardToDocBlocks(block.props);
    if (block.type === "image") return [{ type: "image", path: block.props.url }];
    const text = typeof block.content === "string"
      ? block.content
      : Array.isArray(block.content)
        ? block.content.filter((inline: any) => inline.type === "text").map((inline: any) => inline.text ?? "").join("")
        : "";
    if (text) return [{ type: "text", text }];
    if (Array.isArray(block.content)) {
      const inline = block.content.find((item: any) => item?.type && item.type !== "text");
      if (inline?.type === "skill") return [{ type: "skill", skill_id: inline.props.skillId, params: {} }];
      if (inline?.type === "fileMention") return [{ type: "file", path: inline.props.path }];
      if (inline?.type === "sessionMention") return [{ type: "session", session_id: inline.props.sessionId }];
    }
    return [];
  }),
}));
mock.module("../src/editor/FileMenu", () => ({ ...realFileMenu, FileMenu: () => null }));
mock.module("../src/theme", () => ({ ...realTheme, useColorScheme: () => editorScheme }));
mock.module("../src/i18n", () => ({ ...realI18n, useT: () => (key: string) => key }));
mock.module("../src/bridge", () => ({
  ...realBridge,
  listArchivedSessions: async () => [],
  listFiles: async () => [],
  listSessions: async () => [],
}));

const { DocEditor } = await import("../src/editor/Editor");
const { canvasIdsToPurgeAfterTurnStart } = await import("../src/session/turns");

function draft(id: string, revision: number) {
  return { id, revision, title: id };
}

function canvasEnvelope(revision = 1) {
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

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
  fakeEditor = null;
  latestViewProps = null;
  latestCanvasRuntime = null;
  createCount = 0;
  editorScheme = "light";
  mountedCanvasBlock = null;
});

describe("DocEditor Canvas insertion and lifecycle", () => {
  test("gate hides insertion and enabled handler inserts multiple first-class blocks in order", async () => {
    activateDom();
    const insertRef: any = { current: null };
    const insertDraftRef: any = { current: null };
    const getBlocksRef: any = { current: null };
    const empty: boolean[] = [];
    const runtime: any = {
      enabled: true,
      normalizeMedia: async () => null,
      resolveAsset: async () => null,
      getAssets: () => [],
      onAsset: () => {},
      onCanvasActivity: () => {},
      saveDraft: async () => ({}),
      freezeDraft: async () => ({}),
      onCanvasRemoved: () => {},
      onCanvasRestored: () => {},
      onCanvasUnmount: () => {},
      onCanvasFrozen: () => {},
      onCanvasDeliveryError: () => {},
      register: () => () => {},
    };
    const view = mount(
      <DocEditor
        skills={[]}
        cwd="."
        sessionId={null}
        getBlocksRef={getBlocksRef}
        insertTextRef={{ current: null }}
        insertAnnotationRef={{ current: null }}
        insertFileRef={{ current: null }}
        focusRef={{ current: null }}
        clearRef={{ current: null }}
        openSkillPickerRef={{ current: null }}
        insertSkillRef={{ current: null }}
        canvasEnabled={true}
        canvasRuntime={runtime}
        createCanvas={async () => draft("created", 1)}
        insertCanvasRef={insertRef}
        insertCanvasDraftRef={insertDraftRef}
        restoreCanvasDocumentRef={{ current: null }}
        freezeCanvasesRef={{ current: null }}
        onEmptyChange={(value) => empty.push(value)}
      />,
    );
    expect(createCount).toBe(1);
    await insertDraftRef.current(draft("canvas-a", 1));
    latestViewProps.onChange();
    await insertDraftRef.current(draft("canvas-b", 2));
    latestViewProps.onChange();
    expect(fakeEditor.document.filter((block: any) => block.type === "canvas").map((block: any) => block.props.id)).toEqual(["canvas-a", "canvas-b"]);
    expect(getBlocksRef.current().map((block: any) => block.type === "canvas" && block.id)).toEqual(["canvas-a", "canvas-b"]);
    expect(empty.at(-1)).toBe(false);
    view.unmount();
  });

  test("Editor forwards live scheme to editable Canvas blocks without adding it to DocBlocks", async () => {
    activateDom();
    editorScheme = "dark";
    const insertDraftRef: any = { current: null };
    const getBlocksRef: any = { current: null };
    const refs: any = {
      insertTextRef: { current: null },
      insertAnnotationRef: { current: null },
      insertFileRef: { current: null },
      focusRef: { current: null },
      clearRef: { current: null },
      openSkillPickerRef: { current: null },
      insertSkillRef: { current: null },
      freezeCanvasesRef: { current: null },
    };
    const runtime: any = {
      enabled: true,
      normalizeMedia: async () => null,
      resolveAsset: async () => null,
      getAssets: () => [],
      onAsset: () => {},
      onCanvasActivity: () => {},
      saveDraft: async () => ({}),
      freezeDraft: async () => ({}),
      onCanvasRemoved: () => {},
      onCanvasRestored: () => {},
      onCanvasUnmount: () => {},
      onCanvasFrozen: () => {},
      onCanvasDeliveryError: () => {},
      register: () => () => {},
    };
    const props = {
      skills: [],
      cwd: ".",
      sessionId: null,
      ...refs,
      getBlocksRef,
      canvasEnabled: true,
      canvasRuntime: runtime,
      createCanvas: async () => draft("created", 1),
      insertCanvasRef: { current: null },
      insertCanvasDraftRef: insertDraftRef,
      restoreCanvasDocumentRef: { current: null },
      onEmptyChange: () => {},
    };
    const view = mount(<DocEditor {...props} />);
    expect(latestCanvasRuntime.theme).toBe("dark");
    await insertDraftRef.current(draft("theme-canvas", 1));
    latestViewProps.onChange();
    expect(getBlocksRef.current()[0]).not.toHaveProperty("theme");

    editorScheme = "light";
    view.rerender(<DocEditor {...props} />);
    expect(latestCanvasRuntime.theme).toBe("light");
    view.unmount();
  });

  test("document diff handler tombstones removal, restores undo, and purges on unmount", () => {
    activateDom();
    const insertDraftRef: any = { current: null };
    const events: any[] = [];
    const runtime: any = {
      enabled: true,
      normalizeMedia: async () => null,
      resolveAsset: async () => null,
      getAssets: () => [],
      onAsset: () => {},
      onCanvasActivity: (_id: string, nonEmpty: boolean) => {
        if (nonEmpty) events.push(["activity", "canvas-life", true]);
      },
      saveDraft: async () => ({}),
      freezeDraft: async () => ({}),
      onCanvasRemoved: (...args: any[]) => events.push(["remove", ...args]),
      onCanvasRestored: (...args: any[]) => events.push(["restore", ...args]),
      onCanvasUnmount: (...args: any[]) => events.push(["unmount", ...args]),
      onCanvasFrozen: () => {},
      onCanvasDeliveryError: () => {},
      register: () => () => {},
    };
    const refs: any = {
      getBlocksRef: { current: null },
      insertTextRef: { current: null },
      insertAnnotationRef: { current: null },
      insertFileRef: { current: null },
      focusRef: { current: null },
      clearRef: { current: null },
      openSkillPickerRef: { current: null },
      insertSkillRef: { current: null },
      freezeCanvasesRef: { current: null },
    };
    const view = mount(
      <DocEditor
        skills={[]}
        cwd="."
        sessionId={null}
        {...refs}
        canvasEnabled={true}
        canvasRuntime={runtime}
        createCanvas={async () => draft("created", 1)}
        insertCanvasRef={{ current: null }}
        insertCanvasDraftRef={insertDraftRef}
        restoreCanvasDocumentRef={{ current: null }}
        onEmptyChange={() => {}}
      />,
    );
    insertDraftRef.current(draft("canvas-life", 1));
    latestViewProps.onChange();
    // A mounted CanvasBlock reports this as soon as its scene gains an object; retain that
    // activity signal so removal exercises the nonempty tombstone path.
    latestCanvasRuntime.onCanvasActivity("canvas-life", true);
    const canvas = fakeEditor.document.find((block: any) => block.type === "canvas");
    fakeEditor.removeBlocks([canvas]);
    latestViewProps.onChange();
    expect(events).toContainEqual(["remove", "canvas-life", true]);
    fakeEditor.insertBlocks([canvas], fakeEditor.document[0]);
    latestViewProps.onChange();
    expect(events).toContainEqual(["restore", "canvas-life"]);
    view.unmount();
    expect(events.some((event) => event[0] === "unmount" && event[1] === "canvas-life")).toBe(true);
  });

  test("accepted send marks clear-triggered head purge while a rejected retry does not", () => {
    activateDom();
    const insertDraftRef: any = { current: null };
    const clearRef: any = { current: null };
    const purgeRequested = new Set<string>();
    const events: any[] = [];
    const runtime: any = {
      enabled: true,
      normalizeMedia: async () => null,
      resolveAsset: async () => null,
      getAssets: () => [],
      onAsset: () => {},
      onCanvasActivity: () => {},
      saveDraft: async () => ({}),
      freezeDraft: async () => ({}),
      onCanvasRemoved: (id: string) => {
        events.push(["remove", id]);
        if (purgeRequested.delete(id)) events.push(["purge", id]);
      },
      onCanvasRestored: () => {},
      onCanvasUnmount: () => {},
      onCanvasFrozen: () => {},
      onCanvasDeliveryError: () => {},
      register: () => () => {},
    };
    const refs: any = {
      getBlocksRef: { current: null },
      insertTextRef: { current: null },
      insertAnnotationRef: { current: null },
      insertFileRef: { current: null },
      focusRef: { current: null },
      openSkillPickerRef: { current: null },
      insertSkillRef: { current: null },
      freezeCanvasesRef: { current: null },
    };
    const view = mount(
      <DocEditor
        skills={[]}
        cwd="."
        sessionId={null}
        {...refs}
        clearRef={clearRef}
        canvasEnabled={true}
        canvasRuntime={runtime}
        createCanvas={async () => draft("created", 1)}
        insertCanvasRef={{ current: null }}
        insertCanvasDraftRef={insertDraftRef}
        restoreCanvasDocumentRef={{ current: null }}
        onEmptyChange={() => {}}
      />,
    );
    insertDraftRef.current(draft("canvas-accepted", 1));
    latestViewProps.onChange();
    latestCanvasRuntime.onCanvasActivity("canvas-accepted", true);
    for (const id of canvasIdsToPurgeAfterTurnStart(true, ["canvas-accepted"])) purgeRequested.add(id);
    clearRef.current();
    latestViewProps.onChange();
    expect(events).toContainEqual(["purge", "canvas-accepted"]);

    insertDraftRef.current(draft("canvas-retry", 1));
    latestViewProps.onChange();
    latestCanvasRuntime.onCanvasActivity("canvas-retry", true);
    const retry = fakeEditor.document.find((block: any) => block.type === "canvas" && block.props.id === "canvas-retry");
    fakeEditor.removeBlocks([retry]);
    latestViewProps.onChange();
    expect(events).not.toContainEqual(["purge", "canvas-retry"]);
    expect(canvasIdsToPurgeAfterTurnStart(false, ["canvas-retry"])).toEqual([]);
    expect(canvasIdsToPurgeAfterTurnStart(true, ["canvas-retry"], false)).toEqual([]);
    view.unmount();
  });

  test("provider retry restores the exact surrounding document around duplicated Canvas refs", () => {
    activateDom();
    const restoreRef: any = { current: null };
    const refs: any = {
      getBlocksRef: { current: null },
      insertTextRef: { current: null },
      insertAnnotationRef: { current: null },
      insertFileRef: { current: null },
      focusRef: { current: null },
      clearRef: { current: null },
      openSkillPickerRef: { current: null },
      insertSkillRef: { current: null },
      freezeCanvasesRef: { current: null },
    };
    const runtime: any = {
      enabled: true,
      normalizeMedia: async () => null,
      resolveAsset: async () => null,
      getAssets: () => [],
      onAsset: () => {},
      onCanvasActivity: () => {},
      saveDraft: async () => ({}),
      freezeDraft: async () => ({}),
      onCanvasRemoved: () => {},
      onCanvasRestored: () => {},
      onCanvasUnmount: () => {},
      onCanvasFrozen: () => {},
      onCanvasDeliveryError: () => {},
      register: () => () => {},
    };
    const view = mount(
      <DocEditor
        skills={[]}
        cwd="."
        sessionId={null}
        {...refs}
        canvasEnabled={true}
        canvasRuntime={runtime}
        createCanvas={async () => draft("created", 1)}
        insertCanvasRef={{ current: null }}
        insertCanvasDraftRef={{ current: null }}
        restoreCanvasDocumentRef={restoreRef}
        onEmptyChange={() => {}}
      />,
    );
    // Newer user text must survive an asynchronous provider rejection; recovery appends rather
    // than replacing the live document.
    fakeEditor.document = [{ type: "paragraph", content: [{ type: "text", text: "newer" }] }];
    restoreRef.current(
      [
        { type: "text", text: "before" },
        { type: "image", path: "screens/result.png" },
        { type: "skill", skill_id: "review", params: {} },
        { type: "file", path: "src/main.rs" },
        { type: "session", session_id: "session-context" },
        { type: "canvas", id: "dup-a", frozen_revision: 1, pixel_policy: "required" },
        { type: "text", text: "between" },
        { type: "canvas", id: "dup-b", frozen_revision: 2, pixel_policy: "required" },
      ],
      new Map([
        ["dup-a", draft("dup-a", 1)],
        ["dup-b", draft("dup-b", 2)],
      ]),
      { deliveryError: "provider rejected images", deliveryErrorKind: "provider_image" },
    );
    expect(fakeEditor.document.map((block: any) => block.type)).toEqual([
      "paragraph",
      "paragraph",
      "image",
      "paragraph",
      "paragraph",
      "paragraph",
      "canvas",
      "paragraph",
      "canvas",
      "paragraph",
    ]);
    expect(fakeEditor.document[0].content[0].text).toBe("newer");
    expect(fakeEditor.document[1].content).toBe("before");
    expect(fakeEditor.document.find((block: any) => block.type === "image")?.props.url).toBe("screens/result.png");
    expect(refs.getBlocksRef.current()).toEqual([
      { type: "text", text: "newer" },
      { type: "text", text: "before" },
      { type: "image", path: "screens/result.png" },
      { type: "skill", skill_id: "review", params: {} },
      { type: "file", path: "src/main.rs" },
      { type: "session", session_id: "session-context" },
      { type: "canvas", id: "dup-a", frozen_revision: 1, pixel_policy: "required" },
      { type: "text", text: "between" },
      { type: "canvas", id: "dup-b", frozen_revision: 2, pixel_policy: "required" },
    ]);
    expect(fakeEditor.document.filter((block: any) => block.type === "canvas").map((block: any) => block.props.id)).toEqual([
      "dup-a",
      "dup-b",
    ]);
    expect(fakeEditor.document.find((block: any) => block.type === "canvas")?.props.deliveryErrorKind).toBe("provider_image");
    view.unmount();
  });

  test("routes provider-image rejection to matching live Canvas handles and renders recovery controls without changing the prompt", async () => {
    activateDom();
    const insertDraftRef: any = { current: null };
    const canvasDeliveryErrorRef: any = { current: null };
    const nonTargetHandleErrors: any[] = [];
    const baseErrors: any[] = [];
    const refs: any = {
      getBlocksRef: { current: null },
      insertTextRef: { current: null },
      insertAnnotationRef: { current: null },
      insertFileRef: { current: null },
      focusRef: { current: null },
      clearRef: { current: null },
      openSkillPickerRef: { current: null },
      insertSkillRef: { current: null },
      freezeCanvasesRef: { current: null },
    };
    const runtime: any = {
      enabled: true,
      normalizeMedia: async () => null,
      resolveAsset: async () => null,
      getAssets: () => [],
      onAsset: () => {},
      onCanvasActivity: () => {},
      saveDraft: async () => ({}),
      freezeDraft: async () => ({}),
      onCanvasRemoved: () => {},
      onCanvasRestored: () => {},
      onCanvasUnmount: () => {},
      onCanvasFrozen: () => {},
      onCanvasDeliveryError: (...args: any[]) => baseErrors.push(args),
      register: () => () => {},
    };
    const { CanvasBlockView } = realSkillInline;
    mountedCanvasBlock = (
      <CanvasBlockView
        block={{
          props: {
            id: "canvas-target",
            revision: 1,
            title: "Target",
            envelope: canvasEnvelope(),
            pixelPolicy: "required",
          },
        }}
        editor={{ updateBlock: () => {} }}
      />
    );
    const view = mount(
      <DocEditor
        skills={[]}
        cwd="."
        sessionId={null}
        {...refs}
        canvasEnabled={true}
        canvasRuntime={runtime}
        createCanvas={async () => draft("created", 1)}
        insertCanvasRef={{ current: null }}
        insertCanvasDraftRef={insertDraftRef}
        restoreCanvasDocumentRef={{ current: null }}
        canvasDeliveryErrorRef={canvasDeliveryErrorRef}
        onEmptyChange={() => {}}
      />,
    );
    fakeEditor.document = [
      { type: "paragraph", content: [{ type: "text", text: "before" }] },
      { type: "canvas", props: { id: "canvas-target", revision: 1, pixelPolicy: "required" } },
      { type: "paragraph", content: [{ type: "text", text: "between" }] },
      { type: "canvas", props: { id: "canvas-other", revision: 2, pixelPolicy: "required" } },
      { type: "paragraph", content: [] },
    ];
    const documentBefore = refs.getBlocksRef.current();
    await flush();
    latestCanvasRuntime.register({
      id: "canvas-other",
      setError: (...args: any[]) => nonTargetHandleErrors.push(["canvas-other", ...args]),
    });

    canvasDeliveryErrorRef.current(
      [
        { type: "text", text: "before" },
        { type: "canvas", id: "canvas-target", frozen_revision: 1, pixel_policy: "required" },
        { type: "canvas", id: "not-mounted", frozen_revision: 9, pixel_policy: "required" },
      ],
      "provider rejected images",
      "provider_image",
    );
    await flush();

    expect(button(view.container, "Send structure only")).toBeTruthy();
    expect(button(view.container, "Switch provider")).toBeTruthy();
    expect(view.container.querySelectorAll(".canvas-ui-control")).toHaveLength(2);
    expect(nonTargetHandleErrors).toEqual([]);
    expect(baseErrors).toEqual([
      ["canvas-target", "provider rejected images", "provider_image"],
      ["not-mounted", "provider rejected images", "provider_image"],
    ]);
    expect(refs.getBlocksRef.current()).toEqual(documentBefore);
    view.unmount();
  });
});
