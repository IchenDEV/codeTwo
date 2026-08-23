import { describe, expect, test } from "bun:test";

import {
  providerById,
  reportedConfigOptions,
  reportedInteractionCapabilities,
} from "../src/electrobun/host/acp";

describe("Electrobun provider registry", () => {
  test("uses the Codex ACP release that advertises native steering and goals", () => {
    expect(providerById("codex")?.args).toEqual([
      "-y",
      "@agentclientprotocol/codex-acp@1.6.2",
    ]);
  });

  test("enables optional interactions only from initialize metadata", () => {
    expect(reportedInteractionCapabilities({})).toEqual({ steering: false, goal: null });
    expect(reportedInteractionCapabilities({
      _meta: {
        steering: { supported: true },
        goal: {
          version: 1,
          controlMethod: "_session/goal",
          actions: ["set", "pause", "resume", "clear"],
        },
      },
    })).toEqual({
      steering: true,
      goal: {
        controlMethod: "_session/goal",
        actions: ["set", "pause", "resume", "clear"],
      },
    });
  });

  test("keeps OpenCode V1 and V2 as distinct native ACP providers", () => {
    expect(providerById("opencode")).toMatchObject({ command: "opencode", args: ["acp"] });
    expect(providerById("opencode2")).toMatchObject({ command: "opencode2", args: ["acp"] });
  });

  test("normalizes the model-specific options reported by OpenCode 2", () => {
    expect(reportedConfigOptions({
      configOptions: [
        {
          id: "model",
          name: "Model",
          category: "model",
          currentValue: "opencode/big-pickle",
          options: [{ value: "opencode/big-pickle", name: "opencode/Big Pickle" }],
        },
        {
          id: "effort",
          name: "Effort",
          category: "thought_level",
          currentValue: "high",
          options: [{ value: "high", name: "High" }],
        },
      ],
    })).toEqual([
      {
        id: "model",
        name: "Model",
        category: "model",
        current: "opencode/big-pickle",
        choices: [{ id: "opencode/big-pickle", name: "opencode/Big Pickle", description: null }],
      },
      {
        id: "effort",
        name: "Effort",
        category: "thought_level",
        current: "high",
        choices: [{ id: "high", name: "High", description: null }],
      },
    ]);
  });
});
