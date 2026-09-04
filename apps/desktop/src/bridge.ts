import {
  desktopCall,
  desktopAppshotSettings,
  desktopCaptureAppshot,
  desktopGetAppshot,
  desktopConfirm,
  desktopOpenDevtools,
  desktopOpenDialog,
  desktopOpenExternal,
  desktopOpenPath,
  desktopShowItemInFolder,
  desktopOpenWorkspace,
  desktopSaveDialog,
  desktopSetSystemBadgeCount,
  desktopSystemProfileAvatar,
  desktopOpenAppshotPrivacySettings,
  desktopRequestAppshotPermissions,
  desktopUpdateAppshotSettings,
  desktopCheckForUpdates,
  desktopUpdateStatus,
  isElectrobun,
  listenDesktop,
  onDesktopAppshotCaptured,
  onDesktopAppshotFailed,
  browserAnnotateLocal,
  browserAnnotationCountLocal,
  browserAnnotationsClearLocal,
  browserAnnotationsLocal,
  browserBoundsLocal,
  browserCloseAllLocal,
  browserCloseLocal,
  browserDevtoolsLocal,
  browserHistoryLocal,
  browserNavigateLocal,
  browserOpenLocal,
  browserRegistryCreateLocal,
  browserRegistrySnapshotLocal,
  browserReloadLocal,
  browserSubscribe,
  browserTakeControlLocal,
  browserVisibleLocal,
  browserZoomLocal,
} from "./container";
import type {
  EmbeddedBrowserTab,
  AppshotCapture,
  AppshotSettings,
  AppUpdateStatus,
  WorkspaceOpenTarget,
} from "./container";
import { assertIpcResult } from "./lib/ipcResult";
import type {
  PluginConnectorContribution,
  PluginRuntimeCommandContribution,
  PluginUiContribution,
} from "./pluginModel";
// ---- scenes (Agent Scenes 1.0.0; see docs/reference/scenes.md) ---------------------------------------
import type {
  SceneDocument,
  SceneInfo,
  SceneSlotDefinition,
} from "./session/scene";

// ---- voice → structured brief (R11) --------------------------------------------------------

// Product-facing content bridge. Native shell details stay behind `container.ts`.

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  return await desktopUpdateStatus();
}

export async function checkForAppUpdates(): Promise<AppUpdateStatus> {
  return await desktopCheckForUpdates();
}

export async function setSystemBadgeCount(count: number): Promise<boolean> {
  return isInDesktop ? await desktopSetSystemBadgeCount(count) : false;
}

let systemProfileAvatarRequest: Promise<string | null> | null = null;

export async function systemProfileAvatar(): Promise<string | null> {
  if (!isInDesktop) {
    return null;
  }
  if (!systemProfileAvatarRequest) {
    systemProfileAvatarRequest = desktopSystemProfileAvatar();
  }
  return await systemProfileAvatarRequest;
}

const browserAppshotSettings: AppshotSettings = {
  accessibility: false,
  available: false,
  destination: "automatic",
  hotkey: "both-command",
  hotkey_registered: false,
  play_sound: true,
  screen_recording: false,
  unavailable_reason: "Appshots require the C2 macOS desktop app.",
};

export async function getAppshotSettings(): Promise<AppshotSettings> {
  return isInDesktop ? await desktopAppshotSettings() : browserAppshotSettings;
}

export async function updateAppshotSettings(
  patch: Partial<Pick<AppshotSettings, "hotkey" | "destination" | "play_sound">>
): Promise<AppshotSettings> {
  return isInDesktop
    ? await desktopUpdateAppshotSettings(patch)
    : { ...browserAppshotSettings, ...patch };
}

export async function requestAppshotPermissions(
  kind: "screen-recording" | "accessibility"
): Promise<AppshotSettings> {
  return isInDesktop
    ? await desktopRequestAppshotPermissions(kind)
    : browserAppshotSettings;
}

export async function openAppshotPrivacySettings(
  kind: "screen-recording" | "accessibility"
): Promise<boolean> {
  return isInDesktop ? await desktopOpenAppshotPrivacySettings(kind) : false;
}

export async function takeAppshot(): Promise<AppshotCapture> {
  if (!isInDesktop) {
    throw new Error(
      browserAppshotSettings.unavailable_reason ?? "Appshots are unavailable."
    );
  }
  return await desktopCaptureAppshot();
}

export async function getAppshot(id: string): Promise<AppshotCapture> {
  if (!isInDesktop) {
    throw new Error("Appshots require the C2 macOS desktop app.");
  }
  return await desktopGetAppshot(id);
}

export async function onAppshotCaptured(
  callback: (capture: AppshotCapture) => void
): Promise<() => void> {
  return isInDesktop ? await onDesktopAppshotCaptured(callback) : () => {};
}

export async function onAppshotFailed(
  callback: (failure: { message: string }) => void
): Promise<() => void> {
  return isInDesktop ? await onDesktopAppshotFailed(callback) : () => {};
}

export type DeviceSyncState =
  | "disabled"
  | "ready"
  | "syncing"
  | "unsupported"
  | "signed-out"
  | "restricted"
  | "unavailable"
  | "error";

export interface DeviceSyncStatus {
  transport: string;
  state: DeviceSyncState;
  enabled: boolean;
  available: boolean;
  last_success_at: number | null;
  message: string | null;
  imported: {
    projects: number;
    sessions: number;
    parts: number;
    memories: number;
  } | null;
}

export async function getDeviceSyncStatus(): Promise<DeviceSyncStatus> {
  return isInDesktop
    ? await call<DeviceSyncStatus>("device_sync.status")
    : {
        available: false,
        enabled: false,
        imported: null,
        last_success_at: null,
        message: null,
        state: "unsupported",
        transport: "paired-devices",
      };
}

export async function setDeviceSyncEnabled(
  isEnabled: boolean
): Promise<DeviceSyncStatus> {
  return isInDesktop
    ? await call<DeviceSyncStatus>("device_sync.set_enabled", {
        enabled: isEnabled,
      })
    : await getDeviceSyncStatus();
}

export async function syncDeviceDataNow(): Promise<DeviceSyncStatus> {
  return isInDesktop
    ? await call<DeviceSyncStatus>("device_sync.sync_now")
    : await getDeviceSyncStatus();
}

export interface ProviderInfo {
  id: string;
  display_name: string;
  available: boolean;
  enabled: boolean;
  needs_node: boolean;
  /// The core's built-in models for this provider — what the picker offers when the provider
  /// reports none of its own over ACP. Empty only for providers we ship no list for.
  models: ModelChoice[];
  capabilities: ProviderCapability[];
  management: ProviderManagementInfo;
  configuration: ProviderRuntimeConfig;
}

export interface ProviderRuntimeOverride {
  display_name: string | null;
  command: string | null;
  args: string[] | null;
  home_path: string | null;
  forwarded_environment: string[];
}

export interface ProviderRuntimeConfig extends ProviderRuntimeOverride {
  home_environment: string | null;
  missing_environment: string[];
  effective_command: string;
  effective_args: string[];
}

export interface ProviderManagementInfo {
  installed: boolean;
  version: string | null;
  latest_version: string | null;
  update_available: boolean | null;
  check_error: string | null;
  install_supported: boolean;
  upgrade_supported: boolean;
  launch_mode: "installed" | "on_demand" | "unavailable";
}

export type ProviderCapabilityId =
  | "image_generation"
  | "computer_use"
  | "chrome_browser"
  | "codetwo_browser"
  | "sites";
export type CapabilityState = "ready" | "unverified" | "unavailable";

export interface ProviderCapability {
  id: ProviderCapabilityId;
  state: CapabilityState;
  version?: string | null;
  experimental: boolean;
  reason?: string | null;
  fix?: string | null;
}

export interface ComputerUseBackendOption {
  id: string;
  display_name: string;
  available: boolean;
  reason: string | null;
  providers: string[];
  exclude_providers: string[];
}

export interface ComputerUseSettings {
  selections: Record<string, string>;
  backends: ComputerUseBackendOption[];
  errors: string[];
}

export type BrowserUseBackendOption = ComputerUseBackendOption;
export interface BrowserUseSettings extends ComputerUseSettings {
  access_enabled: boolean;
}

interface ComputerUseBackendWire {
  id: string;
  display_name?: string;
  displayName?: string;
  available: boolean;
  reason?: string | null;
  providers?: string[];
  exclude_providers?: string[];
  excludeProviders?: string[];
}

interface ComputerUseSettingsWire {
  selections?: Record<string, string>;
  backends?: ComputerUseBackendWire[];
  errors?: string[];
}

interface BrowserUseSettingsWire extends ComputerUseSettingsWire {
  access_enabled?: boolean;
  accessEnabled?: boolean;
}

function normalizeComputerUseSettings(
  settings: ComputerUseSettingsWire
): ComputerUseSettings {
  return {
    backends: (settings.backends ?? []).map((backend) => {
      return {
        available: backend.available,
        display_name: backend.display_name ?? backend.displayName ?? backend.id,
        exclude_providers:
          backend.exclude_providers ?? backend.excludeProviders ?? [],
        id: backend.id,
        providers: backend.providers ?? [],
        reason: backend.reason ?? null,
      };
    }),
    errors: settings.errors ?? [],
    selections: settings.selections ?? {},
  };
}

function normalizeBrowserUseSettings(
  settings: BrowserUseSettingsWire
): BrowserUseSettings {
  return {
    ...normalizeComputerUseSettings(settings),
    access_enabled: settings.access_enabled ?? settings.accessEnabled ?? false,
  };
}

type ProviderInfoWire = Omit<
  ProviderInfo,
  "capabilities" | "enabled" | "management" | "configuration"
> & {
  capabilities?: ProviderCapability[] | null;
  enabled?: boolean | null;
  management?: ProviderManagementInfo | null;
  configuration?: ProviderRuntimeConfig | null;
};

function defaultProviderConfig(
  provider: Pick<ProviderInfo, "id">
): ProviderRuntimeConfig {
  return {
    args: null,
    command: null,
    display_name: null,
    effective_args: [],
    effective_command: "",
    forwarded_environment: [],
    home_environment:
      provider.id === "codex"
        ? "CODEX_HOME"
        : provider.id === "claude_code"
          ? "CLAUDE_CONFIG_DIR"
          : null,
    home_path: null,
    missing_environment: [],
  };
}

export function normalizeProviderInfo(
  provider: ProviderInfoWire
): ProviderInfo {
  return {
    ...provider,
    capabilities: provider.capabilities ?? [],
    configuration: provider.configuration ?? defaultProviderConfig(provider),
    enabled: provider.enabled ?? true,
    management: provider.management ?? {
      check_error: null,
      install_supported: false,
      installed: provider.available,
      latest_version: null,
      launch_mode: provider.available ? "installed" : "unavailable",
      update_available: null,
      upgrade_supported: false,
      version: null,
    },
  };
}

/**
One typed macro slot as `list_skills` reports it (core `SlotDef`, Agent Scenes vocabulary).
*/
export interface MacroSlotInfo {
  id: string;
  label?: string;
  kind?: "text" | "multiline" | "select" | "file" | "artifact";
  options?: string[];
  required?: boolean;
  default?: string;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  kind: string;
  /// Harness display name ("Claude Code" …) for skills auto-discovered from a product's skill
  /// directory; null for library skills.
  source: string | null;
  /// Macro payload metadata so the `/` picker can render the R1 slot card without a second
  /// fetch. Absent for every other kind (and for backends predating the fields).
  macro_template?: string | null;
  macro_slots?: MacroSlotInfo[] | null;
}

export type PermissionMode = "ask" | "accept_edits" | "yolo";
export type Sandbox = "read_only" | "workspace_write" | "danger_full_access";

export interface ExecutionPolicy {
  mode: PermissionMode;
  sandbox: Sandbox;
}

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  project_path: string;
  provider: string | { custom: string };
  cron: string;
  timezone: string;
  enabled: boolean;
  use_worktree: boolean;
  permission_mode: PermissionMode;
  sandbox_policy: Sandbox;
  next_run_at: number | null;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface AutomationInput {
  name: string;
  prompt: string;
  projectPath: string;
  provider: string | { custom: string };
  cron: string;
  timezone: string;
  enabled: boolean;
  useWorktree: boolean;
  permissionMode: PermissionMode;
  sandboxPolicy: Sandbox;
}

export type AutomationRunStatus =
  | "starting"
  | "running"
  | "needs_attention"
  | "succeeded"
  | "failed"
  | "interrupted";

export interface AutomationRun {
  id: string;
  automation_id: string;
  session_id: string | null;
  status: AutomationRunStatus;
  scheduled_for: number;
  started_at: number;
  finished_at: number | null;
  error: string | null;
}

export interface SessionInfo {
  id: string;
  title: string;
  title_origin: "default" | "automatic" | "manual";
  /**
  Pinned sessions stay above the active recency list for their project.
  */
  pinned: boolean;
  /**
  App-lifetime sessions used by Quick Chat and Side Chat. They never appear in history/search.
  */
  transient?: boolean;
  provider: string | { custom: string };
  model: string | null;
  cwd: string;
  worktree_path: string | null;
  /**
  Original selected project directory; `cwd` may instead point into an isolated worktree.
  */
  project_path: string | null;
  /**
  Exact local ref + commit used to create the isolated checkout.
  */
  worktree_baseline?: ResolvedWorktreeBaseline | null;
  /**
  Opaque persisted filesystem identity. Its presence distinguishes strongly verified rows.
  */
  worktree_identity?: Record<string, unknown> | null;
  /**
  True once the user discarded this session's isolated checkout. Old rows read as false.
  */
  worktree_discarded?: boolean;
  permission_mode: PermissionMode;
  sandbox_policy: Sandbox;
  acp_session_id: string | null;
  memory_read: MemoryAccess;
  memory_write: MemoryAccess;
  created_at: number;
  /**
  Last accepted prompt or explicit unarchive; absent on older Core versions.
  */
  last_active_at?: number;
  /**
  Core-owned, revisioned run/input state; survives renderer and remote reconnects.
  */
  activity?: SessionActivity;
}

export type PendingInputKind = "permission" | "elicitation";

/**
What a client renders for one elicitation field (core: `ElicitationFieldKind`).
*/
export type ElicitationFieldKind =
  | "text"
  | "number"
  | "integer"
  | "boolean"
  | "select"
  | "multi_select";

export interface ElicitationOption {
  /**
  What travels back to the agent.
  */
  value: string;
  label: string;
  description?: string | null;
  /**
  Longer content (mockups, snippets) shown while the option is focused.
  */
  preview?: string | null;
}

export interface ElicitationField {
  key: string;
  kind: ElicitationFieldKind;
  title?: string | null;
  description?: string | null;
  required: boolean;
  options?: ElicitationOption[];
  /**
  Set when this is the free-text "Other" box belonging to the named field.
  */
  custom_answer_for?: string | null;
}

/**
 * A structured question from the agent (ACP `elicitation/create`) — Claude Code's
 * `AskUserQuestion`, or an MCP form elicitation. The core normalizes the JSON Schema so every
 * frontend renders the same shape.
 */
export interface ElicitationForm {
  message: string;
  tool_call_id?: string | null;
  fields: ElicitationField[];
}

/**
Content values the core accepts back; anything else is dropped when the answer is sanitized.
*/
export type ElicitationContent = Record<
  string,
  string | string[] | number | boolean
>;

export type ElicitationAnswer =
  | { action: "accept"; content: ElicitationContent }
  | { action: "decline" }
  | { action: "cancel" };

export type PermissionContextKind =
  | "acp"
  | "mcp_elicitation"
  | "website_access"
  | "sensitive_web_action"
  | "computer_use_application"
  | "sites_mutation"
  | "sites_production";

export interface PermissionContext {
  kind: PermissionContextKind;
  server?: string | null;
  tool?: string | null;
  origin?: string | null;
  risk?: string | null;
  application?: string | null;
}

export interface PendingInput {
  input_id: string;
  kind: PendingInputKind;
  title: string;
  options: [string, string][];
  sequence: number;
  context?: PermissionContext;
  /**
  Present on `elicitation` inputs: the question to render instead of an approval prompt.
  */
  form?: ElicitationForm | null;
}

export type RunFailureReason = "provider_error" | "interrupted";

export type SessionRunState =
  | { kind: "idle" }
  | { kind: "running"; turn_id: string; prompt_request_id?: string | null }
  | {
      kind: "awaiting_input";
      turn_id: string;
      prompt_request_id?: string | null;
      pending: PendingInput[];
    }
  | {
      kind: "failed";
      turn_id?: string | null;
      reason: RunFailureReason;
      message: string;
    };

export interface SessionActivity {
  revision: number;
  state: SessionRunState;
}

export type WorktreeBaselineKind = "current" | "origin_default";
export type ProjectWorktreeMode = "local" | WorktreeBaselineKind;

export interface ResolvedWorktreeBaseline {
  kind: WorktreeBaselineKind;
  ref: string;
  sha: string;
  display: string;
}

export interface WorktreeBaselineOption {
  kind: WorktreeBaselineKind;
  resolved: ResolvedWorktreeBaseline | null;
  unavailable_reason: string | null;
}

export interface WorktreeSettings {
  root?: string;
  fetch_upstream: boolean;
  auto_delete: boolean;
  auto_delete_limit: number;
}

/**
What a discard actually removed. A repeat discard is a no-op success with both fields empty.
*/
export interface DiscardedWorktree {
  removed_checkout: boolean;
  deleted_branch?: string;
}

/// session = a checkout some session record still claims; orphan = git still registers a codetwo/
/// branch checkout no session claims; stale = leftover directory git no longer registers at all.
export type WorktreeEntryKind = "session" | "orphan" | "stale";

export interface WorktreeStatusEntry {
  path: string;
  branch?: string;
  kind: WorktreeEntryKind;
  registered: boolean;
  checkout_present: boolean;
  session_id?: string;
  session_title?: string;
  session_archived: boolean;
  worktree_discarded: boolean;
}

export type MemoryAccess = "inherit" | "allow" | "deny";

