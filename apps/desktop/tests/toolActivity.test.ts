import { describe, expect, test } from "bun:test";

import {
  activeInteractivePreview,
  classifyToolSurface,
  followReduce,
  initialFollowState,
  type FollowEvent,
  type FollowState,
  type ToolSurfaceHint,
} from "../src/session/toolActivity";
import type { Turn } from "../src/session/turns";
import type { DockSurface } from "../src/dock/Dock";

describe("classifyToolSurface", () => {
  const cases: {
    name: string;
    tool: { kind?: string | null; title: string; agentInput?: unknown };
    expected: ToolSurfaceHint | null;
  }[] = [
    {
      name: "execute-kind bash goes to the terminal",
      tool: { kind: "execute", title: "bash" },
      expected: { surface: "terminal" },
    },
    {
      name: "a test run reads as terminal work",
      tool: { title: "cargo test" },
      expected: { surface: "terminal" },
    },
    {
      name: "shell command titles go to the terminal without a kind",
      tool: { title: "run_command" },
      expected: { surface: "terminal" },
    },
    {
      name: "an edit with file_path lands on files with the path",
      tool: {
        kind: "edit",
        title: "Edit",
        agentInput: { file_path: "src/App.tsx" },
      },
      expected: { surface: "files", file: "src/App.tsx" },
    },
    {
      name: "apply_patch with a nested path still extracts the file",
      tool: {
        title: "apply_patch",
        agentInput: { arguments: { path: "crates/core/src/lib.rs" } },
      },
      expected: { surface: "files", file: "crates/core/src/lib.rs" },
    },
    {
      name: "a write tool with JSON-string input extracts filename",
      tool: { title: "write_file", agentInput: '{"filename":"notes.md"}' },
      expected: { surface: "files", file: "notes.md" },
    },
    {
      name: "an edit kind without a usable path is still files",
      tool: { kind: "edit", title: "Edit", agentInput: { diff: "…" } },
      expected: { surface: "files" },
    },
    {
      name: "git commit goes to the git surface",
      tool: { title: 'git commit -m "feat: x"' },
      expected: { surface: "git" },
    },
    {
      name: "git commit run through a shell still reads as git",
      tool: { kind: "execute", title: "git status" },
      expected: { surface: "git" },
    },
    {
      name: "reads never move the dock",
      tool: { kind: "read", title: "Read file" },
      expected: null,
    },
    {
      name: "grep is a read, not a follow target",
      tool: { title: "grep" },
      expected: null,
    },
    {
      name: "search kinds are ignored",
      tool: { kind: "search", title: "Search codebase" },
      expected: null,
    },
    {
      name: "fetch kinds are ignored",
      tool: { kind: "fetch", title: "fetch https://example.com" },
      expected: null,
    },
    {
      name: "thinking is ignored",
      tool: { kind: "think", title: "Thinking" },
      expected: null,
    },
    {
      name: "unknown tools are never followed",
      tool: { title: "mysterious_provider_tool" },
      expected: null,
    },
  ];

  for (const { name, tool, expected } of cases) {
    test(name, () => {
      expect(classifyToolSurface(tool)).toEqual(expected);
    });
  }
});

