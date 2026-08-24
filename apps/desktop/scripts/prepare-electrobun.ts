import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dir, "..");
const repositoryRoot = resolve(desktopRoot, "../..");

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
run(["cargo", "build", "--release", "-p", "codetwo-desktop-host"], repositoryRoot);

if (process.platform === "darwin") {
  const windowEffectsRoot = resolve(desktopRoot, "native", "window-effects");
  const windowEffectsBuild = resolve(windowEffectsRoot, ".build");
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
    desktopRoot,
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
    ],
    desktopRoot,
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
    ],
    desktopRoot,
  );
}
