import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";

import "./styles.css";

import { Excalidraw, newImageElement } from "./excalidrawAdapter";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawElement,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from "./excalidrawAdapter";
import { Button } from "@/components/ui/button";
import {
  intakeCanvasMedia,
  mediaInputFromFile,
  mediaInputsFromClipboard,
  mediaInputsFromDataTransfer,
} from "./media";
import type { NormalizedCanvasMedia } from "./media";
import {
  createEnvelope,
  deserializeEnvelope,
  rehydrateEnvelope,
  sanitizeElements,
} from "./serialize";
import type {
  CanvasAssetReference,
  CanvasEditorHandle,
  CanvasEditorProps,
  CanvasEnvelope,
  CanvasSceneSnapshot,
} from "./types";

const defaultAutosaveDebounceMs = 500;
const allowedExcalidrawUiLabels = [
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
  const normalized = label.trim().toLowerCase().replace(/\s+/gu, " ");
  const base = normalized.split(/\s+[—-]\s*/u)[0].trim();
  return allowedExcalidrawUiLabels.some(
    (term) =>
      base === term || (term === "hand" && base === "hand (panning tool)")
  );
}

function hideUnsupportedUi(root: HTMLElement): void {
  root
    .querySelectorAll<HTMLElement>(
      ".selected-shape-actions, .main-menu-trigger, .App-toolbar__extra-tools-trigger, .App-toolbar__extra-tools-dropdown, .default-sidebar, .default-sidebar-trigger, .sidebar-trigger, .sidebar-triggers, .collab-button, .ToolIcon__MagicButton, .ToolIcon__LaserPointer, .ttd-dialog-panel"
    )
    .forEach((node) => {
      if (node.closest("[data-canvas-owned]")) {
        return;
      }
      node.hidden = true;
      node.dataset.canvasUnsupported = "true";
      node.setAttribute("aria-hidden", "true");
      node.tabIndex = -1;
    });
  root
    .querySelectorAll<HTMLElement>("button,[role=button],[aria-label],[title]")
    .forEach((node) => {
      if (node.closest("[data-canvas-owned]")) {
        return;
      }
      if (node.classList.contains("canvas-editor__stage")) {
        return;
      }
      const label =
        node.getAttribute("aria-label") ??
        node.getAttribute("title") ??
        node.textContent ??
        "";
      if (isAllowedExcalidrawLabel(label)) {
        return;
      }
      const target =
        node.closest<HTMLElement>("button,[role=button],.ToolIcon") ?? node;
      target.dataset.canvasUnsupported = "true";
      target.hidden = true;
      target.setAttribute("aria-hidden", "true");
      target.tabIndex = -1;
    });
}

function fileAssetRefs(
  files: BinaryFiles,
  metadata: ReadonlyMap<string, CanvasAssetReference>,
  elements: readonly ExcalidrawElement[] = []
): readonly CanvasAssetReference[] {
  const refs = new Map<string, CanvasAssetReference>();
  for (const file of Object.values(files)) {
    const asset = metadata.get(file.id);
    if (asset) {
      refs.set(asset.fileId, asset);
    }
  }
  // A hydrated scene may temporarily expose no BinaryFiles while its opaque assets are being
  // resolved. Keep trusted metadata attached to image elements so serialization never invents
  // a file id or drops an image ref during that interval.
  for (const element of elements) {
    if (element.type !== "image" || !element.fileId) {
      continue;
    }
    const asset = metadata.get(element.fileId);
    if (asset) {
      refs.set(asset.fileId, asset);
    }
  }
  return Array.from(refs.values()).sort((a, b) =>
    a.fileId.localeCompare(b.fileId)
  );
}

const limitedColorPresets = [
  "black",
  "white",
  "red",
  "blue",
  "green",
  "yellow",
  "orange",
] as const;
const limitedFillPresets = ["transparent", "white", "yellow", "blue"] as const;
const limitedStrokeWidthPresets = [1, 2, 4] as const;
const limitedFontPresets = [
  { label: "Normal", value: 2 as const },
  { label: "Monospace", value: 3 as const },
] as const;

