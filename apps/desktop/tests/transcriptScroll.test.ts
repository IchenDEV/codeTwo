import { describe, expect, test } from "bun:test";

import {
  isTranscriptNearEnd,
  scrollTopAfterPrepend,
  transcriptDistanceFromEnd,
} from "../src/session/transcriptScroll";

describe("transcript scroll intent", () => {
  test("follows only while the reader remains near the latest content", () => {
    expect(
      isTranscriptNearEnd({
        clientHeight: 400,
        scrollHeight: 1000,
        scrollTop: 552,
      })
    ).toBe(true);
    expect(
      isTranscriptNearEnd({
        clientHeight: 400,
        scrollHeight: 1000,
        scrollTop: 551,
      })
    ).toBe(false);
  });

  test("clamps bounce overscroll when measuring the end distance", () => {
    expect(
      transcriptDistanceFromEnd({
        clientHeight: 400,
        scrollHeight: 1000,
        scrollTop: 620,
      })
    ).toBe(0);
  });

  test("keeps the same content in view when earlier turns are prepended", () => {
    const anchor = { scrollHeight: 800, scrollTop: 240 };

    expect(scrollTopAfterPrepend(anchor, 1120)).toBe(560);
    expect(scrollTopAfterPrepend(anchor, 200)).toBe(0);
  });
});
