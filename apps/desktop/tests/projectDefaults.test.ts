import { describe, expect, test } from "bun:test";

import {
  nextSessionWorktreeBaseline,
  projectSwitchWorktreeBaseline,
  projectWorktreeBaseline,
} from "../src/session/projectDefaults";

describe("project worktree defaults", () => {
  test("keeps inherit distinct from an explicit local checkout", () => {
    expect(projectWorktreeBaseline(null)).toBeUndefined();
    expect(projectWorktreeBaseline("local")).toBeNull();
    expect(projectWorktreeBaseline("current")).toBe("current");
    expect(projectWorktreeBaseline("origin_default")).toBe("origin_default");
  });

  test("starts a switched project locally unless it has an explicit preference", () => {
    expect(projectSwitchWorktreeBaseline(null)).toBeNull();
    expect(projectSwitchWorktreeBaseline("current")).toBe("current");
  });

  test("project preference wins while automatic mode preserves the previous baseline kind", () => {
    expect(nextSessionWorktreeBaseline(null, "origin_default")).toBe(
      "origin_default"
    );
    expect(nextSessionWorktreeBaseline("local", "origin_default")).toBeNull();
    expect(nextSessionWorktreeBaseline("current", null)).toBe("current");
  });
});
