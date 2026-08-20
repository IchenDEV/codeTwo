export type PluginManagerTab = "plugins" | "components" | "marketplace";

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
  | "disposed";

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
  affectedPlugins?: Array<{ id: string; name: string; desiredState?: PluginManagerDesiredState }>;
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
  managedInBundleTools: string;
  resetDefaults: string;
  restoredLastGood: string;
  safeMode: string;
  dependencies: string;
  missingDependencies: string;
  commands: string;
  services: string;
  activeResources: string;
  confirmTitle: string;
  confirm: string;
  cancel: string;
}

export interface PluginManagerPageProps {
  plugins: PluginManagerPlugin[];
  components: PluginManagerComponent[];
  marketplaceItems: PluginManagerMarketplaceItem[];
  scope: PluginManagerScope;
  projects?: PluginManagerProject[];
  initialTab?: PluginManagerTab;
  recovery?: PluginManagerRecovery;
  labels?: Partial<PluginManagerLabels>;
  onScopeChange: (scope: PluginManagerScope) => void;
  onPlanChange: (request: PluginManagerChangeRequest) => Promise<PluginManagerChangePlan>;
  onApplyChange: (plan: PluginManagerChangePlan) => Promise<void>;
  onSaveConfig: (request: PluginManagerConfigRequest) => Promise<void>;
  onInstallMarketplaceItem: (request: PluginManagerInstallRequest) => Promise<void>;
  onRefreshMarketplace?: () => Promise<void>;
  /** Compatibility tools for trust, uninstall, GitHub import, and local marketplace manifests. */
  onOpenBundleTools?: () => void;
  onResetPlugin?: (pluginId: string, scope: PluginManagerScope) => Promise<void>;
}
