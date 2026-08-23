import type { Subprocess } from "bun";

import { which } from "./system";
import {
  projectProviderToolset,
  type AcpMcpServer,
  type HostToolEvidence,
} from "./providerTools";

export interface ProviderDefinition {
  id: string;
  displayName: string;
  command: string;
  args: string[];
  needsNode: boolean;
  models: { id: string; name: string; description: string | null }[];
}

export interface GoalCapability {
  controlMethod: string;
  actions: string[];
}

export interface ProviderInteractionCapabilities {
  steering: boolean;
  goal: GoalCapability | null;
}

const model = (id: string, name: string, description: string | null = null) => ({
  id,
  name,
  description,
});

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "claude_code",
    displayName: "Claude Code",
    command: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp"],
    needsNode: true,
    models: [
      model("default", "Default"),
      model("best", "Best available"),
      model("fable", "Claude Fable"),
      model("opus", "Claude Opus"),
      model("sonnet", "Claude Sonnet"),
      model("haiku", "Claude Haiku"),
    ],
  },
  {
    id: "codex",
    displayName: "OpenAI Codex",
    command: "npx",
    args: ["-y", "@agentclientprotocol/codex-acp@1.6.2"],
    needsNode: true,
    models: [
      model("gpt-5.6-sol", "GPT-5.6-Sol"),
      model("gpt-5.6-terra", "GPT-5.6-Terra"),
      model("gpt-5.6-luna", "GPT-5.6-Luna"),
      model("gpt-5.5", "GPT-5.5"),
      model("gpt-5.4", "GPT-5.4"),
    ],
  },
  {
    id: "grok",
    displayName: "Grok",
    command: "grok",
    args: ["agent", "stdio"],
    needsNode: false,
    models: [model("grok-4.6", "Grok 4.6")],
  },
  {
    id: "cursor",
    displayName: "Cursor",
    command: "cursor-agent",
    args: ["--acp"],
    needsNode: false,
    models: [model("auto", "Auto")],
  },
  {
    id: "opencode",
    displayName: "OpenCode",
    command: "opencode",
    args: ["acp"],
    needsNode: false,
    models: [],
  },
  {
    id: "opencode2",
    displayName: "OpenCode 2 (Beta)",
    command: "opencode2",
    args: ["acp"],
    needsNode: false,
    models: [],
  },
  {
    id: "pi",
    displayName: "Pi",
    command: "npx",
    args: ["-y", "pi-acp"],
    needsNode: true,
    models: [],
  },
  {
    id: "kimi",
    displayName: "Kimi",
    command: "kimi",
    args: ["acp"],
    needsNode: false,
    models: [
      model("kimi-code/k3", "Kimi K3"),
      model("kimi-code/kimi-for-coding", "Kimi for Coding"),
      model("kimi-code/kimi-for-coding-highspeed", "Kimi for Coding Highspeed"),
    ],
  },
  {
    id: "zcode",
    displayName: "ZCode (GLM)",
    command: "npx",
    args: ["-y", "glm-acp-agent"],
    needsNode: true,
    models: [model("glm-5.3", "GLM-5.3"), model("glm-5-turbo", "GLM-5 Turbo")],
  },
];

export function providerSummaries(hostTools: HostToolEvidence): unknown[] {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    display_name: provider.displayName,
    available: which(provider.command) !== null,
    needs_node: provider.needsNode,
    models: provider.models,
    capabilities: projectProviderToolset(hostTools, provider.id).capabilities,
  }));
}

export function providerById(id: string): ProviderDefinition | null {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}

interface RpcErrorShape {
  code?: number;
  message?: string;
  data?: unknown;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function validateMcpTransports(
  servers: AcpMcpServer[],
  initialized: Record<string, unknown>,
): void {
  const mcp = object(object(initialized.agentCapabilities).mcpCapabilities);
  for (const server of servers) {
    if (!("type" in server)) continue;
    const supported = server.type === "http" ? mcp.http === true : mcp.sse === true;
    if (!supported) {
      throw new Error(
        `MCP server ${JSON.stringify(server.name)} needs ${server.type.toUpperCase()} transport, but this provider did not advertise that ACP capability`,
      );
    }
  }
}

/** Optional interaction extensions are enabled only when the provider advertises them. */
export function reportedInteractionCapabilities(
  initialized: Record<string, unknown>,
): ProviderInteractionCapabilities {
  const meta = object(initialized._meta);
  const steering = object(meta.steering).supported === true;
  const goal = object(meta.goal);
  const controlMethod = typeof goal.controlMethod === "string" ? goal.controlMethod : "";
  const actions = Array.isArray(goal.actions)
    ? goal.actions.filter((action): action is string => typeof action === "string")
    : [];
  return {
    steering,
    goal: controlMethod && actions.length > 0 ? { controlMethod, actions } : null,
  };
}

export interface AcpCallbacks {
  notification(method: string, params: unknown): void | Promise<void>;
  request(method: string, params: unknown): Promise<unknown>;
  closed(error: Error): void;
}

export function sessionRequestParams(
  cwd: string,
  mcpServers: AcpMcpServer[],
  sessionId?: string,
): { cwd: string; mcpServers: AcpMcpServer[]; sessionId?: string } {
  return { ...(sessionId ? { sessionId } : {}), cwd, mcpServers };
}

export class AcpPeer {
  private readonly child: Subprocess<"pipe", "pipe", "inherit">;
  private readonly pending = new Map<string, PendingRequest>();
  private nextId = 1;
  private closed = false;

