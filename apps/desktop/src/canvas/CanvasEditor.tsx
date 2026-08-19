import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import "./styles.css";

import { Excalidraw, newImageElement, type AppState, type BinaryFileData, type BinaryFiles, type ExcalidrawElement, type ExcalidrawImperativeAPI, type ExcalidrawProps } from "./excalidrawAdapter";
import { intakeCanvasMedia, mediaInputFromFile, mediaInputsFromClipboard, mediaInputsFromDataTransfer, type NormalizedCanvasMedia } from "./media";
import { createEnvelope, deserializeEnvelope, rehydrateEnvelope, sanitizeElements } from "./serialize";
import type {
  CanvasAssetRef,
  CanvasEditorHandle,
  CanvasEditorProps,
  CanvasEnvelope,
  CanvasSceneSnapshot,
} from "./types";

const AUTOSAVE_DEBOUNCE_MS = 500;
const ALLOWED_EXCALIDRAW_UI_LABELS = [
  "selection",
  "hand",
  "pen mode",
  "freedraw",
  "draw",
  "eraser",
  "text",
  "rectangle",
  "ellipse",
  "line",
  "arrow",
  "undo",
  "redo",
] as const;

function isAllowedExcalidrawLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, " ");
  const base = normalized.split(/\s+[—-]\s*/)[0].trim();
  return ALLOWED_EXCALIDRAW_UI_LABELS.some((term) => base === term || (term === "hand" && base === "hand (panning tool)"));
}

function hideUnsupportedUi(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(
    ".selected-shape-actions, .main-menu-trigger, .App-toolbar__extra-tools-trigger, .App-toolbar__extra-tools-dropdown, .default-sidebar, .default-sidebar-trigger, .sidebar-trigger, .sidebar-triggers, .collab-button, .ToolIcon__MagicButton, .ToolIcon__LaserPointer, .ttd-dialog-panel",
  ).forEach((node) => {
    if (node.closest("[data-canvas-owned]")) return;
    node.hidden = true;
    node.dataset.canvasUnsupported = "true";
    node.setAttribute("aria-hidden", "true");
    node.tabIndex = -1;
  });
  root.querySelectorAll<HTMLElement>("button,[role=button],[aria-label],[title]").forEach((node) => {
    if (node.closest("[data-canvas-owned]")) return;
    if (node.classList.contains("canvas-editor__stage")) return;
    const label = node.getAttribute("aria-label") ?? node.getAttribute("title") ?? node.textContent ?? "";
    if (isAllowedExcalidrawLabel(label)) return;
    const target = node.closest<HTMLElement>("button,[role=button],.ToolIcon") ?? node;
    target.dataset.canvasUnsupported = "true";
    target.hidden = true;
    target.setAttribute("aria-hidden", "true");
    target.tabIndex = -1;
  });
}

function fileAssetRefs(
  files: BinaryFiles,
  metadata: ReadonlyMap<string, CanvasAssetRef>,
  elements: readonly ExcalidrawElement[] = [],
): readonly CanvasAssetRef[] {
  const refs = new Map<string, CanvasAssetRef>();
  for (const file of Object.values(files)) {
    const asset = metadata.get(file.id);
    if (asset) refs.set(asset.fileId, asset);
  }
  // A hydrated scene may temporarily expose no BinaryFiles while its opaque assets are being
  // resolved. Keep trusted metadata attached to image elements so serialization never invents
  // a file id or drops an image ref during that interval.
  for (const element of elements) {
    if (element.type !== "image" || !element.fileId) continue;
    const asset = metadata.get(element.fileId);
    if (asset) refs.set(asset.fileId, asset);
  }
  return Array.from(refs.values()).sort((a, b) => a.fileId.localeCompare(b.fileId));
}