/// A workspace the user works in. The path is the identity — one directory is one project.
export interface Project {
  path: string;
  name: string;
  last_opened_at: number;
  /**
  Null follows the current draft/session; local is an explicit no-worktree default.
  */
  default_worktree_mode: ProjectWorktreeMode | null;
  /**
  Icons are fetched separately so refreshing the project list never serializes image bytes.
  */
  has_icon?: boolean;
  icon_updated_at?: number;
  /**
  Null keeps the current provider and lets it choose its own model.
  */
  default_provider?: string | null;
  default_model?: string | null;
  /**
  Applied after a newly created session reports its provider-owned effort selector.
  */
  default_reasoning_effort?: string | null;
}

export interface ProjectIconData {
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  bytes: Uint8Array;
}

export interface MemorySettings {
  enabled: boolean;
  capture: boolean;
  inject: boolean;
  include_external_context: boolean;
}

export type MemoryPolicyValue = "inherit" | "allow" | "deny";

export interface MemoryProjectPolicy {
  project_path: string;
  capture: MemoryPolicyValue;
  inject: MemoryPolicyValue;
  include_external_context: MemoryPolicyValue;
}

export interface MemorySourceReference {
  session_id: string;
  part_seq: number;
}

export interface MemoryRecord {
  id: string;
  project_path: string;
  session_id: string | null;
  layer: "L0" | "L1" | "L2" | "L3";
  category: string;
  content: string;
  confidence: number;
  sources: MemorySourceReference[];
  pinned: boolean;
  active: boolean;
  created_at: number;
  updated_at: number;
  accessed_at: number | null;
  access_count: number;
  origin: "manual" | "automatic" | "user_correction" | "profile";
  forgotten_at: number | null;
  supersedes_id: string | null;
  conflict_with_id: string | null;
  conflict_reason: string | null;
  relevance: number | null;
  editable: boolean;
}

export interface MemoryStats {
  l0: number;
  l1: number;
  l2: number;
  l3: number;
  pending: number;
  active: number;
  pinned: number;
  recent: number;
  forgotten: number;
  conflicts: number;
}

export interface MemoryEvidence {
  session_id: string;
  session_title: string;
  part_seq: number;
  created_at: number;
  excerpt: string;
  available: boolean;
  redacted: boolean;
}

export interface MemoryUsage {
  session_id: string;
  session_title: string;
  user_part_seq: number;
  created_at: number;
}

export interface MemoryReceiptItem {
  id: string;
  layer: "L0" | "L1" | "L2" | "L3";
  category: string;
  content: string;
  source: MemorySourceReference | null;
  relevance: number | null;
}

export interface MemoryReceipt {
  session_id: string;
  user_part_seq: number;
  estimated_tokens: number;
  items: MemoryReceiptItem[];
  created_at: number;
}

/// One model a session can run on. ACP's model API is UNSTABLE and most adapters don't report a
/// list, so these usually come from the core's built-in list for the provider instead.
export interface ModelChoice {
  id: string;
  name: string;
  description: string | null;
}

/// One session config selector the agent reports (ACP config options — the newer surface where
/// current adapters put the model picker and the reasoning/thought level).
export interface ConfigOptionInfo {
  id: string;
  name: string;
  /// Semantic hint from the spec: "model" | "mode" | "thought_level" | anything else.
  category: string | null;
  current: string;
  choices: ModelChoice[];
}

export interface GoalCapabilityInfo {
  control_method: string;
  actions: string[];
}

export interface SessionInteractionCapabilities {
  steering: boolean;
  goal: GoalCapabilityInfo | null;
  /**
  Set only after the live ACP session advertises its native `/compact` command.
  */
  compact_context: boolean;
}

export interface GoalSnapshot {
  objective: string;
  status: string;
  created_at: number;
  updated_at: number;
  token_budget: number | null;
  tokens_used: number;
  time_used_seconds: number;
}

/// Neutral document shape the editor serializes into; matches core `DocumentBlock` serde.
export type DocumentBlock =
  | { type: "text"; text: string }
  | { type: "skill"; skill_id: string; params: Record<string, string> }
  | { type: "file"; path: string }
  | { type: "image"; path: string }
  | { type: "appshot"; id: string; title?: string }
  | { type: "attachment"; id: string; name?: string }
  | {
      type: "canvas";
      id: string;
      frozen_revision: number;
      pixel_policy?: CanvasPixelPolicy;
    }
  | { type: "session"; session_id: string; through_seq?: number }
  // R12: a referenced issue-tracker item with its snapshot embedded at insert time; mirrors core
  // `DocumentBlock::Issue`, which re-renders `issues::Issue::to_context` from exactly these fields.
  | {
      type: "issue";
      source: string;
      id: string;
      title: string;
      url: string;
      body: string;
    };

/// One-line description of a doc block, used for summaries and browser-mode previews.
export function describeBlock(b: DocumentBlock): string {
  switch (b.type) {
    case "text": {
      return b.text;
    }
    case "skill": {
      return `[skill:${b.skill_id}]`;
    }
    case "file": {
      return `[@${b.path}]`;
    }
    case "image": {
      return `[img:${b.path}]`;
    }
    case "appshot": {
      return `[appshot:${b.title != null && b.title !== "" ? b.title : b.id}]`;
    }
    case "attachment": {
      return `[image:${b.name != null && b.name !== "" ? b.name : b.id}]`;
    }
    case "canvas": {
      return `[canvas:${b.id}@${b.frozen_revision}]`;
    }
    case "session": {
      return `[chat:${b.session_id.slice(0, 8)}]`;
    }
    case "issue": {
      return `[issue:${b.source}#${b.id}]`;
    }
  }
}

/// Mirrors core `Event` (tagged by `event`, snake_case).
export type CoreEvent =
  | {
      event: "session_created";
      session: string;
      cwd?: string;
      project_path?: string | null;
      worktree_path?: string | null;
      worktree_baseline?: ResolvedWorktreeBaseline | null;
      request_id?: string | null;
    }
  | { event: "memory_context"; session: string; receipt: MemoryReceipt }
  | { event: "session_title_changed"; session: string; title: string }
  | {
      event: "worktree_discarded";
      session: string;
      worktree_path: string;
      removed_checkout: boolean;
      deleted_branch?: string;
    }
  | {
      event: "session_activity_changed";
      session: string;
      activity: SessionActivity;
    }
  | {
      event: "turn_started";
      session: string;
      request_id?: string | null;
      transcript_seq?: number | null;
    }
  | {
      event: "agent_text";
      session: string;
      message_id: string;
      text: string;
      transcript_seq?: number | null;
    }
  | {
      event: "agent_thought";
      session: string;
      text: string;
      transcript_seq?: number | null;
    }
  | {
      event: "tool_call";
      session: string;
      id: string;
      title: string;
      status: string;
      kind?: string | null;
      agent_input?: unknown;
      outputs?: ToolOutput[];
      transcript_seq?: number | null;
    }
  | {
      event: "plan";
      session: string;
      entries: (PlanEntry | string)[];
      transcript_seq?: number | null;
    }
  | {
      event: "permission_request";
      session: string;
      request_id: string;
      title: string;
      options: [string, string][];
      context?: PermissionContext;
    }
  | {
      event: "elicitation_request";
      session: string;
      request_id: string;
      form: ElicitationForm;
    }
  | {
      event: "usage";
      session: string;
      input_tokens: number;
      output_tokens: number;
    }
  | {
      event: "context_window";
      session: string;
      used_tokens: number;
      context_window: number;
      cost_usd?: number | null;
      breakdown?: { id: string; tokens: number }[] | null;
    }
  | {
      event: "models";
      session: string;
      available: ModelChoice[];
      current: string;
    }
  | { event: "config_options"; session: string; options: ConfigOptionInfo[] }
  | {
      event: "session_capabilities";
      session: string;
      steering: boolean;
      goal: GoalCapabilityInfo | null;
      compact_context?: boolean;
    }
  | { event: "goal_changed"; session: string; goal: GoalSnapshot | null }
  | {
      event: "prompt_queued";
      session: string;
      request_id?: string | null;
      position: number;
    }
  | {
      event: "steer_accepted";
      session: string;
      request_id?: string | null;
      transcript_seq?: number | null;
      outcome: "injected" | "startedNewTurn";
    }
  | {
      event: "execution_policy_changed";
      session: string;
      policy: ExecutionPolicy;
      request_id?: string | null;
    }
  | { event: "turn_ended"; session: string; stop_reason: string }
  | {
      event: "error";
      session: string | null;
      message: string;
      terminal: boolean;
      request_id?: string | null;
    }
  | {
      event: "test_signal";
      session: string;
      tool_call_id: string;
      command: string;
      passed: boolean;
      exit_code?: number | null;
    }
  | {
      event: "artifact_produced";
      session: string;
      scene_ref: string;
      artifact_key: string;
      kind: string;
      version: number;
      record_id: number;
    }
  | {
      event: "exit_criteria_met";
      session: string;
      scene_ref: string;
      satisfied: string[];
      unverified: string[];
      state_key: string;
    }
  | {
      event: "hook_suggestion";
      session: string;
      scene_ref: string;
      on: string;
      kind: string;
      target_scene?: string | null;
      carry?: string[];
      message?: string | null;
      pipeline_instance?: string | null;
      to_stage?: string | null;
      state_key: string;
    }
  | {
      event: "hook_turn_started";
      session: string;
      scene_ref: string;
      macro_id: string;
    }
  | {
      event: "session_cost";
      session: string;
      input_tokens: number;
      output_tokens: number;
      cost_usd?: number | null;
      burn_rate_usd_per_hour?: number | null;
      priced: boolean;
    };

export interface PtyOutput {
  id: string;
  data: string;
  project_path: string | null;
}

/**
The title the child set (OSC 0/2), or its working directory (OSC 7).
*/
export interface PtyTitle {
  id: string;
  title: string;
  project_path: string | null;
}

export interface PtyExit {
  id: string;
  project_path: string | null;
}

export interface PtyAttach {
  /**
  False when we re-attached to a terminal that was already running.
  */
  created: boolean;
  /**
  VT sequences reproducing the terminal's scrollback, screen, and cursor.
  */
  restore: string;
}

export interface PlanEntry {
  content: string;
  priority?: string | null;
  status?: string | null;
}

/// Mirrors core `Part` (tagged by `kind`).
export type Part =
  | { kind: "text"; text: string }
  | { kind: "prompt"; text: string; display: string }
  | { kind: "reasoning"; text: string }
  | {
      kind: "tool_call";
      id: string;
      title: string;
      status: string;
      tool_kind?: string | null;
      agent_input?: unknown;
      outputs?: ToolOutput[];
    }
  | { kind: "plan"; entries: (PlanEntry | string)[] };

export interface ArtifactReference {
  id: string;
  mime_type: string;
  bytes: number;
  width: number;
  height: number;
  display_name: string;
}

export type ToolOutput =
  | { type: "text"; text: string }
  | { type: "image"; artifact: ArtifactReference }
  | {
      type: "resource_link";
      name: string;
      uri: string;
      mime_type?: string | null;
    };

/**
One durable transcript row. `seq` is stable within a session and orders snapshot/live merge.
*/
export interface TranscriptEntry {
  seq: number;
  role: "user" | "agent";
  part: Part;
  created_at?: number;
  started_at?: number;
}

/**
A page never begins in the middle of a user turn. `next_before` is exclusive.
*/
export interface TranscriptPage {
  entries: TranscriptEntry[];
  next_before: number | null;
  snapshot_through: number | null;
}

export type SkillPayload =
  | { kind: "fragment"; text: string }
  // Core's untagged slot deserializer accepts bare legacy ids and full slot objects (R2).
  | { kind: "macro"; template: string; slots: (string | MacroSlotInfo)[] };

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  source?: string | null;
  payload: SkillPayload;
}

// True only inside the Electrobun webview; Vite preview still runs in a plain browser.
const isInDesktop = isElectrobun;

/**
False in the plain Vite renderer (`bun run dev:renderer`), where native commands do not exist.
*/
export const isDesktop = isInDesktop;

let callProjectPath: string | null = null;

export function setCallProjectPath(path: string | null): void {
  callProjectPath = path;
}

const browserDockerContainers = [
  {
    command: '"bun run start"',
    createdAt: "2026-08-25 19:21:04 +0800 SGT",
    id: "8f4c2e9133ef",
    image: "ghcr.io/codetwo/api:latest",
    labels: null,
    localVolumes: 0,
    mounts: "",
    name: "api",
    networks: "bridge",
    ports: "0.0.0.0:8080->8080/tcp",
    runningFor: "22 hours ago",
    size: "12.4kB (virtual 286MB)",
    state: "running",
    status: "Up 22 hours",
  },
  {
    command: '"bun run worker"',
    createdAt: "2026-08-24 08:12:01 +0800 SGT",
    id: "b497581dd054",
    image: "ghcr.io/codetwo/worker:latest",
    labels: null,
    localVolumes: 0,
    mounts: "",
    name: "worker",
    networks: "bridge",
    ports: "",
    runningFor: "2 days ago",
    size: "8.2kB (virtual 284MB)",
    state: "exited",
    status: "Exited (0) 18 hours ago",
  },
  {
    command: '"docker-entrypoint.s…"',
    createdAt: "2026-08-24 08:11:40 +0800 SGT",
    id: "24c2830d260a",
    image: "postgres:16-alpine",
    labels: null,
    localVolumes: 1,
    mounts: "codetwo_pgdata",
    name: "postgres",
    networks: "bridge",
    ports: "0.0.0.0:5432->5432/tcp",
    runningFor: "2 days ago",
    size: "63B (virtual 247MB)",
    state: "exited",
    status: "Exited (0) 18 hours ago",
  },
];

const browserDockerImages = [
  {
    containers: 1,
    createdAt: "2026-08-25 18:42:11 +0800 SGT",
    createdSince: "22 hours ago",
    digest: "sha256:6ec4ca4b0d1e",
    id: "sha256:19a3a8c9d0d8",
    repository: "ghcr.io/codetwo/api",
    sharedSize: "0B",
    size: "286MB",
    tag: "latest",
    uniqueSize: "286MB",
  },
  {
    containers: 1,
    createdAt: "2026-08-24 07:55:03 +0800 SGT",
    createdSince: "2 days ago",
    digest: "sha256:f79edcb4a1ef",
    id: "sha256:f7eb244d02c9",
    repository: "ghcr.io/codetwo/worker",
    sharedSize: "0B",
    size: "284MB",
    tag: "latest",
    uniqueSize: "284MB",
  },
  {
    containers: 1,
    createdAt: "2026-08-18 05:10:02 +0800 SGT",
    createdSince: "8 days ago",
    digest: "sha256:3e89afe3d2c2",
    id: "sha256:34f2dfe3bb89",
    repository: "postgres",
    sharedSize: "0B",
    size: "247MB",
    tag: "16-alpine",
    uniqueSize: "247MB",
  },
];

function browserDockerCall(name: string, rawArguments: unknown): unknown {
  const argumentsObject =
    rawArguments != null &&
    typeof rawArguments === "object" &&
    !Array.isArray(rawArguments)
      ? rawArguments
      : null;
  const argumentsValue: Record<string, unknown> = {};
  if (argumentsObject !== null) {
    for (const [key, value] of Object.entries(argumentsObject)) {
      argumentsValue[key] = value;
    }
  }
  const container =
    typeof argumentsValue.container === "string"
      ? argumentsValue.container
      : "container";
  const image =
    typeof argumentsValue.image === "string" ? argumentsValue.image : "image";
  switch (name) {
    case "docker.status": {
      return {
        available: true,
        clientVersion: "29.7.2",
        containers: { paused: 0, running: 1, stopped: 20, total: 21 },
        context: "desktop-linux",
        engine: {
          architecture: "aarch64",
          cpus: 10,
          dockerRootDir: "/var/lib/docker",
          memoryBytes: 8_589_934_592,
          name: "docker-desktop",
          operatingSystem: "Docker Desktop",
        },
        images: 12,
        message:
          "Docker 29.7.2 is running · 1 running · 20 stopped · 12 images",
        serverVersion: "29.7.2",
      };
    }
    case "docker.containers": {
      return {
        containers: browserDockerContainers,
        count: browserDockerContainers.length,
        message: `${browserDockerContainers.length} Docker containers.`,
        truncated: false,
      };
    }
    case "docker.images": {
      return {
        count: browserDockerImages.length,
        images: browserDockerImages,
        message: `${browserDockerImages.length} Docker images.`,
        truncated: false,
      };
    }
    case "docker.inspect": {
      return {
        container,
        details: {
          Config: {
            Image: browserDockerContainers.find(
              (item) => item.name === container
            )?.image,
          },
          Id:
            browserDockerContainers.find((item) => item.name === container)
              ?.id ?? container,
          Name: `/${container}`,
          State: { Status: container === "api" ? "running" : "exited" },
        },
        message: `Inspected ${container}.`,
      };
    }
    case "docker.logs": {
      return {
        container,
        message: `Read logs from ${container}.`,
        stderr: "",
        stdout: `[2026-08-26T10:31:04Z] ${container} ready\n[2026-08-26T10:31:08Z] GET /health 200`,
      };
    }
    case "docker.start":
    case "docker.stop":
    case "docker.restart": {
      return {
        action: name.slice("docker.".length),
        container,
        message: `${name} ${container}`,
        output: container,
      };
    }
    case "docker.pull": {
      return {
        image,
        message: `Pulled ${image}.`,
        output: `Downloaded newer image for ${image}`,
      };
    }
    case "docker.remove_image": {
      return {
        image,
        message: `Removed ${image}.`,
        output: `Untagged: ${image}`,
      };
    }
    default: {
      throw new Error(
        `plugin command "${name}" is unavailable outside the desktop app`
      );
    }
  }
}

// ---- the plugin graph -------------------------------------------------------------------------

export async function call<T = unknown>(
  name: string,
  argumentsValue?: unknown,
  projectPath: string | null = callProjectPath
): Promise<T> {
  const result: unknown = isInDesktop
    ? await desktopCall(name, argumentsValue ?? null, projectPath)
    : browserDockerCall(name, argumentsValue);
  return assertIpcResult<T>(result);
}

/**
Lifecycle state of one plugin instance, as the kernel reports it.
*/
export type PluginStatus =
  | "pending"
  | "loading"
  | "active"
  | "failed"
  | "disposed";

/**
One plugin instance in the running graph.
*/
export interface PluginScope {
  id: number;
  parent: number | null;
  plugin: string;
  status: PluginStatus;
  error: string | null;
  inject: { required: string[]; optional: string[] };
  /**
  Injected services that are missing — why a `pending` plugin is pending.
  */
  missing: string[];
  services: string[];
  commands: string[];
  config: unknown;
}

