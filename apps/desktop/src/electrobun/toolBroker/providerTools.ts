import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";

import {
  BROWSER_USE_AUTOMATIC,
  BROWSER_USE_DISABLED,
  COMPUTER_USE_AUTOMATIC,
  COMPUTER_USE_DISABLED,
  HOST_TOOLS_CONFIG_FILE,
  JsonSelectionStore,
  OPENAI_BROWSER_BACKEND,
  ToolBroker,
} from "../../../../../packages/tool-broker/src";
import type {
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

const openaiTeamId = "2DC432GLL2";
const chatgptBundleId = "com.openai.codex";
const cuaBundleId = "com.openai.sky.CUAService";

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
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Table)
    : {};
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function namedValues(value: unknown): { name: string; value: string }[] {
  return Object.entries(table(value)).flatMap(([name, candidate]) =>
    typeof candidate === "string" ? [{ name, value: candidate }] : []
  );
}

function isFile(path: string | null): path is string {
  if (path == null || path === "") {
    return false;
  }
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function run(command: string[]): {
  success: boolean;
  stdout: string;
  stderr: string;
} {
  try {
    const result = Bun.spawnSync(command, { stderr: "pipe", stdout: "pipe" });
    return {
      stderr: result.stderr.toString(),
      stdout: result.stdout.toString(),
      success: result.exitCode === 0,
    };
  } catch {
    return { stderr: "", stdout: "", success: false };
  }
}

function lineValue(text: string, prefix: string): string | null {
  for (const line of text.split("\n")) {
    if (line.startsWith(prefix)) {
      return string(line.slice(prefix.length).trim());
    }
  }
  return null;
}

function signature(path: string | null): SignatureInfo {
  if (
    path == null ||
    path === "" ||
    !existsSync(path) ||
    process.platform !== "darwin"
  ) {
    return { identifier: null, teamId: null, valid: false };
  }
  const isVerified = run([
    "/usr/bin/codesign",
    "--verify",
    "--deep",
    "--strict",
    path,
  ]).success;
  const details = run(["/usr/bin/codesign", "-dv", "--verbose=4", path]);
  return {
    identifier: lineValue(details.stderr, "Identifier="),
    teamId: lineValue(details.stderr, "TeamIdentifier="),
    valid: isVerified,
  };
}

function isOpenAiSignature(info: SignatureInfo, identifier: string): boolean {
  return (
    info.valid && info.identifier === identifier && info.teamId === openaiTeamId
  );
}

function plistValue(path: string, key: string): string | null {
  const result = run(["/usr/libexec/PlistBuddy", "-c", `Print :${key}`, path]);
  return result.success ? string(result.stdout.trim()) : null;
}

function chatGptCandidates(): string[] {
  if (process.platform !== "darwin") {
    return [];
  }
  const candidates = new Set<string>();
  candidates.add("/Applications/ChatGPT.app");
  const search = run([
    "/usr/bin/mdfind",
    "kMDItemCFBundleIdentifier == 'com.openai.codex'",
  ]);
  for (const path of search.stdout.split("\n")) {
    if (path.endsWith(".app")) {
      candidates.add(path);
    }
  }
  return [...candidates].filter(existsSync);
}

function versionKey(version: string): number[] {
  return version.split(/\D+/u).filter(Boolean).map(Number);
}

function compareVersions(left: string, right: string): number {
  const a = versionKey(left);
  const b = versionKey(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
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
  return (
    entries
      .flatMap((entry): PluginBundle[] => {
        const root = join(directory, entry);
        try {
          const manifest = JSON.parse(
            readFileSync(join(root, ".codex-plugin", "plugin.json"), "utf8")
          ) as Table;
          const version = string(manifest.version);
          return manifest.name === name && version != null && version !== ""
            ? [{ root, version }]
            : [];
        } catch {
          return [];
        }
      })
      .sort((left, right) => compareVersions(right.version, left.version))[0] ??
    null
  );
}

function pluginEnabled(config: Table, name: string): boolean {
  return table(table(config.plugins)[name]).enabled === true;
}

function browserAccessBlockerMcp(): AcpStdioMcpServer {
  const isCompiled = /^codetwo-tool-broker(?:\.exe)?$/iu.test(
    basename(process.execPath)
  );
  return {
    args: isCompiled
      ? ["--empty-mcp"]
      : [join(import.meta.dir, "..", "toolBrokerRpc.ts"), "--empty-mcp"],
    command: process.execPath,
    env: [],
    name: "node_repl",
  };
}

export function stdioServer(
  name: string,
  config: Table,
  safeInheritedEnvironment: Table = {}
): AcpStdioMcpServer | null {
  const command = string(config.command);
  if (!isFile(command)) {
    return null;
  }
  const env = Object.entries(table(config.env)).flatMap(([key, value]) => {
    const resolved = string(value);
    return resolved != null && resolved !== ""
      ? [{ name: key, value: resolved }]
      : [];
  });
  const trustedHashes = string(
    safeInheritedEnvironment.NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S
  );
  if (
    trustedHashes != null &&
    trustedHashes !== "" &&
    !env.some(
      (entry) => entry.name === "NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S"
    )
  ) {
    env.push({
      name: "NODE_REPL_TRUSTED_BROWSER_CLIENT_SHA256S",
      value: trustedHashes,
    });
  }
  const cwd = string(config.cwd);
  return {
    args: stringArray(config.args),
    command,
    env,
    name,
    ...(cwd != null && cwd !== "" ? { cwd } : {}),
  };
}

function resolveConfiguredCommand(
  command: string,
  dataDirectory: string
): string | null {
  if (command.includes("/") || command.includes("\\")) {
    const path = isAbsolute(command) ? command : join(dataDirectory, command);
    return isFile(path) ? path : null;
  }
  return which(command);
}

function configuredServer(
  id: string,
  value: unknown,
  dataDirectory: string,
  kind = "computer-use"
): AcpMcpServer {
  const server = table(value);
  const name = string(server.name) ?? `${kind}-${id}`;
  const transport = string(server.type) ?? "stdio";
  if (transport === "stdio") {
    const command = string(server.command);
    if (command == null || command === "") {
      throw new Error(
        `${kind} backend ${JSON.stringify(id)} is missing server.command`
      );
    }
    const executable = resolveConfiguredCommand(command, dataDirectory);
    if (executable == null || executable === "") {
      throw new Error(
        `${kind} backend ${JSON.stringify(id)} command ${JSON.stringify(command)} was not found`
      );
    }
    const cwd = string(server.cwd);
    return {
      args: stringArray(server.args),
      command: executable,
      env: namedValues(server.env),
      name,
      ...(cwd != null && cwd !== "" ? { cwd } : {}),
    };
  }
  if (
    transport === "http" ||
    transport === "streamable-http" ||
    transport === "sse"
  ) {
    const url = string(server.url);
    if (
      url == null ||
      url === "" ||
      (!url.startsWith("http://") && !url.startsWith("https://"))
    ) {
      throw new Error(
        `${kind} backend ${JSON.stringify(id)} needs an http(s) server.url`
      );
    }
    return {
      headers: namedValues(server.headers),
      name,
      type: transport === "sse" ? "sse" : "http",
      url,
    };
  }
  throw new Error(
    `${kind} backend ${JSON.stringify(id)} uses unsupported MCP transport ${JSON.stringify(transport)}`
  );
}

export function loadConfiguredComputerUse(dataDirectory: string): {
  bridges: ConfiguredComputerUseBridge[];
  selections: Record<string, string>;
  backends: ComputerUseBackendOption[];
  errors: string[];
} {
  const path = join(dataDirectory, HOST_TOOLS_CONFIG_FILE);
  if (!existsSync(path)) {
    return {
      backends: [cuaDriverOption()],
      bridges: [],
      errors: [],
      selections: {},
    };
  }
  let document: Table;
  try {
    document = table(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    return {
      backends: [cuaDriverOption()],
      bridges: [],
      errors: [error instanceof Error ? error.message : String(error)],
      selections: {},
    };
  }
  const persistedSelections = Object.fromEntries(
    Object.entries(table(document.computer_use_selection)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  const selections: Record<string, string> =
    typeof persistedSelections["*"] === "string"
      ? { "*": persistedSelections["*"] }
      : {};
  if (document.schema_version !== 1) {
    return {
      backends: [cuaDriverOption()],
      bridges: [],
      errors: [
        `schema ${JSON.stringify(document.schema_version)} is unsupported; expected 1`,
      ],
      selections,
    };
  }
  const entries = Array.isArray(document.computer_use)
    ? document.computer_use
    : [];
  const bridges: ConfiguredComputerUseBridge[] = [];
  const backends: ComputerUseBackendOption[] = [];
  const errors: string[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  const selectedIds = new Set(
    Object.values(selections).filter((selection) => {
      return (
        selection !== COMPUTER_USE_AUTOMATIC &&
        selection !== COMPUTER_USE_DISABLED
      );
    })
  );
  for (const candidate of entries) {
    const entry = table(candidate);
    const id = string(entry.id);
    const isActive =
      entry.enabled === true || (id !== null && selectedIds.has(id));
    if (id == null || id === "" || !/^[A-Za-z0-9_.-]+$/u.test(id)) {
      const error = `invalid computer-use backend id ${JSON.stringify(entry.id)}`;
      backends.push({
        available: false,
        displayName: string(entry.display_name) ?? "Invalid backend",
        excludeProviders: stringArray(entry.exclude_providers),
        id: id ?? String(entry.id ?? "invalid"),
        providers: stringArray(entry.providers),
        reason: error,
      });
      if (isActive) {
        errors.push(error);
      }
      continue;
    }
    if (ids.has(id)) {
      const error = `duplicate computer-use backend id ${JSON.stringify(id)}`;
      backends.push({
        available: false,
        displayName: string(entry.display_name) ?? id,
        excludeProviders: stringArray(entry.exclude_providers),
        id,
        providers: stringArray(entry.providers),
        reason: error,
      });
      if (isActive) {
        errors.push(error);
      }
      continue;
    }
    ids.add(id);
    try {
      const server = configuredServer(id, entry.server, dataDirectory);
      const bridge = {
        displayName: string(entry.display_name) ?? id,
        enabled: entry.enabled === true,
        excludeProviders: stringArray(entry.exclude_providers),
        id,
        providers: stringArray(entry.providers),
        server,
        version: string(entry.version),
      } satisfies ConfiguredComputerUseBridge;
      backends.push({
        available: true,
        displayName: bridge.displayName,
        excludeProviders: bridge.excludeProviders,
        id,
        providers: bridge.providers,
        reason: null,
      });
      if (isActive && names.has(server.name)) {
        errors.push(
          `duplicate computer-use MCP server name ${JSON.stringify(server.name)}`
        );
        continue;
      }
      if (isActive) {
        names.add(server.name);
      }
      bridges.push(bridge);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      backends.push({
        available: false,
        displayName: string(entry.display_name) ?? id,
        excludeProviders: stringArray(entry.exclude_providers),
        id,
        providers: stringArray(entry.providers),
        reason: message,
      });
      if (isActive) {
        errors.push(message);
      }
    }
  }

  if (!ids.has("cua")) {
    const option = cuaDriverOption();
    backends.push(option);
    if (option.available) {
      bridges.push(cuaDriverBridge());
    } else if (
      selectedIds.has("cua") &&
      option.reason != null &&
      option.reason !== ""
    ) {
      errors.push(option.reason);
    }
  }
  for (const selection of selectedIds) {
    if (!backends.some((backend) => backend.id === selection)) {
      errors.push(
        `computer-use selection references unknown backend ${JSON.stringify(selection)}`
      );
    }
  }
  return {
    backends,
    bridges: errors.length === 0 ? bridges : [],
    errors,
    selections,
  };
}

export function loadConfiguredBrowserUse(dataDirectory: string): {
  accessEnabled: boolean;
  bridges: ConfiguredBrowserUseBridge[];
  selections: Record<string, string>;
  backends: BrowserUseBackendOption[];
  errors: string[];
} {
  const path = join(dataDirectory, HOST_TOOLS_CONFIG_FILE);
  if (!existsSync(path)) {
    return {
      accessEnabled: true,
      backends: [],
      bridges: [],
      errors: [],
      selections: {},
    };
  }

  let document: Table;
  try {
    document = table(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    return {
      accessEnabled: false,
      backends: [],
      bridges: [],
      errors: [error instanceof Error ? error.message : String(error)],
      selections: {},
    };
  }
  const persistedSelections = Object.fromEntries(
    Object.entries(table(document.browser_use_selection)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  const selections: Record<string, string> =
    typeof persistedSelections["*"] === "string"
      ? { "*": persistedSelections["*"] }
      : {};
  if (document.schema_version !== 1) {
    return {
      accessEnabled: false,
      backends: [],
      bridges: [],
      errors: [
        `schema ${JSON.stringify(document.schema_version)} is unsupported; expected 1`,
      ],
      selections,
    };
  }

  const errors: string[] = [];
  const isAccessEnabled =
    document.agent_browser_access === undefined
      ? true
      : typeof document.agent_browser_access === "boolean"
        ? document.agent_browser_access
        : false;
  if (
    document.agent_browser_access !== undefined &&
    typeof document.agent_browser_access !== "boolean"
  ) {
    errors.push("agent_browser_access must be a boolean");
  }
  const entries = Array.isArray(document.browser_use)
    ? document.browser_use
    : [];
  const bridges: ConfiguredBrowserUseBridge[] = [];
  const backends: BrowserUseBackendOption[] = [];
  const names = new Set<string>();
  const ids = new Set<string>([OPENAI_BROWSER_BACKEND]);
  const selectedIds = new Set(
    Object.values(selections).filter((selection) => {
      return (
        selection !== BROWSER_USE_AUTOMATIC &&
        selection !== BROWSER_USE_DISABLED &&
        selection !== OPENAI_BROWSER_BACKEND
      );
    })
  );
  for (const candidate of entries) {
    const entry = table(candidate);
    const id = string(entry.id);
    const isActive =
      entry.enabled === true || (id !== null && selectedIds.has(id));
    if (id == null || id === "" || !/^[A-Za-z0-9_.-]+$/u.test(id)) {
      const error = `invalid browser-use backend id ${JSON.stringify(entry.id)}`;
      backends.push({
        available: false,
        displayName: string(entry.display_name) ?? "Invalid backend",
        excludeProviders: stringArray(entry.exclude_providers),
        id: id ?? String(entry.id ?? "invalid"),
        providers: stringArray(entry.providers),
        reason: error,
      });
      if (isActive) {
        errors.push(error);
      }
      continue;
    }
    if (ids.has(id)) {
      const error =
        id === OPENAI_BROWSER_BACKEND
          ? `browser-use backend id ${JSON.stringify(id)} is reserved`
          : `duplicate browser-use backend id ${JSON.stringify(id)}`;
      backends.push({
        available: false,
        displayName: string(entry.display_name) ?? id,
        excludeProviders: stringArray(entry.exclude_providers),
        id,
        providers: stringArray(entry.providers),
        reason: error,
      });
      if (isActive) {
        errors.push(error);
      }
      continue;
    }
    ids.add(id);
    try {
      const server = configuredServer(
        id,
        entry.server,
        dataDirectory,
        "browser-use"
      );
      const bridge = {
        displayName: string(entry.display_name) ?? id,
        enabled: entry.enabled === true,
        excludeProviders: stringArray(entry.exclude_providers),
        id,
        providers: stringArray(entry.providers),
        server,
        version: string(entry.version),
      } satisfies ConfiguredBrowserUseBridge;
      backends.push({
        available: true,
        displayName: bridge.displayName,
        excludeProviders: bridge.excludeProviders,
        id,
        providers: bridge.providers,
        reason: null,
      });
      if (isActive && names.has(server.name)) {
        errors.push(
          `duplicate browser-use MCP server name ${JSON.stringify(server.name)}`
        );
        continue;
      }
      if (isActive) {
        names.add(server.name);
      }
      bridges.push(bridge);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      backends.push({
        available: false,
        displayName: string(entry.display_name) ?? id,
        excludeProviders: stringArray(entry.exclude_providers),
        id,
        providers: stringArray(entry.providers),
        reason: message,
      });
      if (isActive) {
        errors.push(message);
      }
    }
  }
  for (const selection of selectedIds) {
    if (!backends.some((backend) => backend.id === selection)) {
      errors.push(
        `browser-use selection references unknown backend ${JSON.stringify(selection)}`
      );
    }
  }
  return {
    accessEnabled: isAccessEnabled,
    backends,
    bridges: errors.length === 0 ? bridges : [],
    errors,
    selections,
  };
}

function cuaDriverOption(): ComputerUseBackendOption {
  const isAvailable = which("cua-driver") !== null;
  return {
    available: isAvailable,
    displayName: "Cua Driver",
    excludeProviders: [],
    id: "cua",
    providers: [],
    reason: isAvailable
      ? "cua-driver is available on PATH."
      : "Install cua-driver and make it available on PATH.",
  };
}

function cuaDriverBridge(): ConfiguredComputerUseBridge {
  return {
    displayName: "Cua Driver",
    enabled: false,
    excludeProviders: [],
    id: "cua",
    providers: [],
    server: {
      args: ["mcp"],
      command: which("cua-driver") ?? "cua-driver",
      env: [],
      name: "cua-driver",
    },
    version: null,
  };
}

export function computerUseSettings(
  evidence: HostToolEvidence
): ComputerUseSettings {
  return new ToolBroker().catalog({ evidence }).computerUse;
}

export function saveComputerUseSelection(
  dataDirectory: string,
  backendId: string,
  evidence: HostToolEvidence
): void {
  if (
    backendId !== COMPUTER_USE_AUTOMATIC &&
    backendId !== COMPUTER_USE_DISABLED
  ) {
    const backend = evidence.computerUseBackends.find(
      (candidate) => candidate.id === backendId
    );
    if (!backend) {
      throw new Error(
        `unknown computer-use backend ${JSON.stringify(backendId)}`
      );
    }
    if (!backend.available) {
      throw new Error(
        backend.reason ??
          `computer-use backend ${JSON.stringify(backendId)} is unavailable`
      );
    }
  }

  new JsonSelectionStore(dataDirectory).setGlobal("computer_use", backendId);
}

export function browserUseSettings(
  evidence: HostToolEvidence
): BrowserUseSettings {
  return new ToolBroker().catalog({ evidence }).browserUse;
}

export function saveBrowserUseSelection(
  dataDirectory: string,
  backendId: string,
  evidence: HostToolEvidence
): void {
  if (
    backendId !== BROWSER_USE_AUTOMATIC &&
    backendId !== BROWSER_USE_DISABLED
  ) {
    const backend = evidence.browserUseBackends.find(
      (candidate) => candidate.id === backendId
    );
    if (!backend) {
      throw new Error(
        `unknown browser-use backend ${JSON.stringify(backendId)}`
      );
    }
    if (!backend.available) {
      throw new Error(
        backend.reason ??
          `browser-use backend ${JSON.stringify(backendId)} is unavailable`
      );
    }
  }

  new JsonSelectionStore(dataDirectory).setGlobal("browser_use", backendId);
}

export function saveAgentBrowserAccess(
  dataDirectory: string,
  isEnabled: boolean
): void {
  new JsonSelectionStore(dataDirectory).setAgentBrowserAccess(isEnabled);
}

export function detectHostToolEvidence(
  environment: NodeJS.ProcessEnv = process.env,
  dataDirectory?: string
): HostToolEvidence {
  const userHome = string(environment.HOME) ?? string(environment.USERPROFILE);
  const codexHome =
    string(environment.CODEX_HOME) ??
    (userHome != null && userHome !== "" ? join(userHome, ".codex") : null);
  let config: Table = {};
  let configError: string | null = null;
  if (codexHome == null || codexHome === "") {
    configError = "CODEX_HOME, HOME, and USERPROFILE are unset";
  } else {
    try {
      config = table(
        Bun.TOML.parse(readFileSync(join(codexHome, "config.toml"), "utf8"))
      );
    } catch (error) {
      configError = error instanceof Error ? error.message : String(error);
    }
  }

  const candidates = chatGptCandidates();
  const verifiedHost =
    candidates.find((path) =>
      isOpenAiSignature(signature(path), chatgptBundleId)
    ) ?? null;
  const observedHost = verifiedHost ?? candidates[0] ?? null;
  const hostVersion = observedHost
    ? plistValue(
        join(observedHost, "Contents", "Info.plist"),
        "CFBundleShortVersionString"
      )
    : null;
  const node = table(table(config.mcp_servers).node_repl);
  const nodeEnvironment = table(node.env);
  const shellPolicy = table(table(config.shell_environment_policy).set);
  const chromeMcp = stdioServer("node_repl", node, shellPolicy);
  const computerBundle =
    codexHome != null && codexHome !== ""
      ? bundledPlugin(codexHome, "computer-use")
      : null;
  const computerLauncher = computerBundle
    ? join(computerBundle.root, "bin", "computer-use-client-launcher")
    : null;
  const computerMcp =
    codexHome != null && codexHome !== "" && isFile(computerLauncher)
      ? ({
          args: ["mcp"],
          command: computerLauncher,
          cwd: computerBundle!.root,
          env: [{ name: "CODEX_HOME", value: codexHome }],
          name: "codetwo-openai-computer-use",
        } satisfies AcpMcpServer)
      : null;
  const sitesBundle =
    codexHome != null && codexHome !== ""
      ? bundledPlugin(codexHome, "sites")
      : null;
  const cuaPath = string(nodeEnvironment.SKY_CUA_SERVICE_PATH);
  const computerConfigured =
    dataDirectory != null && dataDirectory !== ""
      ? loadConfiguredComputerUse(dataDirectory)
      : {
          backends: [cuaDriverOption()],
          bridges: [],
          errors: [],
          selections: {},
        };
  const browserConfigured =
    dataDirectory != null && dataDirectory !== ""
      ? loadConfiguredBrowserUse(dataDirectory)
      : {
          accessEnabled: true,
          backends: [],
          bridges: [],
          errors: [],
          selections: {},
        };
  const isBrowserEnabled = pluginEnabled(config, "browser@openai-bundled");
  const isChromeEnabled = pluginEnabled(config, "chrome@openai-bundled");
  const browserBackends = (
    string(nodeEnvironment.BROWSER_USE_AVAILABLE_BACKENDS) ?? ""
  )
    .split(",")
    .map((backend) => backend.trim())
    .filter(Boolean);
  const isOpenAiBrowserAvailable =
    observedHost !== null &&
    verifiedHost !== null &&
    chromeMcp !== null &&
    ((isBrowserEnabled && browserBackends.includes("iab")) ||
      (isChromeEnabled && browserBackends.includes("chrome")));
  const openAiBrowserOption: BrowserUseBackendOption = {
    available: isOpenAiBrowserAvailable,
    displayName: "OpenAI Browser / Chrome",
    excludeProviders: [],
    id: OPENAI_BROWSER_BACKEND,
    providers: ["codex"],
    reason: isOpenAiBrowserAvailable
      ? "The signed Codex-native OpenAI Browser runtime is available. Connectivity is verified on the first real call."
      : "Enable the OpenAI Browser or Chrome plugin and its node_repl runtime, then restart C2.",
  };

  return {
    agentBrowserAccessEnabled: browserConfigured.accessEnabled,
    browserAccessBlockerMcp: browserAccessBlockerMcp(),
    browserBackends,
    browserEnabled: isBrowserEnabled,
    browserUseBackends: [openAiBrowserOption, ...browserConfigured.backends],
    browserUseConfigErrors: browserConfigured.errors,
    browserUseSelections: browserConfigured.selections,
    chromeEnabled: isChromeEnabled,
    chromeMcp,
    computerEnabled: pluginEnabled(config, "computer-use@openai-bundled"),
    computerMcp,
    computerUseBackends: computerConfigured.backends,
    computerUseSelections: computerConfigured.selections,
    computerVersion: computerBundle?.version ?? null,
    configError,
    configuredBrowserUse: browserConfigured.bridges,
    configuredComputerUse: computerConfigured.bridges,
    cuaVerified: isOpenAiSignature(signature(cuaPath), cuaBundleId),
    hostPresent: observedHost !== null,
    hostToolsConfigErrors: computerConfigured.errors,
    hostVerified: verifiedHost !== null,
    hostVersion,
    sitesEnabled: pluginEnabled(config, "sites@openai-bundled"),
    sitesVersion: sitesBundle?.version ?? null,
  };
}

export function projectProviderToolset(
  evidence: HostToolEvidence,
  providerId: string
): ProviderToolset {
  return new ToolBroker().resolve({ context: { evidence }, providerId });
}

export function withProviderToolInstructions(
  blocks: unknown[],
  instructions: string[]
): unknown[] {
  if (instructions.length === 0) {
    return blocks;
  }
  return [
    { text: `[C2 host tools]\n${instructions.join("\n")}`, type: "text" },
    ...blocks,
  ];
}

const richResponseInstructions = `[C2 rich response rendering]
Use rich output only when it makes the answer materially clearer.
- For a compact inline chart, emit a fenced \`chart\` JSON block with exactly: {"type":"line"|"bar","title":"…","xLabel":"…","yLabel":"…","labels":["…"],"series":[{"name":"…","values":[0]}]}. Labels and values must have equal lengths; use finite numbers only.
- When the visualize skill creates an HTML fragment, preserve its final reference exactly as: visualize{"path":"/absolute/path.html","mode":"wide","title":"…"}. Do not paste the fragment into the answer.`;

export function withRichResponseInstructions(blocks: unknown[]): unknown[] {
  return [{ text: richResponseInstructions, type: "text" }, ...blocks];
}
