import { expect, test } from "bun:test";

import { fitTerminal } from "../src/terminal/resize";

test("repeated resize notifications only signal the PTY when its cell grid changes", () => {
  const element = {
    offsetParent: {} as Element,
    clientWidth: 360,
    clientHeight: 640,
  };
  const terminal = { rows: 24, cols: 80 };
  const fit = {
    fit: () => {
      terminal.cols = 40;
    },
  };
  const signals = Array.from({ length: 10 }, () =>
    fitTerminal(element, terminal, fit)
  );
  expect(signals.filter(Boolean)).toHaveLength(1);
  expect(fitTerminal({ ...element, clientWidth: 0 }, terminal, fit)).toBe(
    false
  );
  expect(
    fitTerminal(element, terminal, {
      fit: () => {
        throw new Error("hidden");
      },
    })
  ).toBe(false);
});
