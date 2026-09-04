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
const { TaskPlanPanel, planChecklistMarkdown } =
  await import("../src/session/TaskPlanPanel");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function finishedTurn(overrides = {}) {
  return {
    id: 1,
    accepted: true,
    streamBoundaryKnown: true,
    prompt: "Implement the feature",
    text: "Done.",
    textDeltas: [],
    observedTextDeltas: 0,
    observedThoughtDeltas: 0,
    pendingTextDeltaSkips: 0,
    pendingThoughtDeltaSkips: 0,
    thoughts: [],
    tools: [],
    plan: [
      { content: "Survey the code", status: "in_progress" },
      { content: "Write the fix", status: "completed" },
    ],
    startedAt: 1,
    endedAt: 2,
    ...overrides,
  };
}

function renderPanel(props = {}) {
  return mount(
    <I18nProvider>
      <TaskPlanPanel turns={[finishedTurn()]} {...props} />
    </I18nProvider>
  );
}

// An earlier suite in the same bun run leaks a key-echo `useT` module mock, so a label renders
// as either its English translation or its raw i18n key depending on file order. Accept both.
const openLabels = ["Open as document", "planDoc.open"];
const pinLabels = ["Pin as artifact", "planDoc.pin"];

function buttonByLabel(rendered, labels) {
  return [...rendered.container.querySelectorAll("button")].find((el) =>
    labels.includes(el.textContent?.trim())
  );
}

describe("planChecklistMarkdown", () => {
  test("converts entries to a checklist, preserving markers and structured status", () => {
    expect(
      planChecklistMarkdown([
        "Survey the code",
        "[x] Write the fix",
        "- [ ] Test it",
        { content: "Ship it", status: "completed" },
      ])
    ).toBe(
      "- [ ] Survey the code\n- [x] Write the fix\n- [ ] Test it\n- [x] Ship it"
    );
  });
});

describe("TaskPlanPanel plan-as-document", () => {
  test("offers Open as document and calls the handler with the entries", async () => {
    activateDom();
    const opened = [];
    const rendered = renderPanel({
      onOpenPlanAsDocument: (entries) => opened.push(entries),
    });

    const open = buttonByLabel(rendered, openLabels);
    expect(open).toBeTruthy();
    // Pin is gated on a plan-declaring scene; none is active here.
    expect(buttonByLabel(rendered, pinLabels)).toBeFalsy();

    click(open);
    await flush();
    expect(opened).toEqual([
      [
        { content: "Survey the code", status: "in_progress" },
        { content: "Write the fix", status: "completed" },
      ],
    ]);
    rendered.unmount();
  });

  test("offers Pin as artifact only when the scene declares a plan, passing checklist markdown", async () => {
    activateDom();
    const pinned = [];
    const rendered = renderPanel({
      onOpenPlanAsDocument: () => {},
      onPinPlanArtifact: (markdown) => pinned.push(markdown),
      canPinPlan: true,
    });

    const pin = buttonByLabel(rendered, pinLabels);
    expect(pin).toBeTruthy();
    click(pin);
    await flush();
    expect(pinned).toEqual(["- [ ] Survey the code\n- [x] Write the fix"]);
    rendered.unmount();
  });

  test("hides both affordances when no handlers are wired", async () => {
    activateDom();
    const rendered = renderPanel();
    expect(buttonByLabel(rendered, openLabels)).toBeFalsy();
    expect(buttonByLabel(rendered, pinLabels)).toBeFalsy();
    rendered.unmount();
  });
});
