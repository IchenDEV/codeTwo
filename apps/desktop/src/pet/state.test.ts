// Bun owns this focused test module; the desktop production tsconfig does not include Bun globals.
// @ts-nocheck
import { describe, expect, test } from "bun:test";

import {
  petAnimationForActivity,
  petConversationBubbleForActivity,
} from "./state";

const idle = {
  loading: false,
  running: false,
  awaitingInput: false,
  failed: false,
  completed: false,
};

describe("C2 pet session state", () => {
  test("uses the matching Codex Pet v2 rows", () => {
    expect(petAnimationForActivity(idle)).toBe("idle");
    expect(petAnimationForActivity({ ...idle, running: true })).toBe("running");
    expect(petAnimationForActivity({ ...idle, awaitingInput: true })).toBe(
      "waiting"
    );
    expect(petAnimationForActivity({ ...idle, failed: true })).toBe("failed");
    expect(petAnimationForActivity({ ...idle, completed: true })).toBe(
      "review"
    );
  });

  test("shows waiting while a busy session needs approval", () => {
    expect(
      petAnimationForActivity({
        ...idle,
        running: true,
        awaitingInput: true,
      })
    ).toBe("waiting");
    expect(
      petAnimationForActivity({ ...idle, loading: true, running: true })
    ).toBe("waiting");
  });

  test("shows normalized assistant text only during an active conversation", () => {
    expect(
      petConversationBubbleForActivity(
        { ...idle, running: true },
        "  Hello\n\nworld  "
      )
    ).toBe("Hello world");
    expect(
      petConversationBubbleForActivity(
        { ...idle, awaitingInput: true },
        "Need your choice"
      )
    ).toBe("Need your choice");
    expect(
      petConversationBubbleForActivity({ ...idle, running: true }, "   ")
    ).toBeNull();
    expect(
      petConversationBubbleForActivity(idle, "Finished response")
    ).toBeNull();
    expect(
      petConversationBubbleForActivity(
        { ...idle, completed: true },
        "Finished response"
      )
    ).toBeNull();
  });

  test("keeps the latest 160 Unicode characters for a glanceable bubble", () => {
    const bubble = petConversationBubbleForActivity(
      { ...idle, loading: true },
      `${"旧".repeat(12)}${"新".repeat(170)}`
    );

    expect([...(bubble ?? "")]).toHaveLength(160);
    expect(bubble?.startsWith("…")).toBe(true);
    expect(bubble?.endsWith("新".repeat(159))).toBe(true);
  });
});
