import type { StringKey, Translate } from "../i18n";
import type { PluginManagerCatalogModel } from "./catalog";
import type {
  PluginManagerLabels,
  PluginManagerSource,
  PluginManagerStatus,
} from "./types";

const STATUS_KEYS: Record<PluginManagerStatus, StringKey> = {
  disabled: "pluginManager.status.disabled",
  pending: "pluginManager.status.pending",
  loading: "pluginManager.status.loading",
  active: "pluginManager.status.active",
  failed: "pluginManager.status.failed",
  disposed: "pluginManager.status.disposed",
};

const SOURCE_KEYS: Record<PluginManagerSource, StringKey> = {
  builtin: "pluginManager.source.builtin",
  host: "pluginManager.source.host",
  bundle: "pluginManager.source.bundle",
};

const CONTRIBUTION_KEYS: Record<string, StringKey> = {
  runtime: "pluginManager.contribution.runtime",
  skills: "pluginManager.contribution.skills",
  subagents: "pluginManager.contribution.subagents",
  mcp_servers: "pluginManager.contribution.mcpServers",
  commands: "pluginManager.contribution.commands",
  hooks: "pluginManager.contribution.hooks",
  lsp_servers: "pluginManager.contribution.languageServers",
  scaffolds: "pluginManager.contribution.scaffolds",
  monitors: "pluginManager.contribution.monitors",
  apps: "pluginManager.contribution.apps",
  ui: "pluginManager.contribution.uiActions",
  scenes: "pluginManager.contribution.scenes",
  pipelines: "pluginManager.contribution.pipelines",
};

const COMPONENT_KIND_KEYS: Record<string, StringKey> = {
  page: "pluginManager.kind.page",
  dockSurface: "pluginManager.kind.dockSurface",
  modal: "pluginManager.kind.modal",
  composerAction: "pluginManager.kind.composerAction",
  settingsSection: "pluginManager.kind.settingsSection",
  sessionSurface: "pluginManager.kind.sessionSurface",
  editorBlock: "pluginManager.kind.editorBlock",
  runtime: "pluginManager.kind.runtime",
  skill: "pluginManager.kind.skill",
};

const PLUGIN_KEYS: Record<string, { name: StringKey; description: StringKey }> =
  {
    core: {
      name: "pluginManager.plugin.core.name",
      description: "pluginManager.plugin.core.description",
    },
    kernel: {
      name: "pluginManager.plugin.kernel.name",
      description: "pluginManager.plugin.kernel.description",
    },
    workspace: {
      name: "pluginManager.plugin.workspace.name",
      description: "pluginManager.plugin.workspace.description",
    },
    "workspace-search": {
      name: "pluginManager.plugin.workspaceSearch.name",
      description: "pluginManager.plugin.workspaceSearch.description",
    },
    git: {
      name: "pluginManager.plugin.git.name",
      description: "pluginManager.plugin.git.description",
    },
    terminal: {
      name: "pluginManager.plugin.terminal.name",
      description: "pluginManager.plugin.terminal.description",
    },
    lsp: {
      name: "pluginManager.plugin.lsp.name",
      description: "pluginManager.plugin.lsp.description",
    },
    automation: {
      name: "pluginManager.plugin.automation.name",
      description: "pluginManager.plugin.automation.description",
    },
    artifacts: {
      name: "pluginManager.plugin.artifacts.name",
      description: "pluginManager.plugin.artifacts.description",
    },
    browser: {
      name: "pluginManager.plugin.browser.name",
      description: "pluginManager.plugin.browser.description",
    },
    "browser-use": {
      name: "pluginManager.plugin.browserUse.name",
      description: "pluginManager.plugin.browserUse.description",
    },
    canvas: {
      name: "pluginManager.plugin.canvas.name",
      description: "pluginManager.plugin.canvas.description",
    },
    document: {
      name: "pluginManager.plugin.document.name",
      description: "pluginManager.plugin.document.description",
    },
    issues: {
      name: "pluginManager.plugin.issues.name",
      description: "pluginManager.plugin.issues.description",
    },
    keymap: {
      name: "pluginManager.plugin.keymap.name",
      description: "pluginManager.plugin.keymap.description",
    },
    market: {
      name: "pluginManager.plugin.market.name",
      description: "pluginManager.plugin.market.description",
    },
    memory: {
      name: "pluginManager.plugin.memory.name",
      description: "pluginManager.plugin.memory.description",
    },
    remote: {
      name: "pluginManager.plugin.remote.name",
      description: "pluginManager.plugin.remote.description",
    },
    scenes: {
      name: "pluginManager.plugin.scenes.name",
      description: "pluginManager.plugin.scenes.description",
    },
    skills: {
      name: "pluginManager.plugin.skills.name",
      description: "pluginManager.plugin.skills.description",
    },
    usage: {
      name: "pluginManager.plugin.usage.name",
      description: "pluginManager.plugin.usage.description",
    },
    cost: {
      name: "pluginManager.plugin.cost.name",
      description: "pluginManager.plugin.cost.description",
    },
    "computer-use": {
      name: "pluginManager.plugin.computerUse.name",
      description: "pluginManager.plugin.computerUse.description",
    },
    voice: {
      name: "pluginManager.plugin.voice.name",
      description: "pluginManager.plugin.voice.description",
    },
  };

