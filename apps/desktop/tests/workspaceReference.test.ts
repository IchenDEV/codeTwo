import { describe, expect, test } from "bun:test";
import { workspaceReferenceBlock } from "../src/editor/workspaceReference";
import { imageTypeOf, isAgentImagePath } from "../src/files/imageTypes";

describe("workspace references", () => {
  test("sends supported image mentions as pixels instead of decoding them as text", () => {
    expect(workspaceReferenceBlock("screens/Result.PNG")).toEqual({
      type: "image",
      path: "screens/Result.PNG",
    });
    expect(workspaceReferenceBlock("src/main.rs")).toEqual({
      type: "file",
      path: "src/main.rs",
    });
  });

  test("keeps preview-only formats out of provider image blocks", () => {
    expect(imageTypeOf("assets/icon.avif")).toBe("image/avif");
    expect(isAgentImagePath("assets/icon.avif")).toBe(false);
    expect(isAgentImagePath("assets/icon.webp")).toBe(true);
  });
});
