// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, dom, mount, restoreDom } from "./domTestHarness";

activateDom();
const { TurnCard } = await import("../src/session/TurnCard");
const { I18nProvider } = await import("../src/i18n");

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

  test("renders a queued prompt as waiting instead of active work", () => {
    activateDom();
    disableCanvasDrawing();
    const rendered = mount(
      <I18nProvider>
        <TurnCard
          turn={{
            ...runningTurn(),
            accepted: false,
            delivery: "queued",
            queuePosition: 2,
          }}
        />
      </I18nProvider>,
    );

    expect(rendered.container.querySelector("article")?.getAttribute("aria-busy")).toBe("false");
    expect(rendered.container.querySelector('[role="status"]')).toBeNull();
    expect(rendered.container.textContent).toContain("queued #2");
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
    const rendered = mount(
      <I18nProvider>
        <TurnCard turn={turn} />
      </I18nProvider>,
    );
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

  test("renders Markdown and keeps a tool call between streamed text segments", () => {
    activateDom();
    disableCanvasDrawing();
    const turn = {
      ...runningTurn(),
      text: "**Before**After",
      textDeltas: ["**Before**", "After"],
      content: [
        { kind: "text", text: "**Before**", transcriptSeq: 11 },
        { kind: "tool", toolId: "tool-1", transcriptSeq: 12 },
        { kind: "text", text: "After", transcriptSeq: 14 },
      ],
      tools: [{ id: "tool-1", title: "Read workspace", status: "completed" }],
      endedAt: 2,
    };
    const rendered = mount(<TurnCard turn={turn} />);
    const ordered = [...rendered.container.querySelectorAll(".codetwo-markdown, [data-tool-call]")];

    expect(ordered).toHaveLength(3);
    expect(ordered[0].textContent).toContain("Before");
    expect(ordered[0].querySelector("strong")?.textContent).toBe("Before");
    expect(ordered[1].getAttribute("data-tool-call")).toBe("tool-1");
    expect(ordered[2].textContent).toContain("After");
    rendered.unmount();
  });

  test("renders a valid fenced chart as an accessible SVG", () => {
    activateDom();
    disableCanvasDrawing();
    const source = `\`\`\`chart\n${JSON.stringify({
      type: "bar",
      title: "Build time",
      xLabel: "Release",
      yLabel: "Seconds",
      labels: ["1.0", "1.1"],
      series: [{ name: "Desktop", values: [42, 31] }],
    })}\n\`\`\``;
    const turn = {
      ...runningTurn(),
      text: source,
      textDeltas: [source],
      content: [{ kind: "text", text: source, transcriptSeq: 11 }],
      endedAt: 2,
    };
    const rendered = mount(
      <I18nProvider>
        <TurnCard turn={turn} />
      </I18nProvider>,
    );
    const chart = rendered.container.querySelector("[data-chart-block]");
    const svg = chart?.querySelector('svg[role="img"]');

    expect(chart?.textContent).toContain("Build time");
    expect(svg?.getAttribute("aria-label")).toContain("Bar chart");
    expect(svg?.querySelectorAll("rect").length).toBeGreaterThan(1);
    rendered.unmount();
  });
});
