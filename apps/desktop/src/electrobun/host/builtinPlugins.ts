export type BuiltinPluginCategory =
  | "foundation"
  | "workspace"
  | "automation"
  | "developer_tools"
  | "interface"
  | "integration"
  | "other";

export type BuiltinPluginOrigin = "built_in" | "host";
export type BuiltinPluginScope = "user" | "project";

export interface BuiltinUiComponentDefinition {
  id: string;
  name: string;
  description: string;
  kind: string;
  slot: string;
  required?: boolean;
}

export interface BuiltinPluginDefinition {
  id: string;
  description: string;
  origin: BuiltinPluginOrigin;
  category: BuiltinPluginCategory;
  scopeSupport: BuiltinPluginScope[];
  essential: boolean;
  defaultEnabled: boolean;
  dependencies: string[];
  services: string[];
  components: BuiltinUiComponentDefinition[];
}

const component = (
  id: string,
  name: string,
  description: string,
  kind: string,
  slot: string,
  required = false,
): BuiltinUiComponentDefinition => ({
  id,
  name,
  description,
  kind,
  slot,
  ...(required ? { required: true } : {}),
});

const plugin = (
  id: string,
  description: string,
  options: Partial<Omit<BuiltinPluginDefinition, "id" | "description">> = {},
): BuiltinPluginDefinition => ({
  id,
  description,
  origin: "built_in",
  category: "other",
  scopeSupport: ["user"],
  essential: false,
  defaultEnabled: true,
  dependencies: ["core"],
  services: [],
  components: [],
  ...options,
});

/**
 * The in-process desktop graph. Only core and kernel are recovery-critical;
 * every other product capability participates in normal plugin policy.
 */
export const BUILTIN_PLUGINS: readonly BuiltinPluginDefinition[] = [
  plugin("core", "Bun runtime, persistence, providers, sessions, and agent execution.", {
    origin: "host",
    category: "foundation",
    essential: true,
    dependencies: [],
    services: ["bun-runtime", "sqlite", "store", "acp", "engine"],
  }),
  plugin("kernel", "Plugin policy, recovery, bundle management, and runtime inspection.", {
    origin: "host",
    category: "foundation",
    essential: true,
    dependencies: ["core"],
    services: ["plugin-manager", "plugin-hub", "extensions-runtime"],
    components: [component(
      "plugin-manager.page",
      "Plugin manager",
      "The required management plane used to recover and re-enable other features.",
      "page",
      "app.page",
      true,
    )],
  }),
  plugin("workspace", "Workspace files, project rules, and project scripts.", {
    category: "workspace",
    scopeSupport: ["user", "project"],
    services: ["workspace"],
    components: [component("files.surface", "Files", "Workspace file tree, viewer, and file browser.", "dockSurface", "dock.tabs")],
  }),
  plugin("workspace-search", "Project-wide content search.", {
    category: "workspace",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
    components: [component("search.modal", "Workspace search", "Project-wide content search and result opener.", "modal", "app.dialogs")],
  }),
  plugin("git", "Source control, checkpoints, commits, pushes, and pull requests.", {
    category: "developer_tools",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
    components: [component("git.surface", "Source control", "Git dock, source-control dialog, and related commands.", "dockSurface", "dock.tabs")],
  }),
  plugin("terminal", "Persistent project terminal sessions.", {
    origin: "host",
    category: "developer_tools",
    scopeSupport: ["user", "project"],
    services: ["terminal"],
    components: [component("terminal.dock", "Terminal dock", "Persistent terminal sessions in the side dock.", "dockSurface", "dock.tabs")],
  }),
  plugin("lsp", "Language-server discovery and project lifecycle.", {
    origin: "host",
    category: "developer_tools",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
    services: ["lsp"],
    components: [component("lsp.runtime", "Language servers", "Project language-server discovery and lifecycle.", "runtime", "project.runtime")],
  }),
  plugin("automation", "Scheduled work and automation history.", {
    category: "automation",
    components: [component("automation.page", "Automations", "Scheduled-work page and automation entry points.", "page", "app.page")],
  }),
  plugin("artifacts", "Session artifact persistence and export.", {
    category: "workspace",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
  }),
  plugin("browser", "Authenticated in-app browser tools and dock surface.", {
    origin: "host",
    category: "interface",
    components: [component("browser.dock", "Browser dock", "Authenticated in-app browser surface and its dock opener.", "dockSurface", "dock.tabs")],
  }),
  plugin("browser-use", "Provider-neutral browser automation backend selection.", {
    origin: "host",
    category: "integration",
    services: ["browser-use"],
  }),
  plugin("device-sync", "Multi-device synchronization with shared merge and conflict rules.", {
    origin: "host",
    category: "integration",
    services: ["device-sync"],
    components: ["device-sync.settings"],
  }),
  plugin("canvas", "Structured visual drafts, snapshots, and exports.", {
    category: "interface",
    services: ["canvas"],
    components: [component(
      "canvas.editor",
      "Canvas editor",
      "Structured visual canvas blocks. Component policy is separate from the Canvas safety feature gate; enabling this component does not open the production gate.",
      "editorBlock",
      "editor.blocks",
    )],
  }),
  plugin("document", "Document compilation for structured canvas content.", {
    category: "interface",
    dependencies: ["canvas", "skills"],
  }),
  plugin("issues", "Issue browsing, context, and delegation records.", {
    category: "integration",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
    components: [component("issues.modal", "Issues", "GitHub and Linear issue browser and delegation flow.", "modal", "app.dialogs")],
  }),
  plugin("keymap", "Desktop keyboard shortcuts and overrides.", {
    category: "interface",
    services: ["keymap"],
  }),
  plugin("market", "Plugin Hub discovery and installation surfaces.", {
    category: "integration",
    dependencies: ["skills"],
  }),
  plugin("memory", "Project memory, recall policy, and receipts.", {
    category: "automation",
    services: ["memory"],
    components: [component("memory.settings", "Memory", "Memory policy controls and receipt surfaces.", "settingsSection", "settings.sections")],
  }),
  plugin("remote", "Remote-device pairing and connection management.", {
    origin: "host",
    category: "integration",
    components: [component("remote.modal", "Remote control", "Remote-device pairing and connection management.", "modal", "app.dialogs")],
  }),
  plugin("scenes", "Agent scenes, pipelines, scheduling, and scene artifacts.", {
    category: "automation",
    dependencies: ["skills"],
    services: ["scenes"],
    components: [component("scenes.surface", "Agent scenes", "Scene picker, studio, banners, and pipeline controls.", "sessionSurface", "session.chrome")],
  }),
  plugin("skills", "Installed skill discovery and skill-library operations.", {
    category: "automation",
    dependencies: ["kernel"],
    services: ["skills"],
  }),
  plugin("usage", "Provider quota and usage reporting.", {
    category: "other",
    components: [component("usage.settings", "Usage", "Provider quota and usage settings surfaces.", "settingsSection", "settings.sections")],
  }),
  plugin("cost", "Per-session cost reporting.", {
    category: "other",
    dependencies: ["usage"],
    services: ["cost"],
  }),
  plugin("computer-use", "Provider-neutral computer-use backend selection.", {
    origin: "host",
    category: "integration",
    services: ["computer-use"],
  }),
  plugin("voice", "Native dictation and structured voice input.", {
    origin: "host",
    category: "interface",
    components: [component("voice.composer", "Voice input", "Composer dictation and structured voice input.", "composerAction", "composer.actions")],
  }),
] as const;

