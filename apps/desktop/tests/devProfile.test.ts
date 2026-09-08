import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DESKTOP_CHANNELS } from "../scripts/desktop-channel";
import { resolveDevProfile, profileChannel } from "../scripts/dev-profile";

const root = mkdtempSync(join(tmpdir(), "c2-profile-test-"));
const desktop = join(root, "apps", "desktop");
mkdirSync(desktop, { recursive: true });
afterAll(() => rmSync(root, { recursive: true, force: true }));
const env = { CODETWO_DEV_PROFILE: "worker-a", CODETWO_DEV_PORT: "1421" };

describe("development profile isolation", () => {
  test("default retains existing behavior", () => {
    expect(resolveDevProfile({}, desktop)).toBeNull();
    expect(profileChannel(DESKTOP_CHANNELS.dev, null)).toBe(
      DESKTOP_CHANNELS.dev
    );
  });
  test("all mutable paths and identities are disjoint across profiles and worktrees", () => {
    const a = resolveDevProfile(env, desktop)!;
    const b = resolveDevProfile(
      { ...env, CODETWO_DEV_PROFILE: "worker-b", CODETWO_DEV_PORT: "1422" },
      desktop
    )!;
    const other = join(root, "other", "apps", "desktop");
    mkdirSync(other, { recursive: true });
    const c = resolveDevProfile(env, other)!;
    for (const key of [
      "root",
      "dataDir",
      "socketPath",
      "tmpDir",
      "targetDir",
      "rendererDir",
      "buildDir",
      "artifactDir",
      "nativeDir",
      "identifier",
      "appName",
    ] as const) {
      expect(a[key]).not.toBe(b[key]);
      expect(a[key]).not.toBe(c[key]);
    }
    if (process.platform !== "win32") {
      expect(a.socketPath.length).toBeLessThan(104);
    } else {
      expect(a.socketPath).toBe(join(a.root, "socket", "scenes.sock"));
    }
    expect(profileChannel(DESKTOP_CHANNELS.dev, a).identifier).toBe(
      a.identifier
    );
  });
  test("rejects traversal, missing port, invalid ports, relative data and release channel", () => {
    for (const name of ["", "..", "../a", "a/b", "A", "a_1", "x".repeat(33)]) {
      expect(() =>
        resolveDevProfile({ ...env, CODETWO_DEV_PROFILE: name }, desktop)
      ).toThrow();
    }
    for (const port of [
      undefined,
      "",
      "0",
      "1023",
      "65536",
      "1421abc",
      "1.5",
    ]) {
      expect(() =>
        resolveDevProfile({ ...env, CODETWO_DEV_PORT: port }, desktop)
      ).toThrow();
    }
    expect(() =>
      resolveDevProfile({ ...env, CODETWO_DATA_DIR: "data" }, desktop)
    ).toThrow();
    expect(() =>
      resolveDevProfile({ ...env, CODETWO_CHANNEL: "release" }, desktop)
    ).toThrow();
  });
});

test("Electrobun copy paths resolve to the profile outputs", () => {
  const actualDesktop = join(import.meta.dir, "..");
  const profile = resolveDevProfile(env, actualDesktop)!;
  const result = Bun.spawnSync(
    [
      process.execPath,
      "-e",
      'import config from "./electrobun.config.ts"; console.log(JSON.stringify(config.build.copy))',
    ],
    {
      cwd: actualDesktop,
      env: { ...process.env, ...env, CODETWO_CHANNEL: "dev" },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  expect(result.exitCode).toBe(0);
  const paths = Object.keys(JSON.parse(result.stdout.toString())).map((path) =>
    join(actualDesktop, path)
  );
  expect(paths).toContain(profile.rendererDir);
  expect(paths).toContain(
    join(
      profile.targetDir,
      "release",
      process.platform === "win32"
        ? "codetwo-desktop-host.exe"
        : "codetwo-desktop-host"
    )
  );
  expect(paths).toContain(
    join(
      profile.root,
      "tool-broker",
      process.platform === "win32"
        ? "codetwo-tool-broker.exe"
        : "codetwo-tool-broker"
    )
  );
});

test("release arguments fail before creating profile runtime state", () => {
  const desktopRoot = join(import.meta.dir, "..");
  const config = {
    ...env,
    CODETWO_DEV_PROFILE: `invalid-channel-${process.pid}`,
  };
  const profile = resolveDevProfile(config, desktopRoot)!;
  expect(existsSync(profile.root)).toBe(false);
  const result = Bun.spawnSync(
    [process.execPath, "scripts/run-electrobun.ts", "build", "--env=stable"],
    {
      cwd: desktopRoot,
      env: { ...process.env, ...config, CODETWO_CHANNEL: "dev" },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain(
    "Dev profiles cannot build nightly or release packages"
  );
  expect(existsSync(profile.root)).toBe(false);
});