const LIMITED_COLOR_PRESETS = ["black", "white", "red", "blue", "green", "yellow", "orange"] as const;
const LIMITED_FILL_PRESETS = ["transparent", "white", "yellow", "blue"] as const;
const LIMITED_STROKE_WIDTH_PRESETS = [1, 2, 4] as const;
const LIMITED_FONT_PRESETS = [
  { label: "Normal", value: 2 as const },
  { label: "Monospace", value: 3 as const },
] as const;

function mediaByteLength(media: NormalizedCanvasMedia): number {
  if (media.bytes instanceof Uint8Array || media.bytes instanceof ArrayBuffer) return media.bytes.byteLength;
  return media.bytes.size;
}

function isSafePreviewImage(value: string | null): value is string {
  if (!value || /^(?:https?:|javascript:)/i.test(value)) return false;
  if (/^data:image\/(?:svg|gif)/i.test(value)) return false;
  return /^(?:data:image\/(?:png|webp);|blob:|\/|\.\/|\.\.\/)/i.test(value);
}

function initialDataForEnvelope(
  envelope: CanvasEnvelope | null,
  appState: AppState | null = null,
  themeOverride?: CanvasEnvelope["theme"],
): ExcalidrawProps["initialData"] {
  return async () => {
    if (!envelope) {
      return {
        elements: [],
        appState: {
          ...(appState ?? {}),
          showWelcomeScreen: false,
          currentItemRoughness: 0,
          currentItemStrokeWidth: 2,
          currentItemStrokeStyle: "solid",
          gridSize: 20,
          gridStep: 5,
        } as unknown as Partial<AppState>,
        files: {},
      };
    }
    const sceneTheme = themeOverride ?? envelope.theme;
    return {
      elements: envelope.elements,
      appState: {
        ...envelope.appState,
        zoom: { value: envelope.appState.zoom },
        theme: sceneTheme,
        showWelcomeScreen: false,
        currentItemRoughness: 0,
        currentItemStrokeWidth: 2,
        currentItemStrokeStyle: "solid",
        gridSize: envelope.appState.gridSize ?? 20,
        gridStep: envelope.appState.gridStep,
      } as Partial<AppState>,
      files: {},
    };
  };
}

