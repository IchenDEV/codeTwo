import { describe, expect, test } from "bun:test";

import { desktopPlatform } from "../src/platform";

describe("desktopPlatform", () => {
  test("recognizes Windows WebView2, macOS WebKit, and Linux", () => {
    expect(desktopPlatform("Win32 Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(desktopPlatform("MacIntel Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      "macos",
    );
    expect(desktopPlatform("Linux x86_64")).toBe("linux");
  });
});
