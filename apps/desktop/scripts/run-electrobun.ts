import { existsSync } from "node:fs";
import { join } from "node:path";

import { resolveDesktopChannel } from "./desktop-channel";

const desktopRoot = join(import.meta.dir, "..");
const cliDirectory = join(desktopRoot, "node_modules", "electrobun", "bin");
const cliWrapper = join(cliDirectory, "electrobun.cjs");
const cliBinary = join(cliDirectory, process.platform === "win32" ? "electrobun.exe" : "electrobun");

if (!existsSync(cliWrapper)) {
  throw new Error("Electrobun is not installed. Run `bun install --frozen-lockfile` first.");
}

if (!existsSync(cliBinary)) {
  const bootstrap = Bun.spawn([process.execPath, cliWrapper, "--version"], {
    cwd: desktopRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await bootstrap.exited;
  if (exitCode !== 0 || !existsSync(cliBinary)) {
    throw new Error(`Electrobun CLI bootstrap failed with status ${exitCode}`);
  }
}

// Electrobun 1.18.1's downloaded macOS CLI can arrive with an invalid linker
// signature. macOS terminates it with SIGKILL, while the npm wrapper currently
// reports that signal as exit code 0. Repair only that invalid local tool copy.
if (process.platform === "darwin") {
  const verification = Bun.spawnSync(["/usr/bin/codesign", "--verify", "--strict", cliBinary], {
    stdout: "ignore",
    stderr: "ignore",
  });
  if (verification.exitCode !== 0) {
    console.warn("Electrobun CLI has an invalid local signature; applying an ad-hoc signature.");
    const signing = Bun.spawnSync(["/usr/bin/codesign", "--force", "--sign", "-", cliBinary], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (signing.exitCode !== 0) {
      throw new Error(`Could not sign the local Electrobun CLI (status ${signing.exitCode})`);
    }
  }
}

const requestedArguments = process.argv.slice(2);
const channelArgument = requestedArguments.find((argument) => argument.startsWith("--channel="));
const channel = resolveDesktopChannel(channelArgument?.slice("--channel=".length), requestedArguments);
const cliArguments = requestedArguments.filter((argument) => argument !== channelArgument);

const cli = Bun.spawn([cliBinary, ...cliArguments], {
  cwd: desktopRoot,
  env: { ...process.env, CODETWO_CHANNEL: channel },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.on("SIGINT", () => cli.kill("SIGINT"));
process.on("SIGTERM", () => cli.kill("SIGTERM"));
process.exitCode = await cli.exited;
