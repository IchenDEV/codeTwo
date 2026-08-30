// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, mount, restoreDom } from "./domTestHarness";

activateDom();
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ filter: "" }) as never;

const { SlotCardRuntimeContext, SlotCardView } = await import("../src/editor/slotCard");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function makeBlock(props = {}) {
  return {
    id: "card-1",
    props: {
      mode: "macro",
      skillId: "commit-macro",
      sceneName: "",
      title: "Commit Message",
      icon: "📝",
      template: "Write a {{style}} commit message for {{scope}}.",
      slots: JSON.stringify([
        { id: "style", label: "Style", kind: "select", options: ["conventional", "descriptive"], required: true },
        { id: "scope", label: "Scope", kind: "text" },
      ]),
      values: "{}",
      ...props,
    },
  };
}

function makeEditor() {
  const calls = [];
  return {
    calls,
    updateBlock: (block, update) => calls.push({ block, update }),
    removeBlocks: () => {},
    setTextCursorPosition: () => {},
    focus: () => {},
  };
}

function renderCard(block, editor, runtime = null) {
  return mount(
    <I18nProvider>
      <SlotCardRuntimeContext.Provider value={runtime}>
        <SlotCardView block={block} editor={editor} />
      </SlotCardRuntimeContext.Provider>
    </I18nProvider>,
  );
}

function setValue(field, value) {
  // React installs a value tracker on the element instance; go through the prototype setter so
  // the change is not deduplicated away before the synthetic input event fires.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

describe("SlotCardView", () => {
  test("renders template prose and one field per slot kind", () => {
    activateDom();
    const block = makeBlock({
      template: "Do {{a}} then {{b}} pick {{c}} read {{d}}",
      slots: JSON.stringify([
        { id: "a", label: "A", kind: "text" },
        { id: "b", label: "B", kind: "multiline" },
        { id: "c", label: "C", kind: "select", options: ["x", "y"] },
        { id: "d", label: "D", kind: "file" },
      ]),
    });
    const rendered = renderCard(block, makeEditor());
    expect(rendered.container.textContent).toContain("Do");
    expect(rendered.container.querySelector('input[aria-label="A"]')).toBeTruthy();
    expect(rendered.container.querySelector('textarea[aria-label="B"]')).toBeTruthy();
    const select = rendered.container.querySelector(
      'button[data-slot="select-trigger"][aria-label="C"]',
    );
    expect(select).toBeTruthy();
    expect(select.getAttribute("role")).toBe("combobox");
    // Without a runtime seam the file slot degrades to a plain path field.
    expect(rendered.container.querySelector('input[aria-label="D"]')).toBeTruthy();
  });

  test("shows the mode pill and existing values round-trip into the fields", () => {
    activateDom();
    const block = makeBlock({ values: JSON.stringify({ style: "descriptive", scope: "auth" }) });
    const rendered = renderCard(block, makeEditor());
    expect(rendered.container.textContent).toContain("Commit Message");
    expect(rendered.container.textContent).toContain("Macro");
    expect(
      rendered.container.querySelector(
        'button[data-slot="select-trigger"][aria-label="Style"]',
      ).textContent,
    ).toContain("descriptive");
    expect(rendered.container.querySelector('input[aria-label="Scope"]').value).toBe("auth");
  });

  test("editing a field writes re-encoded values through editor.updateBlock", () => {
    activateDom();
    const block = makeBlock();
    const editor = makeEditor();
    const rendered = renderCard(block, editor);
    setValue(rendered.container.querySelector('input[aria-label="Scope"]'), "core");
    expect(editor.calls.length).toBe(1);
    expect(JSON.parse(editor.calls[0].update.props.values)).toEqual({ scope: "core" });
  });

  test("artifact slot renders carried artifacts from the runtime, empty state without", () => {
    activateDom();
    const block = makeBlock({
      mode: "brief",
      template: "Use {{prior}}",
      slots: JSON.stringify([{ id: "prior", label: "Prior", kind: "artifact" }]),
    });
    const empty = renderCard(block, makeEditor());
    expect(empty.container.textContent).toContain("No artifacts carried");
    empty.unmount();

    const runtime = {
      pickFile: async () => null,
      carriedArtifacts: () => [{ id: "plan-1", title: "Plan v1" }],
    };
    const selectedBlock = {
      ...block,
      props: { ...block.props, values: JSON.stringify({ prior: "plan-1" }) },
    };
    const rendered = renderCard(selectedBlock, makeEditor(), runtime);
    const select = rendered.container.querySelector(
      'button[data-slot="select-trigger"][aria-label="Prior"]',
    );
    expect(select).toBeTruthy();
    expect(select.textContent).toContain("Plan v1");
  });

  test("brief mode is labeled as a brief", () => {
    activateDom();
    const block = makeBlock({ mode: "brief", title: "Develop", sceneName: "develop" });
    const rendered = renderCard(block, makeEditor());
    expect(rendered.container.textContent).toContain("Brief");
  });
});
