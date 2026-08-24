import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dir, "..");
const executable = process.platform === "win32" ? "codetwo-tool-broker.exe" : "codetwo-tool-broker";
const outputDirectory = resolve(desktopRoot, "dist", "tool-broker");

mkdirSync(outputDirectory, { recursive: true });
const result = Bun.spawnSync(
  [
    "bun",
    "build",
    "--compile",
    "src/electrobun/toolBrokerRpc.ts",
    "--outfile",
    resolve(outputDirectory, executable),
  ],
  {
    cwd: desktopRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);
if (result.exitCode !== 0) process.exit(result.exitCode);
