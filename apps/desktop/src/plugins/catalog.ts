import type {
  ManagedPluginCatalog,
  ManagedPluginCatalogEntry,
  ManagedPluginOverride,
  ManagedPluginScope,
  MarketItem,
  PluginExtensionComponent,
  PluginInfo,
  PluginMarketplace,
  SkillInfo,
} from "../bridge";
import { pluginUiComponentId } from "../pluginModel";
import { BUILTIN_UI_COMPONENTS } from "./builtinComponents";
import type {
  PluginManagerComponent,
  PluginManagerMarketplaceItem,
  PluginManagerMarketplaceSource,
  PluginManagerPlugin,
  PluginManagerScope,
  PluginManagerScopedState,
  PluginManagerSource,
  PluginManagerStatus,
} from "./types";

const BUNDLE_CONTRIBUTIONS = [
  ["runtime", "Process runtime"],
  ["skills", "Skills"],
  ["subagents", "Subagents"],
  ["mcp_servers", "MCP servers"],
  ["commands", "Prompt commands"],
  ["runtime_commands", "Runtime commands"],
  ["hooks", "Hooks"],
  ["lsp_servers", "Language servers"],
  ["scaffolds", "Scaffolds"],
  ["monitors", "Monitors"],
  ["apps", "Apps"],
  ["ui", "UI actions"],
  ["connectors", "Connectors"],
  ["scenes", "Scenes"],
  ["pipelines", "Pipelines"],
] as const;

export { BUILTIN_UI_COMPONENTS };

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
  marketplaceSources: PluginManagerMarketplaceSource[];
}

export interface PluginManagerCatalogInput {
  catalog: ManagedPluginCatalog;
  /** Needed to resolve inherited project component state. Equal to catalog in user scope. */
  userCatalog?: ManagedPluginCatalog;
  bundles: PluginInfo[];
  skills: SkillInfo[];
  market: MarketItem[];
  localMarketplace?: PluginMarketplace | null;
  scope: PluginManagerScope;
}

export function normalizePluginProjectPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return ".";
  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/, "");
  return withoutTrailingSeparators || (trimmed.startsWith("/") ? "/" : trimmed);
}

