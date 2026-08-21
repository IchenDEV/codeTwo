import { existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

import type { AppUpdateStatus } from "./rpc";

interface HelperEvent {
  state: string;
  version?: string;
  displayVersion?: string;
  message?: string;
}

let runningCheck: Promise<number> | null = null;
const applicationName = process.env.CODETWO_APP_NAME ?? "C2";

export function enclosingAppBundle(executablePath: string): string | null {
  let candidate = resolve(executablePath);
  while (true) {
    if (extname(candidate) === ".app") return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

function updatePaths(): { application: string; helper: string } | null {
  const application = process.env.CODETWO_APP_BUNDLE_PATH ?? enclosingAppBundle(process.execPath);
  if (!application) return null;
  return {
    application,
    helper: join(application, "Contents", "Helpers", "CodeTwoUpdateHelper"),
  };
}

function parseHelperEvent(output: string): HelperEvent | null {
  const lines = output.trim().split("\n");
  const line = lines[lines.length - 1];
  if (!line) return null;
  try {
    return JSON.parse(line) as HelperEvent;
  } catch {
    return null;
  }
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  if (process.platform !== "darwin") {
    return { state: "unsupported", message: "Sparkle updates are available on macOS only." };
  }
  if (runningCheck) return { state: "checking" };

  const paths = updatePaths();
  if (!paths) {
    return { state: "unavailable", message: `Run the packaged ${applicationName}.app to check for updates.` };
  }
  if (!existsSync(paths.helper)) {
    return { state: "unavailable", message: "The Sparkle update helper is not embedded in this app." };
  }

  const helper = Bun.spawn([paths.helper, "status", "--application", paths.application], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(helper.stdout).text(),
    new Response(helper.stderr).text(),
    helper.exited,
  ]);
  const event = parseHelperEvent(stdout);
  if (exitCode === 0 && event?.state === "ready") {
    return {
      state: "ready",
      currentVersion: event.displayVersion ?? event.version,
    };
  }

  return {
    state: "not-configured",
    message: event?.message ?? (stderr.trim() || "Sparkle update configuration is incomplete."),
  };
}

export async function startAppUpdateCheck(): Promise<AppUpdateStatus> {
  const status = await getAppUpdateStatus();
  if (status.state !== "ready") return status;

  const paths = updatePaths();
  if (!paths) return { state: "unavailable", message: `${applicationName}.app could not be located.` };

  const helper = Bun.spawn([paths.helper, "check", "--application", paths.application], {
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  runningCheck = helper.exited.finally(() => {
    runningCheck = null;
  });
  return { state: "checking", currentVersion: status.currentVersion };
}
