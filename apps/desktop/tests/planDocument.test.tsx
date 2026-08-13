// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { TurnCard, planChecklistMarkdown } = await import("../src/session/TurnCard");
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
    plan: ["Survey the code", "[x] Write the fix"],
    startedAt: 1,
    endedAt: 2,
    ...overrides,
  };
}

function renderCard(props = {}) {
  return mount(
    <I18nProvider>
      <TurnCard turn={finishedTurn()} {...props} />
    </I18nProvider>,
  );
}

async function expandPlanDetail(rendered) {
  const trigger = [...rendered.container.querySelectorAll('[data-slot="collapsible-trigger"]')]
    .find((el) => el.textContent?.includes("plan"));
  expect(trigger).toBeTruthy();
  click(trigger);
  await flush();
}

// An earlier suite in the same bun run leaks a key-echo `useT` module mock, so a label renders
// as either its English translation or its raw i18n key depending on file order. Accept both.
const OPEN_LABELS = ["Open as document", "planDoc.open"];
const PIN_LABELS = ["Pin as artifact", "planDoc.pin"];

function buttonByLabel(rendered, labels) {
  return [...rendered.container.querySelectorAll("button")]
    .find((el) => labels.includes(el.textContent?.trim()));
}

describe("planChecklistMarkdown", () => {
  test("converts entries to a checklist, preserving embedded checkbox markers", () => {
    expect(planChecklistMarkdown(["Survey the code", "[x] Write the fix", "- [ ] Test it"]))
      .toBe("- [ ] Survey the code\n- [x] Write the fix\n- [ ] Test it");
  });
});

describe("TurnCard plan-as-document", () => {
  test("offers Open as document and calls the handler with the entries", async () => {
    activateDom();
    const opened = [];
    const rendered = renderCard({ onOpenPlanAsDocument: (entries) => opened.push(entries) });
    await expandPlanDetail(rendered);

    const open = buttonByLabel(rendered, OPEN_LABELS);
    expect(open).toBeTruthy();
    // Pin is gated on a plan-declaring scene; none is active here.
    expect(buttonByLabel(rendered, PIN_LABELS)).toBeFalsy();

    click(open);
    await flush();
    expect(opened).toEqual([["Survey the code", "[x] Write the fix"]]);
    rendered.unmount();
  });

  test("offers Pin as artifact only when the scene declares a plan, passing checklist markdown", async () => {
    activateDom();
    const pinned = [];
    const rendered = renderCard({
      onOpenPlanAsDocument: () => {},
      onPinPlanArtifact: (markdown) => pinned.push(markdown),
      canPinPlan: true,
    });
    await expandPlanDetail(rendered);

    const pin = buttonByLabel(rendered, PIN_LABELS);
    expect(pin).toBeTruthy();
    click(pin);
    await flush();
    expect(pinned).toEqual(["- [ ] Survey the code\n- [x] Write the fix"]);
    rendered.unmount();
  });

  test("hides both affordances when no handlers are wired", async () => {
    activateDom();
    const rendered = renderCard();
    await expandPlanDetail(rendered);
    expect(buttonByLabel(rendered, OPEN_LABELS)).toBeFalsy();
    expect(buttonByLabel(rendered, PIN_LABELS)).toBeFalsy();
    rendered.unmount();
  });
});
