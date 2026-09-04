// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import {
  activateDom,
  click,
  dom,
  mount,
  restoreDom,
  waitFor,
} from "./domTestHarness";

activateDom();
const { TemplateDialog, validateMacroDraft } =
  await import("../src/session/TemplateDialog");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

// An earlier suite in the same bun run can leak a key-echo `useT` mock, so every label may render
// as its English translation or its raw i18n key. All queries accept both.
function field(labels) {
  return [
    ...dom.document.body.querySelectorAll("input, textarea, select"),
  ].find((el) => labels.includes(el.getAttribute("aria-label")));
}

function fields(labels) {
  return [
    ...dom.document.body.querySelectorAll("input, textarea, select"),
  ].filter((el) => labels.includes(el.getAttribute("aria-label")));
}

function buttonByLabel(labels) {
  return [...dom.document.body.querySelectorAll("button")].find((el) => {
    const label = el.getAttribute("aria-label") ?? el.textContent?.trim();
    return labels.includes(label);
  });
}

const idLabels = ["Id", "templateFrom.id"];
const nameLabels = ["Name", "templateFrom.name"];
const templateLabels = ["Template", "templateFrom.template"];
const saveLabels = ["Save template", "templateFrom.save"];
const addLabels = ["Add slot", "templateFrom.addSlot"];

function setValue(el, value) {
  // React installs a value tracker on the element instance; go through the prototype setter so
  // the change is not deduplicated away before the synthetic input event fires.
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el),
    "value"
  )?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

const PROPOSAL = {
  template: 'Rename "{{slot-1}}" in {{slot-2}}',
  slots: [
    { id: "slot-1", label: "old name", kind: "text", default: "old name" },
    { id: "slot-2", label: "src/a.rs", kind: "file", default: "src/a.rs" },
  ],
};

function renderDialog(overrides = {}) {
  const calls = { saved: [], closed: 0, savedCb: 0 };
  const props = {
    source: 'Rename "old name" in src/a.rs',
    onClose: () => {
      calls.closed += 1;
    },
    onSaved: () => {
      calls.savedCb += 1;
    },
    propose: async () => PROPOSAL,
    save: async (skill) => {
      calls.saved.push(skill);
    },
    ...overrides,
  };
  const rendered = mount(
    <I18nProvider>
      <TemplateDialog {...props} />
    </I18nProvider>
  );
  return { rendered, calls };
}

describe("validateMacroDraft", () => {
  const slot = (id, kind = "text", options = "") => ({ id, kind, options });

  test("accepts a matched template and slot table", () => {
    expect(
      validateMacroDraft("Do {{a}} with {{b-2}}", [slot("a"), slot("b-2")])
    ).toEqual([]);
  });

  test("flags template tokens without a slot row and vice versa", () => {
    const missingRow = validateMacroDraft("Do {{a}}", []);
    expect(missingRow).toHaveLength(1);
    expect(missingRow[0]).toContain("{{a}}");

    const missingToken = validateMacroDraft("Do it", [slot("a")]);
    expect(missingToken).toHaveLength(1);
    expect(missingToken[0]).toContain('"a"');
  });

  test("flags non-slug ids, duplicates, and selects without options", () => {
    expect(
      validateMacroDraft("{{Bad Id}}", [slot("Bad Id")]).length
    ).toBeGreaterThan(0);
    expect(
      validateMacroDraft("{{a}} {{a}}", [slot("a"), slot("a")])
    ).toHaveLength(1);
    expect(validateMacroDraft("{{a}}", [slot("a", "select", "")])).toHaveLength(
      1
    );
    expect(validateMacroDraft("{{a}}", [slot("a", "select", "x, y")])).toEqual(
      []
    );
  });
});

describe("TemplateDialog", () => {
  test("a proposal populates the template and the slot table", async () => {
    activateDom();
    renderDialog();
    await waitFor(() => {
      expect(field(templateLabels)?.value).toBe(PROPOSAL.template);
    });
    const ids = fields(idLabels).map((el) => el.value);
    expect(ids).toEqual(["slot-1", "slot-2"]);
    const kind = [
      ...dom.document.body.querySelectorAll(
        'button[data-slot="select-trigger"]'
      ),
    ].map((el) => el.textContent?.trim());
    expect(kind).toEqual(["text", "file"]);
  });

  test("a null proposal degrades to a manual editor over the raw text", async () => {
    activateDom();
    const { calls } = renderDialog({ propose: async () => null });
    await waitFor(() => {
      expect(field(templateLabels)?.value).toBe(
        'Rename "old name" in src/a.rs'
      );
    });
    expect(fields(idLabels)).toHaveLength(0);
    // Still fully usable: rows can be added by hand.
    click(buttonByLabel(addLabels));
    await waitFor(() => {
      expect(fields(idLabels)).toHaveLength(1);
    });
    expect(calls.saved).toHaveLength(0);
  });

  test("save sends a macro skill with full slot objects and reports back", async () => {
    activateDom();
    const { calls } = renderDialog();
    await waitFor(() => {
      expect(field(templateLabels)?.value).toBe(PROPOSAL.template);
    });
    setValue(field(nameLabels), "My Template");
    await waitFor(() => {
      expect(buttonByLabel(saveLabels)?.disabled).toBe(false);
    });
    click(buttonByLabel(saveLabels));
    await waitFor(() => {
      expect(calls.saved).toHaveLength(1);
    });
    expect(calls.saved[0]).toEqual({
      id: "my-template",
      name: "My Template",
      description: "",
      icon: null,
      payload: {
        kind: "macro",
        template: PROPOSAL.template,
        slots: [
          {
            id: "slot-1",
            label: "old name",
            kind: "text",
            default: "old name",
          },
          {
            id: "slot-2",
            label: "src/a.rs",
            kind: "file",
            default: "src/a.rs",
          },
        ],
      },
    });
    expect(calls.savedCb).toBe(1);
  });

  test("save stays disabled while the draft is invalid", async () => {
    activateDom();
    renderDialog();
    await waitFor(() => {
      expect(field(templateLabels)?.value).toBe(PROPOSAL.template);
    });
    setValue(field(nameLabels), "My Template");
    // Orphan the second token: its slot row still exists but the id no longer matches.
    setValue(fields(idLabels)[1], "renamed");
    await waitFor(() => {
      expect(buttonByLabel(saveLabels)?.disabled).toBe(true);
    });
  });
});
