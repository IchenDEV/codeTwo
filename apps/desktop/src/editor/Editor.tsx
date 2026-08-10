import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { filterSuggestionItems, locales } from "@blocknote/core";
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Bot, Server, Sparkles } from "lucide-react";
import {
  CanvasBlockRuntimeContext,
  canvasBlockPropsFromDraft,
  docToBlocks,
  schema,
  type CanvasBlockRuntime,
  type CodeTwoEditor,
} from "../skillInline";
import { FileMenu, type AtItem, type ChatItem, type FileItem } from "./FileMenu";
import {
  listArchivedSessions,
  listFiles,
  listSessions,
  type Annotation,
  type CanvasDraft,
  type CanvasPixelPolicy,
  type DocBlock,
  type SkillInfo,
} from "../bridge";
import { useColorScheme } from "../theme";
import { useT } from "../i18n";

interface EditorProps {
  skills: SkillInfo[];
  /// Working directory used to resolve `@`-file mentions.
  cwd: string;
  /// The session this document sends to — kept out of the `@` chat picker (it's already context).
  sessionId: string | null;
  // App reads the composed document out of the editor on Run.
  getBlocksRef: MutableRefObject<(() => DocBlock[]) | null>;
  // App appends plain text (voice, terminal sends) through this.
  insertTextRef: MutableRefObject<((text: string) => void) | null>;
  // App appends browser annotations through this — as dedicated cards, not markdown paragraphs.
  // `context` is the compiled markdown the block serializes back into.
  insertAnnotationRef: MutableRefObject<((a: Annotation, context: string) => void) | null>;
  // App inserts `@file` mentions (from the file browser) through this.
  insertFileRef: MutableRefObject<((path: string) => void) | null>;
  // App focuses the document (Mod+E) and opens the `/` picker (Mod+/) through these.
  focusRef: MutableRefObject<(() => void) | null>;
  // App empties the document after a successful send.
  clearRef: MutableRefObject<(() => void) | null>;
  openSkillPickerRef: MutableRefObject<(() => void) | null>;
  // Plugin Hub inserts a specific component directly instead of reopening the slash picker.
  insertSkillRef: MutableRefObject<((skill: SkillInfo) => void) | null>;
  /** Composer-owned Canvas insertion/freeze seams. Canvas authoring is hidden when the gate is off. */
  canvasEnabled: boolean;
  canvasRuntime: CanvasBlockRuntime | null;
  createCanvas: () => Promise<CanvasDraft>;
  insertCanvasRef: MutableRefObject<(() => Promise<void>) | null>;
  insertCanvasDraftRef: MutableRefObject<((draft: CanvasDraft, options?: CanvasInsertOptions) => void) | null>;
  restoreCanvasDocumentRef: MutableRefObject<((
    doc: readonly DocBlock[],
    drafts: ReadonlyMap<string, CanvasDraft>,
    options?: CanvasInsertOptions,
  ) => void) | null>;
  freezeCanvasesRef: MutableRefObject<((doc: readonly DocBlock[]) => Promise<DocBlock[]>) | null>;
  /**
   * App-owned rejection seam. The editor routes document Canvas ids through only the live
   * handles it owns, while the wrapped runtime keeps the base persistence/toast callback intact.
   */
  canvasDeliveryErrorRef?: MutableRefObject<((
    doc: readonly DocBlock[],
    message: string,
    kind: "provider_image" | "other",
  ) => void) | null>;
  // Lets the toolbar disable Run — and explain why — while the document is empty.
  onEmptyChange: (empty: boolean) => void;
}

export interface CanvasInsertOptions {
  pixelPolicy?: CanvasPixelPolicy;
  deliveryError?: string;
  deliveryErrorKind?: "provider_image" | "other";
}

