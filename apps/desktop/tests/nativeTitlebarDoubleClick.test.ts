import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const macOSTest = test.skipIf(process.platform !== "darwin");

macOSTest(
  "AppKit preserves every supported titlebar double-click action",
  () => {
    const buildDirectory = mkdtempSync(
      join(tmpdir(), "codetwo-titlebar-double-click-")
    );
    const executable = join(buildDirectory, "titlebar-double-click-harness");
    const harness = fileURLToPath(
      new URL("./native/titlebarDoubleClickHarness.m", import.meta.url)
    );
    const implementation = fileURLToPath(
      new URL(
        "../native/window-effects/CodeTwoWindowEffects.m",
        import.meta.url
      )
    );

    try {
      const compile = Bun.spawnSync([
        "/usr/bin/clang",
        "-fobjc-arc",
        "-fblocks",
        "-mmacosx-version-min=14.0",
        "-framework",
        "AppKit",
        "-framework",
        "ApplicationServices",
        harness,
        implementation,
        "-o",
        executable,
      ]);
      expect(compile.exitCode, new TextDecoder().decode(compile.stderr)).toBe(
        0
      );

      const run = Bun.spawnSync([executable]);
      expect(run.exitCode, new TextDecoder().decode(run.stderr)).toBe(0);
      expect(new TextDecoder().decode(run.stdout)).toContain(
        "native titlebar double-click harness passed"
      );
    } finally {
      rmSync(buildDirectory, { recursive: true, force: true });
    }
  },
  15_000
);
