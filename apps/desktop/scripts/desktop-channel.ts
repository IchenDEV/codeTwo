export type DesktopChannel = "dev" | "nightly" | "release";

export interface DesktopChannelConfiguration {
  appName: string;
  displayName: string;
  identifier: string;
  updatesEnabled: boolean;
}

export const DESKTOP_CHANNELS: Record<
  DesktopChannel,
  DesktopChannelConfiguration
> = {
  dev: {
    appName: "C2",
    displayName: "C2 Dev",
    identifier: "dev.codetwo.app.dev",
    updatesEnabled: false,
  },
  nightly: {
    appName: "C2 Nightly",
    displayName: "C2 Nightly",
    identifier: "dev.codetwo.app.nightly",
    updatesEnabled: false,
  },
  release: {
    appName: "C2",
    displayName: "C2",
    identifier: "dev.codetwo.app",
    updatesEnabled: true,
  },
};

export function resolveDesktopChannel(
  requested: string | undefined,
  electrobunArguments: readonly string[] = []
): DesktopChannel {
  const inferred =
    requested ??
    (electrobunArguments.includes("--env=stable") ? "release" : "dev");
  if (inferred === "dev" || inferred === "nightly" || inferred === "release")
    return inferred;
  throw new Error(`Unsupported C2 desktop channel: ${inferred}`);
}

export function desktopChannelForIdentifier(
  identifier: string | undefined
): DesktopChannel | null {
  if (!identifier) return null;
  for (const [channel, configuration] of Object.entries(DESKTOP_CHANNELS)) {
    if (configuration.identifier === identifier)
      return channel as DesktopChannel;
  }
  return null;
}
