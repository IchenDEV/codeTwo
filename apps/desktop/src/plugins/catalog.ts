import type {
  ManagedPluginCatalog,
  ManagedPluginCatalogEntry,
  ManagedPluginOverride,
  ManagedPluginScope,
  MarketItem,
  PluginInfo,
  SkillInfo,
} from "../bridge";
import type {
  PluginManagerComponent,
  PluginManagerMarketplaceItem,
  PluginManagerPlugin,
  PluginManagerScope,
  PluginManagerScopedState,
  PluginManagerSource,
  PluginManagerStatus,
} from "./types";

export const BUILTIN_UI_COMPONENTS = [
  {
    id: "plugin-manager.page",
    pluginId: "kernel",
    name: "Plugin manager",
    description: "The required management plane used to recover and re-enable other features.",
    kind: "page",
    slot: "app.page",
    required: true,
  },
  {
    id: "automation.page",
    pluginId: "automation",
    name: "Automations",
    description: "Scheduled-work page and automation entry points.",
    kind: "page",
    slot: "app.page",
  },
  {
    id: "browser.dock",
    pluginId: "browser",
    name: "Browser dock",
    description: "Authenticated in-app browser surface and its dock opener.",
    kind: "dockSurface",
    slot: "dock.tabs",
  },
  {
    id: "terminal.dock",
    pluginId: "terminal",
    name: "Terminal dock",
    description: "Persistent terminal sessions in the side dock.",
    kind: "dockSurface",
    slot: "dock.tabs",
  },
  {
    id: "git.surface",
    pluginId: "git",
    name: "Source control",
    description: "Git dock, source-control dialog, and related commands.",
    kind: "dockSurface",
    slot: "dock.tabs",
  },
  {
    id: "files.surface",
    pluginId: "workspace",
    name: "Files",
    description: "Workspace file tree, viewer, and file browser.",
    kind: "dockSurface",
    slot: "dock.tabs",
  },
  {
    id: "search.modal",
    pluginId: "workspace-search",
    name: "Workspace search",
    description: "Project-wide content search and result opener.",
    kind: "modal",
    slot: "app.dialogs",
  },
  {
    id: "issues.modal",
    pluginId: "issues",
    name: "Issues",
    description: "GitHub and Linear issue browser and delegation flow.",
    kind: "modal",
    slot: "app.dialogs",
  },
  {
    id: "voice.composer",
    pluginId: "voice",
    name: "Voice input",
    description: "Composer dictation and structured voice input.",
    kind: "composerAction",
    slot: "composer.actions",
  },
  {
    id: "usage.settings",
    pluginId: "usage",
    name: "Usage",
    description: "Provider quota and usage settings surfaces.",
    kind: "settingsSection",
    slot: "settings.sections",
  },
  {
    id: "memory.settings",
    pluginId: "memory",
    name: "Memory",
    description: "Memory policy controls and receipt surfaces.",
    kind: "settingsSection",
    slot: "settings.sections",
  },
  {
    id: "scenes.surface",
    pluginId: "scenes",
    name: "Agent scenes",
    description: "Scene picker, studio, banners, and pipeline controls.",
    kind: "sessionSurface",
    slot: "session.chrome",
  },
  {
    id: "canvas.editor",
    pluginId: "canvas",
    name: "Canvas editor",
    description: "Structured visual canvas blocks. Component policy is separate from the Canvas safety feature gate; enabling this component does not open the production gate.",
    kind: "editorBlock",
    slot: "editor.blocks",
  },
  {
    id: "remote.modal",
    pluginId: "remote",
    name: "Remote control",
    description: "Remote-device pairing and connection management.",
    kind: "modal",
    slot: "app.dialogs",
  },
  {
    id: "lsp.runtime",
    pluginId: "lsp",
    name: "Language servers",
    description: "Project language-server discovery and lifecycle.",
    kind: "runtime",
    slot: "project.runtime",
  },
] as const;

export type BuiltinUiComponentId = (typeof BUILTIN_UI_COMPONENTS)[number]["id"];

const DISPLAY_NAMES: Record<string, string> = {
  "desktop-events": "Desktop events",
  "plugin-hub": "Plugin bundles",
  "scene-commands": "Scene commands",
  "scene-runtime": "Scene runtime",
  "workspace-search": "Workspace search",
  lsp: "Language servers",
};

export interface PluginManagerCatalogModel {
  plugins: PluginManagerPlugin[];
  components: PluginManagerComponent[];
  marketplaceItems: PluginManagerMarketplaceItem[];
}

export interface PluginManagerCatalogInput {
  catalog: ManagedPluginCatalog;
  /** Needed to resolve inherited project component state. Equal to catalog in user scope. */
  userCatalog?: ManagedPluginCatalog;
  bundles: PluginInfo[];
  skills: SkillInfo[];
  market: MarketItem[];
  scope: PluginManagerScope;
}

export function normalizePluginProjectPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return ".";
  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/, "");
  return withoutTrailingSeparators || (trimmed.startsWith("/") ? "/" : trimmed);
}