export interface PluginCommand {
  name: string;
  plugin: string;
  scope: number;
  description: string | null;
}

export async function kernelScopes(): Promise<PluginScope[]> {
  return isInDesktop ? await call<PluginScope[]>("kernel.scopes") : [];
}

export async function kernelCommands(): Promise<PluginCommand[]> {
  return isInDesktop ? await call<PluginCommand[]>("kernel.commands") : [];
}

/**
One installable plugin: whether it runs, its config, and the schema to render a form from.
*/
export interface PluginEntry {
  name: string;
  description: string | null;
  enabled: boolean;
  running: boolean;
  status: PluginStatus | null;
  config: unknown;
  schema: unknown;
  /**
  Registered but absent from the config — installable, not installed.
  */
  available: boolean;
}

export async function listCorePlugins(): Promise<PluginEntry[]> {
  return isInDesktop ? await call<PluginEntry[]>("kernel.plugins") : [];
}

// ---- unified plugin management ---------------------------------------------------------------

/**
Configuration scope exposed to renderer code. Rust receives the same tagged enum in snake_case.
*/
export type ManagedPluginScope =
  | { kind: "user" }
  | { kind: "project"; projectPath: string };

export type ManagedPluginOverride = "inherit" | "enabled" | "disabled";
export type ManagedPluginOrigin = "built_in" | "host" | "third_party";
export type ManagedPluginRole = "core" | "built_in" | "extension";
export type ManagedPluginCategory =
  | "foundation"
  | "workspace"
  | "automation"
  | "developer_tools"
  | "interface"
  | "integration"
  | "other";
export type ManagedPluginScopeSupport = "user" | "project";

export interface ManagedPluginMetadata {
  origin: ManagedPluginOrigin;
  role: ManagedPluginRole;
  category: ManagedPluginCategory;
  scope_support: ManagedPluginScopeSupport[];
  essential: boolean;
  default_enabled: boolean;
}

export interface ManagedPluginDependencies {
  required: string[];
  optional: string[];
}

export interface ManagedPluginCatalogEntry {
  id: string;
  description: string | null;
  metadata: ManagedPluginMetadata;
  dependencies: ManagedPluginDependencies;
  /**
  Current scope policy. Older hosts omit this, so adapters must tolerate undefined.
  */
  state?: ManagedPluginOverride;
  enabled: boolean;
  running: boolean;
  status: PluginStatus | null;
  missing: string[];
  error: string | null;
  config: unknown;
  schema: unknown | null;
  available: boolean;
  components: Record<string, ManagedPluginOverride>;
  commands?: string[];
  services?: string[];
}

export type ManagedPluginRecovery =
  | { kind: "normal" }
  | { kind: "restored_last_good"; error: string }
  | { kind: "safe_mode"; error: string };

export interface ManagedPluginCatalog {
  graph_revision: number;
  config_revision: number;
  recovery: ManagedPluginRecovery;
  plugins: ManagedPluginCatalogEntry[];
}

export interface ManagedPluginChangeRequest {
  plugin: string;
  scope: ManagedPluginScope;
  state?: ManagedPluginOverride;
  config?: unknown;
  component?: string;
}

export interface ManagedPluginActiveResource {
  plugin: string;
  kind: string;
  id: string;
  label: string;
}

export interface ManagedPluginChangePlan {
  id: string;
  graph_revision: number;
  config_revision: number;
  request: ManagedPluginChangeRequest;
  affected: string[];
  active_resources: ManagedPluginActiveResource[];
  requires_confirmation: boolean;
}

export interface ManagedPluginChangeResult {
  graph_revision: number;
  config_revision: number;
  affected: string[];
}

type ManagedPluginScopeWire =
  | { kind: "user" }
  | { kind: "project"; project_path: string };

type ManagedPluginChangePlanWire = Omit<ManagedPluginChangePlan, "request"> & {
  request: Omit<ManagedPluginChangeRequest, "scope"> & {
    scope: ManagedPluginScopeWire;
  };
};

export function managedPluginScopeToWire(
  scope: ManagedPluginScope
): ManagedPluginScopeWire {
  return scope.kind === "user"
    ? { kind: "user" }
    : { kind: "project", project_path: scope.projectPath };
}

function managedPluginScopeFromWire(
  scope: ManagedPluginScopeWire
): ManagedPluginScope {
  return scope.kind === "user"
    ? { kind: "user" }
    : { kind: "project", projectPath: scope.project_path };
}

function managedPluginPlanFromWire(
  plan: ManagedPluginChangePlanWire
): ManagedPluginChangePlan {
  return {
    ...plan,
    request: {
      ...plan.request,
      scope: managedPluginScopeFromWire(plan.request.scope),
    },
  };
}

const emptyManagedPluginCatalog: ManagedPluginCatalog = {
  config_revision: 0,
  graph_revision: 0,
  plugins: [],
  recovery: { kind: "normal" },
};

export async function pluginCatalog(
  scope: ManagedPluginScope
): Promise<ManagedPluginCatalog> {
  if (!isInDesktop) {
    return emptyManagedPluginCatalog;
  }
  return await call<ManagedPluginCatalog>(
    "plugins.catalog",
    { scope: managedPluginScopeToWire(scope) },
    null
  );
}

export async function planPluginChange(
  request: ManagedPluginChangeRequest
): Promise<ManagedPluginChangePlan> {
  const wire = await call<ManagedPluginChangePlanWire>(
    "plugins.plan_change",
    { ...request, scope: managedPluginScopeToWire(request.scope) },
    null
  );
  return managedPluginPlanFromWire(wire);
}

export async function applyPluginChange(
  id: string
): Promise<ManagedPluginChangeResult> {
  return await call<ManagedPluginChangeResult>(
    "plugins.apply_change",
    { id },
    null
  );
}

export async function resetManagedPlugin(
  plugin: string,
  scope: ManagedPluginScope
): Promise<ManagedPluginChangeResult> {
  return await call<ManagedPluginChangeResult>(
    "plugins.reset",
    { plugin, scope: managedPluginScopeToWire(scope) },
    null
  );
}

export async function listExtensions(): Promise<{
  ready: string[];
  untrusted: string[];
}> {
  if (!isInDesktop) {
    return { ready: [], untrusted: [] };
  }
  return await call("extensions.list");
}

export interface PluginReloadRecord {
  at: number;
  plugins: string[];
  success: boolean;
  error?: string | null;
}

export interface PluginDeveloperStatus {
  enabled: boolean;
  watching: boolean;
  plugins_dir: string;
  last_reload: PluginReloadRecord | null;
}

const fallbackPluginDeveloperStatus: PluginDeveloperStatus = {
  enabled: false,
  last_reload: null,
  plugins_dir: "",
  watching: false,
};

export async function getPluginDeveloperStatus(): Promise<PluginDeveloperStatus> {
  return isInDesktop
    ? await call<PluginDeveloperStatus>(
        "plugins.developer_status",
        undefined,
        null
      )
    : { ...fallbackPluginDeveloperStatus };
}

export async function setPluginDeveloperMode(
  isEnabled: boolean
): Promise<PluginDeveloperStatus> {
  if (!isInDesktop) {
    throw new Error("Plugin development requires the C2 desktop app.");
  }
  return await call<PluginDeveloperStatus>(
    "plugins.set_developer_mode",
    { enabled: isEnabled },
    null
  );
}

export async function reloadDevelopmentPlugins(): Promise<PluginDeveloperStatus> {
  if (!isInDesktop) {
    throw new Error("Plugin reload requires the C2 desktop app.");
  }
  return await call<PluginDeveloperStatus>(
    "plugins.reload_development",
    undefined,
    null
  );
}

const fallbackProvider = (
  id: string,
  display_name: string,
  isNeeds_node: boolean
): ProviderInfo => {
  return {
    available: false,
    capabilities: [],
    configuration: defaultProviderConfig({ id }),
    display_name,
    enabled: true,
    id,
    management: {
      check_error: null,
      install_supported: false,
      installed: false,
      latest_version: null,
      launch_mode: "unavailable",
      update_available: null,
      upgrade_supported: false,
      version: null,
    },
    models: [],
    needs_node: isNeeds_node,
  };
};

const fallbackProviderCatalog: ProviderInfo[] = [
  fallbackProvider("claude_code", "Claude Code", true),
  fallbackProvider("codex", "Codex", true),
  fallbackProvider("grok", "Grok", false),
  fallbackProvider("cursor", "Cursor", false),
  fallbackProvider("opencode", "OpenCode", false),
  fallbackProvider("opencode2", "OpenCode 2 (Beta)", false),
  fallbackProvider("pi", "Pi", true),
  fallbackProvider("kimi", "Kimi", false),
  fallbackProvider("zcode", "ZCode (GLM)", true),
  fallbackProvider("amp", "Amp", true),
  fallbackProvider("droid", "Droid", false),
];

export function fallbackProviders(): ProviderInfo[] {
  return fallbackProviderCatalog.map((provider) => {
    return {
      ...provider,
      capabilities: [...provider.capabilities],
      configuration: {
        ...provider.configuration,
        args: provider.configuration.args
          ? [...provider.configuration.args]
          : null,
        effective_args: [...provider.configuration.effective_args],
        forwarded_environment: [
          ...provider.configuration.forwarded_environment,
        ],
        missing_environment: [...provider.configuration.missing_environment],
      },
      management: { ...provider.management },
      models: [...provider.models],
    };
  });
}

export function providerDisplayName(providerId: string): string {
  return (
    fallbackProviderCatalog.find((provider) => provider.id === providerId)
      ?.display_name ?? providerId
  );
}

const fallbackSkills: SkillInfo[] = [
  {
    description: "Meticulous reviewer",
    icon: "🔍",
    id: "reviewer",
    kind: "fragment",
    name: "Code Reviewer",
    source: null,
  },
  {
    description: "Thorough tests",
    icon: "🧪",
    id: "test-writer",
    kind: "fragment",
    name: "Test Writer",
    source: null,
  },
  {
    description: "Find vulns",
    icon: "🛡️",
    id: "security-audit",
    kind: "fragment",
    name: "Security Audit",
    source: null,
  },
  {
    description: "Commit macro",
    icon: "📝",
    id: "commit-macro",
    kind: "macro",
    macro_slots: [
      {
        id: "style",
        kind: "select",
        label: "Style",
        options: ["conventional", "descriptive"],
        required: true,
      },
      { id: "scope", kind: "text", label: "Scope" },
    ],
    macro_template:
      "Write a {{style}} commit message for changes to {{scope}}.",
    name: "Commit Message",
    source: null,
  },
  {
    description: "Review a release against its acceptance criteria",
    icon: null,
    id: "demo:skill:review",
    kind: "agent_skill",
    name: "Release Review",
    source: "Plugin · Developer Toolkit",
  },
  {
    description: "Collect primary evidence before implementation",
    icon: null,
    id: "demo:agent:research",
    kind: "subagent",
    name: "Researcher",
    source: "Plugin · Developer Toolkit",
  },
  {
    description: "MCP server from Developer Toolkit",
    icon: null,
    id: "demo:mcp:docs",
    kind: "mcp",
    name: "docs-search",
    source: "Plugin · Developer Toolkit",
  },
];

export async function listProviders(
  isCheckUpdates = false
): Promise<ProviderInfo[]> {
  const providers = isInDesktop
    ? await call<ProviderInfoWire[]>("providers.list", {
        check_updates: isCheckUpdates,
      })
    : fallbackProviders();
  return providers.map(normalizeProviderInfo);
}

export async function setProviderEnabled(
  provider: string,
  isEnabled: boolean
): Promise<ProviderInfo[]> {
  if (!isInDesktop) {
    throw new Error("Provider management is available in the C2 desktop app");
  }
  const providers = await call<ProviderInfoWire[]>("providers.set_enabled", {
    enabled: isEnabled,
    provider,
  });
  return providers.map(normalizeProviderInfo);
}

export async function configureProvider(
  provider: string,
  config: ProviderRuntimeOverride
): Promise<ProviderInfo[]> {
  if (!isInDesktop) {
    throw new Error(
      "Provider configuration is available in the C2 desktop app"
    );
  }
  const providers = await call<ProviderInfoWire[]>("providers.configure", {
    configuration: config,
    provider,
  });
  return providers.map(normalizeProviderInfo);
}

export async function installProvider(
  provider: string
): Promise<ProviderInfo[]> {
  if (!isInDesktop) {
    throw new Error("Provider installation is available in the C2 desktop app");
  }
  const providers = await call<ProviderInfoWire[]>("providers.install", {
    provider,
  });
  return providers.map(normalizeProviderInfo);
}

export async function upgradeProvider(
  provider: string
): Promise<ProviderInfo[]> {
  if (!isInDesktop) {
    throw new Error("Provider upgrades are available in the C2 desktop app");
  }
  const providers = await call<ProviderInfoWire[]>("providers.upgrade", {
    provider,
  });
  return providers.map(normalizeProviderInfo);
}

export async function getComputerUseSettings(): Promise<ComputerUseSettings> {
  if (!isInDesktop) {
    return {
      backends: [
        {
          available: false,
          display_name: "Cua Driver",
          exclude_providers: [],
          id: "cua",
          providers: [],
          reason: "Computer Use backends are discovered by the desktop host.",
        },
      ],
      errors: [],
      selections: {},
    };
  }
  return normalizeComputerUseSettings(
    await call<ComputerUseSettingsWire>("computer_use.settings")
  );
}

export async function selectComputerUseBackend(
  backend: string
): Promise<ComputerUseSettings> {
  if (!isInDesktop) {
    return await getComputerUseSettings();
  }
  return normalizeComputerUseSettings(
    await call<ComputerUseSettingsWire>("computer_use.select", { backend })
  );
}

export async function getBrowserUseSettings(): Promise<BrowserUseSettings> {
  if (!isInDesktop) {
    return {
      access_enabled: false,
      backends: [
        {
          available: false,
          display_name: "OpenAI Browser / Chrome",
          exclude_providers: [],
          id: "openai-browser",
          providers: ["codex"],
          reason: "Browser Use backends are discovered by the desktop host.",
        },
      ],
      errors: [],
      selections: {},
    };
  }
  return normalizeBrowserUseSettings(
    await call<BrowserUseSettingsWire>("browser_use.settings")
  );
}

export async function selectBrowserUseBackend(
  backend: string
): Promise<BrowserUseSettings> {
  if (!isInDesktop) {
    return await getBrowserUseSettings();
  }
  return normalizeBrowserUseSettings(
    await call<BrowserUseSettingsWire>("browser_use.select", { backend })
  );
}

export async function setAgentBrowserAccess(
  isEnabled: boolean
): Promise<BrowserUseSettings> {
  if (!isInDesktop) {
    return await getBrowserUseSettings();
  }
  return normalizeBrowserUseSettings(
    await call<BrowserUseSettingsWire>("browser_use.set_access", {
      enabled: isEnabled,
    })
  );
}

/// Passing a cwd makes the core rescan that workspace's harness skill directories
/// (.claude/skills, .codex/skills, …) before answering.
export async function listSkills(cwd?: string): Promise<SkillInfo[]> {
  return isInDesktop
    ? await call<SkillInfo[]>("skills.list", { cwd: cwd ?? null })
    : fallbackSkills;
}

export async function listSessions(): Promise<SessionInfo[]> {
  return isInDesktop ? await call<SessionInfo[]>("sessions.list") : [];
}

export interface ImportedSessionSummary {
  id: string;
  title: string;
  source: string;
  messages: number;
  imported: boolean;
}

export interface SessionImportResult {
  files: number;
  imported: number;
  skipped: number;
  failed: number;
  messages: number;
  sessions: ImportedSessionSummary[];
  errors: { path: string; message: string }[];
}

export async function importSessionFiles(
  fallbackCwd: string
): Promise<SessionImportResult | null> {
  if (!isInDesktop) {
    return null;
  }
  const paths = await desktopOpenDialog({
    directory: false,
    filters: [
      {
        extensions: ["jsonl", "vscdb", "sqlite", "db"],
        name: "Codex, Claude Code, Cursor, or T3 Code",
      },
    ],
    multiple: true,
    title: "Import conversations",
  });
  if (paths.length === 0) {
    return null;
  }
  return await call<SessionImportResult>("sessions.import", {
    fallback_cwd: fallbackCwd,
    paths,
  });
}

export async function getMemorySettings(): Promise<MemorySettings> {
  return isInDesktop
    ? await call<MemorySettings>("memory.settings")
    : {
        capture: true,
        enabled: true,
        include_external_context: true,
        inject: true,
      };
}

export async function saveMemorySettings(
  settings: MemorySettings
): Promise<void> {
  if (isInDesktop) {
    await call("memory.set_settings", { settings });
  }
}

export async function getMemoryProjectPolicy(
  projectPath: string
): Promise<MemoryProjectPolicy> {
  return isInDesktop
    ? await call<MemoryProjectPolicy>("memory.project_policy", {
        project_path: projectPath,
      })
    : {
        capture: "inherit",
        include_external_context: "inherit",
        inject: "inherit",
        project_path: projectPath,
      };
}

export async function saveMemoryProjectPolicy(
  projectPath: string,
  policy: MemoryProjectPolicy
): Promise<void> {
  if (isInDesktop) {
    await call("memory.set_project_policy", {
      policy,
      project_path: projectPath,
    });
  }
}

export async function listMemories(
  projectPath: string,
  limit = 100
): Promise<MemoryRecord[]> {
  return isInDesktop
    ? await call<MemoryRecord[]>("memory.list", {
        limit,
        project_path: projectPath,
      })
    : [];
}

export async function listManagedMemories(
  projectPath: string,
  limit = 500
): Promise<MemoryRecord[]> {
  return isInDesktop
    ? await call<MemoryRecord[]>("memory.manage_list", {
        limit,
        project_path: projectPath,
      })
    : [];
}

export async function searchMemories(
  projectPath: string,
  query: string,
  limit = 50
): Promise<MemoryRecord[]> {
  return isInDesktop
    ? await call<MemoryRecord[]>("memory.search", {
        limit,
        project_path: projectPath,
        query,
      })
    : [];
}

