// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { activateDom, dom } from "./domTestHarness";

activateDom();
dom.window.HTMLCanvasElement.prototype.getContext = () =>
  ({ filter: "" }) as never;

const { docToBlocks } = await import("../src/skillInline");
const {
  briefOfferVisible,
  normalizeSlots,
  parseSlots,
  parseValues,
  templateSegments,
  unfilledRequiredSlots,
} = await import("../src/editor/slotCard");

function slotCard(props = {}) {
  return {
    type: "slotCard",
    props: {
      mode: "macro",
      skillId: "",
      sceneName: "",
      title: "",
      icon: "",
      template: "",
      slots: "[]",
      values: "{}",
      ...props,
    },
  };
}

function editorWith(...blocks) {
  return { document: blocks };
}

describe("docToBlocks slotCard (macro)", () => {
  test("compiles to one skill block with filled params", () => {
    const editor = editorWith(
      slotCard({
        skillId: "commit-macro",
        template: "Write a {{style}} commit message for {{scope}}.",
        slots: JSON.stringify([
          {
            id: "style",
            label: "Style",
            kind: "select",
            options: ["conventional"],
          },
          { id: "scope", label: "Scope", kind: "text" },
        ]),
        values: JSON.stringify({ style: "conventional", scope: "auth" }),
      })
    );
    expect(docToBlocks(editor)).toEqual([
      {
        type: "skill",
        skill_id: "commit-macro",
        params: { style: "conventional", scope: "auth" },
      },
    ]);
  });

  test("a slot default fills a param the user left empty", () => {
    const editor = editorWith(
      slotCard({
        skillId: "commit-macro",
        slots: JSON.stringify([
          { id: "style", kind: "select", default: "conventional" },
          { id: "scope" },
        ]),
        values: JSON.stringify({ scope: "auth" }),
      })
    );
    expect(docToBlocks(editor)).toEqual([
      {
        type: "skill",
        skill_id: "commit-macro",
        params: { style: "conventional", scope: "auth" },
      },
    ]);
  });

  test("corrupt JSON props degrade to empty slots and values, never a crash", () => {
    const editor = editorWith(
      slotCard({
        skillId: "commit-macro",
        slots: "{not json",
        values: "also not json",
      })
    );
    expect(docToBlocks(editor)).toEqual([
      { type: "skill", skill_id: "commit-macro", params: {} },
    ]);
  });

  test("keeps its place between text blocks", () => {
    const editor = editorWith(
      { type: "paragraph", content: [{ type: "text", text: "Before" }] },
      slotCard({
        skillId: "m",
        slots: JSON.stringify([{ id: "a" }]),
        values: JSON.stringify({ a: "1" }),
      }),
      { type: "paragraph", content: [{ type: "text", text: "After" }] }
    );
    expect(docToBlocks(editor)).toEqual([
      { type: "text", text: "Before" },
      { type: "skill", skill_id: "m", params: { a: "1" } },
      { type: "text", text: "After" },
    ]);
  });
});

describe("docToBlocks slotCard (brief)", () => {
  test("interleaves template prose, file mentions and artifact tokens in order", () => {
    const editor = editorWith(
      slotCard({
        mode: "brief",
        sceneName: "develop",
        template: "Goal: {{goal}}\n\nSpec: {{spec}} using {{report}}. End.",
        slots: JSON.stringify([
          { id: "goal", label: "Goal", kind: "multiline" },
          { id: "spec", label: "Spec", kind: "file" },
          { id: "report", label: "Report", kind: "artifact" },
        ]),
        values: JSON.stringify({
          goal: "Ship it",
          spec: "docs/spec.md",
          report: "r-1",
        }),
      })
    );
    expect(docToBlocks(editor)).toEqual([
      { type: "text", text: "Goal: Ship it\n\nSpec: " },
      { type: "file", path: "docs/spec.md" },
      { type: "text", text: " using {{artifact:r-1}}. End." },
    ]);
  });

  test("an unfilled file slot contributes nothing; slot defaults still apply", () => {
    const editor = editorWith(
      slotCard({
        mode: "brief",
        template: "Goal: {{goal}} Spec: {{spec}}",
        slots: JSON.stringify([
          { id: "goal", kind: "text", default: "tbd" },
          { id: "spec", kind: "file" },
        ]),
        values: "{}",
      })
    );
    expect(docToBlocks(editor)).toEqual([
      { type: "text", text: "Goal: tbd Spec: " },
    ]);
  });

  test("corrupt JSON degrades to the bare template prose", () => {
    const editor = editorWith(
      slotCard({
        mode: "brief",
        template: "Just prose {{gone}}.",
        slots: "[broken",
        values: "{broken",
      })
    );
    // The undefined slot's placeholder is dropped; the surrounding prose survives.
    expect(docToBlocks(editor)).toEqual([
      { type: "text", text: "Just prose ." },
    ]);
  });
});

describe("slot helpers", () => {
  test("templateSegments splits prose and slot ids in order", () => {
    expect(templateSegments("A {{one}} b {{two-2}} c")).toEqual([
      { kind: "text", text: "A " },
      { kind: "slot", id: "one" },
      { kind: "text", text: " b " },
      { kind: "slot", id: "two-2" },
      { kind: "text", text: " c" },
    ]);
  });

  test("normalizeSlots migrates legacy id strings and defaults unknown kinds to text", () => {
    expect(
      normalizeSlots([
        "style",
        { id: "x", kind: "weird" },
        { id: "s", kind: "select", options: ["a"] },
      ])
    ).toEqual([
      { id: "style", label: "", kind: "text" },
      {
        id: "x",
        label: "",
        kind: "text",
        options: undefined,
        required: false,
        default: undefined,
      },
      {
        id: "s",
        label: "",
        kind: "select",
        options: ["a"],
        required: false,
        default: undefined,
      },
    ]);
  });

  test("parseSlots and parseValues degrade on corrupt input", () => {
    expect(parseSlots("nope")).toEqual([]);
    expect(parseSlots('{"id":"x"}')).toEqual([]);
    expect(parseValues("nope")).toEqual({});
    expect(parseValues('["array"]')).toEqual({});
    expect(parseValues('{"a":"1","b":2}')).toEqual({ a: "1" });
  });

  test("unfilledRequiredSlots lists required fields without a value or default", () => {
    const editor = editorWith(
      slotCard({
        slots: JSON.stringify([
          { id: "style", label: "Style", required: true },
          { id: "scope", required: true, default: "core" },
          { id: "note" },
        ]),
        values: "{}",
      }),
      slotCard({
        mode: "brief",
        slots: JSON.stringify([{ id: "goal", required: true }]),
        values: JSON.stringify({ goal: "done" }),
      })
    );
    expect(unfilledRequiredSlots(editor)).toEqual(["Style"]);
  });
});

describe("briefOfferVisible", () => {
  const base = {
    docMode: true,
    docEmpty: true,
    hasBrief: true,
    dismissed: false,
  };

  test("offers only on an empty doc-mode page with an undismissed brief", () => {
    expect(briefOfferVisible(base)).toBe(true);
    expect(briefOfferVisible({ ...base, docMode: false })).toBe(false);
    expect(briefOfferVisible({ ...base, docEmpty: false })).toBe(false);
    expect(briefOfferVisible({ ...base, hasBrief: false })).toBe(false);
    expect(briefOfferVisible({ ...base, dismissed: true })).toBe(false);
  });
});