const COMPONENT_KEYS: Record<
  string,
  { name: StringKey; description: StringKey }
> = {
  "plugin-manager.page": {
    name: "pluginManager.component.manager.name",
    description: "pluginManager.component.manager.description",
  },
  "automation.page": {
    name: "pluginManager.component.automation.name",
    description: "pluginManager.component.automation.description",
  },
  "browser.dock": {
    name: "pluginManager.component.browserDock.name",
    description: "pluginManager.component.browserDock.description",
  },
  "terminal.dock": {
    name: "pluginManager.component.terminalDock.name",
    description: "pluginManager.component.terminalDock.description",
  },
  "git.surface": {
    name: "pluginManager.component.git.name",
    description: "pluginManager.component.git.description",
  },
  "files.surface": {
    name: "pluginManager.component.files.name",
    description: "pluginManager.component.files.description",
  },
  "search.modal": {
    name: "pluginManager.component.search.name",
    description: "pluginManager.component.search.description",
  },
  "issues.modal": {
    name: "pluginManager.component.issues.name",
    description: "pluginManager.component.issues.description",
  },
  "voice.composer": {
    name: "pluginManager.component.voice.name",
    description: "pluginManager.component.voice.description",
  },
  "usage.settings": {
    name: "pluginManager.component.usage.name",
    description: "pluginManager.component.usage.description",
  },
  "memory.settings": {
    name: "pluginManager.component.memory.name",
    description: "pluginManager.component.memory.description",
  },
  "scenes.surface": {
    name: "pluginManager.component.scenes.name",
    description: "pluginManager.component.scenes.description",
  },
  "canvas.editor": {
    name: "pluginManager.component.canvas.name",
    description: "pluginManager.component.canvas.description",
  },
  "remote.modal": {
    name: "pluginManager.component.remote.name",
    description: "pluginManager.component.remote.description",
  },
  "lsp.runtime": {
    name: "pluginManager.component.lsp.name",
    description: "pluginManager.component.lsp.description",
  },
};

const CATEGORY_KEYS: Record<string, StringKey> = {
  foundation: "pluginManager.category.foundation",
  workspace: "pluginManager.category.workspace",
  automation: "pluginManager.category.automation",
  developer_tools: "pluginManager.category.developerTools",
  interface: "pluginManager.category.interface",
  integration: "pluginManager.category.integration",
  other: "pluginManager.category.other",
};

