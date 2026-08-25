import { describe, expect, test } from "bun:test";

import { looksLikeUnifiedDiff, parseUnifiedDiff } from "../src/session/unifiedDiff";

const MULTI_FILE = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
 ctx1
-old1
+new1
 ctx2
diff --git a/src/b.ts b/src/b.ts
index 3333333..4444444 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1,2 @@
 keep
+added line
`;

describe("looksLikeUnifiedDiff", () => {
  test("detects git-style and bare diffs, rejects plain text", () => {
    expect(looksLikeUnifiedDiff(MULTI_FILE)).toBe(true);
    expect(looksLikeUnifiedDiff("--- a/x\n+++ b/x\n@@ -1 +1 @@")).toBe(true);
    expect(looksLikeUnifiedDiff("just some\nlog output")).toBe(false);
    expect(looksLikeUnifiedDiff("@@ -1 +1 @@")).toBe(false);
  });
});

describe("parseUnifiedDiff", () => {
  test("parses a standard multi-file git diff", () => {
    const files = parseUnifiedDiff(MULTI_FILE);
    expect(files.length).toBe(2);

    expect(files[0].path).toBe("src/a.ts");
    expect(files[0].added).toBe(1);
    expect(files[0].deleted).toBe(1);
    expect(files[0].lines).toEqual([
      { type: "ctx", text: "ctx1" },
      { type: "del", text: "old1" },
      { type: "add", text: "new1" },
      { type: "ctx", text: "ctx2" },
    ]);

    expect(files[1].path).toBe("src/b.ts");
    expect(files[1].added).toBe(1);
    expect(files[1].deleted).toBe(0);
    expect(files[1].lines).toEqual([
      { type: "ctx", text: "keep" },
      { type: "add", text: "added line" },
    ]);
  });

  test("parses a bare ---/+++ single-file diff without a git header", () => {
    const files = parseUnifiedDiff(`--- a/foo.txt
+++ b/foo.txt
@@ -1,2 +1,2 @@
-old
+new
 ctx
`);
    expect(files.length).toBe(1);
    expect(files[0].path).toBe("foo.txt");
    expect(files[0].added).toBe(1);
    expect(files[0].deleted).toBe(1);
    expect(files[0].lines).toEqual([
      { type: "del", text: "old" },
      { type: "add", text: "new" },
      { type: "ctx", text: "ctx" },
    ]);
  });

  test("parses consecutive bare files and multiple hunks per file", () => {
    const files = parseUnifiedDiff(`--- a/x
+++ b/x
@@ -1 +1 @@
-a
+b
@@ -5 +5 @@
-c
+d
--- a/y
+++ b/y
@@ -1 +1 @@
-e
+f
`);
    expect(files.map((file) => file.path)).toEqual(["x", "y"]);
    expect(files[0].added).toBe(2);
    expect(files[0].deleted).toBe(2);
    expect(files[1].added).toBe(1);
    expect(files[1].deleted).toBe(1);
  });

  test("returns [] for non-diff text and orphan hunks", () => {
    expect(parseUnifiedDiff("just some\nlog output")).toEqual([]);
    expect(parseUnifiedDiff("@@ -1 +1 @@\n-a\n+b")).toEqual([]);
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  test("new file from /dev/null uses the b/ side path", () => {
    const files = parseUnifiedDiff(`diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+hello
+world
`);
    expect(files.length).toBe(1);
    expect(files[0].path).toBe("new.txt");
    expect(files[0].added).toBe(2);
    expect(files[0].deleted).toBe(0);
  });

  test("deleted file with +++ /dev/null falls back to the a/ side path", () => {
    const files = parseUnifiedDiff(`diff --git a/gone.txt b/gone.txt
deleted file mode 100644
index 1111111..0000000
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-bye
-bye2
`);
    expect(files.length).toBe(1);
    expect(files[0].path).toBe("gone.txt");
    expect(files[0].added).toBe(0);
    expect(files[0].deleted).toBe(2);
  });

  test("hunk content that looks like a header stays content while counts last", () => {
    const files = parseUnifiedDiff(`--- a/x.md
+++ b/x.md
@@ -1,2 +1,2 @@
--- not a header
+++ also content
`);
    expect(files.length).toBe(1);
    expect(files[0].lines).toEqual([
      { type: "del", text: "-- not a header" },
      { type: "add", text: "++ also content" },
    ]);
  });
});
