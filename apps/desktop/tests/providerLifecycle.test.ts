import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PROVIDERS } from "../src/electrobun/host/acp";
import { ProviderLifecycleManager } from "../src/electrobun/host/providerLifecycle";
import { detectHostToolEvidence } from "../src/electrobun/host/providerTools";

describe("provider lifecycle management", () => {
  test("installs a fixed provider package, reports its version, and persists enablement", async () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-provider-lifecycle-"));
    const installed = new Set<string>();
    const commands: string[][] = [];
    try {
      const runtime = {
        which(command: string) {
          if (command === "npm") return "/mock/npm";
          return installed.has(command) ? `/mock/${command}` : null;
        },
        version(command: string, args: string[]) {
          if (command.endsWith("codex-acp") && args.join(" ") === "--version") return "codex-acp 1.6.2";
          return null;
        },
        async run(command: string[]) {
          commands.push(command);
          installed.add("codex-acp");
          return { stdout: "installed", stderr: "" };
        },
        refreshPath() {},
      };
      const manager = new ProviderLifecycleManager(directory, runtime);

      expect(await manager.status("codex")).toMatchObject({
        enabled: true,
        installed: false,
        version: null,
        install_supported: true,
        upgrade_supported: false,
      });

      await manager.apply("codex", "install");

      expect(commands).toEqual([
        ["/mock/npm", "install", "--global", "@agentclientprotocol/codex-acp@latest"],
      ]);
      expect(await manager.status("codex")).toMatchObject({
        enabled: true,
        installed: true,
        version: "1.6.2",
        install_supported: false,
        upgrade_supported: true,
      });

      manager.setEnabled("codex", false);
      expect((await new ProviderLifecycleManager(directory, runtime).status("codex")).enabled).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("rejects unknown providers and missing installers before spawning a process", async () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-provider-lifecycle-"));
    try {
      const manager = new ProviderLifecycleManager(directory, {
        which: () => null,
        version: () => null,
        run: async () => ({ stdout: "", stderr: "" }),
        refreshPath() {},
      });

      expect(() => manager.setEnabled("not-a-provider", false)).toThrow("unknown provider");
      await expect(manager.apply("cursor", "install")).rejects.toThrow("/bin/sh is required");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("starts independent version probes together instead of serializing slow CLIs", async () => {
    const directory = mkdtempSync(join(tmpdir(), "codetwo-provider-lifecycle-"));
    const started: string[] = [];
    const releases: Array<() => void> = [];
    try {
      const manager = new ProviderLifecycleManager(directory, {
        which: (command) => `/mock/${command}`,
        version: async (command) => {
          started.push(command);
          await new Promise<void>((resolve) => releases.push(resolve));
          return `${command} 1.2.3`;
        },
        run: async () => ({ stdout: "", stderr: "" }),
        refreshPath() {},
      });

      const pending = manager.list(detectHostToolEvidence({}, directory));
      await Promise.resolve();
      expect(started).toHaveLength(PROVIDERS.length);
      releases.forEach((release) => release());
      const providers = await pending;
      expect(providers).toHaveLength(PROVIDERS.length);
    } finally {
      releases.forEach((release) => release());
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
