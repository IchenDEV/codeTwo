import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  DESKTOP_CHANNELS,
  desktopChannelForIdentifier,
  resolveDesktopChannel,
} from "./desktop-channel";

if (process.platform !== "darwin") process.exit(0);

const wrapperBundle = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
const buildDirectory = process.env.ELECTROBUN_BUILD_DIR;
const channelName =
  desktopChannelForIdentifier(process.env.ELECTROBUN_APP_IDENTIFIER) ??
  resolveDesktopChannel(process.env.CODETWO_CHANNEL);
const channel = DESKTOP_CHANNELS[channelName];
const bundles = wrapperBundle
  ? [wrapperBundle]
  : buildDirectory
    ? readdirSync(buildDirectory)
        .filter((name) => name.endsWith(".app"))
        .map((name) => join(buildDirectory, name))
    : [];

const descriptions = {
  NSMicrophoneUsageDescription:
    "C2 uses the microphone to dictate into the prompt document. Audio is transcribed on this Mac and never leaves it.",
  NSSpeechRecognitionUsageDescription:
    "C2 turns your dictation into text using macOS's on-device speech recognition. Audio is never sent to a server.",
};

const desktopRoot = join(import.meta.dir, "..");
const updateHelperBuild = join(desktopRoot, "native", "update-helper", ".build", "release");
const updateHelperExecutable = join(updateHelperBuild, "CodeTwoUpdateHelper");
const sparkleFramework = join(updateHelperBuild, "Sparkle.framework");

