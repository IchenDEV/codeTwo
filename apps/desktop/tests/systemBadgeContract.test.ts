import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (relativePath: string) => {
  return readFileSync(
    new URL(relativePath, import.meta.url),
    "utf-8"
  ).replaceAll("\r\n", "\n");
};

const app = source("../src/App.tsx");
const bridge = source("../src/bridge.ts");
const client = source("../src/electrobun/client.ts");
const host = source("../src/electrobun/index.ts");
const rpc = source("../src/electrobun/rpc.ts");
const profile = source("../src/settings/ProfileSettings.tsx");
const systemProfile = source("../src/electrobun/systemProfile.ts");
const nativeBadge = source("../src/electrobun/windowEffects.ts");
const appKit = source("../native/window-effects/CodeTwoWindowEffects.m");

describe("system badge contract", () => {
  test("projects the existing attention count into the desktop bridge", () => {
    expect(app).toContain("needsMeCount(sessions)");
    expect(app).toContain("setSystemBadgeCount(systemBadgeCount)");
    expect(bridge).toContain("desktopSetSystemBadgeCount(count)");
    expect(client).toContain("request.systemBadgeSet({ count })");
    expect(rpc).toContain(
      "systemBadgeSet: { params: { count: number }; response: boolean }"
    );
    expect(host).toContain(
      "systemBadgeSet: ({ count }) => setMacOSSystemBadgeCount(count)"
    );
  });

  test("uses the native macOS Dock badge and clears it at zero", () => {
    expect(nativeBadge).toContain("codetwoSetDockBadgeCount");
    expect(appKit).toContain("NSApp.dockTile");
    expect(appKit).toContain("dockTile.badgeLabel = count > 0");
    expect(appKit).toMatch(/dockTile\.badgeLabel = count > 0[\s\S]*?: nil;/u);
    expect(appKit).toContain("dispatch_sync(dispatch_get_main_queue()");
  });

  test("keeps the macOS account avatar behind the desktop system bridge", () => {
    expect(profile).toContain("avatarLoader = systemProfileAvatar");
    expect(bridge).toContain("desktopSystemProfileAvatar()");
    expect(client).toContain("request.systemProfileAvatar()");
    expect(rpc).toContain(
      "systemProfileAvatar: { params: undefined; response: string | null }"
    );
    expect(host).toContain("systemProfileAvatar: readSystemProfileAvatar");
    expect(systemProfile).toContain(
      '["/usr/bin/dscl", ".", "-read", record, "JPEGPhoto"]'
    );
    expect(systemProfile).toContain(
      '["/usr/bin/sips", "-s", "format", "png", path'
    );
  });
});
