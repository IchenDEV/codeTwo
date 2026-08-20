import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const electrobunHost = readFileSync(
  new URL("../src/electrobun/index.ts", import.meta.url),
  "utf8",
);
const dockSource = readFileSync(new URL("../src/dock/Dock.tsx", import.meta.url), "utf8");

describe("macOS window chrome contract", () => {
  test("keeps the traffic lights lowered on the 48px titlebar", () => {
    expect(electrobunHost).toContain('titleBarStyle: "hiddenInset"');
    expect(electrobunHost).toContain("trafficLightOffset: { x: 14, y: 27 }");
  });

  test("keeps the native macOS window shadow", () => {
    expect(electrobunHost).not.toMatch(/\btransparent:\s*true/);
  });

  test("keeps both dock header states aligned to the 48px titlebar", () => {
    const titlebarClasses = Array.from(
      dockSource.matchAll(/data-dock-titlebar[\s\S]*?className="([^"]+)"/g),
      (match) => match[1].split(/\s+/),
    );

    expect(titlebarClasses).toHaveLength(2);
    expect(titlebarClasses.every((classes) => classes.includes("py-2.5"))).toBe(true);
    expect(dockSource).toContain(
      'size="compact" className="w-(--ds-control-normal) px-0" onClick={onClose}',
    );
  });
});