export function createPluginManagerLabels(t: Translate): PluginManagerLabels {
  const status = Object.fromEntries(
    Object.entries(STATUS_KEYS).map(([key, value]) => [key, t(value)]),
  ) as Record<PluginManagerStatus, string>;
  const sourceNames = Object.fromEntries(
    Object.entries(SOURCE_KEYS).map(([key, value]) => [key, t(value)]),
  ) as Record<PluginManagerSource, string>;
  return {
    title: t("pluginManager.title"),
    description: t("pluginManager.description"),
    plugins: t("pluginManager.plugins"),
    components: t("pluginManager.components"),
    marketplace: t("pluginManager.marketplace"),
    userScope: t("pluginManager.userScope"),
    projectScope: (project) => project.label,
    search: t("pluginManager.search"),
    noResults: t("pluginManager.noResults"),
    enabled: t("pluginManager.enabled"),
    disabled: t("pluginManager.disabled"),
    inherit: t("pluginManager.inherit"),
    required: t("pluginManager.required"),
    userOnly: t("pluginManager.userOnly"),
    projectOnly: t("pluginManager.projectOnly"),
    configuration: t("pluginManager.configuration"),
    form: t("pluginManager.form"),
    advancedJson: t("pluginManager.advancedJson"),
    saveConfiguration: t("pluginManager.saveConfiguration"),
    saving: t("pluginManager.saving"),
    install: t("pluginManager.install"),
    installed: t("pluginManager.installed"),
    unavailable: t("pluginManager.unavailable"),
    refresh: t("pluginManager.refresh"),
    bundleTools: t("pluginManager.bundleTools"),
    advancedBundleTools: t("pluginManager.advancedBundleTools"),
    installFromGithub: t("pluginManager.installFromGithub"),
    githubRepository: t("pluginManager.githubRepository"),
    githubHint: t("pluginManager.githubHint"),
    closeInstaller: t("pluginManager.closeInstaller"),
    installingPlugin: t("pluginManager.installingPlugin"),
    bundleInstalled: (result) =>
      t("pluginManager.bundleInstalled", {
        name: result.name,
        version: result.version ? ` ${result.version}` : "",
      }),
    managedInBundleTools: t("pluginManager.managedInBundleTools"),
    bundleManagement: t("pluginManager.bundleManagement"),
    bundleManagementUserOnly: t("pluginManager.bundleManagementUserOnly"),
    trustRequired: t("pluginManager.trustRequired"),
    trusted: t("pluginManager.trusted"),
    notTrusted: t("pluginManager.notTrusted"),
    trustPlugin: t("pluginManager.trustPlugin"),
    revokeTrust: t("pluginManager.revokeTrust"),
    contributions: t("pluginManager.contributions"),
    diagnostics: t("pluginManager.diagnostics"),
    uninstall: t("pluginManager.uninstall"),
    uninstallTitle: (name) => t("pluginManager.uninstallTitle", { name }),
    uninstallDescription: t("pluginManager.uninstallDescription"),
    keepPluginData: t("pluginManager.keepPluginData"),
    resetDefaults: t("pluginManager.resetDefaults"),
    restoredLastGood: t("pluginManager.restoredLastGood"),
    safeMode: t("pluginManager.safeMode"),
    dependencies: t("pluginManager.dependencies"),
    missingDependencies: t("pluginManager.missingDependencies"),
    commands: t("pluginManager.commands"),
    services: t("pluginManager.services"),
    activeResources: t("pluginManager.activeResources"),
    scope: t("pluginManager.scope"),
    pluginList: t("pluginManager.pluginList"),
    componentList: t("pluginManager.componentList"),
    projectState: (name) => t("pluginManager.projectState", { name }),
    noDescription: t("pluginManager.noDescription"),
    configurationHint: t("pluginManager.configurationHint"),
    plugin: t("pluginManager.plugin"),
    source: t("pluginManager.source"),
    uiSlot: t("pluginManager.uiSlot"),
    affectedPlugins: t("pluginManager.affectedPlugins"),
    missingCount: (count) => t("pluginManager.missingCount", { count }),
    status,
    sourceNames,
    contribution: (id, fallback) =>
      CONTRIBUTION_KEYS[id] ? t(CONTRIBUTION_KEYS[id]) : fallback,
    componentKind: (kind) =>
      COMPONENT_KIND_KEYS[kind] ? t(COMPONENT_KIND_KEYS[kind]) : kind,
    installedBundle: t("pluginManager.installedBundle"),
    dataOnly: t("pluginManager.dataOnly"),
    invalidConfigurationObject: t("pluginManager.invalidConfigurationObject"),
    githubRepositoryRequired: t("pluginManager.githubRepositoryRequired"),
    changeApplied: (name, state) =>
      t("pluginManager.changeApplied", {
        name,
        state:
          state === "enabled"
            ? t("pluginManager.enabled")
            : state === "disabled"
              ? t("pluginManager.disabled")
              : t("pluginManager.inherit"),
      }),
    changeSummary: (kind, name, state) =>
      t(
        kind === "component"
          ? state === "disabled"
            ? "pluginManager.componentChangeSummary.disabled"
            : "pluginManager.componentChangeSummary.enabled"
          : state === "disabled"
            ? "pluginManager.pluginChangeSummary.disabled"
            : "pluginManager.pluginChangeSummary.enabled",
        { name },
      ),
    marketplaceInstalled: t("pluginManager.marketplaceInstalled"),
    settingsReset: t("pluginManager.settingsReset"),
    bundleEnabled: (name, enabled) =>
      t(
        enabled
          ? "pluginManager.bundleEnabled"
          : "pluginManager.bundleDisabled",
        { name },
      ),
    bundleTrusted: (name, trusted) =>
      t(
        trusted
          ? "pluginManager.bundleTrusted"
          : "pluginManager.bundleTrustRevoked",
        { name },
      ),
    bundleUninstalled: (name, keepData) =>
      t(
        keepData
          ? "pluginManager.bundleUninstalledDataKept"
          : "pluginManager.bundleUninstalled",
        { name },
      ),
    confirmTitle: t("pluginManager.confirmTitle"),
    confirm: t("pluginManager.confirm"),
    cancel: t("pluginManager.cancel"),
  };
}