export async function getMemoryStats(
  projectPath: string
): Promise<MemoryStats> {
  return isInDesktop
    ? await call<MemoryStats>("memory.stats", { project_path: projectPath })
    : {
        active: 0,
        conflicts: 0,
        forgotten: 0,
        l0: 0,
        l1: 0,
        l2: 0,
        l3: 0,
        pending: 0,
        pinned: 0,
        recent: 0,
      };
}

export async function addMemory(
  projectPath: string,
  category: string,
  content: string,
  isPinned = true
): Promise<MemoryRecord> {
  return await call<MemoryRecord>("memory.add", {
    category,
    content,
    pinned: isPinned,
    project_path: projectPath,
  });
}

export async function setMemoryPinned(
  id: string,
  isPinned: boolean
): Promise<void> {
  if (isInDesktop) {
    await call("memory.set_pinned", { id, value: isPinned });
  }
}

export async function setMemoryActive(
  id: string,
  isActive: boolean
): Promise<void> {
  if (isInDesktop) {
    await call("memory.set_active", { id, value: isActive });
  }
}

export async function updateMemory(
  id: string,
  category: string,
  content: string
): Promise<MemoryRecord> {
  return await call<MemoryRecord>("memory.update", { category, content, id });
}

export async function setMemoryCategory(
  id: string,
  category: string
): Promise<MemoryRecord> {
  return await call<MemoryRecord>("memory.set_category", { category, id });
}

export async function correctMemory(
  id: string,
  category: string,
  content: string
): Promise<MemoryRecord> {
  return await call<MemoryRecord>("memory.correct", { category, content, id });
}

export async function deleteMemory(id: string): Promise<void> {
  if (isInDesktop) {
    await call("memory.delete", { id });
  }
}

export async function getMemoryEvidence(
  id: string,
  isReveal = false
): Promise<MemoryEvidence[]> {
  return isInDesktop
    ? await call<MemoryEvidence[]>("memory.evidence", { id, reveal: isReveal })
    : [];
}

export async function getMemoryUsages(id: string): Promise<MemoryUsage[]> {
  return isInDesktop ? await call<MemoryUsage[]>("memory.usages", { id }) : [];
}

export async function setSessionMemoryPolicy(
  session: string,
  read: MemoryAccess,
  write: MemoryAccess
): Promise<void> {
  if (isInDesktop) {
    await call("memory.set_session_policy", { read, session, write });
  }
}

export async function listMemoryReceipts(
  session: string
): Promise<MemoryReceipt[]> {
  return isInDesktop
    ? await call<MemoryReceipt[]>("memory.receipts", { session })
    : [];
}

export async function newSession(
  provider: string,
  cwd: string,
  worktreeBase: WorktreeBaselineKind | null,
  requestId: string,
  worktreeBaseSha?: string | null,
  initialPolicy?: ExecutionPolicy | null,
  initialModel?: string | null,
  isTransient = false,
  initialReasoningEffort?: string | null,
  parallelTask?: { taskId: string; goal: string } | null
): Promise<void> {
  if (!isInDesktop) {
    return;
  }

  if (parallelTask) {
    if (worktreeBase === null) {
      throw new Error("Parallel tasks require an isolated worktree");
    }
    await call("engine.new_parallel_task", {
      cwd,
      goal: parallelTask.goal,
      initial_policy: initialPolicy ?? null,
      model: initialModel ?? null,
      provider,
      reasoning_effort: initialReasoningEffort ?? null,
      request_id: requestId,
      task_id: parallelTask.taskId,
      worktree_base: worktreeBase,
      worktree_base_sha: worktreeBaseSha ?? null,
    });
    return;
  }
  await call("engine.new_session", {
    cwd,
    initial_policy: initialPolicy ?? null,
    model: initialModel ?? null,
    provider,
    reasoning_effort: initialReasoningEffort ?? null,
    request_id: requestId,
    transient: isTransient,
    use_worktree: worktreeBase !== null,
    worktree_base: worktreeBase,
    worktree_base_sha: worktreeBaseSha ?? null,
  });
}

export async function closeTransientSession(session: string): Promise<boolean> {
  return isInDesktop
    ? await call<boolean>("engine.close_transient_session", { session })
    : true;
}

export async function listWorktreeBaselines(
  cwd: string
): Promise<WorktreeBaselineOption[]> {
  return isInDesktop
    ? await call<WorktreeBaselineOption[]>("worktrees.baselines", { cwd })
    : [];
}

export async function discardSessionWorktree(
  session: string
): Promise<DiscardedWorktree> {
  return isInDesktop
    ? await call<DiscardedWorktree>("worktrees.discard_session", { session })
    : { removed_checkout: false };
}

export async function listProjectWorktrees(
  projectPath: string
): Promise<WorktreeStatusEntry[]> {
  return isInDesktop
    ? await call<WorktreeStatusEntry[]>("worktrees.list", {
        project_path: projectPath,
      })
    : [];
}

const browserWorktreeSettings: WorktreeSettings = {
  auto_delete: false,
  auto_delete_limit: 15,
  fetch_upstream: false,
};

export async function getWorktreeSettings(): Promise<WorktreeSettings> {
  return isInDesktop
    ? await call<WorktreeSettings>("worktrees.settings", {})
    : { ...browserWorktreeSettings };
}

export async function updateWorktreeSettings(
  settings: WorktreeSettings
): Promise<WorktreeSettings> {
  return isInDesktop
    ? await call<WorktreeSettings>("worktrees.set_settings", { settings })
    : { ...settings };
}

export async function discardOrphanWorktree(
  projectPath: string,
  worktreePath: string
): Promise<DiscardedWorktree> {
  return isInDesktop
    ? await call<DiscardedWorktree>("worktrees.discard_orphan", {
        project_path: projectPath,
        worktree_path: worktreePath,
      })
    : { removed_checkout: false };
}

export async function submitPrompt(
  session: string,
  documentValue: DocumentBlock[],
  requestId: string
): Promise<void> {
  if (isInDesktop) {
    await call("engine.prompt", {
      doc: documentValue,
      request_id: requestId,
      session,
    });
  }
}

export async function prepareSession(session: string): Promise<void> {
  if (isInDesktop) {
    await call("engine.prepare_session", { session });
  }
}

export async function queuePrompt(
  session: string,
  documentValue: DocumentBlock[],
  requestId: string
): Promise<{ position: number }> {
  return isInDesktop
    ? await call<{ position: number }>("engine.queue", {
        doc: documentValue,
        request_id: requestId,
        session,
      })
    : { position: 0 };
}

export async function steerPrompt(
  session: string,
  documentValue: DocumentBlock[],
  requestId: string
): Promise<{ outcome: "injected" | "startedNewTurn" }> {
  return await call("engine.steer", {
    doc: documentValue,
    request_id: requestId,
    session,
  });
}

export async function controlGoal(
  session: string,
  action: "set" | "pause" | "resume" | "clear",
  objective?: string
): Promise<void> {
  if (isInDesktop) {
    await call("engine.goal", {
      action,
      objective: objective ?? null,
      session,
    });
  }
}

export async function listAutomations(): Promise<Automation[]> {
  return isInDesktop ? await call<Automation[]>("automation.list") : [];
}

export async function createAutomation(
  input: AutomationInput
): Promise<Automation> {
  return await call<Automation>("automation.create", { input });
}

export async function updateAutomation(
  id: string,
  input: AutomationInput
): Promise<Automation> {
  return await call<Automation>("automation.update", { id, input });
}

export async function setAutomationEnabled(
  id: string,
  isEnabled: boolean
): Promise<Automation> {
  return await call<Automation>("automation.set_enabled", {
    enabled: isEnabled,
    id,
  });
}

export async function deleteAutomation(id: string): Promise<boolean> {
  return await call<boolean>("automation.delete", { id });
}

export async function listAutomationRuns(
  automationId?: string | null,
  limit = 50
): Promise<AutomationRun[]> {
  return isInDesktop
    ? await call<AutomationRun[]>("automation.runs", {
        automation_id: automationId ?? null,
        limit,
      })
    : [];
}

export async function runAutomationNow(id: string): Promise<AutomationRun> {
  return await call<AutomationRun>("automation.run_now", { id });
}

export async function onAutomationChanged(
  callback: (automationId: string) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<string>("automation-changed", callback);
}

export async function onDeviceSyncChanged(
  callback: (imported: NonNullable<DeviceSyncStatus["imported"]>) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<NonNullable<DeviceSyncStatus["imported"]>>(
    "device-sync-changed",
    callback
  );
}

export async function answerPermission(
  session: string,
  requestId: string,
  optionId: string | null
): Promise<boolean> {
  if (isInDesktop) {
    return await call<boolean>("engine.answer_permission", {
      option_id: optionId,
      request_id: requestId,
      session,
    });
  }
  return false;
}

export async function answerElicitation(
  session: string,
  requestId: string,
  answer: ElicitationAnswer
): Promise<boolean> {
  if (isInDesktop) {
    return await call<boolean>("engine.answer_elicitation", {
      answer,
      request_id: requestId,
      session,
    });
  }
  return false;
}

export async function setPermissionMode(
  session: string,
  mode: string
): Promise<void> {
  if (isInDesktop) {
    await call("engine.set_permission_mode", { mode, session });
  }
}

export async function setExecutionPolicy(
  session: string,
  mode: PermissionMode,
  sandbox: Sandbox,
  requestId: string
): Promise<void> {
  if (isInDesktop) {
    await call("engine.set_execution_policy", {
      mode,
      request_id: requestId,
      sandbox,
      session,
    });
  }
}

/// One entry in a directory listing, for the file tree in the side dock.
export interface DirectoryEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export async function listDirectory(
  cwd: string,
  path: string
): Promise<DirectoryEntry[]> {
  return isInDesktop
    ? await call<DirectoryEntry[]>("workspace.list_dir", { cwd, path })
    : [];
}

export async function createFile(cwd: string, path: string): Promise<void> {
  if (isInDesktop) {
    await call("workspace.create_file", { cwd, path });
  }
}

export async function createDirectory(
  cwd: string,
  path: string
): Promise<void> {
  if (isInDesktop) {
    await call("workspace.create_dir", { cwd, path });
  }
}

export async function readText(cwd: string, path: string): Promise<string> {
  return isInDesktop
    ? await call<string>("workspace.read_text", { cwd, path })
    : "";
}

export async function readBinary(
  cwd: string,
  path: string
): Promise<Uint8Array> {
  if (!isInDesktop) {
    return new Uint8Array();
  }
  const res = await call<ArrayBuffer | number[]>("workspace.read_binary", {
    cwd,
    path,
  });
  return res instanceof ArrayBuffer ? new Uint8Array(res) : new Uint8Array(res);
}

export async function getArtifact(id: string): Promise<Uint8Array> {
  if (!isInDesktop) {
    return new Uint8Array();
  }
  const res = await call<ArrayBuffer | number[]>("artifacts.get", { id });
  return res instanceof ArrayBuffer ? new Uint8Array(res) : new Uint8Array(res);
}

export async function saveArtifactAs(
  id: string,
  displayName: string
): Promise<boolean> {
  if (!isInDesktop) {
    return false;
  }
  const destination = await desktopSaveDialog({ defaultPath: displayName });
  if (destination == null || destination === "") {
    return false;
  }
  await call("artifacts.save_as", { destination, id });
  return true;
}

export async function revealArtifact(id: string): Promise<void> {
  if (isInDesktop) {
    await call("artifacts.reveal", { id });
  }
}

export async function readVisualization(path: string): Promise<string> {
  if (
    !isInDesktop &&
    import.meta.env.DEV &&
    path === "/__codetwo__/rich-transcript-preview.html"
  ) {
    return String.raw`<section class="card" aria-labelledby="release-confidence">
  <div class="viz-row" style="justify-content:space-between">
    <div><h2 id="release-confidence">Release confidence</h2><p class="text-small text-muted">Latest verification run</p></div>
    <span class="viz-badge">Healthy</span>
  </div>
  <div class="viz-grid" style="margin-top:12px">
    <div><p class="text-small text-muted">Checks passed</p><p class="viz-stat-value">511</p></div>
    <div><p class="text-small text-muted">New design violations</p><p class="viz-stat-value">0</p></div>
    <div><p class="text-small text-muted">Renderer build</p><p class="viz-stat-value">Passed</p></div>
  </div>
  <div class="viz-row" style="margin-top:14px">
    <button class="btn btn-primary" onclick="window.openai.sendFollowUpMessage({prompt:'Show the failed checks only',title:'Filter verification results'})"><svg class="viz-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.85746 12.5061C6.36901 10.6456 4.59564 8.59915 3.62734 7.44867C3.3276 7.09253 3.22938 6.8319 3.17033 6.3728C2.96811 4.8008 2.86701 4.0148 3.32795 3.5074C3.7889 3 4.60404 3 6.23433 3H17.7657C19.396 3 20.2111 3 20.672 3.5074C21.133 4.0148 21.0319 4.8008 20.8297 6.37281C20.7706 6.83191 20.6724 7.09254 20.3726 7.44867C19.403 8.60062 17.6261 10.6507 15.1326 12.5135C14.907 12.6821 14.7583 12.9567 14.7307 13.2614C14.4837 15.992 14.2559 17.4876 14.1141 18.2442C13.8853 19.4657 12.1532 20.2006 11.226 20.8563C10.6741 21.2466 10.0043 20.782 9.93278 20.1778C9.79643 19.0261 9.53961 16.6864 9.25927 13.2614C9.23409 12.9539 9.08486 12.6761 8.85746 12.5061Z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.7"/></svg>Filter results</button>
    <span class="text-small text-muted">Updated just now</span>
  </div>
</section>`;
  }
  return await call<string>("artifacts.read_visualization", { path });
}

export async function writeText(
  cwd: string,
  path: string,
  content: string
): Promise<void> {
  if (isInDesktop) {
    await call("workspace.write_text", { content, cwd, path });
  }
}

function splitNativePath(path: string): {
  cwd: string;
  name: string;
} {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (separator < 0) {
    return { cwd: ".", name: path };
  }
  const isWindowsRoot = separator === 2 && path[1] === ":";
  const cwd = isWindowsRoot
    ? path.slice(0, separator + 1)
    : path.slice(0, separator) || path.slice(0, 1);
  return { cwd, name: path.slice(separator + 1) };
}

export async function pickAppearanceThemeDocument(): Promise<
  string | null | undefined
> {
  if (!isInDesktop) {
    return undefined;
  }
  const [selected] = await desktopOpenDialog({
    directory: false,
    filters: [{ extensions: ["json"], name: "C2 theme" }],
    multiple: false,
    title: "Import C2 theme",
  });
  if (!selected) {
    return null;
  }
  const { cwd, name } = splitNativePath(selected);
  return await call<string>("workspace.read_text", { cwd, path: name });
}

export type AppearanceThemeSaveResult = "saved" | "cancelled" | "unsupported";

export async function saveAppearanceThemeDocument(
  suggestedName: string,
  content: string
): Promise<AppearanceThemeSaveResult> {
  if (!isInDesktop) {
    return "unsupported";
  }
  const selected = await desktopSaveDialog({
    defaultPath: suggestedName,
    filters: [{ extensions: ["json"], name: "C2 theme" }],
    title: "Export C2 theme",
  });
  if (typeof selected !== "string") {
    return "cancelled";
  }
  const { cwd, name } = splitNativePath(selected);
  try {
    await call("workspace.create_file", { cwd, path: name });
  } catch {
    // The save panel explicitly confirms replacement. An existing file is therefore expected.
  }
  await call("workspace.write_text", { content, cwd, path: name });
  return "saved";
}

export type DiagnosticsExportResult = "saved" | "cancelled" | "unsupported";

export async function exportRedactedDiagnostics(): Promise<DiagnosticsExportResult> {
  if (!isInDesktop) {
    return "unsupported";
  }
  const date = new Date().toISOString().slice(0, 10);
  const selected = await desktopSaveDialog({
    defaultPath: `c2-diagnostics-${date}.json`,
    filters: [{ extensions: ["json"], name: "C2 diagnostics" }],
    title: "Export C2 diagnostics",
  });
  if (typeof selected !== "string") {
    return "cancelled";
  }
  const report = await call("diagnostics.redacted_snapshot");
  const { cwd, name } = splitNativePath(selected);
  try {
    await call("workspace.create_file", { cwd, path: name });
  } catch {
    // The native save panel already asked the user to confirm replacement.
  }
  await call("workspace.write_text", {
    content: `${JSON.stringify(report, null, 2)}\n`,
    cwd,
    path: name,
  });
  return "saved";
}

export async function renamePath(
  cwd: string,
  from: string,
  to: string
): Promise<void> {
  if (isInDesktop) {
    await call("workspace.rename", { cwd, from, to });
  }
}

export async function copyPath(
  cwd: string,
  from: string,
  to: string
): Promise<void> {
  if (isInDesktop) {
    await call("workspace.copy", { cwd, from, to });
  }
}

export async function deletePath(cwd: string, path: string): Promise<void> {
  if (isInDesktop) {
    await call("workspace.delete", { cwd, path });
  }
}

export async function openDevtools(): Promise<void> {
  if (!isInDesktop) {
    throw new Error("WebView DevTools require the C2 desktop app.");
  }
  await desktopOpenDevtools();
}

// ---- built-in browser --------------------------------------------------------------------------
// Each browser tab is a native child webview of the main window, not an iframe: the sites people
// actually open (github.com, google.com, anything with `X-Frame-Options: DENY`) refuse to be framed
// and render blank. The panel measures a placeholder in the DOM and keeps the native view pinned
// over it — see `browser/Browser.tsx` and `browser/electrobun.ts`.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function browserOpen(
  label: string,
  url: string,
  _rect: Rect
): Promise<void> {
  if (isInDesktop) {
    browserOpenLocal(label, url);
  }
}

export async function browserBounds(label: string, _rect: Rect): Promise<void> {
  if (isInDesktop) {
    browserBoundsLocal(label);
  }
}

export async function browserNavigate(
  label: string,
  url: string
): Promise<void> {
  if (isInDesktop) {
    browserNavigateLocal(label, url);
  }
}

export async function browserHistory(
  label: string,
  delta: number
): Promise<void> {
  if (isInDesktop) {
    browserHistoryLocal(label, delta);
  }
}

