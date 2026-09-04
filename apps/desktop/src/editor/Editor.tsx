import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import type { DefaultReactSuggestionItem } from "@blocknote/react";
import { filterSuggestionItems, locales } from "@blocknote/core";
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { Bot, Server, Sparkles } from "@/components/ui/icons";
import {
  CanvasBlockRuntimeContext,
  canvasBlockPropsFromDraft,
  docToBlocks,
  schema,
} from "../skillInline";
import type { CanvasBlockRuntime, CodeTwoEditor } from "../skillInline";
import { FileMenu } from "./FileMenu";
import type { AtItem, ChatItem, FileItem } from "./FileMenu";
import {
  focusSlotCardField,
  normalizeSlots,
  unfilledRequiredSlots,
} from "./slotCard";
import { issueContextMarkdown } from "./issueBlock";
import { orderSkillsForScene } from "../session/scene";
import type { SceneInfo } from "../session/scene";
import {
  listArchivedSessions,
  listFiles,
  listSessions,
  listSceneArtifacts,
} from "../bridge";
import type {
  Annotation,
  CanvasDraft,
  CanvasPixelPolicy,
  DocumentBlock,
  Issue,
  SkillInfo,
} from "../bridge";
import { useColorScheme } from "../theme";
import { useT } from "../i18n";

interface EditorProps {
  readonly skills: SkillInfo[];
  /// Working directory used to resolve `@`-file mentions.
  readonly cwd: string;
  /// The session this document sends to — kept out of the `@` chat picker (it's already context).
  readonly sessionId: string | null;
  // App reads the composed document out of the editor on Run.
  readonly getBlocksRef: MutableRefObject<(() => DocumentBlock[]) | null>;
  // App appends plain text (voice, terminal sends) through this.
  readonly insertTextRef: MutableRefObject<((text: string) => void) | null>;
  // App appends browser annotations through this — as dedicated cards, not markdown paragraphs.
  // `context` is the compiled markdown the block serializes back into.
  readonly insertAnnotationRef: MutableRefObject<
    ((a: Annotation, context: string) => void) | null
  >;
  // App inserts `@file` mentions (from the file browser) through this.
  readonly insertFileRef: MutableRefObject<((path: string) => void) | null>;
  // A transcript branch prepends a bounded past-chat mention to the new task draft.
  readonly insertSessionRef?: MutableRefObject<
    | ((session: { id: string; title: string; throughSeq: number }) => void)
    | null
  >;
  // App focuses the document (Mod+E) and opens the `/` picker (Mod+/) through these.
  readonly focusRef: MutableRefObject<(() => void) | null>;
  // App empties the document after a successful send.
  readonly clearRef: MutableRefObject<(() => void) | null>;
  // App opens a turn's plan as a document (R4): markdown is parsed into BlockNote blocks and
  // either replaces the document or is appended after it.
  readonly insertMarkdownRef?: MutableRefObject<
    ((markdown: string, mode: "replace" | "append") => Promise<void>) | null
  >;
  readonly openSkillPickerRef: MutableRefObject<(() => void) | null>;
  // Active scene's skill palette: pinned skills lead the `/` picker; with suppress_unpinned the
  // rest hide behind a "show all" row (always reachable, per docs/reference/scenes.md).
  readonly sceneSkills?: { pinned: string[]; suppressUnpinned: boolean } | null;
  // Plugin Hub inserts a specific component directly instead of reopening the slash picker.
  readonly insertSkillRef: MutableRefObject<
    ((skill: SkillInfo) => void) | null
  >;
  // Composer inserts the active scene's brief as a slot card at the document top (R5); R11 may
  // pass model-structured values to pre-fill the fields.
  readonly insertBriefRef?: MutableRefObject<
    ((scene: SceneInfo, values?: Record<string, string>) => void) | null
  >;
  // App inserts an issue reference (R12) as a dedicated card — `context` is the compiled
  // `issueContext()` markdown the block serializes back into; `delegatedScene` is provenance.
  readonly insertIssueRef?: MutableRefObject<
    ((issue: Issue, context: string, delegatedScene?: string) => void) | null
  >;
  /**
  Composer-owned Canvas insertion/freeze seams. Canvas authoring is hidden when the gate is off.
  */
  readonly canvasEnabled: boolean;
  readonly canvasRuntime: CanvasBlockRuntime | null;
  readonly createCanvas: () => Promise<CanvasDraft>;
  readonly insertCanvasRef: MutableRefObject<(() => Promise<void>) | null>;
  readonly insertCanvasDraftRef: MutableRefObject<
    ((draft: CanvasDraft, options?: CanvasInsertOptions) => void) | null
  >;
  readonly restoreCanvasDocumentRef: MutableRefObject<
    | ((
        doc: readonly DocumentBlock[],
        drafts: ReadonlyMap<string, CanvasDraft>,
        options?: CanvasInsertOptions
      ) => void)
    | null
  >;
  readonly freezeCanvasesRef: MutableRefObject<
    ((doc: readonly DocumentBlock[]) => Promise<DocumentBlock[]>) | null
  >;
  /**
   * App-owned rejection seam. The editor routes document Canvas ids through only the live
   * handles it owns, while the wrapped runtime keeps the base persistence/toast callback intact.
   */
  readonly canvasDeliveryErrorRef?: MutableRefObject<
    | ((
        doc: readonly DocumentBlock[],
        message: string,
        kind: "provider_image" | "other"
      ) => void)
    | null
  >;
  /**
  App-owned image intake. Text and other clipboard payloads remain BlockNote's responsibility.
  */
  readonly onPasteImages?: (files: readonly File[]) => void | Promise<void>;
  // Lets the toolbar disable Run — and explain why — while the document is empty.
  readonly onEmptyChange: (isEmpty: boolean) => void;
  /**
  Canonical editor snapshot for versioned per-project/per-session draft persistence.
  */
  readonly onDocumentChange?: (doc: DocumentBlock[]) => void;
}

