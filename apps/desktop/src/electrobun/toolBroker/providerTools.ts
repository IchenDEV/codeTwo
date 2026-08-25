import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  BROWSER_USE_AUTOMATIC,
  BROWSER_USE_DISABLED,
  COMPUTER_USE_AUTOMATIC,
  COMPUTER_USE_DISABLED,
  HOST_TOOLS_CONFIG_FILE,
  JsonSelectionStore,
  OPENAI_BROWSER_BACKEND,
  ToolBroker,
  type AcpMcpServer,
  type AcpRemoteMcpServer,
  type AcpStdioMcpServer,
  type BrowserUseBackendOption,
  type BrowserUseSettings,
  type CapabilityState,
  type ComputerUseBackendOption,
  type ComputerUseSettings,
  type ConfiguredBrowserUseBridge,
  type ConfiguredComputerUseBridge,
  type HostToolEvidence,
  type ProviderCapability,
  type ProviderCapabilityId,
  type ProviderToolset,
} from "../../../../../packages/tool-broker/src";
import { which } from "./executable";

export {
  BROWSER_USE_AUTOMATIC,
  BROWSER_USE_DISABLED,
  COMPUTER_USE_AUTOMATIC,
  COMPUTER_USE_DISABLED,
  HOST_TOOLS_CONFIG_FILE,
  OPENAI_BROWSER_BACKEND,
};
export type {
  AcpMcpServer,
  AcpRemoteMcpServer,
  AcpStdioMcpServer,
  BrowserUseBackendOption,
  BrowserUseSettings,
  CapabilityState,
  ComputerUseBackendOption,
  ComputerUseSettings,
  ConfiguredBrowserUseBridge,
  ConfiguredComputerUseBridge,
  HostToolEvidence,
  ProviderCapability,
  ProviderCapabilityId,
  ProviderToolset,
};

const OPENAI_TEAM_ID = "2DC432GLL2";
const CHATGPT_BUNDLE_ID = "com.openai.codex";
const CUA_BUNDLE_ID = "com.openai.sky.CUAService";

type Table = Record<string, unknown>;

interface SignatureInfo {
  valid: boolean;
  identifier: string | null;
  teamId: string | null;
}

interface PluginBundle {
  root: string;
  version: string;
}

