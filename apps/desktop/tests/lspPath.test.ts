import { describe, expect, test } from "bun:test";

import { pathToUri, uriToPath } from "../src/lsp/client";

describe("LSP file paths", () => {
  test("round-trips POSIX paths", () => {
    const path = "/tmp/C2 project/你好.ts";
    expect(uriToPath(pathToUri(path))).toBe(path);
  });

  test("round-trips Windows drive paths", () => {
    const path = "C:\\Users\\Ada Lovelace\\项目\\main.rs";
    const uri = pathToUri(path);
    expect(uri).toBe("file:///C%3A/Users/Ada%20Lovelace/%E9%A1%B9%E7%9B%AE/main.rs");
    expect(uriToPath(uri)).toBe(path);
  });

  test("round-trips Windows UNC paths", () => {
    const path = "\\\\server\\shared folder\\main.ts";
    const uri = pathToUri(path);
    expect(uri).toBe("file://server/shared%20folder/main.ts");
    expect(uriToPath(uri)).toBe(path);
  });
});
