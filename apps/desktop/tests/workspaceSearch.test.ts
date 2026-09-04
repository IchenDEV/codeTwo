import { describe, expect, test } from "bun:test";

import { workspaceSearchTruncationLabel } from "../src/files/WorkspaceSearch";

describe("workspace search presentation", () => {
  test("preserves every core truncation reason instead of implying a complete result", () => {
    expect(workspaceSearchTruncationLabel("result_limit,per_file_limit")).toBe(
      "the result limit, the per-file result limit"
    );
    expect(workspaceSearchTruncationLabel("unsupported_content_encoding")).toBe(
      "an unsupported content encoding"
    );
  });

  test("keeps unknown and absent reasons truthful", () => {
    expect(workspaceSearchTruncationLabel("future_limit")).toBe(
      "a resource limit"
    );
    expect(workspaceSearchTruncationLabel(null)).toBe("a resource limit");
  });
});
