export type ProviderCapabilityId =
  | "image_generation"
  | "computer_use"
  | "chrome_browser"
  | "codetwo_browser"
  | "sites";

export type CapabilityState = "ready" | "unverified" | "unavailable";

export interface ProviderCapability {
  id: ProviderCapabilityId;
  state: CapabilityState;
  version: string | null;
  experimental: boolean;
  reason: string;
  fix: string | null;
}

export interface AcpStdioMcpServer {
  name: string;
  command: string;
  args: string[];
  env: { name: string; value: string }[];
  cwd?: string;
}

export interface AcpRemoteMcpServer {
  name: string;
  type: "http" | "sse";
  url: string;
  headers: { name: string; value: string }[];
}

export type AcpMcpServer = AcpStdioMcpServer | AcpRemoteMcpServer;

export interface ConfiguredToolBridge {
  id: string;
  enabled: boolean;
  displayName: string;
  version: string | null;
  providers: string[];
  excludeProviders: string[];
  server: AcpMcpServer;
}

export type ConfiguredComputerUseBridge = ConfiguredToolBridge;
export type ConfiguredBrowserUseBridge = ConfiguredToolBridge;

export interface ToolBackendOption {
  id: string;
  displayName: string;
  available: boolean;
  reason: string | null;
  providers: string[];
  excludeProviders: string[];
}

export type ComputerUseBackendOption = ToolBackendOption;
export type BrowserUseBackendOption = ToolBackendOption;

export interface ToolSettings {
  selections: Record<string, string>;
  backends: ToolBackendOption[];
  errors: string[];
}

export type ComputerUseSettings = ToolSettings;
export type BrowserUseSettings = ToolSettings;

/** Evidence is produced by adapters. It contains observations, never routing policy. */
export interface HostToolEvidence {
  hostPresent: boolean;
  hostVerified: boolean;
  hostVersion: string | null;
  computerEnabled: boolean;
  computerVersion: string | null;
  computerMcp: AcpMcpServer | null;
  cuaVerified: boolean;
  browserEnabled: boolean;
  chromeEnabled: boolean;
  /** Private Codex adapter evidence. The broker must never export this server. */
  chromeMcp: AcpMcpServer | null;
  browserBackends: string[];
  sitesEnabled: boolean;
  sitesVersion: string | null;
  configError: string | null;
  configuredComputerUse: ConfiguredComputerUseBridge[];
  computerUseSelections: Record<string, string>;
  computerUseBackends: ComputerUseBackendOption[];
  hostToolsConfigErrors: string[];
  configuredBrowserUse: ConfiguredBrowserUseBridge[];
  browserUseSelections: Record<string, string>;
  browserUseBackends: BrowserUseBackendOption[];
  browserUseConfigErrors: string[];
}

export interface BrokerContext {
  evidence: HostToolEvidence;
}

export interface ResolveRequest {
  providerId: string;
  context: BrokerContext;
}

/** The immutable output consumed by every host adapter. */
export interface ToolPlan {
  capabilities: ProviderCapability[];
  nativeCapabilities: ProviderCapabilityId[];
  mcpServers: AcpMcpServer[];
  instructions: string[];
}

export type ProviderToolset = ToolPlan;

export interface ToolCatalog {
  computerUse: ComputerUseSettings;
  browserUse: BrowserUseSettings;
}

export interface ToolBrokerPort {
  catalog(context: BrokerContext): ToolCatalog;
  resolve(request: ResolveRequest): ToolPlan;
}

export const HOST_TOOLS_CONFIG_FILE = "host-tools.json";
export const COMPUTER_USE_AUTOMATIC = "automatic";
export const COMPUTER_USE_DISABLED = "disabled";
export const BROWSER_USE_AUTOMATIC = "automatic";
export const BROWSER_USE_DISABLED = "disabled";
export const OPENAI_BROWSER_BACKEND = "openai-browser";
