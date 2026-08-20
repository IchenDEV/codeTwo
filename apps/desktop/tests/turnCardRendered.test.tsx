// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, mount, restoreDom } from "./domTestHarness";

activateDom();
const { TurnCard } = await import("../src/session/TurnCard");

let restoreCanvasContext: (() => void) | null = null;

afterEach(() => {
  restoreCanvasContext?.();
  restoreCanvasContext = null;
  dom.document.body.replaceChildren();
  restoreDom();
});

function disableCanvasDrawing(): void {
  // The suite only verifies the rendered activity contract. Other Canvas tests install a partial
  // 2D context mock, so make the third-party renderer take its supported no-context path here.
  const getContext = dom.HTMLCanvasElement.prototype.getContext;
  dom.HTMLCanvasElement.prototype.getContext = () => null;
  restoreCanvasContext = () => {
    dom.HTMLCanvasElement.prototype.getContext = getContext;
  };
}

function runningTurn(thoughts: string[] = []) {
  return {
    id: 1,
    accepted: true,
    streamBoundaryKnown: true,
    prompt: "Inspect the workspace",
    text: "",
    textDeltas: [],
    observedTextDeltas: 0,
    observedThoughtDeltas: thoughts.length,
    pendingTextDeltaSkips: 0,
    pendingThoughtDeltaSkips: 0,
    thoughts,
    tools: [],
    plan: [],
    startedAt: 1,
  };
}

describe("TurnCard rendered activity", () => {
  test("uses a compact decorative orb for an in-flight turn", () => {
    activateDom();
    disableCanvasDrawing();
    const rendered = mount(<TurnCard turn={runningTurn()} />);
    const status = rendered.container.querySelector('[role="status"]');
    const orb = status?.querySelector("canvas");

    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(orb?.getAttribute("aria-hidden")).toBe("true");
    expect(orb?.getAttribute("data-activity-state")).toBe("working");
    expect(orb?.getAttribute("aria-label")).toBe("Working…");
    expect(orb?.style.width).toBe("20px");
    expect(status?.textContent?.trim().length).toBeGreaterThan(0);
    rendered.unmount();
  });

  test("switches the orb to solving when reasoning has started", () => {
    activateDom();
    disableCanvasDrawing();
    const rendered = mount(<TurnCard turn={runningTurn(["Checking constraints"])} />);

    const orb = rendered.container.querySelector('[role="status"] canvas');
    expect(orb?.getAttribute("data-activity-state")).toBe("solving");
    expect(orb?.getAttribute("aria-label")).toBe("Solving…");
    rendered.unmount();
  });

  test("renders safe Sites links without exposing non-web resource URIs", () => {
    activateDom();
    disableCanvasDrawing();
    const turn = {
      ...runningTurn(),
      tools: [
        {
          id: "sites-1",
          title: "Deploy site",
          status: "completed",
          kind: "sites",
          outputs: [
            {
              type: "resource_link",
              name: "Sites production deployment",
              uri: "https://example.sites.openai.com/release",
              mime_type: "text/html",
            },
            {
              type: "resource_link",
              name: "Unsafe",
              uri: "javascript:alert(1)",
            },
          ],
        },
      ],
    };
    const rendered = mount(<TurnCard turn={turn} />);
    const links = rendered.container.querySelector('[aria-label="Tool links"]');

    expect(links?.textContent).toContain("Sites production deployment");
    expect(links?.textContent).toContain("example.sites.openai.com");
    expect(links?.textContent).not.toContain("Unsafe");
    expect(rendered.container.textContent).toContain("sites");
    rendered.unmount();
  });

  test("shows the prompt-row turn menu only when onSaveTemplate is wired", () => {
    activateDom();
    disableCanvasDrawing();
    // A leaked key-echo i18n mock can render the trigger label as its raw key; accept both.
    const MENU_LABELS = ["Turn actions", "templateFrom.menu"];
    const trigger = (rendered) =>
      [...rendered.container.querySelectorAll("button")].find((el) =>
        MENU_LABELS.includes(el.getAttribute("aria-label")),
      );

    const without = mount(<TurnCard turn={runningTurn()} />);
    expect(trigger(without)).toBeUndefined();
    without.unmount();

    const withMenu = mount(<TurnCard turn={runningTurn()} onSaveTemplate={() => {}} />);
    expect(trigger(withMenu)).toBeTruthy();
    withMenu.unmount();
  });
});
