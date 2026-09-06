/**
 * Happy-dom / bun test do not configure React's act environment. Base UI and other
 * libraries spam identical warnings that dominate CI I/O and inflate wall time.
 * Silence only that known noise; keep other console errors visible.
 *
 * `@dnd-kit/dom` also touches `ResizeObserver` at module load; bun's default test
 * realm does not define it, so smoke unit tests that import the adapter crash.
 */
const ACT_WARNING =
  "The current testing environment is not configured to support act(...)";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const originalError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  if (
    typeof args[0] === "string" &&
    (args[0].includes(ACT_WARNING) || args[0].includes("not wrapped in act"))
  ) {
    return;
  }
  originalError(...args);
};
