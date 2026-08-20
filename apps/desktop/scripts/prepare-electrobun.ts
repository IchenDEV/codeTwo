import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dir, "..");

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

if (process.platform === "darwin") {
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
}
