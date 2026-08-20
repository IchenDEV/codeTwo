import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const tauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const dockSource = readFileSync(new URL("../src/dock/Dock.tsx", import.meta.url), "utf8");

describe("macOS window chrome contract", () => {
  test("keeps the traffic lights lowered on the 48px titlebar", () => {
    const mainWindow = tauriConfig.app.windows.find(
      (window: { label?: string }) => window.label === "main",
    );

    expect(mainWindow?.titleBarStyle).toBe("Overlay");
    expect(mainWindow?.trafficLightPosition).toEqual({ x: 14, y: 27 });
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
