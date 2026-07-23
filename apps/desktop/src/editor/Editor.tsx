import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core";
import { useEffect, type MutableRefObject } from "react";
import { schema, docToBlocks, type CodeTwoEditor } from "../skillInline";
import { listFiles, type DocBlock, type SkillInfo } from "../bridge";

interface EditorProps {
  skills: SkillInfo[];
  /// Working directory used to resolve `@`-file mentions.
  cwd: string;
  // App reads the composed document out of the editor on Run.
  getBlocksRef: MutableRefObject<(() => DocBlock[]) | null>;
  // App appends browser-annotation context blocks through this.
  insertTextRef: MutableRefObject<((text: string) => void) | null>;
  // App inserts `@file` mentions (from the file browser) through this.
  insertFileRef: MutableRefObject<((path: string) => void) | null>;
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
      editor.insertInlineContent([{ type: "file", props: { path: p } }, " "]);
    },
  }));
}

export function DocEditor({ skills, cwd, getBlocksRef, insertTextRef, insertFileRef }: EditorProps) {
  const editor = useCreateBlockNote({
    schema,
    initialContent: [
      { type: "heading", content: "Refactor the auth module" },
      {
        type: "paragraph",
        content: "Type '/' to insert a skill, or write your prompt as a document.",
      },
      { type: "paragraph", content: "" },
    ],
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
    insertFileRef.current = (path: string) => {
      editor.insertInlineContent([{ type: "file", props: { path } }, " "]);
    };
    return () => {
      getBlocksRef.current = null;
      insertTextRef.current = null;
      insertFileRef.current = null;
    };
  }, [editor, getBlocksRef, insertTextRef, insertFileRef]);

  return (
    <BlockNoteView editor={editor} slashMenu={false}>
      <SuggestionMenuController
        triggerCharacter={"/"}
        getItems={async (query) =>
          filterSuggestionItems(
            [...skillItems(editor, skills), ...getDefaultReactSlashMenuItems(editor)],
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