export function localizePluginManagerCatalog(
  model: PluginManagerCatalogModel,
  t: Translate,
): PluginManagerCatalogModel {
  const pluginName = (id: string, fallback: string) =>
    PLUGIN_KEYS[id] ? t(PLUGIN_KEYS[id].name) : fallback;
  return {
    ...model,
    plugins: model.plugins.map((plugin) => {
      const keys = PLUGIN_KEYS[plugin.id];
      if (!keys || plugin.source === "bundle") return plugin;
      return {
        ...plugin,
        name: t(keys.name),
        description: t(keys.description),
        category:
          plugin.category && CATEGORY_KEYS[plugin.category]
            ? t(CATEGORY_KEYS[plugin.category])
            : plugin.category,
        dependencies: plugin.dependencies?.map((dependency) =>
          dependency.endsWith(" (optional)")
            ? t("pluginManager.optionalDependency", {
                id: dependency.slice(0, -11),
              })
            : dependency,
        ),
        bundle: plugin.bundle
          ? {
              ...plugin.bundle,
              contributions: plugin.bundle.contributions.map((item) => ({
                ...item,
                label: CONTRIBUTION_KEYS[item.id]
                  ? t(CONTRIBUTION_KEYS[item.id])
                  : item.label,
              })),
            }
          : undefined,
      };
    }),
    components: model.components.map((component) => {
      const keys = COMPONENT_KEYS[component.id];
      const firstParty = component.source !== "bundle";
      return {
        ...component,
        pluginName: firstParty
          ? pluginName(component.pluginId, component.pluginName)
          : component.pluginName,
        name: keys && firstParty ? t(keys.name) : component.name,
        description:
          keys && firstParty ? t(keys.description) : component.description,
      };
    }),
  };
}
