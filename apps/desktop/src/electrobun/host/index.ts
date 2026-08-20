import { readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

import type { DesktopEvent } from "../rpc";
import {
  AcpPeer,
  providerById,
  providerSummaries,
  reportedConfigOptions,
  reportedModels,
  type ProviderDefinition,
} from "./acp";
import { BunDatabase } from "./database";
import {
  browserUseSettings,
  computerUseSettings,
  detectHostToolEvidence,
  projectProviderToolset,
  saveComputerUseSelection,
  saveBrowserUseSelection,
  withProviderToolInstructions,
  type HostToolEvidence,
  type ProviderToolset,
} from "./providerTools";
import {
  LspManager,
  TerminalManager,
  augmentGuiPath,
  copyPath,
  createDir,
  createFile,
  deletePath,
  gitCheckpoint,
  gitCheckpoints,
  gitDiff,
  gitDiffStat,
  gitIsRepo,
  gitSourceControl,
  gitStage,
  gitStatus,
  gitUnstage,
  listDir,
  listFiles,
  readBinary,
  readText,
  renamePath,
  runProcess,
  which,
  workspacePath,
  worktreeBaselines,
  writeText,
} from "./system";

type Args = Record<string, unknown>;
type Handler = (args: Args, projectPath: string | null) => unknown | Promise<unknown>;

interface SessionRuntime {
  id: string;
  cwd: string;
  provider: ProviderDefinition;
  toolset: ProviderToolset;
  model: string | null;
  permissionMode: string;
  sandboxPolicy: string;
  persistedAcpSessionId: string | null;
  peer: AcpPeer | null;
  connectPromise: Promise<AcpPeer> | null;
  acpSessionId: string | null;
  activityRevision: number;
  busy: boolean;
  replaying: boolean;
  turnId: string | null;
  shuttingDown: boolean;
}

interface PendingPermission {
  session: string;
  resolve: (value: unknown) => void;
}

interface PendingElicitation {
  session: string;
  resolve: (value: unknown) => void;
}

const EMPTY_USAGE = {
  windows: [
    { label: "5h session", window_secs: 18000, input_tokens: 0, cached_tokens: 0, output_tokens: 0, total_tokens: 0, limit: null, fraction: null, resets_in_secs: 0 },
    { label: "week", window_secs: 604800, input_tokens: 0, cached_tokens: 0, output_tokens: 0, total_tokens: 0, limit: null, fraction: null, resets_in_secs: 0 },
    { label: "month", window_secs: 2592000, input_tokens: 0, cached_tokens: 0, output_tokens: 0, total_tokens: 0, limit: null, fraction: null, resets_in_secs: 0 },
  ],
  by_source: [],
  transcripts: 0,
};

const DEFAULT_KEYMAP: [string, string, string][] = [
  ["run", "Mod+Enter", "Run prompt"],
  ["new_session", "Mod+N", "New session"],
  ["cancel", "Mod+.", "Cancel turn"],
  ["toggle_terminal", "Mod+J", "Toggle terminal"],
  ["toggle_browser", "Mod+B", "Toggle browser"],
  ["toggle_git", "Mod+Shift+B", "Toggle git panel"],
  ["close_panel", "Escape", "Close side panel"],
  ["open_skill_picker", "Mod+/", "Open skill picker"],
  ["focus_editor", "Mod+E", "Focus editor"],
  ["toggle_doc_mode", "Mod+Shift+E", "Expand document to full height"],
  ["open_command_palette", "Mod+K", "Command palette"],
  ["open_source_control", "Mod+Shift+G", "Source control"],
  ["open_market", "Mod+Shift+M", "Open Plugin Hub"],
  ["open_files", "Mod+P", "Browse workspace files"],
  ["search_workspace", "Mod+Shift+F", "Search workspace contents"],
  ["open_issues", "Mod+Shift+I", "Open issues"],
  ["open_usage", "Mod+Shift+U", "Open usage"],
  ["open_settings", "Mod+,", "Open settings"],
  ["cycle_permission_mode", "Mod+Shift+P", "Cycle permission mode"],
  ["refresh_git", "Mod+G", "Refresh git status"],
  ["prev_session", "Mod+Alt+ArrowUp", "Previous session"],
  ["next_session", "Mod+Alt+ArrowDown", "Next session"],
  ["open_mission_control", "Mod+Shift+O", "Open mission control"],
];

function object(value: unknown): Args {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Args : {};
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function boolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function providerId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as Args).custom === "string") {
    return (value as Args).custom as string;
  }
  return "codex";
}

function textContent(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const content = value as Args;
  return typeof content.text === "string" ? content.text : null;
}

export class PureBunHost {
  private readonly database: BunDatabase;
  private hostTools: HostToolEvidence;
  private readonly terminal: TerminalManager;
  private readonly lsp: LspManager;
  private readonly handlers = new Map<string, Handler>();
  private readonly runtimes = new Map<string, SessionRuntime>();
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private readonly pendingElicitations = new Map<string, PendingElicitation>();
  private readonly toolCalls = new Map<string, { title: string; kind: string | null; agentInput: unknown }>();
  private shuttingDown = false;

  constructor(dataDir: string, private readonly onEvent: (event: DesktopEvent) => void) {
    augmentGuiPath();
    this.hostTools = detectHostToolEvidence(process.env, dataDir);
    this.database = new BunDatabase(dataDir);
    this.terminal = new TerminalManager(onEvent);
    this.lsp = new LspManager(onEvent);
    this.registerCommands(dataDir);
    queueMicrotask(() => {
      this.onEvent({
        name: "host-ready",
        payload: { runtime: "bun", commands: [...this.handlers.keys()].sort() },
      });
    });
  }

  commands(): string[] {
    return [...this.handlers.keys()].sort();
  }