export async function browserReload(label: string): Promise<void> {
  if (isInDesktop) {
    browserReloadLocal(label);
  }
}

export async function browserVisible(
  label: string,
  isVisible: boolean
): Promise<void> {
  if (isInDesktop) {
    browserVisibleLocal(label, isVisible);
  }
}

export async function browserZoom(
  label: string,
  factor: number
): Promise<void> {
  if (isInDesktop) {
    browserZoomLocal(label, factor);
  }
}

export async function browserDevtools(label: string): Promise<void> {
  if (isInDesktop) {
    browserDevtoolsLocal(label);
  }
}

export async function browserClose(label: string): Promise<void> {
  if (isInDesktop) {
    browserCloseLocal(label);
  }
}

export async function browserCloseAll(): Promise<void> {
  if (isInDesktop) {
    browserCloseAllLocal();
  }
}

export interface BrowserNav {
  label: string;
  url: string;
}

export type BrowserTab = EmbeddedBrowserTab;

export async function browserRegistrySnapshot(): Promise<BrowserTab[]> {
  return isInDesktop
    ? browserRegistrySnapshotLocal()
    : [
        {
          active: true,
          agent_active: false,
          id: "browser-1",
          title: "",
          url: "about:blank",
        },
      ];
}

export async function browserRegistryCreate(url: string): Promise<BrowserTab> {
  return isInDesktop
    ? browserRegistryCreateLocal(url)
    : {
        active: true,
        agent_active: false,
        id: `browser-${Date.now()}`,
        title: "",
        url,
      };
}

export async function browserTakeControl(label: string): Promise<void> {
  if (isInDesktop) {
    browserTakeControlLocal(label);
  }
}

export async function browserPermissions(): Promise<string[]> {
  return [];
}

export async function browserRevokePermission(origin: string): Promise<void> {
  void origin;
}

export async function onBrowserRegistry(
  callback: (tabs: BrowserTab[]) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return browserSubscribe("browser-registry", callback);
}

export async function onBrowserAgentActivity(
  callback: (payload: { tabId: string }) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return browserSubscribe("browser-agent-activity", callback);
}

export async function onBrowserDownloadBlocked(
  callback: (payload: { label: string }) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return browserSubscribe("browser-download-blocked", callback);
}

// ---- in-page annotator -------------------------------------------------------------------------
// Element picking, the note card and the live style edits all live inside the page (`annotate.js`),
// because the page is a native webview and nothing in our DOM can be drawn on top of it. The app
// arms it and pulls the results back out; the page can never call in.

export async function browserAnnotate(
  label: string,
  isOn: boolean
): Promise<void> {
  if (isInDesktop) {
    browserAnnotateLocal(label, isOn);
  }
}

export async function browserAnnotations(
  label: string,
  url: string
): Promise<Annotation[]> {
  return isInDesktop ? await browserAnnotationsLocal(label, url) : [];
}

export async function browserAnnotationCount(label: string): Promise<number> {
  return isInDesktop ? await browserAnnotationCountLocal(label) : 0;
}

export async function browserAnnotationsClear(label: string): Promise<void> {
  if (isInDesktop) {
    browserAnnotationsClearLocal(label);
  }
}

export async function onBrowserLoad(
  callback: (p: BrowserNav) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return browserSubscribe("browser-load", callback);
}

export async function onBrowserNav(
  callback: (p: BrowserNav) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return browserSubscribe("browser-nav", callback);
}

export async function onBrowserTitle(
  callback: (p: { label: string; title: string }) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return browserSubscribe("browser-title", callback);
}

export async function onBrowserPopup(
  callback: (p: BrowserNav) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return browserSubscribe("browser-popup", callback);
}

export async function confirmNative(
  message: string,
  title?: string
): Promise<boolean> {
  if (!isInDesktop) {
    return window.confirm(message);
  }
  try {
    return await desktopConfirm(message, title);
  } catch (error) {
    // A missing capability must fail closed: "no" loses nothing, "yes" can destroy work.
    console.error("confirmNative:", error);
    return false;
  }
}

