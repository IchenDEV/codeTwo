import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  CanvasDraft,
  CanvasExport,
  CanvasPixelPolicy,
  CanvasStaticAsset,
  CanvasSnapshot,
  DocBlock,
  StyleChange,
} from "./bridge";
import {
  CanvasEditor,
  type CanvasEditorHandle,
  type CanvasEnvelope,
  type CanvasSceneSnapshot,
} from "./canvas";
import type { CanvasAssetRef, CanvasTheme, NormalizedStaticAsset } from "./canvas/types";
import { exportCanvasPng } from "./canvas/export";
import type { CanvasMediaInput, NormalizedCanvasMedia } from "./canvas/media";
import { rehydrateEnvelope } from "./canvas/serialize";
import { workspaceReferenceBlock } from "./editor/workspaceReference";
import { SlotCardBlock, slotCardToDocBlocks, type SlotCardProps } from "./editor/slotCard";

/** Props kept on the interactive BlockNote node. Scene JSON is intentionally not emitted by
 * `docToBlocks`; it is only an in-memory editing cache so an inline Canvas can reconnect without
 * putting mutable pixels or engine state in the prompt record. */
export interface CanvasBlockProps {
  id: string;
  revision: number;
  title: string;
  envelope: string;
  pixelPolicy: CanvasPixelPolicy;
  /** Transient delivery feedback used when a frozen history ref is restored for retry. */
  deliveryError?: string;
  deliveryErrorKind?: "provider_image" | "other";
}

export interface CanvasBlockHandle {
  id: string;
  getEnvelope: () => CanvasEnvelope | null;
  getSnapshot: () => CanvasSceneSnapshot | null;
  getAssets: () => readonly CanvasStaticAsset[];
  getPixelPolicy: () => CanvasPixelPolicy;
  freeze: () => Promise<{ snapshot: CanvasSnapshot; exports: readonly CanvasExport[] }>;
  markFrozen: (revision: number) => void;
  setError: (message: string, kind?: "provider_image" | "other") => void;
}

/** The Composer-owned seam for draft persistence and send-time freezing. Keeping this context
 * outside BlockNote's schema lets tests inject a deterministic bridge without changing the block
 * shape or allowing the block to call Tauri directly. */
export interface CanvasBlockRuntime {
  enabled: boolean;
  /**
   * The current Composer color scheme. This is deliberately transient: an editable Canvas uses
   * it for the mounted editor chrome, while readonly/history views continue to use the frozen
   * envelope theme below. It is not part of the BlockNote Canvas props or DocBlock reference.
   */
  theme?: CanvasTheme;
  normalizeMedia: (canvasId: string, input: CanvasMediaInput) => Promise<NormalizedCanvasMedia | null>;
  resolveAsset: (canvasId: string, asset: { ref: string; fileId: string; mimeType: "image/png" | "image/webp" }) => Promise<NormalizedStaticAsset | null>;
  getAssets: (canvasId: string) => readonly CanvasStaticAsset[];
  onAsset: (canvasId: string, asset: CanvasStaticAsset) => void;
  onCanvasActivity: (canvasId: string, nonEmpty: boolean) => void;
  saveDraft: (
    canvasId: string,
    envelope: CanvasEnvelope,
    assets: readonly CanvasStaticAsset[],
  ) => Promise<CanvasDraft>;
  freezeDraft: (
    canvasId: string,
    envelope: CanvasEnvelope,
    assets: readonly CanvasStaticAsset[],
    exports: readonly CanvasExport[],
    pixelPolicy: CanvasPixelPolicy,
  ) => Promise<CanvasSnapshot>;
  onCanvasRemoved: (canvasId: string, nonEmpty: boolean) => void;
  onCanvasRestored: (canvasId: string) => void;
  onCanvasUnmount: (canvasId: string, nonEmpty: boolean) => void;
  onCanvasFrozen: (canvasId: string, revision: number) => void;
  onCanvasDeliveryError: (
    canvasId: string,
    message: string,
    kind?: "provider_image" | "other",
  ) => void;
  register: (handle: CanvasBlockHandle) => () => void;
}

export const CanvasBlockRuntimeContext = createContext<CanvasBlockRuntime | null>(null);

