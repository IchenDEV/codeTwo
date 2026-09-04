import type { StringKey, Translate } from "../i18n";
import type { PluginManagerCatalogModel } from "./catalog";
import type {
  PluginManagerLabels,
  PluginManagerSource,
  PluginManagerStatus,
} from "./types";

const statusKeys: Record<PluginManagerStatus, StringKey> = {
  active: "pluginManager.status.active",
  disabled: "pluginManager.status.disabled",
  disposed: "pluginManager.status.disposed",
  failed: "pluginManager.status.failed",
  loading: "pluginManager.status.loading",
  pending: "pluginManager.status.pending",
  requires_auth: "pluginManager.status.requiresAuth",
  unsupported: "pluginManager.status.unsupported",
};

const sourceKeys: Record<PluginManagerSource, StringKey> = {
  builtin: "pluginManager.source.builtin",
  bundle: "pluginManager.source.bundle",
  host: "pluginManager.source.host",
};

const contributionKeys: Record<string, StringKey> = {
  apps: "pluginManager.contribution.apps",
  commands: "pluginManager.contribution.commands",
  connectors: "pluginManager.contribution.connectors",
  hooks: "pluginManager.contribution.hooks",
  lsp_servers: "pluginManager.contribution.languageServers",
  mcp_servers: "pluginManager.contribution.mcpServers",
  monitors: "pluginManager.contribution.monitors",
  pipelines: "pluginManager.contribution.pipelines",
  runtime: "pluginManager.contribution.runtime",
  runtime_commands: "pluginManager.contribution.runtimeCommands",
  scaffolds: "pluginManager.contribution.scaffolds",
  scenes: "pluginManager.contribution.scenes",
  skills: "pluginManager.contribution.skills",
  subagents: "pluginManager.contribution.subagents",
  ui: "pluginManager.contribution.uiActions",
};

const componentKindKeys: Record<string, StringKey> = {
  agent_skill: "pluginManager.kind.agentSkill",
  composerAction: "pluginManager.kind.composerAction",
  dockSurface: "pluginManager.kind.dockSurface",
  editorBlock: "pluginManager.kind.editorBlock",
  fragment: "pluginManager.kind.fragment",
  hook: "pluginManager.kind.hook",
  macro: "pluginManager.kind.macro",
  mcp: "pluginManager.kind.mcp",
  modal: "pluginManager.kind.modal",
  page: "pluginManager.kind.page",
  runtime: "pluginManager.kind.runtime",
  sessionSurface: "pluginManager.kind.sessionSurface",
  settingsSection: "pluginManager.kind.settingsSection",
  skill: "pluginManager.kind.skill",
};

const pluginKeys: Record<string, { name: StringKey; description: StringKey }> =
  {
    "browser-use": {
      description: "pluginManager.plugin.browserUse.description",
      name: "pluginManager.plugin.browserUse.name",
    },
    "computer-use": {
      description: "pluginManager.plugin.computerUse.description",
      name: "pluginManager.plugin.computerUse.name",
    },
    "device-sync": {
      description: "pluginManager.plugin.deviceSync.description",
      name: "pluginManager.plugin.deviceSync.name",
    },
    "workspace-search": {
      description: "pluginManager.plugin.workspaceSearch.description",
      name: "pluginManager.plugin.workspaceSearch.name",
    },
    artifacts: {
      description: "pluginManager.plugin.artifacts.description",
      name: "pluginManager.plugin.artifacts.name",
    },
    automation: {
      description: "pluginManager.plugin.automation.description",
      name: "pluginManager.plugin.automation.name",
    },
    browser: {
      description: "pluginManager.plugin.browser.description",
      name: "pluginManager.plugin.browser.name",
    },
    canvas: {
      description: "pluginManager.plugin.canvas.description",
      name: "pluginManager.plugin.canvas.name",
    },
    core: {
      description: "pluginManager.plugin.core.description",
      name: "pluginManager.plugin.core.name",
    },
    cost: {
      description: "pluginManager.plugin.cost.description",
      name: "pluginManager.plugin.cost.name",
    },
    document: {
      description: "pluginManager.plugin.document.description",
      name: "pluginManager.plugin.document.name",
    },
    git: {
      description: "pluginManager.plugin.git.description",
      name: "pluginManager.plugin.git.name",
    },
    issues: {
      description: "pluginManager.plugin.issues.description",
      name: "pluginManager.plugin.issues.name",
    },
    kernel: {
      description: "pluginManager.plugin.kernel.description",
      name: "pluginManager.plugin.kernel.name",
    },
    keymap: {
      description: "pluginManager.plugin.keymap.description",
      name: "pluginManager.plugin.keymap.name",
    },
    lsp: {
      description: "pluginManager.plugin.lsp.description",
      name: "pluginManager.plugin.lsp.name",
    },
    market: {
      description: "pluginManager.plugin.market.description",
      name: "pluginManager.plugin.market.name",
    },
    memory: {
      description: "pluginManager.plugin.memory.description",
      name: "pluginManager.plugin.memory.name",
    },
    remote: {
      description: "pluginManager.plugin.remote.description",
      name: "pluginManager.plugin.remote.name",
    },
    scenes: {
      description: "pluginManager.plugin.scenes.description",
      name: "pluginManager.plugin.scenes.name",
    },
    skills: {
      description: "pluginManager.plugin.skills.description",
      name: "pluginManager.plugin.skills.name",
    },
    terminal: {
      description: "pluginManager.plugin.terminal.description",
      name: "pluginManager.plugin.terminal.name",
    },
    usage: {
      description: "pluginManager.plugin.usage.description",
      name: "pluginManager.plugin.usage.name",
    },
    voice: {
      description: "pluginManager.plugin.voice.description",
      name: "pluginManager.plugin.voice.name",
    },
    workspace: {
      description: "pluginManager.plugin.workspace.description",
      name: "pluginManager.plugin.workspace.name",
    },
  };

