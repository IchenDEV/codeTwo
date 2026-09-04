import { describe, expect, test } from "bun:test";

import {
  deriveAgentRoster,
  isAgentActivityTool,
} from "../src/session/agentActivity";
import {
  applyEvent,
  newTurn,
  turnsFromTranscript,
  type ToolEntry,
} from "../src/session/turns";

describe("agent activity projection", () => {
  test("keeps launch metadata across status-only live updates", () => {
    let turns = [newTurn("Review the UI")];
    turns = applyEvent(turns, {
      event: "tool_call",
      session: "session-1",
      id: "tool-1",
      title: "functions.spawn_agent",
      status: "in_progress",
      kind: "tool",
      agent_input: {
        agent_type: "explorer",
        task_name: "review_ui",
        message: "Review the rendered interface",
      },
    });
    turns = applyEvent(turns, {
      event: "tool_call",
      session: "session-1",
      id: "tool-1",
      title: "",
      status: "completed",
    });

    expect(deriveAgentRoster(turns[0].tools)).toEqual([
      {
        id: "tool-1",
        title: "Review Ui",
        role: "Explorer",
        status: "completed",
        task: "Review the rendered interface",
        startedAt: expect.any(Number),
        endedAt: expect.any(Number),
      },
    ]);
  });

  test("keeps launch metadata when replaying persisted duplicate parts", () => {
    const turns = turnsFromTranscript([
      ["user", { kind: "text", text: "Review the UI" }],
      [
        "agent",
        {
          kind: "tool_call",
          id: "tool-1",
          title: "spawn_agent",
          status: "pending",
          tool_kind: "agent",
          agent_input: { agent_type: "worker", message: "Check accessibility" },
        },
      ],
      [
        "agent",
        { kind: "tool_call", id: "tool-1", title: "", status: "completed" },
      ],
    ]);

    expect(deriveAgentRoster(turns[0].tools)[0]).toMatchObject({
      role: "Worker",
      status: "completed",
      task: "Check accessibility",
    });
  });

  test("keeps title-only launch identity when a status update changes the visible title", () => {
    let turns = [newTurn("Delegate")];
    turns = applyEvent(turns, {
      event: "tool_call",
      session: "session-1",
      id: "tool-1",
      title: "spawn_agent",
      status: "pending",
    });
    turns = applyEvent(turns, {
      event: "tool_call",
      session: "session-1",
      id: "tool-1",
      title: "Review complete",
      status: "completed",
    });

    expect(turns[0].tools[0].title).toBe("Review complete");
    expect(deriveAgentRoster(turns[0].tools)[0]).toMatchObject({
      title: "Spawn Agent",
      status: "completed",
    });
  });

  test("captures a launch title that arrives after an untitled initial call", () => {
    let turns = [newTurn("Delegate")];
    for (const [title, status] of [
      ["", "pending"],
      ["spawn_agent", "in_progress"],
      ["Review complete", "completed"],
    ] as const) {
      turns = applyEvent(turns, {
        event: "tool_call",
        session: "session-1",
        id: "tool-1",
        title,
        status,
      });
    }

    expect(deriveAgentRoster(turns[0].tools)[0]).toMatchObject({
      title: "Spawn Agent",
      status: "completed",
    });
  });

  test("retains the workflow role after a provider title update", () => {
    let turns = [newTurn("Run workflow")];
    turns = applyEvent(turns, {
      event: "tool_call",
      session: "session-1",
      id: "tool-1",
      title: "workflow",
      status: "pending",
    });
    turns = applyEvent(turns, {
      event: "tool_call",
      session: "session-1",
      id: "tool-1",
      title: "Review complete",
      status: "completed",
    });

    expect(deriveAgentRoster(turns[0].tools)[0]).toMatchObject({
      title: "Workflow",
      role: "Workflow",
      status: "completed",
    });
  });

  test("does not promote generic task tools or prose mentions", () => {
    const ordinary: ToolEntry[] = [
      { id: "1", title: "Task", status: "completed", kind: "execute" },
      {
        id: "2",
        title: "Task: compile assets",
        status: "completed",
        kind: "tool",
      },
      { id: "3", title: "Run task", status: "completed", kind: "tool" },
      {
        id: "4",
        title: "Run agent tests",
        status: "completed",
        kind: "execute",
      },
      {
        id: "5",
        title: "Start workflow server",
        status: "completed",
        kind: "execute",
      },
      {
        id: "6",
        title: "shell",
        status: "completed",
        kind: "execute",
        agentInput: { task: "mention an agent", prompt: "ordinary prompt" },
      },
    ];

    expect(ordinary.map(isAgentActivityTool)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