export async function openExternal(url: string): Promise<void> {
  if (isInDesktop) {
    await desktopOpenExternal(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export async function openNativePath(path: string): Promise<boolean> {
  if (!isInDesktop) {
    return false;
  }
  return await desktopOpenPath(path);
}

export async function revealNativePath(path: string): Promise<boolean> {
  if (!isInDesktop) {
    return false;
  }
  return await desktopShowItemInFolder(path);
}

export async function openWorkspace(
  path: string,
  target: WorkspaceOpenTarget
): Promise<boolean> {
  if (!isInDesktop) {
    return false;
  }
  return await desktopOpenWorkspace(path, target);
}

// ---- LSP bridge --------------------------------------------------------------------------------
// The Rust side spawns real language servers (rust-analyzer, pyright, gopls, …) as children and
// frames their stdio JSON-RPC; the frontend LSP client in src/lsp speaks the protocol. One server
// per (binary, project) pair — the key names that pair.

export async function lspStart(
  cwd: string,
  lang: string
): Promise<string | null> {
  return isInDesktop
    ? await call<string | null>("lsp.start", { cwd, lang })
    : null;
}

export async function lspSend(key: string, payload: string): Promise<void> {
  if (isInDesktop) {
    await call("lsp.send", { key, payload });
  }
}

export async function lspSetRuntimeEnabled(
  isEnabled: boolean,
  projectPath: string | null
): Promise<void> {
  if (isInDesktop) {
    await call("lsp.set_runtime_enabled", { enabled: isEnabled }, projectPath);
  }
}

export interface LspMessage {
  key: string;
  payload: string;
}

export async function onLspMessage(
  callback: (p: LspMessage) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<LspMessage>("lsp-message", callback);
}

export async function onLspExit(
  callback: (key: string) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<string>("lsp-exit", callback);
}

export async function sessionPreviews(): Promise<Record<string, string>> {
  if (!isInDesktop) {
    return {};
  }
  const rows = await call<[string, string][]>("sessions.previews");
  return Object.fromEntries(rows);
}

export interface SessionSearchHit {
  session_id: string;
  title: string;
  cwd: string;
  archived: boolean;
  role: "user" | "agent";
  snippet: string;
  seq: number;
}

export async function searchSessions(
  query: string,
  limit = 12
): Promise<SessionSearchHit[]> {
  return isInDesktop
    ? await call<SessionSearchHit[]>("sessions.search", { limit, query })
    : [];
}

// ---- projects ----------------------------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  return isInDesktop ? await call<Project[]>("projects.list") : [];
}

export async function pickDirectory(): Promise<string | null> {
  if (!isInDesktop) {
    return null;
  }
  const [picked] = await desktopOpenDialog({
    directory: true,
    multiple: false,
    title: "Choose a project folder",
  });
  return picked ?? null;
}

export async function addProject(path: string, name?: string): Promise<string> {
  return isInDesktop
    ? await call<string>("projects.add", { name: name ?? null, path })
    : path;
}

export async function openProject(path: string): Promise<void> {
  if (isInDesktop) {
    await call("projects.open", { path });
  }
}

export async function renameProject(path: string, name: string): Promise<void> {
  if (isInDesktop) {
    await call("projects.rename", { name, path });
  }
}

export async function setProjectAgentDefaults(
  path: string,
  provider: string | null,
  model: string | null,
  reasoningEffort: string | null
): Promise<void> {
  if (isInDesktop) {
    await call("projects.set_agent_defaults", {
      model,
      path,
      provider,
      reasoning_effort: reasoningEffort,
    });
  }
}

export async function pickProjectIcon(): Promise<string | null> {
  if (!isInDesktop) {
    return null;
  }
  const [picked] = await desktopOpenDialog({
    directory: false,
    filters: [{ extensions: ["png", "jpg", "jpeg", "webp"], name: "Images" }],
    multiple: false,
    title: "Choose a project icon",
  });
  return picked ?? null;
}

export async function setProjectIcon(
  path: string,
  source: string | null
): Promise<number> {
  return isInDesktop
    ? await call<number>("projects.set_icon", { path, source })
    : Date.now();
}

export async function getProjectIcon(
  path: string
): Promise<ProjectIconData | null> {
  if (!isInDesktop) {
    return null;
  }
  const icon = await call<{
    mime_type: ProjectIconData["mime_type"];
    bytes: ArrayBuffer | number[];
  } | null>("projects.icon", { path });
  if (!icon) {
    return null;
  }
  return {
    bytes:
      icon.bytes instanceof ArrayBuffer
        ? new Uint8Array(icon.bytes)
        : new Uint8Array(icon.bytes),
    mime_type: icon.mime_type,
  };
}

export async function setProjectWorktreeMode(
  path: string,
  mode: ProjectWorktreeMode | null
): Promise<void> {
  if (isInDesktop) {
    await call("projects.set_worktree_mode", { mode, path });
  }
}

export async function removeProject(path: string): Promise<void> {
  if (isInDesktop) {
    await call("projects.remove", { path });
  }
}

export async function defaultCwd(): Promise<string> {
  return isInDesktop ? await call<string>("workspace.default_cwd") : ".";
}

export async function setModel(session: string, model: string): Promise<void> {
  if (isInDesktop) {
    await call("engine.set_model", { model, session });
  }
}

export async function setConfigOption(
  session: string,
  configId: string,
  value: string
): Promise<void> {
  if (isInDesktop) {
    await call("engine.set_config_option", {
      config_id: configId,
      session,
      value,
    });
  }
}

export async function cancelTurn(session: string): Promise<void> {
  if (isInDesktop) {
    await call("engine.cancel", { session });
  }
}

export async function ptySpawn(
  id: string,
  cwd: string | null,
  rows: number,
  cols: number,
  options?: { tmuxSession?: string | null; scrollback?: number }
): Promise<PtyAttach> {
  if (!isInDesktop) {
    return { created: true, restore: "" };
  }
  return await call<PtyAttach>("terminal.spawn", {
    cols,
    cwd,
    id,
    rows,
    scrollback: options?.scrollback ?? null,
    tmux_session: options?.tmuxSession ?? null,
  });
}

export async function tmuxAvailable(): Promise<boolean> {
  return isInDesktop ? await call<boolean>("terminal.tmux_available") : false;
}

export async function ptyWrite(id: string, data: string): Promise<void> {
  if (isInDesktop) {
    await call("terminal.write", { data, id });
  }
}

export async function ptyResize(
  id: string,
  rows: number,
  cols: number
): Promise<void> {
  if (isInDesktop) {
    await call("terminal.resize", { cols, id, rows });
  }
}

export async function ptyDump(id: string, isAll = true): Promise<string> {
  return isInDesktop
    ? await call<string>("terminal.dump", { all: isAll, id })
    : "";
}

export async function ptyKill(id: string): Promise<void> {
  if (isInDesktop) {
    await call("terminal.kill", { id });
  }
}

export async function getTranscriptPage(
  session: string,
  before: number | null = null,
  limit = 20
): Promise<TranscriptPage> {
  return isInDesktop
    ? await call<TranscriptPage>("sessions.transcript", {
        before,
        limit,
        session,
      })
    : { entries: [], next_before: null, snapshot_through: null };
}

// ---- git (F1) --------------------------------------------------------------------------------

export interface GitFile {
  path: string;
  original_path: string | null;
  staged: boolean;
  unstaged: boolean;
  state: string;
  staged_state: string | null;
  unstaged_state: string | null;
}
export interface GitStatus {
  is_repo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  files: GitFile[];
}

export type SourceControlProviderKind =
  | "github"
  | "gitlab"
  | "azure-devops"
  | "bitbucket"
  | "unknown";

export interface SourceControlInfo {
  remote_name: string;
  provider: SourceControlProviderKind;
  provider_name: string;
  host: string;
  web_url: string | null;
  change_request_label: "PR" | "MR" | "change request";
  create_change_request_supported: boolean;
  required_cli: string | null;
  required_cli_available: boolean;
}

export async function gitSourceControlInfo(
  cwd: string
): Promise<SourceControlInfo | null> {
  return isInDesktop
    ? await call<SourceControlInfo | null>("workspace.source_control", { cwd })
    : null;
}

export interface GitHubPullRequestCheck {
  name: string;
  status: string | null;
  conclusion: string | null;
  details_url: string | null;
  workflow_name: string | null;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
  is_draft: boolean;
  head_ref: string;
  base_ref: string;
  additions: number;
  deletions: number;
  changed_files: number;
  body: string;
  review_decision: string | null;
  mergeable: string;
  merge_state_status: string;
  author: string;
  comments_count: number;
  reviews_count: number;
  checks: GitHubPullRequestCheck[];
  created_at: string;
  updated_at: string;
}

export interface GitHubPullRequestDiff {
  text: string;
  truncated: boolean;
}

export type GitHubReviewAction = "approve" | "comment" | "request_changes";
export type GitHubMergeStrategy = "merge" | "squash" | "rebase";

export async function githubCurrentPullRequest(
  cwd: string
): Promise<GitHubPullRequest | null> {
  return isInDesktop
    ? await call<GitHubPullRequest | null>("github.current_pr", { cwd })
    : null;
}

export async function githubPullRequestDiff(
  cwd: string,
  number: number
): Promise<GitHubPullRequestDiff> {
  return isInDesktop
    ? await call<GitHubPullRequestDiff>("github.pr_diff", { cwd, number })
    : { text: "", truncated: false };
}

export async function githubReviewPullRequest(
  cwd: string,
  number: number,
  action: GitHubReviewAction,
  body: string
): Promise<void> {
  if (isInDesktop) {
    await call("github.review_pr", { action, body, cwd, number });
  }
}

export async function githubMergePullRequest(
  cwd: string,
  number: number,
  strategy: GitHubMergeStrategy
): Promise<void> {
  if (isInDesktop) {
    await call("github.merge_pr", { cwd, number, strategy });
  }
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  return isInDesktop
    ? await call<GitStatus>("git.status", { cwd })
    : { ahead: 0, behind: 0, branch: "", files: [], is_repo: false };
}

export interface Checkpoint {
  id: string;
  refname: string;
  commit: string;
  message: string;
}

export async function gitCheckpoint(
  cwd: string,
  message: string
): Promise<Checkpoint | null> {
  return isInDesktop
    ? await call<Checkpoint>("git.checkpoint", { cwd, message })
    : null;
}
export async function gitCheckpoints(cwd: string): Promise<Checkpoint[]> {
  return isInDesktop
    ? await call<Checkpoint[]>("git.checkpoints", { cwd })
    : [];
}

export type GitDiffScope = "all" | "staged" | "unstaged";

export interface GitDiffResult {
  text: string;
  truncated: boolean;
  truncation_reason: string | null;
  returned_bytes: number;
  files: number;
}

export interface GitDiffStat {
  added: number;
  deleted: number;
  files: number;
  truncated: boolean;
  truncation_reason: string | null;
}

const emptyDiff: GitDiffResult = {
  files: 0,
  returned_bytes: 0,
  text: "",
  truncated: false,
  truncation_reason: null,
};

export async function gitDiff(
  cwd: string,
  path: string | null,
  scope: GitDiffScope = "all"
): Promise<GitDiffResult> {
  return isInDesktop
    ? await call<GitDiffResult>("git.diff", { cwd, path, scope })
    : emptyDiff;
}
export async function gitDiffSince(
  cwd: string,
  commit: string
): Promise<GitDiffResult> {
  return isInDesktop
    ? await call<GitDiffResult>("git.diff_since", { commit, cwd })
    : emptyDiff;
}
export async function gitDiffStat(cwd: string): Promise<GitDiffStat> {
  return isInDesktop
    ? await call<GitDiffStat>("git.diff_stat", { cwd })
    : {
        added: 0,
        deleted: 0,
        files: 0,
        truncated: false,
        truncation_reason: null,
      };
}
export async function gitStagePaths(
  cwd: string,
  paths: string[]
): Promise<void> {
  if (isInDesktop) {
    await call("git.stage", { cwd, paths });
  }
}
export async function gitUnstagePaths(
  cwd: string,
  paths: string[]
): Promise<void> {
  if (isInDesktop) {
    await call("git.unstage", { cwd, paths });
  }
}
export async function gitRevert(cwd: string, commit: string): Promise<void> {
  if (isInDesktop) {
    await call("git.revert", { commit, cwd });
  }
}
export async function gitCommit(cwd: string, message: string): Promise<string> {
  return isInDesktop ? await call<string>("git.commit", { cwd, message }) : "";
}
export async function gitPush(cwd: string): Promise<string> {
  return isInDesktop ? await call<string>("git.push", { cwd }) : "";
}

// ---- keybindings (F2) ------------------------------------------------------------------------

export type KeymapEntry = [action: string, key: string, label: string];

// Mirrors `Action::default_key()` in crates/core/src/keymap.rs — keep the two in step. This is only
// the browser-preview fallback; inside desktop the real keymap (with user overrides) comes from core.
export const defaultKeymap: KeymapEntry[] = [
  ["run", "Mod+Enter", "Run prompt"],
  ["new_session", "Mod+N", "New task"],
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
  ["open_finder", "Mod+O", "Open in file manager"],
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

export async function getKeymap(): Promise<KeymapEntry[]> {
  return isInDesktop ? await call<KeymapEntry[]>("keymap.get") : defaultKeymap;
}

export async function setKeymap(action: string, key: string): Promise<void> {
  if (isInDesktop) {
    await call("keymap.set", { action, key });
  }
}

// ---- browser annotate (F3/F4) ----------------------------------------------------------------

/**
One property the in-page annotator adjusted, and what it went from and to.
*/
export interface StyleChange {
  property: string;
  from: string;
  to: string;
}

export interface Annotation {
  url: string;
  note: string;
  selector: string | null;
  selected_text: string | null;
  styles: StyleChange[];
}

// ---- Plugin Hub + component market (F5) -------------------------------------------------------

export interface MarketItem {
  id: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
  icon: string | null;
  kind: string;
  installed: boolean;
}

const fallbackMarket: MarketItem[] = [
  {
    author: "codetwo",
    description: "Design before coding.",
    icon: "🏛️",
    id: "architect",
    installed: false,
    kind: "fragment",
    name: "System Architect",
    tags: ["design"],
  },
  {
    author: "codetwo",
    description: "Thorough deterministic tests.",
    icon: "🧪",
    id: "test-suite",
    installed: false,
    kind: "fragment",
    name: "Test Suite Author",
    tags: ["testing"],
  },
  {
    author: "codetwo",
    description: "Give the agent a browser.",
    icon: "🌐",
    id: "browser-tool",
    installed: false,
    kind: "mcp",
    name: "Browser Tool (MCP)",
    tags: ["mcp", "browser"],
  },
];

export async function marketCatalog(): Promise<MarketItem[]> {
  return isInDesktop
    ? await call<MarketItem[]>("market.catalog")
    : fallbackMarket;
}

export async function marketInstall(id: string): Promise<void> {
  if (isInDesktop) {
    await call("market.install", { id });
  }
}

export interface PluginCounts {
  skills: number;
  subagents: number;
  mcp_servers: number;
  scaffolds: number;
  commands: number;
  hooks: number;
  lsp_servers: number;
  monitors: number;
  apps: number;
  /**
  Safe declarative actions rendered into C2-owned UI slots.
  */
  ui: number;
  /**
  Host-rendered external-system connectors backed by an owned runtime command.
  */
  connectors: number;
  /**
  Agent Scenes components (R14); serde-defaulted server-side, so always present here.
  */
  scenes: number;
  pipelines: number;
  /**
  Present for hosts that support a C2 JSON-RPC process runtime contribution.
  */
  runtime: number;
  /**
  Statically declared commands implemented by the process runtime.
  */
  runtime_commands: number;
}

export type PluginInstallScope = "user" | "project" | "local" | "managed";

export interface PluginDiagnostic {
  level: "warning" | "error";
  code: string;
  message: string;
  component?: string;
}

export interface PluginExtensionComponent {
  kind: string;
  name: string;
  path: string;
  status: "ready" | "requires_trust" | "requires_auth" | "unsupported";
}

export interface PluginScaffoldInfo {
  id: string;
  name: string;
  description: string;
  files: number;
}

export { pluginUiSlotIds, pluginUiComponentId } from "./pluginModel";
export type {
  PluginRuntimeCommandContribution,
  PluginConnectorCapability,
  PluginConnectorContribution,
  PluginUiContribution,
  PluginUiSlotId,
} from "./pluginModel";

export interface PluginLanguageServer {
  id: string;
  languages: string[];
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  source: string;
  repository: string;
  standard_version: string;
  enabled: boolean;
  trusted: boolean;
  scope: PluginInstallScope;
  counts: PluginCounts;
  scaffolds: PluginScaffoldInfo[];
  extension_components: PluginExtensionComponent[];
  runtime_commands: PluginRuntimeCommandContribution[];
  ui_contributions: PluginUiContribution[];
  connector_contributions: PluginConnectorContribution[];
  lsp_servers: PluginLanguageServer[];
  diagnostics: PluginDiagnostic[];
}

export interface GitHubImportResult {
  plugin: PluginInfo;
}

export type MarketplacePluginSource =
  | { kind: "local"; path: string }
  | {
      kind: "github";
      repository: string;
      reference: string | null;
      sha: string | null;
    }
  | {
      kind: "git";
      url: string;
      path: string | null;
      reference: string | null;
      sha: string | null;
    }
  | {
      kind: "npm";
      package: string;
      version: string | null;
      registry: string | null;
    }
  | { kind: "archive"; url: string; sha256: string | null };

export interface MarketplacePlugin {
  name: string;
  display_name: string;
  description: string;
  version: string;
  category: string;
  installation_policy: string;
  authentication_policy: string;
  default_enabled: boolean;
  source: MarketplacePluginSource;
  installable: boolean;
  diagnostic: string | null;
}

export interface MarketplaceDiagnostic {
  code: string;
  message: string;
  entry: number | null;
}

export interface PluginMarketplace {
  name: string;
  display_name: string;
  description: string;
  manifest_path: string;
  root: string;
  plugins: MarketplacePlugin[];
  diagnostics: MarketplaceDiagnostic[];
}

const browserPluginMarketplace: PluginMarketplace = {
  description:
    "A browser-only preview of C2 marketplace source support and diagnostics.",
  diagnostics: [],
  display_name: "C2 Marketplace Preview",
  manifest_path: "/demo/marketplace.json",
  name: "code2-demo-marketplace",
  plugins: [
    {
      authentication_policy: "none",
      category: "development",
      default_enabled: true,
      description:
        "A local plugin bundle that can be installed by the desktop runtime.",
      diagnostic: null,
      display_name: "Local Review Suite",
      installable: true,
      installation_policy: "allowed",
      name: "local-review-suite",
      source: { kind: "local", path: "./plugins/local-review-suite" },
      version: "2.1.0",
    },
    {
      authentication_policy: "none",
      category: "monitoring",
      default_enabled: false,
      description:
        "Catalog preview for an npm source that is not installable in this release.",
      diagnostic:
        "npm marketplace sources are recognized but not installable in this release",
      display_name: "NPM Observability Demo",
      installable: false,
      installation_policy: "allowed",
      name: "npm-observability-demo",
      source: {
        kind: "npm",
        package: "@example/observability-plugin",
        registry: null,
        version: "0.8.0",
      },
      version: "0.8.0",
    },
  ],
  root: "/demo",
};

export interface ScaffoldInstallResult {
  plugin: string;
  scaffold: string;
  destination: string;
  files: number;
}

export async function listPlugins(): Promise<PluginInfo[]> {
  return isInDesktop
    ? await call<PluginInfo[]>("plugins.list", undefined, null)
    : [
        {
          author: "C2",
          connector_contributions: [],
          counts: {
            apps: 0,
            commands: 0,
            connectors: 0,
            hooks: 0,
            lsp_servers: 0,
            mcp_servers: 0,
            monitors: 0,
            pipelines: 0,
            runtime: 1,
            runtime_commands: 10,
            scaffolds: 0,
            scenes: 0,
            skills: 0,
            subagents: 0,
            ui: 0,
          },
          description: "Inspect Docker and manage containers and images.",
          diagnostics: [],
          enabled: true,
          extension_components: [
            {
              kind: "runtime",
              name: "docker-tools",
              path: "plugin.js",
              status: "ready",
            },
          ],
          id: "docker-tools-preview",
          lsp_servers: [],
          name: "docker-tools",
          repository: "https://github.com/IchenDEV/codeTwo",
          runtime_commands: [
            ["docker.status", "Docker status"],
            ["docker.containers", "List containers"],
            ["docker.images", "List images"],
            ["docker.inspect", "Inspect container"],
            ["docker.logs", "Read container logs"],
            ["docker.start", "Start container"],
            ["docker.stop", "Stop container"],
            ["docker.restart", "Restart container"],
            ["docker.pull", "Pull image"],
            ["docker.remove_image", "Remove image"],
          ].map(([id, title]) => {
            return {
              argsSchema: null,
              description: "",
              id,
              title,
            };
          }),
          scaffolds: [],
          scope: "user",
          source: "Built-in renderer preview",
          standard_version: "1.2.0",
          trusted: true,
          ui_contributions: [],
          version: "0.1.0",
        },
        {
          author: "C2 Community",
          connector_contributions: [],
          counts: {
            apps: 0,
            commands: 1,
            connectors: 0,
            hooks: 1,
            lsp_servers: 1,
            mcp_servers: 1,
            monitors: 0,
            pipelines: 1,
            runtime: 0,
            runtime_commands: 0,
            scaffolds: 1,
            scenes: 1,
            skills: 1,
            subagents: 1,
            ui: 0,
          },
          description:
            "A complete development workflow with review, research, tools, and starter projects.",
          diagnostics: [],
          enabled: true,
          extension_components: [
            {
              kind: "lsp",
              name: "rust",
              path: "plugin.json#extensions.dev.codetwo.languageServers",
              status: "requires_trust",
            },
            {
              kind: "hook",
              name: "session",
              path: "hooks/hooks.json",
              status: "unsupported",
            },
          ],
          id: "developer-toolkit-demo",
          lsp_servers: [],
          name: "Developer Toolkit",
          repository: "https://github.com/example/developer-toolkit",
          runtime_commands: [],
          scaffolds: [
            {
              description:
                "TypeScript, tests, and a production-ready project structure",
              files: 12,
              id: "vite-react-demo",
              name: "Vite React app",
            },
          ],
          scope: "user",
          source: "GitHub · example/developer-toolkit",
          standard_version: "1.2.0",
          trusted: false,
          ui_contributions: [],
          version: "1.4.0",
        },
        {
          author: "C2",
          connector_contributions: [],
          counts: {
            apps: 0,
            commands: 1,
            connectors: 0,
            hooks: 0,
            lsp_servers: 1,
            mcp_servers: 0,
            monitors: 0,
            pipelines: 0,
            runtime: 1,
            runtime_commands: 1,
            scaffolds: 0,
            scenes: 0,
            skills: 0,
            subagents: 0,
            ui: 5,
          },
          description:
            "Renderer-only preview of declarative plugin slots and language-server contributions.",
          diagnostics: [],
          enabled: true,
          extension_components: [
            {
              kind: "ui",
              name: "Review tools",
              path: "rail.features",
              status: "ready",
            },
            {
              kind: "ui",
              name: "Review workspace",
              path: "session.header",
              status: "ready",
            },
            {
              kind: "ui",
              name: "Summarize thread",
              path: "transcript.before",
              status: "ready",
            },
            {
              kind: "ui",
              name: "Project health",
              path: "composer.above",
              status: "ready",
            },
            {
              kind: "ui",
              name: "Insert context",
              path: "composer.toolbar",
              status: "ready",
            },
            { kind: "lsp", name: "zig", path: "zig", status: "ready" },
          ],
          id: "ui-lsp-demo",
          lsp_servers: [
            {
              args: [],
              command: "zls",
              env: {},
              id: "zig",
              languages: ["zig"],
            },
          ],
          name: "UI & LSP Demo",
          repository: "",
          runtime_commands: [
            {
              argsSchema: null,
              description: "Run the demo review action.",
              id: "demo.review",
              title: "Review",
            },
          ],
          scaffolds: [],
          scope: "user",
          source: "Built-in preview",
          standard_version: "1.2.0",
          trusted: true,
          ui_contributions: [
            {
              command: "demo.review",
              description: "Open the plugin's review workflow.",
              id: "review-tools",
              input: { mode: "tools" },
              label: "Review tools",
              order: 0,
              slot: "rail.features",
            },
            {
              command: "demo.review",
              description: "Run the plugin's project review command.",
              id: "review-workspace",
              input: null,
              label: "Review workspace",
              order: 0,
              slot: "session.header",
            },
            {
              command: "demo.review",
              description: "Summarize the current conversation.",
              id: "summarize-thread",
              input: { mode: "summary" },
              label: "Summarize thread",
              order: 0,
              slot: "transcript.before",
            },
            {
              command: "demo.review",
              description:
                "Ask the plugin to inspect this project before starting the next turn.",
              id: "project-health",
              input: { mode: "health" },
              label: "Project health",
              order: 0,
              slot: "composer.above",
            },
            {
              command: "demo.review",
              description: "Insert plugin-provided context into this draft.",
              id: "insert-context",
              input: { mode: "context" },
              label: "Insert context",
              order: 0,
              slot: "composer.toolbar",
            },
          ],
          version: "1.0.0",
        },
      ];
}

export async function onPluginsChanged(
  callback: () => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<null>("plugins-changed", callback);
}

export interface PluginConnectorEventEnvelope {
  plugin_id: string;
  event: unknown;
}

export async function onPluginConnectorEvent(
  callback: (event: PluginConnectorEventEnvelope) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<PluginConnectorEventEnvelope>(
    "plugin-connector-event",
    callback
  );
}

export async function invokePluginUi(
  pluginId: string,
  contributionId: string,
  context: Record<string, unknown>,
  projectPath: string | null
): Promise<unknown> {
  if (!isInDesktop) {
    throw new Error("Plugin UI actions require the C2 desktop app.");
  }
  return await call(
    "plugins.invoke_ui",
    {
      context,
      contribution_id: contributionId,
      plugin_id: pluginId,
    },
    projectPath
  );
}

export async function invokePluginConnector(
  pluginId: string,
  contributionId: string,
  operation: string,
  input: unknown,
  projectPath: string | null
): Promise<unknown> {
  if (!isInDesktop) {
    throw new Error("Plugin connectors require the C2 desktop app.");
  }
  return await call(
    "plugins.invoke_connector",
    {
      contribution_id: contributionId,
      input,
      operation,
      plugin_id: pluginId,
    },
    projectPath
  );
}

export async function githubImportPlugin(
  repo: string
): Promise<GitHubImportResult> {
  if (!isInDesktop) {
    throw new Error("Plugin installation requires the C2 desktop app.");
  }
  return await call<GitHubImportResult>(
    "plugins.import_github",
    { repository: repo },
    null
  );
}

export async function pickPluginMarketplace(): Promise<PluginMarketplace | null> {
  if (!isInDesktop) {
    return browserPluginMarketplace;
  }
  const [selected] = await desktopOpenDialog({
    directory: false,
    filters: [{ extensions: ["json"], name: "Plugin marketplace" }],
    multiple: false,
  });
  if (!selected) {
    return null;
  }
  return await call<PluginMarketplace>(
    "plugins.read_marketplace",
    {
      path: selected,
    },
    null
  );
}

export async function installMarketplacePlugin(
  marketplacePath: string,
  pluginName: string
): Promise<GitHubImportResult> {
  if (!isInDesktop) {
    throw new Error("Marketplace installation requires the C2 desktop app.");
  }
  return await call<GitHubImportResult>(
    "plugins.install_marketplace",
    {
      marketplace_path: marketplacePath,
      plugin_name: pluginName,
    },
    null
  );
}

export async function uninstallPlugin(
  id: string,
  isKeepData = false
): Promise<void> {
  if (isInDesktop) {
    await call("plugins.uninstall", { id, keep_data: isKeepData }, null);
  }
}

export async function setPluginEnabled(
  id: string,
  isEnabled: boolean
): Promise<PluginInfo> {
  if (!isInDesktop) {
    throw new Error("Plugin state changes require the C2 desktop app.");
  }
  return await call<PluginInfo>(
    "plugins.set_enabled",
    { id, value: isEnabled },
    null
  );
}

export async function setPluginTrusted(
  id: string,
  isTrusted: boolean
): Promise<PluginInfo> {
  if (!isInDesktop) {
    throw new Error("Plugin trust changes require the C2 desktop app.");
  }
  return await call<PluginInfo>(
    "plugins.set_trusted",
    { id, value: isTrusted },
    null
  );
}

export async function applyPluginScaffold(
  pluginId: string,
  scaffoldId: string,
  cwd: string
): Promise<ScaffoldInstallResult> {
  if (!isInDesktop) {
    throw new Error("Scaffold installation requires the C2 desktop app.");
  }
  return await call<ScaffoldInstallResult>(
    "plugins.apply_scaffold",
    {
      cwd,
      plugin_id: pluginId,
      scaffold_id: scaffoldId,
    },
    null
  );
}

// ---- remote control (F10) --------------------------------------------------------------------

export interface RemoteEndpoint {
  id: string;
  label: string;
  url: string;
  /**
  Loopback remains copyable for this Mac, but must never be encoded for another device.
  */
  qr_shareable: boolean;
}

export interface RemoteStatus {
  port: number;
  endpoints: RemoteEndpoint[];
  /**
  Older Rust hosts omit this field and support the original T3/legacy protocols.
  */
  protocols?: RemoteClientProtocol[];
}

export interface RemotePairingLink {
  endpoint_id: string;
  url: string;
  token: string;
  expires_in: number;
  qr_svg: string;
}

export interface RemoteDevice {
  id: string;
  name: string;
  created_at: number;
  last_seen: number;
  direction?: "incoming" | "outgoing";
  protocol?: RemoteClientProtocol;
}

export async function startRemote(port?: number): Promise<RemoteStatus | null> {
  return isInDesktop
    ? await call<RemoteStatus>("remote.start", { port: port ?? null })
    : null;
}

export async function stopRemote(): Promise<void> {
  if (isInDesktop) {
    await call("remote.stop");
  }
}

export async function remoteStatus(): Promise<RemoteStatus | null> {
  return isInDesktop ? await call<RemoteStatus | null>("remote.status") : null;
}

/**
The wire protocol expected by the client consuming a pairing link.
*/
export type RemoteClientProtocol = "c2" | "t3" | "legacy";

export async function remotePairingLink(
  endpointId?: string,
  clientProtocol: RemoteClientProtocol = "c2",
  ttlSecs?: number
): Promise<RemotePairingLink | null> {
  return isInDesktop
    ? await call<RemotePairingLink>("remote.pairing_link", {
        client_protocol: clientProtocol,
        endpoint_id: endpointId ?? null,
        ttl_secs: ttlSecs ?? null,
      })
    : null;
}

export async function remoteDevices(): Promise<RemoteDevice[]> {
  return isInDesktop ? await call<RemoteDevice[]>("remote.devices") : [];
}

export async function pairRemoteDevice(
  url: string,
  deviceName?: string
): Promise<{ device: RemoteDevice; sync: DeviceSyncStatus }> {
  if (!isInDesktop) {
    throw new Error("Device pairing requires the C2 desktop app.");
  }
  return await call<{ device: RemoteDevice; sync: DeviceSyncStatus }>(
    "remote.pair_device",
    {
      device_name: deviceName ?? null,
      url,
    }
  );
}

export async function remoteRevokeDevice(id: string): Promise<boolean> {
  return isInDesktop
    ? await call<boolean>("remote.revoke_device", { id })
    : false;
}

export interface TaskHandoffResult {
  session: string;
  handoff: string;
  epoch: number;
  destination: string;
  state: "transferred";
}

export async function transferTaskToDevice(
  session: string,
  pairingUrl: string,
  destination: string
): Promise<TaskHandoffResult> {
  if (!isInDesktop) {
    throw new Error("Task transfer is only available in the desktop app");
  }
  return await call<TaskHandoffResult>("handoff.transfer_pairing", {
    destination,
    pairing_url: pairingUrl,
    session,
  });
}

// ---- issues (F14) ----------------------------------------------------------------------------

export interface Issue {
  id: string;
  title: string;
  state: string;
  url: string;
  body: string;
  source: string;
}

export async function ghAvailable(): Promise<boolean> {
  return isInDesktop ? await call<boolean>("issues.github_available") : false;
}
export async function listGithubIssues(
  cwd: string,
  limit = 30
): Promise<Issue[]> {
  return isInDesktop
    ? await call<Issue[]>("issues.list_github", { cwd, limit })
    : [];
}
export async function listLinearIssues(
  token: string,
  limit = 30
): Promise<Issue[]> {
  return isInDesktop
    ? await call<Issue[]>("issues.list_linear", { limit, token })
    : [];
}
export async function issueContext(issue: Issue): Promise<string> {
  if (isInDesktop) {
    return await call<string>("issues.context", { issue });
  }
  return `**${issue.source} #${issue.id}** — ${issue.title} (${issue.state})\n${issue.url}`;
}

// ---- compiled-prompt preview (F13) -----------------------------------------------------------

export type CanvasPixelPolicy = "required" | "structure_only";
export type CanvasTheme = "light" | "dark";
export type CanvasObjectKind =
  | "pen"
  | "text"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "image";

export interface CanvasFeatureState {
  feature: string;
  enabled: boolean;
  status: "not production-enabled";
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasObject {
  id: string;
  kind: CanvasObjectKind;
  originalText?: string;
  bounds: CanvasRect;
  layer: number;
  arrowStart?: CanvasPoint | null;
  arrowEnd?: CanvasPoint | null;
  assetId?: string | null;
}

export interface CanvasAssetReference {
  id: string;
  mimeType: "image/png" | "image/webp";
  width: number;
  height: number;
  sourceName?: string | null;
}

export interface CanvasStaticAsset extends CanvasAssetReference {
  bytes: number[];
}

export interface CanvasSceneEnvelope {
  engine: string;
  engineVersion: string;
  schemaVersion: number;
  revision: number;
  theme: CanvasTheme;
  assets: CanvasAssetReference[];
  /**
  Exact opaque Excalidraw scene retained by the core; no active refs are accepted on write.
  */
  scene: Record<string, unknown>;
}

export interface CanvasManifest {
  objects: CanvasObject[];
}

export type CanvasExportKind = "overview" | "detail";
export interface CanvasExport {
  id: string;
  kind: CanvasExportKind;
  index?: number | null;
  mimeType: "image/png";
  width: number;
  height: number;
  bytes: number[];
}

export interface CanvasDraftUpdate {
  title: string;
  theme: CanvasTheme;
  envelope: CanvasSceneEnvelope;
  manifest: CanvasManifest;
  assets?: CanvasStaticAsset[];
}

export interface CanvasFreezeInput extends CanvasDraftUpdate {
  exports?: CanvasExport[];
}

export interface CanvasDraft {
  id: string;
  owner: string;
  revision: number;
  title: string;
  theme: CanvasTheme;
  envelope: CanvasSceneEnvelope;
  manifest: CanvasManifest;
  assets: CanvasStaticAsset[];
  createdAt: number;
  updatedAt: number;
  tombstonedAt?: number | null;
}

/**
Immutable history wire shape. Mutable owner/head timestamps are intentionally absent.
*/
export interface CanvasSnapshot {
  id: string;
  revision: number;
  title: string;
  theme: CanvasTheme;
  envelope: CanvasSceneEnvelope;
  manifest: CanvasManifest;
  assets: CanvasStaticAsset[];
  createdAt: number;
  frozenAt: number;
  objectCount: number;
  summary: string;
  exports: CanvasExport[];
}

export async function canvasFeatureState(): Promise<CanvasFeatureState> {
  return isInDesktop
    ? await call<CanvasFeatureState>("canvas.feature_state")
    : await Promise.resolve({
        enabled: false,
        feature: "CODETWO_CANVAS_INPUT_V1",
        status: "not production-enabled",
      });
}

function canvasAssetToCore(asset: CanvasStaticAsset): Record<string, unknown> {
  return {
    bytes: asset.bytes,
    height: asset.height,
    id: asset.id,
    mime_type: asset.mimeType,
    width: asset.width,
  };
}

function canvasEnvelopeToCore(
  envelope: CanvasSceneEnvelope
): Record<string, unknown> {
  return {
    assets: envelope.assets.map((asset) => {
      return {
        height: asset.height,
        id: asset.id,
        mime_type: asset.mimeType,
        source_name: asset.sourceName ?? null,
        width: asset.width,
      };
    }),
    engine: envelope.engine,
    engine_version: envelope.engineVersion,
    revision: envelope.revision,
    scene: envelope.scene,
    schema_version: envelope.schemaVersion,
    theme: envelope.theme,
  };
}

function canvasManifestToCore(
  manifest: CanvasManifest
): Record<string, unknown> {
  return {
    objects: manifest.objects.map((object) => {
      return {
        arrow_end: object.arrowEnd ?? null,
        arrow_start: object.arrowStart ?? null,
        asset_id: object.assetId ?? null,
        bounds: object.bounds,
        id: object.id,
        kind: object.kind,
        layer: object.layer,
        original_text: object.originalText ?? "",
      };
    }),
  };
}

function canvasExportToCore(exportItem: CanvasExport): Record<string, unknown> {
  return {
    bytes: exportItem.bytes,
    height: exportItem.height,
    id: exportItem.id,
    index: exportItem.index ?? null,
    kind: exportItem.kind,
    mime_type: exportItem.mimeType,
    width: exportItem.width,
  };
}

function canvasUpdateToCore(
  update: CanvasDraftUpdate
): Record<string, unknown> {
  return {
    assets: (update.assets ?? []).map(canvasAssetToCore),
    envelope: canvasEnvelopeToCore(update.envelope),
    manifest: canvasManifestToCore(update.manifest),
    theme: update.theme,
    title: update.title,
  };
}

function canvasFreezeToCore(input: CanvasFreezeInput): Record<string, unknown> {
  return {
    ...canvasUpdateToCore(input),
    exports: (input.exports ?? []).map(canvasExportToCore),
  };
}

export async function canvasCreateDraft(title: string): Promise<CanvasDraft> {
  return await call<CanvasDraft>("canvas.create_draft", { title });
}

export async function canvasGetDraft(id: string): Promise<CanvasDraft | null> {
  return await call<CanvasDraft | null>("canvas.get_draft", { id });
}

export async function canvasUpdateDraft(
  id: string,
  expectedRevision: number,
  update: CanvasDraftUpdate
): Promise<CanvasDraft> {
  return await call<CanvasDraft>("canvas.update_draft", {
    expected_revision: expectedRevision,
    id,
    update: canvasUpdateToCore(update),
  });
}

export async function canvasNormalizeMedia(
  bytes: Uint8Array | number[],
  declaredMime?: string | null
): Promise<CanvasStaticAsset> {
  return await call<CanvasStaticAsset>("canvas.normalize_media", {
    bytes: [...bytes],
    declared_mime: declaredMime ?? null,
  });
}

export async function importPromptImage(
  bytes: Uint8Array | number[],
  declaredMime: string | null,
  name: string
): Promise<AppshotCapture> {
  return await call<AppshotCapture>("attachments.import", {
    bytes: [...bytes],
    declared_mime: declaredMime,
    name,
  });
}

export async function getPromptImage(id: string): Promise<AppshotCapture> {
  if (!isInDesktop) {
    throw new Error("Prompt images require the desktop app");
  }
  return await call<AppshotCapture>("attachments.get", { id });
}

export async function canvasFreeze(
  id: string,
  expectedRevision: number,
  input: CanvasFreezeInput
): Promise<CanvasSnapshot> {
  return await call<CanvasSnapshot>("canvas.freeze", {
    expected_revision: expectedRevision,
    id,
    input: canvasFreezeToCore(input),
  });
}

export async function canvasGetSnapshot(
  id: string,
  revision: number
): Promise<CanvasSnapshot | null> {
  return await call<CanvasSnapshot | null>("canvas.get_snapshot", {
    id,
    revision,
  });
}

export async function canvasGetAsset(
  id: string,
  revision: number,
  assetId: string
): Promise<CanvasStaticAsset | null> {
  return await call<CanvasStaticAsset | null>("canvas.get_asset", {
    asset_id: assetId,
    id,
    revision,
  });
}

export async function canvasGetExport(
  id: string,
  revision: number,
  exportId: string
): Promise<CanvasExport | null> {
  return await call<CanvasExport | null>("canvas.get_export", {
    export_id: exportId,
    id,
    revision,
  });
}

export async function canvasDuplicate(
  id: string,
  revision: number
): Promise<CanvasDraft> {
  return await call<CanvasDraft>("canvas.duplicate", { id, revision });
}

export async function canvasTombstone(id: string): Promise<void> {
  await call("canvas.tombstone", { id });
}

export async function canvasRestore(id: string): Promise<void> {
  await call("canvas.restore", { id });
}

export async function canvasPurge(id: string): Promise<boolean> {
  return await call<boolean>("canvas.purge", { id });
}

export interface CompiledPreview {
  prompt: string;
  mcp_servers: string[];
  agent_skills: string[];
  subagents: string[];
  files: string[];
  images: string[];
  sessions: string[];
  unresolved: string[];
  canvases: CompiledCanvasPreview[];
}

export interface CompiledCanvasPreview {
  id: string;
  frozenRevision: number;
  title: string;
  summary: string;
  /**
  Ordered overview first, then detail tiles as returned by core validation.
  */
  exports: CanvasExport[];
}

export async function compileDocument(
  documentValue: DocumentBlock[],
  cwd?: string | null
): Promise<CompiledPreview> {
  if (isInDesktop) {
    return await call<CompiledPreview>("document.compile", {
      cwd: cwd ?? null,
      doc: documentValue,
    });
  }
  return {
    agent_skills: [],
    canvases: [],
    files: documentValue.flatMap((b) => (b.type === "file" ? [b.path] : [])),
    images: documentValue.flatMap((b) => (b.type === "image" ? [b.path] : [])),
    mcp_servers: [],
    prompt: documentValue.map(describeBlock).join("\n\n"),
    sessions: documentValue.flatMap((b) =>
      b.type === "session" ? [b.session_id] : []
    ),
    subagents: [],
    unresolved: [],
  };
}

// ---- sandbox + project scripts (G7/G8) ---------------------------------------------------------

export async function setSandbox(
  session: string,
  sandbox: Sandbox
): Promise<void> {
  if (isInDesktop) {
    await call("engine.set_sandbox", { sandbox, session });
  }
}

export interface ProjectScript {
  id: string;
  name: string;
  kind: "command" | "prompt";
  command: string;
  prompt: string;
  keybinding: string;
  preview_url: string;
  run_on_worktree_create: boolean;
  open_preview: boolean;
}

export async function listProjectScripts(
  cwd: string
): Promise<ProjectScript[]> {
  return isInDesktop
    ? await call<ProjectScript[]>("workspace.scripts", { cwd })
    : [];
}

export async function saveProjectScript(
  cwd: string,
  script: ProjectScript
): Promise<ProjectScript> {
  return isInDesktop
    ? await call<ProjectScript>("workspace.save_script", { cwd, ...script })
    : script;
}

export async function runProjectScript(
  cwd: string,
  id: string
): Promise<string> {
  return isInDesktop
    ? await call<string>("workspace.run_script", { cwd, id })
    : "";
}

// ---- voice input (G11) -------------------------------------------------------------------------

/// Whether the core has a configured local transcriber or a platform speech recognizer. The UI
/// prefers the webview's own speech recognition when present.
export async function voiceAvailable(): Promise<boolean> {
  return isInDesktop ? await call<boolean>("voice.available") : false;
}

export async function transcribeAudio(
  bytes: Uint8Array,
  extension = "webm"
): Promise<string> {
  if (!isInDesktop) {
    return "";
  }
  return await call<string>("voice.transcribe", {
    bytes: [...bytes],
    ext: extension,
  });
}

// ---- usage tracking (G12) ----------------------------------------------------------------------

export type ProviderQuotaStatus = "available" | "unavailable" | "unsupported";
export type ProviderQuotaReason =
  | "cli_not_found"
  | "query_failed"
  | "unsupported_provider";

export interface ProviderQuotaWindow {
  used_percent: number;
  window_minutes: number | null;
  /**
  Unix seconds, as reported by the provider.
  */
  resets_at: number | null;
}

export interface ProviderQuotaCredits {
  has_credits: boolean;
  unlimited: boolean;
  balance: string | null;
}

export interface ProviderQuotaReport {
  provider: string;
  status: ProviderQuotaStatus;
  reason: ProviderQuotaReason | null;
  source: string | null;
  plan: string | null;
  limit_name: string | null;
  windows: ProviderQuotaWindow[];
  credits: ProviderQuotaCredits | null;
  fetched_at_ms: number;
}

export async function providerQuota(
  provider: string
): Promise<ProviderQuotaReport> {
  if (isInDesktop) {
    return await call<ProviderQuotaReport>("usage.provider_quota", {
      provider,
    });
  }
  return {
    credits: null,
    fetched_at_ms: Date.now(),
    limit_name: null,
    plan: null,
    provider,
    reason: "unsupported_provider",
    source: null,
    status: "unsupported",
    windows: [],
  };
}

export interface UsageWindow {
  label: string;
  window_secs: number;
  input_tokens: number;
  /// Cache reads — reported but excluded from `total_tokens`.
  cached_tokens: number;
  output_tokens: number;
  total_tokens: number;
  limit: number | null;
  fraction: number | null;
  resets_in_secs: number;
}

export interface UsageReport {
  windows: UsageWindow[];
  by_source: [string, number][];
  transcripts: number;
}

const emptyUsage: UsageReport = {
  by_source: [],
  transcripts: 0,
  windows: [
    {
      cached_tokens: 0,
      fraction: null,
      input_tokens: 0,
      label: "5h session",
      limit: null,
      output_tokens: 0,
      resets_in_secs: 0,
      total_tokens: 0,
      window_secs: 18_000,
    },
    {
      cached_tokens: 0,
      fraction: null,
      input_tokens: 0,
      label: "week",
      limit: null,
      output_tokens: 0,
      resets_in_secs: 0,
      total_tokens: 0,
      window_secs: 604_800,
    },
    {
      cached_tokens: 0,
      fraction: null,
      input_tokens: 0,
      label: "month",
      limit: null,
      output_tokens: 0,
      resets_in_secs: 0,
      total_tokens: 0,
      window_secs: 2_592_000,
    },
  ],
};

export async function usageReport(): Promise<UsageReport> {
  return isInDesktop ? await call<UsageReport>("usage.report") : emptyUsage;
}

/**
One provider's token totals per time bucket, oldest bucket first (cache reads excluded).
*/
export interface UsageSeries {
  source: string;
  totals: number[];
}

/**
Time-bucketed usage for the trend chart; the last bucket is the partial one containing now.
*/
export interface UsageHistory {
  bucket_secs: number;
  bucket_count: number;
  /// Start of the first bucket (unix ms).
  start_ms: number;
  series: UsageSeries[];
}

/**
Per-provider totals over the charted range, with a best-effort cost estimate.
*/
export interface SourceUsage {
  source: string;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  total_tokens: number;
  /// Estimated spend over priceable records; null when nothing in this source was priceable.
  estimated_cost_usd: number | null;
  /// Tokens from records whose model is unknown/unpriced — not covered by the estimate.
  unpriced_tokens: number;
}

export interface UsageHistoryReport {
  history: UsageHistory;
  by_source: SourceUsage[];
}

const emptyUsageHistory: UsageHistoryReport = {
  by_source: [],
  history: { bucket_count: 0, bucket_secs: 86_400, series: [], start_ms: 0 },
};

export async function usageHistory(days: number): Promise<UsageHistoryReport> {
  return isInDesktop
    ? await call<UsageHistoryReport>("usage.history", { days })
    : emptyUsageHistory;
}

// ---- workspace files & rules (G1/G2) ---------------------------------------------------------

const fallbackFiles = ["src/main.rs", "src/lib.rs", "README.md"];

export async function listFiles(
  cwd: string,
  query: string,
  limit = 50
): Promise<string[]> {
  if (!isInDesktop) {
    return fallbackFiles.filter((f) => f.includes(query));
  }
  return await call<string[]>("workspace.list_files", { cwd, limit, query });
}

export interface WorkspaceSearchOptions {
  regex: boolean;
  case_sensitive: boolean;
  whole_word: boolean;
}

export interface WorkspaceContentMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export interface WorkspaceSearchResult {
  matches: WorkspaceContentMatch[];
  truncated: boolean;
  truncation_reason: string | null;
}

export async function searchWorkspaceContents(
  cwd: string,
  query: string,
  options: WorkspaceSearchOptions,
  requestId: string,
  limit = 200
): Promise<WorkspaceSearchResult> {
  if (!isInDesktop) {
    return { matches: [], truncated: false, truncation_reason: null };
  }
  return await call<WorkspaceSearchResult>("workspace.search", {
    cwd,
    limit,
    options,
    query,
    request_id: requestId,
  });
}

export async function cancelWorkspaceContentSearch(
  requestId: string
): Promise<boolean> {
  return isInDesktop
    ? await call<boolean>("workspace.cancel_search", {
        request_id: requestId,
      })
    : false;
}

export async function listRules(cwd: string): Promise<string[]> {
  return isInDesktop ? await call<string[]>("workspace.rules", { cwd }) : [];
}

// ---- session management (G5) -----------------------------------------------------------------

export async function renameSession(
  session: string,
  title: string
): Promise<void> {
  if (isInDesktop) {
    await call("sessions.rename", { session, title });
  }
}
export async function archiveSession(
  session: string,
  isArchived: boolean
): Promise<void> {
  if (isInDesktop) {
    await call("sessions.set_archived", { session, value: isArchived });
  }
}
export async function pinSession(
  session: string,
  isPinned: boolean
): Promise<void> {
  if (isInDesktop) {
    await call("sessions.set_pinned", { session, value: isPinned });
  }
}
export async function listArchivedSessions(): Promise<SessionInfo[]> {
  return isInDesktop ? await call<SessionInfo[]>("sessions.archived") : [];
}

// ---- PR + commit message (G6) ------------------------------------------------------------------

export async function gitCreatePr(
  cwd: string,
  title: string,
  body: string
): Promise<string> {
  return isInDesktop
    ? await call<string>("git.create_pr", { body, cwd, title })
    : "";
}
export async function gitSuggestCommit(cwd: string): Promise<string> {
  return isInDesktop
    ? await call<string>("git.suggest_message", { cwd })
    : "chore: update";
}

// ---- GitHub pull requests --------------------------------------------------------------------

export interface GitHubPullRequestSummary {
  id: string;
  number: number;
  title: string;
  url: string;
  repository: { name: string; nameWithOwner: string };
  author: { login: string };
  isDraft: boolean;
  updatedAt: string;
  createdAt: string;
  labels: { name: string; color: string }[];
  commentsCount: number;
  authored: boolean;
  reviewRequested: boolean;
  reviewed: boolean;
}

export interface GitHubPullRequestDetail extends GitHubPullRequestSummary {
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  baseRefName: string;
  headRefName: string;
  state: string;
  mergeStateStatus: string;
  mergeable: string;
  reviewDecision: string;
  reviewers: { login: string; state: string }[];
  checks: {
    name: string;
    status: string;
    conclusion: string;
    detailsUrl: string | null;
  }[];
  files: {
    path: string;
    additions: number;
    deletions: number;
    changeType: string;
  }[];
}

export async function listGitHubPullRequests(): Promise<
  GitHubPullRequestSummary[]
> {
  return isInDesktop
    ? await call<GitHubPullRequestSummary[]>("github.pull_requests")
    : [];
}

export async function getGitHubPullRequest(
  summary: GitHubPullRequestSummary
): Promise<GitHubPullRequestDetail> {
  if (!isInDesktop) {
    throw new Error("GitHub pull requests require the desktop host");
  }
  return await call<GitHubPullRequestDetail>("github.pull_request", {
    summary,
    url: summary.url,
  });
}

export async function browserContext(annotation: Annotation): Promise<string> {
  // Mirrors core::browser::Annotation::to_context without requiring a native browser plugin.
  let s = `**Browser context** — ${annotation.url}`;
  if (annotation.selected_text != null && annotation.selected_text !== "") {
    s += `\n- selected: “${annotation.selected_text}”`;
  }
  if (annotation.note) {
    s += `\n- note: ${annotation.note}`;
  }
  return s;
}

export async function saveSkill(skill: Skill): Promise<void> {
  if (isInDesktop) {
    await call("skills.save", { skill });
  }
}

export async function deleteSkill(id: string): Promise<void> {
  if (isInDesktop) {
    await call("skills.delete", { id });
  }
}

export async function onEngineEvent(
  callback: (event_: CoreEvent) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<CoreEvent>("engine-event", callback);
}

export async function onPtyOutput(
  callback: (p: PtyOutput) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<PtyOutput>("pty-output", callback);
}

export async function onPtyTitle(
  callback: (p: PtyTitle) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<PtyTitle>("pty-title", callback);
}

export async function onPtyExit(
  callback: (event: PtyExit) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<PtyExit>("pty-exit", callback);
}

export function providerLabel(p: string | { custom: string }): string {
  return typeof p === "string" ? p : p.custom;
}

export type SceneSaveScope = "user" | "project";

export interface SceneEscalation {
  from: string;
  to: string;
}

export interface SceneApplyOutcome {
  applied: string[];
  pending: string[];
  escalation: SceneEscalation | null;
  plan_first: boolean | null;
  suppress_unpinned: boolean;
  pinned_skills: string[];
}

export interface SceneSessionParameters {
  provider: string | null;
  model: string | null;
  reasoning_effort: string | null;
  use_worktree: boolean | null;
  worktree_base: WorktreeBaselineKind | null;
  initial_policy: { mode: PermissionMode; sandbox: Sandbox } | null;
}

export interface SceneSessionPlanOutcome {
  params: SceneSessionParameters | null;
  escalation: SceneEscalation | null;
}

export interface SessionSceneState {
  reference: string;
  customized: boolean;
  resolved: boolean;
}

export interface AutoSceneChanged {
  session: string;
  reference: string;
  title: string;
  reason: string;
  pending: string[];
  planFirst: boolean | null;
  memoryRead: MemoryAccess;
  memoryWrite: MemoryAccess;
}

export async function onAutoSceneChanged(
  callback: (event: AutoSceneChanged) => void
): Promise<() => void> {
  if (!isInDesktop) {
    return () => {};
  }
  return listenDesktop<AutoSceneChanged>("auto-scene-changed", callback);
}

/// Every scene call degrades on a missing backend command (feature-detect: catch → fallback),
/// so a frontend running against an older core hides the affordance instead of breaking.
/**
Browser-preview stand-ins (same convention as fallbackSkills): the five builtin scenes.
*/
const fallbackScenes: SceneInfo[] = (
  [
    [
      "research",
      "Research",
      "调研",
      "🔎",
      "read_only",
      "Survey the problem space read-only and produce a cited research report.",
    ],
    [
      "develop",
      "Develop",
      "开发",
      "🛠️",
      "auto_edit",
      "Plan-first implementation in an isolated worktree.",
    ],
    [
      "test",
      "Test",
      "测试",
      "🧪",
      "auto_edit",
      "Exercise the change against its acceptance criteria.",
    ],
    [
      "fix",
      "Fix",
      "修复",
      "🩹",
      "auto_edit",
      "Resolve reported failures one by one.",
    ],
    [
      "acceptance",
      "Acceptance",
      "验收",
      "✅",
      "read_only",
      "Read-only verification against the original acceptance criteria.",
    ],
  ] as const
).map(([name, title, zh, icon, mode, description]) => {
  return {
    artifacts: [],
    description,
    execution: { session_mode: mode },
    has_brief: true,
    icon,
    keywords: [],
    localizations: { "zh-CN": { title: zh } },
    name,
    reference: `builtin:${name}`,
    source: "builtin" as const,
    title,
  };
});

export async function listScenes(cwd?: string): Promise<SceneInfo[]> {
  if (!isInDesktop) {
    return fallbackScenes;
  }
  return await call<SceneInfo[]>("scenes.list", { cwd: cwd ?? null }).catch(
    () => []
  );
}

export async function getScene(
  reference: string
): Promise<{ reference: string; source: string; scene: SceneDocument } | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<{
    reference: string;
    source: string;
    scene: SceneDocument;
  }>("scenes.get", {
    reference,
  }).catch(() => null);
}

export async function saveScene(
  scope: SceneSaveScope,
  cwd: string | null,
  previousName: string | null,
  scene: SceneDocument
): Promise<SceneInfo> {
  if (!isInDesktop) {
    return {
      artifacts: scene.artifacts ?? [],
      brief: scene.brief ?? null,
      description: scene.description ?? "",
      execution: scene.execution ?? null,
      exit: scene.exit ?? null,
      has_brief: Boolean(scene.brief),
      icon: scene.icon ?? null,
      keywords: scene.keywords ?? [],
      localizations: scene.localizations ?? {},
      name: scene.name,
      plugin_id: null,
      reference: `${scope}:${scene.name}`,
      skills: scene.skills ?? null,
      source: scope,
      title: scene.title,
    };
  }
  return await call<SceneInfo>("scenes.save", {
    cwd,
    previous_name: previousName,
    scene,
    scope,
  });
}

export async function deleteScene(
  scope: SceneSaveScope,
  cwd: string | null,
  name: string
): Promise<void> {
  if (!isInDesktop) {
    return;
  }
  await call("scenes.delete", { cwd, name, scope });
}

export async function applySceneToSession(
  session: string,
  reference: string,
  isConfirmEscalation: boolean
): Promise<SceneApplyOutcome | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<SceneApplyOutcome>("scenes.apply", {
    confirm_escalation: isConfirmEscalation,
    reference,
    session,
  }).catch(() => null);
}

export async function sceneSessionPlan(
  reference: string,
  isConfirmEscalation: boolean
): Promise<SceneSessionPlanOutcome | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<SceneSessionPlanOutcome>("scenes.session_plan", {
    confirm_escalation: isConfirmEscalation,
    reference,
  }).catch(() => null);
}

export async function setSessionScene(
  session: string,
  reference: string | null,
  isCustomized: boolean
): Promise<void> {
  if (!isInDesktop) {
    return;
  }
  await call("scenes.set_session", {
    customized: isCustomized,
    reference,
    session,
  }).catch(() => {});
}

export async function getSessionScene(
  session: string
): Promise<SessionSceneState | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<SessionSceneState | null>("scenes.session", {
    session,
  }).catch(() => null);
}

