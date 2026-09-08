import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dir, "..");
const repositoryRoot = resolve(desktopRoot, "..", "..");
const executable =
  process.platform === "win32" ? "codetwo-agent.exe" : "codetwo-agent";
const outputDirectory = resolve(desktopRoot, "dist", "remote-agent");

const result = Bun.spawnSync(
  ["cargo", "build", "--release", "--bin", "codetwo-agent"],
  {
    cwd: repositoryRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }
);
if (result.exitCode !== 0) process.exit(result.exitCode);

mkdirSync(outputDirectory, { recursive: true });
const output = resolve(outputDirectory, executable);
copyFileSync(resolve(repositoryRoot, "target", "release", executable), output);
if (process.platform !== "win32") chmodSync(output, 0o755);