/**
 * Pick the visual theme for a Canvas surface without allowing a live Composer scheme to mutate
 * an immutable snapshot. The runtime scheme is only authoritative for an interactive edit; a
 * readonly or historical surface always retains the theme captured in its envelope.
 */
export function canvasThemeForMode(
  mode: "edit" | "readonly" | "historical",
  runtimeTheme: CanvasTheme | undefined,
  envelopeTheme: CanvasTheme | undefined,
): CanvasTheme {
  if (mode === "edit" && runtimeTheme) return runtimeTheme;
  return envelopeTheme ?? "light";
}

export interface CanvasDraftSaveQueueOptions {
  initialRevision: number;
  save: (envelope: CanvasEnvelope, assets: readonly CanvasStaticAsset[]) => Promise<CanvasDraft>;
  onSaved: (
    draft: CanvasDraft,
    request: CanvasEnvelope,
    isLatest: boolean,
  ) => void;
  onError: (error: Error) => void;
}

/** Serialize CAS autosaves for one live block. A newer scene coalesces behind the in-flight write
 * and is rebased onto the authoritative revision returned by the bridge. */
export class CanvasDraftSaveQueue {
  private pending: { envelope: CanvasEnvelope; assets: readonly CanvasStaticAsset[] } | null = null;
  private running: Promise<void> | null = null;
  private revision: number;
  private failure: Error | null = null;
  private generation = 0;

  constructor(private readonly options: CanvasDraftSaveQueueOptions) {
    this.revision = options.initialRevision;
  }

  get authoritativeRevision(): number {
    return this.revision;
  }

  get lastError(): Error | null {
    return this.failure;
  }

  enqueue(envelope: CanvasEnvelope, assets: readonly CanvasStaticAsset[]): Promise<void> {
    this.pending = { envelope, assets };
    this.generation += 1;
    if (this.running) return this.running;
    const run = this.drain();
    this.running = run;
    return run;
  }

  async flush(): Promise<void> {
    if (!this.running && this.pending) {
      this.enqueue(this.pending.envelope, this.pending.assets);
    }
    if (this.running) await this.running;
    if (this.failure) throw this.failure;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        const request = this.pending;
        const requestGeneration = this.generation;
        this.pending = null;
        try {
          const authoritativeRequest = { ...request.envelope, revision: this.revision };
          const saved = await this.options.save(
            authoritativeRequest,
            request.assets,
          );
          this.revision = saved.revision;
          this.failure = null;
          // A newer local scene may have arrived while this CAS was in flight. In that case
          // update only the authoritative revision; replacing the local envelope with this older
          // acknowledgement would visibly roll the editor back before the queued write rebases.
          this.options.onSaved(saved, authoritativeRequest, requestGeneration === this.generation && !this.pending);
        } catch (cause) {
          const error = cause instanceof Error ? cause : new Error(String(cause));
          this.failure = error;
          this.pending = null;
          this.options.onError(error);
          throw error;
        }
      }
    } finally {
      this.running = null;
    }
  }
}

export function canvasDraftToEnvelope(draft: CanvasDraft): CanvasEnvelope {
  const scene = draft.envelope.scene && typeof draft.envelope.scene === "object"
    ? (draft.envelope.scene as Record<string, unknown>)
    : {};
  const elements = Array.isArray(scene.elements) ? scene.elements : [];
  const appState = scene.appState && typeof scene.appState === "object" ? scene.appState : {};
  return {
    engine: "@excalidraw/excalidraw",
    engineVersion: "0.18.1",
    schemaVersion: 1,
    revision: draft.revision,
    theme: draft.theme === "dark" ? "dark" : "light",
    elements: elements as CanvasEnvelope["elements"],
    appState: appState as CanvasEnvelope["appState"],
    assetRefs: draft.assets.map((asset) => ({
      ref: asset.id,
      fileId: asset.id,
      mimeType: asset.mimeType === "image/webp" ? "image/webp" : "image/png",
      byteLength: asset.bytes.length,
      width: asset.width,
      height: asset.height,
    })),
  };
}