  constructor(
    provider: ProviderDefinition,
    cwd: string,
    private readonly callbacks: AcpCallbacks,
    private readonly mcpServers: AcpMcpServer[],
  ) {
    const executable = which(provider.command);
    if (!executable) throw new Error(`${provider.displayName} is not installed (${provider.command})`);
    this.child = Bun.spawn([executable, ...provider.args], {
      cwd,
      env: { ...Bun.env },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
    });
    void this.read(this.child.stdout);
    void this.child.exited.then((code) => this.closeWithError(new Error(`${provider.displayName} exited with status ${code}`)));
  }

  async initialize(): Promise<Record<string, unknown>> {
    const initialized = await this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { elicitation: { form: {} } },
    }) as Record<string, unknown>;
    try {
      validateMcpTransports(this.mcpServers, initialized);
    } catch (error) {
      this.shutdown();
      throw error;
    }
    return initialized;
  }

  async newSession(cwd: string): Promise<Record<string, unknown>> {
    return this.request("session/new", sessionRequestParams(cwd, this.mcpServers)) as Promise<Record<string, unknown>>;
  }

  async loadSession(sessionId: string, cwd: string): Promise<Record<string, unknown>> {
    return this.request(
      "session/load",
      sessionRequestParams(cwd, this.mcpServers, sessionId),
    ) as Promise<Record<string, unknown>>;
  }

  async prompt(sessionId: string, prompt: unknown[]): Promise<Record<string, unknown>> {
    return this.request("session/prompt", { sessionId, prompt }, 0) as Promise<Record<string, unknown>>;
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    await this.request("session/set_model", { sessionId, modelId });
  }

  async setConfigOption(sessionId: string, configId: string, value: string): Promise<Record<string, unknown>> {
    return this.request("session/set_config_option", { sessionId, configId, value }) as Promise<Record<string, unknown>>;
  }

  async steer(sessionId: string, prompt: unknown[]): Promise<Record<string, unknown>> {
    return this.request("_session/steering", { sessionId, prompt }) as Promise<Record<string, unknown>>;
  }

  async controlGoal(
    method: string,
    sessionId: string,
    action: string,
    objective?: string,
  ): Promise<Record<string, unknown>> {
    return this.request(method, {
      sessionId,
      action,
      ...(objective ? { objective } : {}),
    }) as Promise<Record<string, unknown>>;
  }

  cancel(sessionId: string): void {
    this.notify("session/cancel", { sessionId });
  }

  shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    this.child.kill();
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(new Error("ACP process stopped"));
    }
    this.pending.clear();
  }

  private request(method: string, params: unknown, timeoutMs = 60_000): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("ACP connection is closed"));
    const id = String(this.nextId++);
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`${method} timed out`));
          }, timeoutMs)
        : null;
      this.pending.set(id, { resolve, reject, timer });
    });
    this.write({ jsonrpc: "2.0", id: Number(id), method, params });
    return promise;
  }

  private notify(method: string, params: unknown): void {
    if (!this.closed) this.write({ jsonrpc: "2.0", method, params });
  }

  private write(message: unknown): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
    this.child.stdin.flush();
  }

  private async read(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) await this.handleLine(line);
        newline = buffer.indexOf("\n");
      }
    }
    const tail = (buffer + decoder.decode()).trim();
    if (tail) await this.handleLine(tail);
  }

  private async handleLine(line: string): Promise<void> {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      console.warn("ACP provider emitted a non-JSON line", line.slice(0, 500));
      return;
    }
    const method = typeof message.method === "string" ? message.method : null;
    if (!method) {
      const id = String(message.id ?? "");
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      if (pending.timer) clearTimeout(pending.timer);
      if (message.error) {
        const error = message.error as RpcErrorShape;
        pending.reject(new Error(error.message || `ACP error ${error.code ?? -1}`));
      } else {
        pending.resolve(message.result ?? null);
      }
      return;
    }
    if (message.id == null) {
      await this.callbacks.notification(method, message.params ?? null);
      return;
    }
    try {
      const result = await this.callbacks.request(method, message.params ?? null);
      this.write({ jsonrpc: "2.0", id: message.id, result });
    } catch (cause) {
      this.write({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: cause instanceof Error ? cause.message : String(cause),
        },
      });
    }
  }

  private closeWithError(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.callbacks.closed(error);
  }
}

export function reportedModels(response: Record<string, unknown>, fallback: ProviderDefinition): unknown[] {
  const models = response.models as Record<string, unknown> | undefined;
  const available = models?.availableModels;
  if (!Array.isArray(available) || available.length === 0) return fallback.models;
  return available.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const id = typeof item.modelId === "string" ? item.modelId : "";
    if (!id) return [];
    return [{
      id,
      name: typeof item.name === "string" ? item.name : id,
      description: typeof item.description === "string" ? item.description : null,
    }];
  });
}

export function reportedConfigOptions(response: Record<string, unknown>): unknown[] {
  const options = response.configOptions;
  if (!Array.isArray(options)) return [];
  return options.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const option = value as Record<string, unknown>;
    if (typeof option.id !== "string") return [];
    const values = Array.isArray(option.options) ? option.options : [];
    return [{
      id: option.id,
      name: typeof option.name === "string" ? option.name : option.id,
      category: typeof option.category === "string" ? option.category : null,
      current: typeof option.currentValue === "string" ? option.currentValue : "",
      choices: values.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const choice = entry as Record<string, unknown>;
        const id = typeof choice.value === "string" ? choice.value : "";
        return id
          ? [{
              id,
              name: typeof choice.name === "string" ? choice.name : id,
              description: typeof choice.description === "string" ? choice.description : null,
            }]
          : [];
      }),
    }];
  });
}
