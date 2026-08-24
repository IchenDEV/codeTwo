import { blake3 } from "@noble/hashes/blake3.js";
import type { Subprocess } from "bun";
import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

import {
  BUILTIN_PLUGIN_BY_ID,
  BUILTIN_PLUGINS,
  builtinPluginScopeId,
  type BuiltinPluginDefinition,
} from "./builtinPlugins";
import {
  C2_PLUGIN_STANDARD_VERSION,
  assertUniquePluginContributionIds,
  parsePluginContributionArray,
  parsePluginLanguageServerContribution,
  parsePluginRuntimeContribution,
  parsePluginUiContribution,
  parsePluginManifest,
  pluginUiComponentId,
  type PluginLanguageServerContribution,
  type PluginRuntimeContribution,
  type PluginUiContribution,
} from "../../pluginModel";
import { runProcess, which } from "./system";

type JsonObject = Record<string, unknown>;
type PluginOverride = "inherit" | "enabled" | "disabled";
type PluginStatus = "pending" | "loading" | "active" | "failed" | "disposed";

type RuntimeSpec = PluginRuntimeContribution;
type UiContribution = PluginUiContribution;
type LanguageServerContribution = PluginLanguageServerContribution;

export interface PluginLanguageServerLaunch {
  id: string;
  pluginId: string;
  command: string[];
  env: Record<string, string>;
}

interface InstalledPlugin extends JsonObject {
  schema_version: number;
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  source: string;
  repository: string;
  standard_version: string;
  enabled: boolean;
  trusted: boolean;
  scope: "user" | "project" | "local" | "managed";
  counts: JsonObject;
  components: JsonObject[];
  scaffolds: JsonObject[];
  extension_components: JsonObject[];
  ui_contributions: UiContribution[];
  lsp_servers: LanguageServerContribution[];
  diagnostics: JsonObject[];
  runtime: RuntimeSpec | null;
}

interface PluginPolicy {
  state?: PluginOverride;
  config?: unknown;
  components?: Record<string, PluginOverride>;
}

interface PluginConfigDocument {
  schema_version: 1;
  revision: number;
  user: Record<string, PluginPolicy>;
  projects: Record<string, Record<string, PluginPolicy>>;
}

type PluginScope =
  | { kind: "user" }
  | { kind: "project"; project_path: string };

interface CommandContribution {
  name: string;
  description: string | null;
  schema: unknown | null;
}

