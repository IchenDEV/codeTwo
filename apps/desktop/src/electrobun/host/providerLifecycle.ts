import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HostToolEvidence } from "./providerTools";
import {
  PROVIDERS,
  providerById,
  providerSummaries,
  type ProviderDefinition,
} from "./acp";
import { augmentGuiPath, which } from "./system";

export type ProviderLifecycleAction = "install" | "upgrade";

export interface ProviderLifecycleStatus {
  enabled: boolean;
  installed: boolean;
  version: string | null;
  install_supported: boolean;
  upgrade_supported: boolean;
  launch_mode: "installed" | "on_demand" | "unavailable";
}

interface ProviderLifecycleState {
  schema_version: 1;
  enabled: Record<string, boolean>;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface ProviderLifecycleRuntime {
  which(command: string): string | null;
  version(command: string, args: string[]): Promise<string | null> | string | null;
  run(command: string[]): Promise<CommandResult>;
  refreshPath(): void;
}

const VERSION_PATTERN = /(?:^|\s)v?(\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?)(?:\s|$)/;

export function parseProviderVersion(output: string): string | null {
  return output.match(VERSION_PATTERN)?.[1] ?? null;
}

const defaultRuntime: ProviderLifecycleRuntime = {
  which,
  async version(command, args) {
    let timedOut = false;
    try {
      const child = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
      const stdoutPromise = new Response(child.stdout).text();
      const stderrPromise = new Response(child.stderr).text();
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 6_000);
      try {
        const [exitCode, stdout, stderr] = await Promise.all([
          child.exited,
          stdoutPromise,
          stderrPromise,
        ]);
        if (timedOut || exitCode !== 0) return null;
        return `${stdout}\n${stderr}`.trim();
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  },
  async run(command) {
    const child = Bun.spawn(command, {
      env: { ...Bun.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdoutPromise = new Response(child.stdout).text();
    const stderrPromise = new Response(child.stderr).text();
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      stdoutPromise,
      stderrPromise,
    ]);
    if (exitCode !== 0) {
      const detail = (stderr || stdout).trim().slice(-4_000);
      throw new Error(detail || `provider command exited with status ${exitCode}`);
    }
    return { stdout, stderr };
  },
  refreshPath: augmentGuiPath,
};

/**
 * Owns the user's Provider enablement plus fixed, reviewed install/upgrade recipes. No command,
 * package, URL, or flag crosses this boundary from renderer input.
 */
export class ProviderLifecycleManager {
  private readonly statePath: string;
  private state: ProviderLifecycleState;

  constructor(
    private readonly dataDir: string,
    private readonly runtime: ProviderLifecycleRuntime = defaultRuntime,
  ) {
    this.statePath = join(dataDir, "provider-settings.json");
    this.state = this.load();
  }

  enabled(providerId: string): boolean {
    this.provider(providerId);
    return this.state.enabled[providerId] !== false;
  }

  async status(providerId: string): Promise<ProviderLifecycleStatus> {
    const provider = this.provider(providerId);
    const installedPath = this.runtime.which(provider.lifecycle.executable);
    const requirementsReady = (provider.lifecycle.requirements ?? [])
      .every((command) => this.runtime.which(command) !== null);
    const onDemandReady = this.runtime.which(provider.command) !== null && requirementsReady;
    const installed = installedPath !== null;
    const versionOutput = installedPath
      ? await this.runtime.version(installedPath, provider.lifecycle.versionArgs)
      : null;
    return {
      enabled: this.state.enabled[providerId] !== false,
      installed,
      version: versionOutput ? parseProviderVersion(versionOutput) : null,
      install_supported: !installed
        && provider.lifecycle.install !== null
        && this.runtime.which(provider.lifecycle.install[0]) !== null,
      upgrade_supported: installed
        && provider.lifecycle.upgrade !== null
        && this.runtime.which(provider.lifecycle.upgrade[0]) !== null,
      launch_mode: installed && requirementsReady
        ? "installed"
        : onDemandReady
          ? "on_demand"
          : "unavailable",
    };
  }

  async list(hostTools: HostToolEvidence): Promise<unknown[]> {
    const summaries = providerSummaries(hostTools);
    return Promise.all(summaries.map(async (summary) => {
      const management = await this.status(summary.id);
      return {
        ...summary,
        enabled: management.enabled,
        available: management.enabled && management.launch_mode !== "unavailable",
        management,
      };
    }));
  }

  setEnabled(providerId: string, enabled: boolean): void {
    this.provider(providerId);
    this.state = {
      ...this.state,
      enabled: { ...this.state.enabled, [providerId]: enabled },
    };
    this.save();
  }

  async apply(providerId: string, action: ProviderLifecycleAction): Promise<CommandResult> {
    const provider = this.provider(providerId);
    const status = await this.status(providerId);
    if (action === "install" && status.installed) {
      throw new Error(`${provider.displayName} is already installed`);
    }
    if (action === "upgrade" && !status.installed) {
      throw new Error(`${provider.displayName} is not installed`);
    }
    const recipe = provider.lifecycle[action];
    if (!recipe) {
      const operation = action === "install" ? "automatic installation" : "automatic upgrades";
      throw new Error(`${provider.displayName} does not support ${operation}`);
    }
    const executable = this.runtime.which(recipe[0]);
    if (!executable) throw new Error(`${recipe[0]} is required to ${action} ${provider.displayName}`);
    const result = await this.runtime.run([executable, ...recipe.slice(1)]);
    this.runtime.refreshPath();
    return result;
  }

  private provider(providerId: string): ProviderDefinition {
    const provider = providerById(providerId);
    if (!provider) throw new Error(`unknown provider ${JSON.stringify(providerId)}`);
    return provider;
  }

  private load(): ProviderLifecycleState {
    try {
      const value = JSON.parse(readFileSync(this.statePath, "utf8")) as Partial<ProviderLifecycleState>;
      if (value.schema_version === 1 && value.enabled && typeof value.enabled === "object") {
        return {
          schema_version: 1,
          enabled: Object.fromEntries(
            Object.entries(value.enabled).filter(
              ([id, enabled]) => PROVIDERS.some((provider) => provider.id === id) && typeof enabled === "boolean",
            ),
          ) as Record<string, boolean>,
        };
      }
    } catch {
      // Missing or malformed settings use the safe shipped default: every known provider enabled.
    }
    return { schema_version: 1, enabled: {} };
  }

  private save(): void {
    mkdirSync(this.dataDir, { recursive: true });
    const temporary = `${this.statePath}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.statePath);
  }
}