export const BUILTIN_UI_COMPONENTS = BUILTIN_PLUGINS.flatMap((definition) =>
  definition.components.map((entry) => ({ ...entry, pluginId: definition.id }))
);

export const BUILTIN_PLUGIN_BY_ID = new Map(BUILTIN_PLUGINS.map((definition) => [definition.id, definition]));

const COMMAND_OWNER_BY_PREFIX: Readonly<Record<string, string>> = {
  artifacts: "artifacts",
  automation: "automation",
  browser_use: "browser-use",
  device_sync: "device-sync",
  canvas: "canvas",
  computer_use: "computer-use",
  cost: "cost",
  document: "document",
  engine: "core",
  extensions: "kernel",
  git: "git",
  github: "git",
  handoff: "core",
  issues: "issues",
  kernel: "kernel",
  keymap: "keymap",
  lsp: "lsp",
  market: "market",
  memory: "memory",
  pipelines: "scenes",
  plugins: "kernel",
  projects: "core",
  providers: "core",
  remote: "remote",
  scene_artifacts: "scenes",
  scenes: "scenes",
  sessions: "core",
  skills: "skills",
  terminal: "terminal",
  usage: "usage",
  voice: "voice",
  workspace: "workspace",
  worktrees: "core",
};

export function builtinPluginForCommand(command: string): BuiltinPluginDefinition {
  const owner = command === "workspace.search" || command === "workspace.cancel_search"
    ? "workspace-search"
    : COMMAND_OWNER_BY_PREFIX[command.split(".", 1)[0] ?? ""];
  const definition = owner ? BUILTIN_PLUGIN_BY_ID.get(owner) : undefined;
  if (!definition) throw new Error(`Pure Bun command \`${command}\` has no built-in plugin owner`);
  return definition;
}

export function builtinPluginScopeId(pluginId: string): number {
  const index = BUILTIN_PLUGINS.findIndex((definition) => definition.id === pluginId);
  if (index < 0) throw new Error(`unknown built-in plugin \`${pluginId}\``);
  return index + 1;
}
