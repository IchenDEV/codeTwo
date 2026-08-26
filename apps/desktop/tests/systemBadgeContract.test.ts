import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8").replaceAll("\r\n", "\n");

const app = source("../src/App.tsx");
const bridge = source("../src/bridge.ts");
const client = source("../src/electrobun/client.ts");
const host = source("../src/electrobun/index.ts");
const rpc = source("../src/electrobun/rpc.ts");
const nativeBadge = source("../src/electrobun/windowEffects.ts");
const appKit = source("../native/window-effects/CodeTwoWindowEffects.m");

describe("system badge contract", () => {
  test("projects the existing attention count into the desktop bridge", () => {
    expect(app).toContain("needsMeCount(sessions)");
    expect(app).toContain("setSystemBadgeCount(systemBadgeCount)");
    expect(bridge).toContain("desktopSetSystemBadgeCount(count)");
    expect(client).toContain("request.systemBadgeSet({ count })");
    expect(rpc).toContain("systemBadgeSet: { params: { count: number }; response: boolean }");
    expect(host).toContain("systemBadgeSet: ({ count }) => setMacOSSystemBadgeCount(count)");
  });

  test("uses the native macOS Dock badge and clears it at zero", () => {
    expect(nativeBadge).toContain("codetwoSetDockBadgeCount");
    expect(appKit).toContain("NSApp.dockTile");
    expect(appKit).toContain("dockTile.badgeLabel = count > 0");
    expect(appKit).toMatch(/dockTile\.badgeLabel = count > 0[\s\S]*?: nil;/);
    expect(appKit).toContain("dispatch_sync(dispatch_get_main_queue()");
  });
});
