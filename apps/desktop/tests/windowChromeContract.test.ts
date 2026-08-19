import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const tauriConfig = JSON.parse(
  readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);

describe("macOS window chrome contract", () => {
  test("keeps the traffic lights lowered on the 48px titlebar", () => {
    const mainWindow = tauriConfig.app.windows.find(
      (window: { label?: string }) => window.label === "main",
    );

    expect(mainWindow?.titleBarStyle).toBe("Overlay");
    expect(mainWindow?.trafficLightPosition).toEqual({ x: 14, y: 27 });
  });
});
