import { readdirSync } from "node:fs";
import { join } from "node:path";

if (process.platform !== "darwin") process.exit(0);

const wrapperBundle = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
const buildDirectory = process.env.ELECTROBUN_BUILD_DIR;
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

function setPlistString(plist: string, key: string, value: string): void {
  const replace = Bun.spawnSync(["/usr/bin/plutil", "-replace", key, "-string", value, plist]);
  if (replace.exitCode === 0) return;

  const insert = Bun.spawnSync(["/usr/bin/plutil", "-insert", key, "-string", value, plist], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (insert.exitCode !== 0) process.exit(insert.exitCode);
}

for (const bundle of bundles) {
  const plist = join(bundle, "Contents", "Info.plist");
  setPlistString(plist, "CFBundleDisplayName", process.env.ELECTROBUN_APP_NAME ?? "C2");
  setPlistString(plist, "CFBundleShortVersionString", process.env.ELECTROBUN_APP_VERSION ?? "0.0.0");
  for (const [key, value] of Object.entries(descriptions)) {
    setPlistString(plist, key, value);
  }
}