const componentKeys: Record<
  string,
  { name: StringKey; description: StringKey }
> = {
  "automation.page": {
    description: "pluginManager.component.automation.description",
    name: "pluginManager.component.automation.name",
  },
  "browser.dock": {
    description: "pluginManager.component.browserDock.description",
    name: "pluginManager.component.browserDock.name",
  },
  "canvas.editor": {
    description: "pluginManager.component.canvas.description",
    name: "pluginManager.component.canvas.name",
  },
  "device-sync.settings": {
    description: "pluginManager.component.deviceSync.description",
    name: "pluginManager.component.deviceSync.name",
  },
  "files.surface": {
    description: "pluginManager.component.files.description",
    name: "pluginManager.component.files.name",
  },
  "git.surface": {
    description: "pluginManager.component.git.description",
    name: "pluginManager.component.git.name",
  },
  "issues.modal": {
    description: "pluginManager.component.issues.description",
    name: "pluginManager.component.issues.name",
  },
  "lsp.runtime": {
    description: "pluginManager.component.lsp.description",
    name: "pluginManager.component.lsp.name",
  },
  "memory.settings": {
    description: "pluginManager.component.memory.description",
    name: "pluginManager.component.memory.name",
  },
  "plugin-manager.page": {
    description: "pluginManager.component.manager.description",
    name: "pluginManager.component.manager.name",
  },
  "remote.modal": {
    description: "pluginManager.component.remote.description",
    name: "pluginManager.component.remote.name",
  },
  "scenes.surface": {
    description: "pluginManager.component.scenes.description",
    name: "pluginManager.component.scenes.name",
  },
  "search.modal": {
    description: "pluginManager.component.search.description",
    name: "pluginManager.component.search.name",
  },
  "terminal.dock": {
    description: "pluginManager.component.terminalDock.description",
    name: "pluginManager.component.terminalDock.name",
  },
  "usage.settings": {
    description: "pluginManager.component.usage.description",
    name: "pluginManager.component.usage.name",
  },
  "voice.composer": {
    description: "pluginManager.component.voice.description",
    name: "pluginManager.component.voice.name",
  },
};

const categoryKeys: Record<string, StringKey> = {
  automation: "pluginManager.category.automation",
  developer_tools: "pluginManager.category.developerTools",
  foundation: "pluginManager.category.foundation",
  integration: "pluginManager.category.integration",
  interface: "pluginManager.category.interface",
  other: "pluginManager.category.other",
  workspace: "pluginManager.category.workspace",
};

