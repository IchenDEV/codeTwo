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
  test("keeps one typed Electrobun request and one sidecar call method", () => {
    const bridge = readFileSync(resolve(desktop, "src/bridge.ts"), "utf8");
    const client = readFileSync(resolve(desktop, "src/electrobun/client.ts"), "utf8");
    const main = readFileSync(resolve(desktop, "src/electrobun/index.ts"), "utf8");
    const host = readFileSync(resolve(desktop, "src-host/src/lib.rs"), "utf8");

    expect(bridge).toContain("return desktopCall<T>(name, args ?? null, projectPath)");
    expect(bridge).toContain("projectPath: string | null = callProjectPath");
    expect(bridge).toContain(
      'call<ManagedPluginCatalog>("plugins.catalog", { scope: managedPluginScopeToWire(scope) }, null)',
    );
    expect(bridge).toContain('call("lsp.set_runtime_enabled", { enabled }, projectPath)');
    expect(client).toContain("rpc.request.call({ name, args, projectPath })");
    expect(main).toContain("host.call(name, args, projectPath)");
    expect(main).toContain("project_path: projectPath");
    expect(host.match(/if request\.method == "call"/g)).toHaveLength(1);
    expect(`${bridge}\n${client}\n${main}\n${host}`).not.toContain("@tauri-apps");
  });

  test("registers every static command used by the bridge", () => {
    const bridge = readFileSync(resolve(desktop, "src/bridge.ts"), "utf8");
    const pluginSources = [
      ...rustFiles(resolve(repository, "crates/core/src/app/plugins")),
      ...rustFiles(resolve(desktop, "src-host/src")),
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
    expect(used.size).toBeGreaterThan(160);
  });
});
