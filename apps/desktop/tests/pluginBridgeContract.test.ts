import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const desktop = resolve(import.meta.dir, "..");
const repository = resolve(desktop, "../..");

function rustFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? rustFiles(path)
      : path.endsWith(".rs")
        ? [path]
        : [];
  });
}

describe("plugin bridge contract", () => {
  test("keeps one typed renderer request and one versioned Plugin Kernel process boundary", () => {
    const bridge = readFileSync(resolve(desktop, "src/bridge.ts"), "utf-8");
    const client = readFileSync(
      resolve(desktop, "src/electrobun/client.ts"),
      "utf-8"
    );
    const main = readFileSync(
      resolve(desktop, "src/electrobun/index.ts"),
      "utf-8"
    );
    const adapter = readFileSync(
      resolve(desktop, "src/electrobun/nativeHost.ts"),
      "utf-8"
    );
    const host = readFileSync(resolve(desktop, "src-host/src/lib.rs"), "utf-8");
    const enginePlugin = readFileSync(
      resolve(repository, "crates/plugins/src/app/plugins/engine.rs"),
      "utf-8"
    );
    const config = readFileSync(
      resolve(desktop, "electrobun.config.ts"),
      "utf-8"
    );
    const prepare = readFileSync(
      resolve(desktop, "scripts/prepare-electrobun.ts"),
      "utf-8"
    );
    const macBundlePatch = readFileSync(
      resolve(desktop, "scripts/patch-macos-info.ts"),
      "utf-8"
    );
    const macPackageSigning = readFileSync(
      resolve(desktop, "scripts/sign-macos-package.ts"),
      "utf-8"
    );

    expect(bridge).toContain(
      "return desktopCall<T>(name, args ?? null, projectPath)"
    );
    expect(bridge).toContain("projectPath: string | null = callProjectPath");
    expect(bridge).toContain(
      'call<ManagedPluginCatalog>("plugins.catalog", { scope: managedPluginScopeToWire(scope) }, null)'
    );
    expect(bridge).toContain(
      'call("lsp.set_runtime_enabled", { enabled }, projectPath)'
    );
    expect(client).toContain(
      'rpc.request("call", { name, args, projectPath })'
    );
    expect(main).toContain("new NativeHost({");
    expect(main).toContain("await host.start()");
    expect(main).toContain("host.call(name, args, projectPath)");
    expect(adapter).toContain(
      'return this.request("call", { name, args, project_path: projectPath })'
    );
    expect(adapter).toContain("desktopHostProtocolVersion = 1");
    expect(host).toContain('"protocol_version": 1');
    expect(host.match(/if request\.method == "call"/gu)).toHaveLength(1);
    expect(bridge).toContain("model: initialModel ?? null");
    expect(enginePlugin).toContain("model: Option<String>");
    expect(enginePlugin).toContain("model: args.model");
    expect(config).toContain("codetwo-desktop-host");
    expect(config).toContain("codetwo-tool-broker");
    expect(prepare).toContain(
      '"cargo", "build", "--release", "-p", "codetwo-desktop-host"'
    );
    expect(prepare).toContain('"bun", "run", "build:tool-broker"');
    expect(config).toContain('postPackage: "scripts/sign-macos-package.ts"');
    expect(macBundlePatch).not.toContain('"--deep"');
    expect(macPackageSigning).toContain(
      'join(bundle, "Contents", "Resources", metadata)'
    );
    expect(macPackageSigning).toContain('"--force", "--deep", "--sign", "-"');
    expect(`${bridge}\n${client}\n${main}\n${host}`).not.toContain(
      "@tauri-apps"
    );
    expect(`${main}\n${adapter}`).not.toContain("PureBunHost");
    for (const legacyHost of [
      "builtinPlugins.ts",
      "database.ts",
      "index.ts",
      "remote.ts",
    ]) {
      expect(
        existsSync(resolve(desktop, "src/electrobun/host", legacyHost))
      ).toBe(false);
    }
  });

  test("registers every static command used by the renderer bridge", () => {
    const bridge = readFileSync(resolve(desktop, "src/bridge.ts"), "utf-8");
    const pluginSources = [
      ...rustFiles(resolve(repository, "crates/plugins/src/app/plugins")),
      ...rustFiles(resolve(desktop, "src-host/src")),
    ]
      .map((path) => readFileSync(path, "utf-8"))
      .join("\n");

    const used = new Set(
      [...bridge.matchAll(/\bcall(?:<[^>]+>)?\(\s*"([^"]+)"/gu)].map(
        (match) => match[1]
      )
    );
    const registered = new Set(
      [
        ...pluginSources.matchAll(
          /ctx\.command(?:_described|_with_realm|_extension_public)?\(\s*"([^"]+)"/gu
        ),
      ].map((match) => match[1])
    );

    expect([...used].filter((name) => !registered.has(name))).toEqual([]);
    expect(used.size).toBeGreaterThan(180);
  });

  test("forwards plugin changes and exposes the developer commands through the typed bridge", () => {
    const bridge = readFileSync(resolve(desktop, "src/bridge.ts"), "utf-8");
    const hostEvents = readFileSync(
      resolve(desktop, "src-host/src/host_events.rs"),
      "utf-8"
    );

    expect(bridge).toContain(
      'call<PluginDeveloperStatus>("plugins.developer_status"'
    );
    expect(bridge).toContain(
      'call<PluginDeveloperStatus>("plugins.set_developer_mode"'
    );
    expect(bridge).toContain(
      'call<PluginDeveloperStatus>("plugins.reload_development"'
    );
    expect(hostEvents).toContain("ctx.on::<PluginsChanged");
    expect(hostEvents).toContain('host.emit("plugins-changed", ())');
  });
});
