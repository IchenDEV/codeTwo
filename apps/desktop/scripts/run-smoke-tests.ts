#!/usr/bin/env bun
import { Glob } from "bun";

const files = [...new Glob("tests/*.test.ts").scanSync()].toSorted();
if (files.length === 0) {
  console.error("No smoke tests matched tests/*.test.ts");
  process.exit(1);
}

const result = Bun.spawnSync(["bun", "test", "--timeout", "10000", ...files], {
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(result.exitCode ?? 1);
