import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

if (
  process.platform !== "darwin" ||
  process.env.ELECTROBUN_OS !== "macos" ||
  process.env.ELECTROBUN_BUILD_ENV !== "dev" ||
  process.env.ELECTROBUN_AD_HOC_SIGN !== "1" ||
  process.env.ELECTROBUN_DEVELOPER_ID !== "-"
) {
  process.exit(0);
}

const buildDirectory = process.env.ELECTROBUN_BUILD_DIR;
if (buildDirectory == null || buildDirectory === "")
  throw new Error("ELECTROBUN_BUILD_DIR is required for final package signing");

const bundles = readdirSync(buildDirectory)
  .filter((name) => name.endsWith(".app"))
  .map((name) => join(buildDirectory, name));
if (bundles.length === 0) {
  throw new Error(`No macOS app bundle was produced in ${buildDirectory}`);
}

for (const bundle of bundles) {
  for (const metadata of ["version.json", "build.json"]) {
    const path = join(bundle, "Contents", "Resources", metadata);
    if (!existsSync(path)) {
      throw new Error(`Cannot sign an incomplete app bundle; missing ${path}`);
    }
  }

  // Electrobun skips its distribution-signing phase for dev builds. This hook runs after its
  // metadata writes, so the final seal includes version.json and build.json. Do not enable
  // Hardened Runtime for ad-hoc builds: their components have no shared Team ID for validation.
  const result = Bun.spawnSync(
    [
      "/usr/bin/codesign",
      "--force",
      "--deep",
      "--sign",
      "-",
      "--timestamp=none",
      bundle,
    ],
    { stdout: "inherit", stderr: "inherit" }
  );
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
