// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";

import { activateDom, button, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { TooltipProvider } = await import("../src/components/ui/tooltip");
const { I18nProvider } = await import("../src/i18n");
const { TurnCard } = await import("../src/session/TurnCard");
const { ToastProvider } = await import("../src/ui/toast");

afterEach(() => {
  dom.document.body.replaceChildren();
  dom.localStorage.clear();
  restoreDom();
});

const turn = {
  id: 1,
  transcriptStartSeq: 17,
  accepted: true,
  streamBoundaryKnown: true,
  prompt: "Keep this exact prompt",
  text: "Keep this exact response",
  textDeltas: [],
  observedTextDeltas: 0,
  observedThoughtDeltas: 0,
  pendingTextDeltaSkips: 0,
  pendingThoughtDeltaSkips: 0,
  thoughts: [],
  tools: [],
  content: [],
  plan: [],
  startedAt: Date.UTC(2026, 7, 26, 3, 45),
  endedAt: Date.UTC(2026, 7, 26, 3, 46),
};

function renderTurn(onFork = () => {}) {
  return mount(
    <I18nProvider>
      <TooltipProvider>
        <ToastProvider>
          <TurnCard
            turn={turn}
            onFork={onFork}
          />
        </ToastProvider>
      </TooltipProvider>
    </I18nProvider>,
  );
}

describe("turn actions", () => {
  test("copies the exact prompt and response", async () => {
    activateDom();
    const copied = [];
    Object.defineProperty(dom.navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => copied.push(text) },
    });
    const view = renderTurn();
    await flush();

    click(button(view.container, "Copy prompt"));
    await flush();
    click(button(view.container, "Copy response"));
    await flush();

    expect(copied).toEqual([turn.prompt, turn.text]);
    expect(button(view.container, "Response copied")).toBeTruthy();
    view.unmount();
  });

  test("uses the compact timestamp role beside the 24px action controls", async () => {
    activateDom();
    const view = renderTurn();
    await flush();

    for (const row of view.container.querySelectorAll("[data-turn-actions]")) {
      expect(row.classList.contains("text-callout")).toBe(true);
      expect(row.classList.contains("text-meta")).toBe(false);
    }
    view.unmount();
  });

  test("keeps copy and branch actions without response feedback controls", async () => {
    activateDom();
    const forked = [];
    const view = renderTurn((selected) => forked.push(selected));
    await flush();

    const actionLabels = Array.from(
      view.container.querySelectorAll('[data-turn-actions="response"] button'),
      (action) => action.getAttribute("aria-label"),
    );
    expect(actionLabels).toEqual(["Copy response", "Branch into a new task"]);

    click(button(view.container, "Branch into a new task"));
    expect(forked).toEqual([turn]);
    view.unmount();
  });
});