function setPlistString(plist: string, key: string, value: string): void {
  const replace = Bun.spawnSync(["/usr/bin/plutil", "-replace", key, "-string", value, plist]);
  if (replace.exitCode === 0) return;

  const insert = Bun.spawnSync(["/usr/bin/plutil", "-insert", key, "-string", value, plist], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (insert.exitCode !== 0) process.exit(insert.exitCode);
}

function setPlistBoolean(plist: string, key: string, value: boolean): void {
  const replace = Bun.spawnSync(["/usr/bin/plutil", "-replace", key, "-bool", String(value), plist]);
  if (replace.exitCode === 0) return;

  const insert = Bun.spawnSync(["/usr/bin/plutil", "-insert", key, "-bool", String(value), plist], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (insert.exitCode !== 0) process.exit(insert.exitCode);
}

function removePlistKey(plist: string, key: string): void {
  Bun.spawnSync(["/usr/bin/plutil", "-remove", key, plist], {
    stdout: "ignore",
    stderr: "ignore",
  });
}

function embedUpdateHelper(bundle: string): void {
  const helpersDirectory = join(bundle, "Contents", "Helpers");
  const frameworksDirectory = join(bundle, "Contents", "Frameworks");
  const helperDestination = join(helpersDirectory, "CodeTwoUpdateHelper");
  const frameworkDestination = join(frameworksDirectory, "Sparkle.framework");

  mkdirSync(helpersDirectory, { recursive: true });
  mkdirSync(frameworksDirectory, { recursive: true });
  copyFileSync(updateHelperExecutable, helperDestination);
  chmodSync(helperDestination, 0o755);
  rmSync(frameworkDestination, { force: true, recursive: true });
  cpSync(sparkleFramework, frameworkDestination, { recursive: true });
}

function signUpdateComponents(bundle: string): void {
  const identity = process.env.ELECTROBUN_DEVELOPER_ID;
  if (!identity) return;

  const frameworkVersion = join(bundle, "Contents", "Frameworks", "Sparkle.framework", "Versions", "B");
  const updateHelper = join(bundle, "Contents", "Helpers", "CodeTwoUpdateHelper");
  const targets = [
    { path: join(frameworkVersion, "XPCServices", "Installer.xpc"), preserveEntitlements: false },
    { path: join(frameworkVersion, "XPCServices", "Downloader.xpc"), preserveEntitlements: true },
    { path: join(frameworkVersion, "Autoupdate"), preserveEntitlements: false },
    { path: join(frameworkVersion, "Updater.app"), preserveEntitlements: false },
    { path: updateHelper, preserveEntitlements: false },
  ];

  for (const target of targets) {
    if (!existsSync(target.path)) {
      throw new Error(`Required update component is missing: ${target.path}`);
    }

    const command = [
      "/usr/bin/codesign",
      "--force",
      "--sign",
      identity,
      identity === "-" ? "--timestamp=none" : "--timestamp",
    ];
    // Ad-hoc signatures have no shared Team ID, so Library Validation would
    // reject Sparkle.framework in the standalone helper. Distribution builds
    // retain Hardened Runtime because every component uses one Developer ID.
    if (identity !== "-" || target.path !== updateHelper) command.push("--options", "runtime");
    if (target.preserveEntitlements) command.push("--preserve-metadata=entitlements");
    command.push(target.path);

    const result = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" });
    if (result.exitCode !== 0) process.exit(result.exitCode);
  }
}

function configureBundleVersion(plist: string): void {
  const appVersion = process.env.ELECTROBUN_APP_VERSION ?? "0.0.0";
  const buildVersion = process.env.CODETWO_BUILD_VERSION ?? appVersion;
  if (!/^\d+(?:\.\d+){0,2}$/.test(buildVersion)) {
    throw new Error(`CODETWO_BUILD_VERSION must contain one to three numeric components: ${buildVersion}`);
  }

  setPlistString(plist, "CFBundleVersion", buildVersion);
}

function configureUpdater(plist: string): void {
  setPlistBoolean(plist, "SUEnableAutomaticChecks", false);
  setPlistBoolean(plist, "SUAllowsAutomaticUpdates", false);
  setPlistBoolean(plist, "SUAutomaticallyUpdate", false);
  setPlistBoolean(plist, "SURequireSignedFeed", true);
  setPlistBoolean(plist, "SUVerifyUpdateBeforeExtraction", true);

  const feedURL = process.env.CODETWO_SPARKLE_FEED_URL;
  const publicKey = process.env.CODETWO_SPARKLE_PUBLIC_KEY;
  if (!feedURL && !publicKey) {
    removePlistKey(plist, "SUFeedURL");
    removePlistKey(plist, "SUPublicEDKey");
    return;
  }
  if (!feedURL || !publicKey) {
    throw new Error("CODETWO_SPARKLE_FEED_URL and CODETWO_SPARKLE_PUBLIC_KEY must be provided together");
  }
  if (new URL(feedURL).protocol !== "https:") {
    throw new Error("CODETWO_SPARKLE_FEED_URL must use HTTPS");
  }
  const publicKeyBytes = Buffer.from(publicKey, "base64");
  if (publicKeyBytes.length !== 32 || publicKeyBytes.toString("base64") !== publicKey) {
    throw new Error("CODETWO_SPARKLE_PUBLIC_KEY must be a base64-encoded 32-byte Ed25519 public key");
  }
  const signingIdentity = process.env.ELECTROBUN_DEVELOPER_ID;
  if (
    process.env.ELECTROBUN_AD_HOC_SIGN !== "1" ||
    !signingIdentity ||
    signingIdentity === "-" ||
    process.env.ELECTROBUN_NOTARIZE !== "1"
  ) {
    throw new Error(
      "Sparkle feed configuration requires Developer ID signing and notarization; ad-hoc or unsigned builds stay disabled",
    );
  }
  setPlistString(plist, "SUFeedURL", feedURL);
  setPlistString(plist, "SUPublicEDKey", publicKey);
}

for (const bundle of bundles) {
  const plist = join(bundle, "Contents", "Info.plist");
  setPlistString(plist, "CFBundleDisplayName", channel.displayName);
  setPlistString(plist, "CFBundleShortVersionString", process.env.ELECTROBUN_APP_VERSION ?? "0.0.0");
  configureBundleVersion(plist);
  for (const [key, value] of Object.entries(descriptions)) {
    setPlistString(plist, key, value);
  }
  if (!wrapperBundle && channel.updatesEnabled) {
    configureUpdater(plist);
    embedUpdateHelper(bundle);
    signUpdateComponents(bundle);
  } else if (!channel.updatesEnabled) {
    removePlistKey(plist, "SUFeedURL");
    removePlistKey(plist, "SUPublicEDKey");
  }
}
