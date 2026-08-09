import { describe, expect, test } from "bun:test";

import {
  activeContextWindow,
  clearContextWindow,
  contextWindowFromEvent,
  contextWindowPercentage,
  describeContextWindow,
  formatContextTokens,
  formatContextWindowPercentage,
  updateContextWindow,
  type ContextWindowBySession,
} from "../src/session/contextWindow";

const usage = (session: string, used_tokens: number, context_window: number) => ({
  event: "context_window" as const,
  session,
  used_tokens,
  context_window,
});

describe("context window projection", () => {
  test("keeps background sessions isolated from the active projection", () => {
    let state: ContextWindowBySession = {};
    state = updateContextWindow(state, usage("active", 53_000, 200_000));
    state = updateContextWindow(state, usage("background", 2_000, 16_000));

    expect(activeContextWindow(state, "active")).toEqual({
      usedTokens: 53_000,
      contextWindow: 200_000,
    });
    expect(activeContextWindow(state, "background")).toEqual({
      usedTokens: 2_000,
      contextWindow: 16_000,
    });
    expect(activeContextWindow(state, "missing")).toBeNull();
  });

  test("clears only the selected session after a model change", () => {
    let state: ContextWindowBySession = {
      active: { usedTokens: 53_000, contextWindow: 200_000 },
      background: { usedTokens: 2_000, contextWindow: 16_000 },
    };
    state = clearContextWindow(state, "active");
    expect(state.active).toBeNull();
    expect(state.background).toEqual({ usedTokens: 2_000, contextWindow: 16_000 });
  });

  test("formats compact values and occupancy percentage", () => {
    const value = contextWindowFromEvent(usage("s", 53_000, 200_000));
    expect(value).toEqual({ usedTokens: 53_000, contextWindow: 200_000 });
    expect(formatContextTokens(53_000)).toBe("53k");
    expect(formatContextTokens(200_000)).toBe("200k");
    expect(contextWindowPercentage(value!)).toBe(26.5);
    expect(formatContextWindowPercentage(value!)).toBe("26.5%");
    expect(describeContextWindow(value)).toMatchObject({ compact: "53k / 200k", percentage: 26.5 });
  });

  test("hides invalid or unsupported capacities", () => {
    expect(contextWindowFromEvent(usage("s", 1, 0))).toBeNull();
    expect(contextWindowFromEvent(usage("s", -1, 200_000))).toBeNull();
    expect(contextWindowFromEvent(usage("s", Number.MAX_SAFE_INTEGER + 1, 200_000))).toBeNull();
    expect(describeContextWindow({ usedTokens: 1, contextWindow: 0 })).toBeNull();
  });
});
