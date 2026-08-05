import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import type { DocBlock, StyleChange } from "./bridge";

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

// The editor schema = default blocks/inline + our skill/file inline nodes and the annotation block.
export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    browserNote: BrowserNoteBlock,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    skill: SkillInline,
    fileMention: FileInline,
    sessionMention: SessionMentionInline,
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
          out.push({ type: "file", path: props.path });
        } else if (inline.type === "sessionMention") {
          flush();
          const props = inline.props as { sessionId: string };
          out.push({ type: "session", session_id: props.sessionId });
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
