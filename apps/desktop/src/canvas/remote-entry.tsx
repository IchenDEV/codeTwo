import { createRoot, type Root } from "react-dom/client";

import { CanvasEditor } from "./CanvasEditor";
import {
  DEFAULT_EXPORT_BUDGET,
  exportCanvasPng,
  type CanvasExportBudget,
  type CanvasPngExport,
} from "./export";
import { deriveCanvasManifest, type CanvasManifest } from "./manifest";
import { rehydrateEnvelope } from "./serialize";
import type {
  CanvasEditorHandle,
  CanvasEditorProps,
  CanvasEnvelope,
  CanvasSceneSnapshot,
  NormalizedStaticAsset,
} from "./types";

declare global {
  interface Window {
    CodeTwoCanvasIsland?: CanvasIslandGlobal;
  }
}

export interface CanvasIslandMountOptions extends Omit<
  CanvasEditorProps,
  "value"
> {
  value?: CanvasEnvelope | null;
  freezePolicy?: CanvasFreezePolicy;
}

const roots = new WeakMap<HTMLElement, Root>();
const propsByRoot = new WeakMap<HTMLElement, CanvasIslandMountOptions>();
const handlesByRoot = new WeakMap<HTMLElement, CanvasEditorHandle>();

export type CanvasIslandMediaCallbacks = Pick<
  CanvasIslandMountOptions,
  "mediaNormalizer" | "assetResolver"
>;

export type CanvasFreezePolicy = "required" | "structure_only";

export interface CanvasIslandPrepareFreezeOptions {
  /** Caller-provided normalized assets, usually fetched from the host REST layer after reconnect. */
  assets?: readonly NormalizedStaticAsset[];
  /** Optional one-shot resolver; otherwise the resolver supplied at mount time is used. */
  assetResolver?: CanvasEditorProps["assetResolver"];
  budget?: Partial<CanvasExportBudget>;
  policy?: CanvasFreezePolicy;
}

export interface CanvasIslandFreezeResult {
  envelope: CanvasEnvelope;
  manifest: CanvasManifest;
  exports: readonly CanvasPngExport[];
  pixelPolicy: CanvasFreezePolicy;
  theme: CanvasEnvelope["theme"];
}

/**
 * The cheap autosave package.  Unlike `prepareCanvasIslandFreeze`, this deliberately does not
 * resolve media or render PNGs.  Remote and Desktop callers can enqueue the envelope/manifest in
 * their authenticated CAS writer while the user is still editing and reserve the expensive
 * immutable export work for the send/freeze boundary.
 */
export interface CanvasIslandDraftResult {
  envelope: CanvasEnvelope;
  manifest: CanvasManifest;
  theme: CanvasEnvelope["theme"];
}

function setHandle(root: HTMLElement, handle: CanvasEditorHandle | null): void {
  if (handle) handlesByRoot.set(root, handle);
  else handlesByRoot.delete(root);
}

function render(root: HTMLElement, options: CanvasIslandMountOptions): void {
  const reactRoot = roots.get(root) ?? createRoot(root);
  roots.set(root, reactRoot);
  propsByRoot.set(root, options);
  reactRoot.render(
    <CanvasEditor ref={(handle) => setHandle(root, handle)} {...options} />
  );
}

export function mountCanvasIsland(
  root: HTMLElement,
  options: CanvasIslandMountOptions = {}
): () => void {
  render(root, options);
  return () => unmountCanvasIsland(root);
}

export function unmountCanvasIsland(root: HTMLElement): void {
  roots.get(root)?.unmount();
  roots.delete(root);
  propsByRoot.delete(root);
  handlesByRoot.delete(root);
}

/** Caller-driven reconnect reset: the new envelope is kept only in the mounted page memory. */
export function resetCanvasIsland(
  root: HTMLElement,
  envelope: CanvasEnvelope | null
): void {
  const current = propsByRoot.get(root);
  if (!current) return;
  render(root, { ...current, value: envelope });
}

/**
 * Updates the host-owned media seams without persisting anything in browser storage. The
 * normalizer is used for new paste/drop/file input; the resolver is used to reload opaque refs.
 */
export function setCanvasIslandMediaCallbacks(
  root: HTMLElement,
  callbacks: CanvasIslandMediaCallbacks
): void {
  const current = propsByRoot.get(root);
  if (!current) return;
  render(root, { ...current, ...callbacks });
}

