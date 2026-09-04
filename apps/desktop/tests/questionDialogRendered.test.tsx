// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import {
  activateDom,
  click,
  dom,
  flush,
  mount,
  restoreDom,
} from "./domTestHarness";

activateDom();
const { QuestionDialog } = await import("../src/session/QuestionDialog");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

// An earlier suite in the same bun run can leak a key-echo `useT` mock, so a label renders as
// either its English translation or its raw i18n key. Every query accepts both.
const SUBMIT_LABELS = ["Submit", "question.submit"];
const SKIP_LABELS = ["Skip", "question.skip"];
const CANCEL_LABELS = ["Cancel", "question.cancel"];
const OTHER_LABELS = ["Other", "question.other"];

const ASK = {
  message: "Which auth method should we use?",
  tool_call_id: "tool-1",
  fields: [
    {
      key: "question_0",
      kind: "select",
      title: "Auth method",
      required: false,
      options: [
        { value: "OAuth", label: "OAuth", description: "Redirect flow" },
        { value: "API key", label: "API key", preview: "AUTH_KEY=…" },
      ],
    },
    {
      key: "question_0_custom",
      kind: "text",
      title: "Other",
      required: false,
      custom_answer_for: "question_0",
    },
  ],
};

function buttonByLabel(labels) {
  return [...dom.document.body.querySelectorAll("button")].find((el) => {
    const label = el.getAttribute("aria-label") ?? el.textContent?.trim();
    return labels.includes(label);
  });
}

function optionByText(text) {
  const row = [
    ...dom.document.body.querySelectorAll('[data-slot="choice-row"]'),
  ].find((el) => el.textContent?.includes(text));
  return row?.querySelector('[role="radio"], [role="checkbox"]');
}

function chooseOption(text) {
  const control = optionByText(text);
  const input = control?.parentElement?.querySelector(
    'input[type="checkbox"], input[type="radio"]'
  );
  // Base UI keeps the native input visually hidden and forwards pointer clicks to it. happy-dom
  // does not implement that forwarding, so exercise the same native input directly in this suite.
  (input ?? control)?.click();
}

function field(labels) {
  return [...dom.document.body.querySelectorAll("input")].find((el) =>
    labels.includes(el.getAttribute("aria-label"))
  );
}

function setValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el),
    "value"
  )?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function renderDialog(form = ASK) {
  const answers = [];
  const rendered = mount(
    <I18nProvider>
      <QuestionDialog form={form} onAnswer={(answer) => answers.push(answer)} />
    </I18nProvider>
  );
  return { rendered, answers };
}

describe("QuestionDialog", () => {
  test("shows the agent's question and its own options, not an approval prompt", () => {
    activateDom();
    const { rendered } = renderDialog();

    expect(dom.document.body.textContent).toContain(
      "Which auth method should we use?"
    );
    expect(optionByText("OAuth")).toBeTruthy();
    expect(optionByText("Redirect flow")).toBeTruthy();
    expect(optionByText("API key")).toBeTruthy();
    // Nothing chosen yet, so there is nothing to submit.
    expect(buttonByLabel(SUBMIT_LABELS)?.disabled).toBe(true);
    rendered.unmount();
  });

  test("picking an option submits it as form content keyed by field", async () => {
    activateDom();
    const { rendered, answers } = renderDialog();

    chooseOption("OAuth");
    await flush();
    expect(optionByText("OAuth").getAttribute("aria-checked")).toBe("true");

    click(buttonByLabel(SUBMIT_LABELS));
    await flush();
    expect(answers).toEqual([
      { action: "accept", content: { question_0: "OAuth" } },
    ]);
    rendered.unmount();
  });

  test("a typed Other answer replaces the picked option", async () => {
    activateDom();
    const { rendered, answers } = renderDialog();

    chooseOption("OAuth");
    await flush();
    setValue(field(OTHER_LABELS), "mTLS");
    await flush();
    expect(optionByText("OAuth").getAttribute("aria-checked")).toBe("false");

    click(buttonByLabel(SUBMIT_LABELS));
    await flush();
    expect(answers).toEqual([
      { action: "accept", content: { question_0_custom: "mTLS" } },
    ]);
    rendered.unmount();
  });

  test("skip and cancel are distinct answers", async () => {
    activateDom();
    const skipped = renderDialog();
    click(buttonByLabel(SKIP_LABELS));
    await flush();
    expect(skipped.answers).toEqual([{ action: "decline" }]);
    skipped.rendered.unmount();
    dom.document.body.replaceChildren();

    const cancelled = renderDialog();
    click(buttonByLabel(CANCEL_LABELS));
    await flush();
    expect(cancelled.answers).toEqual([{ action: "cancel" }]);
    cancelled.rendered.unmount();
  });

  test("multi-select keeps every toggled choice", async () => {
    activateDom();
    const { rendered, answers } = renderDialog({
      message: "Which features?",
      fields: [
        {
          key: "features",
          kind: "multi_select",
          required: true,
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ],
        },
      ],
    });

    chooseOption("Alpha");
    await flush();
    chooseOption("Beta");
    await flush();
    click(buttonByLabel(SUBMIT_LABELS));
    await flush();
    expect(answers).toEqual([
      { action: "accept", content: { features: ["a", "b"] } },
    ]);
    rendered.unmount();
  });
});
