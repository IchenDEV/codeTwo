import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PureBunHost } from "../src/electrobun/host";

const desktop = resolve(import.meta.dir, "..");

describe("plugin bridge contract", () => {
  test("keeps one typed Electrobun request backed by the in-process Bun host", () => {
    const bridge = readFileSync(resolve(desktop, "src/bridge.ts"), "utf8");
    const client = readFileSync(resolve(desktop, "src/electrobun/client.ts"), "utf8");
    const main = readFileSync(resolve(desktop, "src/electrobun/index.ts"), "utf8");
    const config = readFileSync(resolve(desktop, "electrobun.config.ts"), "utf8");
    const prepare = readFileSync(resolve(desktop, "scripts/prepare-electrobun.ts"), "utf8");

    expect(bridge).toContain("return desktopCall<T>(name, args ?? null, projectPath)");
    expect(bridge).toContain("projectPath: string | null = callProjectPath");
    expect(bridge).toContain(
      'call<ManagedPluginCatalog>("plugins.catalog", { scope: managedPluginScopeToWire(scope) }, null)',
    );
    expect(bridge).toContain('call("lsp.set_runtime_enabled", { enabled }, projectPath)');
    expect(client).toContain("rpc.request.call({ name, args, projectPath })");
    expect(main).toContain("new PureBunHost(dataDir");
    expect(main).toContain("host.call(name, args, projectPath)");
    expect(`${main}\n${config}\n${prepare}`).not.toContain("codetwo-desktop-host");
    expect(`${config}\n${prepare}`).not.toContain("cargo");
    expect(`${bridge}\n${client}\n${main}`).not.toContain("@tauri-apps");
  });

  test("registers every static command used by the bridge", async () => {
    const bridge = readFileSync(resolve(desktop, "src/bridge.ts"), "utf8");
    const used = new Set(
      [...bridge.matchAll(/\bcall(?:<[^>]+>)?\(\s*"([^"]+)"/g)].map((match) => match[1]),
    );
    const dataDir = mkdtempSync(join(tmpdir(), "codetwo-bun-contract-"));
    const host = new PureBunHost(dataDir, () => {});
    try {
      const registered = new Set(host.commands());
      expect([...used].filter((name) => !registered.has(name))).toEqual([]);
      expect(used.size).toBeGreaterThan(170);
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