// The `/` "Skills" group, built from the live library. Skills auto-discovered from a harness's
// skill directory (~/.claude/skills, .codex/skills, …) carry a `source` and get their own group
// per product. Picking one inserts a real inline skill node either way. Rows all share the
// neutral ✦ glyph — a column of assorted emoji read as noise, and the group label already says
// what a row is; the skill's own icon still shows on the inserted chip.
function skillItems(editor: CodeTwoEditor, skills: SkillInfo[]): DefaultReactSuggestionItem[] {
  return skills.map((s) => {
    const kind = s.kind === "subagent" ? "Subagent" : s.kind === "mcp" ? "MCP" : "Skill";
    const icon =
      s.kind === "subagent" ? <Bot className="size-3.5" /> :
      s.kind === "mcp" ? <Server className="size-3.5" /> :
      <Sparkles className="size-3.5" />;
    return {
      title: `${kind}: ${s.name}`,
      subtext: s.description,
      group: s.source ?? "Code2 components",
      icon,
      onItemClick: () => {
        editor.insertInlineContent([
          { type: "skill", props: { skillId: s.id, name: s.name, icon: s.icon ?? "✦" } },
          " ",
        ]);
      },
    };
  });
}

function canvasSlashItem(onInsert: () => void): DefaultReactSuggestionItem {
  return {
    title: "Canvas",
    subtext: "Draw a structured canvas in this prompt",
    group: "Code2 components",
    icon: <Sparkles className="size-3.5" />,
    onItemClick: () => {
      void onInsert();
    },
  };
}

// The `@` picker: workspace files, searched live and ranked by the core. Picking one inserts a file
// mention whose contents the core inlines at compile time. Drawn by `FileMenu` — the rows carry a
// name, a directory and a matched span rather than one path string, so the shape is ours, not
// BlockNote's default item.
async function fileMenuItems(cwd: string, query: string): Promise<FileItem[]> {
  // 60, not 30: the rows are now compact enough that scrolling a longer list beats being told the
  // file you wanted didn't make the cut.
  const paths = await listFiles(cwd || ".", query, 60).catch(() => []);
  const q = query.toLowerCase();
  return paths.map((path) => {
    const cut = path.lastIndexOf("/");
    const name = cut < 0 ? path : path.slice(cut + 1);
    const at = q ? name.toLowerCase().indexOf(q) : -1;
    return {
      kind: "file" as const,
      path,
      name,
      dir: cut < 0 ? "" : path.slice(0, cut + 1),
      hit: at < 0 ? null : ([at, at + q.length] as [number, number]),
    };
  });
}

// Past chats for the same picker: mentioning one inlines its transcript as context, so a planning
// conversation is citable from the document that implements it. Archived chats are included on
// purpose — mentioning reads a transcript, it doesn't continue the chat, and a finished planning
// conversation is precisely the kind that gets archived. The current session is excluded — the
// agent already has that history. A few recent chats show unprompted; typing filters by title.
async function chatMenuItems(query: string, excludeSession: string | null): Promise<ChatItem[]> {
  const [active, archived] = await Promise.all([
    listSessions().catch(() => []),
    listArchivedSessions().catch(() => []),
  ]);
  const q = query.toLowerCase();
  return [...active, ...archived]
    .sort((a, b) => b.created_at - a.created_at)
    .filter((s) => s.id !== excludeSession && (!q || s.title.toLowerCase().includes(q)))
    .slice(0, q ? 6 : 3)
    .map((s) => ({ kind: "chat" as const, id: s.id, title: s.title, when: s.created_at }));
}

