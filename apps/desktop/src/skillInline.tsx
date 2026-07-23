import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactInlineContentSpec } from "@blocknote/react";
import type { DocBlock } from "./bridge";

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

// The editor schema = default blocks/inline + our skill inline node.
export const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    skill: SkillInline,
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
    const content = block.content;
    if (Array.isArray(content)) {
      for (const inline of content as Array<Record<string, unknown>>) {
        if (inline.type === "text") {
          buf += String(inline.text ?? "");
        } else if (inline.type === "skill") {
          flush();
          const props = inline.props as { skillId: string };
          out.push({ type: "skill", skill_id: props.skillId, params: {} });
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
