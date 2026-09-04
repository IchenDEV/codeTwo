import { describe, expect, test } from "bun:test";

import {
  deriveTrajectory,
  filterTrajectory,
  formatTrajectoryDuration,
} from "./trajectory";
import { newTurn } from "./turns";

describe("trajectory projection", () => {
  test("collapses streamed text around one timed tool call", () => {
    const turn = newTurn("Inspect the workspace");
    turn.accepted = true;
    turn.startedAt = 1000;
    turn.endedAt = 5000;
    turn.text = "Checking.Done.";
    turn.textDeltas = ["Checking.", "Done."];
    turn.tools = [
      {
        agentInput: { path: "." },
        endedAt: 4000,
        id: "read-1",
        outputs: [{ text: "a.ts", type: "text" }],
        startedAt: 2000,
        status: "completed",
        title: "Read files",
      },
    ];
    turn.content = [
      { createdAt: 1500, kind: "text", text: "Checking." },
      { createdAt: 4000, kind: "tool", toolId: "read-1" },
      { createdAt: 4500, kind: "text", text: "Done." },
    ];

    const records = deriveTrajectory([turn], 6000);
    expect(records.map((record) => record.kind)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(records[2]).toMatchObject({ endAt: 4000, startAt: 2000, step: 1 });
    expect(records[3]).toMatchObject({
      running: false,
      step: 2,
      summary: "Done.",
    });
  });

  test("filters the dense ledger without changing stable indices", () => {
    const turn = newTurn("Run tests");
    turn.accepted = true;
    turn.startedAt = 1000;
    turn.endedAt = 2000;
    turn.error = "Tests failed";

    const records = deriveTrajectory([turn]);
    expect(filterTrajectory(records, "error", "failed")).toEqual([
      expect.objectContaining({ index: 2, kind: "error" }),
    ]);
  });

  test("formats profiler durations compactly", () => {
    expect(formatTrajectoryDuration(240)).toBe("240 ms");
    expect(formatTrajectoryDuration(1250)).toBe("1.3 s");
    expect(formatTrajectoryDuration(65_000)).toBe("1m 5s");
    expect(formatTrajectoryDuration(119_900)).toBe("2m 0s");
  });
});
