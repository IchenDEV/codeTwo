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
import { useEffect, type MutableRefObject } from "react";
import { Bot, Server, Sparkles } from "lucide-react";
import { schema, docToBlocks, type CodeTwoEditor } from "../skillInline";
import { FileMenu, type AtItem, type ChatItem, type FileItem } from "./FileMenu";
import {
  listArchivedSessions,
  listFiles,
  listSessions,
  type Annotation,
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
  // Lets the toolbar disable Run — and explain why — while the document is empty.
  onEmptyChange: (empty: boolean) => void;
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
  onEmptyChange,
}: EditorProps) {
  const t = useT();
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
    return () => {
      getBlocksRef.current = null;
      insertTextRef.current = null;
      insertAnnotationRef.current = null;
      insertFileRef.current = null;
      focusRef.current = null;
      clearRef.current = null;
      openSkillPickerRef.current = null;
      insertSkillRef.current = null;
    };
  }, [editor, getBlocksRef, insertTextRef, insertAnnotationRef, insertFileRef, focusRef, clearRef, openSkillPickerRef, insertSkillRef, onEmptyChange]);

  const scheme = useColorScheme();
  const getAtItems = async (query: string): Promise<AtItem[]> => {
    const [chats, files] = await Promise.all([
      chatMenuItems(query, sessionId),
      fileMenuItems(cwd, query),
    ]);
    return [...chats, ...files];
  };

  return (
    <BlockNoteView
      editor={editor}
      slashMenu={false}
      theme={scheme}
      onChange={() => onEmptyChange(docToBlocks(editor).length === 0)}
    >
      <SuggestionMenuController
        triggerCharacter={"/"}
        getItems={async (query) =>
          filterSuggestionItems(
            [
              ...skillItems(editor, skills),
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
  );
}