function table(value: unknown): Table {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Table : {};
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function namedValues(value: unknown): { name: string; value: string }[] {
  return Object.entries(table(value)).flatMap(([name, candidate]) => {
    return typeof candidate === "string" ? [{ name, value: candidate }] : [];
  });
}

function isFile(path: string | null): path is string {
  if (!path) return false;
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function run(command: string[]): { success: boolean; stdout: string; stderr: string } {
  try {
    const result = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
    return {
      success: result.exitCode === 0,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } catch {
    return { success: false, stdout: "", stderr: "" };
  }
}

function lineValue(text: string, prefix: string): string | null {
  for (const line of text.split("\n")) {
    if (line.startsWith(prefix)) return string(line.slice(prefix.length).trim());
  }
  return null;
}

function signature(path: string | null): SignatureInfo {
  if (!path || !existsSync(path) || process.platform !== "darwin") {
    return { valid: false, identifier: null, teamId: null };
  }
  const verified = run(["/usr/bin/codesign", "--verify", "--deep", "--strict", path]).success;
  const details = run(["/usr/bin/codesign", "-dv", "--verbose=4", path]);
  return {
    valid: verified,
    identifier: lineValue(details.stderr, "Identifier="),
    teamId: lineValue(details.stderr, "TeamIdentifier="),
  };
}

function isOpenAiSignature(info: SignatureInfo, identifier: string): boolean {
  return info.valid && info.identifier === identifier && info.teamId === OPENAI_TEAM_ID;
}

function plistValue(path: string, key: string): string | null {
  const result = run(["/usr/libexec/PlistBuddy", "-c", `Print :${key}`, path]);
  return result.success ? string(result.stdout.trim()) : null;
}

function chatGptCandidates(): string[] {
  if (process.platform !== "darwin") return [];
  const candidates = new Set<string>();
  candidates.add("/Applications/ChatGPT.app");
  const search = run(["/usr/bin/mdfind", "kMDItemCFBundleIdentifier == 'com.openai.codex'"]);
  for (const path of search.stdout.split("\n")) {
    if (path.endsWith(".app")) candidates.add(path);
  }
  return [...candidates].filter(existsSync);
}

function versionKey(version: string): number[] {
  return version.split(/\D+/).filter(Boolean).map(Number);
}

function compareVersions(left: string, right: string): number {
  const a = versionKey(left);
  const b = versionKey(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function bundledPlugin(codexHome: string, name: string): PluginBundle | null {
  const directory = join(codexHome, "plugins", "cache", "openai-bundled", name);
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return null;
  }
  return entries.flatMap((entry): PluginBundle[] => {
    const root = join(directory, entry);
    try {
      const manifest = JSON.parse(readFileSync(join(root, ".codex-plugin", "plugin.json"), "utf8")) as Table;
      const version = string(manifest.version);
      return manifest.name === name && version ? [{ root, version }] : [];
    } catch {
      return [];
    }
  }).sort((left, right) => compareVersions(right.version, left.version))[0] ?? null;
}

function pluginEnabled(config: Table, name: string): boolean {
  return table(table(config.plugins)[name]).enabled === true;
}

export function stdioServer(
  name: string,
  config: Table,
  safeInheritedEnv: Table = {},
): AcpStdioMcpServer | null {
  const command = string(config.command);
  if (!isFile(command)) return null;
  const env = Object.entries(table(config.env)).flatMap(([key, value]) => {
    const resolved = string(value);
    return resolved ? [{ name: key, value: resolved }] : [];
  });
  const trustedHashes = string(safeInheritedEnv.NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S);
  if (trustedHashes && !env.some((entry) => entry.name === "NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S")) {
    env.push({ name: "NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S", value: trustedHashes });
  }
  return {
    name,
    command,
    args: stringArray(config.args),
    env,
    ...(string(config.cwd) ? { cwd: string(config.cwd)! } : {}),
  };
}

function resolveConfiguredCommand(command: string, dataDir: string): string | null {
  if (command.includes("/") || command.includes("\\")) {
    const path = isAbsolute(command) ? command : join(dataDir, command);
    return isFile(path) ? path : null;
  }
  return which(command);
}

function configuredServer(
  id: string,
  value: unknown,
  dataDir: string,
  kind = "computer-use",
): AcpMcpServer {
  const server = table(value);
  const name = string(server.name) ?? `${kind}-${id}`;
  const transport = string(server.type) ?? "stdio";
  if (transport === "stdio") {
    const command = string(server.command);
    if (!command) throw new Error(`${kind} backend ${JSON.stringify(id)} is missing server.command`);
    const executable = resolveConfiguredCommand(command, dataDir);
    if (!executable) {
      throw new Error(`${kind} backend ${JSON.stringify(id)} command ${JSON.stringify(command)} was not found`);
    }
    return {
      name,
      command: executable,
      args: stringArray(server.args),
      env: namedValues(server.env),
      ...(string(server.cwd) ? { cwd: string(server.cwd)! } : {}),
    };
  }
  if (transport === "http" || transport === "streamable-http" || transport === "sse") {
    const url = string(server.url);
    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      throw new Error(`${kind} backend ${JSON.stringify(id)} needs an http(s) server.url`);
    }
    return {
      name,
      type: transport === "sse" ? "sse" : "http",
      url,
      headers: namedValues(server.headers),
    };
  }
  throw new Error(
    `${kind} backend ${JSON.stringify(id)} uses unsupported MCP transport ${JSON.stringify(transport)}`,
  );
}

export function loadConfiguredComputerUse(
  dataDir: string,
): {
  bridges: ConfiguredComputerUseBridge[];
  selections: Record<string, string>;
  backends: ComputerUseBackendOption[];
  errors: string[];
} {
  const path = join(dataDir, HOST_TOOLS_CONFIG_FILE);
  if (!existsSync(path)) {
    return { bridges: [], selections: {}, backends: [cuaDriverOption()], errors: [] };
  }
  let document: Table;
  try {
    document = table(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    return {
      bridges: [],
      selections: {},
      backends: [cuaDriverOption()],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
  const persistedSelections = Object.fromEntries(
    Object.entries(table(document.computer_use_selection))
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const selections: Record<string, string> = typeof persistedSelections["*"] === "string"
    ? { "*": persistedSelections["*"] }
    : {};
  if (document.schema_version !== 1) {
    return {
      bridges: [],
      selections,
      backends: [cuaDriverOption()],
      errors: [`schema ${JSON.stringify(document.schema_version)} is unsupported; expected 1`],
    };
  }
  const entries = Array.isArray(document.computer_use) ? document.computer_use : [];
  const bridges: ConfiguredComputerUseBridge[] = [];
  const backends: ComputerUseBackendOption[] = [];
  const errors: string[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  const selectedIds = new Set(
    Object.values(selections).filter(
      (selection) => selection !== COMPUTER_USE_AUTOMATIC && selection !== COMPUTER_USE_DISABLED,
    ),
  );
  for (const candidate of entries) {
    const entry = table(candidate);
    const id = string(entry.id);
    const active = entry.enabled === true || (id !== null && selectedIds.has(id));
    if (!id || !/^[A-Za-z0-9_.-]+$/.test(id)) {
      const error = `invalid computer-use backend id ${JSON.stringify(entry.id)}`;
      backends.push({
        id: id ?? String(entry.id ?? "invalid"),
        displayName: string(entry.display_name) ?? "Invalid backend",
        available: false,
        reason: error,
        providers: stringArray(entry.providers),
        excludeProviders: stringArray(entry.exclude_providers),
      });
      if (active) errors.push(error);
      continue;
    }
    if (ids.has(id)) {
      const error = `duplicate computer-use backend id ${JSON.stringify(id)}`;
      backends.push({
        id,
        displayName: string(entry.display_name) ?? id,
        available: false,
        reason: error,
        providers: stringArray(entry.providers),
        excludeProviders: stringArray(entry.exclude_providers),
      });
      if (active) errors.push(error);
      continue;
    }
    ids.add(id);
    try {
      const server = configuredServer(id, entry.server, dataDir);
      const bridge = {
        id,
        enabled: entry.enabled === true,
        displayName: string(entry.display_name) ?? id,
        version: string(entry.version),
        providers: stringArray(entry.providers),
        excludeProviders: stringArray(entry.exclude_providers),
        server,
      } satisfies ConfiguredComputerUseBridge;
      backends.push({
        id,
        displayName: bridge.displayName,
        available: true,
        reason: null,
        providers: bridge.providers,
        excludeProviders: bridge.excludeProviders,
      });
      if (active && names.has(server.name)) {
        errors.push(`duplicate computer-use MCP server name ${JSON.stringify(server.name)}`);
        continue;
      }
      if (active) names.add(server.name);
      bridges.push(bridge);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      backends.push({
        id,
        displayName: string(entry.display_name) ?? id,
        available: false,
        reason: message,
        providers: stringArray(entry.providers),
        excludeProviders: stringArray(entry.exclude_providers),
      });
      if (active) errors.push(message);
    }
  }

  if (!ids.has("cua")) {
    const option = cuaDriverOption();
    backends.push(option);
    if (option.available) bridges.push(cuaDriverBridge());
    else if (selectedIds.has("cua") && option.reason) errors.push(option.reason);
  }
  for (const selection of selectedIds) {
    if (!backends.some((backend) => backend.id === selection)) {
      errors.push(`computer-use selection references unknown backend ${JSON.stringify(selection)}`);
    }
  }
  return { bridges: errors.length === 0 ? bridges : [], selections, backends, errors };
}

export function loadConfiguredBrowserUse(
  dataDir: string,
): {
  bridges: ConfiguredBrowserUseBridge[];
  selections: Record<string, string>;
  backends: BrowserUseBackendOption[];
  errors: string[];
} {
  const path = join(dataDir, HOST_TOOLS_CONFIG_FILE);
  if (!existsSync(path)) return { bridges: [], selections: {}, backends: [], errors: [] };

  let document: Table;
  try {
    document = table(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    return {
      bridges: [],
      selections: {},
      backends: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
  const persistedSelections = Object.fromEntries(
    Object.entries(table(document.browser_use_selection))
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const selections: Record<string, string> = typeof persistedSelections["*"] === "string"
    ? { "*": persistedSelections["*"] }
    : {};
  if (document.schema_version !== 1) {
    return {
      bridges: [],
      selections,
      backends: [],
      errors: [`schema ${JSON.stringify(document.schema_version)} is unsupported; expected 1`],
    };
  }

  const entries = Array.isArray(document.browser_use) ? document.browser_use : [];
  const bridges: ConfiguredBrowserUseBridge[] = [];
  const backends: BrowserUseBackendOption[] = [];
  const errors: string[] = [];
  const names = new Set<string>();
  const ids = new Set<string>([OPENAI_BROWSER_BACKEND]);
  const selectedIds = new Set(
    Object.values(selections).filter(
      (selection) => selection !== BROWSER_USE_AUTOMATIC
        && selection !== BROWSER_USE_DISABLED
        && selection !== OPENAI_BROWSER_BACKEND,
    ),
  );
  for (const candidate of entries) {
    const entry = table(candidate);
    const id = string(entry.id);
    const active = entry.enabled === true || (id !== null && selectedIds.has(id));
    if (!id || !/^[A-Za-z0-9_.-]+$/.test(id)) {
      const error = `invalid browser-use backend id ${JSON.stringify(entry.id)}`;
      backends.push({
        id: id ?? String(entry.id ?? "invalid"),
        displayName: string(entry.display_name) ?? "Invalid backend",
        available: false,
        reason: error,
        providers: stringArray(entry.providers),
        excludeProviders: stringArray(entry.exclude_providers),
      });
      if (active) errors.push(error);
      continue;
    }
    if (ids.has(id)) {
      const error = id === OPENAI_BROWSER_BACKEND
        ? `browser-use backend id ${JSON.stringify(id)} is reserved`
        : `duplicate browser-use backend id ${JSON.stringify(id)}`;
      backends.push({
        id,
        displayName: string(entry.display_name) ?? id,
        available: false,
        reason: error,
        providers: stringArray(entry.providers),
        excludeProviders: stringArray(entry.exclude_providers),
      });
      if (active) errors.push(error);
      continue;
    }
    ids.add(id);
    try {
      const server = configuredServer(id, entry.server, dataDir, "browser-use");
      const bridge = {
        id,
        enabled: entry.enabled === true,
        displayName: string(entry.display_name) ?? id,
        version: string(entry.version),
        providers: stringArray(entry.providers),
        excludeProviders: stringArray(entry.exclude_providers),
        server,
      } satisfies ConfiguredBrowserUseBridge;
      backends.push({
        id,
        displayName: bridge.displayName,
        available: true,
        reason: null,
        providers: bridge.providers,
        excludeProviders: bridge.excludeProviders,
      });
      if (active && names.has(server.name)) {
        errors.push(`duplicate browser-use MCP server name ${JSON.stringify(server.name)}`);
        continue;
      }
      if (active) names.add(server.name);
      bridges.push(bridge);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      backends.push({
        id,
        displayName: string(entry.display_name) ?? id,
        available: false,
        reason: message,
        providers: stringArray(entry.providers),
        excludeProviders: stringArray(entry.exclude_providers),
      });
      if (active) errors.push(message);
    }
  }
  for (const selection of selectedIds) {
    if (!backends.some((backend) => backend.id === selection)) {
      errors.push(`browser-use selection references unknown backend ${JSON.stringify(selection)}`);
    }
  }
  return { bridges: errors.length === 0 ? bridges : [], selections, backends, errors };
}

function cuaDriverOption(): ComputerUseBackendOption {
  const available = which("cua-driver") !== null;
  return {
    id: "cua",
    displayName: "Cua Driver",
    available,
    reason: available
      ? "cua-driver is available on PATH."
      : "Install cua-driver and make it available on PATH.",
    providers: [],
    excludeProviders: [],
  };
}

function cuaDriverBridge(): ConfiguredComputerUseBridge {
  return {
    id: "cua",
    enabled: false,
    displayName: "Cua Driver",
    version: null,
    providers: [],
    excludeProviders: [],
    server: {
      name: "cua-driver",
      command: which("cua-driver") ?? "cua-driver",
      args: ["mcp"],
      env: [],
    },
  };
}

export function computerUseSettings(evidence: HostToolEvidence): ComputerUseSettings {
  return new ToolBroker().catalog({ evidence }).computerUse;
}

export function saveComputerUseSelection(
  dataDir: string,
  backendId: string,
  evidence: HostToolEvidence,
): void {
  if (backendId !== COMPUTER_USE_AUTOMATIC && backendId !== COMPUTER_USE_DISABLED) {
    const backend = evidence.computerUseBackends.find((candidate) => candidate.id === backendId);
    if (!backend) throw new Error(`unknown computer-use backend ${JSON.stringify(backendId)}`);
    if (!backend.available) throw new Error(backend.reason ?? `computer-use backend ${JSON.stringify(backendId)} is unavailable`);
  }

  new JsonSelectionStore(dataDir).setGlobal("computer_use", backendId);
}

export function browserUseSettings(evidence: HostToolEvidence): BrowserUseSettings {
  return new ToolBroker().catalog({ evidence }).browserUse;
}

export function saveBrowserUseSelection(
  dataDir: string,
  backendId: string,
  evidence: HostToolEvidence,
): void {
  if (backendId !== BROWSER_USE_AUTOMATIC && backendId !== BROWSER_USE_DISABLED) {
    const backend = evidence.browserUseBackends.find((candidate) => candidate.id === backendId);
    if (!backend) throw new Error(`unknown browser-use backend ${JSON.stringify(backendId)}`);
    if (!backend.available) throw new Error(backend.reason ?? `browser-use backend ${JSON.stringify(backendId)} is unavailable`);
  }

  new JsonSelectionStore(dataDir).setGlobal("browser_use", backendId);
}

export function detectHostToolEvidence(
  environment: NodeJS.ProcessEnv = process.env,
  dataDir?: string,
): HostToolEvidence {
  const userHome = string(environment.HOME) ?? string(environment.USERPROFILE);
  const codexHome = string(environment.CODEX_HOME)
    ?? (userHome ? join(userHome, ".codex") : null);
  let config: Table = {};
  let configError: string | null = null;
  if (!codexHome) {
    configError = "CODEX_HOME, HOME, and USERPROFILE are unset";
  } else {
    try {
      config = table(Bun.TOML.parse(readFileSync(join(codexHome, "config.toml"), "utf8")));
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error);
    }
  }

  const candidates = chatGptCandidates();
  const verifiedHost = candidates.find((path) => isOpenAiSignature(signature(path), CHATGPT_BUNDLE_ID)) ?? null;
  const observedHost = verifiedHost ?? candidates[0] ?? null;
  const hostVersion = observedHost
    ? plistValue(join(observedHost, "Contents", "Info.plist"), "CFBundleShortVersionString")
    : null;
  const node = table(table(config.mcp_servers).node_repl);
  const nodeEnv = table(node.env);
  const shellPolicy = table(table(config.shell_environment_policy).set);
  const chromeMcp = stdioServer("node_repl", node, shellPolicy);
  const computerBundle = codexHome ? bundledPlugin(codexHome, "computer-use") : null;
  const computerLauncher = computerBundle ? join(computerBundle.root, "bin", "computer-use-client-launcher") : null;
  const computerMcp = codexHome && isFile(computerLauncher) ? {
    name: "codetwo-openai-computer-use",
    command: computerLauncher,
    args: ["mcp"],
    env: [{ name: "CODEX_HOME", value: codexHome }],
    cwd: computerBundle!.root,
  } satisfies AcpMcpServer : null;
  const sitesBundle = codexHome ? bundledPlugin(codexHome, "sites") : null;
  const cuaPath = string(nodeEnv.SKY_CUA_SERVICE_PATH);
  const computerConfigured = dataDir
    ? loadConfiguredComputerUse(dataDir)
    : { bridges: [], selections: {}, backends: [cuaDriverOption()], errors: [] };
  const browserConfigured = dataDir
    ? loadConfiguredBrowserUse(dataDir)
    : { bridges: [], selections: {}, backends: [], errors: [] };
  const browserEnabled = pluginEnabled(config, "browser@openai-bundled");
  const chromeEnabled = pluginEnabled(config, "chrome@openai-bundled");
  const browserBackends = (string(nodeEnv.BROWSER_USE_AVAILABLE_BACKENDS) ?? "")
    .split(",")
    .map((backend) => backend.trim())
    .filter(Boolean);
  const openAiBrowserAvailable = observedHost !== null
    && verifiedHost !== null
    && chromeMcp !== null
    && ((browserEnabled && browserBackends.includes("iab"))
      || (chromeEnabled && browserBackends.includes("chrome")));
  const openAiBrowserOption: BrowserUseBackendOption = {
    id: OPENAI_BROWSER_BACKEND,
    displayName: "OpenAI Browser / Chrome",
    available: openAiBrowserAvailable,
    reason: openAiBrowserAvailable
      ? "The signed Codex-native OpenAI Browser runtime is available. Connectivity is verified on the first real call."
      : "Enable the OpenAI Browser or Chrome plugin and its node_repl runtime, then restart C2.",
    providers: ["codex"],
    excludeProviders: [],
  };

  return {
    hostPresent: observedHost !== null,
    hostVerified: verifiedHost !== null,
    hostVersion,
    computerEnabled: pluginEnabled(config, "computer-use@openai-bundled"),
    computerVersion: computerBundle?.version ?? null,
    computerMcp,
    cuaVerified: isOpenAiSignature(signature(cuaPath), CUA_BUNDLE_ID),
    browserEnabled,
    chromeEnabled,
    chromeMcp,
    browserBackends,
    sitesEnabled: pluginEnabled(config, "sites@openai-bundled"),
    sitesVersion: sitesBundle?.version ?? null,
    configError,
    configuredComputerUse: computerConfigured.bridges,
    computerUseSelections: computerConfigured.selections,
    computerUseBackends: computerConfigured.backends,
    hostToolsConfigErrors: computerConfigured.errors,
    configuredBrowserUse: browserConfigured.bridges,
    browserUseSelections: browserConfigured.selections,
    browserUseBackends: [openAiBrowserOption, ...browserConfigured.backends],
    browserUseConfigErrors: browserConfigured.errors,
  };
}

export function projectProviderToolset(evidence: HostToolEvidence, providerId: string): ProviderToolset {
  return new ToolBroker().resolve({ providerId, context: { evidence } });
}

export function withProviderToolInstructions(blocks: unknown[], instructions: string[]): unknown[] {
  if (instructions.length === 0) return blocks;
  return [
    { type: "text", text: `[C2 host tools]\n${instructions.join("\n")}` },
    ...blocks,
  ];
}

const RICH_RESPONSE_INSTRUCTIONS = `[C2 rich response rendering]
Use rich output only when it makes the answer materially clearer.
- For a compact inline chart, emit a fenced \`chart\` JSON block with exactly: {"type":"line"|"bar","title":"…","xLabel":"…","yLabel":"…","labels":["…"],"series":[{"name":"…","values":[0]}]}. Labels and values must have equal lengths; use finite numbers only.
- When the visualize skill creates an HTML fragment, preserve its final reference exactly as: visualize{"path":"/absolute/path.html","mode":"wide","title":"…"}. Do not paste the fragment into the answer.`;

export function withRichResponseInstructions(blocks: unknown[]): unknown[] {
  return [{ type: "text", text: RICH_RESPONSE_INSTRUCTIONS }, ...blocks];
}