function mediaByteLength(media: NormalizedCanvasMedia): number {
  if (media.bytes instanceof Uint8Array || media.bytes instanceof ArrayBuffer) {
    return media.bytes.byteLength;
  }
  return media.bytes.size;
}

function isSafePreviewImage(value: string | null): value is string {
  if (!value || /^(?:https?:|javascript:)/iu.test(value)) {
    return false;
  }
  if (/^data:image\/(?:svg|gif)/iu.test(value)) {
    return false;
  }
  return /^(?:data:image\/(?:png|webp);|blob:|\/|\.\/|\.\.\/)/iu.test(value);
}

function initialDataForEnvelope(
  envelope: CanvasEnvelope | null,
  appState: AppState | null = null,
  themeOverride?: CanvasEnvelope["theme"]
): ExcalidrawProps["initialData"] {
  return async () => {
    if (!envelope) {
      return {
        appState: {
          ...(appState ?? {}),
          currentItemRoughness: 0,
          currentItemStrokeStyle: "solid",
          currentItemStrokeWidth: 2,
          gridSize: 20,
          gridStep: 5,
          showWelcomeScreen: false,
        } as unknown as Partial<AppState>,
        elements: [],
        files: {},
      };
    }
    const sceneTheme = themeOverride ?? envelope.theme;
    return {
      appState: {
        ...envelope.appState,
        currentItemRoughness: 0,
        currentItemStrokeStyle: "solid",
        currentItemStrokeWidth: 2,
        gridSize: envelope.appState.gridSize ?? 20,
        gridStep: envelope.appState.gridStep,
        showWelcomeScreen: false,
        theme: sceneTheme,
        zoom: { value: envelope.appState.zoom },
      } as Partial<AppState>,
      elements: envelope.elements,
      files: {},
    };
  };
}

