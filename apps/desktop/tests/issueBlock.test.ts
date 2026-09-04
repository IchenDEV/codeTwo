// @ts-nocheck
import { describe, expect, test } from "bun:test";
import { activateDom, dom } from "./domTestHarness";

activateDom();
dom.window.HTMLCanvasElement.prototype.getContext = () =>
  ({ filter: "" }) as never;

const { docToBlocks } = await import("../src/skillInline");
const { issueContextBody, issueContextMarkdown, issueRefToDocBlock } =
  await import("../src/editor/issueBlock");

const CONTEXT =
  "**github #42** — Fix login (open)\nhttps://github.com/o/r/issues/42\n\nSteps to reproduce…";

function issueRef(props = {}) {
  return {
    type: "issueRef",
    props: {
      source: "github",
      issueId: "42",
      title: "Fix login",
      url: "https://github.com/o/r/issues/42",
      state: "open",
      context: CONTEXT,
      delegatedScene: "",
      ...props,
    },
  };
}

function paragraph(text) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function editorWith(...blocks) {
  return { document: blocks };
}

describe("docToBlocks issueRef", () => {
  test("emits the core issue DocumentBlock with the context's body portion", () => {
    const blocks = docToBlocks(editorWith(issueRef()));
    expect(blocks).toEqual([
      {
        type: "issue",
        source: "github",
        id: "42",
        title: "Fix login",
        url: "https://github.com/o/r/issues/42",
        body: "Steps to reproduce…",
      },
    ]);
  });

  test("flushes surrounding text into separate blocks, preserving order", () => {
    const blocks = docToBlocks(
      editorWith(
        paragraph("Please handle this:"),
        issueRef(),
        paragraph("Thanks!")
      )
    );
    expect(blocks.map((b) => b.type)).toEqual(["text", "issue", "text"]);
    expect(blocks[0].text).toBe("Please handle this:");
    expect(blocks[2].text).toBe("Thanks!");
  });

  test("delegation provenance stays on the block, never in the prompt record", () => {
    const blocks = docToBlocks(
      editorWith(issueRef({ delegatedScene: "Develop" }))
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("issue");
    expect("delegatedScene" in blocks[0]).toBe(false);
    expect("state" in blocks[0]).toBe(false);
  });

  test("a header-only context (issue without body) serializes an empty body", () => {
    const headerOnly = "**github #7** — Bug (open)\nhttps://x/7";
    const blocks = docToBlocks(
      editorWith(
        issueRef({
          issueId: "7",
          title: "Bug",
          url: "https://x/7",
          context: headerOnly,
        })
      )
    );
    expect(blocks[0].body).toBe("");
  });

  test("a block without an issue id is dropped rather than emitted half-empty", () => {
    expect(docToBlocks(editorWith(issueRef({ issueId: "" })))).toEqual([]);
  });
});

describe("issue context helpers", () => {
  test("issueContextBody strips exactly the two-line header", () => {
    expect(issueContextBody(CONTEXT)).toBe("Steps to reproduce…");
    expect(issueContextBody("**github #7** — Bug (open)\nhttps://x/7")).toBe(
      ""
    );
  });

  test("issueContextMarkdown round-trips through issueRefToDocBlock", () => {
    const docBlock = {
      type: "issue",
      source: "github",
      id: "42",
      title: "Fix login",
      url: "https://github.com/o/r/issues/42",
      body: "Steps to reproduce…",
    };
    const context = issueContextMarkdown(docBlock);
    expect(context).toBe(CONTEXT);
    const roundTripped = issueRefToDocBlock({
      source: docBlock.source,
      issueId: docBlock.id,
      title: docBlock.title,
      url: docBlock.url,
      state: "open",
      context,
      delegatedScene: "Develop",
    });
    expect(roundTripped).toEqual(docBlock);
  });
});
