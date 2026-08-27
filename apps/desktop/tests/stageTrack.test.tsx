// @ts-nocheck
import { afterEach, describe, expect, test } from "bun:test";
import { activateDom, click, dom, flush, mount, restoreDom } from "./domTestHarness";

activateDom();
const { StageTrack } = await import("../src/session/StageTrack");
const { I18nProvider } = await import("../src/i18n");

afterEach(() => {
  dom.document.body.replaceChildren();
  restoreDom();
});

function artifact(overrides = {}) {
  return {
    id: 1,
    scene_ref: "builtin:test",
    artifact_key: "test-report",
    kind: "test_report",
    title: "Test report",
    session_id: "s1",
    pipeline_instance_id: "inst-1",
    stage_id: "test",
    artifact: {
      id: "a1",
      mime_type: "text/markdown",
      bytes: 10,
      width: 0,
      height: 0,
      display_name: "test-report.md",
    },
    version: 1,
    pinned: false,
    created_at: 0,
    ...overrides,
  };
}

function stage(overrides = {}) {
  return {
    id: "research",
    scene_ref: "research",
    title: "Research",
    state: "pending",
    gate: "suggest",
    loop_count: 0,
    sessions: [],
    artifacts: [],
    ...overrides,
  };
}

const DETAIL = {
  instance: {
    id: "inst-1",
    pipeline_ref: "builtin:rnd-lifecycle",
    project_path: "/work",
    current_stage: "test",
    status: "active",
    created_at: 0,
    updated_at: 0,
  },
  transitions: [],
  stages: [
    stage({ id: "research", title: "Research", state: "done", loop_count: 1 }),
    stage({ id: "develop", title: "Develop", state: "done", loop_count: 1 }),
    stage({
      id: "test",
      title: "Test",
      state: "current",
      loop_count: 3,
      sessions: ["s1", "s2"],
      artifacts: [
        artifact({ id: 2, version: 2 }),
        artifact({ id: 1, version: 1 }),
        artifact({ id: 3, artifact_key: "coverage", title: "Coverage", version: 1 }),
      ],
    }),
    stage({ id: "fix", title: "Fix", state: "pending" }),
    stage({ id: "acceptance", title: "Acceptance", state: "pending", gate: "confirm" }),
  ],
};

function renderTrack(handlers = {}) {
  return mount(
    <I18nProvider>
      <StageTrack detail={DETAIL} onSelectSession={handlers.onSelectSession ?? (() => {})} />
    </I18nProvider>,
  );
}

describe("StageTrack", () => {
  test("renders one chip per stage with its done/current/pending state", () => {
    const rendered = renderTrack();
    const chips = [...rendered.container.querySelectorAll("[data-testid^='stage-']")].filter(
      (el) => el.hasAttribute("data-state"),
    );
    expect(chips.length).toBe(5);
    const states = Object.fromEntries(
      chips.map((chip) => [chip.dataset.testid, chip.dataset.state]),
    );
    expect(states["stage-research"]).toBe("done");
    expect(states["stage-develop"]).toBe("done");
    expect(states["stage-test"]).toBe("current");
    expect(states["stage-fix"]).toBe("pending");
    expect(states["stage-acceptance"]).toBe("pending");
    // Titles come from the stage projection.
    expect(rendered.container.textContent).toContain("Research");
    expect(rendered.container.textContent).toContain("Acceptance");
  });

  test("loop badge appears only when a stage was entered more than once", () => {
    const rendered = renderTrack();
    const badge = rendered.container.querySelector("[data-testid='stage-loop-test']");
    expect(badge).not.toBeNull();
    // Another suite mocks useT to echo raw keys, so assert the count via the data attribute and
    // accept either the translated "×3" or the echoed key for the text itself.
    expect(badge.dataset.count).toBe("3");
    expect(["×3", "stage.loop"]).toContain(badge.textContent);
    // Single visits render no badge.
    expect(rendered.container.querySelector("[data-testid='stage-loop-research']")).toBeNull();
    expect(rendered.container.querySelector("[data-testid='stage-loop-fix']")).toBeNull();
  });

  test("confirm-gated stages carry the lock glyph", () => {
    const rendered = renderTrack();
    const locked = rendered.container.querySelector("[data-testid='stage-acceptance']");
    expect(locked.querySelector("svg")).not.toBeNull();
    // Suggest-gated pending stages have no glyph at all.
    const plain = rendered.container.querySelector("[data-testid='stage-fix']");
    expect(plain.querySelector("svg")).toBeNull();
  });

  test("clicking a stage opens its popover with artifact titles and sessions", async () => {
    const selected: string[] = [];
    const rendered = renderTrack({ onSelectSession: (id) => selected.push(id) });
    expect(dom.document.body.querySelector("[data-testid='stage-popover-test']")).toBeNull();

    click(rendered.container.querySelector("[data-testid='stage-test']"));
    await flush();
    const popover = dom.document.body.querySelector("[data-testid='stage-popover-test']");
    expect(popover).not.toBeNull();
    expect(popover.dataset.slot).toBe("popover-content");
    // Newest version per artifact key; both keys listed once.
    expect(popover.textContent).toContain("Test report");
    expect(popover.textContent).toContain("v2");
    expect(popover.textContent).toContain("Coverage");
    expect([...popover.querySelectorAll("li")].length).toBe(2);

    // Clicking a session routes through onSelectSession.
    click(popover.querySelector("[data-testid='stage-session-s2']"));
    await flush();
    expect(selected).toEqual(["s2"]);
    expect(dom.document.body.querySelector("[data-testid='stage-popover-test']")).toBeNull();

    // The standard trigger remains a toggle after the portalled layer closes.
    click(rendered.container.querySelector("[data-testid='stage-test']"));
    await flush();
    click(rendered.container.querySelector("[data-testid='stage-test']"));
    await flush();
    expect(dom.document.body.querySelector("[data-testid='stage-popover-test']")).toBeNull();
  });
});
