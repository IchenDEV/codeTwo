import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveDevProfile } from "./dev-profile";

const profile = resolveDevProfile();
if (!profile) throw new Error("Set CODETWO_DEV_PROFILE and CODETWO_DEV_PORT");
const mode = (process.argv[2] ?? "run").replace(/^--/, "");
const ownerFile = join(profile.root, "owner.json");

function owner() {
  if (!existsSync(ownerFile)) return null;
  const record = JSON.parse(readFileSync(ownerFile, "utf8")) as {
    pid: number;
    identity: string;
  };
  if (!Number.isSafeInteger(record.pid) || record.pid <= 1)
    throw new Error("Invalid profile owner metadata");
  const live = Bun.spawnSync(
    ["ps", "-p", String(record.pid), "-o", "lstart=,command="],
    { stdout: "pipe" }
  );
  if (live.exitCode !== 0 || live.stdout.toString().trim() !== record.identity)
    return null;
  return record;
}

if (mode === "logs" || mode === "telemetry") {
  console.log(
    `Profile ${profile.name}: ${profile.identifier}\nData: ${profile.dataDir}\nOwner: ${JSON.stringify(owner())}\nBuild: ${profile.buildDir}\nOutput: ${join(profile.root, "runtime.log")}`
  );
  const log = join(profile.root, "runtime.log");
  if (existsSync(log)) {
    const result = Bun.spawnSync(["tail", "-n", "80", log], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (result.exitCode !== 0) process.exit(result.exitCode);
  }
  process.exit(0);
}
if (!["run", "debug", "verify", "restart", "stop"].includes(mode))
  throw new Error(
    "usage: run.sh [run|--debug|--verify|--restart|--stop|--logs]"
  );
if (mode === "restart" || mode === "stop") {
  const current = owner();
  if (current) {
    process.kill(current.pid, "SIGTERM");
    for (let attempt = 0; attempt < 100 && owner(); attempt++)
      await Bun.sleep(100);
    if (owner())
      throw new Error(
        `Profile ${profile.name} did not stop; refusing to replace it`
      );
  }
  if (mode === "stop") process.exit(0);
}
const child = Bun.spawn(
  [
    process.execPath,
    join(import.meta.dir, "run-electrobun.ts"),
    "dev",
    "--watch",
  ],
  {
    cwd: join(import.meta.dir, ".."),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      ...(mode === "debug"
        ? { RUST_BACKTRACE: "1", RUST_LOG: process.env.RUST_LOG ?? "debug" }
        : {}),
    },
  }
);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.exitCode = await child.exited;
