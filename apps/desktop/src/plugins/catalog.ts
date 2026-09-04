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
import { builtinUiComponents } from "./builtinComponents";
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

const bundleContributions = [
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

export { builtinUiComponents };

export type BuiltinUiComponentId = (typeof builtinUiComponents)[number]["id"];

const displayNames: Record<string, string> = {
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
  /**
  Needed to resolve inherited project component state. Equal to catalog in user scope.
  */
  userCatalog?: ManagedPluginCatalog;
  bundles: PluginInfo[];
  skills: SkillInfo[];
  market: MarketItem[];
  localMarketplace?: PluginMarketplace | null;
  scope: PluginManagerScope;
}

export function normalizePluginProjectPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return ".";
  }
  const withoutTrailingSeparators = trimmed.replace(/[\\/]+$/u, "");
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
    displayNames[id] ??
    id
      .split(/[-_]/u)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function sourceFor(entry: ManagedPluginCatalogEntry): PluginManagerSource {
  if (entry.metadata.origin === "host") {
    return "host";
  }
  if (entry.metadata.origin === "third_party") {
    return "bundle";
  }
  return "builtin";
}

function statusFor(
  isEnabled: boolean,
  status: ManagedPluginCatalogEntry["status"]
): PluginManagerStatus {
  if (!isEnabled) {
    return "disabled";
  }
  return status ?? "pending";
}

function managerState(
  entry: ManagedPluginCatalogEntry,
  scope: PluginManagerScope
): PluginManagerScopedState {
  return {
    config: entry.config,
    effectiveEnabled: entry.enabled,
    error: entry.error,
    missingDependencies: entry.missing,
    override:
      entry.state ??
      (scope.kind === "project"
        ? "inherit"
        : entry.enabled
          ? "enabled"
          : "disabled"),
    status: statusFor(entry.enabled, entry.status),
  };
}

function resolveOverride(
  value: ManagedPluginOverride | undefined,
  isInherited: boolean
): boolean {
  if (value === "enabled") {
    return true;
  }
  if (value === "disabled") {
    return false;
  }
  return isInherited;
}

function componentState(
  componentId: string,
  entry: ManagedPluginCatalogEntry,
  userEntry: ManagedPluginCatalogEntry | undefined,
  scope: PluginManagerScope
): PluginManagerScopedState {
  const isUserEffective = resolveOverride(
    userEntry?.components[componentId],
    true
  );
  const override = entry.components[componentId] ?? "inherit";
  const isComponentEffective =
    scope.kind === "user"
      ? entry.enabled && resolveOverride(override, true)
      : entry.enabled && resolveOverride(override, isUserEffective);
  return {
    effectiveEnabled: isComponentEffective,
    error: entry.error,
    missingDependencies: entry.missing,
    override,
    status: statusFor(isComponentEffective, entry.status),
  };
}

function scopeSupport(
  entry: ManagedPluginCatalogEntry
): ("user" | "project")[] {
  return entry.metadata.scope_support.includes("project")
    ? ["user", "project"]
    : ["user"];
}

function bundleScope(_bundle: PluginInfo): ("user" | "project")[] {
  // InstalledPlugin.scope records where a bundle came from; it has no concrete project identity
  // and the protocol runtime is currently hosted by the user graph. Do not present that provenance
  // as a project-local lifecycle switch until the backend has a real (project, bundle) policy.
  return ["user"];
}

function bundleId(id: string): string {
  return `bundle:${id}`;
}

function bundleState(bundle: PluginInfo): PluginManagerScopedState {
  const isEffectiveEnabled = bundle.enabled;
  const requiresTrust =
    (bundle.counts.runtime ?? 0) > 0 ||
    bundle.extension_components.some(
      (component) => component.status === "requires_trust"
    );
  return {
    effectiveEnabled: isEffectiveEnabled,
    error:
      bundle.diagnostics.find((diagnostic) => diagnostic.level === "error")
        ?.message ?? null,
    missingDependencies: bundle.diagnostics
      .filter((diagnostic) => diagnostic.level === "warning")
      .map((diagnostic) => diagnostic.message),
    status: isEffectiveEnabled
      ? requiresTrust && !bundle.trusted
        ? "pending"
        : "active"
      : "disabled",
  };
}

function extensionState(
  bundle: PluginInfo,
  availability: PluginExtensionComponent["status"]
): PluginManagerScopedState {
  const state = bundleState(bundle);
  if (!state.effectiveEnabled) {
    return state;
  }
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
  if (!bundle) {
    return policy;
  }
  if (!policy.effectiveEnabled) {
    return policy;
  }
  const installed = bundleState(bundle);
  if (!installed.effectiveEnabled || installed.status !== "active") {
    return installed;
  }
  return {
    ...policy,
    error: installed.error ?? policy.error,
    missingDependencies: [
      ...(installed.missingDependencies ?? []),
      ...(policy.missingDependencies ?? []),
    ],
  };
}

