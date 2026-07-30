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
import { schema, docToBlocks, type CodeTwoEditor } from "../skillInline";
import { listFiles, type Annotation, type DocBlock, type SkillInfo } from "../bridge";
import { useColorScheme } from "../theme";
import { useT } from "../i18n";

interface EditorProps {
  skills: SkillInfo[];
  /// Working directory used to resolve `@`-file mentions.
  cwd: string;
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
  // Lets the toolbar disable Run — and explain why — while the document is empty.
  onEmptyChange: (empty: boolean) => void;
}

// The `/` "Skills" group, built from the live library. Picking one inserts a real inline skill node.
function skillItems(editor: CodeTwoEditor, skills: SkillInfo[]): DefaultReactSuggestionItem[] {
  return skills.map((s) => ({
    title: `Skill: ${s.name}`,
    subtext: s.description,
    group: "Skills",
    icon: <span style={{ fontSize: 18 }}>{s.icon ?? "✦"}</span>,
    onItemClick: () => {
      editor.insertInlineContent([
        { type: "skill", props: { skillId: s.id, name: s.name, icon: s.icon ?? "✦" } },
        " ",
      ]);
    },
  }));
}

// The `@` picker: workspace files, searched live. Picking one inserts a file mention whose contents
// the core inlines at compile time.
async function fileMenuItems(
  editor: CodeTwoEditor,
  cwd: string,
  query: string,
): Promise<DefaultReactSuggestionItem[]> {
  const paths = await listFiles(cwd || ".", query, 30).catch(() => []);
  return paths.map((p) => ({
    title: p,
    group: "Files",
    icon: <span style={{ fontSize: 16 }}>📄</span>,
    onItemClick: () => {
      editor.insertInlineContent([{ type: "fileMention", props: { path: p } }, " "]);
    },
  }));
}

export function DocEditor({
  skills,
  cwd,
  getBlocksRef,
  insertTextRef,
  insertAnnotationRef,
  insertFileRef,
  focusRef,
  clearRef,
  openSkillPickerRef,
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
    return () => {
      getBlocksRef.current = null;
      insertTextRef.current = null;
      insertAnnotationRef.current = null;
      insertFileRef.current = null;
      focusRef.current = null;
      clearRef.current = null;
      openSkillPickerRef.current = null;
    };
  }, [editor, getBlocksRef, insertTextRef, insertAnnotationRef, insertFileRef, focusRef, clearRef, openSkillPickerRef, onEmptyChange]);

  const scheme = useColorScheme();

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
      {/* `@` mentions workspace files — their contents are inlined into the compiled prompt. */}
      <SuggestionMenuController
        triggerCharacter={"@"}
        getItems={async (query) => fileMenuItems(editor, cwd, query)}
      />
    </BlockNoteView>
  );
}