export async function setSessionAutoScene(
  session: string,
  isEnabled: boolean
): Promise<void> {
  if (!isInDesktop) {
    return;
  }
  await call("scenes.set_auto", { enabled: isEnabled, session });
}

export async function getSessionAutoScene(session: string): Promise<boolean> {
  if (!isInDesktop) {
    return false;
  }
  return await call<boolean>("scenes.auto", { session }).catch(() => false);
}

/**
Diff stat of a session's own checkout, shaped for display. Null when unknown or not a repo.
*/
export interface SessionDiffStat {
  files: number;
  additions: number;
  deletions: number;
}

export async function sessionDiffStat(
  session: string
): Promise<SessionDiffStat | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<GitDiffStat | null>("sessions.diff_stat", { session })
    .then((stat) => {
      return stat
        ? { additions: stat.added, deletions: stat.deleted, files: stat.files }
        : null;
    })
    .catch(() => null);
}

/** Per-session token/cost totals. The core command lands in a later wave — until then this
 * resolves null everywhere and the statusline's cost segment stays hidden (feature detect). */
export interface SessionUsage {
  input_tokens: number;
  output_tokens: number;
  cost_usd: number | null;
  burn_rate_usd_per_hour: number | null;
  priced: boolean;
}

export async function usageBySession(
  session: string
): Promise<SessionUsage | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<SessionUsage | null>("cost.session", { session }).catch(
    () => null
  );
}