describe("activeInteractivePreview", () => {
  const artifact = (id: string) => ({
    id,
    mime_type: "image/png",
    bytes: 100,
    width: 1280,
    height: 720,
    display_name: `${id}.png`,
  });
  const turn = (overrides: Partial<Turn> = {}): Turn => ({
    id: 1,
    accepted: true,
    streamBoundaryKnown: true,
    prompt: "Inspect the page",
    text: "",
    textDeltas: [],
    observedTextDeltas: 0,
    observedThoughtDeltas: 0,
    pendingTextDeltaSkips: 0,
    pendingThoughtDeltaSkips: 0,
    thoughts: [],
    tools: [],
    content: [],
    plan: [],
    startedAt: 1,
    ...overrides,
  });

  test("uses the latest screenshot from an in-flight Browser Use call", () => {
    expect(
      activeInteractivePreview([
        turn({
          tools: [
            {
              id: "browser-1",
              title: "Open example.com",
              kind: "browser_use",
              status: "in_progress",
              outputs: [
                { type: "image", artifact: artifact("shot-1") },
                { type: "image", artifact: artifact("shot-2") },
              ],
            },
          ],
        }),
      ])
    ).toEqual({
      kind: "browser",
      title: "Open example.com",
      artifact: artifact("shot-2"),
    });
  });

  test("keeps a completed Browser Use screenshot until the current agent turn ends", () => {
    expect(
      activeInteractivePreview([
        turn({
          tools: [
            {
              id: "browser-1",
              title: "Take screenshot",
              kind: "browser_use",
              status: "completed",
              outputs: [{ type: "image", artifact: artifact("settled-shot") }],
              endedAt: 8,
            },
          ],
        }),
      ])
    ).toEqual({
      kind: "browser",
      title: "Take screenshot",
      artifact: artifact("settled-shot"),
    });
  });

  test("labels the retained screenshot with the latest same-kind activity", () => {
    expect(
      activeInteractivePreview([
        turn({
          tools: [
            {
              id: "browser-1",
              title: "Take screenshot",
              kind: "browser_use",
              status: "completed",
              outputs: [{ type: "image", artifact: artifact("last-shot") }],
              endedAt: 8,
            },
            {
              id: "browser-2",
              title: "Open the checkout page",
              kind: "browser_use",
              status: "in_progress",
              outputs: [],
            },
          ],
        }),
      ])
    ).toEqual({
      kind: "browser",
      title: "Open the checkout page",
      artifact: artifact("last-shot"),
    });
  });

  test("recognizes Computer Use while excluding finished and unrelated image tools", () => {
    const completedBrowser = turn({
      endedAt: 10,
      tools: [
        {
          id: "browser-done",
          title: "Browser Use",
          kind: "browser_use",
          status: "completed",
          outputs: [{ type: "image", artifact: artifact("old-shot") }],
          endedAt: 10,
        },
      ],
    });
    const activeImageGeneration = turn({
      tools: [
        {
          id: "imagegen",
          title: "Image generation",
          kind: "image_generation",
          status: "in_progress",
          outputs: [{ type: "image", artifact: artifact("generated") }],
        },
      ],
    });
    const activeComputer = turn({
      id: 3,
      tools: [
        {
          id: "computer-1",
          title: "Computer Use",
          kind: "computer_use",
          status: "in_progress",
          outputs: [{ type: "image", artifact: artifact("desktop-shot") }],
        },
      ],
    });

    expect(
      activeInteractivePreview([
        completedBrowser,
        activeImageGeneration,
        activeComputer,
      ])
    ).toEqual({
      kind: "computer",
      title: "Computer Use",
      artifact: artifact("desktop-shot"),
    });
    expect(
      activeInteractivePreview([completedBrowser, activeImageGeneration])
    ).toBeNull();
  });
});

describe("followReduce", () => {
  const hint = (surface: DockSurface, file?: string): ToolSurfaceHint =>
    file === undefined ? { surface } : { surface, file };
  const tool = (
    surface: DockSurface,
    now: number,
    dockOpen = true
  ): FollowEvent => ({
    kind: "tool",
    hint: hint(surface),
    now,
    dockOpen,
  });

  function run(events: FollowEvent[], from: FollowState = initialFollowState) {
    let state = from;
    const emitted: DockSurface[] = [];
    for (const event of events) {
      const result = followReduce(state, event);
      state = result.state;
      if (result.setTab) emitted.push(result.setTab);
    }
    return { state, emitted };
  }

  test("an open dock follows the agent's surface", () => {
    const { state, emitted } = run([tool("terminal", 10_000)]);
    expect(emitted).toEqual(["terminal"]);
    expect(state.autoTab).toBe("terminal");
    expect(state.lastSwitchAt).toBe(10_000);
  });

  test("a manual choice during a run suppresses auto-follow until the run ends", () => {
    const latched = run([{ kind: "manual", tab: "git" }]);
    expect(latched.state.manualLatched).toBe(true);
    expect(latched.state.autoTab).toBeNull();

    // awaiting_input produces no follow event at all, so the latch simply persists across it.
    const during = run(
      [tool("files", 20_000), tool("terminal", 30_000)],
      latched.state
    );
    expect(during.emitted).toEqual([]);
    expect(during.state.manualLatched).toBe(true);

    const released = run([{ kind: "run_ended" }], during.state);
    expect(released.state.manualLatched).toBe(false);

    const after = run([tool("files", 40_000)], released.state);
    expect(after.emitted).toEqual(["files"]);
  });

  test("a closed dock records the surface but never opens", () => {
    const { state, emitted } = run([
      tool("terminal", 10_000, false),
      tool("files", 20_000, false),
    ]);
    expect(emitted).toEqual([]);
    expect(state.autoTab).toBe("files");
  });

  test("switches are debounced to one per 2000ms, then allowed again", () => {
    const { state, emitted } = run([
      tool("terminal", 10_000),
      tool("files", 11_000),
      tool("files", 11_999),
      tool("files", 13_000),
    ]);
    expect(emitted).toEqual(["terminal", "files"]);
    expect(state.lastSwitchAt).toBe(13_000);
  });

  test("the same surface never re-emits", () => {
    const { emitted } = run([
      tool("terminal", 10_000),
      tool("terminal", 20_000),
    ]);
    expect(emitted).toEqual(["terminal"]);
  });

  test("a session switch resets latch and badge alike", () => {
    const before = run([
      tool("terminal", 10_000),
      { kind: "manual", tab: "git" },
    ]);
    expect(before.state.manualLatched).toBe(true);

    const reset = run([{ kind: "session_switched" }], before.state);
    expect(reset.state).toEqual(initialFollowState);

    const after = run([tool("files", 20_000)], reset.state);
    expect(after.emitted).toEqual(["files"]);
  });
});
