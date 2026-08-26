import { describe, expect, test } from "bun:test";

import type { Translate } from "../src/i18n";
import {
  builtinLinkMenuItems,
  parseBuiltinLink,
  workspaceRelativeLinkPath,
} from "../src/session/MarkdownContent";

const t: Translate = (key) => key;

describe("built-in transcript links", () => {
  test("accepts safe web links and rejects credentialed or executable schemes", () => {
    expect(parseBuiltinLink("https://example.com/docs?q=one")).toEqual({
      kind: "web",
      url: "https://example.com/docs?q=one",
    });
    expect(parseBuiltinLink("https://user:secret@example.com/private")).toBeNull();
    expect(parseBuiltinLink("javascript:alert(1)")).toBeNull();
    expect(parseBuiltinLink("mailto:hello@example.com")).toBeNull();
  });

  test("parses local paths, encoded file URLs, and source positions", () => {
    expect(parseBuiltinLink("/tmp/project/src/main.ts:42:7")).toEqual({
      kind: "file",
      path: "/tmp/project/src/main.ts",
      line: 42,
      column: 7,
    });
    expect(parseBuiltinLink("file:///tmp/My%20Project/main.ts#L12C3")).toEqual({
      kind: "file",
      path: "/tmp/My Project/main.ts",
      line: 12,
      column: 3,
    });
    expect(parseBuiltinLink("src/lib.ts#L9")).toEqual({
      kind: "file",
      path: "src/lib.ts",
      line: 9,
      column: undefined,
    });
    expect(parseBuiltinLink("file://remote-host/tmp/main.ts")).toBeNull();
    expect(parseBuiltinLink("../private.txt")).toBeNull();
  });

  test("keeps internal file opens inside the active workspace", () => {
    expect(workspaceRelativeLinkPath("/tmp/project/src/main.ts", "/tmp/project")).toBe(
      "src/main.ts",
    );
    expect(workspaceRelativeLinkPath("src/main.ts", "/tmp/project")).toBe("src/main.ts");
    expect(workspaceRelativeLinkPath("../private.txt", "/tmp/project")).toBeNull();
    expect(workspaceRelativeLinkPath("/tmp/project-copy/main.ts", "/tmp/project")).toBeNull();
    expect(workspaceRelativeLinkPath("c:\\Code\\App\\main.ts", "C:\\Code\\App")).toBe(
      "main.ts",
    );
  });

  test("builds the native web and file menu contracts", () => {
    const web = builtinLinkMenuItems(
      { kind: "web", url: "https://example.com/" },
      t,
      { canOpenInApp: true, canCopy: true },
    );
    expect(web.map((item) => item.type === "separator" ? "separator" : item.action)).toEqual([
      "open-web-in-app",
      "open-web-external",
      "separator",
      "copy-web-link",
    ]);

    const file = builtinLinkMenuItems(
      { kind: "file", path: "/tmp/project/main.ts", line: 8 },
      t,
      { canOpenInApp: true, canCopy: true },
    );
    expect(file.map((item) => item.type === "separator" ? "separator" : item.action)).toEqual([
      "open-file-in-app",
      "open-file-default",
      "separator",
      "copy-file-path",
      "reveal-file",
    ]);
  });
});