// ---- scene artifacts (R4) -------------------------------------------------------------------

/**
One captured version of one scene artifact, as `list_scene_artifacts` reports it.
*/
export interface SceneArtifactRecord {
  id: number;
  scene_ref: string;
  artifact_key: string;
  kind: string;
  title: string;
  session_id: string;
  pipeline_instance_id: string | null;
  stage_id: string | null;
  artifact: ArtifactReference;
  version: number;
  pinned: boolean;
  created_at: number;
}

/// Same degradation contract as the scene calls above: against an older core the commands are
/// missing and every call quietly reports "no artifacts" instead of breaking the surface.
export async function listSceneArtifacts(
  session: string
): Promise<SceneArtifactRecord[]> {
  if (!isInDesktop) {
    return [];
  }
  return await call<SceneArtifactRecord[]>("scene_artifacts.list", {
    session,
  }).catch(() => []);
}

export async function sceneArtifactContent(
  recordId: number
): Promise<string | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<string>("scene_artifacts.content", {
    record_id: recordId,
  }).catch(() => null);
}

export async function recordSceneArtifact(
  session: string,
  artifactKey: string,
  content: string
): Promise<SceneArtifactRecord | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<SceneArtifactRecord>("scene_artifacts.record", {
    artifact_key: artifactKey,
    content,
    session,
  }).catch(() => null);
}

export async function pinSceneArtifact(
  session: string,
  artifactKey: string,
  version: number | null
): Promise<void> {
  if (!isInDesktop) {
    return;
  }
  await call("scene_artifacts.pin", {
    artifact_key: artifactKey,
    session,
    version,
  }).catch(() => {});
}

// ---- issue write path (R12) -----------------------------------------------------------------

export async function commentIssue(
  cwd: string,
  source: string,
  id: string,
  body: string,
  token?: string
): Promise<string | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<string>("issues.comment", {
    body,
    cwd,
    id,
    source,
    token: token ?? null,
  }).catch(() => null);
}

export async function structureBrief(
  transcript: string,
  slots: SceneSlotDefinition[]
): Promise<Record<string, string> | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<Record<string, string>>("issues.structure_brief", {
    slots,
    transcript,
  }).catch(() => null);
}

// ---- template-from-history (R2) --------------------------------------------------------------

/**
Heuristic `{{slot-N}}` proposal over a past prompt, as `propose_macro_slots` reports it.
*/
export interface ProposedMacro {
  template: string;
  slots: SceneSlotDefinition[];
}

export async function proposeMacroSlots(
  text: string
): Promise<ProposedMacro | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<ProposedMacro>("skills.propose_macro", { text }).catch(
    () => null
  );
}

// ---- scene hooks (R8) -----------------------------------------------------------------------

/// Remember a completion-banner dismissal so the same exit state never re-fires this session.
export async function dismissSceneBanner(
  session: string,
  stateKey: string
): Promise<void> {
  if (!isInDesktop) {
    return;
  }
  await call("scenes.dismiss_banner", { session, state_key: stateKey }).catch(
    () => {}
  );
}

/// Enable/disable scene `schedule` hooks for one project (off by default).
export async function setProjectScheduling(
  path: string,
  isEnabled: boolean
): Promise<void> {
  if (!isInDesktop) {
    return;
  }
  await call("scenes.set_scheduling", { enabled: isEnabled, path }).catch(
    () => {}
  );
}

// ---- pipeline instances (R9) ----------------------------------------------------------------

/**
One resolved pipeline definition, as `list_pipelines` reports it.
*/
export interface PipelineInfo {
  reference: string;
  name: string;
  title: string;
  description: string;
  icon: string | null;
  source: string;
  stage_count: number;
}

/**
One running (or finished) pipeline instance.
*/
export interface PipelineInstance {
  id: string;
  pipeline_ref: string;
  project_path: string;
  current_stage: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface PipelineTransitionRecord {
  instance_id: string;
  seq: number;
  from_stage: string | null;
  to_stage: string;
  trigger: string;
  gate: string;
  session_id: string | null;
  created_at: number;
}

/**
One stage on the horizontal stage track.
*/
export interface PipelineStageStatus {
  id: string;
  scene_ref: string;
  title: string;
  state: "done" | "current" | "pending";
  gate: string;
  loop_count: number;
  sessions: string[];
  artifacts: SceneArtifactRecord[];
}

export interface PipelineInstanceDetail {
  instance: PipelineInstance;
  transitions: PipelineTransitionRecord[];
  stages: PipelineStageStatus[];
}

export interface PipelineStartOutcome {
  detail: PipelineInstanceDetail;
  applied_scene: SceneApplyOutcome | null;
}

export interface PipelineAdvanceOutcome {
  instance: PipelineInstance;
  applied_scene: SceneApplyOutcome | null;
  session_plan: SceneSessionParameters | null;
  escalation: SceneEscalation | null;
  carried: string[];
}

/// Same degradation contract as the other scene calls: on an older core every call quietly
/// reports "no pipelines" instead of breaking the surface.
export async function listPipelines(): Promise<PipelineInfo[]> {
  if (!isInDesktop) {
    return [];
  }
  return await call<PipelineInfo[]>("pipelines.list", {}).catch(() => []);
}

export async function startPipeline(
  reference: string,
  projectPath: string,
  session: string | null
): Promise<PipelineStartOutcome | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<PipelineStartOutcome>("pipelines.start", {
    project_path: projectPath,
    reference,
    session,
  }).catch(() => null);
}

export async function advancePipeline(
  instanceId: string,
  toStage: string,
  session: string | null,
  isConfirm: boolean
): Promise<PipelineAdvanceOutcome | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<PipelineAdvanceOutcome>("pipelines.advance", {
    confirm: isConfirm,
    instance_id: instanceId,
    session,
    to_stage: toStage,
  }).catch(() => null);
}

export async function bindPipelineSession(
  instanceId: string,
  stageId: string,
  session: string
): Promise<void> {
  if (!isInDesktop) {
    return;
  }
  await call("pipelines.bind_session", {
    instance_id: instanceId,
    session,
    stage_id: stageId,
  }).catch(() => {});
}

export async function getPipelineInstance(
  instanceId: string
): Promise<PipelineInstanceDetail | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<PipelineInstanceDetail>("pipelines.instance", {
    instance_id: instanceId,
  }).catch(() => null);
}

export async function listPipelineInstances(
  projectPath: string
): Promise<PipelineInstance[]> {
  if (!isInDesktop) {
    return [];
  }
  return await call<PipelineInstance[]>("pipelines.instances", {
    project_path: projectPath,
  }).catch(() => []);
}

export async function sessionPipeline(
  session: string
): Promise<{ instance_id: string; stage_id: string } | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<{ instance_id: string; stage_id: string } | null>(
    "pipelines.session",
    {
      session,
    }
  ).catch(() => null);
}

// ---- issue delegation trail (R12 cleanup) ----------------------------------------------------

/**
One "delegated to scene" event on an issue's accountability trail.
*/
export interface IssueDelegation {
  id: number;
  source: string;
  issue_id: string;
  issue_title: string;
  scene_ref: string;
  scene_title: string;
  session_id: string | null;
  comment_url: string | null;
  created_at: number;
}

export async function recordIssueDelegation(
  source: string,
  issueId: string,
  issueTitle: string,
  sceneReference: string,
  sceneTitle: string
): Promise<number | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<number>("issues.record_delegation", {
    issue_id: issueId,
    issue_title: issueTitle,
    scene_ref: sceneReference,
    scene_title: sceneTitle,
    source,
  }).catch(() => null);
}

export async function setIssueDelegationSession(
  id: number,
  session: string
): Promise<void> {
  if (!isInDesktop) {
    return;
  }
  await call("issues.set_delegation_session", { id, session }).catch(() => {});
}

export async function setIssueDelegationComment(
  id: number,
  url: string
): Promise<void> {
  if (!isInDesktop) {
    return;
  }
  await call("issues.set_delegation_comment", { id, url }).catch(() => {});
}

export async function listIssueDelegations(
  source: string,
  issueId: string
): Promise<IssueDelegation[]> {
  if (!isInDesktop) {
    return [];
  }
  return await call<IssueDelegation[]>("issues.delegations", {
    issue_id: issueId,
    source,
  }).catch(() => []);
}

export async function getProjectScheduling(path: string): Promise<boolean> {
  if (!isInDesktop) {
    return false;
  }
  return await call<boolean>("scenes.scheduling", { path }).catch(() => false);
}

export async function exportSceneSkillMd(
  reference: string
): Promise<string | null> {
  if (!isInDesktop) {
    return null;
  }
  return await call<string>("scenes.export_skill_md", { reference }).catch(
    () => null
  );
}

export {
  type AppshotCapture,
  type AppshotDestination,
  type AppshotHotkey,
  type AppshotSettings,
  type WorkspaceOpenTarget,
  type AppUpdateStatus,
} from "./container";