export function DocEditor({
  skills,
  cwd,
  sessionId,
  getBlocksRef,
  insertTextRef,
  insertAnnotationRef,
  insertFileRef,
  focusRef,
  clearRef,
  openSkillPickerRef,
  insertSkillRef,
  canvasEnabled,
  canvasRuntime,
  createCanvas,
  insertCanvasRef,
  insertCanvasDraftRef,
  restoreCanvasDocumentRef,
  freezeCanvasesRef,
  canvasDeliveryErrorRef,
  onEmptyChange,
}: EditorProps) {
  const t = useT();
  // The Composer's color scheme is transient UI state. Keep it outside the Canvas envelope so a
  // live theme change updates mounted editable blocks without rewriting readonly/history data.
  const scheme = useColorScheme();
  // Read once: BlockNote bakes its dictionary in at creation, so a language change needs a remount
  // rather than a re-render. The `key` in App does that.
  const placeholder = t("composer.placeholder");
  // Start empty. A pre-filled sample used to be the first thing every session showed, which meant
  // the user's first act was deleting our text; the placeholder carries the same hint for free.
  const editor = useCreateBlockNote({
    schema,
    initialContent: [{ type: "paragraph", content: "" }],
    dictionary: {
      ...locales.en,
      placeholders: {
        ...locales.en.placeholders,
        default: placeholder,
      },
    },
  });

  const insertCanvasDraft = useCallback((draft: CanvasDraft, options: CanvasInsertOptions = {}) => {
    if (!canvasEnabled) return;
    const last = editor.document[editor.document.length - 1];
    if (!last) return;
    editor.insertBlocks(
      [
        { type: "canvas", props: canvasBlockPropsFromDraft(draft, {
          pixelPolicy: options.pixelPolicy ?? "required",
          deliveryError: options.deliveryError,
          deliveryErrorKind: options.deliveryErrorKind,
        }) },
        { type: "paragraph", content: "" },
      ],
      last,
      "after",
    );
    onEmptyChange(false);
  }, [canvasEnabled, editor, onEmptyChange]);

  const restoreCanvasDocument = useCallback((
    doc: readonly DocBlock[],
    drafts: ReadonlyMap<string, CanvasDraft>,
    options: CanvasInsertOptions = {},
  ) => {
    if (!canvasEnabled) return;
    const blocks = doc.map((block) => {
      switch (block.type) {
        case "text":
          return { type: "paragraph", content: block.text };
        case "canvas": {
          const draft = drafts.get(block.id);
          if (!draft) throw new Error(`Canvas retry draft ${block.id} is missing`);
          return {
            type: "canvas",
            props: canvasBlockPropsFromDraft(draft, {
              pixelPolicy: block.pixel_policy ?? "required",
              deliveryError: options.deliveryError,
              deliveryErrorKind: options.deliveryErrorKind,
            }),
          };
        }
        case "skill":
          return {
            type: "paragraph",
            content: [{ type: "skill", props: { skillId: block.skill_id, name: block.skill_id, icon: "✦" } }, " "],
          };
        case "file":
          return {
            type: "paragraph",
            content: [{ type: "fileMention", props: { path: block.path } }, " "],
          };
        case "image":
          return {
            type: "image",
            props: {
              url: block.path,
              name: block.path,
              caption: "",
              showPreview: true,
            },
          };
        case "session":
          return {
            type: "paragraph",
            content: [{ type: "sessionMention", props: { sessionId: block.session_id } }, " "],
          };
      }
    });
    const currentHasContent = docToBlocks(editor).length > 0;
    // If the user typed after the accepted turn, append the recovered prompt to preserve that
    // newer content. There is deliberately no synthetic separator block: every visible block
    // must remain part of the exact prompt rather than silently mutating it with a UI label.
    const recovered = [...blocks, { type: "paragraph", content: "" }] as never;
    if (currentHasContent) {
      const anchor = editor.document[editor.document.length - 1];
      if (anchor) editor.insertBlocks(recovered, anchor, "after");
    } else {
      editor.replaceBlocks(editor.document, recovered);
    }
    onEmptyChange(doc.length === 0);
  }, [canvasEnabled, editor, onEmptyChange]);

  const canvasHandles = useRef(new Map<string, import("../skillInline").CanvasBlockHandle>());
  const previousCanvasIds = useRef(new Set<string>());
  const nonEmptyCanvasIds = useRef(new Set<string>());
  const tombstonedCanvasIds = useRef(new Set<string>());

  // The Composer owns persistence, while the editor owns the live BlockNote node handles needed
  // for a send-time freeze. Wrap the runtime registration so those handles stay scoped to this
  // editor instance and are removed when a block unmounts.
  const editorCanvasRuntime = useMemo<CanvasBlockRuntime | null>(() => {
    if (!canvasRuntime) return null;
    return {
      ...canvasRuntime,
      theme: scheme,
      onCanvasActivity: (id, nonEmpty) => {
        if (nonEmpty) nonEmptyCanvasIds.current.add(id);
        else nonEmptyCanvasIds.current.delete(id);
        canvasRuntime.onCanvasActivity(id, nonEmpty);
      },
      onCanvasDeliveryError: (id, message, kind) => {
        canvasHandles.current.get(id)?.setError(message, kind);
        canvasRuntime.onCanvasDeliveryError(id, message, kind);
      },
      register: (handle) => {
        canvasHandles.current.set(handle.id, handle);
        const dispose = canvasRuntime.register(handle);
        return () => {
          canvasHandles.current.delete(handle.id);
          dispose();
        };
      },
    };
  }, [canvasRuntime, scheme]);

  // A provider rejection can arrive before TurnStarted (or directly from submit), after the
  // Composer's document is still live. Keep the recovery non-destructive: route only the ids in
  // that submitted document to matching mounted handles. The wrapped runtime callback still owns
  // its base toast/telemetry behavior and is invoked exactly once per matching id.
  const routeCanvasDeliveryError = useCallback((
    doc: readonly DocBlock[],
    message: string,
    kind: "provider_image" | "other",
  ) => {
    if (!editorCanvasRuntime) return;
    for (const block of doc) {
      if (block.type === "canvas") {
        editorCanvasRuntime.onCanvasDeliveryError(block.id, message, kind);
      }
    }
  }, [editorCanvasRuntime]);

  useEffect(() => {
    if (!canvasDeliveryErrorRef) return;
    canvasDeliveryErrorRef.current = routeCanvasDeliveryError;
    return () => {
      if (canvasDeliveryErrorRef.current === routeCanvasDeliveryError) {
        canvasDeliveryErrorRef.current = null;
      }
    };
  }, [canvasDeliveryErrorRef, routeCanvasDeliveryError]);

  const observeDocument = useCallback(() => {
    const currentIds = new Set<string>();
    for (const block of editor.document) {
      if (block.type !== "canvas") continue;
      const props = block.props as { id?: string };
      if (props.id) currentIds.add(props.id);
    }
    for (const id of previousCanvasIds.current) {
      if (currentIds.has(id)) {
        if (tombstonedCanvasIds.current.has(id)) {
          tombstonedCanvasIds.current.delete(id);
          editorCanvasRuntime?.onCanvasRestored(id);
        }
        continue;
      }
      const nonEmpty = nonEmptyCanvasIds.current.has(id);
      tombstonedCanvasIds.current.add(id);
      editorCanvasRuntime?.onCanvasRemoved(id, nonEmpty);
    }
    // Undo commonly re-inserts a block after the previous document snapshot no longer contains
    // its id. Detect that transition explicitly so the core tombstone is restored instead of
    // leaving the live draft hidden behind a locally stale tombstone set.
    for (const id of currentIds) {
      if (!previousCanvasIds.current.has(id) && tombstonedCanvasIds.current.has(id)) {
        tombstonedCanvasIds.current.delete(id);
        editorCanvasRuntime?.onCanvasRestored(id);
      }
    }
    previousCanvasIds.current = currentIds;
    onEmptyChange(docToBlocks(editor).length === 0);
  }, [editor, editorCanvasRuntime, onEmptyChange]);

  useEffect(() => {
    getBlocksRef.current = () => docToBlocks(editor);
    insertTextRef.current = (text: string) => {
      const doc = editor.document;
      const last = doc[doc.length - 1];
      if (last) {
        editor.insertBlocks([{ type: "paragraph", content: text }], last, "after");
      }
    };
    insertAnnotationRef.current = (a: Annotation, context: string) => {
      const doc = editor.document;
      const last = doc[doc.length - 1];
      if (!last) return;
      editor.insertBlocks(
        [
          {
            type: "browserNote",
            props: {
              url: a.url,
              note: a.note,
              selector: a.selector ?? "",
              selectedText: a.selected_text ?? "",
              styles: JSON.stringify(a.styles),
              context,
            },
          },
        ],
        last,
        "after",
      );
      onEmptyChange(false);
    };
    insertFileRef.current = (path: string) => {
      editor.insertInlineContent([{ type: "fileMention", props: { path } }, " "]);
    };
    focusRef.current = () => editor.focus();
    clearRef.current = () => {
      // Replace every block with one empty paragraph. Removing them all leaves BlockNote with no
      // block to put a cursor in.
      editor.replaceBlocks(editor.document, [{ type: "paragraph", content: "" }]);
      onEmptyChange(true);
    };
    openSkillPickerRef.current = () => {
      editor.focus();
      editor.openSuggestionMenu("/");
    };
    insertSkillRef.current = (skill: SkillInfo) => {
      editor.focus();
      editor.insertInlineContent([
        { type: "skill", props: { skillId: skill.id, name: skill.name, icon: skill.icon ?? "✦" } },
        " ",
      ]);
      onEmptyChange(false);
    };
    insertCanvasDraftRef.current = insertCanvasDraft;
    restoreCanvasDocumentRef.current = restoreCanvasDocument;
    insertCanvasRef.current = async () => {
      if (!canvasEnabled) return;
      const draft = await createCanvas();
      insertCanvasDraft(draft);
    };
    freezeCanvasesRef.current = async (doc) => {
      const frozen = new Map<string, number>();
      for (const block of editor.document) {
        if (block.type !== "canvas") continue;
        const id = String((block.props as { id?: string }).id ?? "");
        if (!id) continue;
        const handle = canvasHandles.current.get(id);
        if (!handle) throw new Error(`Canvas ${id} is not ready`);
        const result = await handle.freeze();
        frozen.set(id, result.snapshot.revision);
      }
      return doc.map((block) =>
        block.type === "canvas" && frozen.has(block.id)
          ? { ...block, frozen_revision: frozen.get(block.id)! }
          : block,
      );
    };
    return () => {
      for (const id of new Set([...previousCanvasIds.current, ...tombstonedCanvasIds.current])) {
        editorCanvasRuntime?.onCanvasUnmount(id, nonEmptyCanvasIds.current.has(id));
      }
      getBlocksRef.current = null;
      insertTextRef.current = null;
      insertAnnotationRef.current = null;
      insertFileRef.current = null;
      focusRef.current = null;
      clearRef.current = null;
      openSkillPickerRef.current = null;
      insertSkillRef.current = null;
      insertCanvasRef.current = null;
      insertCanvasDraftRef.current = null;
      restoreCanvasDocumentRef.current = null;
      freezeCanvasesRef.current = null;
    };
  }, [canvasEnabled, createCanvas, editor, editorCanvasRuntime, freezeCanvasesRef, getBlocksRef, insertAnnotationRef, insertCanvasDraft, insertCanvasDraftRef, insertCanvasRef, restoreCanvasDocument, restoreCanvasDocumentRef, insertFileRef, focusRef, clearRef, openSkillPickerRef, insertSkillRef, onEmptyChange]);

  useEffect(() => {
    observeDocument();
  }, [observeDocument]);

  const getAtItems = async (query: string): Promise<AtItem[]> => {
    const [chats, files] = await Promise.all([
      chatMenuItems(query, sessionId),
      fileMenuItems(cwd, query),
    ]);
    return [...chats, ...files];
  };

  return (
    <CanvasBlockRuntimeContext.Provider value={editorCanvasRuntime}>
      <BlockNoteView
        editor={editor}
        slashMenu={false}
        theme={scheme}
        onChange={observeDocument}
      >
        <SuggestionMenuController
          triggerCharacter={"/"}
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...skillItems(editor, skills),
                ...(canvasEnabled ? [canvasSlashItem(() => insertCanvasRef.current?.() ?? Promise.resolve())] : []),
                // Drop the media blocks: they need an upload handler this app doesn't configure, so
                // they insert an "Add file" placeholder that can never be filled and never reaches
                // the compiled prompt. Use `@` for files instead.
                ...getDefaultReactSlashMenuItems(editor).filter(
                  (i) => !["Image", "Video", "Audio", "File"].includes(i.title),
                ),
              ],
              query,
            )
          }
        />
        {/* `@` mentions workspace files and past chats — file contents and chat transcripts are
            inlined into the compiled prompt. */}
        {/* The type argument is explicit because the controller infers its item type from `getItems`,
            and an inline lambda lets it fall back to BlockNote's default item instead. */}
        <SuggestionMenuController<typeof getAtItems>
          triggerCharacter={"@"}
          getItems={getAtItems}
          suggestionMenuComponent={FileMenu}
          onItemClick={(item) => {
            editor.insertInlineContent([
              item.kind === "chat"
                ? { type: "sessionMention", props: { sessionId: item.id, title: item.title } }
                : { type: "fileMention", props: { path: item.path } },
              " ",
            ]);
          }}
        />
      </BlockNoteView>
    </CanvasBlockRuntimeContext.Provider>
  );
}