export const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(function CanvasEditor(
  {
    className,
    value,
    mode = "edit",
    theme = value?.theme ?? "light",
    initiallyExpanded = false,
    autosaveDebounceMs = AUTOSAVE_DEBOUNCE_MS,
    mediaNormalizer,
    assetResolver,
    onChange,
    onDone,
    onFocusChange,
    onMediaError,
    previewImage = null,
    previewAlt,
    name = "Canvas",
  },
  ref,
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const sceneRef = useRef<CanvasSceneSnapshot>({ elements: [], appState: {} as AppState, files: {} });
  const envelopeRef = useRef<CanvasEnvelope | null>(value ? deserializeEnvelope(value) : null);
  const revisionRef = useRef(envelopeRef.current?.revision ?? 0);
  const knownFileIdsRef = useRef(new Set<string>(envelopeRef.current?.assetRefs.map((asset) => asset.fileId) ?? []));
  const assetMetadataRef = useRef(new Map<string, CanvasAssetRef>(envelopeRef.current?.assetRefs.map((asset) => [asset.fileId, asset]) ?? []));
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressAutosaveRef = useRef(false);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [error, setError] = useState<string | null>(null);

  const effectiveEnvelope = useMemo(
    () => (value === undefined ? envelopeRef.current : value ? deserializeEnvelope(value) : null),
    [value],
  );
  // Authoring follows the caller's current UI theme even when a server-created draft still
  // carries its default theme. Read-only/history views must remain faithful to the frozen value.
  const currentTheme = mode === "edit" ? theme : value?.theme ?? effectiveEnvelope?.theme ?? theme;
  const previewSource = isSafePreviewImage(previewImage) ? previewImage : null;

  useEffect(() => {
    if (value === undefined) return;
    const next = value ? deserializeEnvelope(value) : null;
    envelopeRef.current = next;
    revisionRef.current = next?.revision ?? 0;
    knownFileIdsRef.current = new Set(next?.assetRefs.map((asset) => asset.fileId) ?? []);
    assetMetadataRef.current = new Map(next?.assetRefs.map((asset) => [asset.fileId, asset]) ?? []);
    if (apiRef.current) {
      suppressAutosaveRef.current = true;
      apiRef.current.resetScene(next
        ? { elements: next.elements, appState: { ...next.appState, zoom: { value: next.appState.zoom }, theme: mode === "edit" ? currentTheme : next.theme }, files: {} }
        : { elements: [], files: {} });
      queueMicrotask(() => {
        suppressAutosaveRef.current = false;
      });
    }
  }, [currentTheme, mode, value]);

  useEffect(() => () => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
  }, []);

  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      const api = apiRef.current;
      if (!api && envelopeRef.current) {
        return {
          elements: envelopeRef.current.elements,
          appState: {
            ...envelopeRef.current.appState,
            theme: mode === "edit" ? currentTheme : envelopeRef.current.theme,
            zoom: { value: envelopeRef.current.appState.zoom },
          } as AppState,
          files: sceneRef.current.files,
        };
      }
      if (!api) return sceneRef.current;
      const elements = sanitizeElements(api.getSceneElements());
      const appState = api.getAppState();
      const files = typeof api.getFiles === "function" ? api.getFiles() : sceneRef.current.files;
      const snapshot = { elements, appState, files } satisfies CanvasSceneSnapshot;
      sceneRef.current = snapshot;
      return snapshot;
    },
    getEnvelope: () => {
      // When the editor is collapsed the Excalidraw API is intentionally unmounted. The last
      // authoritative envelope is still the exact scene and must win over the empty placeholder
      // sceneRef used before the island expands.
      if (!apiRef.current && envelopeRef.current) {
        return mode === "edit" ? { ...envelopeRef.current, theme: currentTheme } : envelopeRef.current;
      }
      const snapshot = apiRef.current
        ? {
            elements: sanitizeElements(apiRef.current.getSceneElements()),
            appState: apiRef.current.getAppState(),
            files: typeof apiRef.current.getFiles === "function" ? apiRef.current.getFiles() : sceneRef.current.files,
          } satisfies CanvasSceneSnapshot
        : sceneRef.current;
      try {
        return createEnvelope(
          snapshot,
          revisionRef.current,
          currentTheme,
          fileAssetRefs(snapshot.files, assetMetadataRef.current, snapshot.elements),
        );
      } catch {
        return envelopeRef.current;
      }
    },
    resetFromEnvelope: (next) => {
      envelopeRef.current = next ? deserializeEnvelope(next) : null;
      revisionRef.current = next?.revision ?? 0;
      knownFileIdsRef.current = new Set(next?.assetRefs.map((asset) => asset.fileId) ?? []);
      assetMetadataRef.current = new Map(next?.assetRefs.map((asset) => [asset.fileId, asset]) ?? []);
      if (apiRef.current) {
        suppressAutosaveRef.current = true;
        apiRef.current.resetScene(next
          ? { elements: next.elements, appState: { ...next.appState, zoom: { value: next.appState.zoom }, theme: mode === "edit" ? currentTheme : next.theme }, files: {} }
          : { elements: [], files: {} });
        queueMicrotask(() => {
          suppressAutosaveRef.current = false;
        });
      }
    },
    focus: () => rootRef.current?.focus(),
  }), [currentTheme, mode]);

  const collapse = useCallback(() => {
    setExpanded(false);
    onDone?.();
  }, [onDone]);

  const scheduleAutosave = useCallback((next: CanvasEnvelope) => {
    envelopeRef.current = next;
    if (!onChange || suppressAutosaveRef.current) return;
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      autosaveRef.current = null;
      onChange(next);
    }, Math.max(0, autosaveDebounceMs));
  }, [autosaveDebounceMs, onChange]);

  const onSceneChange = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    if (mode !== "edit") return;
    const normalizedFiles = Object.fromEntries(Object.entries(files).filter(([fileId]) => knownFileIdsRef.current.has(fileId))) as BinaryFiles;
    const filteredElements = sanitizeElements(elements).filter((element) => element.type !== "image" || (element.fileId !== null && knownFileIdsRef.current.has(element.fileId)));
    sceneRef.current = { elements: filteredElements, appState, files: normalizedFiles };
    const next = createEnvelope(
      { elements: filteredElements, appState },
      // The server/core owns the monotonic CAS revision. Local edits keep the
      // last authoritative revision until the caller sends a newer envelope.
      revisionRef.current,
      currentTheme,
      fileAssetRefs(normalizedFiles, assetMetadataRef.current, filteredElements),
    );
    scheduleAutosave(next);
  }, [currentTheme, mode, scheduleAutosave]);

  const placeNormalizedImage = useCallback((file: BinaryFileData, media: NormalizedCanvasMedia) => {
    const api = apiRef.current;
    if (!api) return;
    const appState = api.getAppState();
    const zoom = typeof appState.zoom === "object" ? appState.zoom.value : 1;
    const width = Math.max(64, Math.min(1024, media.width ?? 320));
    const height = Math.max(64, Math.min(1024, media.height ?? 180));
    const image = newImageElement({
      type: "image",
      fileId: file.id,
      status: "saved",
      x: -appState.scrollX + 160 / Math.max(0.1, zoom),
      y: -appState.scrollY + 120 / Math.max(0.1, zoom),
      width,
      height,
      strokeColor: "black",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      strokeStyle: "solid",
      roughness: 0,
      roundness: null,
      opacity: 100,
      locked: false,
      frameId: null,
      scale: [1, 1],
    });
    api.updateScene({ elements: [...api.getSceneElements(), image] });
  }, []);

  const normalizeFiles = useCallback(async (files: readonly File[]) => {
    if (files.length === 0) return;
    if (!mediaNormalizer) {
      const mediaError = new Error("Canvas mediaNormalizer is required for image input");
      setError(mediaError.message);
      onMediaError?.(mediaError);
      return;
    }
    try {
      const normalizedMediaByFileId = new Map<string, NormalizedCanvasMedia>();
      const added = await intakeCanvasMedia(files.map(mediaInputFromFile), {
        normalize: mediaNormalizer,
        // Excalidraw's image element points at BinaryFiles by file id. The trusted opaque
        // normalizer ref is the core asset id, so use it directly to make reopen lossless.
        createFileId: (media) => media.ref,
        onAsset: (file, media) => {
          knownFileIdsRef.current.add(file.id);
          normalizedMediaByFileId.set(file.id, media);
          assetMetadataRef.current.set(file.id, {
            ref: media.ref,
            fileId: file.id,
            mimeType: media.mimeType,
            byteLength: mediaByteLength(media),
            ...(typeof media.width === "number" ? { width: media.width } : {}),
            ...(typeof media.height === "number" ? { height: media.height } : {}),
          });
          apiRef.current?.addFiles([file]);
        },
      });
      for (const file of added) {
        const media = normalizedMediaByFileId.get(file.id);
        if (media) placeNormalizedImage(file, media);
      }
      setError(null);
    } catch (cause) {
      const mediaError = cause instanceof Error ? cause : new Error("Canvas media input failed");
      setError(mediaError.message);
      onMediaError?.(mediaError);
    }
  }, [mediaNormalizer, onMediaError, placeNormalizedImage]);

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const files = mediaInputsFromClipboard(event).map((input) => input.bytes).filter((input): input is File => input instanceof File);
    if (files.length === 0) return false;
    event.preventDefault();
    await normalizeFiles(files);
    return true;
  }, [normalizeFiles]);

  const handleDrop = useCallback(async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = mediaInputsFromDataTransfer(event.dataTransfer).map((input) => input.bytes).filter((input): input is File => input instanceof File);
    if (files.length === 0) return;
    await normalizeFiles(files);
  }, [normalizeFiles]);

  const handleFileInput = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    await normalizeFiles(files);
    input.value = "";
  }, [normalizeFiles]);

  const handleKeyDownCapture = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      collapse();
      return;
    }
    // Excalidraw's single-key shortcuts include tools that C2 rejects.
    // Stop them before the renderer's keyboard handler sees the event.
    const target = event.target as HTMLElement | null;
    const isTextEntry = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
    const key = event.key.toLowerCase();
    // Numeric shortcuts are captured too: Excalidraw's 3 selects the unsupported diamond,
    // while 9 activates its raw image tool and would bypass the required media normalizer.
    // Images remain available through the C2-owned Image button, which always normalizes
    // to a trusted static asset before insertion.
    const blockedShortcutKeys = new Set(["3", "9", "d", "f", "i", "k", "m"]);
    const blockedModifiedShortcut = (event.metaKey || event.ctrlKey) && (
      key === "k" ||
      key === "f" ||
      (event.shiftKey && key === "l")
    );
    if (!isTextEntry && (blockedShortcutKeys.has(key) || blockedModifiedShortcut)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, [collapse, expanded]);

  const updatePreset = useCallback((patch: Partial<AppState>) => {
    if (mode !== "edit") return;
    apiRef.current?.updateScene({ appState: patch as never });
  }, [mode]);

  const initialData = useMemo(
    () => initialDataForEnvelope(effectiveEnvelope, null, mode === "edit" ? currentTheme : undefined),
    [currentTheme, effectiveEnvelope, mode],
  );
  const editorProps: ExcalidrawProps = {
    initialData,
    theme: currentTheme,
    name,
    viewModeEnabled: mode !== "edit",
    // Engine-rendered dots are authoring chrome only. They are not included in the persistence
    // envelope's app-state subset or in exportCanvasPng, which explicitly disables grid mode.
    gridModeEnabled: mode === "edit",
    objectsSnapModeEnabled: mode === "edit",
    handleKeyboardGlobally: false,
    detectScroll: true,
    isCollaborating: false,
    onChange: onSceneChange,
    onPaste: async (_data, event) => (event ? handlePaste(event) : false),
    excalidrawAPI: (api) => {
      apiRef.current = api;
    },
    UIOptions: {
      welcomeScreen: false,
      tools: { image: false },
      canvasActions: {
        clearCanvas: false,
        export: false,
        loadScene: false,
        saveToActiveFile: false,
        toggleTheme: false,
        saveAsImage: false,
      },
    },
  };

  useEffect(() => {
    if (!expanded || !rootRef.current) return;
    hideUnsupportedUi(rootRef.current);
    const observer = new MutationObserver(() => hideUnsupportedUi(rootRef.current as HTMLElement));
    observer.observe(rootRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "title"] });
    return () => observer.disconnect();
  }, [expanded]);

  useEffect(() => {
    if (!expanded || !effectiveEnvelope || !assetResolver) return;
    let cancelled = false;
    void (async () => {
      const assets = (await Promise.all(effectiveEnvelope.assetRefs.map((asset) => assetResolver(asset)))).filter((asset): asset is NonNullable<Awaited<ReturnType<NonNullable<typeof assetResolver>>>> => Boolean(asset));
      if (cancelled || !apiRef.current || assets.length === 0) return;
      const hydrated = await rehydrateEnvelope(effectiveEnvelope, assets);
      if (cancelled) return;
      for (const file of Object.values(hydrated.files)) knownFileIdsRef.current.add(file.id);
      suppressAutosaveRef.current = true;
      apiRef.current.resetScene({ elements: hydrated.elements, appState: hydrated.appState, files: hydrated.files });
      queueMicrotask(() => {
        suppressAutosaveRef.current = false;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [assetResolver, effectiveEnvelope, expanded]);

  if (!expanded) {
    return (
      <div ref={rootRef} className={className ? `canvas-editor ${className}` : "canvas-editor"} data-canvas-mode={mode} data-canvas-theme={currentTheme} data-canvas-collapsed="true">
        <button
          type="button"
          className="canvas-editor__preview"
          aria-label={`Open ${name}`}
          aria-expanded="false"
          onClick={() => setExpanded(true)}
        >
          {previewSource ? <img className="canvas-editor__preview-image" src={previewSource} alt={previewAlt ?? `${name} preview`} /> : null}
          <span className="canvas-editor__preview-copy">
            <span className="canvas-editor__preview-title">{name}</span>
            <span className="canvas-editor__preview-hint">{mode === "edit" ? "Click to expand and edit" : "Click to expand and view"}</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={className ? `canvas-editor ${className}` : "canvas-editor"}
      data-canvas-mode={mode}
      data-canvas-theme={currentTheme}
      data-canvas-collapsed="false"
      tabIndex={-1}
      onKeyDownCapture={handleKeyDownCapture}
      onDrop={handleDrop}
      onFocus={() => onFocusChange?.(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onFocusChange?.(false);
      }}
    >
      <div className="canvas-editor__stage" aria-label={`${name} editor`}>
        <Excalidraw {...editorProps} />
        <div className="canvas-editor__chrome" data-canvas-owned>
          {mode === "edit" && (
            <>
              <div className="canvas-editor__presets" aria-label="Canvas style presets" data-canvas-owned>
                <span className="canvas-editor__preset-label">Stroke</span>
                {LIMITED_COLOR_PRESETS.map((color) => (
                  <button key={`stroke-${color}`} type="button" className="canvas-editor__preset" aria-label={`Stroke color ${color}`} onClick={() => updatePreset({ currentItemStrokeColor: color })}>
                    {color}
                  </button>
                ))}
                <span className="canvas-editor__preset-label">Width</span>
                {LIMITED_STROKE_WIDTH_PRESETS.map((width) => (
                  <button key={`width-${width}`} type="button" className="canvas-editor__preset" aria-label={`Stroke width ${width}`} onClick={() => updatePreset({ currentItemStrokeWidth: width })}>
                    {width}
                  </button>
                ))}
                <span className="canvas-editor__preset-label">Fill</span>
                {LIMITED_FILL_PRESETS.map((fill) => (
                  <button key={`fill-${fill}`} type="button" className="canvas-editor__preset" aria-label={`Fill color ${fill}`} onClick={() => updatePreset({ currentItemFillStyle: "solid", currentItemBackgroundColor: fill })}>
                    {fill}
                  </button>
                ))}
                <span className="canvas-editor__preset-label">Font</span>
                {LIMITED_FONT_PRESETS.map((font) => (
                  <button key={`font-${font.value}`} type="button" className="canvas-editor__preset" aria-label={`Font ${font.label}`} onClick={() => updatePreset({ currentItemFontFamily: font.value })}>
                    {font.label}
                  </button>
                ))}
              </div>
              <div data-canvas-owned>
                <input className="canvas-editor__file-input" type="file" accept="image/png,image/webp,image/jpeg,image/gif,image/svg+xml" multiple onChange={handleFileInput} aria-label="Choose image files" />
                <button type="button" className="canvas-editor__media-button" aria-label="Image" onClick={() => rootRef.current?.querySelector<HTMLInputElement>(".canvas-editor__file-input")?.click()}>
                  Image
                </button>
              </div>
            </>
          )}
          <button type="button" className="canvas-editor__done" aria-label="Done" onClick={collapse}>Done</button>
        </div>
        {error ? <div className="canvas-editor__error" role="alert">{error}</div> : null}
      </div>
    </div>
  );
});

CanvasEditor.displayName = "CanvasEditor";
