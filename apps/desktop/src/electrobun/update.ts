import { existsSync } from "node:fs";
import { join, posix } from "node:path";

import type { AppUpdateStatus } from "./rpc";

interface HelperEvent {
  state: string;
  version?: string;
  displayVersion?: string;
  message?: string;
}

let runningCheck: Promise<number> | null = null;
const appName = process.env.CODETWO_APP_NAME ?? "C2";

export function enclosingAppBundle(executablePath: string): string | null {
  let candidate = posix.resolve(executablePath);
  while (true) {
    if (posix.extname(candidate) === ".app") {
      return candidate;
    }
    const parent = posix.dirname(candidate);
    if (parent === candidate) {
      return null;
    }
    candidate = parent;
  }
}

function updatePaths(): {
  application: string;
  helper: string;
} | null {
  const app =
    process.env.CODETWO_APP_BUNDLE_PATH ?? enclosingAppBundle(process.execPath);
  if (app == null || app === "") {
    return null;
  }
  return {
    application: app,
    helper: join(app, "Contents", "Helpers", "CodeTwoUpdateHelper"),
  };
}

function parseHelperEvent(output: string): HelperEvent | null {
  const lines = output.trim().split("\n");
  const line =
    lines.length > 0
      ? lines.length > 0
        ? lines[lines.length - 1]
        : undefined
      : undefined;
  if (line == null || line === "") {
    return null;
  }
  try {
    return JSON.parse(line) as HelperEvent;
  } catch {
    return null;
  }
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  if (process.platform !== "darwin") {
    return {
      message: "Sparkle updates are available on macOS only.",
      state: "unsupported",
    };
  }
  if (runningCheck) {
    return { state: "checking" };
  }

  const paths = updatePaths();
  if (!paths) {
    return {
      message: `Run the packaged ${appName}.app to check for updates.`,
      state: "unavailable",
    };
  }
  if (!existsSync(paths.helper)) {
    return {
      message: "The Sparkle update helper is not embedded in this app.",
      state: "unavailable",
    };
  }

  const helper = Bun.spawn(
    [paths.helper, "status", "--application", paths.application],
    {
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    }
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(helper.stdout).text(),
    new Response(helper.stderr).text(),
    helper.exited,
  ]);
  const event = parseHelperEvent(stdout);
  if (exitCode === 0 && event?.state === "ready") {
    return {
      currentVersion: event.displayVersion ?? event.version,
      state: "ready",
    };
  }

  return {
    message:
      event?.message ??
      (stderr.trim() || "Sparkle update configuration is incomplete."),
    state: "not-configured",
  };
}

export async function startAppUpdateCheck(): Promise<AppUpdateStatus> {
  const status = await getAppUpdateStatus();
  if (status.state !== "ready") {
    return status;
  }

  const paths = updatePaths();
  if (!paths) {
    return {
      message: `${appName}.app could not be located.`,
      state: "unavailable",
    };
  }

  const helper = Bun.spawn(
    [paths.helper, "check", "--application", paths.application],
    {
      stderr: "inherit",
      stdin: "ignore",
      stdout: "inherit",
    }
  );
  runningCheck = helper.exited.finally(() => {
    runningCheck = null;
  });
  return { currentVersion: status.currentVersion, state: "checking" };
}
