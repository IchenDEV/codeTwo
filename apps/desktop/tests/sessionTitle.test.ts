import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { sameThreadTitle, sessionTitleTail } from "../src/session/title";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf-8"
);

describe("thread title equivalence", () => {
  test("treats the automatic first-sentence title as the same name as its prompt", () => {
    // The board names the task from the raw prompt; the core's `initial_session_title` stops at the
    // first sentence and drops its punctuation. A single-prompt thread must print one name.
    const prompt = "帮我把这个项目里的图像都压缩成 WebP。";
    const automatic = "帮我把这个项目里的图像都压缩成 WebP";

    expect(sameThreadTitle(automatic, prompt)).toBe(true);
    expect(sessionTitleTail(prompt, automatic)).toBeNull();
  });

  test("matches across whitespace, case, leading markdown, and bounded prefixes", () => {
    expect(sameThreadTitle("# Fix   the Parser", "fix the parser")).toBe(true);
    expect(
      sessionTitleTail(
        "Add dark mode toggle across every pane",
        "Add dark mode toggle"
      )
    ).toBeNull();
    expect(sameThreadTitle("Ship it", "Ship it!")).toBe(true);
  });

  test("keeps a genuinely different session name", () => {
    expect(sessionTitleTail("Release notes", "Fix the parser")).toBe(
      "Fix the parser"
    );
    expect(sessionTitleTail("Fix the parser", "Parser fix")).toBe("Parser fix");
  });

  test("never renders an empty or missing session title", () => {
    expect(sessionTitleTail("Fix the parser", null)).toBeNull();
    expect(sessionTitleTail("Fix the parser", undefined)).toBeNull();
    expect(sessionTitleTail("Fix the parser", "   ")).toBeNull();
  });
});

test("the session header renders its trailing title through the shared component", () => {
  expect(appSource).toContain(
    'import { SessionTitlePair } from "./session/SessionTitlePair"'
  );
  expect(appSource).toContain("<SessionTitlePair");
  expect(appSource).toContain("taskTitle={activeBoardTask.title}");
  expect(appSource).not.toContain("activeSessionTitle.trim() !==");
});