/**
 * Capture a sanitized, scene-derived autosave draft without touching the renderer or producing
 * any binary output.  The returned object contains no live `BinaryFiles` or browser persistence
 * handles; asset bytes remain in the caller's page-memory/REST boundary.
 */
export function prepareCanvasIslandDraft(
  root: HTMLElement
): CanvasIslandDraftResult {
  const handle = handlesByRoot.get(root);
  if (!handle) throw new Error("Canvas island is not mounted");
  const sourceEnvelope = handle.getEnvelope();
  const envelope =
    sourceEnvelope ??
    ({
      engine: "@excalidraw/excalidraw",
      engineVersion: "0.18.1",
      schemaVersion: 1,
      revision: 0,
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
    } satisfies CanvasEnvelope);
  return {
    envelope,
    manifest: deriveCanvasManifest(envelope.elements),
    theme: envelope.theme,
  };
}

/** Short named export used by host adapters; the window contract exposes the same method. */
export const prepareDraft = prepareCanvasIslandDraft;

function snapshotFromHandle(handle: CanvasEditorHandle): CanvasSceneSnapshot {
  const snapshot = handle.getSnapshot();
  if (snapshot) return snapshot;
  const envelope = handle.getEnvelope();
  if (!envelope) throw new Error("Canvas island has no scene to freeze");
  return {
    elements: envelope.elements,
    appState: {
      ...envelope.appState,
      zoom: { value: envelope.appState.zoom },
      theme: envelope.theme,
    } as CanvasSceneSnapshot["appState"],
    files: {},
  };
}

/**
 * Captures a deterministic freeze package from the exact live scene. This function performs no
 * upload or host mutation; the caller explicitly decides whether/when to send the returned
 * envelope, manifest, and in-memory PNG blobs to its REST boundary.
 */
export async function prepareCanvasIslandFreeze(
  root: HTMLElement,
  options: CanvasIslandPrepareFreezeOptions = {}
): Promise<CanvasIslandFreezeResult> {
  const handle = handlesByRoot.get(root);
  if (!handle) throw new Error("Canvas island is not mounted");
  const snapshot = snapshotFromHandle(handle);
  const sourceEnvelope = handle.getEnvelope();
  const envelope =
    sourceEnvelope ??
    ({
      engine: "@excalidraw/excalidraw",
      engineVersion: "0.18.1",
      schemaVersion: 1,
      revision: 0,
      theme: "light",
      elements: snapshot.elements,
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
    } satisfies CanvasEnvelope);
  const mountedResolver = propsByRoot.get(root)?.assetResolver;
  const resolver = options.assetResolver ?? mountedResolver;
  const suppliedAssets =
    options.assets ??
    (resolver
      ? (
          await Promise.all(envelope.assetRefs.map((asset) => resolver(asset)))
        ).filter((asset): asset is NormalizedStaticAsset => Boolean(asset))
      : []);
  const hydrated =
    suppliedAssets.length > 0
      ? await rehydrateEnvelope(envelope, suppliedAssets)
      : snapshot;
  const exportBudget = { ...DEFAULT_EXPORT_BUDGET, ...options.budget };
  const pixelPolicy =
    options.policy ?? propsByRoot.get(root)?.freezePolicy ?? "required";
  const freezeEnvelope = sourceEnvelope ?? envelope;
  return {
    envelope: freezeEnvelope,
    manifest: deriveCanvasManifest(freezeEnvelope.elements),
    exports: await exportCanvasPng(
      freezeEnvelope.elements,
      hydrated.appState,
      hydrated.files,
      exportBudget
    ),
    pixelPolicy,
    theme: freezeEnvelope.theme,
  };
}

export interface CanvasIslandGlobal {
  mount: typeof mountCanvasIsland;
  unmount: typeof unmountCanvasIsland;
  reset: typeof resetCanvasIsland;
  setMediaCallbacks: typeof setCanvasIslandMediaCallbacks;
  prepareDraft: typeof prepareCanvasIslandDraft;
  prepareFreeze: typeof prepareCanvasIslandFreeze;
}

const globalContract: CanvasIslandGlobal = {
  mount: mountCanvasIsland,
  unmount: unmountCanvasIsland,
  reset: resetCanvasIsland,
  setMediaCallbacks: setCanvasIslandMediaCallbacks,
  prepareDraft: prepareCanvasIslandDraft,
  prepareFreeze: prepareCanvasIslandFreeze,
};

if (typeof window !== "undefined") {
  window.CodeTwoCanvasIsland = globalContract;
}

export default globalContract;
