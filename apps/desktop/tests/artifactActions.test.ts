import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("artifact desktop actions", () => {
  test("the renderer routes Save As through the Electrobun host", () => {
    const bridge = readFileSync(
      new URL("../src/bridge.ts", import.meta.url),
      "utf8"
    );
    const main = readFileSync(
      new URL("../src/electrobun/index.ts", import.meta.url),
      "utf8"
    );

    expect(bridge).toContain("desktopSaveDialog({ defaultPath: displayName })");
    expect(main).toContain("dialogSave: saveDialog");
    expect(main).toContain("choose file name with prompt");
  });
});