export const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(
  function CanvasEditor(
    {
      className,
      value,
      mode = "edit",
      theme = value?.theme ?? "light",
      initiallyExpanded = false,
      autosaveDebounceMs = defaultAutosaveDebounceMs,
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
    ref
  ) {
    const rootRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
    const sceneRef = useRef<CanvasSceneSnapshot>({
      appState: {} as AppState,
      elements: [],
      files: {},
    });
    const envelopeRef = useRef<CanvasEnvelope | null>(
      value ? deserializeEnvelope(value) : null
    );
    const revisionRef = useRef(envelopeRef.current?.revision ?? 0);
    const knownFileIdsRef = useRef(
      new Set<string>(
        envelopeRef.current?.assetReferences.map((asset) => asset.fileId) ?? []
      )
    );
    const assetMetadataRef = useRef(
      new Map<string, CanvasAssetReference>(
        envelopeRef.current?.assetReferences.map((asset) => [
          asset.fileId,
          asset,
        ]) ?? []
      )
    );
    const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suppressAutosaveRef = useRef(false);
    const [expanded, setExpanded] = useState(initiallyExpanded);
    const [error, setError] = useState<string | null>(null);

    const effectiveEnvelope =
      value === undefined
        ? envelopeRef.current
        : value
          ? deserializeEnvelope(value)
          : null;
    // Authoring follows the caller's current UI theme even when a server-created draft still
    // carries its default theme. Read-only/history views must remain faithful to the frozen value.
    const currentTheme =
      mode === "edit"
        ? theme
        : (value?.theme ?? effectiveEnvelope?.theme ?? theme);
    const previewSource = isSafePreviewImage(previewImage)
      ? previewImage
      : null;

    useEffect(() => {
      if (value === undefined) {
        return;
      }
      const next = value ? deserializeEnvelope(value) : null;
      envelopeRef.current = next;
      revisionRef.current = next?.revision ?? 0;
      knownFileIdsRef.current = new Set(
        next?.assetReferences.map((asset) => asset.fileId) ?? []
      );
      assetMetadataRef.current = new Map(
        next?.assetReferences.map((asset) => [asset.fileId, asset]) ?? []
      );
      if (apiRef.current) {
        suppressAutosaveRef.current = true;
        apiRef.current.resetScene(
          next
            ? {
                appState: {
                  ...next.appState,
                  theme: mode === "edit" ? currentTheme : next.theme,
                  zoom: { value: next.appState.zoom },
                },
                elements: next.elements,
                files: {},
              }
            : { elements: [], files: {} }
        );
        queueMicrotask(() => {
          suppressAutosaveRef.current = false;
        });
      }
    }, [currentTheme, mode, value]);

    useEffect(
      () => () => {
        if (autosaveRef.current) {
          clearTimeout(autosaveRef.current);
        }
      },
      []
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: () => rootRef.current?.focus(),
        getEnvelope: () => {
          // When the editor is collapsed the Excalidraw API is intentionally unmounted. The last
          // authoritative envelope is still the exact scene and must win over the empty placeholder
          // sceneRef used before the island expands.
          if (!apiRef.current && envelopeRef.current) {
            return mode === "edit"
              ? { ...envelopeRef.current, theme: currentTheme }
              : envelopeRef.current;
          }
          const snapshot = apiRef.current
            ? ({
                appState: apiRef.current.getAppState(),
                elements: sanitizeElements(apiRef.current.getSceneElements()),
                files:
                  typeof apiRef.current.getFiles === "function"
                    ? apiRef.current.getFiles()
                    : sceneRef.current.files,
              } satisfies CanvasSceneSnapshot)
            : sceneRef.current;
          try {
            return createEnvelope(
              snapshot,
              revisionRef.current,
              currentTheme,
              fileAssetRefs(
                snapshot.files,
                assetMetadataRef.current,
                snapshot.elements
              )
            );
          } catch {
            return envelopeRef.current;
          }
        },
        getSnapshot: () => {
          const api = apiRef.current;
          if (!api && envelopeRef.current) {
            return {
              appState: {
                ...envelopeRef.current.appState,
                theme:
                  mode === "edit" ? currentTheme : envelopeRef.current.theme,
                zoom: { value: envelopeRef.current.appState.zoom },
              } as AppState,
              elements: envelopeRef.current.elements,
              files: sceneRef.current.files,
            };
          }
          if (!api) {
            return sceneRef.current;
          }
          const elements = sanitizeElements(api.getSceneElements());
          const appState = api.getAppState();
          const files =
            typeof api.getFiles === "function"
              ? api.getFiles()
              : sceneRef.current.files;
          const snapshot = {
            appState,
            elements,
            files,
          } satisfies CanvasSceneSnapshot;
          sceneRef.current = snapshot;
          return snapshot;
        },
        resetFromEnvelope: (next) => {
          envelopeRef.current = next ? deserializeEnvelope(next) : null;
          revisionRef.current = next?.revision ?? 0;
          knownFileIdsRef.current = new Set(
            next?.assetReferences.map((asset) => asset.fileId) ?? []
          );
          assetMetadataRef.current = new Map(
            next?.assetReferences.map((asset) => [asset.fileId, asset]) ?? []
          );
          if (apiRef.current) {
            suppressAutosaveRef.current = true;
            apiRef.current.resetScene(
              next
                ? {
                    appState: {
                      ...next.appState,
                      theme: mode === "edit" ? currentTheme : next.theme,
                      zoom: { value: next.appState.zoom },
                    },
                    elements: next.elements,
                    files: {},
                  }
                : { elements: [], files: {} }
            );
            queueMicrotask(() => {
              suppressAutosaveRef.current = false;
            });
          }
        },
      }),
      [currentTheme, mode]
    );

    const collapse = () => {
      setExpanded(false);
      onDone?.();
    };

    const scheduleAutosave = (next: CanvasEnvelope) => {
      envelopeRef.current = next;
      if (!onChange || suppressAutosaveRef.current) {
        return;
      }
      if (autosaveRef.current) {
        clearTimeout(autosaveRef.current);
      }
      autosaveRef.current = setTimeout(
        () => {
          autosaveRef.current = null;
          onChange(next);
        },
        Math.max(0, autosaveDebounceMs)
      );
    };

    const onSceneChange = (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      if (mode !== "edit") {
        return;
      }
      const normalizedFiles = Object.fromEntries(
        Object.entries(files).filter(([fileId]) =>
          knownFileIdsRef.current.has(fileId)
        )
      ) as BinaryFiles;
      const filteredElements = sanitizeElements(elements).filter(
        (element) =>
          element.type !== "image" ||
          (element.fileId !== null &&
            knownFileIdsRef.current.has(element.fileId))
      );
      sceneRef.current = {
        appState,
        elements: filteredElements,
        files: normalizedFiles,
      };
      const next = createEnvelope(
        { appState, elements: filteredElements },
        // The server/core owns the monotonic CAS revision. Local edits keep the
        // last authoritative revision until the caller sends a newer envelope.
        revisionRef.current,
        currentTheme,
        fileAssetRefs(
          normalizedFiles,
          assetMetadataRef.current,
          filteredElements
        )
      );
      scheduleAutosave(next);
    };

    const placeNormalizedImage = (
      file: BinaryFileData,
      media: NormalizedCanvasMedia
    ) => {
      const api = apiRef.current;
      if (!api) {
        return;
      }
      const appState = api.getAppState();
      const zoom = typeof appState.zoom === "object" ? appState.zoom.value : 1;
      const width = Math.max(64, Math.min(1024, media.width ?? 320));
      const height = Math.max(64, Math.min(1024, media.height ?? 180));
      const image = newImageElement({
        backgroundColor: "transparent",
        fileId: file.id,
        fillStyle: "solid",
        frameId: null,
        height,
        locked: false,
        opacity: 100,
        roughness: 0,
        roundness: null,
        scale: [1, 1],
        status: "saved",
        strokeColor: "black",
        strokeStyle: "solid",
        strokeWidth: 2,
        type: "image",
        width,
        x: -appState.scrollX + 160 / Math.max(0.1, zoom),
        y: -appState.scrollY + 120 / Math.max(0.1, zoom),
      });
      api.updateScene({ elements: [...api.getSceneElements(), image] });
    };

    const normalizeFiles = async (files: readonly File[]) => {
      if (files.length === 0) {
        return;
      }
      if (!mediaNormalizer) {
        const mediaError = new Error(
          "Canvas mediaNormalizer is required for image input"
        );
        setError(mediaError.message);
        onMediaError?.(mediaError);
        return;
      }
      try {
        const normalizedMediaByFileId = new Map<
          string,
          NormalizedCanvasMedia
        >();
        const added = await intakeCanvasMedia(files.map(mediaInputFromFile), {
          createFileId: (media) => media.ref,
          normalize: mediaNormalizer,
          onAsset: (file, media) => {
            knownFileIdsRef.current.add(file.id);
            normalizedMediaByFileId.set(file.id, media);
            assetMetadataRef.current.set(file.id, {
              byteLength: mediaByteLength(media),
              fileId: file.id,
              mimeType: media.mimeType,
              ref: media.ref,
              ...(typeof media.width === "number"
                ? { width: media.width }
                : {}),
              ...(typeof media.height === "number"
                ? { height: media.height }
                : {}),
            });
            apiRef.current?.addFiles([file]);
          },
        });
        for (const file of added) {
          const media = normalizedMediaByFileId.get(file.id);
          if (media) {
            placeNormalizedImage(file, media);
          }
        }
        setError(null);
      } catch (cause) {
        const mediaError =
          cause instanceof Error
            ? cause
            : new Error("Canvas media input failed");
        setError(mediaError.message);
        onMediaError?.(mediaError);
      }
    };

    const isHandlePaste = async (event: ClipboardEvent) => {
      const files = mediaInputsFromClipboard(event)
        .map((input) => input.bytes)
        .filter((input): input is File => input instanceof File);
      if (files.length === 0) {
        return false;
      }
      event.preventDefault();
      await normalizeFiles(files);
      return true;
    };

    const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const files = mediaInputsFromDataTransfer(event.dataTransfer)
        .map((input) => input.bytes)
        .filter((input): input is File => input instanceof File);
      if (files.length === 0) {
        return;
      }
      await normalizeFiles(files);
    };

    const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const files = Array.from(input.files ?? []);
      await normalizeFiles(files);
      input.value = "";
    };

    const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && expanded) {
        event.preventDefault();
        event.stopPropagation();
        collapse();
        return;
      }
      // Excalidraw's single-key shortcuts include tools that C2 rejects.
      // Stop them before the renderer's keyboard handler sees the event.
      const target = event.target as HTMLElement | null;
      const isTextEntry =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      const key = event.key.toLowerCase();
      // Numeric shortcuts are captured too: Excalidraw's 3 selects the unsupported diamond,
      // while 9 activates its raw image tool and would bypass the required media normalizer.
      // Images remain available through the C2-owned Image button, which always normalizes
      // to a trusted static asset before insertion.
      const blockedShortcutKeys = new Set(["3", "9", "d", "f", "i", "k", "m"]);
      const isBlockedModifiedShortcut =
        (event.metaKey || event.ctrlKey) &&
        (key === "k" || key === "f" || (event.shiftKey && key === "l"));
      if (
        !isTextEntry &&
        (blockedShortcutKeys.has(key) || isBlockedModifiedShortcut)
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const updatePreset = (patch: Partial<AppState>) => {
      if (mode !== "edit") {
        return;
      }
      apiRef.current?.updateScene({ appState: patch as never });
    };

    const initialData = initialDataForEnvelope(
      effectiveEnvelope,
      null,
      mode === "edit" ? currentTheme : undefined
    );
    const editorProps: ExcalidrawProps = {
      UIOptions: {
        canvasActions: {
          clearCanvas: false,
          export: false,
          loadScene: false,
          saveAsImage: false,
          saveToActiveFile: false,
          toggleTheme: false,
        },
        tools: { image: false },
        welcomeScreen: false,
      },
      detectScroll: true,
      excalidrawAPI: (api) => {
        apiRef.current = api;
      },
      gridModeEnabled: mode === "edit",
      handleKeyboardGlobally: false,
      initialData,
      isCollaborating: false,
      name,
      objectsSnapModeEnabled: mode === "edit",
      onChange: onSceneChange,
      onPaste: async (_data, event) => (event ? isHandlePaste(event) : false),
      theme: currentTheme,
      viewModeEnabled: mode !== "edit",
    };

    useEffect(() => {
      if (!expanded || !rootRef.current) {
        return;
      }
      hideUnsupportedUi(rootRef.current);
      const observer = new MutationObserver(() =>
        hideUnsupportedUi(rootRef.current as HTMLElement)
      );
      observer.observe(rootRef.current, {
        attributeFilter: ["aria-label", "title"],
        attributes: true,
        childList: true,
        subtree: true,
      });
      return () => observer.disconnect();
    }, [expanded]);

    useEffect(() => {
      if (!expanded || !effectiveEnvelope || !assetResolver) {
        return;
      }
      let isCancelled = false;
      void (async () => {
        const assets = (
          await Promise.all(
            effectiveEnvelope.assetReferences.map((asset) =>
              assetResolver(asset)
            )
          )
        ).filter(
          (
            asset
          ): asset is NonNullable<
            Awaited<ReturnType<NonNullable<typeof assetResolver>>>
          > => Boolean(asset)
        );
        if (isCancelled || !apiRef.current || assets.length === 0) {
          return;
        }
        const hydrated = await rehydrateEnvelope(effectiveEnvelope, assets);
        if (isCancelled) {
          return;
        }
        for (const file of Object.values(hydrated.files)) {
          knownFileIdsRef.current.add(file.id);
        }
        suppressAutosaveRef.current = true;
        apiRef.current.resetScene({
          appState: hydrated.appState,
          elements: hydrated.elements,
          files: hydrated.files,
        });
        queueMicrotask(() => {
          suppressAutosaveRef.current = false;
        });
      })();
      return () => {
        isCancelled = true;
      };
    }, [assetResolver, effectiveEnvelope, expanded]);

    if (!expanded) {
      return (
        <div
          ref={rootRef}
          className={className ? `canvas-editor ${className}` : "canvas-editor"}
          data-canvas-mode={mode}
          data-canvas-theme={currentTheme}
          data-canvas-collapsed="true"
        >
          <Button
            type="button"
            variant="ghost"
            size="row"
            focusStyle="inset"
            className="canvas-editor__preview"
            aria-label={`Open ${name}`}
            aria-expanded="false"
            onClick={() => setExpanded(true)}
          >
            {previewSource ? (
              <img
                className="canvas-editor__preview-image"
                src={previewSource}
                alt={previewAlt ?? `${name} preview`}
              />
            ) : null}
            <span className="canvas-editor__preview-copy">
              <span className="canvas-editor__preview-title">{name}</span>
              <span className="canvas-editor__preview-hint">
                {mode === "edit"
                  ? "Click to expand and edit"
                  : "Click to expand and view"}
              </span>
            </span>
          </Button>
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
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            onFocusChange?.(false);
          }
        }}
      >
        <div className="canvas-editor__stage" aria-label={`${name} editor`}>
          <Excalidraw {...editorProps} />
          <div className="canvas-editor__chrome" data-canvas-owned>
            {mode === "edit" && (
              <>
                <div
                  className="canvas-editor__presets"
                  aria-label="Canvas style presets"
                  data-canvas-owned
                >
                  <span className="canvas-editor__preset-label">Stroke</span>
                  {limitedColorPresets.map((color) => (
                    <Button
                      key={`stroke-${color}`}
                      type="button"
                      variant="ghost"
                      size="compact"
                      className="canvas-editor__preset"
                      aria-label={`Stroke color ${color}`}
                      onClick={() =>
                        updatePreset({ currentItemStrokeColor: color })
                      }
                    >
                      {color}
                    </Button>
                  ))}
                  <span className="canvas-editor__preset-label">Width</span>
                  {limitedStrokeWidthPresets.map((width) => (
                    <Button
                      key={`width-${width}`}
                      type="button"
                      variant="ghost"
                      size="compact"
                      className="canvas-editor__preset"
                      aria-label={`Stroke width ${width}`}
                      onClick={() =>
                        updatePreset({ currentItemStrokeWidth: width })
                      }
                    >
                      {width}
                    </Button>
                  ))}
                  <span className="canvas-editor__preset-label">Fill</span>
                  {limitedFillPresets.map((fill) => (
                    <Button
                      key={`fill-${fill}`}
                      type="button"
                      variant="ghost"
                      size="compact"
                      className="canvas-editor__preset"
                      aria-label={`Fill color ${fill}`}
                      onClick={() =>
                        updatePreset({
                          currentItemBackgroundColor: fill,
                          currentItemFillStyle: "solid",
                        })
                      }
                    >
                      {fill}
                    </Button>
                  ))}
                  <span className="canvas-editor__preset-label">Font</span>
                  {limitedFontPresets.map((font) => (
                    <Button
                      key={`font-${font.value}`}
                      type="button"
                      variant="ghost"
                      size="compact"
                      className="canvas-editor__preset"
                      aria-label={`Font ${font.label}`}
                      onClick={() =>
                        updatePreset({ currentItemFontFamily: font.value })
                      }
                    >
                      {font.label}
                    </Button>
                  ))}
                </div>
                <div data-canvas-owned>
                  <input
                    className="canvas-editor__file-input"
                    type="file"
                    accept="image/png,image/webp,image/jpeg,image/gif,image/svg+xml"
                    multiple
                    onChange={handleFileInput}
                    aria-label="Choose image files"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    className="canvas-editor__media-button"
                    aria-label="Image"
                    onClick={() =>
                      rootRef.current
                        ?.querySelector<HTMLInputElement>(
                          ".canvas-editor__file-input"
                        )
                        ?.click()
                    }
                  >
                    Image
                  </Button>
                </div>
              </>
            )}
            <Button
              type="button"
              variant="secondary"
              size="compact"
              className="canvas-editor__done"
              aria-label="Done"
              onClick={collapse}
            >
              Done
            </Button>
          </div>
          {error ? (
            <div className="canvas-editor__error" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);

CanvasEditor.displayName = "CanvasEditor";
