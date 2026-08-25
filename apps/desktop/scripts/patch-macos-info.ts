import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  DESKTOP_CHANNELS,
  desktopChannelForIdentifier,
  resolveDesktopChannel,
} from "./desktop-channel";

const desktopRoot = join(import.meta.dir, "..");
const wrapperBundle = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
const buildDirectory = process.env.ELECTROBUN_BUILD_DIR;

if (process.platform === "win32" && process.env.ELECTROBUN_OS === "win") {
  if (!buildDirectory) {
    throw new Error("ELECTROBUN_BUILD_DIR is required for Windows icon patching");
  }

  const icon = join(desktopRoot, "assets", "icon.ico");
  const rcedit = join(
    desktopRoot,
    "node_modules",
    "rcedit",
    "bin",
    "rcedit-x64.exe",
  );
  const appName = process.env.ELECTROBUN_APP_NAME;
  if (!appName) throw new Error("ELECTROBUN_APP_NAME is required for Windows icon patching");

  const executables = wrapperBundle
    ? [join(desktopRoot, "node_modules", "electrobun", "dist-win-x64", "extractor.exe")]
    : [
        join(buildDirectory, appName, "bin", "launcher.exe"),
        join(buildDirectory, appName, "bin", "bun.exe"),
      ];

  for (const executable of [icon, rcedit, ...executables]) {
    if (!existsSync(executable)) {
      throw new Error(`Required Windows packaging file is missing: ${executable}`);
    }
  }

  for (const executable of executables) {
    const result = Bun.spawnSync([rcedit, executable, "--set-icon", icon], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (result.exitCode !== 0) throw new Error(`Could not embed the C2 icon in ${executable}`);
    console.log(`Embedded the C2 icon in ${executable}`);
  }

  process.exit(0);
}

if (process.platform !== "darwin") process.exit(0);

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

const updateHelperBuild = join(desktopRoot, "native", "update-helper", ".build", "release");
const updateHelperExecutable = join(updateHelperBuild, "CodeTwoUpdateHelper");
const sparkleFramework = join(updateHelperBuild, "Sparkle.framework");
const cloudSyncHelperBuild = join(desktopRoot, "native", "cloud-sync-helper", ".build", "release");
const cloudSyncHelperExecutable = join(cloudSyncHelperBuild, "CodeTwoCloudSyncHelper");
const windowEffectsLibrary = join(
  desktopRoot,
  "native",
  "window-effects",
  ".build",
  "libCodeTwoWindowEffects.dylib",
);
const embeddedRuntimeExecutables = ["codetwo-desktop-host", "codetwo-tool-broker"];

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

function embedWindowEffects(bundle: string): void {
  if (!existsSync(windowEffectsLibrary)) {
    throw new Error(`Required window effects library is missing: ${windowEffectsLibrary}`);
  }
  const destination = join(bundle, "Contents", "MacOS", "libCodeTwoWindowEffects.dylib");
  copyFileSync(windowEffectsLibrary, destination);
  chmodSync(destination, 0o755);
}

function cloudSyncEntitlements(container: string, environment: "Development" | "Production"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>com.apple.developer.icloud-container-identifiers</key>
  <array><string>${container}</string></array>
  <key>com.apple.developer.icloud-container-environment</key>
  <string>${environment}</string>
  <key>com.apple.developer.icloud-services</key>
  <array><string>CloudKit</string></array>
</dict></plist>
`;
}

function cloudSyncInfo(identifier: string, version: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleDisplayName</key><string>C2 Cloud Sync</string>
  <key>CFBundleExecutable</key><string>CodeTwoCloudSyncHelper</string>
  <key>CFBundleIdentifier</key><string>${identifier}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>CodeTwoCloudSyncHelper</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`;
}

function embedCloudSyncHelper(bundle: string): void {
  if (!existsSync(cloudSyncHelperExecutable)) {
    throw new Error(`Required iCloud helper is missing: ${cloudSyncHelperExecutable}`);
  }
  const profile = process.env.CODETWO_ICLOUD_HELPER_PROVISIONING_PROFILE;
  const identity = process.env.CODETWO_ICLOUD_HELPER_SIGNING_IDENTITY ?? process.env.ELECTROBUN_DEVELOPER_ID;
  const helperBundle = join(bundle, "Contents", "Helpers", "CodeTwoCloudSyncHelper.app");
  // A release helper with restricted iCloud entitlements must be an independently provisioned
  // app-like bundle. Leave it out rather than shipping a control that can never authorize.
  if (channel.updatesEnabled && (!profile || !identity || identity === "-")) {
    rmSync(helperBundle, { recursive: true, force: true });
    return;
  }

  const contents = join(helperBundle, "Contents");
  const executableDirectory = join(contents, "MacOS");
  const executable = join(executableDirectory, "CodeTwoCloudSyncHelper");
  rmSync(helperBundle, { recursive: true, force: true });
  mkdirSync(executableDirectory, { recursive: true });
  copyFileSync(cloudSyncHelperExecutable, executable);
  chmodSync(executable, 0o755);
  const version = process.env.CODETWO_BUILD_VERSION ?? process.env.ELECTROBUN_APP_VERSION ?? "0.0.0";
  writeFileSync(join(contents, "Info.plist"), cloudSyncInfo(`${channel.identifier}.cloud-sync`, version));

  if (!identity) return;
  // Without a provisioning profile the helper cannot hold iCloud entitlements, but it still
  // needs a real ad-hoc bundle signature: the linker-signed executable alone seals no
  // resources and fails `codesign --verify --deep --strict`.
  if (!profile || identity === "-") {
    const adHoc = Bun.spawnSync(
      ["/usr/bin/codesign", "--force", "--sign", "-", "--timestamp=none", helperBundle],
      { stdout: "inherit", stderr: "inherit" },
    );
    if (adHoc.exitCode !== 0) process.exit(adHoc.exitCode);
    return;
  }
  if (!existsSync(profile)) throw new Error(`iCloud helper provisioning profile is missing: ${profile}`);
  copyFileSync(profile, join(contents, "embedded.provisionprofile"));
  const environment = process.env.CODETWO_ICLOUD_ENVIRONMENT === "Development"
    ? "Development"
    : "Production";
  const entitlements = join(cloudSyncHelperBuild, `${channelName}.entitlements.plist`);
  writeFileSync(entitlements, cloudSyncEntitlements(`iCloud.${channel.identifier}`, environment));
  const command = [
    "/usr/bin/codesign",
    "--force",
    "--sign",
    identity,
    "--options",
    "runtime",
    "--entitlements",
    entitlements,
    identity === "-" ? "--timestamp=none" : "--timestamp",
    helperBundle,
  ];
  const result = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}

function prepareEmbeddedRuntime(bundle: string): void {
  const runtimeDirectory = join(bundle, "Contents", "Resources", "app", "bin");
  for (const executable of embeddedRuntimeExecutables) {
    const path = join(runtimeDirectory, executable);
    if (!existsSync(path)) throw new Error(`Required desktop runtime is missing: ${path}`);
    chmodSync(path, 0o755);
  }
}

function modernizeWindowChrome(bundle: string): void {
  // The window lives in the bundled bun process, and AppKit gates the modern (macOS 26+) window
  // chrome — full-size traffic lights in a 32pt titlebar with the current ringed artwork — on the
  // link SDK of the process executable. Electrobun ships bun linked against SDK 15.2, so every
  // window renders the legacy compact titlebar with flat undersized buttons instead. Bump the
  // declared SDK so the chrome matches every other current app.
  const runtime = join(bundle, "Contents", "MacOS", "bun");
  if (!existsSync(runtime)) return;

  const show = Bun.spawnSync(["/usr/bin/vtool", "-show-build", runtime], {
    stdout: "pipe",
    stderr: "inherit",
  });
  if (show.exitCode !== 0) process.exit(show.exitCode);
  const buildInfo = show.stdout.toString();
  const minos = buildInfo.match(/minos\s+(\d+(?:\.\d+)*)/)?.[1] ?? "13.0";
  const sdk = Number(buildInfo.match(/sdk\s+(\d+(?:\.\d+)*)/)?.[1] ?? "0");
  if (sdk >= 26) return;

  const patched = `${runtime}.patched`;
  const bump = Bun.spawnSync(
    ["/usr/bin/vtool", "-set-build-version", "1", minos, "26.0", "-output", patched, runtime],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (bump.exitCode !== 0) process.exit(bump.exitCode);
  renameSync(patched, runtime);
  chmodSync(runtime, 0o755);

  // vtool invalidates the code signature; leave a valid one for the later signing phases, matching
  // how the embedded runtime executables are signed.
  const identity = process.env.ELECTROBUN_DEVELOPER_ID;
  const command = ["/usr/bin/codesign", "--force", "--sign", identity ?? "-"];
  if (identity && identity !== "-") {
    command.push("--options", "runtime", "--timestamp");
  } else {
    command.push("--timestamp=none");
  }
  command.push(runtime);
  const sign = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" });
  if (sign.exitCode !== 0) process.exit(sign.exitCode);
}

function signEmbeddedRuntime(bundle: string): void {
  const identity = process.env.ELECTROBUN_DEVELOPER_ID;
  if (!identity) return;

  const runtimeDirectory = join(bundle, "Contents", "Resources", "app", "bin");
  for (const executable of embeddedRuntimeExecutables) {
    const path = join(runtimeDirectory, executable);
    const command = [
      "/usr/bin/codesign",
      "--force",
      "--sign",
      identity,
      identity === "-" ? "--timestamp=none" : "--timestamp",
    ];
    if (identity !== "-") command.push("--options", "runtime");
    command.push(path);
    const result = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" });
    if (result.exitCode !== 0) process.exit(result.exitCode);
  }
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
  // The wrapper bundle (postWrap) no longer contains the unpacked payload — the app resources
  // were compressed into the update tarball after postBuild, where these were already checked
  // and signed.
  if (!wrapperBundle) {
    prepareEmbeddedRuntime(bundle);
    signEmbeddedRuntime(bundle);
    modernizeWindowChrome(bundle);
  }
  embedWindowEffects(bundle);
  embedCloudSyncHelper(bundle);
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
