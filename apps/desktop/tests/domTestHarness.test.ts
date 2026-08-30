import { expect, test } from "bun:test";
import { dom } from "./domTestHarness";

test("the shared DOM harness exposes the Web Animations query used by ScrollArea", () => {
  const element = dom.document.createElement("div");

  expect(element.getAnimations({ subtree: true })).toEqual([]);
});
