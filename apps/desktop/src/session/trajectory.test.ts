import { describe, expect, test } from "bun:test";

import { deriveTrajectory, filterTrajectory, formatTrajectoryDuration } from "./trajectory";
import { newTurn } from "./turns";

describe("trajectory projection", () => {
  test("collapses streamed text around one timed tool call", () => {
    const turn = newTurn("Inspect the workspace");
    turn.accepted = true;
    turn.startedAt = 1_000;
    turn.endedAt = 5_000;
    turn.text = "Checking.Done.";
    turn.textDeltas = ["Checking.", "Done."];
    turn.tools = [{
      id: "read-1",
      title: "Read files",
      status: "completed",
      startedAt: 2_000,
      endedAt: 4_000,
      agentInput: { path: "." },
      outputs: [{ type: "text", text: "a.ts" }],
    }];
    turn.content = [
      { kind: "text", text: "Checking.", createdAt: 1_500 },
      { kind: "tool", toolId: "read-1", createdAt: 4_000 },
      { kind: "text", text: "Done.", createdAt: 4_500 },
    ];

    const records = deriveTrajectory([turn], 6_000);
    expect(records.map((record) => record.kind)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(records[2]).toMatchObject({ startAt: 2_000, endAt: 4_000, step: 1 });
    expect(records[3]).toMatchObject({ summary: "Done.", step: 2, running: false });
  });

  test("filters the dense ledger without changing stable indices", () => {
    const turn = newTurn("Run tests");
    turn.accepted = true;
    turn.startedAt = 1_000;
    turn.endedAt = 2_000;
    turn.error = "Tests failed";

    const records = deriveTrajectory([turn]);
    expect(filterTrajectory(records, "error", "failed")).toEqual([
      expect.objectContaining({ kind: "error", index: 2 }),
    ]);
  });

  test("formats profiler durations compactly", () => {
    expect(formatTrajectoryDuration(240)).toBe("240 ms");
    expect(formatTrajectoryDuration(1_250)).toBe("1.3 s");
    expect(formatTrajectoryDuration(65_000)).toBe("1m 5s");
    expect(formatTrajectoryDuration(119_900)).toBe("2m 0s");
  });
});
