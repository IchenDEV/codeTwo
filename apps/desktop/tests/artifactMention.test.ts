// @ts-nocheck
import { describe, expect, test } from "bun:test";
import { activateDom, dom } from "./domTestHarness";

activateDom();
dom.window.HTMLCanvasElement.prototype.getContext = () =>
  ({ filter: "" }) as never;

const { docToBlocks } = await import("../src/skillInline");

function editorWith(...blocks) {
  return { document: blocks };
}

function paragraph(...content) {
  return { type: "paragraph", content };
}

describe("docToBlocks artifactMention", () => {
  test("emits the {{artifact:<id>}} interpolation token as text", () => {
    const editor = editorWith(
      paragraph(
        { type: "text", text: "Follow " },
        {
          type: "artifactMention",
          props: { artifactId: "42", title: "Plan", kind: "plan" },
        },
        { type: "text", text: " exactly." }
      )
    );
    expect(docToBlocks(editor)).toEqual([
      { type: "text", text: "Follow " },
      { type: "text", text: "{{artifact:42}}" },
      { type: "text", text: " exactly." },
    ]);
  });

  test("a mention on its own line compiles to just the token", () => {
    const editor = editorWith(
      paragraph({
        type: "artifactMention",
        props: { artifactId: "7", title: "Report", kind: "report" },
      })
    );
    expect(docToBlocks(editor)).toEqual([
      { type: "text", text: "{{artifact:7}}" },
    ]);
  });
});
