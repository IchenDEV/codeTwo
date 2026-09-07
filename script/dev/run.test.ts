import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const source = readFileSync(join(import.meta.dir, "run.sh"), "utf8");

function launch(mode: string, owner: "live" | "stale" | "unrelated" | "stubborn" = "live") {
  const root = mkdtempSync(join(tmpdir(), "codetwo-launch-"));
  const write = (path: string, text: string, executable = false) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    if (executable) chmodSync(path, 0o755);
  };
  try {
    const trace = join(root, "trace");
    const pid = join(root, ".codex/run/codetwo-dev.pid");
    const script = join(root, "script/dev/run.sh");
    const bin = join(root, "bin");
    write(trace, "");
    write(pid, "424242\n");
    write(join(root, "alive"), owner === "stale" ? "no" : "yes");
    // Replace only macOS executables; all launcher control flow runs unchanged.
    write(script, source.replaceAll("/usr/bin/plutil", '"$PROBE_BIN/plutil"').replaceAll("/usr/bin/log", '"$PROBE_BIN/log"'));
    write(join(bin, "plutil"), '#!/bin/bash\ncase "$*" in *CFBundleIdentifier*) echo dev.codetwo.app.dev;; *) echo fixture;; esac\n', true);
    write(join(bin, "log"), '#!/bin/bash\necho "log:$*" >> "$PROBE_TRACE"\n', true);
    write(join(root, "apps/desktop/build/dev-macos-arm64/C2-dev.app/Contents/MacOS/launcher"), '#!/bin/bash\necho launch >> "$PROBE_TRACE"\n', true);
    write(join(root, "mock.sh"), `
uname() { echo arm64; }
bun() { echo "build:$*" >> "$PROBE_TRACE"; }
cargo() { :; }
zig() { echo 0.15.2; }
sleep() { :; }
ps() {
  if [[ "$PROBE_OWNER" == unrelated ]]; then echo unrelated-process;
  else echo "$PROBE_ROOT/apps/desktop/build/dev-macos-arm64/C2-dev.app/Contents/MacOS/launcher"; fi
}
kill() {
  if [[ "$*" == *424242* ]]; then
    if [[ "$1" == -0 ]]; then [[ "$(cat "$PROBE_ROOT/alive")" == yes ]]; return; fi
    echo signal-owner >> "$PROBE_TRACE"
    if [[ "$PROBE_OWNER" != stubborn ]]; then echo no > "$PROBE_ROOT/alive"; fi
    return 0
  fi
  builtin kill "$@"
}
`);
    const result = spawnSync("bash", [script, mode], {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, BASH_ENV: join(root, "mock.sh"), PROBE_ROOT: root, PROBE_BIN: bin,
        PROBE_TRACE: trace, PROBE_OWNER: owner },
    });
    if (result.error) throw result.error;
    return { status: result.status, output: result.stdout + result.stderr, trace: readFileSync(trace, "utf8"),
      pid: existsSync(pid) ? readFileSync(pid, "utf8").trim() : null };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("ordinary launch modes preserve the tracked live owner before building", () => {
  for (const mode of ["run", "--verify", "--debug"]) {
    const result = launch(mode);
    expect(result.status).toBe(1);
    expect(result.output).toContain("already running");
    expect(result.trace).toBe("");
    expect(result.pid).toBe("424242");
  }
});

test("logs attach without building, replacing, or cleaning up the owner", () => {
  for (const mode of ["--logs", "--telemetry"]) {
    const result = launch(mode);
    expect(result.status).toBe(0);
    expect(result.trace).toContain("log:");
    expect(result.trace).toContain("processID == 424242");
    expect(result.trace).not.toContain("build:");
    expect(result.trace).not.toContain("signal-owner");
    expect(result.pid).toBe("424242");
    const stale = launch(mode, "stale");
    expect(stale.status).toBe(1);
    expect(stale.trace).toBe("");
  }
});

test("only explicit restart replaces an identified owner and waits before rebuilding", () => {
  const result = launch("--restart");
  expect(result.status).toBe(0);
  expect(result.trace).toContain("signal-owner\nbuild:");
  expect(result.trace).toContain("launch");
  const stubborn = launch("--restart", "stubborn");
  expect(stubborn.status).toBe(1);
  expect(stubborn.trace).toBe("signal-owner\n");
  expect(stubborn.pid).toBe("424242");
  const unrelated = launch("--restart", "unrelated");
  expect(unrelated.trace).not.toContain("signal-owner");
});
