import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveDevProfile } from "./dev-profile";

const profile = resolveDevProfile();
const desktopRoot = resolve(import.meta.dir, "..");
const repositoryRoot = resolve(desktopRoot, "../..");
// Electrobun invokes preBuild only after its downloaded binaries are fully prepared.
writeFileSync(
  resolve(desktopRoot, "node_modules", ".codetwo-electrobun-ready"),
  "1"
);

function run(command: string[], cwd: string): void {
  const result = Bun.spawnSync(command, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

run(["bun", "run", "build:renderer"], desktopRoot);
run(["bun", "run", "build:tool-broker"], desktopRoot);

// Cargo's incremental build checks source freshness; existence alone can select an old host.
run(
  [
    "cargo",
    "build",
    "--release",
    "-p",
    "codetwo-desktop-host",
    ...(profile ? ["--target-dir", profile.targetDir] : []),
  ],
  repositoryRoot
);

if (process.platform === "darwin") {
  const windowEffectsRoot = resolve(desktopRoot, "native", "window-effects");
  const windowEffectsBuild = profile
    ? resolve(profile.nativeDir, "window-effects")
    : resolve(windowEffectsRoot, ".build");
  mkdirSync(windowEffectsBuild, { recursive: true });
  run(
    [
      "/usr/bin/clang",
      "-dynamiclib",
      "-fobjc-arc",
      "-fblocks",
      "-mmacosx-version-min=14.0",
      "-framework",
      "AppKit",
      "-framework",
      "ApplicationServices",
      resolve(windowEffectsRoot, "CodeTwoWindowEffects.m"),
      "-o",
      resolve(windowEffectsBuild, "libCodeTwoWindowEffects.dylib"),
    ],
    desktopRoot
  );
  run(
    [
      "/usr/bin/swift",
      "build",
      "--disable-automatic-resolution",
      "--configuration",
      "release",
      "--package-path",
      resolve(desktopRoot, "native", "update-helper"),
      ...(profile
        ? [
            "--scratch-path",
            resolve(profile.nativeDir, "update-helper"),
            "--cache-path",
            resolve(profile.nativeDir, "swift-cache"),
          ]
        : []),
    ],
    desktopRoot
  );
  run(
    [
      "/usr/bin/swift",
      "build",
      "--disable-automatic-resolution",
      "--configuration",
      "release",
      "--package-path",
      resolve(desktopRoot, "native", "cloud-sync-helper"),
      ...(profile
        ? [
            "--scratch-path",
            resolve(profile.nativeDir, "cloud-sync-helper"),
            "--cache-path",
            resolve(profile.nativeDir, "swift-cache"),
          ]
        : []),
    ],
    desktopRoot
  );
}
