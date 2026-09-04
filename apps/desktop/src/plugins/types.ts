import type { ReactNode } from "react";

export type PluginManagerTab =
  | "plugins"
  | "mcps"
  | "skills"
  | "hooks"
  | "marketplace";

export type PluginManagerSource = "builtin" | "host" | "bundle";

export type PluginManagerScopeKind = "user" | "project";

export type PluginManagerScope =
  | { kind: "user" }
  | { kind: "project"; projectPath: string };

export interface PluginManagerProject {
  path: string;
  label: string;
}

export type PluginManagerOverride = "inherit" | "enabled" | "disabled";

export type PluginManagerStatus =
  | "disabled"
  | "pending"
  | "loading"
  | "active"
  | "failed"
  | "disposed"
  | "requires_auth"
  | "unsupported";

export interface PluginManagerActiveResource {
  id: string;
  label: string;
  kind?: string;
}

/**
Evaluated state for the scope currently supplied to PluginManagerPage.
*/
export interface PluginManagerScopedState {
  effectiveEnabled: boolean;
  /**
  Present for a project scope. User-scoped entries use effectiveEnabled directly.
  */
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

export interface PluginManagerScaffold {
  id: string;
  name: string;
  description?: string | null;
  files: number;
}

/**
Installation and trust metadata for a plugin backed by an on-disk bundle.
*/
export interface PluginManagerBundle {
  id: string;
  repository?: string | null;
  standardVersion: string;
  trusted: boolean;
  enabled: boolean;
  requiresTrust: boolean;
  runtimeManaged: boolean;
  contributions: PluginManagerBundleContribution[];
  diagnostics: PluginManagerBundleDiagnostic[];
  scaffolds: PluginManagerScaffold[];
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
  /**
  JSON Schema. Simple object fields render as controls; other schemas use JSON.
  */
  configSchema?: unknown;
  configurable?: boolean;
  /**
  Present only for installed bundles; built-ins never receive installation controls.
  */
  bundle?: PluginManagerBundle;
}

export interface PluginManagerComponent {
  id: string;
  pluginId: string;
  pluginName: string;
  /**
  Managed plugin whose component policy controls this resource. Defaults to pluginId.
  */
  policyPluginId?: string;
  name: string;
  description?: string | null;
  kind: string;
  slot?: string | null;
  source: PluginManagerSource;
  sourceLabel?: string | null;
  supportedScopes: PluginManagerScopeKind[];
  /**
  False when the descriptor is visible here but its runtime has no component-policy seam.
  */
  manageable?: boolean;
  availability?: "ready" | "requires_trust" | "requires_auth" | "unsupported";
  required?: boolean;
  state: PluginManagerScopedState;
  /**
  Actions available for a skill shown in the unified component catalog.
  */
  skill?: {
    id: string;
    removable: boolean;
  };
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
  /**
  Present for bundles loaded from a local marketplace manifest.
  */
  marketplace?: {
    manifestPath: string;
    pluginName: string;
  };
}

export interface PluginManagerMarketplaceSource {
  id: string;
  name: string;
  description?: string | null;
  diagnostics: string[];
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
  /**
  Optional graph revision used by the host to reject stale confirmations.
  */
  graphRevision?: number;
  request: PluginManagerChangeRequest;
  summary: string;
  requiresConfirmation: boolean;
  affectedPlugins?: {
    id: string;
    name: string;
    desiredState?: PluginManagerDesiredState;
  }[];
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
  mcps: string;
  skills: string;
  hooks: string;
  marketplace: string;
  userScope: string;
  projectScope: (project: PluginManagerProject) => string;
  search: string;
  searchPlaceholder: (tab: PluginManagerTab) => string;
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
  newSkill: string;
  openMarketplace: string;
  use: string;
  applyScaffold: string;
  scaffoldFiles: (count: number) => string;
  installFromGithub: string;
  githubRepository: string;
  githubHint: string;
  closeInstaller: string;
  installingPlugin: string;
  bundleInstalled: (result: PluginManagerBundleInstallResult) => string;
  bundleManagement: string;
  bundleManagementUserOnly: string;
  reviewSource: string;
  trustRequired: string;
  trustBeforeEnabling: string;
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
  resourceList: (tab: "mcps" | "skills" | "hooks") => string;
  projectState: (name: string) => string;
  noDescription: string;
  configurationHint: string;
  plugin: string;
  source: string;
  identifier: string;
  definition: string;
  uiSlot: string;
  managedByPlugin: string;
  managePlugin: string;
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
    state: PluginManagerDesiredState
  ) => string;
  marketplaceInstalled: string;
  componentUninstalled: string;
  scaffoldApplied: (count: number) => string;
  settingsReset: string;
  bundleEnabled: (name: string, isEnabled: boolean) => string;
  bundleTrusted: (name: string, isTrusted: boolean) => string;
  bundleUninstalled: (name: string, isKeepData: boolean) => string;
  confirmTitle: string;
  confirm: string;
  cancel: string;
}

export interface PluginManagerPageProps {
  plugins: PluginManagerPlugin[];
  components: PluginManagerComponent[];
  marketplaceItems: PluginManagerMarketplaceItem[];
  marketplaceSources?: PluginManagerMarketplaceSource[];
  headerLeadingAction?: ReactNode;
  scope: PluginManagerScope;
  projects?: PluginManagerProject[];
  initialTab?: PluginManagerTab;
  initialPluginId?: string | null;
  pluginDetailsExtension?: {
    pluginId: string;
    content: ReactNode;
  } | null;
  recovery?: PluginManagerRecovery;
  labels?: Partial<PluginManagerLabels>;
  onScopeChange: (scope: PluginManagerScope) => void;
  onPlanChange: (
    request: PluginManagerChangeRequest
  ) => Promise<PluginManagerChangePlan>;
  onApplyChange: (plan: PluginManagerChangePlan) => Promise<void>;
  onSaveConfig: (request: PluginManagerConfigRequest) => Promise<void>;
  onInstallMarketplaceItem: (
    request: PluginManagerInstallRequest
  ) => Promise<void>;
  onRefreshMarketplace?: () => Promise<void>;
  onOpenMarketplace?: () => Promise<void>;
  onImportGithub?: (repo: string) => Promise<PluginManagerBundleInstallResult>;
  onSetBundleEnabled?: (pluginId: string, isEnabled: boolean) => Promise<void>;
  onSetBundleTrusted?: (pluginId: string, isTrusted: boolean) => Promise<void>;
  onUninstallBundle?: (pluginId: string, isKeepData: boolean) => Promise<void>;
  onApplyScaffold?: (
    pluginId: string,
    scaffoldId: string
  ) => Promise<{ files: number }>;
  onResetPlugin?: (
    pluginId: string,
    scope: PluginManagerScope
  ) => Promise<void>;
}
