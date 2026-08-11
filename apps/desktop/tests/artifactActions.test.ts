import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("artifact desktop actions", () => {
  test("the main window is allowed to open the native Save As dialog", () => {
    const capability = JSON.parse(
      readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
    ) as { permissions: string[] };
    expect(capability.permissions).toContain("dialog:allow-save");
  });
});
