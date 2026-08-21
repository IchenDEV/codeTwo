import type { ReactNode } from "react";

export type PluginManagerTab = "plugins" | "components" | "marketplace";

export type PluginManagerSource = "builtin" | "host" | "bundle";

export type PluginManagerScopeKind = "user" | "project";

export type PluginManagerScope =
  { kind: "user" } | { kind: "project"; projectPath: string };

export interface PluginManagerProject {
  path: string;
  label: string;
}

export type PluginManagerOverride = "inherit" | "enabled" | "disabled";

export type PluginManagerStatus =
  "disabled" | "pending" | "loading" | "active" | "failed" | "disposed";

export interface PluginManagerActiveResource {
  id: string;
  label: string;
  kind?: string;
}

/** Evaluated state for the scope currently supplied to PluginManagerPage. */
export interface PluginManagerScopedState {
  effectiveEnabled: boolean;
  /** Present for a project scope. User-scoped entries use effectiveEnabled directly. */
  override?: PluginManagerOverride;
  status: PluginManagerStatus;
  missingDependencies?: string[];
  error?: string | null;
  activeResources?: PluginManagerActiveResource[];
  config?: unknown;
}

export interface PluginManagerBundleDiagnostic {
  level: "warning" | "error";
  message: string;
  component?: string | null;
}

export interface PluginManagerBundleContribution {
  id: string;
  label: string;
  count: number;
}

/** Installation and trust metadata for a plugin backed by an on-disk bundle. */
export interface PluginManagerBundle {
  id: string;
  repository?: string | null;
  standards: string[];
  trusted: boolean;
  enabled: boolean;
  requiresTrust: boolean;
  runtimeManaged: boolean;
  contributions: PluginManagerBundleContribution[];
  diagnostics: PluginManagerBundleDiagnostic[];
}

export interface PluginManagerPlugin {
  id: string;
  name: string;
  description?: string | null;
  version?: string | null;
  author?: string | null;
  source: PluginManagerSource;
  sourceLabel?: string | null;
  category?: string | null;
  supportedScopes: PluginManagerScopeKind[];
  required?: boolean;
  dependencies?: string[];
  commands?: string[];
  services?: string[];
  componentIds?: string[];
  state: PluginManagerScopedState;
  /** JSON Schema. Simple object fields render as controls; other schemas use JSON. */
  configSchema?: unknown;
  configurable?: boolean;
  /** Present only for installed bundles; built-ins never receive installation controls. */
  bundle?: PluginManagerBundle;
}

export interface PluginManagerComponent {
  id: string;
  pluginId: string;
  pluginName: string;
  name: string;
  description?: string | null;
  kind: string;
  slot?: string | null;
  source: PluginManagerSource;
  sourceLabel?: string | null;
  supportedScopes: PluginManagerScopeKind[];
  /** False when the descriptor is visible here but its runtime has no component-policy seam. */
  manageable?: boolean;
  required?: boolean;
  state: PluginManagerScopedState;
}

export interface PluginManagerMarketplaceItem {
  id: string;
  name: string;
  description?: string | null;
  version?: string | null;
  author?: string | null;
  kind: string;
  sourceLabel?: string | null;
  installed: boolean;
  installable: boolean;
  supportedScopes: PluginManagerScopeKind[];
  diagnostic?: string | null;
}

export type PluginManagerDesiredState = "inherit" | "enabled" | "disabled";

export interface PluginManagerChangeRequest {
  targetKind: "plugin" | "component";
  targetId: string;
  targetName: string;
  scope: PluginManagerScope;
  desiredState: PluginManagerDesiredState;
}

export interface PluginManagerChangePlan {
  confirmationId: string;
  /** Optional graph revision used by the host to reject stale confirmations. */
  graphRevision?: number;
  request: PluginManagerChangeRequest;
  summary: string;
  requiresConfirmation: boolean;
  affectedPlugins?: Array<{
    id: string;
    name: string;
    desiredState?: PluginManagerDesiredState;
  }>;
  activeResources?: PluginManagerActiveResource[];
  warnings?: string[];
}

export interface PluginManagerConfigRequest {
  pluginId: string;
  scope: PluginManagerScope;
  config: unknown;
}

export interface PluginManagerInstallRequest {
  itemId: string;
  scope: PluginManagerScope;
}