export function canvasBlockPropsFromDraft(
  draft: CanvasDraft,
  options: Pick<CanvasBlockProps, "pixelPolicy" | "deliveryError" | "deliveryErrorKind"> = { pixelPolicy: "required" },
): CanvasBlockProps {
  return {
    id: draft.id,
    revision: draft.revision,
    title: draft.title || "Canvas",
    envelope: JSON.stringify(canvasDraftToEnvelope(draft)),
    pixelPolicy: options.pixelPolicy,
    deliveryError: options.deliveryError,
    deliveryErrorKind: options.deliveryErrorKind,
  };
}

function readCanvasEnvelope(value: string): CanvasEnvelope | null {
  try {
    const parsed = JSON.parse(value) as CanvasEnvelope;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function blobBytes(blob: Blob): Promise<number[]> {
  return blob.arrayBuffer().then((buffer) => Array.from(new Uint8Array(buffer)));
}

function pngDimensions(bytes: readonly number[]): { width: number; height: number } {
  // PNG stores dimensions in network byte order immediately after the 8-byte signature and
  // 4-byte IHDR length/type. The export module guarantees PNG bytes; retain a conservative
  // fallback for a test stub that only returns a sentinel blob.
  if (bytes.length >= 24 && bytes.slice(0, 8).every((byte, index) => byte === [137, 80, 78, 71, 13, 10, 26, 10][index])) {
    const read = (offset: number) =>
      (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0;
    return { width: Math.max(1, read(16)), height: Math.max(1, read(20)) };
  }
  return { width: 1, height: 1 };
}

function canvasExportsFromPngs(canvasId: string, pngs: Awaited<ReturnType<typeof exportCanvasPng>>): Promise<readonly CanvasExport[]> {
  let detailIndex = 0;
  return Promise.all(pngs.map(async (png) => {
    const bytes = await blobBytes(png.blob);
    const dimensions = pngDimensions(bytes);
    const index = png.kind === "detail" ? detailIndex++ : null;
    return {
      id: `${canvasId}-${png.kind}-${png.kind === "overview" ? "overview" : index}`,
      kind: png.kind,
      index,
      mimeType: "image/png" as const,
      width: dimensions.width,
      height: dimensions.height,
      bytes,
    };
  }));
}

/**
 * Resolve the scene used for send-time export. A collapsed BlockNote node does not keep an
 * Excalidraw instance mounted, so its editor handle can legitimately report an empty snapshot;
 * in that case rehydrate the authoritative envelope and normalized media instead of exporting an
 * empty canvas.
 */
export async function resolveCanvasSnapshotForFreeze(
  envelope: CanvasEnvelope,
  assets: readonly CanvasStaticAsset[],
  live: CanvasSceneSnapshot | null,
): Promise<CanvasSceneSnapshot> {
  if (live && (live.elements.length > 0 || envelope.elements.length === 0)) return live;
  const normalizedAssets = assets.map((asset) => ({
    ref: asset.id,
    fileId: asset.id,
    mimeType: asset.mimeType,
    bytes: new Uint8Array(asset.bytes),
  }));
  return rehydrateEnvelope(envelope, normalizedAssets);
}

// A real inline "skill" node: a first-class document element (not styled text), so a composed
// prompt serializes deterministically into `DocBlock::Skill` with a stable skillId. This is what
// makes "compose a prompt as a document, combine skills inline" work end to end.
export const SkillInline = createReactInlineContentSpec(
  {
    type: "skill",
    propSchema: {
      skillId: { default: "" },
      name: { default: "" },
      icon: { default: "" },
    },
    content: "none",
  } as const,
  {
    render: (props) => (
      <span className="skill-chip" contentEditable={false}>
        {props.inlineContent.props.icon} {props.inlineContent.props.name}
      </span>
    ),
  },
);

// An inline `@file` mention. At compile time the core inlines the file's contents as context,
// so the agent sees the actual code you pointed at (Cursor-style @-mentions).
//
// Named `fileMention`, not `file`: BlockNote ships a `file` *block*, and registering an inline spec
// under the same name made inserting a mention produce an empty "Add file" upload block instead of
// a chip.
export const FileInline = createReactInlineContentSpec(
  {
    type: "fileMention",
    propSchema: {
      path: { default: "" },
    },
    content: "none",
  } as const,
  {
    render: (props) => (
      <span className="file-chip" contentEditable={false}>
        @{props.inlineContent.props.path}
      </span>
    ),
  },
);

// An inline `@chat` mention of a past session. At compile time the core inlines that chat's
// transcript as context, so a planning conversation can be referenced from the document that
// implements it ("we discussed this — here's the discussion").
export const SessionMentionInline = createReactInlineContentSpec(
  {
    type: "sessionMention",
    propSchema: {
      sessionId: { default: "" },
      title: { default: "" },
    },
    content: "none",
  } as const,
  {
    render: (props) => (
      <span className="chat-chip" contentEditable={false}>
        @{props.inlineContent.props.title || props.inlineContent.props.sessionId.slice(0, 8)}
      </span>
    ),
  },
);

// An inline mention of a stored scene-artifact version (R4). The document keeps only the record
// id; docToBlocks emits the `{{artifact:<id>}}` interpolation token, which run_macro-style
// interpolation (and core's `compile_full` for richer flows) resolves into the stored content.
export const ArtifactInline = createReactInlineContentSpec(
  {
    type: "artifactMention",
    propSchema: {
      artifactId: { default: "" },
      title: { default: "" },
      kind: { default: "" },
    },
    content: "none",
  } as const,
  {
    render: (props) => (
      <span className="chat-chip" contentEditable={false}>
        ⌘ {props.inlineContent.props.title || props.inlineContent.props.artifactId}
      </span>
    ),
  },
);

// A browser annotation as a first-class document block, not a paragraph of markdown. The raw
// context text (`**Browser context** — …`) is what the *agent* needs; a person composing a prompt
// around three of them needs a card: where, which element, what was said, what was dialled in.
// The compiled markdown rides along in `context` so serialization stays exact — the card is a
// view of it, never a re-rendering.
export const BrowserNoteBlock = createReactBlockSpec(
  {
    type: "browserNote",
    propSchema: {
      url: { default: "" },
      note: { default: "" },
      selector: { default: "" },
      selectedText: { default: "" },
      /// `StyleChange[]` as JSON — BlockNote props are scalars only.
      styles: { default: "[]" },
      /// The exact markdown block `browser_context` rendered; what the document compiles to.
      context: { default: "" },
    },
    content: "none",
  } as const,
  {
    render: (props) => {
      const { url, note, selector, selectedText, styles } = props.block.props;
      let host = url;
      try {
        host = new URL(url).host || url;
      } catch {
        /* keep as-is */
      }
      let changes: StyleChange[] = [];
      try {
        changes = JSON.parse(styles) as StyleChange[];
      } catch {
        /* corrupt props render as no changes */
      }
      return (
        <div className="bn-annotation" contentEditable={false}>
          <div className="bn-annotation-head">
            <span className="bn-annotation-dot" />
            <span className="bn-annotation-host">{host}</span>
            {selector && <code className="bn-annotation-sel">{selector}</code>}
            <button
              className="bn-annotation-x"
              title="Remove"
              onClick={() => props.editor.removeBlocks([props.block])}
            >
              ×
            </button>
          </div>
          {selectedText && <div className="bn-annotation-quote">“{selectedText}”</div>}
          {note && <div className="bn-annotation-note">{note}</div>}
          {changes.length > 0 && (
            <div className="bn-annotation-styles">
              {changes.map((c) => (
                <span key={c.property} className="bn-annotation-change">
                  <span className="prop">{c.property}</span>
                  <span className="from">{c.from}</span>
                  <span className="arrow">→</span>
                  <span className="to">{c.to}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      );
    },
  },
);

export function CanvasBlockView({
  block,
  editor,
}: {
  block: { props: CanvasBlockProps };
  editor: { updateBlock: (block: unknown, update: unknown) => unknown };
}) {
  const runtime = useContext(CanvasBlockRuntimeContext);
  const id = block.props.id;
  const editorHandle = useRef<CanvasEditorHandle>(null);
  const envelopeRef = useRef<CanvasEnvelope | null>(readCanvasEnvelope(block.props.envelope));
  const assetsRef = useRef(new Map<string, CanvasStaticAsset>(
    (runtime?.getAssets(id) ?? []).map((asset) => [asset.id, asset]),
  ));
  const [envelope, setEnvelope] = useState<CanvasEnvelope | null>(envelopeRef.current);
  const [error, setError] = useState<string | null>(block.props.deliveryError ?? null);
  const [errorKind, setErrorKind] = useState<"provider_image" | "other">(block.props.deliveryErrorKind ?? "other");
  const [frozenRevision, setFrozenRevision] = useState<number | null>(null);
  const pixelPolicy = block.props.pixelPolicy === "structure_only" ? "structure_only" : "required";
  const canvasMode = runtime?.enabled ? "edit" : "readonly";
  const canvasTheme = canvasThemeForMode(canvasMode, runtime?.theme, envelope?.theme);
  const blockRef = useRef(block);
  blockRef.current = block;
  const pixelPolicyRef = useRef(pixelPolicy);
  pixelPolicyRef.current = pixelPolicy;

  const saveQueue = useMemo(() => {
    if (!runtime || !runtime.enabled) return null;
    return new CanvasDraftSaveQueue({
      initialRevision: block.props.revision,
      save: (next, assets) => runtime.saveDraft(id, next, assets),
      onSaved: (saved, request, isLatest) => {
        const savedEnvelope = canvasDraftToEnvelope(saved);
        if (isLatest) {
          envelopeRef.current = savedEnvelope;
          setEnvelope(savedEnvelope);
        }
        try {
          editor.updateBlock(blockRef.current, {
            props: {
              id,
              revision: saved.revision,
              title: saved.title,
              // Keep the newest local scene in BlockNote while an older CAS acknowledgement is
              // being followed by the rebased queue write.
              envelope: JSON.stringify(isLatest ? savedEnvelope : envelopeRef.current ?? request),
              pixelPolicy: pixelPolicyRef.current,
              deliveryError: blockRef.current.props.deliveryError,
              deliveryErrorKind: blockRef.current.props.deliveryErrorKind,
            },
          });
        } catch {
          /* BlockNote may be tearing down during an async autosave. */
        }
      },
      onError: (cause) => {
        setError(cause.message);
        setErrorKind("other");
      },
    });
  }, [editor, id, runtime]);

  useEffect(() => {
    envelopeRef.current = readCanvasEnvelope(block.props.envelope);
    setEnvelope(envelopeRef.current);
  }, [block.props.envelope]);

  useEffect(() => {
    if (block.props.deliveryError) {
      setError(block.props.deliveryError);
      setErrorKind(block.props.deliveryErrorKind ?? "other");
    }
  }, [block.props.deliveryError, block.props.deliveryErrorKind]);

  const enqueueSave = (next: CanvasEnvelope, assets: readonly CanvasStaticAsset[]): Promise<void> => {
    return saveQueue?.enqueue(next, assets) ?? Promise.resolve();
  };

  const flushSaves = async (): Promise<void> => {
    await saveQueue?.flush();
    if (saveQueue?.lastError) throw saveQueue.lastError;
  };

  useEffect(() => {
    if (!runtime || !id) return;
    return runtime.register({
      id,
      getEnvelope: () => envelopeRef.current,
      getSnapshot: () => editorHandle.current?.getSnapshot() ?? null,
      getAssets: () => Array.from(assetsRef.current.values()),
      getPixelPolicy: () => (block.props.pixelPolicy === "structure_only" ? "structure_only" : "required"),
      freeze: async () => {
        await flushSaves();
        const current = envelopeRef.current;
        if (!current) throw new Error("Canvas scene is not ready");
        const authoritative = {
          ...current,
          revision: saveQueue?.authoritativeRevision ?? current.revision,
        };
        const live = editorHandle.current?.getSnapshot() ?? null;
        const snapshot = await resolveCanvasSnapshotForFreeze(
          authoritative,
          Array.from(assetsRef.current.values()),
          live,
        );
        const pngs = await exportCanvasPng(snapshot.elements, snapshot.appState, snapshot.files);
        const exports = await canvasExportsFromPngs(id, pngs);
        if (exports.length === 0) throw new Error("Canvas export produced no pixels");
        const frozen = await runtime.freezeDraft(
          id,
          authoritative,
          Array.from(assetsRef.current.values()),
          exports,
          pixelPolicy,
        );
        setFrozenRevision(frozen.revision);
        runtime.onCanvasFrozen(id, frozen.revision);
        return { snapshot: frozen, exports };
      },
      markFrozen: (revision) => setFrozenRevision(revision),
      setError: (message, kind = "other") => {
        setError(message);
        setErrorKind(kind);
      },
    });
  }, [editor, id, pixelPolicy, runtime]);

  const mediaNormalizer = useMemo(
    () => runtime
      ? (input: CanvasMediaInput) => runtime.normalizeMedia(id, input).then((media) => {
          if (media) {
            const bytes = media.bytes instanceof Uint8Array
              ? Array.from(media.bytes)
              : media.bytes instanceof ArrayBuffer
                ? Array.from(new Uint8Array(media.bytes))
                : undefined;
            if (bytes) {
              const asset: CanvasStaticAsset = {
                id: media.ref,
                mimeType: media.mimeType,
                width: media.width ?? 1,
                height: media.height ?? 1,
                bytes,
              };
              assetsRef.current.set(asset.id, asset);
              runtime.onAsset(id, asset);
            }
          }
          return media;
        })
      : undefined,
    [id, runtime],
  );
  const assetResolver = useMemo(
    () => runtime
      ? (asset: CanvasAssetRef) => {
          const stored = assetsRef.current.get(asset.ref) ?? assetsRef.current.get(asset.fileId);
          if (stored) {
            return Promise.resolve({
              ref: stored.id,
              fileId: stored.id,
              mimeType: stored.mimeType,
              bytes: new Uint8Array(stored.bytes),
            } satisfies NormalizedStaticAsset);
          }
          return runtime.resolveAsset(id, asset).then((resolved) => {
            if (resolved) {
              assetsRef.current.set(resolved.ref, {
                id: resolved.ref,
                mimeType: resolved.mimeType,
                width: asset.width ?? 1,
                height: asset.height ?? 1,
                bytes: resolved.bytes instanceof Uint8Array
                  ? Array.from(resolved.bytes)
                  : resolved.bytes instanceof ArrayBuffer
                    ? Array.from(new Uint8Array(resolved.bytes))
                    : [],
              });
            }
            return resolved;
          });
        }
      : undefined,
    [id, runtime],
  );

  const onChange = (next: CanvasEnvelope) => {
    envelopeRef.current = next;
    setEnvelope(next);
    setError(null);
    setErrorKind("other");
    runtime?.onCanvasActivity(id, next.elements.length > 0);
    try {
      editor.updateBlock(block, {
        props: {
          id,
          revision: next.revision,
          title: block.props.title,
          envelope: JSON.stringify(next),
          pixelPolicy,
          deliveryError: block.props.deliveryError,
          deliveryErrorKind: block.props.deliveryErrorKind,
        },
      });
    } catch {
      /* BlockNote may be tearing down while a delayed Excalidraw change arrives. */
    }
    if (!runtime || !runtime.enabled) return;
    void enqueueSave(next, Array.from(assetsRef.current.values())).catch(() => {
      /* Queue onError has already surfaced the authoritative CAS failure in the block. */
    });
  };

  const useStructureOnly = () => {
    try {
      editor.updateBlock(block, {
        props: { ...block.props, pixelPolicy: "structure_only" },
      });
      setError(null);
      setErrorKind("other");
    } catch {
      setError("Could not select structure-only Canvas delivery");
      setErrorKind("other");
    }
  };

  return (
    <div
      className="canvas-ui-module my-2 min-w-0 bg-fill-quiet p-2"
      data-canvas-block
      data-canvas-id={id}
      data-canvas-theme={canvasTheme}
    >
      <CanvasEditor
        ref={editorHandle}
        value={envelope}
        mode={canvasMode}
        theme={canvasTheme}
        mediaNormalizer={mediaNormalizer}
        assetResolver={assetResolver}
        onChange={onChange}
        onMediaError={(cause) => {
          setError(cause.message);
          setErrorKind("other");
        }}
        name={block.props.title || "Canvas"}
      />
      {frozenRevision !== null ? (
        <p className="mt-1 px-1 text-fine text-muted-foreground" role="status">
          Frozen revision {frozenRevision}
        </p>
      ) : null}
      {error ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-fine text-warning" role="alert">
          <span>{error}</span>
          {pixelPolicy === "required" && errorKind === "provider_image" ? (
            <>
              <button type="button" className="canvas-ui-control bg-fill-hover px-2 py-1 text-ui text-foreground" onClick={useStructureOnly}>
                Send structure only
              </button>
              <button
                type="button"
                className="canvas-ui-control bg-fill-hover px-2 py-1 text-ui text-foreground"
                onClick={() => globalThis.window?.dispatchEvent(new Event("codetwo-open-provider-picker"))}
              >
                Switch provider
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const CanvasBlock = createReactBlockSpec(
  {
    type: "canvas",
    propSchema: {
      id: { default: "" },
      revision: { default: 1 },
      title: { default: "Canvas" },
      envelope: { default: "" },
      pixelPolicy: { default: "required" },
      deliveryError: { default: "" },
      deliveryErrorKind: { default: "other" },
    },
    content: "none",
  } as const,
  {
    render: (props) => <CanvasBlockView block={props.block as unknown as { props: CanvasBlockProps }} editor={props.editor as never} />,
  },
);

// The editor schema = default blocks/inline + our skill/file inline nodes and the annotation block.
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    browserNote: BrowserNoteBlock,
    canvas: CanvasBlock,
    slotCard: SlotCardBlock,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    skill: SkillInline,
    fileMention: FileInline,
    sessionMention: SessionMentionInline,
    artifactMention: ArtifactInline,
  },
});

export type CodeTwoEditor = typeof schema.BlockNoteEditor;

/// Walk the document into neutral `DocBlock`s: contiguous text collapses into text blocks; each
/// inline skill node becomes its own skill block, preserving inline ordering.
export function docToBlocks(editor: CodeTwoEditor): DocBlock[] {
  const out: DocBlock[] = [];
  let buf = "";
  const flush = () => {
    if (buf.trim().length > 0) out.push({ type: "text", text: buf.replace(/\n+$/, "") });
    buf = "";
  };

  for (const block of editor.document) {
    // An annotation block compiles to exactly the markdown the core rendered for it.
    if (block.type === "browserNote") {
      flush();
      const text = String((block.props as { context?: string }).context ?? "");
      if (text.trim()) out.push({ type: "text", text });
      continue;
    }
    if (block.type === "canvas") {
      flush();
      const props = block.props as unknown as CanvasBlockProps;
      if (props.id) {
        out.push({
          type: "canvas",
          id: props.id,
          frozen_revision: Number.isFinite(Number(props.revision)) ? Number(props.revision) : 0,
          pixel_policy: props.pixelPolicy === "structure_only" ? "structure_only" : "required",
        });
      }
      continue;
    }
    if (block.type === "image") {
      flush();
      const props = block.props as { url?: string; name?: string };
      const path = String(props.url ?? props.name ?? "");
      if (path) out.push({ type: "image", path });
      continue;
    }
    // A slot card serializes from its JSON-encoded props: a macro card becomes one skill block
    // with filled params; a brief card becomes the template's prose interleaved with values.
    // Corrupt JSON degrades to empty slots/values rather than dropping the block.
    if (block.type === "slotCard") {
      flush();
      out.push(...slotCardToDocBlocks(block.props as unknown as SlotCardProps));
      continue;
    }
    const content = block.content;
    if (Array.isArray(content)) {
      for (const inline of content as Array<Record<string, unknown>>) {
        if (inline.type === "text") {
          buf += String(inline.text ?? "");
        } else if (inline.type === "skill") {
          flush();
          const props = inline.props as { skillId: string };
          out.push({ type: "skill", skill_id: props.skillId, params: {} });
        } else if (inline.type === "fileMention") {
          flush();
          const props = inline.props as { path: string };
          out.push(workspaceReferenceBlock(props.path));
        } else if (inline.type === "sessionMention") {
          flush();
          const props = inline.props as { sessionId: string };
          out.push({ type: "session", session_id: props.sessionId });
        } else if (inline.type === "artifactMention") {
          flush();
          const props = inline.props as { artifactId: string };
          out.push({ type: "text", text: "{{artifact:" + props.artifactId + "}}" });
        } else if (inline.type === "link") {
          const parts = (inline.content as Array<{ text?: string }> | undefined) ?? [];
          buf += parts.map((c) => c.text ?? "").join("");
        }
      }
    }
    buf += "\n";
  }
  flush();
  return out;
}
