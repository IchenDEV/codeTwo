import { describe, expect, test } from "bun:test";

import {
  DESKTOP_CHANNELS,
  desktopChannelForIdentifier,
  resolveDesktopChannel,
} from "../scripts/desktop-channel";

describe("desktop distribution channels", () => {
  test("use distinct bundle identifiers", () => {
    const identifiers = Object.values(DESKTOP_CHANNELS).map((channel) => channel.identifier);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(DESKTOP_CHANNELS.release.identifier).toBe("dev.codetwo.app");
  });

  test("infer safe defaults from Electrobun arguments", () => {
    expect(resolveDesktopChannel(undefined, ["dev", "--watch"])).toBe("dev");
    expect(resolveDesktopChannel(undefined, ["build", "--env=dev"])).toBe("dev");
    expect(resolveDesktopChannel(undefined, ["build", "--env=stable"])).toBe("release");
    expect(resolveDesktopChannel("nightly", ["build", "--env=stable"])).toBe("nightly");
  });

  test("maps build hook identifiers back to their channel", () => {
    expect(desktopChannelForIdentifier("dev.codetwo.app.dev")).toBe("dev");
    expect(desktopChannelForIdentifier("dev.codetwo.app.nightly")).toBe("nightly");
    expect(desktopChannelForIdentifier("dev.codetwo.app")).toBe("release");
    expect(desktopChannelForIdentifier("example.invalid")).toBeNull();
  });

  test("rejects unknown channels", () => {
    expect(() => resolveDesktopChannel("beta")).toThrow("Unsupported C2 desktop channel: beta");
  });
});