export function toManagedPluginScope(
  scope: PluginManagerScope
): ManagedPluginScope {
  return scope.kind === "user"
    ? { kind: "user" }
    : {
        kind: "project",
        projectPath: normalizePluginProjectPath(scope.projectPath),
      };
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

function statusFor(
  enabled: boolean,
  status: ManagedPluginCatalogEntry["status"]
): PluginManagerStatus {
  if (!enabled) return "disabled";
  return status ?? "pending";
}

function managerState(
  entry: ManagedPluginCatalogEntry,
  scope: PluginManagerScope
): PluginManagerScopedState {
  return {
    effectiveEnabled: entry.enabled,
    override:
      entry.state ??
      (scope.kind === "project"
        ? "inherit"
        : entry.enabled
          ? "enabled"
          : "disabled"),
    status: statusFor(entry.enabled, entry.status),
    missingDependencies: entry.missing,
    error: entry.error,
    config: entry.config,
  };
}

function resolveOverride(
  value: ManagedPluginOverride | undefined,
  inherited: boolean
): boolean {
  if (value === "enabled") return true;
  if (value === "disabled") return false;
  return inherited;
}

function componentState(
  componentId: string,
  entry: ManagedPluginCatalogEntry,
  userEntry: ManagedPluginCatalogEntry | undefined,
  scope: PluginManagerScope
): PluginManagerScopedState {
  const userEffective = resolveOverride(
    userEntry?.components[componentId],
    true
  );
  const override = entry.components[componentId] ?? "inherit";
  const componentEffective =
    scope.kind === "user"
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

function scopeSupport(
  entry: ManagedPluginCatalogEntry
): Array<"user" | "project"> {
  return entry.metadata.scope_support.includes("project")
    ? ["user", "project"]
    : ["user"];
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
  const requiresTrust =
    (bundle.counts.runtime ?? 0) > 0 ||
    bundle.extension_components.some(
      (component) => component.status === "requires_trust"
    );
  return {
    effectiveEnabled,
    status: !effectiveEnabled
      ? "disabled"
      : requiresTrust && !bundle.trusted
        ? "pending"
        : "active",
    error:
      bundle.diagnostics.find((diagnostic) => diagnostic.level === "error")
        ?.message ?? null,
    missingDependencies: bundle.diagnostics
      .filter((diagnostic) => diagnostic.level === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

function extensionState(
  bundle: PluginInfo,
  availability: PluginExtensionComponent["status"]
): PluginManagerScopedState {
  const state = bundleState(bundle);
  if (!state.effectiveEnabled) return state;
  if (availability === "requires_auth") {
    return { ...state, status: "requires_auth" };
  }
  if (availability === "unsupported") {
    return { ...state, status: "unsupported" };
  }
  if (availability === "requires_trust") {
    return { ...state, status: "pending" };
  }
  return state;
}

function combineSkillState(
  policy: PluginManagerScopedState,
  bundle: PluginInfo | undefined
): PluginManagerScopedState {
  if (!bundle) return policy;
  if (!policy.effectiveEnabled) return policy;
  const installed = bundleState(bundle);
  if (!installed.effectiveEnabled || installed.status !== "active") {
    return installed;
  }
  return {
    ...policy,
    missingDependencies: [
      ...(installed.missingDependencies ?? []),
      ...(policy.missingDependencies ?? []),
    ],
    error: installed.error ?? policy.error,
  };
}

function findSkillBundle(
  skill: SkillInfo,
  bundles: PluginInfo[]
): PluginInfo | undefined {
  if (!skill.source) return undefined;
  const source = skill.source.toLocaleLowerCase();
  return bundles.find(
    (bundle) =>
      source.includes(bundle.name.toLocaleLowerCase()) ||
      source.includes(bundle.id.toLocaleLowerCase())
  );
}

export function buildPluginManagerCatalog({
  catalog,
  userCatalog = catalog,
  bundles,
  skills,
  market,
  localMarketplace,
  scope,
}: PluginManagerCatalogInput): PluginManagerCatalogModel {
  const entries = new Map(catalog.plugins.map((entry) => [entry.id, entry]));
  const userEntries = new Map(
    userCatalog.plugins.map((entry) => [entry.id, entry])
  );
  const bundlesByManagedId = new Map(
    bundles.map((bundle) => [bundleId(bundle.id), bundle])
  );
  const descriptorsByPlugin = new Map<string, string[]>();
  for (const descriptor of BUILTIN_UI_COMPONENTS) {
    const values = descriptorsByPlugin.get(descriptor.pluginId) ?? [];
    values.push(descriptor.id);
    descriptorsByPlugin.set(descriptor.pluginId, values);
  }

  const managedPlugins: PluginManagerPlugin[] = catalog.plugins
    .filter(
      (entry) =>
        entry.metadata.role !== "core" && !bundlesByManagedId.has(entry.id)
    )
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
        ...entry.dependencies.optional.map(
          (dependency) => `${dependency} (optional)`
        ),
      ],
      commands: entry.commands ?? [],
      services: entry.services ?? [],
      componentIds: descriptorsByPlugin.get(entry.id) ?? [],
      state: managerState(entry, scope),
      configSchema: entry.schema ?? undefined,
      configurable:
        entry.schema != null ||
        (typeof entry.config === "object" &&
          entry.config !== null &&
          Object.keys(entry.config).length > 0),
    }));

  const bundlePlugins: PluginManagerPlugin[] = bundles.map((bundle) => {
    const id = bundleId(bundle.id);
    const policyEntry = entries.get(id);
    const requiresTrust =
      (bundle.counts.runtime ?? 0) > 0 ||
      bundle.extension_components.some(
        (component) => component.status === "requires_trust"
      );
    return {
      id,
      name: bundle.name,
      description: bundle.description,
      version: bundle.version,
      author: bundle.author,
      source: "bundle",
      sourceLabel: bundle.source,
      category: policyEntry?.metadata.category ?? "plugin",
      supportedScopes: policyEntry
        ? scopeSupport(policyEntry)
        : bundleScope(bundle),
      required:
        policyEntry?.metadata.essential === true ||
        policyEntry?.metadata.role === "core",
      dependencies: policyEntry
        ? [
            ...policyEntry.dependencies.required,
            ...policyEntry.dependencies.optional.map(
              (dependency) => `${dependency} (optional)`
            ),
          ]
        : undefined,
      commands: policyEntry?.commands?.length
        ? policyEntry.commands
        : bundle.runtime_commands.map((command) => command.id),
      services: policyEntry?.services ?? [],
      componentIds: [
        ...bundle.ui_contributions.map((contribution) =>
          pluginUiComponentId(bundle.id, contribution.id)
        ),
        ...bundle.extension_components
          .filter(
            (component) =>
              component.kind !== "ui" && component.kind !== "connector"
          )
          .map(
            (component) => `${id}:extension:${component.kind}:${component.name}`
          ),
      ],
      state: policyEntry
        ? managerState(policyEntry, scope)
        : bundleState(bundle),
      configSchema: policyEntry?.schema ?? undefined,
      configurable:
        policyEntry != null &&
        (policyEntry.schema != null ||
          (typeof policyEntry.config === "object" &&
            policyEntry.config !== null &&
            Object.keys(policyEntry.config).length > 0)),
      bundle: {
        id: bundle.id,
        repository: bundle.repository || null,
        standardVersion: bundle.standard_version,
        trusted: bundle.trusted,
        enabled: bundle.enabled,
        requiresTrust,
        runtimeManaged: policyEntry != null,
        contributions: BUNDLE_CONTRIBUTIONS.flatMap(([key, label]) => {
          const count = bundle.counts[key] ?? 0;
          return count > 0 ? [{ id: key, label, count }] : [];
        }),
        diagnostics: bundle.diagnostics.map((diagnostic) => ({
          level: diagnostic.level,
          message: diagnostic.message,
          component: diagnostic.component ?? null,
        })),
        scaffolds: bundle.scaffolds.map((scaffold) => ({
          id: scaffold.id,
          name: scaffold.name,
          description: scaffold.description,
          files: scaffold.files,
        })),
      },
    };
  });

  const builtinComponents: PluginManagerComponent[] =
    BUILTIN_UI_COMPONENTS.flatMap((descriptor) => {
      const entry = entries.get(descriptor.pluginId);
      if (!entry || entry.metadata.role === "core") return [];
      return [
        {
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
          state: componentState(
            descriptor.id,
            entry,
            userEntries.get(descriptor.pluginId),
            scope
          ),
        },
      ];
    });

  const bundleComponents: PluginManagerComponent[] = bundles.flatMap(
    (bundle) => {
      const pluginId = bundleId(bundle.id);
      const policyEntry = entries.get(pluginId);
      const userEntry = userEntries.get(pluginId);
      const uiComponents: PluginManagerComponent[] =
        bundle.ui_contributions.map((contribution) => {
          const id = pluginUiComponentId(bundle.id, contribution.id);
          return {
            id,
            pluginId,
            pluginName: bundle.name,
            name: contribution.label,
            description: contribution.description,
            kind: "uiAction",
            slot: contribution.slot,
            source: "bundle",
            sourceLabel: bundle.source,
            supportedScopes: policyEntry
              ? scopeSupport(policyEntry)
              : bundleScope(bundle),
            manageable: policyEntry != null,
            state: policyEntry
              ? componentState(id, policyEntry, userEntry, scope)
              : bundleState(bundle),
          };
        });
      const inventoryComponents: PluginManagerComponent[] =
        bundle.extension_components
          .filter(
            (component) =>
              component.kind !== "ui" && component.kind !== "connector"
          )
          .map((component) => {
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
              availability: component.status,
              state: extensionState(bundle, component.status),
            };
          });
      return [...uiComponents, ...inventoryComponents];
    }
  );

  const skillComponents: PluginManagerComponent[] = skills.map((skill) => {
    const bundle = findSkillBundle(skill, bundles);
    const ownerEntry = entries.get("skills");
    const pluginId = bundle ? bundleId(bundle.id) : "skills";
    const policyState = ownerEntry
      ? componentState(
          `skill:${skill.id}`,
          ownerEntry,
          userEntries.get("skills"),
          scope
        )
      : { effectiveEnabled: true, status: "active" as const };
    const state = combineSkillState(policyState, bundle);
    return {
      id: `skill:${skill.id}`,
      pluginId,
      pluginName: bundle?.name ?? "Skills",
      policyPluginId: ownerEntry ? "skills" : undefined,
      name: skill.name,
      description: skill.description,
      kind: skill.kind || "skill",
      slot: "composer.skills",
      source: bundle ? "bundle" : "builtin",
      sourceLabel: skill.source,
      supportedScopes: ownerEntry ? scopeSupport(ownerEntry) : ["user"],
      manageable: ownerEntry != null,
      state,
      skill: {
        id: skill.id,
        removable:
          Boolean(skill.source?.startsWith("GitHub · ")) ||
          market.some((item) => item.id === skill.id && item.installed),
      },
    };
  });

  const installedIds = new Set([
    ...market.filter((item) => item.installed).map((item) => item.id),
    ...bundles.map((bundle) => bundle.id),
  ]);
  const marketplaceItems: PluginManagerMarketplaceItem[] = market.map(
    (item) => ({
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
    })
  );

  const localMarketplaceItems: PluginManagerMarketplaceItem[] =
    localMarketplace?.plugins.map((entry) => {
      const installedBundle = bundles.find(
        (bundle) =>
          bundle.name === entry.display_name || bundle.name === entry.name
      );
      return {
        id: `marketplace:${localMarketplace.name}:${entry.name}`,
        name: entry.display_name,
        description: entry.description,
        version: entry.version || null,
        kind: entry.category || "bundle",
        sourceLabel: `${localMarketplace.display_name} · ${entry.source.kind.replace("_", " ")}`,
        installed:
          installedBundle != null &&
          (!entry.version || installedBundle.version === entry.version),
        installable: entry.installable,
        supportedScopes: ["user"],
        diagnostic: entry.diagnostic,
        marketplace: {
          manifestPath: localMarketplace.manifest_path,
          pluginName: entry.name,
        },
      };
    }) ?? [];

  const marketplaceSources: PluginManagerMarketplaceSource[] = localMarketplace
    ? [
        {
          id: localMarketplace.manifest_path,
          name: localMarketplace.display_name,
          description: localMarketplace.description,
          diagnostics: localMarketplace.diagnostics.map(
            (diagnostic) => diagnostic.message
          ),
        },
      ]
    : [];

  return {
    plugins: [...managedPlugins, ...bundlePlugins],
    components: [...builtinComponents, ...bundleComponents, ...skillComponents],
    marketplaceItems: [...localMarketplaceItems, ...marketplaceItems],
    marketplaceSources,
  };
}

export function pluginManagerComponentEnabled(
  components: PluginManagerComponent[],
  id: BuiltinUiComponentId,
  catalogReady = true
): boolean {
  return (
    catalogReady &&
    (components.find((component) => component.id === id)?.state
      .effectiveEnabled ??
      true)
  );
}