export function createPluginManagerLabels(t: Translate): PluginManagerLabels {
  const status = Object.fromEntries(
    Object.entries(statusKeys).map(([key, value]) => [key, t(value)])
  ) as Record<PluginManagerStatus, string>;
  const sourceNames = Object.fromEntries(
    Object.entries(sourceKeys).map(([key, value]) => [key, t(value)])
  ) as Record<PluginManagerSource, string>;
  return {
    activeResources: t("pluginManager.activeResources"),
    advancedJson: t("pluginManager.advancedJson"),
    affectedPlugins: t("pluginManager.affectedPlugins"),
    applyScaffold: t("pluginHub.applyScaffold"),
    bundleEnabled: (name, enabled) => {
      return t(
        enabled
          ? "pluginManager.bundleEnabled"
          : "pluginManager.bundleDisabled",
        { name }
      );
    },
    bundleInstalled: (result) => {
      return t("pluginManager.bundleInstalled", {
        name: result.name,
        version:
          result.version != null && result.version !== ""
            ? ` ${result.version}`
            : "",
      });
    },
    bundleManagement: t("pluginManager.bundleManagement"),
    bundleManagementUserOnly: t("pluginManager.bundleManagementUserOnly"),
    bundleTrusted: (name, trusted) => {
      return t(
        trusted
          ? "pluginManager.bundleTrusted"
          : "pluginManager.bundleTrustRevoked",
        { name }
      );
    },
    bundleUninstalled: (name, keepData) => {
      return t(
        keepData
          ? "pluginManager.bundleUninstalledDataKept"
          : "pluginManager.bundleUninstalled",
        { name }
      );
    },
    cancel: t("pluginManager.cancel"),
    changeApplied: (name, state) => {
      return t("pluginManager.changeApplied", {
        name,
        state:
          state === "enabled"
            ? t("pluginManager.enabled")
            : state === "disabled"
              ? t("pluginManager.disabled")
              : t("pluginManager.inherit"),
      });
    },
    changeSummary: (kind, name, state) => {
      return t(
        kind === "component"
          ? state === "disabled"
            ? "pluginManager.componentChangeSummary.disabled"
            : "pluginManager.componentChangeSummary.enabled"
          : state === "disabled"
            ? "pluginManager.pluginChangeSummary.disabled"
            : "pluginManager.pluginChangeSummary.enabled",
        { name }
      );
    },
    closeInstaller: t("pluginManager.closeInstaller"),
    commands: t("pluginManager.commands"),
    componentKind: (kind) =>
      componentKindKeys[kind] ? t(componentKindKeys[kind]) : kind,
    componentList: t("pluginManager.componentList"),
    componentUninstalled: t("pluginHub.componentUninstalledToast"),
    components: t("pluginManager.components"),
    configuration: t("pluginManager.configuration"),
    configurationHint: t("pluginManager.configurationHint"),
    confirm: t("pluginManager.confirm"),
    confirmTitle: t("pluginManager.confirmTitle"),
    contribution: (id, fallback) =>
      contributionKeys[id] ? t(contributionKeys[id]) : fallback,
    contributions: t("pluginManager.contributions"),
    dataOnly: t("pluginManager.dataOnly"),
    definition: t("pluginManager.definition"),
    dependencies: t("pluginManager.dependencies"),
    description: t("pluginManager.description"),
    diagnostics: t("pluginManager.diagnostics"),
    disabled: t("pluginManager.disabled"),
    enabled: t("pluginManager.enabled"),
    form: t("pluginManager.form"),
    githubHint: t("pluginManager.githubHint"),
    githubRepository: t("pluginManager.githubRepository"),
    githubRepositoryRequired: t("pluginManager.githubRepositoryRequired"),
    hooks: t("pluginManager.hooks"),
    identifier: t("pluginManager.identifier"),
    inherit: t("pluginManager.inherit"),
    install: t("pluginManager.install"),
    installFromGithub: t("pluginManager.installFromGithub"),
    installed: t("pluginManager.installed"),
    installedBundle: t("pluginManager.installedBundle"),
    installingPlugin: t("pluginManager.installingPlugin"),
    invalidConfigurationObject: t("pluginManager.invalidConfigurationObject"),
    keepPluginData: t("pluginManager.keepPluginData"),
    managePlugin: t("pluginManager.managePlugin"),
    managedByPlugin: t("pluginManager.managedByPlugin"),
    marketplace: t("pluginManager.marketplace"),
    marketplaceInstalled: t("pluginManager.marketplaceInstalled"),
    mcps: t("pluginManager.mcps"),
    missingCount: (count) => t("pluginManager.missingCount", { count }),
    missingDependencies: t("pluginManager.missingDependencies"),
    newSkill: t("pluginHub.newSkill"),
    noDescription: t("pluginManager.noDescription"),
    noResults: t("pluginManager.noResults"),
    notTrusted: t("pluginManager.notTrusted"),
    openMarketplace: t("pluginHub.openMarketplace"),
    plugin: t("pluginManager.plugin"),
    pluginList: t("pluginManager.pluginList"),
    plugins: t("pluginManager.plugins"),
    projectOnly: t("pluginManager.projectOnly"),
    projectScope: (project) => project.label,
    projectState: (name) => t("pluginManager.projectState", { name }),
    refresh: t("pluginManager.refresh"),
    required: t("pluginManager.required"),
    resetDefaults: t("pluginManager.resetDefaults"),
    resourceList: (tab) => {
      return t(
        tab === "mcps"
          ? "pluginManager.mcpList"
          : tab === "skills"
            ? "pluginManager.skillList"
            : "pluginManager.hookList"
      );
    },
    restoredLastGood: t("pluginManager.restoredLastGood"),
    reviewSource: t("pluginManager.reviewSource"),
    revokeTrust: t("pluginManager.revokeTrust"),
    safeMode: t("pluginManager.safeMode"),
    saveConfiguration: t("pluginManager.saveConfiguration"),
    saving: t("pluginManager.saving"),
    scaffoldApplied: (count) =>
      t("pluginHub.scaffoldInstalledToast", { count }),
    scaffoldFiles: (count) => t("pluginHub.scaffoldFiles", { count }),
    scope: t("pluginManager.scope"),
    search: t("pluginManager.search"),
    searchPlaceholder: (tab) => {
      return t(
        tab === "plugins"
          ? "pluginManager.searchPlugins"
          : tab === "mcps"
            ? "pluginManager.searchMcps"
            : tab === "skills"
              ? "pluginManager.searchSkills"
              : tab === "hooks"
                ? "pluginManager.searchHooks"
                : "pluginManager.searchMarketplace"
      );
    },
    services: t("pluginManager.services"),
    settingsReset: t("pluginManager.settingsReset"),
    skills: t("pluginManager.skills"),
    source: t("pluginManager.source"),
    sourceNames,
    status,
    title: t("pluginManager.title"),
    trustBeforeEnabling: t("pluginManager.trustBeforeEnabling"),
    trustPlugin: t("pluginManager.trustPlugin"),
    trustRequired: t("pluginManager.trustRequired"),
    trusted: t("pluginManager.trusted"),
    uiSlot: t("pluginManager.uiSlot"),
    unavailable: t("pluginManager.unavailable"),
    uninstall: t("pluginManager.uninstall"),
    uninstallDescription: t("pluginManager.uninstallDescription"),
    uninstallTitle: (name) => t("pluginManager.uninstallTitle", { name }),
    use: t("pluginHub.use"),
    userOnly: t("pluginManager.userOnly"),
    userScope: t("pluginManager.userScope"),
  };
}

