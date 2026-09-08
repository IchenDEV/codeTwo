import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DesktopChannelConfiguration } from "./desktop-channel";

export function resolveDevProfile(
  env: Record<string, string | undefined> = process.env,
  desktopRoot = fileURLToPath(new URL("..", import.meta.url))
) {
  const name = env.CODETWO_DEV_PROFILE;
  if (name === undefined) return null;
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) {
    throw new Error(
      "CODETWO_DEV_PROFILE must be a 1–32 character lowercase slug starting with a letter"
    );
  }
  if (env.CODETWO_CHANNEL && env.CODETWO_CHANNEL !== "dev") {
    throw new Error(
      "CODETWO_DEV_PROFILE is only supported for the dev channel"
    );
  }
  const portText = env.CODETWO_DEV_PORT ?? "";
  if (
    !/^\d+$/.test(portText) ||
    Number(portText) < 1024 ||
    Number(portText) > 65535
  ) {
    throw new Error(
      "Set CODETWO_DEV_PORT to an explicit port between 1024 and 65535"
    );
  }
  const worktree = realpathSync(resolve(desktopRoot, "../.."));
  const key = createHash("sha256")
    .update(`${worktree}\0${name}`)
    .digest("hex")
    .slice(0, 12);
  const root = join(worktree, ".codex", "run", "instances", name);
  const dataDir = env.CODETWO_DATA_DIR ?? join(root, "data");
  if (!isAbsolute(dataDir))
    throw new Error("CODETWO_DATA_DIR must be absolute for a dev profile");
  // Unix-domain sockets have a small path limit; keep the broker out of long worktree paths.
  const socketDir =
    process.platform === "win32" ? join(root, "socket") : `/tmp/codetwo-${key}`;
  return {
    name,
    key,
    root,
    dataDir,
    port: Number(portText),
    socketDir,
    socketPath: join(socketDir, "scenes.sock"),
    tmpDir: join(root, "tmp"),
    targetDir: join(root, "target"),
    rendererDir: join(root, "dist"),
    buildDir: join(root, "build"),
    artifactDir: join(root, "artifacts"),
    nativeDir: join(root, "native"),
    // Electrobun joins these paths to projectRoot, so supply relative paths.
    buildFolder: relative(desktopRoot, join(root, "build")),
    artifactFolder: relative(desktopRoot, join(root, "artifacts")),
    identifier: `dev.codetwo.app.dev.${name}-${key}`,
    appName: `C2 ${name}-${key}`,
  };
}

export function profileChannel(
  channel: DesktopChannelConfiguration,
  profile: ReturnType<typeof resolveDevProfile>
): DesktopChannelConfiguration {
  return profile
    ? {
        ...channel,
        appName: profile.appName,
        displayName: `C2 Dev · ${profile.name} · ${profile.key}`,
        identifier: profile.identifier,
      }
    : channel;
}

export function profileEnvironment(
  profile: NonNullable<ReturnType<typeof resolveDevProfile>>
) {
  return {
    CODETWO_DATA_DIR: profile.dataDir,
    CODETWO_SCENE_SOCKET: profile.socketPath,
    CARGO_TARGET_DIR: profile.targetDir,
    TMPDIR: profile.tmpDir,
    TMP: profile.tmpDir,
    TEMP: profile.tmpDir,
  };
}
