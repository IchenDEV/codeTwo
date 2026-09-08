import { describe, expect, test } from "bun:test";

import { enclosingAppBundle } from "../src/electrobun/update";

describe("Sparkle update bundle discovery", () => {
  test("finds the enclosing application from an Electrobun executable", () => {
    expect(
      enclosingAppBundle("/Applications/C2.app/Contents/MacOS/launcher")
    ).toBe("/Applications/C2.app");
    expect(
      enclosingAppBundle(
        "/Applications/C2.app/Contents/Resources/app/bun/index.js"
      )
    ).toBe("/Applications/C2.app");
    expect(
      enclosingAppBundle(
        "/Users/c2/Library/Application Support/dev.codetwo.app/stable/self-extraction/hash/C2.app/Contents/MacOS/bun"
      )
    ).toBe(
      "/Users/c2/Library/Application Support/dev.codetwo.app/stable/self-extraction/hash/C2.app"
    );
  });

  test("fails closed outside an application bundle", () => {
    expect(enclosingAppBundle("/usr/local/bin/bun")).toBeNull();
  });
});