function findSkillBundle(
  skill: SkillInfo,
  bundles: PluginInfo[]
): PluginInfo | undefined {
  if (skill.source == null || skill.source === "") {
    return undefined;
  }
  const source = skill.source.toLocaleLowerCase();
  return bundles.find((bundle) => {
    return (
      source.includes(bundle.name.toLocaleLowerCase()) ||
      source.includes(bundle.id.toLocaleLowerCase())
    );
  });
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
  for (const descriptor of builtinUiComponents) {
    const values = descriptorsByPlugin.get(descriptor.pluginId) ?? [];
    values.push(descriptor.id);
    descriptorsByPlugin.set(descriptor.pluginId, values);
  }

  const managedPlugins: PluginManagerPlugin[] = catalog.plugins
    .filter(
      (entry) =>
        entry.metadata.role !== "core" && !bundlesByManagedId.has(entry.id)
    )
    .map((entry) => {
      return {
        category: entry.metadata.category,
        commands: entry.commands ?? [],
        componentIds: descriptorsByPlugin.get(entry.id) ?? [],
        configSchema: entry.schema ?? undefined,
        configurable:
          (entry.schema !== null && entry.schema !== undefined) ||
          (typeof entry.config === "object" &&
            entry.config !== null &&
            Object.keys(entry.config).length > 0),
        dependencies: [
          ...entry.dependencies.required,
          ...entry.dependencies.optional.map(
            (dependency) => `${dependency} (optional)`
          ),
        ],
        description: entry.description,
        id: entry.id,
        name: titleFor(entry.id),
        required: entry.metadata.essential,
        services: entry.services ?? [],
        source: sourceFor(entry),
        state: managerState(entry, scope),
        supportedScopes: scopeSupport(entry),
      };
    });

  const bundlePlugins: PluginManagerPlugin[] = bundles.map((bundle) => {
    const id = bundleId(bundle.id);
    const policyEntry = entries.get(id);
    const requiresTrust =
      (bundle.counts.runtime ?? 0) > 0 ||
      bundle.extension_components.some(
        (component) => component.status === "requires_trust"
      );
    return {
      author: bundle.author,
      bundle: {
        contributions: bundleContributions.flatMap(([key, label]) => {
          const count = bundle.counts[key] ?? 0;
          return count > 0 ? [{ count, id: key, label }] : [];
        }),
        diagnostics: bundle.diagnostics.map((diagnostic) => {
          return {
            component: diagnostic.component ?? null,
            level: diagnostic.level,
            message: diagnostic.message,
          };
        }),
        enabled: bundle.enabled,
        id: bundle.id,
        repository: bundle.repository || null,
        requiresTrust,
        runtimeManaged: policyEntry !== null && policyEntry !== undefined,
        scaffolds: bundle.scaffolds.map((scaffold) => {
          return {
            description: scaffold.description,
            files: scaffold.files,
            id: scaffold.id,
            name: scaffold.name,
          };
        }),
        standardVersion: bundle.standard_version,
        trusted: bundle.trusted,
      },
      category: policyEntry?.metadata.category ?? "plugin",
      commands:
        policyEntry?.commands?.length == null
          ? bundle.runtime_commands.map((command) => command.id)
          : policyEntry.commands,
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
      configSchema: policyEntry?.schema ?? undefined,
      configurable:
        policyEntry !== null &&
        policyEntry !== undefined &&
        ((policyEntry.schema !== null && policyEntry.schema !== undefined) ||
          (typeof policyEntry.config === "object" &&
            policyEntry.config !== null &&
            Object.keys(policyEntry.config).length > 0)),
      dependencies: policyEntry
        ? [
            ...policyEntry.dependencies.required,
            ...policyEntry.dependencies.optional.map(
              (dependency) => `${dependency} (optional)`
            ),
          ]
        : undefined,
      description: bundle.description,
      id,
      name: bundle.name,
      required:
        policyEntry?.metadata.essential === true ||
        policyEntry?.metadata.role === "core",
      services: policyEntry?.services ?? [],
      source: "bundle",
      sourceLabel: bundle.source,
      state: policyEntry
        ? managerState(policyEntry, scope)
        : bundleState(bundle),
      supportedScopes: policyEntry
        ? scopeSupport(policyEntry)
        : bundleScope(bundle),
      version: bundle.version,
    };
  });

  const builtinComponents: PluginManagerComponent[] =
    builtinUiComponents.flatMap((descriptor) => {
      const entry = entries.get(descriptor.pluginId);
      if (!entry || entry.metadata.role === "core") {
        return [];
      }
      return [
        {
          description: descriptor.description,
          id: descriptor.id,
          kind: descriptor.kind,
          name: descriptor.name,
          pluginId: descriptor.pluginId,
          pluginName: titleFor(descriptor.pluginId),
          required: "required" in descriptor ? descriptor.required : false,
          slot: descriptor.slot,
          source: sourceFor(entry),
          state: componentState(
            descriptor.id,
            entry,
            userEntries.get(descriptor.pluginId),
            scope
          ),
          supportedScopes: scopeSupport(entry),
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
            description: contribution.description,
            id,
            kind: "uiAction",
            manageable: policyEntry !== null && policyEntry !== undefined,
            name: contribution.label,
            pluginId,
            pluginName: bundle.name,
            slot: contribution.slot,
            source: "bundle",
            sourceLabel: bundle.source,
            state: policyEntry
              ? componentState(id, policyEntry, userEntry, scope)
              : bundleState(bundle),
            supportedScopes: policyEntry
              ? scopeSupport(policyEntry)
              : bundleScope(bundle),
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
              availability: component.status,
              description: component.path,
              id,
              kind: component.kind,
              manageable: false,
              name: component.name,
              pluginId,
              pluginName: bundle.name,
              slot: component.path,
              source: "bundle" as const,
              sourceLabel: bundle.source,
              state: extensionState(bundle, component.status),
              supportedScopes: bundleScope(bundle),
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
      description: skill.description,
      id: `skill:${skill.id}`,
      kind: skill.kind || "skill",
      manageable: ownerEntry !== null && ownerEntry !== undefined,
      name: skill.name,
      pluginId,
      pluginName: bundle?.name ?? "Skills",
      policyPluginId: ownerEntry ? "skills" : undefined,
      skill: {
        id: skill.id,
        removable:
          Boolean(skill.source?.startsWith("GitHub · ")) ||
          market.some((item) => item.id === skill.id && item.installed),
      },
      slot: "composer.skills",
      source: bundle ? "bundle" : "builtin",
      sourceLabel: skill.source,
      state,
      supportedScopes: ownerEntry ? scopeSupport(ownerEntry) : ["user"],
    };
  });

  const installedIds = new Set([
    ...market.filter((item) => item.installed).map((item) => item.id),
    ...bundles.map((bundle) => bundle.id),
  ]);
  const marketplaceItems: PluginManagerMarketplaceItem[] = market.map(
    (item) => {
      return {
        author: item.author,
        description: item.description,
        id: `market:${item.id}`,
        installable: !item.installed,
        installed: installedIds.has(item.id),
        kind: item.kind,
        name: item.name,
        sourceLabel: item.tags.join(" · "),
        supportedScopes: ["user"],
      };
    }
  );

  const localMarketplaceItems: PluginManagerMarketplaceItem[] =
    localMarketplace?.plugins.map((entry) => {
      const installedBundle = bundles.find(
        (bundle) =>
          bundle.name === entry.display_name || bundle.name === entry.name
      );
      return {
        description: entry.description,
        diagnostic: entry.diagnostic,
        id: `marketplace:${localMarketplace.name}:${entry.name}`,
        installable: entry.installable,
        installed:
          installedBundle !== null &&
          installedBundle !== undefined &&
          (!entry.version || installedBundle.version === entry.version),
        kind: entry.category || "bundle",
        marketplace: {
          manifestPath: localMarketplace.manifest_path,
          pluginName: entry.name,
        },
        name: entry.display_name,
        sourceLabel: `${localMarketplace.display_name} · ${entry.source.kind.replace("_", " ")}`,
        supportedScopes: ["user"],
        version: entry.version || null,
      };
    }) ?? [];

  const marketplaceSources: PluginManagerMarketplaceSource[] = localMarketplace
    ? [
        {
          description: localMarketplace.description,
          diagnostics: localMarketplace.diagnostics.map(
            (diagnostic) => diagnostic.message
          ),
          id: localMarketplace.manifest_path,
          name: localMarketplace.display_name,
        },
      ]
    : [];

  return {
    components: [...builtinComponents, ...bundleComponents, ...skillComponents],
    marketplaceItems: [...localMarketplaceItems, ...marketplaceItems],
    marketplaceSources,
    plugins: [...managedPlugins, ...bundlePlugins],
  };
}

export function pluginManagerComponentEnabled(
  components: PluginManagerComponent[],
  id: BuiltinUiComponentId,
  isCatalogReady = true
): boolean {
  return (
    isCatalogReady &&
    (components.find((component) => component.id === id)?.state
      .effectiveEnabled ??
      true)
  );
}
