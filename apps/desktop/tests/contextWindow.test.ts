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
} from "../src/session/contextWindow";
import type { ContextWindowBySession } from "../src/session/contextWindow";

const usage = (
  session: string,
  used_tokens: number,
  context_window: number
) => {
  return {
    event: "context_window" as const,
    session,
    used_tokens,
    context_window,
  };
};

describe("context window projection", () => {
  test("keeps background sessions isolated from the active projection", () => {
    let state: ContextWindowBySession = {};
    state = updateContextWindow(state, usage("active", 53_000, 200_000));
    state = updateContextWindow(state, usage("background", 2_000, 16_000));

    expect(activeContextWindow(state, "active")).toEqual({
      usedTokens: 53_000,
      contextWindow: 200_000,
      breakdown: null,
    });
    expect(activeContextWindow(state, "background")).toEqual({
      usedTokens: 2_000,
      contextWindow: 16_000,
      breakdown: null,
    });
    expect(activeContextWindow(state, "missing")).toBeNull();
  });

  test("clears only the selected session after a model change", () => {
    let state: ContextWindowBySession = {
      active: { usedTokens: 53_000, contextWindow: 200_000, breakdown: null },
      background: { usedTokens: 2_000, contextWindow: 16_000, breakdown: null },
    };
    state = clearContextWindow(state, "active");
    expect(state.active).toBeNull();
    expect(state.background).toEqual({
      usedTokens: 2_000,
      contextWindow: 16_000,
      breakdown: null,
    });
  });

  test("formats compact values and occupancy percentage", () => {
    const value = contextWindowFromEvent(usage("s", 53_000, 200_000));
    expect(value).toEqual({
      usedTokens: 53_000,
      contextWindow: 200_000,
      breakdown: null,
    });
    expect(formatContextTokens(53_000)).toBe("53k");
    expect(formatContextTokens(200_000)).toBe("200k");
    expect(contextWindowPercentage(value!)).toBe(26.5);
    expect(formatContextWindowPercentage(value!)).toBe("26.5%");
    expect(describeContextWindow(value)).toMatchObject({
      compact: "53k / 200k",
      percentage: 26.5,
    });
  });

  test("hides invalid or unsupported capacities", () => {
    expect(contextWindowFromEvent(usage("s", 1, 0))).toBeNull();
    expect(contextWindowFromEvent(usage("s", -1, 200_000))).toBeNull();
    expect(
      contextWindowFromEvent(usage("s", Number.MAX_SAFE_INTEGER + 1, 200_000))
    ).toBeNull();
    expect(
      describeContextWindow({
        usedTokens: 1,
        contextWindow: 0,
        breakdown: null,
      })
    ).toBeNull();
  });

  test("parses breakdown categories from the event", () => {
    const event = {
      event: "context_window" as const,
      session: "s",
      used_tokens: 42_300,
      context_window: 1_000_000,
      breakdown: [
        { id: "system_prompt", tokens: 3_500 },
        { id: "tool_definitions", tokens: 16_000 },
        { id: "rules", tokens: 158 },
        { id: "skills", tokens: 4_500 },
        { id: "mcp_dynamic_tools", tokens: 16_100 },
        { id: "subagent_definitions", tokens: 1_100 },
        { id: "conversation", tokens: 925 },
      ],
    };
    const value = contextWindowFromEvent(event);
    expect(value?.breakdown).toHaveLength(7);
    expect(value?.breakdown?.[0]).toEqual({
      id: "system_prompt",
      tokens: 3_500,
    });
  });

  test("ignores malformed breakdown entries", () => {
    const event = {
      event: "context_window" as const,
      session: "s",
      used_tokens: 10_000,
      context_window: 200_000,
      breakdown: [
        { id: "valid", tokens: 5_000 },
        { id: "", tokens: -1 },
        { tokens: 100 } as any,
        null as any,
      ],
    };
    const value = contextWindowFromEvent(event);
    expect(value?.breakdown).toEqual([{ id: "valid", tokens: 5_000 }]);
  });
});
