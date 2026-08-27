// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, flush, mount, restoreDom } from "./domTestHarness";

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
    expect(rendered.container.querySelector('[data-slot="status-badge"]')?.getAttribute("data-tone")).toBe("neutral");
    rendered.unmount();
  });

  test("uses the destructive status tone for a failed turn", () => {
    activateDom();
    disableCanvasDrawing();
    const rendered = mount(
      <I18nProvider>
        <TurnCard turn={{ ...runningTurn(), endedAt: 2, error: "Provider failed" }} />
      </I18nProvider>,
    );

    const badge = rendered.container.querySelector('[data-slot="status-badge"]');
    expect(badge?.getAttribute("data-tone")).toBe("destructive");
    expect(badge?.textContent).toContain("failed");
    rendered.unmount();
  });

  test("groups subagents by state without repeating them as ordinary tool calls", () => {
    activateDom();
    disableCanvasDrawing();
    const turn = {
      ...runningTurn(),
      text: "Delegated checks are in progress.",
      tools: [
        {
          id: "agent-active",
          title: "spawn_agent",
          status: "in_progress",
          kind: "agent",
          agentInput: {
            agent_type: "explorer",
            task_name: "accessibility_review",
            message: "Check the status announcements.",
          },
          startedAt: Date.now() - 8_000,
        },
        {
          id: "agent-complete",
          title: "spawn_agent",
          status: "completed",
          kind: "agent",
          agentInput: {
            agent_type: "worker",
            task_name: "narrow_layout",
            message: "Verify the narrow transcript layout.",
          },
          startedAt: 1_000,
          endedAt: 17_000,
        },
        {
          id: "agent-failed",
          title: "spawn_agent",
          status: "failed",
          kind: "agent",
          agentInput: {
            agent_type: "worker",
            task_name: "renderer_tests",
            message: "Run renderer tests.",
          },
          startedAt: 2_000,
          endedAt: 13_000,
        },
        { id: "read-1", title: "Read workspace", status: "completed", kind: "read" },
      ],
      content: [
        { kind: "text", text: "Delegated checks are in progress." },
        { kind: "tool", toolId: "agent-active" },
        { kind: "tool", toolId: "agent-complete" },
        { kind: "tool", toolId: "agent-failed" },
        { kind: "tool", toolId: "read-1" },
      ],
    };
    const rendered = mount(
      <I18nProvider>
        <TurnCard turn={turn} />
      </I18nProvider>,
    );

    const roster = rendered.container.querySelector("[data-agent-roster]");
    const rosterTrigger = [...rendered.container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("agents (3)"),
    );

    expect(rosterTrigger?.getAttribute("aria-expanded")).toBe("true");
    expect(roster?.textContent).toContain("Active1");
    expect(roster?.textContent).toContain("Finished2");
    expect(roster?.textContent).toContain("Accessibility Review");
    expect(roster?.textContent).toContain("running");
    expect(roster?.textContent).toContain("Narrow Layout");
    expect(roster?.textContent).toContain("completed16s");
    expect(roster?.textContent).toContain("Renderer Tests");
    expect(roster?.textContent).toContain("failed11s");
    expect(rendered.container.querySelector('[data-tool-call="read-1"]')).not.toBeNull();
    expect(rendered.container.querySelector('[data-tool-call="agent-active"]')).toBeNull();
    expect(rendered.container.querySelectorAll("[data-agent-row]")).toHaveLength(3);
    rendered.unmount();
  });

  test("renders attached prompt images instead of image placeholder text", () => {
    activateDom();
    disableCanvasDrawing();
    const rendered = mount(
      <TurnCard
        turn={{
          ...runningTurn(),
          prompt: "Improve image rendering\n\n[image:image.png]\n\n[image:image.png]",
          promptImages: [
            {
              id: "image-1",
              name: "image.png",
              previewDataUrl: "data:image/png;base64,aW1hZ2UtMQ==",
              width: 800,
              height: 600,
            },
            {
              id: "image-2",
              name: "image.png",
              previewDataUrl: "data:image/png;base64,aW1hZ2UtMg==",
              width: 600,
              height: 800,
            },
          ],
        }}
      />,
    );

    const images = rendered.container.querySelectorAll("[data-prompt-image] img");
    expect(images).toHaveLength(2);
    expect(images[0].getAttribute("alt")).toBe("image.png");
    expect(rendered.container.textContent).toContain("Improve image rendering");
    expect(rendered.container.textContent).not.toContain("[image:");
    rendered.unmount();
  });

  test("keeps safe Sites links collapsed by default and reveals them on demand", async () => {
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
    const trigger = rendered.container.querySelector('[data-slot="collapsible-trigger"]');

    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(rendered.container.querySelector('[aria-label="Tool links"]')).toBeNull();

    click(trigger!);
    await flush();

    const links = rendered.container.querySelector('[aria-label="Tool links"]');

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
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

  test("renders workspace file references as links that open at their source position", () => {
    activateDom();
    disableCanvasDrawing();
    const opened = [];
    const rendered = mount(
      <TurnCard
        turn={{
          ...runningTurn(),
          text:
            "[Docs](https://example.com/docs) · [Source](/tmp/project/src/main.ts:42:7) · [Encoded](file:///tmp/project/src/encoded%20file.ts#L8)",
          endedAt: 2,
        }}
        linkActions={{
          workspaceRoot: "/tmp/project",
          openFileLink: (target) => opened.push(target),
        }}
      />,
    );
    const links = rendered.container.querySelectorAll(".codetwo-markdown a");

    expect(links).toHaveLength(3);
    expect(links[0].getAttribute("href")).toBe("https://example.com/docs");
    expect(links[1].textContent).toBe("Source");
    click(links[1]);
    click(links[2]);
    expect(opened).toEqual([
      { kind: "file", path: "/tmp/project/src/main.ts", line: 42, column: 7 },
      { kind: "file", path: "/tmp/project/src/encoded file.ts", line: 8, column: undefined },
    ]);
    rendered.unmount();
  });

  test("collapses adjacent tool calls into one group without hiding failures", async () => {
    activateDom();
    disableCanvasDrawing();
    const turn = {
      ...runningTurn(),
      text: "BeforeAfter",
      content: [
        { kind: "text", text: "Before", transcriptSeq: 11 },
        { kind: "tool", toolId: "read-1", transcriptSeq: 12 },
        { kind: "tool", toolId: "test-1", transcriptSeq: 13 },
        { kind: "text", text: "After", transcriptSeq: 14 },
      ],
      tools: [
        {
          id: "read-1",
          title: "Read workspace",
          status: "completed",
          outputs: [{ type: "text", text: "Workspace read" }],
        },
        { id: "test-1", title: "Run tests", status: "failed" },
      ],
      endedAt: 2,
    };
    const rendered = mount(
      <I18nProvider>
        <TurnCard turn={turn} />
      </I18nProvider>,
    );
    const group = rendered.container.querySelector("[data-tool-call-group]");
    const trigger = group?.querySelector("button");
    const ordered = [
      ...rendered.container.querySelectorAll(".codetwo-markdown, [data-tool-call-group]"),
    ];

    expect(ordered).toHaveLength(3);
    expect(ordered[0].textContent).toContain("Before");
    expect(ordered[1]).toBe(group);
    expect(ordered[2].textContent).toContain("After");
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.textContent).toContain("Run tests");
    expect(trigger?.textContent).toContain("tools (2)");
    expect(trigger?.textContent).toContain("failed");
    expect(group?.querySelectorAll("[data-tool-call]")).toHaveLength(0);

    click(trigger!);
    await flush();

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(group?.querySelectorAll("[data-tool-call]")).toHaveLength(1);
    expect(group?.textContent).toContain("Read workspace");
    expect(group?.textContent).toContain("Run tests");
    rendered.unmount();
  });

  test("keeps an active tool history open with a bounded Codex-style fade", () => {
    activateDom();
    disableCanvasDrawing();
    const tools = Array.from({ length: 8 }, (_, index) => ({
      id: `tool-${index}`,
      title: index === 7 ? "Searching current styles" : `Read file ${index + 1}`,
      status: index === 7 ? "in_progress" : "completed",
      kind: index === 7 ? "search" : "read",
    }));
    const rendered = mount(
      <I18nProvider>
        <TurnCard
          turn={{
            ...runningTurn(),
            tools,
            content: tools.map((tool) => ({ kind: "tool", toolId: tool.id })),
          }}
        />
      </I18nProvider>,
    );
    const group = rendered.container.querySelector("[data-tool-call-group]");
    const trigger = group?.querySelector("button");
    const history = group?.querySelector("[data-tool-call-history]");

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(trigger?.textContent).toContain("Searching current styles");
    expect(history?.getAttribute("data-faded")).toBe("true");
    expect(history?.classList.contains("tool-call-history--faded")).toBe(true);
    expect(history?.querySelectorAll("[data-tool-call]")).toHaveLength(7);
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