export interface CanvasInsertOptions {
  pixelPolicy?: CanvasPixelPolicy;
  deliveryError?: string;
  deliveryErrorKind?: "provider_image" | "other";
  /**
  Retry recovery appends; scope navigation replaces the one mounted editor atomically.
  */
  mode?: "append" | "replace";
}

// The `/` "Skills" group, built from the live library. Skills auto-discovered from a harness's
// skill directory (~/.claude/skills, .codex/skills, …) carry a `source` and get their own group
// per product. Picking one inserts a real inline skill node either way. Rows all share the
// neutral ✦ glyph — a column of assorted emoji read as noise, and the group label already says
// what a row is; the skill's own icon still shows on the inserted chip.
function skillItems(
  editor: CodeTwoEditor,
  skills: SkillInfo[]
): DefaultReactSuggestionItem[] {
  return skills.map((s) => {
    const kind =
      s.kind === "subagent" ? "Subagent" : s.kind === "mcp" ? "MCP" : "Skill";
    const icon =
      s.kind === "subagent" ? (
        <Bot className="size-3.5" />
      ) : s.kind === "mcp" ? (
        <Server className="size-3.5" />
      ) : (
        <Sparkles className="size-3.5" />
      );
    return {
      group: s.source ?? "C2 components",
      icon,
      onItemClick: () => {
        // A macro with slot metadata gets the parameterized card (R1); everything else — and a
        // legacy macro without metadata — keeps the inline chip.
        if (s.macro_slots !== null && s.macro_slots !== undefined) {
          insertSlotCardForSkill(editor, s);
          return;
        }
        editor.insertInlineContent([
          {
            props: { icon: s.icon ?? "✦", name: s.name, skillId: s.id },
            type: "skill",
          },
          " ",
        ]);
      },
      subtext: s.description,
      title: `${kind}: ${s.name}`,
    };
  });
}