export function toManagedPluginScope(scope: PluginManagerScope): ManagedPluginScope {
  return scope.kind === "user"
    ? { kind: "user" }
    : { kind: "project", projectPath: normalizePluginProjectPath(scope.projectPath) };
}

function titleFor(id: string): string {
  return (
    DISPLAY_NAMES[id] ??
    id
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function sourceFor(entry: ManagedPluginCatalogEntry): PluginManagerSource {
  if (entry.metadata.origin === "host") return "host";
  if (entry.metadata.origin === "third_party") return "bundle";
  return "builtin";
}

function statusFor(enabled: boolean, status: ManagedPluginCatalogEntry["status"]): PluginManagerStatus {
  if (!enabled) return "disabled";
  return status ?? "pending";
}

function managerState(entry: ManagedPluginCatalogEntry, scope: PluginManagerScope): PluginManagerScopedState {
  return {
    effectiveEnabled: entry.enabled,
    override:
      entry.state ??
      (scope.kind === "project" ? "inherit" : entry.enabled ? "enabled" : "disabled"),
    status: statusFor(entry.enabled, entry.status),
    missingDependencies: entry.missing,
    error: entry.error,
    config: entry.config,
  };
}

function resolveOverride(value: ManagedPluginOverride | undefined, inherited: boolean): boolean {
  if (value === "enabled") return true;
  if (value === "disabled") return false;
  return inherited;
}

function componentState(
  componentId: string,
  entry: ManagedPluginCatalogEntry,
  userEntry: ManagedPluginCatalogEntry | undefined,
  scope: PluginManagerScope,
): PluginManagerScopedState {
  const userEffective = resolveOverride(userEntry?.components[componentId], true);
  const override = entry.components[componentId] ?? "inherit";
  const componentEffective = scope.kind === "user"
    ? entry.enabled && resolveOverride(override, true)
    : entry.enabled && resolveOverride(override, userEffective);
  return {
    effectiveEnabled: componentEffective,
    override,
    status: statusFor(componentEffective, entry.status),
    missingDependencies: entry.missing,
    error: entry.error,
  };
}

function scopeSupport(entry: ManagedPluginCatalogEntry): Array<"user" | "project"> {
  return entry.metadata.scope_support.includes("project") ? ["user", "project"] : ["user"];
}

function bundleScope(_bundle: PluginInfo): Array<"user" | "project"> {
  // InstalledPlugin.scope records where a bundle came from; it has no concrete project identity
  // and the protocol runtime is currently hosted by the user graph. Do not present that provenance
  // as a project-local lifecycle switch until the backend has a real (project, bundle) policy.
  return ["user"];
}

function bundleId(id: string): string {
  return `bundle:${id}`;
}

function bundleState(bundle: PluginInfo): PluginManagerScopedState {
  const effectiveEnabled = bundle.enabled;
  return {
    effectiveEnabled,
    status: !effectiveEnabled ? "disabled" : bundle.trusted ? "active" : "pending",
    error: bundle.diagnostics.find((diagnostic) => diagnostic.level === "error")?.message ?? null,
    missingDependencies: bundle.diagnostics
      .filter((diagnostic) => diagnostic.level === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

function findSkillBundle(skill: SkillInfo, bundles: PluginInfo[]): PluginInfo | undefined {
  if (!skill.source) return undefined;
  const source = skill.source.toLocaleLowerCase();
  return bundles.find(
    (bundle) => source.includes(bundle.name.toLocaleLowerCase()) || source.includes(bundle.id.toLocaleLowerCase()),
  );
}

export function buildPluginManagerCatalog({
  catalog,
  userCatalog = catalog,
  bundles,
  skills,
  market,
  scope,
}: PluginManagerCatalogInput): PluginManagerCatalogModel {
  const entries = new Map(catalog.plugins.map((entry) => [entry.id, entry]));
  const userEntries = new Map(userCatalog.plugins.map((entry) => [entry.id, entry]));
  const bundlesByManagedId = new Map(bundles.map((bundle) => [bundleId(bundle.id), bundle]));
  const descriptorsByPlugin = new Map<string, string[]>();
  for (const descriptor of BUILTIN_UI_COMPONENTS) {
    const values = descriptorsByPlugin.get(descriptor.pluginId) ?? [];
    values.push(descriptor.id);
    descriptorsByPlugin.set(descriptor.pluginId, values);
  }

  const managedPlugins: PluginManagerPlugin[] = catalog.plugins
    .filter((entry) => !bundlesByManagedId.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      name: titleFor(entry.id),
      description: entry.description,
      source: sourceFor(entry),
      category: entry.metadata.category,
      supportedScopes: scopeSupport(entry),
      required: entry.metadata.essential,
      dependencies: [
        ...entry.dependencies.required,
        ...entry.dependencies.optional.map((dependency) => `${dependency} (optional)`),
      ],
      commands: entry.commands ?? [],
      services: entry.services ?? [],
      componentIds: descriptorsByPlugin.get(entry.id) ?? [],
      state: managerState(entry, scope),
      configSchema: entry.schema ?? undefined,
      configurable:
        entry.schema != null ||
        (typeof entry.config === "object" && entry.config !== null && Object.keys(entry.config).length > 0),
    }));

  const bundlePlugins: PluginManagerPlugin[] = bundles.map((bundle) => {
    const id = bundleId(bundle.id);
    const policyEntry = entries.get(id);
    return {
      id,
      name: bundle.name,
      description: bundle.description,
      version: bundle.version,
      author: bundle.author,
      source: "bundle",
      sourceLabel: bundle.source,
      category: policyEntry?.metadata.category ?? bundle.standard,
      supportedScopes: policyEntry ? scopeSupport(policyEntry) : bundleScope(bundle),
      required: policyEntry?.metadata.essential ?? false,
      dependencies: policyEntry
        ? [
            ...policyEntry.dependencies.required,
            ...policyEntry.dependencies.optional.map((dependency) => `${dependency} (optional)`),
          ]
        : undefined,
      commands: policyEntry?.commands ?? [],
      services: policyEntry?.services ?? [],
      componentIds: bundle.extension_components.map(
        (component) => `${id}:extension:${component.kind}:${component.name}`,
      ),
      state: policyEntry ? managerState(policyEntry, scope) : bundleState(bundle),
      configSchema: policyEntry?.schema ?? undefined,
      configurable:
        policyEntry != null &&
        (policyEntry.schema != null ||
          (typeof policyEntry.config === "object" &&
            policyEntry.config !== null &&
            Object.keys(policyEntry.config).length > 0)),
    };
  });

  const builtinComponents: PluginManagerComponent[] = BUILTIN_UI_COMPONENTS.flatMap((descriptor) => {
    const entry = entries.get(descriptor.pluginId);
    if (!entry) return [];
    return [{
      id: descriptor.id,
      pluginId: descriptor.pluginId,
      pluginName: titleFor(descriptor.pluginId),
      name: descriptor.name,
      description: descriptor.description,
      kind: descriptor.kind,
      slot: descriptor.slot,
      source: sourceFor(entry),
      supportedScopes: scopeSupport(entry),
      required: "required" in descriptor ? descriptor.required : false,
      state: componentState(descriptor.id, entry, userEntries.get(descriptor.pluginId), scope),
    }];
  });

  const bundleComponents: PluginManagerComponent[] = bundles.flatMap((bundle) => {
    const pluginId = bundleId(bundle.id);
    return bundle.extension_components.map((component) => {
      const id = `${pluginId}:extension:${component.kind}:${component.name}`;
      return {
        id,
        pluginId,
        pluginName: bundle.name,
        name: component.name,
        description: component.path,
        kind: component.kind,
        slot: component.path,
        source: "bundle" as const,
        sourceLabel: bundle.source,
        supportedScopes: bundleScope(bundle),
        manageable: false,
        state: bundleState(bundle),
      };
    });
  });

  const skillComponents: PluginManagerComponent[] = skills.map((skill) => {
    const bundle = findSkillBundle(skill, bundles);
    const ownerEntry = entries.get("skills");
    const pluginId = bundle ? bundleId(bundle.id) : "skills";
    const state = bundle
      ? bundleState(bundle)
      : ownerEntry
        ? componentState(`skill:${skill.id}`, ownerEntry, userEntries.get("skills"), scope)
        : { effectiveEnabled: true, status: "active" as const };
    return {
      id: `skill:${skill.id}`,
      pluginId,
      pluginName: bundle?.name ?? "Skills",
      name: skill.name,
      description: skill.description,
      kind: skill.kind || "skill",
      slot: "composer.skills",
      source: bundle ? "bundle" : "builtin",
      sourceLabel: skill.source,
      supportedScopes: bundle ? bundleScope(bundle) : ownerEntry ? scopeSupport(ownerEntry) : ["user"],
      manageable: bundle ? false : undefined,
      state,
    };
  });

  const installedIds = new Set([
    ...market.filter((item) => item.installed).map((item) => item.id),
    ...bundles.map((bundle) => bundle.id),
  ]);
  const marketplaceItems: PluginManagerMarketplaceItem[] = market.map((item) => ({
    id: `market:${item.id}`,
    name: item.name,
    description: item.description,
    author: item.author,
    kind: item.kind,
    sourceLabel: item.tags.join(" · "),
    installed: installedIds.has(item.id),
    installable: !item.installed,
    // The existing component market installs into the user's library; project policy can then
    // govern the owning plugin/component independently.
    supportedScopes: ["user"],
  }));

  return {
    plugins: [...managedPlugins, ...bundlePlugins],
    components: [...builtinComponents, ...bundleComponents, ...skillComponents],
    marketplaceItems,
  };
}

export function pluginManagerComponentEnabled(
  components: PluginManagerComponent[],
  id: BuiltinUiComponentId,
  catalogReady = true,
): boolean {
  return catalogReady &&
    (components.find((component) => component.id === id)?.state.effectiveEnabled ?? true);
}
