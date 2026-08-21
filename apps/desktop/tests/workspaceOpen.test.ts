import { describe, expect, test } from "bun:test";

import { workspaceOpenCommand } from "../src/electrobun/workspaceOpen";
import type { WorkspaceOpenTarget } from "../src/electrobun/rpc";

describe("workspaceOpenCommand", () => {
  test("builds argv-safe macOS editor launcher commands", () => {
    const path = "/tmp/project with spaces";

    expect(workspaceOpenCommand(path, "cursor", "darwin")).toEqual([
      "/usr/bin/open",
      "-a",
      "Cursor",
      path,
    ]);
    expect(workspaceOpenCommand(path, "antigravity", "darwin")).toEqual([
      "/usr/bin/open",
      "-a",
      "Antigravity",
      path,
    ]);
  });

  test("leaves Finder to the native path API and rejects unsupported targets", () => {
    expect(workspaceOpenCommand("/tmp/project", "finder", "darwin")).toBeNull();
    expect(workspaceOpenCommand("/tmp/project", "cursor", "linux")).toBeNull();
    expect(
      workspaceOpenCommand("/tmp/project", "unsupported" as WorkspaceOpenTarget, "darwin"),
    ).toBeNull();
  });
});
