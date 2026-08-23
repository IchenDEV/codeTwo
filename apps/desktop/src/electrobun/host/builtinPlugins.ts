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
  components: string[];
}

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
    components: ["plugin-manager.page"],
  }),
  plugin("workspace", "Workspace files, project rules, and project scripts.", {
    category: "workspace",
    scopeSupport: ["user", "project"],
    services: ["workspace"],
    components: ["files.surface"],
  }),
  plugin("workspace-search", "Project-wide content search.", {
    category: "workspace",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
    components: ["search.modal"],
  }),
  plugin("git", "Source control, checkpoints, commits, pushes, and pull requests.", {
    category: "developer_tools",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
    components: ["git.surface"],
  }),
  plugin("terminal", "Persistent project terminal sessions.", {
    origin: "host",
    category: "developer_tools",
    scopeSupport: ["user", "project"],
    services: ["terminal"],
    components: ["terminal.dock"],
  }),
  plugin("lsp", "Language-server discovery and project lifecycle.", {
    origin: "host",
    category: "developer_tools",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
    services: ["lsp"],
    components: ["lsp.runtime"],
  }),
  plugin("automation", "Scheduled work and automation history.", {
    category: "automation",
    components: ["automation.page"],
  }),
  plugin("artifacts", "Session artifact persistence and export.", {
    category: "workspace",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
  }),
  plugin("browser", "Authenticated in-app browser tools and dock surface.", {
    origin: "host",
    category: "interface",
    components: ["browser.dock"],
  }),
  plugin("browser-use", "Provider-neutral browser automation backend selection.", {
    origin: "host",
    category: "integration",
    services: ["browser-use"],
  }),
  plugin("canvas", "Structured visual drafts, snapshots, and exports.", {
    category: "interface",
    services: ["canvas"],
    components: ["canvas.editor"],
  }),
  plugin("document", "Document compilation for structured canvas content.", {
    category: "interface",
    dependencies: ["canvas", "skills"],
  }),
  plugin("issues", "Issue browsing, context, and delegation records.", {
    category: "integration",
    scopeSupport: ["user", "project"],
    dependencies: ["workspace"],
    components: ["issues.modal"],
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
    components: ["memory.settings"],
  }),
  plugin("remote", "Remote-device pairing and connection management.", {
    origin: "host",
    category: "integration",
    components: ["remote.modal"],
  }),
  plugin("scenes", "Agent scenes, pipelines, scheduling, and scene artifacts.", {
    category: "automation",
    dependencies: ["skills"],
    services: ["scenes"],
    components: ["scenes.surface"],
  }),
  plugin("skills", "Installed skill discovery and skill-library operations.", {
    category: "automation",
    dependencies: ["kernel"],
    services: ["skills"],
  }),
  plugin("usage", "Provider quota and usage reporting.", {
    category: "other",
    components: ["usage.settings"],
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
    components: ["voice.composer"],
  }),
] as const;

export const BUILTIN_PLUGIN_BY_ID = new Map(BUILTIN_PLUGINS.map((definition) => [definition.id, definition]));

const COMMAND_OWNER_BY_PREFIX: Readonly<Record<string, string>> = {
  artifacts: "artifacts",
  automation: "automation",
  browser_use: "browser-use",
  canvas: "canvas",
  computer_use: "computer-use",
  cost: "cost",
  document: "document",
  engine: "core",
  extensions: "kernel",
  git: "git",
  github: "git",
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
