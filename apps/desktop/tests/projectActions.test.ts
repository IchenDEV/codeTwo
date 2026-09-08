import { describe, expect, test } from "bun:test";

import {
  projectActionBindings,
  projectActionId,
  projectActionIssue,
} from "../src/session/projectActions";
import type { ProjectActionDraft } from "../src/session/projectActions";

const draft: ProjectActionDraft = {
  name: "Test",
  kind: "command",
  command: "bun test",
  prompt: "",
  keybinding: "Mod+Shift+T",
  preview_url: "http://localhost:5173",
  run_on_worktree_create: false,
  open_preview: true,
};

describe("project actions", () => {
  test("creates stable unique ids", () => {
    expect(projectActionId(" Test suite ", [])).toBe("test-suite");
    expect(projectActionId("Test suite", [{ id: "test-suite" } as never])).toBe(
      "test-suite-2"
    );
    expect(projectActionId("测试", [])).toBe("action");
  });

  test("validates preview URLs and shortcut conflicts", () => {
    expect(projectActionIssue(draft, [], [])).toBeNull();
    expect(
      projectActionIssue(
        { ...draft, preview_url: "javascript:alert(1)" },
        [],
        []
      )
    ).toEqual({ issue: "preview_invalid" });
    expect(
      projectActionIssue(draft, [["run", "Mod+Shift+T", "Run prompt"]], [])
    ).toEqual({ issue: "keybinding_conflict", conflict: "Run prompt" });
  });

  test("validates the payload required by each action type", () => {
    expect(projectActionIssue({ ...draft, command: "" }, [], [])).toEqual({
      issue: "command_required",
    });
    expect(
      projectActionIssue(
        { ...draft, kind: "prompt", command: "", prompt: "Review this" },
        [],
        []
      )
    ).toBeNull();
    expect(
      projectActionIssue(
        { ...draft, kind: "prompt", command: "", prompt: "" },
        [],
        []
      )
    ).toEqual({ issue: "prompt_required" });
  });

  test("projects action shortcuts into the shared keymap contract", () => {
    expect(
      projectActionBindings([
        { id: "test", name: "Test", keybinding: "Mod+Shift+T" } as never,
        { id: "no-key", name: "No key", keybinding: "" } as never,
      ])
    ).toEqual([["project_action:test", "Mod+Shift+T", "Test"]]);
  });
});