function sceneSkillItems(
  editor: CodeTwoEditor,
  skills: SkillInfo[],
  sceneSkills: { pinned: string[]; suppressUnpinned: boolean } | null,
  showAllRef: MutableRefObject<boolean>
): DefaultReactSuggestionItem[] {
  const scene = sceneSkills
    ? ({
        skills: {
          pinned: sceneSkills.pinned,
          suppress_unpinned: sceneSkills.suppressUnpinned,
        },
      } as never)
    : null;
  const { items, hiddenCount } = orderSkillsForScene(
    skills,
    scene,
    showAllRef.current
  );
  const pinnedSet = new Set(sceneSkills?.pinned ?? []);
  const rendered = skillItems(editor, items).map((item, index) =>
    pinnedSet.has(items[index].id) ? { ...item, group: "Scene" } : item
  );
  if (hiddenCount > 0) {
    rendered.push({
      group: "Scene",
      icon: <Sparkles className="size-3.5" />,
      onItemClick: () => {
        showAllRef.current = true;
        setTimeout(() => editor.openSuggestionMenu("/"), 0);
      },
      subtext: "The active scene focuses the picker on its pinned skills.",
      title: `Show all skills (${hiddenCount} more)`,
    });
  }
  return rendered;
}

function freshSlotCardId(): string {
  return `slotcard-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}

function insertSlotCardForSkill(editor: CodeTwoEditor, skill: SkillInfo): void {
  const anchor =
    editor.getTextCursorPosition().block ??
    editor.document[editor.document.length - 1];
  if (!anchor) {
    return;
  }
  const id = freshSlotCardId();
  editor.insertBlocks(
    [
      {
        id,
        props: {
          icon: skill.icon ?? "",
          mode: "macro",
          skillId: skill.id,
          slots: JSON.stringify(normalizeSlots(skill.macro_slots ?? [])),
          template: skill.macro_template ?? "",
          title: skill.name,
          values: "{}",
        },
        type: "slotCard",
      },
      { content: "", type: "paragraph" },
    ],
    anchor,
    "after"
  );
  focusSlotCardField(id);
}

function canvasSlashItem(onInsert: () => void): DefaultReactSuggestionItem {
  return {
    group: "C2 components",
    icon: <Sparkles className="size-3.5" />,
    onItemClick: () => {
      void onInsert();
    },
    subtext: "Draw a structured canvas in this prompt",
    title: "Canvas",
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
      dir: cut < 0 ? "" : path.slice(0, cut + 1),
      hit: at < 0 ? null : ([at, at + q.length] as [number, number]),
      kind: "file" as const,
      name,
      path,
    };
  });
}

// Past chats for the same picker: mentioning one inlines its transcript as context, so a planning
// conversation is citable from the document that implements it. Archived chats are included on
// purpose — mentioning reads a transcript, it doesn't continue the chat, and a finished planning
// conversation is precisely the kind that gets archived. The current session is excluded — the
// agent already has that history. A few recent chats show unprompted; typing filters by title.
async function chatMenuItems(
  query: string,
  excludeSession: string | null
): Promise<ChatItem[]> {
  const [active, archived] = await Promise.all([
    listSessions().catch(() => []),
    listArchivedSessions().catch(() => []),
  ]);
  const q = query.toLowerCase();
  return [...active, ...archived]
    .sort(
      (a, b) =>
        (b.last_active_at ?? b.created_at) - (a.last_active_at ?? a.created_at)
    )
    .filter(
      (s) =>
        s.id !== excludeSession && (!q || s.title.toLowerCase().includes(q))
    )
    .slice(0, q ? 6 : 3)
    .map((s) => ({
      id: s.id,
      kind: "chat" as const,
      title: s.title,
      when: s.created_at,
    }));
}

export const DocEditor = ({
  skills,
  cwd,
  sessionId,
  getBlocksRef,
  insertTextRef,
  insertAnnotationRef,
  insertFileRef,
  insertSessionRef,
  focusRef,
  clearRef,
  insertMarkdownRef,
  openSkillPickerRef,
  sceneSkills = null,
  insertSkillRef,
  insertBriefRef,
  insertIssueRef,
  canvasEnabled,
  canvasRuntime,
  createCanvas,
  insertCanvasRef,
  insertCanvasDraftRef,
  restoreCanvasDocumentRef,
  freezeCanvasesRef,
  canvasDeliveryErrorRef,
  onPasteImages,
  onEmptyChange,
  onDocumentChange,
}: EditorProps) => {
  // Sticky within the session: once expanded, the picker stays un-suppressed.
  const showAllSkillsRef = useRef(false);
  const t = useT();
  const editorRootRef = useRef<HTMLDivElement>(null);
  // The Composer's color scheme is transient UI state. Keep it outside the Canvas envelope so a
  // live theme change updates mounted editable blocks without rewriting readonly/history data.
  const scheme = useColorScheme();
  // Read once: BlockNote bakes its dictionary in at creation, so a language change needs a remount
  // rather than a re-render. The `key` in App does that.
  const placeholder = t("composer.placeholder");
  // Start empty. A pre-filled sample used to be the first thing every session showed, which meant
  // the user's first act was deleting our text; the placeholder carries the same hint for free.
  const editor = useCreateBlockNote({
    dictionary: {
      ...locales.en,
      placeholders: {
        ...locales.en.placeholders,
        default: placeholder,
      },
    },
    initialContent: [{ content: "", type: "paragraph" }],
    schema,
  });

  useEffect(() => {
    const editable =
      editorRootRef.current?.querySelector<HTMLElement>(".ProseMirror");
    if (!editable) {
      return;
    }
    editable.setAttribute("role", "textbox");
    editable.setAttribute("aria-label", t("composer.documentInput"));
    editable.setAttribute("aria-multiline", "true");
  }, [t]);

  const insertCanvasDraft = (
    draft: CanvasDraft,
    options: CanvasInsertOptions = {}
  ) => {
    if (!canvasEnabled) {
      return;
    }
    const last = editor.document[editor.document.length - 1];
    if (!last) {
      return;
    }
    editor.insertBlocks(
      [
        {
          props: canvasBlockPropsFromDraft(draft, {
            deliveryError: options.deliveryError,
            deliveryErrorKind: options.deliveryErrorKind,
            pixelPolicy: options.pixelPolicy ?? "required",
          }),
          type: "canvas",
        },
        { content: "", type: "paragraph" },
      ],
      last,
      "after"
    );
    onEmptyChange(false);
  };

  const restoreCanvasDocument = (
    doc: readonly DocumentBlock[],
    drafts: ReadonlyMap<string, CanvasDraft>,
    options: CanvasInsertOptions = {}
  ) => {
    if (!canvasEnabled && doc.some((block) => block.type === "canvas")) {
      throw new Error(
        "Canvas drafts cannot be restored while Canvas is disabled"
      );
    }
    const blocks = doc.flatMap<unknown>((block) => {
      switch (block.type) {
        case "text": {
          return [{ content: block.text, type: "paragraph" }];
        }
        case "canvas": {
          const draft = drafts.get(block.id);
          if (!draft) {
            throw new Error(`Canvas retry draft ${block.id} is missing`);
          }
          return [
            {
              props: canvasBlockPropsFromDraft(draft, {
                deliveryError: options.deliveryError,
                deliveryErrorKind: options.deliveryErrorKind,
                pixelPolicy: block.pixel_policy ?? "required",
              }),
              type: "canvas",
            },
          ];
        }
        case "skill": {
          const skill = skills.find(
            (candidate) => candidate.id === block.skill_id
          );
          if (skill?.macro_template && Object.keys(block.params).length > 0) {
            return [
              {
                props: {
                  icon: skill.icon ?? "",
                  mode: "macro",
                  skillId: block.skill_id,
                  slots: JSON.stringify(
                    normalizeSlots(skill.macro_slots ?? [])
                  ),
                  template: skill.macro_template,
                  title: skill.name,
                  values: JSON.stringify(block.params),
                },
                type: "slotCard",
              },
            ];
          }
          return [
            {
              content: [
                {
                  props: {
                    icon: skill?.icon ?? "✦",
                    name: skill?.name ?? block.skill_id,
                    skillId: block.skill_id,
                  },
                  type: "skill",
                },
                " ",
              ],
              type: "paragraph",
            },
          ];
        }
        case "file": {
          return [
            {
              content: [
                { props: { path: block.path }, type: "fileMention" },
                " ",
              ],
              type: "paragraph",
            },
          ];
        }
        case "image": {
          return [
            {
              props: {
                caption: "",
                name: block.path,
                showPreview: true,
                url: block.path,
              },
              type: "image",
            },
          ];
        }
        case "appshot":
        case "attachment": {
          // Private prompt images live in the Composer attachment strip, not BlockNote.
          return [];
        }
        case "session": {
          return [
            {
              content: [
                {
                  props: {
                    sessionId: block.session_id,
                    throughSeq: block.through_seq ?? 0,
                  },
                  type: "sessionMention",
                },
                " ",
              ],
              type: "paragraph",
            },
          ];
        }
        case "issue": {
          // Rebuild the embedded context the same way the core compile arm does (state "open"),
          // so a recovered issue card serializes back to the identical `DocumentBlock::Issue`.
          return [
            {
              props: {
                context: issueContextMarkdown(block),
                delegatedScene: "",
                issueId: block.id,
                source: block.source,
                state: "open",
                title: block.title,
                url: block.url,
              },
              type: "issueRef",
            },
          ];
        }
      }
    });
    // If the user typed after the accepted turn, append the recovered prompt to preserve that
    // newer content. There is deliberately no synthetic separator block: every visible block
    // must remain part of the exact prompt rather than silently mutating it with a UI label.
    const recovered = [...blocks, { content: "", type: "paragraph" }] as never;
    if (options.mode !== "replace" && docToBlocks(editor).length > 0) {
      const anchor = editor.document[editor.document.length - 1];
      if (anchor) {
        editor.insertBlocks(recovered, anchor, "after");
      }
    } else {
      editor.replaceBlocks(editor.document, recovered);
    }
    const restored = docToBlocks(editor);
    onEmptyChange(restored.length === 0);
    onDocumentChange?.(restored);
  };

  const canvasHandles = useRef(
    new Map<string, import("../skillInline").CanvasBlockHandle>()
  );
  const lastRequiredKey = useRef<string>("");
  const previousCanvasIds = useRef(new Set<string>());
  const nonEmptyCanvasIds = useRef(new Set<string>());
  const tombstonedCanvasIds = useRef(new Set<string>());

  // The Composer owns persistence, while the editor owns the live BlockNote node handles needed
  // for a send-time freeze. Wrap the runtime registration so those handles stay scoped to this
  // editor instance and are removed when a block unmounts.
  const editorCanvasRuntime: CanvasBlockRuntime | null = (() => {
    if (!canvasRuntime) {
      return null;
    }
    return {
      ...canvasRuntime,
      onCanvasActivity: (id, nonEmpty) => {
        if (nonEmpty) {
          nonEmptyCanvasIds.current.add(id);
        } else {
          nonEmptyCanvasIds.current.delete(id);
        }
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
      theme: scheme,
    };
  })();

  // A provider rejection can arrive before TurnStarted (or directly from submit), after the
  // Composer's document is still live. Keep the recovery non-destructive: route only the ids in
  // that submitted document to matching mounted handles. The wrapped runtime callback still owns
  // its base toast/telemetry behavior and is invoked exactly once per matching id.
  const routeCanvasDeliveryError = (
    doc: readonly DocumentBlock[],
    message: string,
    kind: "provider_image" | "other"
  ) => {
    if (!editorCanvasRuntime) {
      return;
    }
    for (const block of doc) {
      if (block.type === "canvas") {
        editorCanvasRuntime.onCanvasDeliveryError(block.id, message, kind);
      }
    }
  };

  useEffect(() => {
    if (!canvasDeliveryErrorRef) {
      return;
    }
    canvasDeliveryErrorRef.current = routeCanvasDeliveryError;
    return () => {
      if (canvasDeliveryErrorRef.current === routeCanvasDeliveryError) {
        canvasDeliveryErrorRef.current = null;
      }
    };
  }, [canvasDeliveryErrorRef, routeCanvasDeliveryError]);

  const observeDocument = () => {
    const currentIds = new Set<string>();
    for (const block of editor.document) {
      if (block.type !== "canvas") {
        continue;
      }
      const props = block.props as { id?: string };
      if (props.id) {
        currentIds.add(props.id);
      }
    }
    for (const id of previousCanvasIds.current) {
      if (currentIds.has(id)) {
        if (tombstonedCanvasIds.current.has(id)) {
          tombstonedCanvasIds.current.delete(id);
          editorCanvasRuntime?.onCanvasRestored(id);
        }
        continue;
      }
      const isNonEmpty = nonEmptyCanvasIds.current.has(id);
      tombstonedCanvasIds.current.add(id);
      editorCanvasRuntime?.onCanvasRemoved(id, isNonEmpty);
    }
    // Undo commonly re-inserts a block after the previous document snapshot no longer contains
    // its id. Detect that transition explicitly so the core tombstone is restored instead of
    // leaving the live draft hidden behind a locally stale tombstone set.
    for (const id of currentIds) {
      if (
        !previousCanvasIds.current.has(id) &&
        tombstonedCanvasIds.current.has(id)
      ) {
        tombstonedCanvasIds.current.delete(id);
        editorCanvasRuntime?.onCanvasRestored(id);
      }
    }
    previousCanvasIds.current = currentIds;
    const doc = docToBlocks(editor);
    onEmptyChange(doc.length === 0);
    onDocumentChange?.(doc);
    // Composer's Run-row hint listens for this (same window-event seam as the provider picker):
    // required slot-card fields without a value or default — a warning, never a send block.
    const unfilled = unfilledRequiredSlots(editor);
    const key = unfilled.join("");
    if (key !== lastRequiredKey.current) {
      lastRequiredKey.current = key;
      window.dispatchEvent(
        new CustomEvent("codetwo-required-slots", { detail: unfilled })
      );
    }
  };

  useEffect(() => {
    getBlocksRef.current = () => docToBlocks(editor);
    insertTextRef.current = (text: string) => {
      const doc = editor.document;
      const last = doc[doc.length - 1];
      if (last) {
        editor.insertBlocks(
          [{ content: text, type: "paragraph" }],
          last,
          "after"
        );
      }
    };
    insertAnnotationRef.current = (a: Annotation, context: string) => {
      const doc = editor.document;
      const last = doc[doc.length - 1];
      if (!last) {
        return;
      }
      editor.insertBlocks(
        [
          {
            props: {
              context,
              note: a.note,
              selectedText: a.selected_text ?? "",
              selector: a.selector ?? "",
              styles: JSON.stringify(a.styles),
              url: a.url,
            },
            type: "browserNote",
          },
        ],
        last,
        "after"
      );
      onEmptyChange(false);
    };
    insertFileRef.current = (path: string) => {
      editor.insertInlineContent([
        { props: { path }, type: "fileMention" },
        " ",
      ]);
    };
    if (insertSessionRef) {
      insertSessionRef.current = ({ id, title, throughSeq }) => {
        const first = editor.document[0];
        if (!first) {
          return;
        }
        editor.insertBlocks(
          [
            {
              content: [
                {
                  props: { sessionId: id, throughSeq, title },
                  type: "sessionMention",
                },
                " ",
              ],
              type: "paragraph",
            },
          ],
          first,
          "before"
        );
        onEmptyChange(false);
        editor.focus();
      };
    }
    focusRef.current = () => editor.focus();
    clearRef.current = () => {
      // Replace every block with one empty paragraph. Removing them all leaves BlockNote with no
      // block to put a cursor in.
      editor.replaceBlocks(editor.document, [
        { content: "", type: "paragraph" },
      ]);
      onEmptyChange(true);
    };
    if (insertMarkdownRef) {
      insertMarkdownRef.current = async (markdown, mode) => {
        const blocks = await editor.tryParseMarkdownToBlocks(markdown);
        if (blocks.length === 0) {
          return;
        }
        if (mode === "replace") {
          editor.replaceBlocks(editor.document, blocks as never);
        } else {
          const last = editor.document[editor.document.length - 1];
          if (last) {
            editor.insertBlocks(blocks as never, last, "after");
          }
        }
        onEmptyChange(false);
      };
    }
    openSkillPickerRef.current = () => {
      editor.focus();
      editor.openSuggestionMenu("/");
    };
    insertSkillRef.current = (skill: SkillInfo) => {
      editor.focus();
      // Same split as the `/` picker: macros carrying slot metadata become a slot card.
      if (skill.macro_slots !== null && skill.macro_slots !== undefined) {
        insertSlotCardForSkill(editor, skill);
        onEmptyChange(false);
        return;
      }
      editor.insertInlineContent([
        {
          props: {
            icon: skill.icon ?? "✦",
            name: skill.name,
            skillId: skill.id,
          },
          type: "skill",
        },
        " ",
      ]);
      onEmptyChange(false);
    };
    if (insertBriefRef) {
      insertBriefRef.current = (
        scene: SceneInfo,
        values: Record<string, string> = {}
      ) => {
        const brief = scene.brief;
        if (!brief) {
          return;
        }
        const first = editor.document[0];
        if (!first) {
          return;
        }
        const id = freshSlotCardId();
        editor.insertBlocks(
          [
            {
              id,
              props: {
                icon: scene.icon ?? "",
                mode: "brief",
                sceneName: scene.name,
                slots: JSON.stringify(normalizeSlots(brief.slots ?? [])),
                template: brief.template,
                title: scene.title,
                values: JSON.stringify(values),
              },
              type: "slotCard",
            },
          ],
          first,
          "before"
        );
        onEmptyChange(false);
        focusSlotCardField(id);
      };
    }
    if (insertIssueRef) {
      insertIssueRef.current = (
        issue: Issue,
        context: string,
        delegatedScene = ""
      ) => {
        const last = editor.document[editor.document.length - 1];
        if (!last) {
          return;
        }
        editor.insertBlocks(
          [
            {
              props: {
                context,
                delegatedScene,
                issueId: issue.id,
                source: issue.source,
                state: issue.state,
                title: issue.title,
                url: issue.url,
              },
              type: "issueRef",
            },
          ],
          last,
          "after"
        );
        onEmptyChange(false);
      };
    }
    insertCanvasDraftRef.current = insertCanvasDraft;
    restoreCanvasDocumentRef.current = restoreCanvasDocument;
    insertCanvasRef.current = async () => {
      if (!canvasEnabled) {
        return;
      }
      const draft = await createCanvas();
      insertCanvasDraft(draft);
    };
    freezeCanvasesRef.current = async (doc) => {
      const frozen = new Map<string, number>();
      for (const block of editor.document) {
        if (block.type !== "canvas") {
          continue;
        }
        const id = String((block.props as { id?: string }).id ?? "");
        if (!id) {
          continue;
        }
        const handle = canvasHandles.current.get(id);
        if (!handle) {
          throw new Error(`Canvas ${id} is not ready`);
        }
        const result = await handle.freeze();
        frozen.set(id, result.snapshot.revision);
      }
      return doc.map((block) =>
        block.type === "canvas" && frozen.has(block.id)
          ? { ...block, frozen_revision: frozen.get(block.id)! }
          : block
      );
    };
    return () => {
      for (const id of new Set([
        ...previousCanvasIds.current,
        ...tombstonedCanvasIds.current,
      ])) {
        editorCanvasRuntime?.onCanvasUnmount(
          id,
          nonEmptyCanvasIds.current.has(id)
        );
      }
      getBlocksRef.current = null;
      insertTextRef.current = null;
      insertAnnotationRef.current = null;
      insertFileRef.current = null;
      if (insertSessionRef) {
        insertSessionRef.current = null;
      }
      focusRef.current = null;
      clearRef.current = null;
      if (insertMarkdownRef) {
        insertMarkdownRef.current = null;
      }
      openSkillPickerRef.current = null;
      insertSkillRef.current = null;
      if (insertBriefRef) {
        insertBriefRef.current = null;
      }
      if (insertIssueRef) {
        insertIssueRef.current = null;
      }
      insertCanvasRef.current = null;
      insertCanvasDraftRef.current = null;
      restoreCanvasDocumentRef.current = null;
      freezeCanvasesRef.current = null;
    };
  }, [
    canvasEnabled,
    createCanvas,
    editor,
    editorCanvasRuntime,
    freezeCanvasesRef,
    getBlocksRef,
    insertAnnotationRef,
    insertBriefRef,
    insertCanvasDraft,
    insertCanvasDraftRef,
    insertCanvasRef,
    insertIssueRef,
    restoreCanvasDocument,
    restoreCanvasDocumentRef,
    insertFileRef,
    insertSessionRef,
    insertMarkdownRef,
    focusRef,
    clearRef,
    openSkillPickerRef,
    insertSkillRef,
    onEmptyChange,
  ]);

  useEffect(() => {
    observeDocument();
  }, [observeDocument]);

  // Stored scene artifacts for the active session, filtered by title (R4 cleanup: the spec's
  // "@-menu Artifacts section"). Degrades to nothing without a session or on an older core.
  const artifactMenuItems = async (query: string, session: string | null) => {
    if (!session) {
      return [] as import("./FileMenu").ArtifactAtItem[];
    }
    const records = await listSceneArtifacts(session);
    const needle = query.toLowerCase();
    return records
      .filter((r) => !needle || r.title.toLowerCase().includes(needle))
      .slice(0, 12)
      .map((r) => ({
        artifactKind: r.kind,
        kind: "artifact" as const,
        recordId: r.id,
        title: r.title,
        version: r.version,
      }));
  };

  const getAtItems = async (query: string): Promise<AtItem[]> => {
    const [chats, artifacts, files] = await Promise.all([
      chatMenuItems(query, sessionId),
      artifactMenuItems(query, sessionId),
      fileMenuItems(cwd, query),
    ]);
    return [...chats, ...artifacts, ...files];
  };

  return (
    <div
      ref={editorRootRef}
      data-composer-editor
      onPasteCapture={(event) => {
        if (!onPasteImages) {
          return;
        }
        const files = Array.from(event.clipboardData.files).filter((file) =>
          file.type.startsWith("image/")
        );
        if (files.length === 0) {
          return;
        }
        event.preventDefault();
        void onPasteImages(files);
      }}
    >
      <CanvasBlockRuntimeContext.Provider value={editorCanvasRuntime}>
        <BlockNoteView
          editor={editor}
          slashMenu={false}
          theme={scheme}
          onChange={observeDocument}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  ...sceneSkillItems(
                    editor,
                    skills,
                    sceneSkills,
                    showAllSkillsRef
                  ),
                  ...(canvasEnabled
                    ? [
                        canvasSlashItem(
                          () => insertCanvasRef.current?.() ?? Promise.resolve()
                        ),
                      ]
                    : []),
                  // Prompt images use the Composer's private attachment intake. Keep BlockNote's
                  // unrelated media placeholders out of the slash menu; use `@` for workspace files.
                  ...getDefaultReactSlashMenuItems(editor).filter(
                    (i) =>
                      !["Image", "Video", "Audio", "File"].includes(i.title)
                  ),
                ],
                query
              )
            }
          />
          {/* `@` mentions workspace files and past chats — file contents and chat transcripts are
            inlined into the compiled prompt. */}
          {/* The type argument is explicit because the controller infers its item type from `getItems`,
            and an inline lambda lets it fall back to BlockNote's default item instead. */}
          <SuggestionMenuController<typeof getAtItems>
            triggerCharacter="@"
            getItems={getAtItems}
            suggestionMenuComponent={FileMenu}
            onItemClick={(item) => {
              editor.insertInlineContent([
                item.kind === "chat"
                  ? {
                      props: {
                        sessionId: item.id,
                        throughSeq: 0,
                        title: item.title,
                      },
                      type: "sessionMention",
                    }
                  : item.kind === "artifact"
                    ? {
                        props: {
                          artifactId: String(item.recordId),
                          kind: item.artifactKind,
                          title: item.title,
                        },
                        type: "artifactMention",
                      }
                    : { props: { path: item.path }, type: "fileMention" },
                " ",
              ]);
            }}
          />
        </BlockNoteView>
      </CanvasBlockRuntimeContext.Provider>
    </div>
  );
};
