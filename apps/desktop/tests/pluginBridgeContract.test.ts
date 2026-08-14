import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const desktop = resolve(import.meta.dir, "..");
const repository = resolve(desktop, "../..");

function rustFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? rustFiles(path) : path.endsWith(".rs") ? [path] : [];
  });
}

describe("plugin bridge contract", () => {
  test("keeps one native invoke and one Tauri command", () => {
    const bridge = readFileSync(resolve(desktop, "src/bridge.ts"), "utf8");
    const native = readFileSync(resolve(desktop, "src-tauri/src/lib.rs"), "utf8");

    expect(bridge.match(/\binvoke(?:<[^>]+>)?\(/g)).toEqual(['invoke<T>(']);
    expect(bridge).toContain('invoke<T>("call", { name, args: args ?? null })');
    expect(native.match(/^#\[tauri::command\]/gm)).toHaveLength(1);
    expect(native).toContain("tauri::generate_handler![call]");
  });

  test("registers every static command used by the bridge", () => {
    const bridge = readFileSync(resolve(desktop, "src/bridge.ts"), "utf8");
    const pluginSources = [
      ...rustFiles(resolve(repository, "crates/core/src/app/plugins")),
      ...rustFiles(resolve(desktop, "src-tauri/src")),
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    const used = new Set(
      [...bridge.matchAll(/\bcall(?:<[^>]+>)?\(\s*"([^"]+)"/g)].map((match) => match[1]),
    );
    const registered = new Set(
      [...pluginSources.matchAll(/ctx\.command(?:_described)?\(\s*"([^"]+)"/g)].map(
        (match) => match[1],
      ),
    );

    expect([...used].filter((name) => !registered.has(name))).toEqual([]);
    expect(used.size).toBeGreaterThan(180);
  });
});
