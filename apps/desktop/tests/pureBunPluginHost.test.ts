import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PureBunHost } from "../src/electrobun/host";
import { BUILTIN_PLUGIN_BY_ID } from "../src/electrobun/host/builtinPlugins";
import { BUILTIN_UI_COMPONENTS } from "../src/plugins/catalog";

const PLUGIN_SOURCE = String.raw`
const readline = require("node:readline");
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const input = readline.createInterface({ input: process.stdin });
let nextId = 10_000;
const pending = new Map();

function callHost(name, args) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method: "command/call", params: { name, args } });
  return new Promise((resolve, reject) => pending.set(String(id), { resolve, reject }));
}

input.on("line", async (line) => {
  const message = JSON.parse(line);
  if (message.method === undefined) {
    const request = pending.get(String(message.id));
    if (!request) return;
    pending.delete(String(message.id));
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
    return;
  }
  if (message.method === "initialize") {
    globalThis.initialized = message.params;
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        name: "fixture",
        version: "1.0.0",
        protocolVersion: "1.0.0",
        commands: [
          { name: "fixture.where", description: "Describe this isolated plugin process." },
          { name: "fixture.read", description: "Read through the host command seam." },
        ],
        events: ["engine/event"],
      },
    });
    return;
  }
  if (message.method === "command/invoke") {
    try {
      const { name, args } = message.params;
      const result = name === "fixture.read"
        ? await callHost("workspace.read_text", args)
        : {
            pid: process.pid,
            dataDir: globalThis.initialized.dataDir,
            projectPath: globalThis.initialized.projectPath ?? null,
          };
      send({ jsonrpc: "2.0", id: message.id, result });
    } catch (error) {
      send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: String(error.message ?? error) } });
    }
  }
});
`;

const LSP_SOURCE = String.raw`#!/usr/bin/env bun
let buffer = Buffer.alloc(0);
const send = (message) => {
  const body = Buffer.from(JSON.stringify(message));
  process.stdout.write("Content-Length: " + body.byteLength + "\r\n\r\n");
  process.stdout.write(body);
};
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1] ?? -1);
    const bodyStart = headerEnd + 4;
    if (length < 0 || buffer.byteLength < bodyStart + length) return;
    const message = JSON.parse(buffer.subarray(bodyStart, bodyStart + length).toString("utf8"));
    buffer = buffer.subarray(bodyStart + length);
    if (message.id !== undefined) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: message.method === "initialize" ? { capabilities: { hoverProvider: true } } : null,
      });
    }
  }
});
`;

interface RuntimeFixtureOptions {
  projectCapable?: boolean;
  ui?: boolean;
  lsp?: boolean;
}

function installRuntime(dataDir: string, trusted: boolean, options: RuntimeFixtureOptions | boolean = {}): void {
  const normalized = typeof options === "boolean" ? { projectCapable: options } : options;
  const pluginDir = join(dataDir, "plugins", "fixture");
  const bundleDir = join(pluginDir, "bundle");
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(join(bundleDir, "plugin.cjs"), PLUGIN_SOURCE, "utf8");
  if (normalized.lsp) {
    writeFileSync(join(bundleDir, "lsp.cjs"), LSP_SOURCE, "utf8");
    chmodSync(join(bundleDir, "lsp.cjs"), 0o755);
  }
  writeFileSync(join(pluginDir, "installed-plugin.json"), JSON.stringify({
    schema_version: 2,
    id: "fixture",
    name: "Fixture Runtime",
    version: "1.0.0",
    description: "Process-isolated test plugin",
    author: "C2",
    source: "Test",
    repository: "local",
    spec_version: "1.0.0",
    standard: "agent_plugins",
    standards: ["agent_plugins"],
    enabled: true,
    trusted,
    scope: "user",
    counts: {
      skills: 0,
      subagents: 0,
      mcp_servers: 0,
      scaffolds: 0,
      commands: 0,
      hooks: 0,
      lsp_servers: normalized.lsp ? 1 : 0,
      monitors: 0,
      apps: 0,
      scenes: 0,
      pipelines: 0,
      runtime: 1,
      ui: normalized.ui ? 1 : 0,
    },
    components: [],
    scaffolds: [],
    extension_components: [],
    ui_contributions: normalized.ui ? [{
      id: "where",
      slot: "composer.toolbar",
      label: "Where",
      description: "Show this plugin realm.",
      command: "fixture.where",
      input: { source: "slot" },
      order: 10,
    }] : [],
    lsp_servers: normalized.lsp ? [{
      id: "fixture-lsp",
      languages: ["fixturelang"],
      command: "lsp.cjs",
      args: [],
      env: { C2_LSP_FIXTURE: "1" },
    }] : [],
    diagnostics: [],
    runtime: {
      protocol: "1.0.0",
      command: process.execPath,
      args: ["plugin.cjs"],
      inject: ["extensions-runtime"],
      scopeSupport: normalized.projectCapable ? ["user", "project"] : ["user"],
    },
  }, null, 2));
}

