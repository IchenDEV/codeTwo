import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";

/** Fit only a visible terminal; the return value controls whether the PTY is resized. */
export function fitTerminal(
  element: Pick<
    HTMLElement,
    "offsetParent" | "clientWidth" | "clientHeight"
  > | null,
  terminal: Pick<Terminal, "rows" | "cols"> | null,
  fit: Pick<FitAddon, "fit"> | null
): boolean {
  if (
    !element ||
    !terminal ||
    !fit ||
    element.offsetParent === null ||
    element.clientWidth === 0 ||
    element.clientHeight === 0
  )
    return false;
  try {
    const { rows, cols } = terminal;
    fit.fit();
    return rows !== terminal.rows || cols !== terminal.cols;
  } catch {
    return false;
  }
}
