import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";

import { resolveDesktopChannel } from "./desktop-channel";
import { resolveDevProfile, profileEnvironment } from "./dev-profile";

const profile = resolveDevProfile();
const lockFlag = "--profile-lock-held";
const toolchainFlag = "--profile-toolchain-held";
const requestedArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== lockFlag && argument !== toolchainFlag);
const channelArgument = requestedArguments.find((argument) =>
  argument.startsWith("--channel=")
);
const channel = resolveDesktopChannel(
  channelArgument?.slice("--channel=".length),
  requestedArguments
);
if (profile && channel !== "dev")
  throw new Error("Dev profiles cannot build nightly or release packages");
const cliArguments = requestedArguments.filter(
  (argument) => argument !== channelArgument
);

function signalGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch {
    /* The owned group may have already exited. */
  }
}

async function drainGroup(pid: number, attempts: number): Promise<boolean> {
  const alive = () => {
    try {
      process.kill(-pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < attempts && alive(); i++) await Bun.sleep(100);
  if (alive()) signalGroup(pid, "SIGKILL");
  for (let i = 0; i < attempts && alive(); i++) await Bun.sleep(100);
  return !alive();
}
if (profile) {
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error(
      "Profile build ownership currently requires macOS lockf or Linux flock"
    );
  }
  for (const directory of [profile.root, profile.tmpDir, profile.socketDir])
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  Object.assign(process.env, profileEnvironment(profile));
  if (!process.argv.includes(lockFlag)) {
    const locker =
      process.platform === "darwin"
        ? ["/usr/bin/lockf", "-k", "-t", "0"]
        : ["flock", "-n"];
    const child = Bun.spawn(
      [
        ...locker,
        join(profile.root, "build.lock"),
        process.execPath,
        import.meta.path,
        ...process.argv.slice(2),
        lockFlag,
      ],
      {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        detached: true,
        env: process.env,
      }
    );
    const stop = () => {
      // The inner owner retains the lock while it drains its CLI process group.
      const record = join(profile.root, "owner.json");
      if (!existsSync(record)) {
        if (child.exitCode === null) setTimeout(stop, 50);
        return;
      }
      const owner = JSON.parse(readFileSync(record, "utf8")) as {
        pid: number;
        group: number;
      };
      if (owner.group !== child.pid) {
        if (child.exitCode === null) setTimeout(stop, 50);
        return;
      }
      try {
        process.kill(owner.pid, "SIGTERM");
      } catch {
        /* Owner already exited. */
      }
    };
    process.on("SIGINT", () => stop());
    process.on("SIGTERM", () => stop());
    const status = await child.exited;
    if (status !== 0)
      console.error(
        `Profile ${profile.name} stopped or unavailable; another launch/build may own ${profile.root}/build.lock`
      );
    process.exit(status);
  }
  console.log(
    `C2 profile=${profile.name} identity=${profile.identifier} port=${profile.port} data=${profile.dataDir} build=${profile.buildDir}`
  );
  const ownerPath = join(profile.root, "owner.json");
  const identity = Bun.spawnSync(
    ["ps", "-p", String(process.pid), "-o", "lstart=,command="],
    { stdout: "pipe" }
  )
    .stdout.toString()
    .trim();
  const pendingOwnerPath = `${ownerPath}.${process.pid}.tmp`;
  writeFileSync(
    pendingOwnerPath,
    JSON.stringify({
      pid: process.pid,
      identity,
      profile: profile.name,
      group: Number(
        Bun.spawnSync(["ps", "-p", String(process.pid), "-o", "pgid="], {
          stdout: "pipe",
        })
          .stdout.toString()
          .trim()
      ),
    })
  );
  renameSync(pendingOwnerPath, ownerPath);
  process.on("exit", () => rmSync(ownerPath, { force: true }));
}

const desktopRoot = join(import.meta.dir, "..");
const cliDirectory = join(desktopRoot, "node_modules", "electrobun", "bin");
const cliWrapper = join(cliDirectory, "electrobun.cjs");
const cliBinary = join(
  cliDirectory,
  process.platform === "win32" ? "electrobun.exe" : "electrobun"
);

let cancelled = false;
let preparing: ReturnType<typeof Bun.spawn> | null = null;
const cancelPreparation = () => {
  cancelled = true;
  if (preparing) {
    if (profile) signalGroup(preparing.pid, "SIGTERM");
    else preparing.kill("SIGTERM");
  }
};
process.on("SIGINT", cancelPreparation);
process.on("SIGTERM", cancelPreparation);
const distribution = join(
  desktopRoot,
  "node_modules",
  "electrobun",
  `dist-${process.platform === "darwin" ? "macos" : "linux"}-${process.arch}`
);
const readyFile = join(
  desktopRoot,
  "node_modules",
  ".codetwo-electrobun-ready"
);
const nativeToolsReady = () =>
  existsSync(cliBinary) &&
  [
    "bun",
    "bsdiff",
    "bspatch",
    "launcher",
    process.platform === "darwin"
      ? "libNativeWrapper.dylib"
      : "libNativeWrapper.so",
  ].every((file) => existsSync(join(distribution, file)));
const toolchainReady = () => existsSync(readyFile) && nativeToolsReady();
// Waiting launches recheck readiness rather than waiting for the first dev watcher to exit.
if (profile && !process.argv.includes(toolchainFlag)) {
  if (!toolchainReady())
    console.log(
      "Preparing shared Electrobun tools; waiting only until their preparation is complete."
    );
  while (!toolchainReady()) {
    if (cancelled) process.exit(130);
    const locker =
      process.platform === "darwin"
        ? ["/usr/bin/lockf", "-k", "-s", "-t", "0"]
        : ["flock", "-n", "-E", "75"];
    const setup = Bun.spawn(
      [
        ...locker,
        join(desktopRoot, "node_modules", ".codetwo-electrobun.lock"),
        process.execPath,
        import.meta.path,
        ...process.argv.slice(2),
        toolchainFlag,
      ],
      {
        env: process.env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      }
    );
    const stopSetup = () => {
      const record = JSON.parse(
        readFileSync(join(profile.root, "owner.json"), "utf8")
      ) as { pid: number };
      if (record.pid !== process.pid) {
        try {
          process.kill(record.pid, "SIGTERM");
        } catch {
          /* Exited. */
        }
      } else setup.kill("SIGINT");
    };
    process.on("SIGINT", stopSetup);
    process.on("SIGTERM", stopSetup);
    const status = await setup.exited;
    process.off("SIGINT", stopSetup);
    process.off("SIGTERM", stopSetup);
    if (status !== 75) process.exit(status);
    await Bun.sleep(250);
  }
}

if (!existsSync(cliWrapper)) {
  throw new Error(
    "Electrobun is not installed. Run `bun install --frozen-lockfile` first."
  );
}

if (!existsSync(cliBinary)) {
  const bootstrap = Bun.spawn([process.execPath, cliWrapper, "--version"], {
    detached: !!profile,
    env: process.env,
    cwd: desktopRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  preparing = bootstrap;
  const exitCode = await bootstrap.exited;
  preparing = null;
  if (cancelled && profile) await drainGroup(bootstrap.pid, 30);
  if (cancelled) process.exit(130);
  if (exitCode !== 0 || !existsSync(cliBinary)) {
    throw new Error(`Electrobun CLI bootstrap failed with status ${exitCode}`);
  }
}

// Electrobun 1.18.1's downloaded macOS CLI can arrive with an invalid linker
// signature. macOS terminates it with SIGKILL, while the npm wrapper currently
// reports that signal as exit code 0. Repair only that invalid local tool copy.
if (process.platform === "darwin") {
  const verification = Bun.spawnSync(
    ["/usr/bin/codesign", "--verify", "--strict", cliBinary],
    {
      stdout: "ignore",
      stderr: "ignore",
    }
  );
  if (verification.exitCode !== 0) {
    console.warn(
      "Electrobun CLI has an invalid local signature; applying an ad-hoc signature."
    );
    const signing = Bun.spawnSync(
      ["/usr/bin/codesign", "--force", "--sign", "-", cliBinary],
      {
        stdout: "inherit",
        stderr: "inherit",
      }
    );
    if (signing.exitCode !== 0) {
      throw new Error(
        `Could not sign the local Electrobun CLI (status ${signing.exitCode})`
      );
    }
  }
}

if (profile && process.argv.includes(toolchainFlag) && nativeToolsReady())
  writeFileSync(readyFile, "1");
if (cancelled) process.exit(130);
process.off("SIGINT", cancelPreparation);
process.off("SIGTERM", cancelPreparation);
const cli = Bun.spawn([cliBinary, ...cliArguments], {
  detached: !!profile,
  cwd: desktopRoot,
  env: { ...process.env, CODETWO_CHANNEL: channel },
  stdin: "inherit",
  stdout: profile ? "pipe" : "inherit",
  stderr: profile ? "pipe" : "inherit",
});

const log = profile
  ? Bun.file(join(profile.root, "runtime.log")).writer()
  : null;
async function forward(
  stream: ReadableStream<Uint8Array> | null,
  output: NodeJS.WriteStream
) {
  if (!stream) return;
  for await (const chunk of stream) {
    log?.write(chunk);
    output.write(chunk);
  }
}
const output = profile
  ? Promise.all([
      forward(cli.stdout, process.stdout),
      forward(cli.stderr, process.stderr),
    ])
  : Promise.resolve();

let stopping = false;
function stopCli() {
  if (stopping) return;
  stopping = true;
  if (profile) signalGroup(cli.pid, "SIGINT");
  else cli.kill("SIGINT");
}
process.on("SIGINT", stopCli);
process.on("SIGTERM", stopCli);
process.exitCode = await cli.exited;
if (profile) {
  // Keep build ownership until the dedicated CLI group has drained, including failed builds.
  signalGroup(cli.pid, "SIGTERM");
  if (!(await drainGroup(cli.pid, 50)))
    throw new Error("Profile process group did not exit");
}
await output;
await log?.end();