export function localizePluginManagerCatalog(
  model: PluginManagerCatalogModel,
  t: Translate
): PluginManagerCatalogModel {
  const pluginName = (id: string, fallback: string) =>
    Boolean(pluginKeys[id]) ? t(pluginKeys[id].name) : fallback;
  return {
    ...model,
    components: model.components.map((component) => {
      const keys = componentKeys[component.id];
      const isFirstParty = component.source !== "bundle";
      return {
        ...component,
        description:
          Boolean(keys) && isFirstParty
            ? t(keys.description)
            : component.description,
        name: Boolean(keys) && isFirstParty ? t(keys.name) : component.name,
        pluginName: isFirstParty
          ? pluginName(component.pluginId, component.pluginName)
          : component.pluginName,
      };
    }),
    plugins: model.plugins.map((plugin) => {
      const keys = pluginKeys[plugin.id];
      if (keys == null || plugin.source === "bundle") {
        return plugin;
      }
      return {
        ...plugin,
        bundle: plugin.bundle
          ? {
              ...plugin.bundle,
              contributions: plugin.bundle.contributions.map((item) => {
                return {
                  ...item,
                  label: contributionKeys[item.id]
                    ? t(contributionKeys[item.id])
                    : item.label,
                };
              }),
            }
          : undefined,
        category:
          plugin.category != null &&
          plugin.category !== "" &&
          categoryKeys[plugin.category]
            ? t(categoryKeys[plugin.category])
            : plugin.category,
        dependencies: plugin.dependencies?.map((dependency) => {
          return dependency.endsWith(" (optional)")
            ? t("pluginManager.optionalDependency", {
                id: dependency.slice(0, -11),
              })
            : dependency;
        }),
        description: t(keys.description),
        name: t(keys.name),
      };
    }),
  };
}
