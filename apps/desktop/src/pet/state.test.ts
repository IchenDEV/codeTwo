// Bun owns this focused test module; the desktop production tsconfig does not include Bun globals.
// @ts-nocheck
import { describe, expect, test } from "bun:test";

import { petAnimationForActivity } from "./state";

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
    expect(petAnimationForActivity({ ...idle, awaitingInput: true })).toBe("waiting");
    expect(petAnimationForActivity({ ...idle, failed: true })).toBe("failed");
    expect(petAnimationForActivity({ ...idle, completed: true })).toBe("review");
  });

  test("shows waiting while a busy session needs approval", () => {
    expect(
      petAnimationForActivity({
        ...idle,
        running: true,
        awaitingInput: true,
      }),
    ).toBe("waiting");
    expect(petAnimationForActivity({ ...idle, loading: true, running: true })).toBe("waiting");
  });
});