interface InitializeResult {
  name: string;
  version: string;
  protocolVersion: string;
  description: string | null;
  commands: CommandContribution[];
  events: string[];
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

interface PluginPeerCallbacks {
  call(name: string, args: unknown): Promise<unknown>;
  emit(name: string, payload: unknown): void;
  closed(error: Error): void;
}

interface RuntimeInstance {
  key: string;
  scopeId: number;
  pluginId: string;
  realm: PluginScope;
  status: PluginStatus;
  error: string | null;
  peer: PluginPeer | null;
  commands: CommandContribution[];
  events: Set<string>;
  activeCalls: number;
}

interface PendingPlan {
  id: string;
  graph_revision: number;
  config_revision: number;
  request: {
    plugin: string;
    scope: PluginScope;
    state?: PluginOverride;
    config?: unknown;
    component?: string;
  };
  affected: string[];
  active_resources: Array<{ plugin: string; kind: string; id: string; label: string }>;
  requires_confirmation: boolean;
}

type ManagedPlugin =
  | { kind: "builtin"; definition: BuiltinPluginDefinition }
  | { kind: "bundle"; plugin: InstalledPlugin };

interface PluginRuntimeManagerOptions {
  hostCommands(): Array<{ name: string; plugin: string }>;
  callHost(name: string, args: unknown, projectPath: string | null): Promise<unknown>;
  reconcileBuiltin(plugin: string, enabled: boolean, projectPath: string | null): void | Promise<void>;
  onChanged(): void;
}

const PROTOCOL_VERSION = "1.0.0";
const CONFIG_FILE = "plugin-config.json";
const LAST_GOOD_FILE = "plugin-config.last-good.json";
const RECORD_FILE = "installed-plugin.json";
const MAX_FILES = 5_000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;
const MAX_DEPTH = 12;
const MAX_PROTOCOL_LINE_BYTES = 1024 * 1024;
const HANDSHAKE_TIMEOUT_MS = 10_000;
const PROCESS_EXIT_TIMEOUT_MS = 2_000;
function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function safeId(value: string): boolean {
  return value.length > 0 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

function commandName(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+$/.test(value);
}

function pathInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function normalizeProjectPath(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

function projectKey(path: string): string {
  return Buffer.from(blake3(new TextEncoder().encode(normalizeProjectPath(path)))).toString("hex");
}

function parseScope(value: unknown): PluginScope {
  const scope = asObject(value);
  if (scope.kind === "project") {
    if (typeof scope.project_path !== "string" || scope.project_path.trim().length === 0) {
      throw new Error("project_path is required for project plugin scope");
    }
    return { kind: "project", project_path: normalizeProjectPath(scope.project_path) };
  }
  return { kind: "user" };
}

function realmKey(scope: PluginScope): string {
  return scope.kind === "user" ? "user" : `project:${scope.project_path}`;
}

function instanceKey(pluginId: string, scope: PluginScope): string {
  return `${pluginId}\u0000${realmKey(scope)}`;
}

function resolveOverride(value: PluginOverride | undefined, inherited: boolean): boolean {
  if (value === "enabled") return true;
  if (value === "disabled") return false;
  return inherited;
}

function installedPlugin(value: unknown, directoryName: string): InstalledPlugin | null {
  const raw = asObject(value);
  const fields = [
    "schema_version", "id", "name", "version", "description", "author", "source", "repository",
    "standard_version", "enabled", "trusted", "scope", "counts", "components", "scaffolds",
    "extension_components", "ui_contributions", "lsp_servers", "diagnostics", "runtime",
  ];
  if (Object.keys(raw).some((key) => !fields.includes(key))) return null;
  if (raw.schema_version !== 3 || typeof raw.id !== "string" || raw.id !== directoryName || !safeId(raw.id)) {
    return null;
  }
  if (raw.standard_version !== C2_PLUGIN_STANDARD_VERSION) return null;
  if (
    typeof raw.name !== "string" || raw.name.trim().length === 0 ||
    typeof raw.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(raw.version) ||
    typeof raw.description !== "string" || typeof raw.author !== "string" ||
    typeof raw.source !== "string" || typeof raw.repository !== "string" ||
    typeof raw.enabled !== "boolean" || typeof raw.trusted !== "boolean" ||
    !["user", "project", "local", "managed"].includes(String(raw.scope)) ||
    !raw.counts || typeof raw.counts !== "object" || Array.isArray(raw.counts) ||
    !Array.isArray(raw.components) || !Array.isArray(raw.scaffolds) ||
    !Array.isArray(raw.extension_components) || !Array.isArray(raw.ui_contributions) ||
    !Array.isArray(raw.lsp_servers) || !Array.isArray(raw.diagnostics)
  ) return null;
  const runtime = raw.runtime == null ? null : parsePluginRuntimeContribution(raw.runtime);
  if (raw.runtime != null && !runtime) return null;
  const uiContributions = parsePluginContributionArray(
    raw.ui_contributions,
    parsePluginUiContribution,
    "ui_contributions",
    true,
  );
  const lspServers = parsePluginContributionArray(
    raw.lsp_servers,
    parsePluginLanguageServerContribution,
    "lsp_servers",
    true,
  );
  assertUniquePluginContributionIds(uiContributions, "ui_contributions");
  assertUniquePluginContributionIds(lspServers, "lsp_servers");
  return {
    schema_version: 3,
    id: raw.id,
    name: raw.name as string,
    version: raw.version as string,
    description: raw.description as string,
    author: raw.author as string,
    source: raw.source as string,
    repository: raw.repository as string,
    standard_version: C2_PLUGIN_STANDARD_VERSION,
    enabled: raw.enabled as boolean,
    trusted: raw.trusted as boolean,
    scope: raw.scope as InstalledPlugin["scope"],
    counts: asObject(raw.counts),
    components: raw.components.map(asObject),
    scaffolds: raw.scaffolds.map(asObject),
    extension_components: raw.extension_components.map(asObject),
    ui_contributions: uiContributions,
    lsp_servers: lspServers,
    diagnostics: raw.diagnostics.map(asObject),
    runtime,
  };
}

function emptyConfig(): PluginConfigDocument {
  return { schema_version: 1, revision: 0, user: {}, projects: {} };
}

function pluginPolicy(value: unknown): PluginPolicy {
  const raw = asObject(value);
  const state = ["inherit", "enabled", "disabled"].includes(String(raw.state))
    ? raw.state as PluginOverride
    : undefined;
  const components = Object.fromEntries(
    Object.entries(asObject(raw.components)).filter((entry): entry is [string, PluginOverride] =>
      ["inherit", "enabled", "disabled"].includes(String(entry[1]))),
  );
  return {
    ...(state && state !== "inherit" ? { state } : {}),
    ...(Object.prototype.hasOwnProperty.call(raw, "config") ? { config: raw.config } : {}),
    ...(Object.keys(components).length > 0 ? { components } : {}),
  };
}

function pluginConfig(value: unknown): PluginConfigDocument {
  const raw = asObject(value);
  if (raw.schema_version !== 1) {
    throw new Error(`plugin configuration schema ${String(raw.schema_version)} is not supported`);
  }
  const user = Object.fromEntries(Object.entries(asObject(raw.user)).map(([id, policy]) => [id, pluginPolicy(policy)]));
  const projects = Object.fromEntries(Object.entries(asObject(raw.projects)).map(([path, policies]) => [
    normalizeProjectPath(path),
    Object.fromEntries(Object.entries(asObject(policies)).map(([id, policy]) => [id, pluginPolicy(policy)])),
  ]));
  return {
    schema_version: 1,
    revision: typeof raw.revision === "number" && Number.isSafeInteger(raw.revision) && raw.revision >= 0
      ? raw.revision
      : 0,
    user,
    projects,
  };
}

function cloneConfig(value: PluginConfigDocument): PluginConfigDocument {
  return structuredClone(value);
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function supportedProtocol(version: string): boolean {
  return version.trim().length > 0 && version.split(".")[0] === PROTOCOL_VERSION.split(".")[0];
}

function commandContribution(value: unknown): CommandContribution | null {
  const raw = asObject(value);
  if (!commandName(raw.name)) return null;
  return {
    name: raw.name,
    description: typeof raw.description === "string" ? raw.description : null,
    schema: raw.schema ?? null,
  };
}

function initializeResult(value: unknown): InitializeResult {
  const raw = asObject(value);
  const protocolVersion = typeof raw.protocolVersion === "string" ? raw.protocolVersion : "";
  if (!supportedProtocol(protocolVersion)) {
    throw new Error(`speaks plugin protocol ${protocolVersion} — this host speaks ${PROTOCOL_VERSION}`);
  }
  const commands = Array.isArray(raw.commands)
    ? raw.commands.map(commandContribution).filter((item): item is CommandContribution => item !== null)
    : [];
  if (commands.length !== new Set(commands.map((command) => command.name)).size) {
    throw new Error("plugin declared duplicate command names");
  }
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    version: typeof raw.version === "string" ? raw.version : "",
    protocolVersion,
    description: typeof raw.description === "string" ? raw.description : null,
    commands,
    events: [...new Set(stringArray(raw.events))],
  };
}

function resolveExecutable(bundleDir: string, command: string): string {
  if (isAbsolute(command)) {
    accessSync(command, constants.X_OK);
    return command;
  }
  const hasSeparator = command.includes("/") || command.includes("\\");
  if (hasSeparator) {
    const candidate = resolve(bundleDir, command);
    if (!pathInside(bundleDir, candidate)) throw new Error("runtime command escapes its bundle");
    accessSync(candidate, constants.X_OK);
    return candidate;
  }
  const bundled = join(bundleDir, command);
  try {
    accessSync(bundled, constants.X_OK);
    return bundled;
  } catch {
    const executable = which(command);
    if (!executable) throw new Error(`couldn't start \`${command}\`: executable not found`);
    return executable;
  }
}

class PluginPeer {
  private readonly child: Subprocess<"pipe", "pipe", "pipe">;
  private readonly pending = new Map<string, PendingRequest>();
  private nextId = 1;
  private closed = false;
  private stopping = false;

  constructor(command: string[], cwd: string, env: Record<string, string>, private readonly callbacks: PluginPeerCallbacks) {
    this.child = Bun.spawn(command, {
      cwd,
      env: { ...Bun.env, ...env },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      detached: process.platform !== "win32",
    });
    void this.readProtocol(this.child.stdout);
    void this.readDiagnostics(this.child.stderr);
    void this.child.exited.then((code) => {
      if (!this.stopping) this.closeWithError(new Error(`plugin process exited with status ${code}`));
      else this.closePending(new Error("plugin process stopped"));
    });
  }

  initialize(params: unknown): Promise<InitializeResult> {
    return this.request("initialize", params, HANDSHAKE_TIMEOUT_MS).then(initializeResult);
  }

  invoke(name: string, args: unknown): Promise<unknown> {
    return this.request("command/invoke", { name, args }, 0);
  }

  notify(name: string, payload: unknown): void {
    if (!this.closed) this.write({ jsonrpc: "2.0", method: "event/emit", params: { name, payload } });
  }

  async shutdown(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.closed = true;
    this.closePending(new Error("plugin process stopped"));
    try {
      this.child.stdin.end();
    } catch {
      // The process may already have closed its pipe.
    }
    if (process.platform !== "win32" && this.child.pid) {
      try {
        process.kill(-this.child.pid, "SIGKILL");
      } catch {
        // A process that exited between the check and signal is already disposed.
      }
    }
    try {
      this.child.kill();
    } catch {
      // Already exited.
    }
    await Promise.race([
      this.child.exited.then(() => undefined),
      new Promise<void>((resolvePromise) => setTimeout(resolvePromise, PROCESS_EXIT_TIMEOUT_MS)),
    ]);
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("plugin connection is closed"));
    const id = String(this.nextId++);
    const promise = new Promise<unknown>((resolvePromise, reject) => {
      const timer = timeoutMs > 0
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`${method} timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;
      this.pending.set(id, { resolve: resolvePromise, reject, timer });
    });
    this.write({ jsonrpc: "2.0", id: Number(id), method, params });
    return promise;
  }

  private write(message: unknown): void {
    if (this.closed) return;
    try {
      this.child.stdin.write(`${JSON.stringify(message)}\n`);
      this.child.stdin.flush();
    } catch (cause) {
      this.closeWithError(new Error(`could not write to plugin process: ${errorMessage(cause)}`));
    }
  }

  private async readProtocol(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > MAX_PROTOCOL_LINE_BYTES && !buffer.includes("\n")) {
        this.closeWithError(new Error("plugin protocol line exceeds 1 MiB"));
        await this.shutdown();
        return;
      }
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) this.handleLine(line);
        newline = buffer.indexOf("\n");
      }
    }
    const tail = (buffer + decoder.decode()).trim();
    if (tail) this.handleLine(tail);
  }

  private async readDiagnostics(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) console.warn("plugin stderr", line.slice(0, 2_000));
    }
    const tail = (buffered + decoder.decode()).trim();
    if (tail) console.warn("plugin stderr", tail.slice(0, 2_000));
  }

  private handleLine(line: string): void {
    if (line.length > MAX_PROTOCOL_LINE_BYTES) {
      this.closeWithError(new Error("plugin protocol line exceeds 1 MiB"));
      void this.shutdown();
      return;
    }
    let message: JsonObject;
    try {
      message = JSON.parse(line) as JsonObject;
    } catch {
      console.warn("plugin emitted a non-JSON stdout line", line.slice(0, 500));
      return;
    }
    const method = typeof message.method === "string" ? message.method : null;
    if (!method) {
      const id = String(message.id ?? "");
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      if (pending.timer) clearTimeout(pending.timer);
      const remote = asObject(message.error);
      if (Object.keys(remote).length > 0) {
        pending.reject(new Error(typeof remote.message === "string" ? remote.message : "plugin request failed"));
      } else {
        pending.resolve(message.result ?? null);
      }
      return;
    }
    if (message.id == null) {
      const params = asObject(message.params);
      if (method === "event/emit" && typeof params.name === "string") {
        this.callbacks.emit(params.name, params.payload ?? null);
      } else if (method === "log" && typeof params.message === "string") {
        const level = typeof params.level === "string" ? params.level : "info";
        const log = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
        log(`plugin: ${params.message}`);
      }
      return;
    }
    void this.handleRequest(message.id, method, message.params ?? null);
  }

  private async handleRequest(id: unknown, method: string, paramsValue: unknown): Promise<void> {
    try {
      if (method !== "command/call") throw new Error(`the host has no method \`${method}\``);
      const params = asObject(paramsValue);
      if (typeof params.name !== "string") throw new Error("command/call requires a command name");
      const result = await this.callbacks.call(params.name, params.args ?? null);
      this.write({ jsonrpc: "2.0", id, result });
    } catch (cause) {
      this.write({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: errorMessage(cause) },
      });
    }
  }

  private closeWithError(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.closePending(error);
    this.callbacks.closed(error);
  }

  private closePending(error: Error): void {
    for (const pending of this.pending.values()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function publicPlugin(plugin: InstalledPlugin): JsonObject {
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    author: plugin.author,
    source: plugin.source,
    repository: plugin.repository,
    standard_version: plugin.standard_version,
    enabled: plugin.enabled,
    trusted: plugin.trusted,
    scope: plugin.scope,
    counts: plugin.counts,
    scaffolds: plugin.scaffolds,
    extension_components: plugin.extension_components,
    ui_contributions: plugin.ui_contributions,
    lsp_servers: plugin.lsp_servers,
    diagnostics: plugin.diagnostics,
  };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function slug(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface GitHubSpec {
  owner: string;
  repo: string;
  reference: string | null;
  subpath: string | null;
}

function githubSpec(value: string): GitHubSpec {
  const trimmed = value.trim().replace(/\.git$/, "");
  const shorthand = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2], reference: null, subpath: null };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Use owner/repo or an https://github.com/... URL");
  }
  if (url.protocol !== "https:" || url.hostname.toLocaleLowerCase() !== "github.com") {
    throw new Error("Only HTTPS GitHub repositories are supported");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("GitHub repository URL is incomplete");
  const [owner, repo, marker, reference, ...pathParts] = parts;
  if (marker && marker !== "tree") throw new Error("Use a repository URL or a GitHub /tree/ URL");
  if (marker === "tree" && !reference) throw new Error("GitHub /tree/ URL is missing a reference");
  return {
    owner,
    repo: repo.replace(/\.git$/, ""),
    reference: marker === "tree" ? reference : null,
    subpath: marker === "tree" && pathParts.length > 0 ? pathParts.join("/") : null,
  };
}

function c2PluginManifest(root: string, source: string, identity: string): InstalledPlugin {
  const manifestPath = join(root, "plugin.json");
  const canonicalRoot = realpathSync(root);
  const canonicalManifest = realpathSync(manifestPath);
  if (
    lstatSync(manifestPath).isSymbolicLink() ||
    !pathInside(canonicalRoot, canonicalManifest) ||
    !statSync(canonicalManifest).isFile()
  ) throw new Error("plugin.json must be a regular file inside the bundle root");
  const manifest = parsePluginManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
  const { runtime, ui: uiContributions, languageServers: lspServers } = manifest;
  const validateBundledCommand = (command: string, label: string): void => {
    if (!command.includes("/") && !command.includes("\\")) return;
    const commandPath = resolve(root, command);
    let canonicalCommand: string;
    try {
      canonicalCommand = realpathSync(commandPath);
    } catch {
      throw new Error(`${label} command does not exist in the bundle: ${command}`);
    }
    if (!pathInside(canonicalRoot, canonicalCommand) || !statSync(canonicalCommand).isFile()) {
      throw new Error(`${label} command escapes the bundle: ${command}`);
    }
  };
  if (runtime) validateBundledCommand(runtime.command, "runtime");
  for (const server of lspServers) validateBundledCommand(server.command, `language server ${server.id}`);
  if (!runtime && lspServers.length === 0) {
    throw new Error("This Pure Bun installer requires a process runtime or a supported languageServers contribution");
  }
  const normalized = slug(manifest.name) || "plugin";
  const id = `${normalized.slice(0, 52)}-${fnv1a(identity)}`;
  return {
    schema_version: 3,
    id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    source,
    repository: manifest.repository || source,
    standard_version: manifest.standardVersion,
    enabled: true,
    trusted: false,
    scope: "user",
    counts: {
      skills: 0,
      subagents: 0,
      mcp_servers: 0,
      scaffolds: 0,
      commands: 0,
      hooks: 0,
      lsp_servers: 0,
      monitors: 0,
      apps: 0,
      ui: uiContributions.length,
      scenes: 0,
      pipelines: 0,
      runtime: runtime ? 1 : 0,
    },
    components: [],
    scaffolds: [],
    extension_components: [
      ...uiContributions.map((contribution) => ({
        kind: "ui",
        name: contribution.label,
        path: contribution.slot,
        status: "requires_trust",
      })),
      ...lspServers.map((server) => ({
        kind: "lsp",
        name: server.id,
        path: server.languages.join(", "),
        status: "requires_trust",
      })),
    ],
    ui_contributions: uiContributions,
    lsp_servers: lspServers,
    diagnostics: [{
      level: "warning",
      code: runtime ? "runtime.requires_trust" : "lsp.requires_trust",
      message: runtime
        ? "this plugin ships executable contributions. They run only after you mark the plugin trusted."
        : "this plugin ships a language server. It runs only after you mark the plugin trusted.",
    }],
    runtime,
  };
}

interface BundleFile {
  source: string;
  relative: string;
  mode: number;
}

function collectBundleFiles(root: string): BundleFile[] {
  const canonical = realpathSync(root);
  const files: BundleFile[] = [];
  let totalBytes = 0;
  const visit = (directory: string, depth: number): void => {
    if (depth > MAX_DEPTH) throw new Error(`Plugin directory nesting exceeds ${MAX_DEPTH}`);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const path = join(directory, entry.name);
      const metadata = lstatSync(path);
      if (metadata.isSymbolicLink()) continue;
      if (metadata.isDirectory()) {
        visit(path, depth + 1);
        continue;
      }
      if (!metadata.isFile()) continue;
      if (metadata.size > MAX_FILE_BYTES) throw new Error(`Plugin file is larger than 4 MiB: ${relative(canonical, path)}`);
      totalBytes += metadata.size;
      if (totalBytes > MAX_BUNDLE_BYTES) throw new Error("Plugin bundle exceeds 20 MiB");
      const rel = relative(canonical, path);
      if (!pathInside(canonical, path) || rel === "" || isAbsolute(rel)) throw new Error("Plugin file escapes its bundle");
      files.push({ source: path, relative: rel, mode: metadata.mode & 0o777 });
      if (files.length > MAX_FILES) throw new Error(`Plugin contains more than ${MAX_FILES} files`);
    }
  };
  visit(canonical, 0);
  return files;
}

export class PluginRuntimeManager {
  private readonly pluginsDir: string;
  private readonly configPath: string;
  private readonly lastGoodPath: string;
  private inventory = new Map<string, InstalledPlugin>();
  private fingerprints = new Map<string, string>();
  private readonly instances = new Map<string, RuntimeInstance>();
  private readonly projectRealms = new Set<string>();
  private readonly plans = new Map<string, PendingPlan>();
  private config = emptyConfig();
  private recovery: JsonObject = { kind: "normal" };
  private graphRevision = 1;
  private nextScopeId = BUILTIN_PLUGINS.length + 1;
  private initialized: Promise<void> | null = null;
  private configLoaded = false;
  private mutation: Promise<void> = Promise.resolve();
  private shuttingDown = false;

  constructor(dataDir: string, private readonly options: PluginRuntimeManagerOptions) {
    this.pluginsDir = join(dataDir, "plugins");
    this.configPath = join(dataDir, CONFIG_FILE);
    this.lastGoodPath = join(dataDir, LAST_GOOD_FILE);
  }

  start(): void {
    if (this.initialized) return;
    if (!this.configLoaded) {
      this.loadConfig();
      this.configLoaded = true;
    }
    this.initialized = this.enqueue(() => this.refreshInventoryLocked());
  }

  async ready(): Promise<void> {
    this.start();
    await this.initialized;
  }

  commandNames(): string[] {
    return [...new Set([...this.instances.values()]
      .filter((instance) => instance.status === "active")
      .flatMap((instance) => instance.commands.map((command) => command.name)))].sort();
  }

  hostCommandNames(projectPath: string | null = null): string[] {
    const scope: PluginScope = projectPath
      ? { kind: "project", project_path: normalizeProjectPath(projectPath) }
      : { kind: "user" };
    return this.options.hostCommands()
      .filter((command) => this.builtinRunning(scope, this.requireBuiltin(command.plugin)))
      .map((command) => command.name)
      .sort();
  }

  hostCommandDescriptors(projectPath: string | null = null): Array<{
    name: string;
    plugin: string;
    scope: number;
    description: string | null;
  }> {
    const enabled = new Set(this.hostCommandNames(projectPath));
    return this.options.hostCommands()
      .filter((command) => enabled.has(command.name))
      .map((command) => ({
        name: command.name,
        plugin: command.plugin,
        scope: builtinPluginScopeId(command.plugin),
        description: null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  commandDescriptors(): Array<{ name: string; plugin: string; scope: number; description: string | null }> {
    return [...this.instances.values()]
      .filter((instance) => instance.status === "active")
      .flatMap((instance) => instance.commands.map((command) => ({
        name: command.name,
        plugin: `bundle:${instance.pluginId}`,
        scope: instance.scopeId,
        description: command.description,
      })))
      .sort((left, right) => left.name.localeCompare(right.name) || left.scope - right.scope);
  }

  scopes(): JsonObject[] {
    return [...this.instances.values()].map((instance) => {
      const plugin = this.inventory.get(instance.pluginId);
      const runtime = plugin?.runtime;
      return {
        id: instance.scopeId,
        parent: builtinPluginScopeId("kernel"),
        plugin: `bundle:${instance.pluginId}`,
        status: instance.status,
        error: instance.error,
        command_realm: instance.realm.kind === "user"
          ? { kind: "global" }
          : { kind: "project", project_path: instance.realm.project_path },
        inject: { required: runtime?.inject ?? [], optional: runtime?.optionalInject ?? [] },
        missing: runtime?.inject.filter((name) => !this.providedServices(instance.realm).has(name)) ?? [],
        services: [],
        commands: instance.commands.map((command) => command.name),
        config: this.policyFor(instance.realm, `bundle:${instance.pluginId}`).config ?? null,
      };
    });
  }

  builtinScopes(projectPath: string | null = null): JsonObject[] {
    const scope: PluginScope = projectPath
      ? { kind: "project", project_path: normalizeProjectPath(projectPath) }
      : { kind: "user" };
    return BUILTIN_PLUGINS.map((definition) => {
      const policyScope = this.builtinPolicyScope(scope, definition);
      const enabled = this.builtinConfiguredEnabled(policyScope, definition);
      const missing = this.builtinMissing(policyScope, definition);
      const commands = this.options.hostCommands()
        .filter((command) => command.plugin === definition.id)
        .map((command) => command.name)
        .sort();
      return {
        id: builtinPluginScopeId(definition.id),
        parent: definition.id === "core" ? null : builtinPluginScopeId("core"),
        plugin: definition.id,
        status: !enabled ? "disposed" : missing.length > 0 ? "pending" : "active",
        error: null,
        command_realm: policyScope.kind === "user"
          ? { kind: "global" }
          : { kind: "project", project_path: policyScope.project_path },
        inject: { required: definition.dependencies, optional: [] },
        missing,
        services: missing.length === 0 && enabled ? definition.services : [],
        commands: missing.length === 0 && enabled ? commands : [],
        config: this.policyFor(policyScope, definition.id).config ?? null,
      };
    });
  }

  services(projectPath: string | null = null): string[] {
    const scope: PluginScope = projectPath
      ? { kind: "project", project_path: normalizeProjectPath(projectPath) }
      : { kind: "user" };
    return [...this.providedServices(scope)].sort();
  }

  assertBuiltinEnabled(pluginId: string, projectPath: string | null): void {
    const definition = this.requireBuiltin(pluginId);
    const requestedScope: PluginScope = projectPath
      ? { kind: "project", project_path: normalizeProjectPath(projectPath) }
      : { kind: "user" };
    const scope = this.builtinPolicyScope(requestedScope, definition);
    if (!this.builtinConfiguredEnabled(scope, definition)) {
      const realm = scope.kind === "project" ? ` for project ${scope.project_path}` : "";
      throw new Error(`plugin \`${pluginId}\` is disabled${realm}`);
    }
    const missing = this.builtinMissing(scope, definition);
    if (missing.length > 0) {
      throw new Error(`plugin \`${pluginId}\` is waiting for ${missing.join(", ")}`);
    }
  }

  async call(name: string, args: unknown, projectPath: string | null): Promise<unknown> {
    await this.ready();
    const normalizedProject = projectPath ? normalizeProjectPath(projectPath) : null;
    if (normalizedProject) {
      await this.enqueue(() => this.reconcileProjectLocked(normalizedProject));
      const projectOwner = this.findCommand(name, { kind: "project", project_path: normalizedProject });
      if (projectOwner) return this.invoke(projectOwner, name, args);
      const globalOwner = this.findCommand(name, { kind: "user" });
      if (globalOwner) {
        const plugin = this.inventory.get(globalOwner.pluginId);
        if (plugin?.runtime?.scopeSupport.includes("project")) {
          if (!this.effectiveEnabled({ kind: "project", project_path: normalizedProject }, plugin)) {
            throw new Error(`plugin command \`${name}\` is disabled for project ${normalizedProject}`);
          }
          const failed = this.instances.get(instanceKey(plugin.id, { kind: "project", project_path: normalizedProject }));
          if (failed?.error) throw new Error(`${name}: ${failed.error}`);
        }
        return this.invoke(globalOwner, name, args);
      }
    } else {
      const owner = this.findCommand(name, { kind: "user" });
      if (owner) return this.invoke(owner, name, args);
    }
    throw new Error(`Pure Bun host does not implement command \`${name}\``);
  }

  publish(name: string, payload: unknown): void {
    for (const instance of this.instances.values()) {
      if (instance.status === "active" && instance.events.has(name)) instance.peer?.notify(name, payload);
    }
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    await this.ready().catch(() => undefined);
    await this.enqueue(async () => {
      const instances = [...this.instances.values()];
      this.instances.clear();
      await Promise.all(instances.map((instance) => instance.peer?.shutdown()));
    });
  }

  async catalog(scopeValue: unknown): Promise<JsonObject> {
    await this.ready();
    const scope = parseScope(scopeValue);
    if (scope.kind === "project") await this.enqueue(() => this.reconcileProjectLocked(scope.project_path));
    const builtins = BUILTIN_PLUGINS.map((definition) => {
      const policyScope = this.builtinPolicyScope(scope, definition);
      const policy = this.policyFor(policyScope, definition.id);
      const enabled = this.builtinConfiguredEnabled(policyScope, definition);
      const missing = this.builtinMissing(policyScope, definition);
      const running = enabled && missing.length === 0;
      return {
        id: definition.id,
        description: definition.description,
        metadata: {
          origin: definition.origin,
          category: definition.category,
          scope_support: definition.scopeSupport,
          essential: definition.essential,
          default_enabled: definition.defaultEnabled,
        },
        dependencies: { required: definition.dependencies, optional: [] },
        state: definition.essential ? "enabled" : policy.state ?? "inherit",
        enabled,
        running,
        status: running ? "active" : enabled ? "pending" : "disposed",
        missing,
        error: null,
        config: policy.config ?? null,
        schema: null,
        available: true,
        commands: running
          ? this.options.hostCommands()
              .filter((command) => command.plugin === definition.id)
              .map((command) => command.name)
              .sort()
          : [],
        services: running ? definition.services : [],
        components: policy.components ?? {},
      };
    });
    const bundles = [...this.inventory.values()].flatMap((plugin) => {
      if (!plugin.runtime) return [];
      const managedId = `bundle:${plugin.id}`;
      const supported = plugin.runtime.scopeSupport;
      const policyScope = scope.kind === "project" && !supported.includes("project") ? { kind: "user" } as const : scope;
      const policy = this.policyFor(policyScope, managedId);
      const instance = this.instances.get(instanceKey(plugin.id, policyScope));
      const provided = this.providedServices(policyScope);
      const missing = plugin.runtime.inject.filter((name) => !provided.has(name));
      return [{
        id: managedId,
        description: plugin.description || null,
        metadata: {
          origin: "third_party",
          category: "integration",
          scope_support: supported,
          essential: false,
          default_enabled: plugin.enabled && plugin.trusted,
        },
        dependencies: { required: plugin.runtime.inject, optional: plugin.runtime.optionalInject },
        state: policy.state ?? "inherit",
        enabled: this.effectiveEnabled(policyScope, plugin),
        running: instance?.status === "active",
        status: instance?.status ?? null,
        missing,
        error: instance?.error ?? null,
        config: policy.config ?? null,
        schema: null,
        available: missing.length === 0,
        commands: instance?.commands.map((command) => command.name) ?? [],
        services: [],
        components: policy.components ?? {},
      }];
    });
    return {
      graph_revision: this.graphRevision,
      config_revision: this.config.revision,
      recovery: this.recovery,
      plugins: [...builtins, ...bundles],
    };
  }

  async list(): Promise<JsonObject[]> {
    await this.ready();
    await this.enqueue(() => this.refreshInventoryLocked());
    return [...this.inventory.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(publicPlugin);
  }

  async extensions(): Promise<{ running: string[]; untrusted: string[] }> {
    await this.ready();
    return {
      running: [...this.instances.values()]
        .filter((instance) => instance.realm.kind === "user" && instance.status === "active")
        .map((instance) => instance.pluginId)
        .sort(),
      untrusted: [...this.inventory.values()]
        .filter((plugin) => plugin.runtime && !plugin.trusted)
        .map((plugin) => plugin.id)
        .sort(),
    };
  }

  async invokeUi(
    pluginId: string,
    contributionId: string,
    contextValue: unknown,
    projectPath: string | null,
  ): Promise<unknown> {
    await this.ready();
    const plugin = this.inventory.get(pluginId);
    if (!plugin?.runtime) throw new Error(`plugin \`${pluginId}\` has no active UI runtime`);
    const contribution = plugin.ui_contributions.find((item) => item.id === contributionId);
    if (!contribution) throw new Error(`unknown UI contribution \`${contributionId}\``);
    const normalizedProject = projectPath ? normalizeProjectPath(projectPath) : null;
    const scope: PluginScope = normalizedProject && plugin.runtime.scopeSupport.includes("project")
      ? { kind: "project", project_path: normalizedProject }
      : { kind: "user" };
    if (scope.kind === "project") await this.enqueue(() => this.reconcileProjectLocked(scope.project_path));
    if (!this.effectiveEnabled(scope, plugin)) throw new Error(`plugin \`${pluginId}\` is disabled in this scope`);
    if (!this.effectiveComponentEnabled(
      scope,
      `bundle:${plugin.id}`,
      pluginUiComponentId(plugin.id, contribution.id),
    )) {
      throw new Error(`UI contribution \`${contributionId}\` is disabled in this scope`);
    }
    const instance = this.instances.get(instanceKey(plugin.id, scope));
    if (!instance || instance.status !== "active") {
      throw new Error(instance?.error ?? `plugin \`${pluginId}\` is not active`);
    }
    if (!instance.commands.some((command) => command.name === contribution.command)) {
      throw new Error(`UI contribution \`${contributionId}\` references an unregistered plugin command`);
    }
    return this.invoke(instance, contribution.command, {
      context: asObject(contextValue),
      input: contribution.input,
    });
  }

  async languageServer(languageValue: string, projectPath: string | null): Promise<PluginLanguageServerLaunch | null> {
    await this.ready();
    const language = languageValue.toLocaleLowerCase();
    const normalizedProject = projectPath ? normalizeProjectPath(projectPath) : null;
    if (normalizedProject) await this.enqueue(() => this.reconcileProjectLocked(normalizedProject));
    const candidates = [...this.inventory.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .flatMap((plugin) => {
        const scope: PluginScope = normalizedProject && plugin.runtime?.scopeSupport.includes("project")
          ? { kind: "project", project_path: normalizedProject }
          : { kind: "user" };
        if (!this.effectiveEnabled(scope, plugin)) return [];
        if (plugin.runtime) {
          const instance = this.instances.get(instanceKey(plugin.id, scope));
          if (!instance || instance.status !== "active") return [];
        }
        return plugin.lsp_servers
          .filter((server) => server.languages.includes(language))
          .map((server) => ({ plugin, server }));
      });
    if (candidates.length === 0) return null;
    if (candidates.length > 1) {
      throw new Error(
        `multiple plugins provide an LSP for ${language}: ${candidates.map(({ plugin, server }) => `${plugin.id}/${server.id}`).join(", ")}`,
      );
    }
    const { plugin, server } = candidates[0];
    const bundleDir = join(this.pluginsDir, plugin.id, "bundle");
    const dataDir = join(this.pluginsDir, ".data", plugin.id);
    mkdirSync(dataDir, { recursive: true });
    const projectDir = normalizedProject ?? "";
    const expand = (value: string): string => value
      .replaceAll("${PLUGIN_ROOT}", bundleDir)
      .replaceAll("${PLUGIN_DATA}", dataDir)
      .replaceAll("${PLUGIN_PROJECT_DIR}", projectDir);
    const executable = resolveExecutable(bundleDir, server.command);
    const env = Object.fromEntries(
      Object.entries(server.env)
        .filter(([name]) => !["PLUGIN_ROOT", "PLUGIN_DATA", "PLUGIN_PROJECT_DIR"].includes(name))
        .map(([name, value]) => [name, expand(value)]),
    );
    env.PLUGIN_ROOT = bundleDir;
    env.PLUGIN_DATA = dataDir;
    if (normalizedProject) env.PLUGIN_PROJECT_DIR = normalizedProject;
    return {
      id: `bundle:${plugin.id}:lsp:${server.id}`,
      pluginId: plugin.id,
      command: [executable, ...server.args.map(expand)],
      env,
    };
  }

  async plan(value: unknown): Promise<PendingPlan> {
    await this.ready();
    const raw = asObject(value);
    if (typeof raw.plugin !== "string") throw new Error("plugin is required");
    const pluginName = raw.plugin;
    const managed = this.managedPlugin(pluginName);
    const scope = parseScope(raw.scope);
    const supportsProject = managed.kind === "builtin"
      ? managed.definition.scopeSupport.includes("project")
      : managed.plugin.runtime?.scopeSupport.includes("project");
    if (scope.kind === "project" && !supportsProject) {
      throw new Error(`plugin \`${pluginName}\` does not support project scope`);
    }
    if (raw.config !== undefined) throw new Error(`plugin \`${pluginName}\` has no declared configuration schema`);
    const state = ["inherit", "enabled", "disabled"].includes(String(raw.state))
      ? raw.state as PluginOverride
      : undefined;
    if (!state && raw.component === undefined) throw new Error("plugin change requires state, config, or component");
    if (managed.kind === "builtin") {
      if (managed.definition.essential && !raw.component && state === "disabled") {
        throw new Error(`essential plugin \`${pluginName}\` cannot be disabled`);
      }
      if (
        typeof raw.component === "string" &&
        !managed.definition.components.some((component) => component.id === raw.component)
      ) {
        throw new Error(`component \`${raw.component}\` does not belong to plugin \`${pluginName}\``);
      }
      if (raw.component === "plugin-manager.page" && state === "disabled") {
        throw new Error("the required plugin manager component cannot be disabled");
      }
    } else if (
      typeof raw.component === "string" &&
      !managed.plugin.ui_contributions.some(
        (contribution) => pluginUiComponentId(managed.plugin.id, contribution.id) === raw.component,
      )
    ) {
      throw new Error(`component \`${raw.component}\` does not belong to plugin \`${pluginName}\``);
    }
    const affected = raw.component
      ? [pluginName]
      : state === "disabled" && managed.kind === "builtin"
        ? this.affectedByBuiltin(managed.definition, scope)
        : [pluginName];
    const activeResources = state === "disabled" && !raw.component
      ? managed.kind === "bundle"
        ? this.bundleActiveResources(pluginName, managed.plugin, scope)
        : affected.flatMap((affectedId) => {
            const definition = BUILTIN_PLUGIN_BY_ID.get(affectedId);
            if (!definition) return [];
            const policyScope = this.builtinPolicyScope(scope, definition);
            if (!this.builtinRunning(policyScope, definition)) return [];
            return [{
              plugin: affectedId,
              kind: "plugin_scope",
              id: String(builtinPluginScopeId(affectedId)),
              label: `${affectedId} runtime (${realmKey(policyScope)})`,
            }];
          })
      : [];
    const plan: PendingPlan = {
      id: randomUUID(),
      graph_revision: this.graphRevision,
      config_revision: this.config.revision,
      request: {
        plugin: pluginName,
        scope,
        ...(state ? { state } : {}),
        ...(typeof raw.component === "string" ? { component: raw.component } : {}),
      },
      affected,
      active_resources: activeResources,
      requires_confirmation: activeResources.length > 0,
    };
    this.plans.set(plan.id, plan);
    return structuredClone(plan);
  }

  async apply(id: string): Promise<JsonObject> {
    await this.ready();
    return this.enqueue(async () => {
      const plan = this.plans.get(id);
      this.plans.delete(id);
      if (!plan) throw new Error("plugin change plan was not found or was already used");
      if (plan.graph_revision !== this.graphRevision || plan.config_revision !== this.config.revision) {
        throw new Error("plugin change plan is stale; refresh and try again");
      }
      const previous = cloneConfig(this.config);
      const previousRecovery = structuredClone(this.recovery);
      this.applyPolicy(plan.request);
      this.recovery = { kind: "normal" };
      try {
        await this.restartForRequestLocked(plan.request);
        await this.reconcileAfterPolicyLocked(plan.request.scope);
        this.assertSettled(plan.request);
        this.markLastGood();
      } catch (cause) {
        this.config = previous;
        this.config.revision = plan.config_revision + 2;
        this.recovery = previousRecovery;
        writeJsonAtomic(this.configPath, this.config);
        await this.restartForRequestLocked(plan.request);
        await this.reconcileAllLocked();
        throw new Error(`plugin change did not settle: ${errorMessage(cause)}`);
      }
      this.options.onChanged();
      return {
        graph_revision: this.graphRevision,
        config_revision: this.config.revision,
        affected: plan.affected,
      };
    });
  }

  async reset(pluginName: string, scopeValue: unknown): Promise<JsonObject> {
    await this.ready();
    const managed = this.managedPlugin(pluginName);
    const scope = parseScope(scopeValue);
    const supportsProject = managed.kind === "builtin"
      ? managed.definition.scopeSupport.includes("project")
      : managed.plugin.runtime?.scopeSupport.includes("project");
    if (scope.kind === "project" && !supportsProject) {
      throw new Error(`plugin \`${pluginName}\` does not support project scope`);
    }
    return this.enqueue(async () => {
      const previous = cloneConfig(this.config);
      const previousRecovery = structuredClone(this.recovery);
      this.setPolicy(scope, pluginName, {});
      this.recovery = { kind: "normal" };
      const request: PendingPlan["request"] = {
        plugin: pluginName,
        scope,
        state: "inherit",
      };
      try {
        await this.restartForRequestLocked(request);
        await this.reconcileAfterPolicyLocked(scope);
        this.assertSettled(request);
        this.markLastGood();
      } catch (cause) {
        this.config = previous;
        this.config.revision += 2;
        this.recovery = previousRecovery;
        writeJsonAtomic(this.configPath, this.config);
        await this.restartForRequestLocked(request);
        await this.reconcileAllLocked();
        throw cause;
      }
      this.options.onChanged();
      return {
        graph_revision: this.graphRevision,
        config_revision: this.config.revision,
        affected: managed.kind === "builtin"
          ? this.affectedByBuiltin(managed.definition, scope)
          : [pluginName],
      };
    });
  }

  async setEnabled(id: string, enabled: boolean): Promise<JsonObject> {
    await this.ready();
    return this.enqueue(async () => {
      const plugin = this.inventory.get(id);
      if (!plugin) throw new Error(`unknown plugin \`${id}\``);
      plugin.enabled = enabled;
      this.writeRecord(plugin);
      await this.refreshInventoryLocked();
      this.options.onChanged();
      return publicPlugin(this.inventory.get(id) ?? plugin);
    });
  }

  async setTrusted(id: string, trusted: boolean): Promise<JsonObject> {
    await this.ready();
    return this.enqueue(async () => {
      const plugin = this.inventory.get(id);
      if (!plugin) throw new Error(`unknown plugin \`${id}\``);
      plugin.trusted = trusted;
      this.writeRecord(plugin);
      await this.refreshInventoryLocked();
      this.options.onChanged();
      return publicPlugin(this.inventory.get(id) ?? plugin);
    });
  }

  async uninstall(id: string, keepData: boolean): Promise<void> {
    await this.ready();
    await this.enqueue(async () => {
      if (!safeId(id)) throw new Error("unsafe plugin id");
      await this.stopPluginLocked(id);
      rmSync(join(this.pluginsDir, id), { recursive: true, force: true });
      if (!keepData) rmSync(join(this.pluginsDir, ".data", id), { recursive: true, force: true });
      this.removePolicy(`bundle:${id}`);
      await this.refreshInventoryLocked();
      this.markLastGood();
      this.options.onChanged();
    });
  }

  async importGithub(repository: string): Promise<{ plugin: JsonObject }> {
    await this.ready();
    return this.enqueue(async () => {
      const spec = githubSpec(repository);
      const temporary = mkdtempSync(join(tmpdir(), "codetwo-plugin-"));
      const checkout = join(temporary, "checkout");
      try {
        const clone = ["git", "clone", "--depth", "1"];
        if (spec.reference) clone.push("--branch", spec.reference);
        clone.push(`https://github.com/${spec.owner}/${spec.repo}.git`, checkout);
        const result = await runProcess(clone, temporary, 120_000);
        if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "GitHub clone failed");
        const root = spec.subpath ? resolve(checkout, spec.subpath) : checkout;
        const canonicalCheckout = realpathSync(checkout);
        const canonicalRoot = realpathSync(root);
        if (!pathInside(canonicalCheckout, canonicalRoot) || !statSync(canonicalRoot).isDirectory()) {
          throw new Error("GitHub plugin path escapes the repository");
        }
        const rootRelative = relative(canonicalCheckout, canonicalRoot);
        const plugin = c2PluginManifest(
          canonicalRoot,
          `GitHub · ${spec.owner}/${spec.repo}`,
          `${spec.owner}/${spec.repo}:${rootRelative}`,
        );
        const installed = this.installBundle(plugin, canonicalRoot);
        await this.refreshInventoryLocked();
        this.options.onChanged();
        return { plugin: publicPlugin(installed) };
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
    });
  }

  async listSkills(): Promise<JsonObject[]> {
    await this.ready();
    await this.enqueue(() => this.refreshInventoryLocked());
    return [...this.inventory.values()]
      .filter((plugin) => plugin.enabled)
      .flatMap((plugin) => plugin.components.map((component) => {
        const payload = asObject(component.payload);
        const kind = typeof payload.kind === "string" ? payload.kind : "fragment";
        return {
          id: component.id,
          name: component.name,
          description: typeof component.description === "string" ? component.description : "",
          icon: typeof component.icon === "string" ? component.icon : null,
          kind,
          source: typeof component.source === "string" ? component.source : plugin.source,
          ...(kind === "macro" && typeof payload.template === "string" ? {
            macro_template: payload.template,
            macro_slots: Array.isArray(payload.slots) ? payload.slots : [],
          } : {}),
        };
      }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  }

  private enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.mutation.then(operation, operation);
    this.mutation = result.then(() => undefined, () => undefined);
    return result;
  }

  private loadConfig(): void {
    try {
      this.config = pluginConfig(JSON.parse(readFileSync(this.configPath, "utf8")));
      this.recovery = { kind: "normal" };
      return;
    } catch (primaryCause) {
      try {
        this.config = pluginConfig(JSON.parse(readFileSync(this.lastGoodPath, "utf8")));
        this.recovery = { kind: "restored_last_good", error: errorMessage(primaryCause) };
        return;
      } catch {
        this.config = emptyConfig();
        const missing = !this.fileExists(this.configPath);
        this.recovery = missing ? { kind: "normal" } : { kind: "safe_mode", error: errorMessage(primaryCause) };
      }
    }
  }

  private scanInventory(): Map<string, InstalledPlugin> {
    mkdirSync(this.pluginsDir, { recursive: true });
    const inventory = new Map<string, InstalledPlugin>();
    for (const entry of readdirSync(this.pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        const parsed = installedPlugin(
          JSON.parse(readFileSync(join(this.pluginsDir, entry.name, RECORD_FILE), "utf8")),
          entry.name,
        );
        if (parsed) inventory.set(parsed.id, parsed);
      } catch (cause) {
        console.warn(`plugin ${entry.name}: ${errorMessage(cause)}`);
      }
    }
    return inventory;
  }

  private async refreshInventoryLocked(): Promise<void> {
    const next = this.scanInventory();
    const fingerprints = new Map([...next].map(([id, plugin]) => [id, JSON.stringify(plugin)]));
    const changed = new Set<string>();
    for (const id of new Set([...this.inventory.keys(), ...next.keys()])) {
      if (this.fingerprints.get(id) !== fingerprints.get(id)) changed.add(id);
    }
    if (changed.size === 0) return;
    for (const id of changed) await this.stopPluginLocked(id);
    this.inventory = next;
    this.fingerprints = fingerprints;
    this.graphRevision += 1;
    await this.reconcileAllLocked();
  }

  private async reconcileAllLocked(): Promise<void> {
    await this.reconcileScopeLocked({ kind: "user" });
    for (const projectPath of this.projectRealms) await this.reconcileProjectLocked(projectPath);
  }

  private async reconcileAfterPolicyLocked(scope: PluginScope): Promise<void> {
    if (scope.kind === "user") await this.reconcileAllLocked();
    else await this.reconcileProjectLocked(scope.project_path);
  }

  private async reconcileProjectLocked(projectPath: string): Promise<void> {
    const normalized = normalizeProjectPath(projectPath);
    this.projectRealms.add(normalized);
    await this.reconcileScopeLocked({ kind: "project", project_path: normalized });
  }

  private async reconcileScopeLocked(scope: PluginScope): Promise<void> {
    for (const plugin of [...this.inventory.values()].sort((left, right) => left.id.localeCompare(right.id))) {
      const runtime = plugin.runtime;
      if (!runtime) continue;
      if (scope.kind === "project" && !runtime.scopeSupport.includes("project")) continue;
      const key = instanceKey(plugin.id, scope);
      const enabled = this.effectiveEnabled(scope, plugin);
      const provided = this.providedServices(scope);
      const missing = runtime.inject.filter((service) => !provided.has(service));
      if (!enabled || missing.length > 0) {
        const existing = this.instances.get(key);
        if (enabled && missing.length > 0 && existing?.status === "pending") continue;
        await this.stopInstanceLocked(key);
        if (enabled && missing.length > 0) {
          this.instances.set(key, {
            key,
            scopeId: this.nextScopeId++,
            pluginId: plugin.id,
            realm: scope,
            status: "pending",
            error: null,
            peer: null,
            commands: [],
            events: new Set(),
            activeCalls: 0,
          });
        }
        continue;
      }
      const existing = this.instances.get(key);
      if (existing && ["active", "loading", "failed"].includes(existing.status)) continue;
      await this.startInstanceLocked(plugin, scope);
    }
  }

  private async startInstanceLocked(plugin: InstalledPlugin, scope: PluginScope): Promise<void> {
    const runtime = plugin.runtime;
    if (!runtime) return;
    const key = instanceKey(plugin.id, scope);
    const instance: RuntimeInstance = {
      key,
      scopeId: this.nextScopeId++,
      pluginId: plugin.id,
      realm: scope,
      status: "loading",
      error: null,
      peer: null,
      commands: [],
      events: new Set(),
      activeCalls: 0,
    };
    this.instances.set(key, instance);
    if (!plugin.trusted) {
      instance.status = "failed";
      instance.error = `bundle \`bundle:${plugin.id}\` is not trusted; approve it before enabling its runtime`;
      this.graphRevision += 1;
      return;
    }
    const bundleDir = join(this.pluginsDir, plugin.id, "bundle");
    const dataDir = scope.kind === "user"
      ? join(this.pluginsDir, ".data", plugin.id)
      : join(this.pluginsDir, ".data", plugin.id, "projects", projectKey(scope.project_path));
    mkdirSync(dataDir, { recursive: true });
    try {
      const executable = resolveExecutable(bundleDir, runtime.command);
      const peer = new PluginPeer([executable, ...runtime.args], bundleDir, runtime.env, {
        call: (name, args) => this.options.callHost(name, args, scope.kind === "project" ? scope.project_path : null),
        emit: (name, payload) => this.publish(name, payload),
        closed: (error) => this.runtimeClosed(key, error),
      });
      instance.peer = peer;
      const result = await peer.initialize({
        protocolVersion: PROTOCOL_VERSION,
        host: {
          name: "code2",
          version: "0.0.0",
          commands: this.commandsForRealm(scope),
        },
        config: this.policyFor(scope, `bundle:${plugin.id}`).config ?? null,
        dataDir,
        ...(scope.kind === "project" ? { projectPath: scope.project_path } : {}),
      });
      for (const command of result.commands) {
        if (this.options.hostCommands().some((hostCommand) => hostCommand.name === command.name)) {
          throw new Error(`duplicate command \`${command.name}\``);
        }
        const owner = this.findCommand(command.name, scope, instance.key);
        if (owner) throw new Error(`duplicate command \`${command.name}\``);
      }
      instance.commands = result.commands;
      instance.events = new Set(result.events);
      instance.status = "active";
      instance.error = null;
      this.graphRevision += 1;
      this.options.onChanged();
    } catch (cause) {
      instance.status = "failed";
      instance.error = errorMessage(cause);
      instance.commands = [];
      await instance.peer?.shutdown();
      instance.peer = null;
      this.graphRevision += 1;
      this.options.onChanged();
    }
  }

  private runtimeClosed(key: string, error: Error): void {
    const instance = this.instances.get(key);
    if (!instance || this.shuttingDown || instance.status === "disposed") return;
    instance.status = "failed";
    instance.error = error.message;
    instance.peer = null;
    instance.commands = [];
    instance.events.clear();
    this.graphRevision += 1;
    this.options.onChanged();
  }

  private async stopPluginLocked(pluginId: string): Promise<void> {
    const keys = [...this.instances.values()]
      .filter((instance) => instance.pluginId === pluginId)
      .map((instance) => instance.key);
    for (const key of keys) await this.stopInstanceLocked(key);
  }

  private async stopInstanceLocked(key: string): Promise<void> {
    const instance = this.instances.get(key);
    if (!instance) return;
    this.instances.delete(key);
    instance.status = "disposed";
    instance.commands = [];
    instance.events.clear();
    await instance.peer?.shutdown();
    instance.peer = null;
    this.graphRevision += 1;
    this.options.onChanged();
  }

  private findCommand(name: string, scope: PluginScope, exceptKey?: string): RuntimeInstance | null {
    return [...this.instances.values()].find((instance) =>
      instance.key !== exceptKey &&
      instance.status === "active" &&
      realmKey(instance.realm) === realmKey(scope) &&
      instance.commands.some((command) => command.name === name)) ?? null;
  }

  private commandsForRealm(scope: PluginScope): string[] {
    const pluginCommands = [...this.instances.values()].flatMap((instance) => {
      const visible = instance.status === "active" && (
        instance.realm.kind === "user" || realmKey(instance.realm) === realmKey(scope)
      );
      return visible ? instance.commands.map((command) => command.name) : [];
    });
    const hostCommands = this.options.hostCommands()
      .filter((command) => this.builtinRunning(
        this.builtinPolicyScope(scope, this.requireBuiltin(command.plugin)),
        this.requireBuiltin(command.plugin),
      ))
      .map((command) => command.name);
    return [...new Set([...hostCommands, ...pluginCommands])].sort();
  }

  private async invoke(instance: RuntimeInstance, name: string, args: unknown): Promise<unknown> {
    const peer = instance.peer;
    if (!peer || instance.status !== "active") throw new Error(`${name}: plugin is not active`);
    instance.activeCalls += 1;
    try {
      return await peer.invoke(name, args ?? null);
    } catch (cause) {
      throw new Error(`${name}: ${errorMessage(cause)}`);
    } finally {
      instance.activeCalls = Math.max(0, instance.activeCalls - 1);
    }
  }

  private policyFor(scope: PluginScope, plugin: string): PluginPolicy {
    if (scope.kind === "user") return this.config.user[plugin] ?? {};
    return this.config.projects[scope.project_path]?.[plugin] ?? {};
  }

  private effectiveEnabled(scope: PluginScope, plugin: InstalledPlugin): boolean {
    if (this.recovery.kind === "safe_mode") return false;
    const managedId = `bundle:${plugin.id}`;
    const user = resolveOverride(this.policyFor({ kind: "user" }, managedId).state, plugin.enabled && plugin.trusted);
    return scope.kind === "user" ? user : resolveOverride(this.policyFor(scope, managedId).state, user);
  }

  private effectiveComponentEnabled(
    scope: PluginScope,
    managedId: string,
    componentId: string,
  ): boolean {
    const user = resolveOverride(
      this.policyFor({ kind: "user" }, managedId).components?.[componentId],
      true,
    );
    return scope.kind === "user"
      ? user
      : resolveOverride(this.policyFor(scope, managedId).components?.[componentId], user);
  }

  private requireBuiltin(pluginId: string): BuiltinPluginDefinition {
    const definition = BUILTIN_PLUGIN_BY_ID.get(pluginId);
    if (!definition) throw new Error(`unknown built-in plugin \`${pluginId}\``);
    return definition;
  }

  private builtinPolicyScope(scope: PluginScope, definition: BuiltinPluginDefinition): PluginScope {
    return scope.kind === "project" && definition.scopeSupport.includes("project")
      ? scope
      : { kind: "user" };
  }

  private builtinConfiguredEnabled(scope: PluginScope, definition: BuiltinPluginDefinition): boolean {
    if (definition.essential) return true;
    if (this.recovery.kind === "safe_mode") return false;
    const user = resolveOverride(
      this.policyFor({ kind: "user" }, definition.id).state,
      definition.defaultEnabled,
    );
    return scope.kind === "user"
      ? user
      : resolveOverride(this.policyFor(scope, definition.id).state, user);
  }

  private builtinRunning(
    scope: PluginScope,
    definition: BuiltinPluginDefinition,
    visiting: Set<string> = new Set(),
  ): boolean {
    const policyScope = this.builtinPolicyScope(scope, definition);
    if (!this.builtinConfiguredEnabled(policyScope, definition)) return false;
    if (visiting.has(definition.id)) throw new Error(`built-in plugin dependency cycle at \`${definition.id}\``);
    const next = new Set(visiting).add(definition.id);
    return definition.dependencies.every((dependencyId) => {
      const dependency = this.requireBuiltin(dependencyId);
      return this.builtinRunning(this.builtinPolicyScope(policyScope, dependency), dependency, next);
    });
  }

  private builtinMissing(scope: PluginScope, definition: BuiltinPluginDefinition): string[] {
    const policyScope = this.builtinPolicyScope(scope, definition);
    return definition.dependencies.filter((dependencyId) => {
      const dependency = this.requireBuiltin(dependencyId);
      return !this.builtinRunning(this.builtinPolicyScope(policyScope, dependency), dependency);
    });
  }

  private providedServices(scope: PluginScope): Set<string> {
    return new Set(BUILTIN_PLUGINS.flatMap((definition) => {
      const policyScope = this.builtinPolicyScope(scope, definition);
      return this.builtinRunning(policyScope, definition) ? definition.services : [];
    }));
  }

  private affectedByBuiltin(definition: BuiltinPluginDefinition, scope: PluginScope): string[] {
    const affected = new Set([definition.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of BUILTIN_PLUGINS) {
        if (affected.has(candidate.id)) continue;
        if (scope.kind === "project" && !candidate.scopeSupport.includes("project")) continue;
        if (!candidate.dependencies.some((dependency) => affected.has(dependency))) continue;
        affected.add(candidate.id);
        changed = true;
      }
    }
    const removedServices = new Set([...affected].flatMap((id) => this.requireBuiltin(id).services));
    for (const plugin of this.inventory.values()) {
      if (!plugin.runtime) continue;
      if (scope.kind === "project" && !plugin.runtime.scopeSupport.includes("project")) continue;
      if (plugin.runtime.inject.some((service) => removedServices.has(service))) affected.add(`bundle:${plugin.id}`);
    }
    return [...affected];
  }

  private bundleActiveResources(
    pluginName: string,
    plugin: InstalledPlugin,
    scope: PluginScope,
  ): Array<{ plugin: string; kind: string; id: string; label: string }> {
    const selected = this.instances.get(instanceKey(plugin.id, scope));
    return [...this.instances.values()]
      .filter((candidate) =>
        candidate.pluginId === plugin.id &&
        ["active", "loading"].includes(candidate.status) &&
        (scope.kind === "user" || candidate.key === selected?.key))
      .flatMap((candidate) => [{
        plugin: pluginName,
        kind: "plugin_scope",
        id: String(candidate.scopeId),
        label: `${pluginName} runtime (${realmKey(candidate.realm)})`,
      }, ...(candidate.activeCalls > 0 ? [{
        plugin: pluginName,
        kind: "command",
        id: `${candidate.scopeId}:commands`,
        label: `${candidate.activeCalls} active command${candidate.activeCalls === 1 ? "" : "s"}`,
      }] : [])]);
  }

  private managedPlugin(name: string): ManagedPlugin {
    const definition = BUILTIN_PLUGIN_BY_ID.get(name);
    if (definition) return { kind: "builtin", definition };
    const id = name.startsWith("bundle:") ? name.slice("bundle:".length) : "";
    const plugin = this.inventory.get(id);
    if (!plugin?.runtime) throw new Error(`unknown plugin \`${name}\``);
    return { kind: "bundle", plugin };
  }

  private applyPolicy(request: PendingPlan["request"]): void {
    const current = this.policyFor(request.scope, request.plugin);
    const next: PluginPolicy = { ...current };
    if (request.component && request.state) {
      next.components = { ...(next.components ?? {}), [request.component]: request.state };
      if (request.state === "inherit") delete next.components[request.component];
      if (Object.keys(next.components).length === 0) delete next.components;
    } else {
      if (request.state) next.state = request.state;
      if (request.config !== undefined) next.config = request.config;
    }
    this.setPolicy(request.scope, request.plugin, next);
  }

  private async restartForRequestLocked(request: PendingPlan["request"]): Promise<void> {
    if (request.component) return;
    const managed = this.managedPlugin(request.plugin);
    if (managed.kind === "bundle") {
      if (request.scope.kind === "user") await this.stopPluginLocked(managed.plugin.id);
      else await this.stopInstanceLocked(instanceKey(managed.plugin.id, request.scope));
      return;
    }
    this.graphRevision += 1;
    for (const pluginId of this.affectedByBuiltin(managed.definition, request.scope)) {
      const definition = BUILTIN_PLUGIN_BY_ID.get(pluginId);
      if (!definition) continue;
      const scope = this.builtinPolicyScope(request.scope, definition);
      await this.options.reconcileBuiltin(
        pluginId,
        this.builtinRunning(scope, definition),
        scope.kind === "project" ? scope.project_path : null,
      );
    }
  }

  private assertSettled(request: PendingPlan["request"]): void {
    if (request.component) return;
    const managed = this.managedPlugin(request.plugin);
    if (managed.kind === "builtin") {
      if (managed.definition.essential && !this.builtinRunning({ kind: "user" }, managed.definition)) {
        throw new Error(`essential plugin \`${request.plugin}\` did not remain active`);
      }
      return;
    }
    const plugin = managed.plugin;
    const scopes: PluginScope[] = request.scope.kind === "user"
      ? [
          { kind: "user" },
          ...(plugin.runtime?.scopeSupport.includes("project")
            ? [...this.projectRealms].map((project_path): PluginScope => ({ kind: "project", project_path }))
            : []),
        ]
      : [request.scope];
    for (const scope of scopes) {
      const expected = this.effectiveEnabled(scope, plugin);
      const instance = this.instances.get(instanceKey(plugin.id, scope));
      if (expected && instance?.status !== "active") {
        throw new Error(instance?.error ?? `${request.plugin} did not become active in ${realmKey(scope)}`);
      }
      if (!expected && instance && instance.status !== "disposed") {
        throw new Error(`${request.plugin} remained ${instance.status} in ${realmKey(scope)}`);
      }
    }
  }

  private setPolicy(scope: PluginScope, plugin: string, policy: PluginPolicy): void {
    const clean = pluginPolicy(policy);
    const empty = Object.keys(clean).length === 0;
    if (scope.kind === "user") {
      if (empty) delete this.config.user[plugin];
      else this.config.user[plugin] = clean;
    } else {
      const project = this.config.projects[scope.project_path] ?? {};
      if (empty) delete project[plugin];
      else project[plugin] = clean;
      if (Object.keys(project).length === 0) delete this.config.projects[scope.project_path];
      else this.config.projects[scope.project_path] = project;
    }
    this.config.revision += 1;
    writeJsonAtomic(this.configPath, this.config);
  }

  private removePolicy(plugin: string): void {
    let changed = delete this.config.user[plugin];
    for (const [projectPath, policies] of Object.entries(this.config.projects)) {
      changed = delete policies[plugin] || changed;
      if (Object.keys(policies).length === 0) delete this.config.projects[projectPath];
    }
    if (changed) {
      this.config.revision += 1;
      writeJsonAtomic(this.configPath, this.config);
    }
  }

  private markLastGood(): void {
    writeJsonAtomic(this.lastGoodPath, this.config);
    this.recovery = { kind: "normal" };
  }

  private writeRecord(plugin: InstalledPlugin): void {
    writeJsonAtomic(join(this.pluginsDir, plugin.id, RECORD_FILE), plugin);
  }

  private installBundle(plugin: InstalledPlugin, sourceRoot: string): InstalledPlugin {
    const files = collectBundleFiles(sourceRoot);
    mkdirSync(this.pluginsDir, { recursive: true });
    const finalDir = join(this.pluginsDir, plugin.id);
    try {
      const previous = installedPlugin(
        JSON.parse(readFileSync(join(finalDir, RECORD_FILE), "utf8")),
        plugin.id,
      );
      if (previous) {
        plugin.enabled = previous.enabled;
        plugin.trusted = previous.trusted;
        plugin.scope = previous.scope;
      }
    } catch {
      // First install.
    }
    const stage = join(this.pluginsDir, `.${plugin.id}.stage-${randomUUID()}`);
    const backup = join(this.pluginsDir, `.${plugin.id}.backup-${randomUUID()}`);
    mkdirSync(join(stage, "bundle"), { recursive: true });
    try {
      for (const file of files) {
        const target = join(stage, "bundle", file.relative);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(file.source, target, constants.COPYFILE_EXCL);
        chmodSync(target, file.mode);
      }
      writeJsonAtomic(join(stage, RECORD_FILE), plugin);
      const existed = this.fileExists(finalDir);
      if (existed) renameSync(finalDir, backup);
      try {
        renameSync(stage, finalDir);
      } catch (cause) {
        if (existed) renameSync(backup, finalDir);
        throw cause;
      }
      if (existed) rmSync(backup, { recursive: true, force: true });
      mkdirSync(join(this.pluginsDir, ".data", plugin.id), { recursive: true });
      return plugin;
    } catch (cause) {
      rmSync(stage, { recursive: true, force: true });
      throw cause;
    }
  }

  private fileExists(path: string): boolean {
    try {
      lstatSync(path);
      return true;
    } catch {
      return false;
    }
  }
}
