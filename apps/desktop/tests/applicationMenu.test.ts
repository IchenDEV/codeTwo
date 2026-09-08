import { describe, expect, test } from "bun:test";

import { macOSApplicationMenu } from "../src/electrobun/applicationMenu";

describe("macOS application menu", () => {
  test("exposes native responder roles for text and image paste", () => {
    const editMenu = macOSApplicationMenu().find(
      (item) => "label" in item && item.label === "Edit"
    );
    const roles =
      editMenu && "submenu" in editMenu
        ? editMenu.submenu?.flatMap((item) =>
            "role" in item ? [item.role] : []
          )
        : [];

    expect(roles).toContain("cut");
    expect(roles).toContain("copy");
    expect(roles).toContain("paste");
    expect(roles).toContain("pasteAndMatchStyle");
    expect(roles).toContain("selectAll");
  });
});