  async call(name: string, args: unknown, projectPath: string | null): Promise<unknown> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Pure Bun host does not implement command \`${name}\``);
    }
    return handler(object(args), projectPath);
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const pending of this.pendingPermissions.values()) {
      pending.resolve({ outcome: "cancelled" });
    }
    for (const pending of this.pendingElicitations.values()) {
      pending.resolve({ action: "cancel" });
    }
    this.pendingPermissions.clear();
    this.pendingElicitations.clear();
    this.toolCalls.clear();
    for (const runtime of this.runtimes.values()) {
      runtime.shuttingDown = true;
      runtime.peer?.shutdown();
    }
    this.runtimes.clear();
    this.terminal.shutdown();
    this.lsp.shutdown();
    this.database.close();
  }

  private register(name: string, handler: Handler): void {
    if (this.handlers.has(name)) throw new Error(`duplicate Pure Bun command: ${name}`);
    this.handlers.set(name, handler);
  }

  private registerCommands(dataDir: string): void {
    this.register("providers.list", () => providerSummaries(this.hostTools));
    this.register("computer_use.settings", () => computerUseSettings(this.hostTools));
    this.register("computer_use.select", (args) => {
      const provider = string(args.provider, "provider");
      const backend = string(args.backend, "backend");
      saveComputerUseSelection(dataDir, provider, backend, this.hostTools);
      this.hostTools = detectHostToolEvidence(process.env, dataDir);
      return computerUseSettings(this.hostTools);
    });
    this.register("browser_use.settings", () => browserUseSettings(this.hostTools));
    this.register("browser_use.select", (args) => {
      const provider = string(args.provider, "provider");
      const backend = string(args.backend, "backend");
      saveBrowserUseSelection(dataDir, provider, backend, this.hostTools);
      this.hostTools = detectHostToolEvidence(process.env, dataDir);
      return browserUseSettings(this.hostTools);
    });
    this.register("projects.list", () => this.database.listProjects());
    this.register("projects.add", (args) => {
      const path = string(args.path, "path");
      const canonical = workspacePath(path, ".");
      return this.database.addProject(canonical, optionalString(args.name));
    });
    this.register("projects.open", (args) => this.database.touchProject(string(args.path, "path")));
    this.register("projects.rename", (args) => this.database.renameProject(string(args.path, "path"), string(args.name, "name")));
    this.register("projects.set_worktree_mode", (args) => this.database.setProjectWorktreeMode(string(args.path, "path"), optionalString(args.mode)));
    this.register("projects.remove", (args) => this.database.removeProject(string(args.path, "path")));

    this.register("sessions.list", () => this.database.listSessions(false));
    this.register("sessions.archived", () => this.database.listSessions(true));
    this.register("sessions.previews", () => this.database.sessionPreviews());
    this.register("sessions.transcript", (args) => this.database.transcriptPage(
      string(args.session, "session"),
      typeof args.before === "number" ? args.before : null,
      number(args.limit, 20),
    ));
    this.register("sessions.search", (args) => this.database.searchSessions(string(args.query, "query"), number(args.limit, 12)));
    this.register("sessions.rename", (args) => this.database.renameSession(string(args.session, "session"), string(args.title, "title")));
    this.register("sessions.set_archived", (args) => this.database.setSessionFlag(string(args.session, "session"), "archived", boolean(args.value)));
    this.register("sessions.set_pinned", (args) => this.database.setSessionFlag(string(args.session, "session"), "pinned", boolean(args.value)));
    this.register("sessions.diff_stat", async (args) => {
      const session = this.database.getSession(string(args.session, "session"));
      return session ? gitDiffStat(string(session.cwd, "cwd")) : null;
    });

    this.register("engine.new_session", (args) => this.newSession(args));
    this.register("engine.prompt", (args) => this.startPrompt(args));
    this.register("engine.cancel", (args) => this.cancel(string(args.session, "session")));
    this.register("engine.answer_permission", (args) => this.answerPermission(args));
    this.register("engine.answer_elicitation", (args) => this.answerElicitation(args));
    this.register("engine.set_permission_mode", (args) => this.setPolicy(
      string(args.session, "session"),
      string(args.mode, "mode"),
      null,
      null,
    ));
    this.register("engine.set_sandbox", (args) => this.setPolicy(
      string(args.session, "session"),
      null,
      string(args.sandbox, "sandbox"),
      null,
    ));
    this.register("engine.set_execution_policy", (args) => this.setPolicy(
      string(args.session, "session"),
      string(args.mode, "mode"),
      string(args.sandbox, "sandbox"),
      optionalString(args.request_id),
    ));
    this.register("engine.set_model", (args) => this.setModel(string(args.session, "session"), string(args.model, "model")));
    this.register("engine.set_config_option", (args) => this.setConfigOption(
      string(args.session, "session"),
      string(args.config_id, "config_id"),
      string(args.value, "value"),
    ));

    this.register("workspace.default_cwd", () => process.env.HOME || process.cwd());
    this.register("workspace.list_dir", (args) => listDir(string(args.cwd, "cwd"), string(args.path, "path")));
    this.register("workspace.list_files", (args) => listFiles(string(args.cwd, "cwd"), optionalString(args.query) ?? "", number(args.limit, 50)));
    this.register("workspace.create_file", (args) => createFile(string(args.cwd, "cwd"), string(args.path, "path")));
    this.register("workspace.create_dir", (args) => createDir(string(args.cwd, "cwd"), string(args.path, "path")));
    this.register("workspace.read_text", (args) => readText(string(args.cwd, "cwd"), string(args.path, "path")));
    this.register("workspace.read_binary", (args) => readBinary(string(args.cwd, "cwd"), string(args.path, "path")));
    this.register("workspace.write_text", (args) => writeText(string(args.cwd, "cwd"), string(args.path, "path"), String(args.content ?? "")));
    this.register("workspace.rename", (args) => renamePath(string(args.cwd, "cwd"), string(args.from, "from"), string(args.to, "to")));
    this.register("workspace.copy", (args) => copyPath(string(args.cwd, "cwd"), string(args.from, "from"), string(args.to, "to")));
    this.register("workspace.delete", (args) => deletePath(string(args.cwd, "cwd"), string(args.path, "path")));
    this.register("workspace.rules", (args) => this.workspaceRules(string(args.cwd, "cwd")));
    this.register("workspace.source_control", (args) => gitSourceControl(string(args.cwd, "cwd")));
    this.register("workspace.search", (args) => this.searchWorkspace(args));
    this.register("workspace.cancel_search", () => false);
    this.register("workspace.scripts", () => []);
    this.register("workspace.run_script", () => this.unsupported("workspace.run_script", "project script execution"));

    this.register("worktrees.baselines", (args) => worktreeBaselines(string(args.cwd, "cwd")));
    this.register("worktrees.list", () => []);
    this.register("worktrees.discard_session", () => this.unsupported("worktrees.discard_session", "worktree lifecycle"));
    this.register("worktrees.discard_orphan", () => this.unsupported("worktrees.discard_orphan", "worktree lifecycle"));

    this.register("git.is_repo", (args) => gitIsRepo(string(args.cwd, "cwd")));
    this.register("git.status", (args) => gitStatus(string(args.cwd, "cwd")));
    this.register("git.diff", (args) => gitDiff(
      string(args.cwd, "cwd"),
      optionalString(args.path),
      (optionalString(args.scope) ?? "all") as "all" | "staged" | "unstaged",
    ));
    this.register("git.diff_since", (args) => gitDiff(string(args.cwd, "cwd"), null, "all", string(args.commit, "commit")));
    this.register("git.diff_stat", (args) => gitDiffStat(string(args.cwd, "cwd")));
    this.register("git.stage", (args) => gitStage(string(args.cwd, "cwd"), this.stringArray(args.paths)));
    this.register("git.unstage", (args) => gitUnstage(string(args.cwd, "cwd"), this.stringArray(args.paths)));
    this.register("git.checkpoint", (args) => gitCheckpoint(string(args.cwd, "cwd"), string(args.message, "message")));
    this.register("git.checkpoints", (args) => gitCheckpoints(string(args.cwd, "cwd")));
    this.register("git.commit", (args) => this.checkedProcess(
      ["git", "commit", "-m", string(args.message, "message")],
      string(args.cwd, "cwd"),
    ));
    this.register("git.push", (args) => this.checkedProcess(["git", "push"], string(args.cwd, "cwd")));
    this.register("git.revert", (args) => this.restoreCheckpoint(
      string(args.cwd, "cwd"),
      string(args.commit, "commit"),
    ));
    this.register("git.suggest_message", async (args) => this.suggestCommitMessage(string(args.cwd, "cwd")));
    this.register("git.create_pr", async (args) => this.createPullRequest(args));

    this.register("terminal.tmux_available", () => which("tmux") !== null);
    this.register("terminal.spawn", (args, projectPath) => this.terminal.spawn(args, projectPath));
    this.register("terminal.write", (args) => this.terminal.write(string(args.id, "id"), String(args.data ?? "")));
    this.register("terminal.resize", (args) => this.terminal.resize(
      string(args.id, "id"),
      number(args.rows, 24),
      number(args.cols, 80),
    ));
    this.register("terminal.dump", (args) => this.terminal.dump(string(args.id, "id")));
    this.register("terminal.kill", (args) => this.terminal.kill(string(args.id, "id")));

    this.register("lsp.start", (args) => this.lsp.start(string(args.cwd, "cwd"), string(args.lang, "lang")));
    this.register("lsp.send", (args) => this.lsp.send(string(args.key, "key"), string(args.payload, "payload")));
    this.register("lsp.set_runtime_enabled", (args, projectPath) => this.lsp.setRuntimeEnabled(boolean(args.enabled), projectPath));

    this.register("memory.settings", () => this.database.memorySettings());
    this.register("memory.set_settings", (args) => this.database.setMemorySettings(object(args.settings)));
    this.register("memory.project_policy", (args) => this.database.memoryProjectPolicy(string(args.project_path, "project_path")));
    this.register("memory.set_project_policy", (args) => this.database.setMemoryProjectPolicy(
      string(args.project_path, "project_path"),
      object(args.policy),
    ));
    this.register("memory.list", (args) => this.database.listMemories(string(args.project_path, "project_path"), number(args.limit, 100)));
    this.register("memory.manage_list", (args) => this.database.listManagedMemories(string(args.project_path, "project_path"), number(args.limit, 500)));
    this.register("memory.search", (args) => this.database.listMemories(string(args.project_path, "project_path"), number(args.limit, 50), string(args.query, "query")));
    this.register("memory.stats", (args) => this.database.memoryStats(string(args.project_path, "project_path")));
    this.register("memory.add", (args) => this.database.addMemory(
      string(args.project_path, "project_path"),
      string(args.category, "category"),
      string(args.content, "content"),
      boolean(args.pinned, true),
    ));
    this.register("memory.set_pinned", (args) => this.database.setMemoryFlag(string(args.id, "id"), "pinned", boolean(args.value)));
    this.register("memory.set_active", (args) => this.database.setMemoryFlag(string(args.id, "id"), "active", boolean(args.value)));
    this.register("memory.update", (args) => this.database.updateMemory(
      string(args.id, "id"), string(args.category, "category"), string(args.content, "content"),
    ));
    this.register("memory.set_category", (args) => this.database.setMemoryCategory(
      string(args.id, "id"), string(args.category, "category"),
    ));
    this.register("memory.correct", (args) => this.database.correctMemory(
      string(args.id, "id"), string(args.category, "category"), string(args.content, "content"),
    ));
    this.register("memory.delete", (args) => this.database.deleteMemory(string(args.id, "id")));
    this.register("memory.evidence", (args) => this.database.memoryEvidence(string(args.id, "id"), boolean(args.reveal)));
    this.register("memory.usages", (args) => this.database.memoryUsages(string(args.id, "id")));
    this.register("memory.set_session_policy", () => this.unsupported("memory.set_session_policy", "per-session memory policy"));
    this.register("memory.receipts", (args) => this.database.memoryReceipts(string(args.session, "session")));

    this.register("automation.list", () => this.database.listAutomations());
    this.register("automation.create", (args) => this.database.createAutomation(object(args.input)));
    this.register("automation.update", (args) => this.database.updateAutomation(string(args.id, "id"), object(args.input)));
    this.register("automation.set_enabled", (args) => this.database.setAutomationEnabled(string(args.id, "id"), boolean(args.enabled)));
    this.register("automation.delete", (args) => this.database.deleteAutomation(string(args.id, "id")));
    this.register("automation.runs", (args) => this.database.automationRuns(optionalString(args.automation_id), number(args.limit, 50)));
    this.register("automation.run_now", () => this.unsupported("automation.run_now", "background scheduling"));

    this.register("keymap.get", () => this.readKeymap(dataDir));
    this.register("keymap.set", (args) => this.setKeymap(dataDir, string(args.action, "action"), string(args.key, "key")));

    this.register("kernel.commands", () => this.commands().map((name) => ({ name, plugin: "pure-bun", scope: 1, description: null })));
    this.register("kernel.scopes", () => [{
      id: 1,
      parent: null,
      plugin: "pure-bun",
      status: "active",
      error: null,
      inject: { required: [], optional: [] },
      missing: [],
      services: ["bun-runtime", "sqlite", "acp", "terminal", "lsp"],
      commands: this.commands(),
      config: {},
    }]);
    this.register("kernel.plugins", () => [{
      name: "pure-bun",
      description: "In-process Bun desktop runtime",
      enabled: true,
      running: true,
      status: "active",
      config: {},
      schema: null,
      available: false,
    }]);
    this.register("kernel.services", () => ["bun-runtime", "sqlite", "acp", "terminal", "lsp"]);
    this.register("kernel.set_enabled", () => this.unsupported("kernel.set_enabled", "dynamic host plugins"));
    this.register("kernel.configure", () => this.unsupported("kernel.configure", "dynamic host plugins"));
    this.register("plugins.catalog", () => this.pluginCatalog());
    this.register("plugins.plan_change", () => this.unsupported("plugins.plan_change", "dynamic plugin graph"));
    this.register("plugins.apply_change", () => this.unsupported("plugins.apply_change", "dynamic plugin graph"));
    this.register("plugins.reset", () => this.unsupported("plugins.reset", "dynamic plugin graph"));
    this.register("extensions.list", () => ({ running: [], untrusted: [] }));
    this.register("plugins.list", () => []);
    this.register("plugins.scene_dirs", () => []);
    this.register("plugins.import_github", () => this.unsupported("plugins.import_github", "plugin installation"));
    this.register("plugins.read_marketplace", () => this.unsupported("plugins.read_marketplace", "plugin marketplace"));
    this.register("plugins.install_marketplace", () => this.unsupported("plugins.install_marketplace", "plugin marketplace"));
    this.register("plugins.set_enabled", () => this.unsupported("plugins.set_enabled", "plugin lifecycle"));
    this.register("plugins.set_trusted", () => this.unsupported("plugins.set_trusted", "plugin lifecycle"));
    this.register("plugins.uninstall", () => this.unsupported("plugins.uninstall", "plugin lifecycle"));
    this.register("plugins.apply_scaffold", () => this.unsupported("plugins.apply_scaffold", "plugin scaffolds"));
    this.register("market.catalog", () => []);
    this.register("market.install", () => this.unsupported("market.install", "component marketplace"));

    this.register("skills.list", () => []);
    this.register("skills.save", () => this.unsupported("skills.save", "skill library writes"));
    this.register("skills.delete", () => this.unsupported("skills.delete", "skill library writes"));
    this.register("skills.propose_macro", () => this.unsupported("skills.propose_macro", "macro generation"));
    this.register("scenes.list", () => []);
    this.register("scenes.get", () => null);
    this.register("scenes.session", () => null);
    this.register("scenes.session_plan", () => null);
    this.register("scenes.auto", () => ({ enabled: false, selected: null }));
    this.register("scenes.scheduling", () => false);
    this.register("scenes.save", () => this.unsupported("scenes.save", "scene library writes"));
    this.register("scenes.delete", () => this.unsupported("scenes.delete", "scene library writes"));
    this.register("scenes.apply", () => this.unsupported("scenes.apply", "scene application"));
    this.register("scenes.set_session", () => this.unsupported("scenes.set_session", "scene assignment"));
    this.register("scenes.set_auto", () => this.unsupported("scenes.set_auto", "auto scenes"));
    this.register("scenes.set_scheduling", () => this.unsupported("scenes.set_scheduling", "scene scheduling"));
    this.register("scenes.dismiss_banner", () => true);
    this.register("scenes.export_skill_md", () => this.unsupported("scenes.export_skill_md", "scene export"));
    this.register("pipelines.list", () => []);
    this.register("pipelines.instances", () => []);
    this.register("pipelines.instance", () => null);
    this.register("pipelines.session", () => null);
    this.register("pipelines.start", () => this.unsupported("pipelines.start", "pipelines"));
    this.register("pipelines.advance", () => this.unsupported("pipelines.advance", "pipelines"));
    this.register("pipelines.bind_session", () => this.unsupported("pipelines.bind_session", "pipelines"));

    this.register("canvas.feature_state", () => ({ feature: "CODETWO_CANVAS_INPUT_V1", enabled: false, status: "not production-enabled" }));
    for (const name of [
      "canvas.create_draft", "canvas.get_draft", "canvas.update_draft", "canvas.normalize_media",
      "canvas.freeze", "canvas.get_snapshot", "canvas.get_asset", "canvas.get_export",
      "canvas.duplicate", "canvas.tombstone", "canvas.restore", "canvas.purge", "document.compile",
    ]) this.register(name, () => this.unsupported(name, "canvas persistence"));

    this.register("usage.report", () => EMPTY_USAGE);
    this.register("usage.history", (args) => ({
      history: {
        bucket_secs: number(args.days, 30) <= 7 ? 3600 : 86400,
        bucket_count: 0,
        start_ms: 0,
        series: [],
      },
      by_source: [],
    }));
    this.register("usage.provider_quota", (args) => ({
      provider: optionalString(args.provider) ?? "unknown",
      status: "unsupported",
      reason: "unsupported_provider",
      source: null,
      plan: null,
      limit_name: null,
      windows: [],
      credits: null,
      fetched_at_ms: Date.now(),
    }));
    this.register("cost.session", () => null);
    this.register("voice.available", () => false);
    this.register("voice.transcribe", () => this.unsupported("voice.transcribe", "native transcription"));
    this.register("remote.status", () => null);
    this.register("remote.devices", () => []);
    this.register("remote.start", () => this.unsupported("remote.start", "remote server"));
    this.register("remote.stop", () => true);
    this.register("remote.pairing_link", () => null);
    this.register("remote.revoke_device", () => false);

    this.register("issues.github_available", () => which("gh") !== null);
    this.register("issues.list_github", (args) => this.listGithubIssues(string(args.cwd, "cwd"), number(args.limit, 30)));
    this.register("issues.list_linear", () => this.unsupported("issues.list_linear", "Linear API"));
    this.register("issues.context", (args) => this.issueContext(object(args.issue)));
    this.register("issues.comment", () => this.unsupported("issues.comment", "issue mutation"));
    this.register("issues.record_delegation", () => this.unsupported("issues.record_delegation", "delegation ledger"));
    this.register("issues.set_delegation_session", () => this.unsupported("issues.set_delegation_session", "delegation ledger"));
    this.register("issues.set_delegation_comment", () => this.unsupported("issues.set_delegation_comment", "delegation ledger"));
    this.register("issues.delegations", () => []);

    this.register("artifacts.get", () => this.unsupported("artifacts.get", "artifact persistence"));
    this.register("artifacts.save_as", () => this.unsupported("artifacts.save_as", "artifact export"));
    this.register("artifacts.reveal", () => this.unsupported("artifacts.reveal", "artifact reveal"));
    this.register("scene_artifacts.list", () => []);
    this.register("scene_artifacts.content", () => null);
    this.register("scene_artifacts.pin", () => this.unsupported("scene_artifacts.pin", "scene artifacts"));
    this.register("scene_artifacts.record", () => this.unsupported("scene_artifacts.record", "scene artifacts"));
  }

  private newSession(args: Args): boolean {
    if (boolean(args.use_worktree)) {
      throw new Error("Pure Bun trial does not implement isolated worktrees; turn Worktree off for this session");
    }
    const provider = providerById(providerId(args.provider));
    if (!provider) throw new Error(`unknown Pure Bun provider: ${providerId(args.provider)}`);
    const cwd = workspacePath(string(args.cwd, "cwd"), ".");
    const policy = object(args.initial_policy);
    const session = this.database.createSession({
      provider: provider.id,
      cwd,
      permissionMode: optionalString(policy.mode) ?? "ask",
      sandboxPolicy: optionalString(policy.sandbox) ?? "workspace_write",
    });
    const id = string(session.id, "session id");
    this.runtimes.set(id, this.runtimeFromSession(session));
    this.emitEngine({
      event: "session_created",
      session: id,
      cwd,
      project_path: cwd,
      worktree_path: null,
      worktree_baseline: null,
      request_id: optionalString(args.request_id),
    });
    this.emitEngine({ event: "models", session: id, available: provider.models, current: "" });
    return true;
  }

  private startPrompt(args: Args): boolean {
    const sessionId = string(args.session, "session");
    const runtime = this.runtime(sessionId);
    if (runtime.busy) throw new Error("this session already has a running turn");
    const doc = Array.isArray(args.doc) ? args.doc : [];
    const compiled = this.compileDocument(runtime.cwd, doc);
    if (!compiled.display.trim()) throw new Error("prompt is empty");
    const requestId = optionalString(args.request_id);
    const seq = this.database.appendPart(
      sessionId,
      "user",
      { kind: "prompt", text: compiled.canonical, display: compiled.display },
      compiled.canonical,
    );
    runtime.busy = true;
    runtime.turnId = crypto.randomUUID();
    this.setActivity(runtime, {
      kind: "running",
      turn_id: runtime.turnId,
      ...(requestId ? { prompt_request_id: requestId } : {}),
    });
    this.emitEngine({ event: "turn_started", session: sessionId, request_id: requestId, transcript_seq: seq });
    const session = this.database.getSession(sessionId);
    if (session?.title === "Untitled session") {
      const title = compiled.display.replace(/\s+/g, " ").trim().slice(0, 60) || "New session";
      this.database.renameSession(sessionId, title, "automatic");
      this.emitEngine({ event: "session_title_changed", session: sessionId, title });
    }
    void this.runPrompt(runtime, compiled.blocks, requestId);
    return true;
  }

  private async runPrompt(runtime: SessionRuntime, blocks: unknown[], requestId: string | null): Promise<void> {
    try {
      const peer = await this.connect(runtime);
      if (!runtime.acpSessionId) throw new Error("ACP session was not created");
      const response = object(await peer.prompt(
        runtime.acpSessionId,
        withProviderToolInstructions(blocks, runtime.toolset.instructions),
      ));
      const stopReason = optionalString(response.stopReason) ?? "end_turn";
      runtime.busy = false;
      runtime.turnId = null;
      this.clearToolCalls(runtime.id);
      this.setActivity(runtime, { kind: "idle" });
      this.emitEngine({ event: "turn_ended", session: runtime.id, stop_reason: stopReason });
    } catch (cause) {
      runtime.busy = false;
      const turnId = runtime.turnId;
      runtime.turnId = null;
      this.clearToolCalls(runtime.id);
      const message = cause instanceof Error ? cause.message : String(cause);
      this.setActivity(runtime, {
        kind: "failed",
        turn_id: turnId,
        reason: "provider_error",
        message,
      });
      this.emitEngine({ event: "error", session: runtime.id, message, terminal: true, request_id: requestId });
    }
  }

  private async connect(runtime: SessionRuntime): Promise<AcpPeer> {
    if (runtime.peer && runtime.acpSessionId) return runtime.peer;
    if (runtime.connectPromise) return runtime.connectPromise;
    runtime.connectPromise = (async () => {
      const peer = new AcpPeer(runtime.provider, runtime.cwd, {
        notification: (method, params) => this.onAcpNotification(runtime, method, params),
        request: (method, params) => this.onAcpRequest(runtime, method, params),
        closed: (error) => this.onAcpClosed(runtime, error),
      }, runtime.toolset.mcpServers);
      runtime.peer = peer;
      const initialized = object(await peer.initialize());
      const capabilities = object(initialized.agentCapabilities);
      let response: Record<string, unknown>;
      if (runtime.persistedAcpSessionId && capabilities.loadSession === true) {
        try {
          runtime.replaying = true;
          response = object(await peer.loadSession(runtime.persistedAcpSessionId, runtime.cwd));
          runtime.acpSessionId = runtime.persistedAcpSessionId;
        } catch {
          runtime.replaying = false;
          response = object(await peer.newSession(runtime.cwd));
          runtime.acpSessionId = string(response.sessionId, "ACP session id");
        } finally {
          runtime.replaying = false;
        }
      } else {
        response = object(await peer.newSession(runtime.cwd));
        runtime.acpSessionId = string(response.sessionId, "ACP session id");
      }
      this.database.updateAcpSession(runtime.id, runtime.acpSessionId);
      const models = reportedModels(response, runtime.provider);
      const current = optionalString(object(response.models).currentModelId) ?? runtime.model ?? "";
      this.emitEngine({ event: "models", session: runtime.id, available: models, current });
      const options = reportedConfigOptions(response);
      if (options.length > 0) this.emitEngine({ event: "config_options", session: runtime.id, options });
      if (runtime.model && current !== runtime.model) {
        try {
          await peer.setModel(runtime.acpSessionId, runtime.model);
        } catch (error) {
          this.emitEngine({
            event: "error",
            session: runtime.id,
            message: `Model ${runtime.model} could not be applied: ${error instanceof Error ? error.message : String(error)}`,
            terminal: false,
          });
        }
      }
      return peer;
    })();
    try {
      return await runtime.connectPromise;
    } finally {
      runtime.connectPromise = null;
    }
  }

  private async onAcpNotification(runtime: SessionRuntime, method: string, params: unknown): Promise<void> {
    if (method !== "session/update") return;
    const update = object(object(params).update);
    const kind = optionalString(update.sessionUpdate) ?? "";
    if (runtime.replaying && kind !== "usage_update") return;
    const content = object(update.content);
    if (kind === "agent_message_chunk") {
      const value = textContent(content);
      if (!value) return;
      const seq = this.database.appendPart(runtime.id, "agent", { kind: "text", text: value }, value);
      this.emitEngine({
        event: "agent_text",
        session: runtime.id,
        message_id: runtime.turnId ?? runtime.id,
        text: value,
        transcript_seq: seq,
      });
      return;
    }
    if (kind === "agent_thought_chunk") {
      const value = textContent(content);
      if (!value) return;
      const seq = this.database.appendPart(runtime.id, "agent", { kind: "reasoning", text: value });
      this.emitEngine({ event: "agent_thought", session: runtime.id, text: value, transcript_seq: seq });
      return;
    }
    if (kind === "tool_call" || kind === "tool_call_update") {
      const id = optionalString(update.toolCallId) ?? crypto.randomUUID();
      const key = `${runtime.id}:${id}`;
      const previous = this.toolCalls.get(key);
      const title = optionalString(update.title) ?? previous?.title ?? "Tool call";
      const status = optionalString(update.status) ?? (kind === "tool_call" ? "pending" : "in_progress");
      const toolKind = optionalString(update.kind) ?? previous?.kind ?? null;
      const agentInput = update.rawInput ?? previous?.agentInput ?? null;
      const outputs = this.toolOutputs(update.content);
      this.toolCalls.set(key, { title, kind: toolKind, agentInput });
      if (status === "completed" || status === "failed") this.toolCalls.delete(key);
      const part = {
        kind: "tool_call",
        id,
        title,
        status,
        tool_kind: toolKind,
        agent_input: kind === "tool_call_update" ? null : agentInput,
        outputs,
      };
      const seq = this.database.appendPart(runtime.id, "agent", part);
      this.emitEngine({
        event: "tool_call",
        session: runtime.id,
        id,
        title,
        status,
        kind: toolKind,
        agent_input: kind === "tool_call_update" ? null : agentInput,
        outputs,
        transcript_seq: seq,
      });
      return;
    }
    if (kind === "plan") {
      const entries = Array.isArray(update.entries)
        ? update.entries.flatMap((entry) => {
            const value = object(entry).content;
            return typeof value === "string" ? [value] : [];
          })
        : [];
      const seq = this.database.appendPart(runtime.id, "agent", { kind: "plan", entries });
      this.emitEngine({ event: "plan", session: runtime.id, entries, transcript_seq: seq });
      return;
    }
    if (kind === "config_option_update") {
      const options = reportedConfigOptions({ configOptions: update.configOptions });
      this.emitEngine({ event: "config_options", session: runtime.id, options });
      return;
    }
    if (kind === "usage_update") {
      const usedTokens = number(update.used, 0);
      this.emitEngine({
        event: "usage",
        session: runtime.id,
        input_tokens: usedTokens,
        output_tokens: 0,
      });
      this.emitEngine({
        event: "context_window",
        session: runtime.id,
        used_tokens: usedTokens,
        context_window: number(update.size, 0),
        cost_usd: typeof update.cost === "number" ? update.cost : null,
      });
    }
  }

  private async onAcpRequest(runtime: SessionRuntime, method: string, params: unknown): Promise<unknown> {
    if (method === "session/request_permission") return this.requestPermission(runtime, object(params));
    if (method === "elicitation/create") return this.requestElicitation(runtime, object(params));
    if (method === "fs/read_text_file") {
      const args = object(params);
      let content = readText(runtime.cwd, string(args.path, "path"));
      const line = number(args.line, 1);
      const limit = number(args.limit, 0);
      if (line > 1 || limit > 0) {
        const lines = content.split("\n");
        content = lines.slice(Math.max(0, line - 1), limit > 0 ? line - 1 + limit : undefined).join("\n");
      }
      return { content };
    }
    if (method === "fs/write_text_file") {
      const args = object(params);
      writeText(runtime.cwd, string(args.path, "path"), String(args.content ?? ""));
      return null;
    }
    throw new Error(`ACP callback not implemented: ${method}`);
  }

  private requestPermission(runtime: SessionRuntime, params: Args): Promise<unknown> | unknown {
    const options = Array.isArray(params.options) ? params.options.map(object) : [];
    if (runtime.permissionMode === "yolo") {
      const allowed = options.find((option) => optionalString(option.kind)?.startsWith("allow"));
      return allowed
        ? { outcome: { outcome: "selected", optionId: optionalString(allowed.optionId) } }
        : { outcome: { outcome: "cancelled" } };
    }
    const requestId = crypto.randomUUID();
    const toolCall = object(params.toolCall);
    const title = optionalString(toolCall.title) ?? optionalString(toolCall.kind) ?? "Tool permission";
    const choices = options.flatMap((option) => {
      const id = optionalString(option.optionId);
      return id ? [[id, optionalString(option.name) ?? id]] : [];
    });
    this.emitEngine({
      event: "permission_request",
      session: runtime.id,
      request_id: requestId,
      title,
      options: choices,
      context: { kind: "acp" },
    });
    this.setActivity(runtime, {
      kind: "awaiting_input",
      turn_id: runtime.turnId ?? crypto.randomUUID(),
      pending: [{
        input_id: requestId,
        kind: "permission",
        title,
        options: choices,
        sequence: Date.now(),
        context: { kind: "acp" },
      }],
    });
    return new Promise((resolve) => this.pendingPermissions.set(requestId, { session: runtime.id, resolve }));
  }

  private requestElicitation(runtime: SessionRuntime, params: Args): Promise<unknown> | unknown {
    if (optionalString(params.mode) && params.mode !== "form") return { action: "decline" };
    const requestId = crypto.randomUUID();
    const form = this.elicitationForm(params);
    if (form.fields.length === 0) return { action: "decline" };
    this.emitEngine({ event: "elicitation_request", session: runtime.id, request_id: requestId, form });
    this.setActivity(runtime, {
      kind: "awaiting_input",
      turn_id: runtime.turnId ?? crypto.randomUUID(),
      pending: [{
        input_id: requestId,
        kind: "elicitation",
        title: form.message,
        options: [],
        sequence: Date.now(),
        context: { kind: "acp" },
        form,
      }],
    });
    return new Promise((resolve) => this.pendingElicitations.set(requestId, { session: runtime.id, resolve }));
  }

  private answerPermission(args: Args): boolean {
    const requestId = string(args.request_id, "request_id");
    const pending = this.pendingPermissions.get(requestId);
    if (!pending || pending.session !== string(args.session, "session")) return false;
    this.pendingPermissions.delete(requestId);
    const optionId = optionalString(args.option_id);
    pending.resolve({ outcome: optionId ? { outcome: "selected", optionId } : { outcome: "cancelled" } });
    const runtime = this.runtime(pending.session);
    this.setActivity(runtime, { kind: "running", turn_id: runtime.turnId ?? crypto.randomUUID() });
    return true;
  }

  private answerElicitation(args: Args): boolean {
    const requestId = string(args.request_id, "request_id");
    const pending = this.pendingElicitations.get(requestId);
    if (!pending || pending.session !== string(args.session, "session")) return false;
    this.pendingElicitations.delete(requestId);
    pending.resolve(args.answer ?? { action: "cancel" });
    const runtime = this.runtime(pending.session);
    this.setActivity(runtime, { kind: "running", turn_id: runtime.turnId ?? crypto.randomUUID() });
    return true;
  }

  private cancel(sessionId: string): boolean {
    const runtime = this.runtime(sessionId);
    if (runtime.acpSessionId) runtime.peer?.cancel(runtime.acpSessionId);
    return true;
  }

  private async setModel(sessionId: string, model: string): Promise<void> {
    const runtime = this.runtime(sessionId);
    if (runtime.peer || runtime.acpSessionId) {
      const peer = await this.connect(runtime);
      if (!runtime.acpSessionId) throw new Error("ACP session is unavailable");
      await peer.setModel(runtime.acpSessionId, model);
    }
    runtime.model = model;
    this.database.updateModel(sessionId, model);
    this.emitEngine({ event: "models", session: sessionId, available: runtime.provider.models, current: model });
  }

  private async setConfigOption(sessionId: string, configId: string, value: string): Promise<void> {
    const runtime = this.runtime(sessionId);
    const peer = await this.connect(runtime);
    if (!runtime.acpSessionId) throw new Error("ACP session is unavailable");
    const response = object(await peer.setConfigOption(runtime.acpSessionId, configId, value));
    this.emitEngine({ event: "config_options", session: sessionId, options: reportedConfigOptions(response) });
  }

  private setPolicy(
    sessionId: string,
    mode: string | null,
    sandbox: string | null,
    requestId: string | null,
  ): void {
    const runtime = this.runtime(sessionId);
    runtime.permissionMode = mode ?? runtime.permissionMode;
    runtime.sandboxPolicy = sandbox ?? runtime.sandboxPolicy;
    this.database.updatePolicy(sessionId, runtime.permissionMode, runtime.sandboxPolicy);
    this.emitEngine({
      event: "execution_policy_changed",
      session: sessionId,
      policy: { mode: runtime.permissionMode, sandbox: runtime.sandboxPolicy },
      request_id: requestId,
    });
  }

  private runtime(sessionId: string): SessionRuntime {
    const existing = this.runtimes.get(sessionId);
    if (existing) return existing;
    const session = this.database.getSession(sessionId);
    if (!session) throw new Error(`session not found: ${sessionId}`);
    const runtime = this.runtimeFromSession(session);
    this.runtimes.set(sessionId, runtime);
    return runtime;
  }

  private runtimeFromSession(session: Record<string, unknown>): SessionRuntime {
    const id = string(session.id, "session id");
    const idValue = providerId(session.provider);
    const provider = providerById(idValue);
    if (!provider) throw new Error(`session ${id} uses unsupported provider ${idValue}`);
    const activity = object(session.activity);
    return {
      id,
      cwd: string(session.cwd, "cwd"),
      provider,
      toolset: projectProviderToolset(this.hostTools, provider.id),
      model: optionalString(session.model),
      permissionMode: optionalString(session.permission_mode) ?? "ask",
      sandboxPolicy: optionalString(session.sandbox_policy) ?? "workspace_write",
      persistedAcpSessionId: optionalString(session.acp_session_id),
      peer: null,
      connectPromise: null,
      acpSessionId: null,
      activityRevision: number(activity.revision, 0),
      busy: false,
      replaying: false,
      turnId: null,
      shuttingDown: false,
    };
  }

  private setActivity(runtime: SessionRuntime, state: Record<string, unknown>): void {
    runtime.activityRevision += 1;
    const activity = { revision: runtime.activityRevision, state };
    this.database.updateActivity(runtime.id, activity);
    this.emitEngine({ event: "session_activity_changed", session: runtime.id, activity });
  }

  private onAcpClosed(runtime: SessionRuntime, error: Error): void {
    runtime.peer = null;
    runtime.acpSessionId = null;
    runtime.replaying = false;
    this.clearToolCalls(runtime.id);
    if (runtime.shuttingDown || this.shuttingDown) return;
    if (runtime.busy) {
      runtime.busy = false;
      this.setActivity(runtime, {
        kind: "failed",
        turn_id: runtime.turnId,
        reason: "provider_error",
        message: error.message,
      });
      this.emitEngine({ event: "error", session: runtime.id, message: error.message, terminal: true });
    }
  }

  private emitEngine(payload: Record<string, unknown>): void {
    this.onEvent({ name: "engine-event", payload });
  }

  private clearToolCalls(sessionId: string): void {
    const prefix = `${sessionId}:`;
    for (const key of this.toolCalls.keys()) {
      if (key.startsWith(prefix)) this.toolCalls.delete(key);
    }
  }

  private toolOutputs(value: unknown): unknown[] {
    const outputs: unknown[] = [];
    const visit = (entry: unknown, depth: number): void => {
      if (depth > 16 || outputs.length >= 64) return;
      if (Array.isArray(entry)) {
        for (const item of entry) {
          visit(item, depth + 1);
          if (outputs.length >= 64) break;
        }
        return;
      }
      if (!entry || typeof entry !== "object") return;
      const item = entry as Args;
      const type = optionalString(item.type);
      if (type === "content") {
        visit(item.content, depth + 1);
        return;
      }
      if (type === "text" && typeof item.text === "string") {
        outputs.push({ type: "text", text: item.text.slice(0, 50_000) });
        return;
      }
      if ((type === "resource_link" || type === "resourceLink")
        && typeof item.name === "string"
        && typeof item.uri === "string") {
        outputs.push({
          type: "resource_link",
          name: item.name.slice(0, 512),
          uri: item.uri.slice(0, 8_192),
          mime_type: optionalString(item.mimeType ?? item.mime_type)?.slice(0, 128) ?? null,
        });
      }
    };
    visit(value, 0);
    return outputs;
  }

  private compileDocument(cwd: string, document: unknown[]): {
    canonical: string;
    display: string;
    blocks: unknown[];
  } {
    const canonical: string[] = [];
    const prompt: string[] = [];
    const blocks: unknown[] = [];
    for (const raw of document) {
      const block = object(raw);
      const type = optionalString(block.type) ?? "text";
      if (type === "text") {
        const value = String(block.text ?? "").trimEnd();
        if (value) {
          canonical.push(value);
          prompt.push(value);
        }
        continue;
      }
      if (type === "file") {
        const path = string(block.path, "file path");
        canonical.push(`[@${path}]`);
        prompt.push(`**File** \`${path}\`\n\n\`\`\`${extname(path).slice(1)}\n${readText(cwd, path).trimEnd()}\n\`\`\``);
        continue;
      }
      if (type === "image") {
        const path = string(block.path, "image path");
        canonical.push(`[img:${path}]`);
        const bytes = Buffer.from(readBinary(cwd, path));
        const extension = extname(path).slice(1).toLocaleLowerCase();
        const mimeType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension || "png"}`;
        blocks.push({ type: "image", data: bytes.toString("base64"), mimeType });
        prompt.push(`**Attached image workspace path:** ${JSON.stringify(path)}`);
        continue;
      }
      if (type === "issue") {
        const source = optionalString(block.source) ?? "issue";
        const id = optionalString(block.id) ?? "";
        canonical.push(`[issue:${source}#${id}]`);
        prompt.push(this.issueContext(block));
        continue;
      }
      if (type === "session") {
        const id = string(block.session_id, "session_id");
        canonical.push(`[chat:${id.slice(0, 8)}]`);
        const page = this.database.transcriptPage(id, null, 50) as { entries?: { role: string; part: Args }[] };
        const transcript = (page.entries ?? []).flatMap((entry) => {
          const value = optionalString(entry.part.text ?? entry.part.display);
          return value ? [`${entry.role}: ${value}`] : [];
        }).join("\n");
        if (transcript) prompt.push(`**Referenced chat ${id.slice(0, 8)}**\n\n${transcript}`);
        continue;
      }
      if (type === "skill") {
        const id = string(block.skill_id, "skill_id");
        canonical.push(`[skill:${id}]`);
        prompt.push(`Use the **${id}** skill.`);
        continue;
      }
      canonical.push(`[${type}]`);
    }
    const rules = this.workspaceRules(cwd).flatMap((path) => {
      try {
        return [`**Project instructions (${path})**\n\n${readText(cwd, path).trim()}`];
      } catch {
        return [];
      }
    });
    const text = [...rules, ...prompt].filter(Boolean).join("\n\n");
    if (text) blocks.unshift({ type: "text", text });
    return { canonical: canonical.join("\n\n"), display: canonical.join("\n\n"), blocks };
  }

  private workspaceRules(cwd: string): string[] {
    return ["AGENTS.md", "CLAUDE.md", ".cursorrules"].filter((path) => {
      try {
        workspacePath(cwd, path);
        return true;
      } catch {
        return false;
      }
    });
  }

  private async searchWorkspace(args: Args): Promise<unknown> {
    const cwd = string(args.cwd, "cwd");
    const query = string(args.query, "query");
    const options = object(args.options);
    const regex = boolean(options.regex);
    const caseSensitive = boolean(options.case_sensitive);
    const wholeWord = boolean(options.whole_word);
    const limit = number(args.limit, 200);
    const expression = regex ? new RegExp(query, caseSensitive ? "g" : "gi") : null;
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    const matches: unknown[] = [];
    for (const path of listFiles(cwd, "", 5000)) {
      if (matches.length >= limit) break;
      let content: string;
      try {
        content = readText(cwd, path);
      } catch {
        continue;
      }
      for (const [index, line] of content.split("\n").entries()) {
        let column = -1;
        if (expression) {
          expression.lastIndex = 0;
          column = expression.exec(line)?.index ?? -1;
        } else {
          const haystack = caseSensitive ? line : line.toLocaleLowerCase();
          column = haystack.indexOf(needle);
          if (column >= 0 && wholeWord) {
            const before = line[column - 1] ?? " ";
            const after = line[column + query.length] ?? " ";
            if (/\w/.test(before) || /\w/.test(after)) column = -1;
          }
        }
        if (column >= 0) matches.push({ path, line: index + 1, column: column + 1, preview: line.slice(0, 500) });
        if (matches.length >= limit) break;
      }
    }
    return { matches, truncated: matches.length >= limit, truncation_reason: matches.length >= limit ? "match_limit" : null };
  }

  private readKeymap(dataDir: string): unknown {
    try {
      const custom = JSON.parse(readFileSync(join(dataDir, "keymap.json"), "utf8")) as Record<string, string>;
      return DEFAULT_KEYMAP.map(([action, key, label]) => [action, custom[action] ?? key, label]);
    } catch {
      return DEFAULT_KEYMAP;
    }
  }

  private setKeymap(dataDir: string, action: string, key: string): void {
    let current: Record<string, string> = {};
    try {
      current = JSON.parse(readFileSync(join(dataDir, "keymap.json"), "utf8")) as Record<string, string>;
    } catch {
      // First override.
    }
    current[action] = key;
    writeFileSync(join(dataDir, "keymap.json"), `${JSON.stringify(current, null, 2)}\n`, "utf8");
  }

  private pluginCatalog(): unknown {
    return {
      graph_revision: 1,
      config_revision: 1,
      recovery: { kind: "normal" },
      plugins: [{
        id: "pure-bun",
        description: "In-process Bun desktop runtime",
        metadata: {
          origin: "host",
          category: "foundation",
          scope_support: ["user"],
          essential: true,
          default_enabled: true,
        },
        dependencies: { required: [], optional: [] },
        state: "enabled",
        enabled: true,
        running: true,
        status: "active",
        missing: [],
        error: null,
        config: {},
        schema: null,
        available: false,
        components: {},
        commands: this.commands(),
        services: ["bun-runtime", "sqlite", "acp", "terminal", "lsp"],
      }],
    };
  }

  private elicitationForm(args: Args): { message: string; tool_call_id: string | null; fields: unknown[] } {
    const schema = object(args.requestedSchema);
    const properties = object(schema.properties);
    const required = new Set(this.stringArray(schema.required));
    const fields = Object.entries(properties).flatMap(([key, raw]) => {
      const property = object(raw);
      const type = optionalString(property.type) ?? "string";
      const values = Array.isArray(property.enum) ? property.enum : [];
      const kind = values.length > 0
        ? "select"
        : type === "boolean"
          ? "boolean"
          : type === "number"
            ? "number"
            : type === "integer"
              ? "integer"
              : "text";
      return [{
        key,
        kind,
        title: optionalString(property.title),
        description: optionalString(property.description),
        required: required.has(key),
        options: values.map((value) => ({ value: String(value), label: String(value) })),
      }];
    });
    return {
      message: optionalString(args.message) ?? "The agent needs more information",
      tool_call_id: optionalString(args.toolCallId),
      fields,
    };
  }

  private async listGithubIssues(cwd: string, limit: number): Promise<unknown[]> {
    if (!which("gh")) return [];
    const result = await runProcess([
      "gh", "issue", "list", "--limit", String(limit), "--json", "number,title,state,url,body",
    ], cwd);
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "gh issue list failed");
    const rows = JSON.parse(result.stdout) as Args[];
    return rows.map((row) => ({
      id: String(row.number ?? ""),
      title: String(row.title ?? ""),
      state: String(row.state ?? ""),
      url: String(row.url ?? ""),
      body: String(row.body ?? ""),
      source: "github",
    }));
  }

  private issueContext(issue: Args): string {
    const source = optionalString(issue.source) ?? "issue";
    const id = optionalString(issue.id) ?? "";
    const title = optionalString(issue.title) ?? "";
    const state = optionalString(issue.state) ?? "open";
    const url = optionalString(issue.url) ?? "";
    const body = optionalString(issue.body) ?? "";
    return `**${source} #${id}** — ${title} (${state})\n${url}${body ? `\n\n${body}` : ""}`;
  }

  private async suggestCommitMessage(cwd: string): Promise<string> {
    const result = await runProcess(["git", "diff", "--stat"], cwd);
    const first = result.stdout.split("\n").find((line) => line.trim())?.trim();
    return first ? `chore: update ${first.split("|")[0].trim()}` : "chore: update workspace";
  }

  private async createPullRequest(args: Args): Promise<string> {
    if (!which("gh")) throw new Error("GitHub CLI is not installed");
    const cwd = string(args.cwd, "cwd");
    const result = await runProcess([
      "gh", "pr", "create", "--title", string(args.title, "title"), "--body", String(args.body ?? ""),
    ], cwd, 120_000);
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "gh pr create failed");
    return result.stdout.trim();
  }

  private async checkedProcess(command: string[], cwd: string): Promise<string> {
    const result = await runProcess(command, cwd, 120_000);
    if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `${command[0]} failed`);
    return result.stdout.trim();
  }

  private async restoreCheckpoint(cwd: string, commit: string): Promise<void> {
    await this.checkedProcess(["git", "rev-parse", "--verify", `${commit}^{commit}`], cwd);
    await this.checkedProcess(["git", "restore", "--source", commit, "--worktree", "--", "."], cwd);
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  private unsupported(command: string, capability: string): never {
    throw new Error(`Pure Bun trial has not migrated ${capability} (${command})`);
  }
}
