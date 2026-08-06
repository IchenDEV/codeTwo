import { describe, expect, test } from "bun:test";
import { shouldUseWebSpeech } from "../src/voice/platform";

describe("shouldUseWebSpeech", () => {
  test("never uses Web Speech inside the Tauri desktop app", () => {
    expect(shouldUseWebSpeech(true, true)).toBe(false);
  });

  test("keeps Web Speech available to the browser frontend", () => {
    expect(shouldUseWebSpeech(false, true)).toBe(true);
    expect(shouldUseWebSpeech(false, false)).toBe(false);
  });
});