export interface PluginManagerBundleInstallResult {
  pluginId: string;
  name: string;
  version?: string | null;
}

export interface PluginManagerRecovery {
  kind: "normal" | "restored_last_good" | "safe_mode";
  error?: string;
}

export interface PluginManagerLabels {
  title: string;
  description: string;
  plugins: string;
  components: string;
  marketplace: string;
  userScope: string;
  projectScope: (project: PluginManagerProject) => string;
  search: string;
  noResults: string;
  enabled: string;
  disabled: string;
  inherit: string;
  required: string;
  userOnly: string;
  projectOnly: string;
  configuration: string;
  form: string;
  advancedJson: string;
  saveConfiguration: string;
  saving: string;
  install: string;
  installed: string;
  unavailable: string;
  refresh: string;
  bundleTools: string;
  advancedBundleTools: string;
  installFromGithub: string;
  githubRepository: string;
  githubHint: string;
  closeInstaller: string;
  installingPlugin: string;
  bundleInstalled: (result: PluginManagerBundleInstallResult) => string;
  managedInBundleTools: string;
  bundleManagement: string;
  bundleManagementUserOnly: string;
  trustRequired: string;
  trusted: string;
  notTrusted: string;
  trustPlugin: string;
  revokeTrust: string;
  contributions: string;
  diagnostics: string;
  uninstall: string;
  uninstallTitle: (pluginName: string) => string;
  uninstallDescription: string;
  keepPluginData: string;
  resetDefaults: string;
  restoredLastGood: string;
  safeMode: string;
  dependencies: string;
  missingDependencies: string;
  commands: string;
  services: string;
  activeResources: string;
  scope: string;
  pluginList: string;
  componentList: string;
  projectState: (name: string) => string;
  noDescription: string;
  configurationHint: string;
  plugin: string;
  source: string;
  uiSlot: string;
  affectedPlugins: string;
  missingCount: (count: number) => string;
  status: Record<PluginManagerStatus, string>;
  sourceNames: Record<PluginManagerSource, string>;
  contribution: (id: string, fallback: string) => string;
  componentKind: (kind: string) => string;
  installedBundle: string;
  dataOnly: string;
  invalidConfigurationObject: string;
  githubRepositoryRequired: string;
  changeApplied: (name: string, state: PluginManagerDesiredState) => string;
  changeSummary: (
    kind: "plugin" | "component",
    name: string,
    state: PluginManagerDesiredState,
  ) => string;
  marketplaceInstalled: string;
  settingsReset: string;
  bundleEnabled: (name: string, enabled: boolean) => string;
  bundleTrusted: (name: string, trusted: boolean) => string;
  bundleUninstalled: (name: string, keepData: boolean) => string;
  confirmTitle: string;
  confirm: string;
  cancel: string;
}

export interface PluginManagerPageProps {
  plugins: PluginManagerPlugin[];
  components: PluginManagerComponent[];
  marketplaceItems: PluginManagerMarketplaceItem[];
  headerLeadingAction?: ReactNode;
  scope: PluginManagerScope;
  projects?: PluginManagerProject[];
  initialTab?: PluginManagerTab;
  recovery?: PluginManagerRecovery;
  labels?: Partial<PluginManagerLabels>;
  onScopeChange: (scope: PluginManagerScope) => void;
  onPlanChange: (
    request: PluginManagerChangeRequest,
  ) => Promise<PluginManagerChangePlan>;
  onApplyChange: (plan: PluginManagerChangePlan) => Promise<void>;
  onSaveConfig: (request: PluginManagerConfigRequest) => Promise<void>;
  onInstallMarketplaceItem: (
    request: PluginManagerInstallRequest,
  ) => Promise<void>;
  onRefreshMarketplace?: () => Promise<void>;
  onImportGithub?: (
    repository: string,
  ) => Promise<PluginManagerBundleInstallResult>;
  onSetBundleEnabled?: (pluginId: string, enabled: boolean) => Promise<void>;
  onSetBundleTrusted?: (pluginId: string, trusted: boolean) => Promise<void>;
  onUninstallBundle?: (pluginId: string, keepData: boolean) => Promise<void>;
  /** Advanced compatibility tools for local marketplace manifests and scaffolds. */
  onOpenBundleTools?: () => void;
  onResetPlugin?: (
    pluginId: string,
    scope: PluginManagerScope,
  ) => Promise<void>;
}