function temporary(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

async function stopped(pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      process.kill(pid, 0);
      await Bun.sleep(10);
    } catch {
      return true;
    }
  }
  return false;
}

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const value = read();
    if (value !== undefined) return value;
    await Bun.sleep(10);
  }
  throw new Error("timed out waiting for host event");
}

describe("Pure Bun process plugin host", () => {
  test("models in-process capabilities as owned plugins instead of one Pure Bun host", async () => {
    const dataDir = temporary("codetwo-builtin-plugin-data-");
    const host = new PureBunHost(dataDir, () => {});
    try {
      const catalog = await host.call("plugins.catalog", { scope: { kind: "user" } }, null) as {
        plugins: Array<{
          id: string;
          metadata: { essential: boolean };
          enabled: boolean;
          running: boolean;
        }>;
      };
      expect(catalog.plugins.some((plugin) => plugin.id === "pure-bun")).toBe(false);
      expect(catalog.plugins).toContainEqual(expect.objectContaining({
        id: "core",
        metadata: expect.objectContaining({ essential: true }),
        enabled: true,
        running: true,
      }));
      expect(catalog.plugins).toContainEqual(expect.objectContaining({
        id: "terminal",
        metadata: expect.objectContaining({ essential: false }),
        enabled: true,
        running: true,
      }));

      const commands = await host.call("kernel.commands", null, null) as Array<{ name: string; plugin: string }>;
      expect(commands).toContainEqual(expect.objectContaining({ name: "git.status", plugin: "git" }));
      expect(commands).toContainEqual(expect.objectContaining({ name: "terminal.spawn", plugin: "terminal" }));
      expect(commands).toContainEqual(expect.objectContaining({ name: "workspace.search", plugin: "workspace-search" }));
      expect(commands).toContainEqual(expect.objectContaining({ name: "plugins.catalog", plugin: "kernel" }));
      expect(commands).toContainEqual(expect.objectContaining({ name: "computer_use.settings", plugin: "computer-use" }));
      expect(commands).toContainEqual(expect.objectContaining({ name: "browser_use.settings", plugin: "browser-use" }));
      const browserUse = await host.call("browser_use.select", { backend: "automatic" }, null) as {
        selections: Record<string, string>;
      };
      expect(browserUse.selections).toEqual({ "*": "automatic" });
      expect(JSON.parse(readFileSync(join(dataDir, "host-tools.json"), "utf8")).browser_use_selection)
        .toEqual({ "*": "automatic" });
      for (const component of BUILTIN_UI_COMPONENTS) {
        expect(BUILTIN_PLUGIN_BY_ID.get(component.pluginId)?.components).toContain(component.id);
      }
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("unloads and restores a non-core built-in through the shared lifecycle", async () => {
    const dataDir = temporary("codetwo-builtin-lifecycle-data-");
    const host = new PureBunHost(dataDir, () => {});
    try {
      expect(await host.call("terminal.tmux_available", null, null)).toBeBoolean();
      expect(await host.call("terminal.spawn", { id: "builtin-lifecycle", cwd: dataDir }, null)).toEqual({
        created: true,
        restore: "",
      });
      const disable = await host.call("plugins.plan_change", {
        plugin: "terminal",
        scope: { kind: "user" },
        state: "disabled",
      }, null) as { id: string; affected: string[]; active_resources: unknown[] };
      expect(disable.affected).toContain("terminal");
      expect(disable.active_resources).not.toHaveLength(0);
      await host.call("plugins.apply_change", { id: disable.id }, null);

      await expect(host.call("terminal.tmux_available", null, null)).rejects.toThrow("plugin `terminal` is disabled");
      expect(host.commands()).not.toContain("terminal.spawn");
      expect(await host.call("kernel.services", null, null)).not.toContain("terminal");
      expect(await host.call("kernel.commands", null, null)).not.toContainEqual(
        expect.objectContaining({ name: "terminal.spawn" }),
      );

      const enable = await host.call("plugins.plan_change", {
        plugin: "terminal",
        scope: { kind: "user" },
        state: "enabled",
      }, null) as { id: string };
      await host.call("plugins.apply_change", { id: enable.id }, null);
      expect(await host.call("terminal.tmux_available", null, null)).toBeBoolean();
      expect(await host.call("kernel.services", null, null)).toContain("terminal");
      expect(await host.call("terminal.spawn", { id: "builtin-lifecycle", cwd: dataDir }, null)).toEqual({
        created: true,
        restore: "",
      });
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("makes dependents pending and preserves project realm isolation", async () => {
    const dataDir = temporary("codetwo-builtin-dependency-data-");
    const projectA = temporary("codetwo-builtin-dependency-a-");
    const projectB = temporary("codetwo-builtin-dependency-b-");
    const host = new PureBunHost(dataDir, () => {});
    try {
      const disable = await host.call("plugins.plan_change", {
        plugin: "workspace",
        scope: { kind: "project", project_path: projectA },
        state: "disabled",
      }, projectA) as { id: string; affected: string[] };
      expect(disable.affected).toEqual(expect.arrayContaining([
        "workspace",
        "workspace-search",
        "git",
        "lsp",
        "issues",
        "artifacts",
      ]));
      await host.call("plugins.apply_change", { id: disable.id }, projectA);

      await expect(host.call("workspace.cancel_search", null, projectA)).rejects.toThrow(
        "plugin `workspace-search` is waiting for workspace",
      );
      expect(await host.call("workspace.cancel_search", null, projectB)).toBe(false);
      expect(await host.call("workspace.cancel_search", null, null)).toBe(false);

      const catalog = await host.call("plugins.catalog", {
        scope: { kind: "project", project_path: projectA },
      }, projectA) as { plugins: Array<{ id: string; enabled: boolean; running: boolean; missing: string[] }> };
      expect(catalog.plugins).toContainEqual(expect.objectContaining({
        id: "workspace-search",
        enabled: true,
        running: false,
        missing: ["workspace"],
      }));
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(projectA, { recursive: true, force: true });
      rmSync(projectB, { recursive: true, force: true });
    }
  });

  test("changes a built-in UI component without unloading its owner", async () => {
    const dataDir = temporary("codetwo-builtin-component-data-");
    const host = new PureBunHost(dataDir, () => {});
    try {
      const plan = await host.call("plugins.plan_change", {
        plugin: "browser",
        scope: { kind: "user" },
        state: "disabled",
        component: "browser.dock",
      }, null) as { id: string; active_resources: unknown[] };
      expect(plan.active_resources).toHaveLength(0);
      await host.call("plugins.apply_change", { id: plan.id }, null);
      const catalog = await host.call("plugins.catalog", { scope: { kind: "user" } }, null) as {
        plugins: Array<{ id: string; state: string; enabled: boolean; running: boolean; components: Record<string, string> }>;
      };
      expect(catalog.plugins).toContainEqual(expect.objectContaining({
        id: "browser",
        state: "inherit",
        enabled: true,
        running: true,
        components: { "browser.dock": "disabled" },
      }));
      await expect(host.call("plugins.plan_change", {
        plugin: "kernel",
        scope: { kind: "user" },
        state: "disabled",
      }, null)).rejects.toThrow("essential plugin");
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("trust-gates a bundle, registers its commands, calls back into the host, and unloads exactly", async () => {
    const dataDir = temporary("codetwo-plugin-data-");
    const workspace = temporary("codetwo-plugin-workspace-");
    installRuntime(dataDir, false);
    const host = new PureBunHost(dataDir, () => {});
    try {
      expect(await host.call("extensions.list", null, null)).toEqual({ running: [], untrusted: ["fixture"] });
      await expect(host.call("fixture.where", null, null)).rejects.toThrow("does not implement command");
      const untrustedPlan = await host.call("plugins.plan_change", {
        plugin: "bundle:fixture",
        scope: { kind: "user" },
        state: "enabled",
      }, null) as { id: string };
      await expect(host.call("plugins.apply_change", { id: untrustedPlan.id }, null)).rejects.toThrow("not trusted");
      const rolledBack = await host.call("plugins.catalog", { scope: { kind: "user" } }, null) as {
        plugins: Array<{ id: string; state: string; enabled: boolean }>;
      };
      expect(rolledBack.plugins).toContainEqual(expect.objectContaining({
        id: "bundle:fixture",
        state: "inherit",
        enabled: false,
      }));

      await host.call("plugins.set_trusted", { id: "fixture", value: true }, null);
      const where = await host.call("fixture.where", null, null) as {
        pid: number;
        dataDir: string;
        projectPath: string | null;
      };
      expect(where.projectPath).toBeNull();
      expect(where.dataDir).toBe(join(dataDir, "plugins", ".data", "fixture"));
      expect((await host.call("kernel.commands", null, null) as Array<{ name: string; plugin: string }>))
        .toContainEqual(expect.objectContaining({ name: "fixture.where", plugin: "bundle:fixture" }));

      await host.call(
        "workspace.write_text",
        { cwd: workspace, path: "host.txt", content: "through the command seam" },
        workspace,
      );
      expect(await host.call(
        "fixture.read",
        { cwd: workspace, path: "host.txt" },
        workspace,
      )).toBe("through the command seam");

      const plan = await host.call("plugins.plan_change", {
        plugin: "bundle:fixture",
        scope: { kind: "user" },
        state: "disabled",
      }, null) as { id: string; requires_confirmation: boolean; active_resources: unknown[] };
      expect(plan.requires_confirmation).toBe(true);
      expect(plan.active_resources).not.toHaveLength(0);
      await host.call("plugins.apply_change", { id: plan.id }, null);
      await expect(host.call("fixture.where", null, null)).rejects.toThrow("does not implement command");
      expect(await stopped(where.pid)).toBe(true);
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("creates isolated project realms and blocks global fallback for a disabled project", async () => {
    const dataDir = temporary("codetwo-project-plugin-data-");
    const projectA = temporary("codetwo-project-plugin-a-");
    const projectB = temporary("codetwo-project-plugin-b-");
    installRuntime(dataDir, true, true);
    const host = new PureBunHost(dataDir, () => {});
    try {
      const global = await host.call("fixture.where", null, null) as Record<string, unknown>;
      const localA = await host.call("fixture.where", null, projectA) as Record<string, unknown>;
      const localB = await host.call("fixture.where", null, projectB) as Record<string, unknown>;
      expect(localA.projectPath).toBe(projectA);
      expect(localB.projectPath).toBe(projectB);
      expect(new Set([global.pid, localA.pid, localB.pid]).size).toBe(3);
      expect(new Set([global.dataDir, localA.dataDir, localB.dataDir]).size).toBe(3);

      const globalPlan = await host.call("plugins.plan_change", {
        plugin: "bundle:fixture",
        scope: { kind: "user" },
        state: "disabled",
      }, null) as { active_resources: Array<{ kind: string }> };
      expect(globalPlan.active_resources.filter((resource) => resource.kind === "plugin_scope")).toHaveLength(3);

      const projectCatalog = await host.call("plugins.catalog", {
        scope: { kind: "project", project_path: projectA },
      }, projectA) as { plugins: Array<{ id: string; running: boolean }> };
      expect(projectCatalog.plugins).toContainEqual(expect.objectContaining({ id: "bundle:fixture", running: true }));

      const plan = await host.call("plugins.plan_change", {
        plugin: "bundle:fixture",
        scope: { kind: "project", project_path: projectA },
        state: "disabled",
      }, projectA) as { id: string };
      await host.call("plugins.apply_change", { id: plan.id }, projectA);
      await expect(host.call("fixture.where", null, projectA)).rejects.toThrow("disabled for project");
      expect((await host.call("fixture.where", null, projectB) as Record<string, unknown>).pid).toBe(localB.pid);
      expect((await host.call("fixture.where", null, null) as Record<string, unknown>).pid).toBe(global.pid);
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(projectA, { recursive: true, force: true });
      rmSync(projectB, { recursive: true, force: true });
    }
  });

  test("invokes only active manifest-owned UI actions in the selected plugin realm", async () => {
    const dataDir = temporary("codetwo-ui-plugin-data-");
    const workspace = temporary("codetwo-ui-plugin-workspace-");
    installRuntime(dataDir, true, { projectCapable: true, ui: true });
    const host = new PureBunHost(dataDir, () => {});
    try {
      const result = await host.call("plugins.invoke_ui", {
        plugin_id: "fixture",
        contribution_id: "where",
        context: { cwd: workspace, sessionId: "session-1" },
      }, workspace) as { projectPath: string | null };
      expect(result.projectPath).toBe(workspace);

      await expect(host.call("plugins.invoke_ui", {
        plugin_id: "fixture",
        contribution_id: "missing",
        context: {},
      }, workspace)).rejects.toThrow("unknown UI contribution");

      const plan = await host.call("plugins.plan_change", {
        plugin: "bundle:fixture",
        scope: { kind: "project", project_path: workspace },
        state: "disabled",
      }, workspace) as { id: string };
      await host.call("plugins.apply_change", { id: plan.id }, workspace);
      await expect(host.call("plugins.invoke_ui", {
        plugin_id: "fixture",
        contribution_id: "where",
        context: {},
      }, workspace)).rejects.toThrow("disabled in this scope");
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("starts a trusted manifest LSP and tears it down when plugin policy changes", async () => {
    const dataDir = temporary("codetwo-lsp-plugin-data-");
    const workspace = temporary("codetwo-lsp-plugin-workspace-");
    installRuntime(dataDir, true, { lsp: true });
    const events: Array<{ name: string; payload: unknown }> = [];
    const host = new PureBunHost(dataDir, (event) => events.push(event));
    try {
      const key = await host.call("lsp.start", { cwd: workspace, lang: "fixturelang" }, workspace) as string;
      expect(key).toContain("bundle:fixture:lsp:fixture-lsp");
      await host.call("lsp.send", {
        key,
        payload: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }, workspace);
      const message = await waitFor(() => events.find((event) => {
        if (event.name !== "lsp-message") return false;
        const payload = event.payload as { key?: string };
        return payload.key === key;
      }));
      expect(JSON.parse((message.payload as { payload: string }).payload)).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { capabilities: { hoverProvider: true } },
      });

      await host.call("plugins.set_trusted", { id: "fixture", value: false }, null);
      await expect(host.call("lsp.send", { key, payload: "{}" }, workspace))
        .rejects.toThrow("language server not found");
      expect(await host.call("lsp.start", { cwd: workspace, lang: "fixturelang" }, workspace)).toBeNull();
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("rejects a stale single-use lifecycle plan", async () => {
    const dataDir = temporary("codetwo-stale-plugin-data-");
    installRuntime(dataDir, true);
    const host = new PureBunHost(dataDir, () => {});
    try {
      const stale = await host.call("plugins.plan_change", {
        plugin: "bundle:fixture",
        scope: { kind: "user" },
        state: "disabled",
      }, null) as { id: string };
      await host.call("plugins.set_enabled", { id: "fixture", value: false }, null);
      await expect(host.call("plugins.apply_change", { id: stale.id }, null)).rejects.toThrow("stale");
      await expect(host.call("plugins.apply_change", { id: stale.id }, null)).rejects.toThrow("already used");
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("reconciles component-only installed record changes into the skill library", async () => {
    const dataDir = temporary("codetwo-component-plugin-data-");
    installRuntime(dataDir, true);
    const host = new PureBunHost(dataDir, () => {});
    try {
      const before = await host.call("fixture.where", null, null) as { pid: number };
      const recordPath = join(dataDir, "plugins", "fixture", "installed-plugin.json");
      const record = JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>;
      record.components = [{
        id: "skill:fixture",
        name: "Fixture Skill",
        description: "A component-only inventory change",
        source: "Test",
        payload: { kind: "fragment", text: "fixture" },
      }];
      writeFileSync(recordPath, JSON.stringify(record, null, 2), "utf8");

      expect(await host.call("skills.list", null, null)).toContainEqual(expect.objectContaining({
        id: "skill:fixture",
        name: "Fixture Skill",
        kind: "fragment",
      }));
      const after = await host.call("fixture.where", null, null) as { pid: number };
      expect(after.pid).not.toBe(before.pid);
      expect(await stopped(before.pid)).toBe(true);
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test("keeps third-party runtimes off in safe mode until an explicit reset repairs policy", async () => {
    const dataDir = temporary("codetwo-safe-plugin-data-");
    installRuntime(dataDir, true);
    writeFileSync(join(dataDir, "plugin-config.json"), "{broken", "utf8");
    writeFileSync(join(dataDir, "plugin-config.last-good.json"), "{also-broken", "utf8");
    const host = new PureBunHost(dataDir, () => {});
    try {
      const catalog = await host.call("plugins.catalog", { scope: { kind: "user" } }, null) as {
        recovery: { kind: string };
        plugins: Array<{ id: string; enabled: boolean }>;
      };
      expect(catalog.recovery.kind).toBe("safe_mode");
      expect(catalog.plugins).toContainEqual(expect.objectContaining({ id: "core", enabled: true }));
      expect(catalog.plugins).toContainEqual(expect.objectContaining({ id: "kernel", enabled: true }));
      expect(catalog.plugins).toContainEqual(expect.objectContaining({ id: "workspace", enabled: false }));
      expect(catalog.plugins).toContainEqual(expect.objectContaining({ id: "bundle:fixture", enabled: false }));
      await expect(host.call("fixture.where", null, null)).rejects.toThrow("does not implement command");

      await host.call("plugins.reset", { plugin: "bundle:fixture", scope: { kind: "user" } }, null);
      expect((await host.call("fixture.where", null, null) as { pid: number }).pid).toBeNumber();
      const repaired = await host.call("plugins.catalog", { scope: { kind: "user" } }, null) as {
        recovery: { kind: string };
      };
      expect(repaired.recovery.kind).toBe("normal");
    } finally {
      await host.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
