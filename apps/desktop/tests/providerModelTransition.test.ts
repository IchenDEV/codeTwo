import { describe, expect, test } from "bun:test";
import { transitionProviderModelSelection } from "../src/session/config";

describe("App Provider/model draft transition", () => {
  test("creates a fresh draft before applying a foreign Provider model", () => {
    const events: string[] = [];

    const changed = transitionProviderModelSelection({
      hasActiveSession: true,
      createSession: () => {
        events.push("create");
        return "/tmp/project";
      },
      apply: () => events.push("apply:grok:grok-4.6"),
    });

    expect(changed).toBe(true);
    expect(events).toEqual(["create", "apply:grok:grok-4.6"]);
  });

  test("leaves Provider and model untouched when draft creation fails", () => {
    const events: string[] = [];

    const changed = transitionProviderModelSelection({
      hasActiveSession: true,
      createSession: () => {
        events.push("create:failed");
        return null;
      },
      apply: () => events.push("apply"),
    });

    expect(changed).toBe(false);
    expect(events).toEqual(["create:failed"]);
  });

  test("applies directly when the Composer already owns a blank draft", () => {
    const events: string[] = [];

    const changed = transitionProviderModelSelection({
      hasActiveSession: false,
      createSession: () => {
        events.push("unexpected-create");
        return null;
      },
      apply: () => events.push("apply:codex:gpt-5.6-sol"),
    });

    expect(changed).toBe(true);
    expect(events).toEqual(["apply:codex:gpt-5.6-sol"]);
  });
});
