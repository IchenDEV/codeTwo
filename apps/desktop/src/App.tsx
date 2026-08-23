import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Archive,
  Check,
  CircleAlert,
  Folder,
  FolderPlus,
  Keyboard,
  PanelLeft,
  SquareKanban,
} from "lucide-react";

import { DocEditor } from "./editor/Editor";
import { type CanvasBlockRuntime } from "./skillInline";
import { deriveCanvasManifest } from "./canvas/manifest";
import type { CanvasEnvelope as LocalCanvasEnvelope } from "./canvas/types";
import {
  loadBrowserHistory,
  removeBrowserProject,
  saveBrowserHistory,
} from "./browser/history";
import {
  answerElicitation,
  answerPermission,
  applyPluginScaffold,
  applyPluginChange,
  archiveSession,
  browserRegistryCreate,
  browserContext,
  canvasCreateDraft,
  canvasDuplicate,
  canvasFeatureState,
  canvasNormalizeMedia,
  canvasPurge,
  canvasRestore,
  canvasFreeze,
  canvasTombstone,
  canvasUpdateDraft,
  cancelTurn,
  compileDoc,
  confirmNative,
  addProject,
  DEFAULT_KEYMAP,
  defaultCwd,
  deleteSkill,
  describeBlock,
  discardSessionWorktree,
  fallbackProviders,
  getKeymap,
  getTranscriptPage,
  gitCheckpoint,
  gitCheckpoints,
  gitCommit,
  gitDiffStat,
  gitPush,
  gitRevert,
  gitStatus,
  githubImportPlugin,
  installMarketplacePlugin,
  invokePluginUi,
  commentIssue,
  issueContext,
  listArchivedSessions,
  listMemoryReceipts,
  lspSetRuntimeEnabled,
  listPlugins,
  listProjectScripts,
  listProjects,
  listProviders,
  listSessions,
  listSkills,
  listWorktreeBaselines,
  marketCatalog,
  marketInstall,
  planPluginChange,
  pluginCatalog,
  newSession,
  onBrowserAgentActivity,
  onBrowserDownloadBlocked,
  onAutoSceneChanged,
  onPluginsChanged,
  onEngineEvent,
  openProject,
  openWorkspace,
  pickPluginMarketplace,
  pinSession,
  pickDirectory,
  providerQuota,
  providerLabel,
  removeProject,
  resetManagedPlugin,
  renameProject,
  renameSession,
  runProjectScript,
  saveProjectScript,
  saveSkill,
  searchSessions,
  sessionPreviews,
  setConfigOption,
  setCallProjectPath,
  setKeymap,
  setModel,
  setPluginEnabled,
  setPluginTrusted,
  setProjectWorktreeMode,
  type WorkspaceOpenTarget,
  setSessionMemoryPolicy,
  setExecutionPolicy,
  submitPrompt,
  uninstallPlugin,
  type Checkpoint,
  type CanvasDraft,
  type CanvasExport,
  type CanvasFeatureState,
  type CanvasPixelPolicy,
  type CanvasSceneEnvelope,
  type CanvasStaticAsset,
  type CanvasSnapshot,
  type CompiledPreview,
  type ConfigOptionInfo,
  type CoreEvent,
  type DocBlock,
  type ElicitationAnswer,
  type ExecutionPolicy,
  type Annotation,
  type GitStatus,
  type Issue,
  type KeymapEntry,
  type MarketItem,
  type MemoryAccess,
  type MemoryReceipt,
  type ModelChoice,
  type PluginInfo,
  type ManagedPluginCatalog,
  type Project,
  type ProjectScript,
  type ProjectWorktreeMode,
  type ProviderInfo,
  type ProviderQuotaReport,
  type PermissionMode,
  type Sandbox,
  type SessionActivity,
  type SessionInfo,
  type SkillInfo,
  type WorktreeBaselineKind,
  type WorktreeBaselineOption,
  type WorkspaceContentMatch,
  type PipelineInfo,
  type PipelineInstanceDetail,
  advancePipeline,
  applySceneToSession,
  dismissSceneBanner,
  bindPipelineSession,
  getPipelineInstance,
  recordIssueDelegation,
  setIssueDelegationComment,
  setIssueDelegationSession,
  getSessionScene,
  getSessionAutoScene,
  listPipelines,
  listScenes,
  recordSceneArtifact,
  sceneSessionPlan,
  sessionPipeline,
  setModel as setSessionModel,
  setSessionScene,
  setSessionAutoScene,
  startPipeline,
  structureBrief,
  usageBySession,
} from "./bridge";
import { loadProviderRegistry } from "./providers/registry";
import { makeTranscriptHandler } from "./voice/VoiceButton";
import { PluginHub } from "./market/Market";
import {
  PluginManagerPage,
  PluginUiSlot,
  activePluginLanguageServers,
  activePluginUiContributions,
  buildPluginManagerCatalog,
  createPluginManagerLabels,
  localizePluginManagerCatalog,
  normalizePluginProjectPath,
  pluginManagerComponentEnabled,
  toManagedPluginScope,
  type ActivePluginUiContribution,
  type BuiltinUiComponentId,
  type PluginManagerChangePlan,
  type PluginManagerChangeRequest,
  type PluginManagerScope,
} from "./plugins";
import {
  applyPluginManagerChange,
  planPluginManagerChange,
} from "./plugins/lifecycle";
import { SettingsPage, type SettingsTab } from "./settings/SettingsPage";
import { SourceControlModal } from "./git/SourceControl";
import { workspaceStateForCwd, type WorkspaceLoadState } from "./git/state";
import { CommandPalette, type Command } from "./palette/CommandPalette";
import { RemoteModal } from "./remote/Remote";
import { IssuesModal } from "./issues/Issues";
import { PreviewModal } from "./editor/Preview";
import { FileBrowserModal } from "./files/FileBrowser";
import { WorkspaceSearchModal } from "./files/WorkspaceSearch";
import type { FileRevealTarget } from "./files/FileViewer";
import { dirtyKey, isDirty as isFileDirty, markDirty } from "./files/dirty";
import { synchronizeLspRuntimePolicy } from "./lsp/runtimePolicy";
import { configurePluginLanguageServers } from "./lsp/client";
import { quickQuotaProviderFor, quickQuotaSummary } from "./usage/quickQuota";
import { AutomationsPage } from "./automation/AutomationsPage";
import type { SessionConfig } from "./session/config";
import {
  SESSION_MODES,
  executionPolicyChangeDisabled,
  nextSessionMode,
  sessionExecutionPolicy,
  sessionMode,
  withSessionExecutionPolicy,
  type SessionMode,
} from "./session/mode";
import {
  escalationNeeded,
  nextSceneInRing,
  sceneCustomized,
  softApplyPending,
  MEMORY_PRESET_POLICY,
  sceneEffortChoice,
  type SceneInfo,
} from "./session/scene";
import { SceneEscalationDialog, ScenePicker } from "./session/SceneChip";
import type { SceneEditorRequest } from "./session/SceneEditor";
import { SceneStudio } from "./session/SceneStudio";
import {
  SceneBanner,
  sceneBannerFromEvent,
  type SceneBannerState,
} from "./session/SceneBanner";
import { SessionHeaderActions } from "./session/SessionHeaderActions";
import { SideChatPanel, type SideChatSeed } from "./session/SideChatPanel";
import { ProjectActionDialog } from "./session/ProjectActionDialog";
import { projectActionBindings } from "./session/projectActions";
import { StageTrack } from "./session/StageTrack";
import { Composer } from "./session/Composer";
import {
  activeContextWindow,
  clearContextWindow,
  updateContextWindow,
  type ContextWindowBySession,
} from "./session/contextWindow";
// Explicit extension: `session/` holds both `statusline.ts` and `Statusline.tsx`, and bun's
// resolver matches the pair case-insensitively without it.
import { deriveBurnRate } from "./session/statusline.ts";
import {
  nextSessionWorktreeBaseline,
  projectSwitchWorktreeBaseline,
} from "./session/projectDefaults";
import { QuestionDialog } from "./session/QuestionDialog";
import { TemplateDialog } from "./session/TemplateDialog";
import { TranscriptPane } from "./session/TranscriptPane";
import { planChecklistMarkdown } from "./session/TurnCard";
import { useTranscriptScroll } from "./session/useTranscriptScroll";
import { petAnimationForActivity } from "./pet/state";
import {
  applyEvent,
  canvasAcceptedRequestKey,
  canvasIdsToPurgeAfterTurnStart,
  canvasRetryDocument,
  canvasRetryTargetSession,
  canvasUnmountPlan,
  canvasRetryRefsForTerminal,
  isCanvasProviderImageError,
  matchesSubmittedEditorRevision,
  mergeLoadedTurns,
  newTurn,
  prependTranscriptTurns,
  transcriptTailState,
  turnsFromTranscript,
  withRunningSession,
  withoutUnacceptedTurn,
  type Turn,
} from "./session/turns";
import {
  activeSessionWorktreeState,
  enqueuePermission,
  activityIsBusy,
  isTerminalSessionEvent,
  latestActivity,
  matchesSessionCreation,
  permissionQueueAfterAnswer,
  permissionQueueAfterActivity,
  permissionsFromSessions,
  sessionCreationBaseline,
  sessionCreationBaselineSha,
  sessionCreationReceipt,
  sessionCreationSource,
  sessionActivity,
  sessionProjectPath,
  sessionShellWithReceipt,
  shouldRenderSessionEvent,
  type PermissionQueueItem,
  type SessionCreationShell,
} from "./session/sessionEvents";
import {
  classifyToolSurface,
  followReduce,
  initialFollowState,
  type FollowEvent,
  type FollowState,
  type ToolSurfaceHint,
} from "./session/toolActivity";
import { Dock, type DockSurface, type DockTab } from "./dock/Dock";
import { SessionRail } from "./sidebar/SessionRail";
import { MissionControlDialog } from "./sidebar/MissionControl.tsx";
import { TaskBoardPage } from "./taskboard/TaskBoardPage";
import {
  associateTaskSession,
  createBoardTask,
  loadBoardSnapshot,
  saveBoardSnapshot,
  taskForSession,
  type BoardTask,
} from "./taskboard/taskBoard";

import {
  actionForEvent,
  comboFromEvent,
  isModifierOnly,
  keyHint,
} from "./keys";
import { useToast } from "./ui/toast";
import { useLanguage, useT } from "./i18n";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePersistedNumber } from "@/lib/persist";
import { cn } from "@/lib/utils";

function summarizeDoc(doc: DocBlock[]): string {
  return doc.map(describeBlock).join("\n\n");
}

interface PendingPromptRequest {
  requestId: string;
  /** Raw editor revision before plan-mode or other synthetic blocks are injected. */
  editorSnapshot: DocBlock[];
  editorRevision: number;
  /** Exact submitted prompt, retained for an explicit provider retry after Composer clear. */
  submittedDoc: DocBlock[];
  /** Canvas heads included in this request; marked for mutable-head purge only after TurnStarted. */
  canvasIds: string[];
  /** Frozen immutable revisions retained for an explicit provider-error retry after Composer clear. */
  canvasRefs: Array<{ id: string; revision: number }>;
}

interface PendingCreation {
  doc: DocBlock[];
  /** Frozen Composer document before the internal plan-first block is injected. */
  canvasRetryDoc: DocBlock[];
  promptRequestId: string;
  editorSnapshot: DocBlock[];
  editorRevision: number;
}

interface PendingPolicyRequest {
  session: string;
  authoritative: ExecutionPolicy;
}

function localCanvasManifest(
  envelope: LocalCanvasEnvelope,
): import("./bridge").CanvasManifest {
  const manifest = deriveCanvasManifest(envelope.elements);
  return {
    objects: manifest.objects.map((object) => ({
      id: object.id,
      kind: object.type === "freedraw" ? "pen" : object.type,
      originalText: object.originalText ?? undefined,
      bounds: object.geometry,
      layer: object.layer,
      arrowStart: object.arrowStart,
      arrowEnd: object.arrowEnd,
      assetId:
        object.type === "image"
        ? (() => {
              const fileId = (
                envelope.elements.find(
                  (element) => element.id === object.id,
                ) as { fileId?: string } | undefined
              )?.fileId;
              return (
                envelope.assetRefs.find((asset) => asset.fileId === fileId)
                  ?.ref ??
                fileId ??
                null
              );
          })()
        : null,
    })),
  };
}

function localCanvasScene(
  envelope: LocalCanvasEnvelope,
  assets: readonly CanvasStaticAsset[],
): CanvasSceneEnvelope {
  return {
    engine: envelope.engine,
    engineVersion: envelope.engineVersion,
    schemaVersion: envelope.schemaVersion,
    revision: envelope.revision,
    theme: envelope.theme,
    assets: assets.map((asset) => ({
      id: asset.id,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      sourceName: asset.sourceName ?? null,
    })),
    scene: {
      elements: envelope.elements,
      appState: envelope.appState,
    },
  };
}

interface GitWorkspaceData {
  status: GitStatus | null;
  diffStat: { added: number; deleted: number; truncated: boolean };
}

const EMPTY_DIFF_STAT = { added: 0, deleted: 0, truncated: false } as const;
const EMPTY_GIT_WORKSPACE: GitWorkspaceData = {
  status: null,
  diffStat: EMPTY_DIFF_STAT,
};
const EMPTY_CHECKPOINTS: Checkpoint[] = [];

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A header icon with a tooltip — the always-visible way into a dock surface. */
function IconAction({
  icon: Icon,
  label,
  hint,
  onClick,
  active,
}: {
  icon: typeof Keyboard;
  label: string;
  /** Live shortcut from the keymap, so a rebind shows up here too. */
  hint?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          aria-label={label}
          className={cn("size-7 shrink-0", active && "text-primary")}
          onClick={onClick}
        >
          <Icon className="size-4" />
          </Button>
        }
      />
      <TooltipContent>
        {label}
        {hint && <span className="ml-1.5 opacity-60">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/** Preserve the selected wording while making its provenance unmistakable in the next prompt. */
function selectedExcerptMarkdown(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

const EMPTY_MANAGED_CATALOG: ManagedPluginCatalog = {
  graph_revision: 0,
  config_revision: 0,
  recovery: { kind: "normal" },
  plugins: [],
};
const EMPTY_SCENE_BY_SESSION = new Map<string, string>();

export default function App() {
  const [providers, setProviders] = useState<ProviderInfo[]>(fallbackProviders);
  const [providersStatus, setProvidersStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const providerRegistryRequestRef = useRef(0);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [managedUserCatalog, setManagedUserCatalog] =
    useState<ManagedPluginCatalog | null>(null);
  const [managedProjectCatalogs, setManagedProjectCatalogs] = useState<
    Record<string, ManagedPluginCatalog>
  >({});
  const [pluginManagerScope, setPluginManagerScope] =
    useState<PluginManagerScope>({ kind: "user" });
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<SessionInfo[]>([]);
  // Row 2 of every rail entry. Refreshed when a turn ends rather than per streamed chunk — the
  // preview is a glance, and requerying the transcript table on every token would be absurd.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState("grok");
  const [cwd, setCwd] = useState(".");
  const [mode, setMode] = useState<PermissionMode>("ask");
  const [sandbox, setSandboxState] = useState<Sandbox>("workspace_write");
  const [pendingPolicySessions, setPendingPolicySessions] = useState<
    Set<string>
  >(() => new Set());
  const [worktreeBase, setWorktreeBase] = useState<WorktreeBaselineKind | null>(
    null,
  );
  const [worktreeOptions, setWorktreeOptions] = useState<
    WorktreeBaselineOption[]
  >([]);
  const [worktreeOptionsLoading, setWorktreeOptionsLoading] = useState(false);
  const worktreeOptionsRequestRef = useRef(0);
  const [planMode, setPlanMode] = useState(false);
  const [memoryRead, setMemoryRead] = useState<MemoryAccess>("inherit");
  const [memoryWrite, setMemoryWrite] = useState<MemoryAccess>("inherit");
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [activeSessionReceipt, setActiveSessionReceipt] = useState<{
    session: string;
    shell: SessionCreationShell;
  } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [permissionQueue, setPermissionQueue] = useState<PermissionQueueItem[]>(
    [],
  );
  const [runningSessions, setRunningSessions] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingSessionRunning, setPendingSessionRunning] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [transcriptNextBefore, setTranscriptNextBefore] = useState<
    number | null
  >(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const transcriptScroll = useTranscriptScroll(activeSession, turns);
  const { capturePrependAnchor, prepareForPrepend } = transcriptScroll;
  const permission = permissionQueue[0] ?? null;
  const [skillDraft, setSkillDraft] = useState<{
    name: string;
    text: string;
  } | null>(null);
  /** R2 "save as template": the prompt text the TemplateDialog opens over. */
  const [templateDraft, setTemplateDraft] = useState<string | null>(null);
  const [gitWorkspace, setGitWorkspace] = useState<
    WorkspaceLoadState<GitWorkspaceData>
  >({
    cwd: ".",
    loading: true,
    value: EMPTY_GIT_WORKSPACE,
  });
  const [bindings, setBindings] = useState<KeymapEntry[]>([]);
  // A blank tab, not a landing page: this browser's job is your localhost dev server, which you
  // type in.
  const [browserUrl, setBrowserUrl] = useState("about:blank");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] =
    useState<SettingsTab>("general");
  const [showAutomations, setShowAutomations] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [showPluginHub, setShowPluginHub] = useState(false);
  const [showBundlePluginTools, setShowBundlePluginTools] = useState(false);
  const [market, setMarket] = useState<MarketItem[]>([]);
  const [showSourceControl, setShowSourceControl] = useState(false);
  const [checkpointWorkspace, setCheckpointWorkspace] = useState<
    WorkspaceLoadState<Checkpoint[]>
  >({ cwd: ".", loading: true, value: EMPTY_CHECKPOINTS });
  const [showPalette, setShowPalette] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [preview, setPreview] = useState<CompiledPreview | null>(null);
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [showWorkspaceSearch, setShowWorkspaceSearch] = useState(false);
  const [quickQuotaReport, setQuickQuotaReport] =
    useState<ProviderQuotaReport | null>(null);
  const [quickQuotaLoading, setQuickQuotaLoading] = useState(true);
  const quickQuotaRequestRef = useRef(0);
  const [showMissionControl, setShowMissionControl] = useState(false);
  const [showTaskBoard, setShowTaskBoard] = useState(false);
  const [activeBoardTask, setActiveBoardTask] = useState<BoardTask | null>(null);
  const activeBoardTaskRef = useRef<BoardTask | null>(null);
  const [temporarySession, setTemporarySession] = useState(false);
  const temporarySessionRef = useRef(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab | null>(null);
  const [sideChatOpen, setSideChatOpen] = useState(false);
  const [sideChatSeed, setSideChatSeed] = useState<SideChatSeed | null>(null);
  const [sideChatWidth, setSideChatWidth] = usePersistedNumber(
    "codetwo.sideChatWidth",
    440,
  );
  // ---- R10 dock follow (docs/design/scenes-impl-frontend.md Item 6) ----
  // The latch reducer's state lives in a ref because engine events arrive outside render; only
  // the badge hint is state, so the Dock can mark the surface the agent is working on.
  const terminalOpenRef = useRef(false);
  const dockTabRef = useRef<DockTab | null>(null);
  const dockFollowRef = useRef<FollowState>(initialFollowState);
  const [dockAutoHint, setDockAutoHint] = useState<ToolSurfaceHint | null>(
    null,
  );
  const [docEmpty, setDocEmpty] = useState(true);
  // ---- scenes (Agent Scenes 1.0.0; docs/scenes.md) ----
  const [scenes, setScenes] = useState<SceneInfo[]>([]);
  /** The active scene's canonical reference for the focused session (or the draft). */
  const [activeSceneName, setActiveSceneName] = useState<string | null>(null);
  const [autoScene, setAutoScene] = useState(false);
  const [scenePendingFields, setScenePendingFields] = useState<string[]>([]);
  const [showScenePicker, setShowScenePicker] = useState(false);
  const [showSceneStudio, setShowSceneStudio] = useState(false);
  const [sceneEditorRequest, setSceneEditorRequest] =
    useState<SceneEditorRequest | null>(null);
  const [sceneEscalation, setSceneEscalation] = useState<{
    reference: string;
    kind: "soft" | "restart" | "pipeline" | "pipeline_new";
    from: SessionMode;
    to: SessionMode;
    /** Set for kind "pipeline": confirming re-calls advance_pipeline with confirm=true. */
    pipeline?: { instanceId: string; toStage: string };
  } | null>(null);
  /** Scene completion/suggestion banner above the composer (R8); latest state key wins. */
  const [sceneBanner, setSceneBanner] = useState<SceneBannerState | null>(null);
  // ---- R9 pipeline instances (docs/scenes.md §Pipelines) ----
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  /** The active session's instance projection; the stage track renders only while this is set. */
  const [pipelineDetail, setPipelineDetail] =
    useState<PipelineInstanceDetail | null>(null);
  /** Scene to bind to the next created session (full-apply handshake). */
  const pendingSceneRef = useRef<string | null>(null);
  /** Per-session scene memory so switching sessions restores each one's scene. */
  const sceneBySessionRef = useRef(new Map<string, string>());
  const autoSceneBySessionRef = useRef(new Map<string, boolean>());
  const scenesRef = useRef<SceneInfo[]>([]);
  const activeSceneNameRef = useRef<string | null>(null);
  const autoSceneRef = useRef(false);
  /** Sessions whose scene reasoning_effort has been applied (once options arrived). */
  const sceneEffortAppliedRef = useRef(new Set<string>());
  /** Stage binding for the next created session (advance-in-new-session handshake). */
  const pendingPipelineBindRef = useRef<{
    instanceId: string;
    stageId: string;
  } | null>(null);
  /** Delegation row awaiting its session id (issue delegated → session created on first Run). */
  const pendingDelegationRef = useRef<number | null>(null);
  useEffect(() => {
    activeSceneNameRef.current = activeSceneName;
  }, [activeSceneName]);
  useEffect(() => {
    autoSceneRef.current = autoScene;
  }, [autoScene]);
  const [canvasFeature, setCanvasFeature] = useState<CanvasFeatureState>({
    feature: "CODETWO_CANVAS_INPUT_V1",
    enabled: false,
    status: "not production-enabled",
  });
  const canvasDraftsRef = useRef(new Map<string, CanvasDraft>());
  const canvasAssetsRef = useRef(
    new Map<string, Map<string, CanvasStaticAsset>>(),
  );
  const canvasTombstonesRef = useRef(new Set<string>());
  const canvasPurgeRequestedRef = useRef(new Set<string>());
  const canvasFrozenRef = useRef(new Set<string>());
  const insertCanvasRef = useRef<(() => Promise<void>) | null>(null);
  const insertCanvasDraftRef = useRef<
    | ((
    draft: CanvasDraft,
    options?: {
      pixelPolicy?: CanvasPixelPolicy;
      deliveryError?: string;
      deliveryErrorKind?: "provider_image" | "other";
    },
      ) => void)
    | null
  >(null);
  const restoreCanvasDocumentRef = useRef<
    | ((
    doc: readonly DocBlock[],
    drafts: ReadonlyMap<string, CanvasDraft>,
    options?: {
      pixelPolicy?: CanvasPixelPolicy;
      deliveryError?: string;
      deliveryErrorKind?: "provider_image" | "other";
    },
      ) => void)
    | null
  >(null);
  const freezeCanvasesRef = useRef<
    ((doc: readonly DocBlock[]) => Promise<DocBlock[]>) | null
  >(null);
  const canvasDeliveryErrorRef = useRef<
    | ((
        doc: readonly DocBlock[],
        message: string,
        kind: "provider_image" | "other",
      ) => void)
    | null
  >(null);
  // Models are reported by the agent at session/new, so they arrive as an event rather than a call.
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  // What the adapter itself picked at session/new — the picker badges it as "Default". Later
  // `models` events are switch echoes, so only the first one after a reset gets to set this.
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  // Session config options (model + reasoning effort) — the newer ACP surface, same lifecycle.
  const [configOptions, setConfigOptions] = useState<ConfigOptionInfo[]>([]);
  // Provider-reported context windows are session-level state, not transcript parts. Keeping the
  // map keyed by id prevents a late/background provider event from repainting the active session.
  const [contextWindows, setContextWindows] = useState<ContextWindowBySession>(
    {},
  );
  // Per-session cost/burn for the Composer statusline (R7). The core's `usage_by_session`
  // command lands in a later wave; until then the bridge feature-detects and this stays null,
  // which hides the cost segment entirely.
  const [sessionUsage, setSessionUsage] = useState<{
    costUsd: number | null;
    burnRate: number | null;
  } | null>(null);
  useEffect(() => {
    setSessionUsage(null);
    if (!activeSession) return;
    let cancelled = false;
    // Cumulative token counters per poll; burn rate is derived over a trailing window, so the
    // sample list lives and dies with the active session.
    const samples: { at: number; input: number; output: number }[] = [];
    const poll = async () => {
      const usage = await usageBySession(activeSession);
      if (cancelled) return;
      if (!usage) {
        setSessionUsage(null);
        return;
      }
      samples.push({
        at: Date.now(),
        input: usage.input_tokens,
        output: usage.output_tokens,
      });
      if (samples.length > 16) samples.shift();
      setSessionUsage({
        costUsd: usage.cost_usd,
        burnRate: deriveBurnRate(samples),
      });
    };
    void poll();
    const timer = setInterval(() => void poll(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeSession]);
  // Projects are the rail's organising idea: the conversation list and the git section below it
  // both describe whichever one is active.
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [projectBootstrapComplete, setProjectBootstrapComplete] =
    useState(false);
  useEffect(() => {
    setCallProjectPath(
      activeProject ? normalizePluginProjectPath(activeProject) : null,
    );
  }, [activeProject]);
  const workspaceCwd = cwd || ".";
  const currentGitWorkspace = workspaceStateForCwd(
    gitWorkspace,
    workspaceCwd,
    EMPTY_GIT_WORKSPACE,
  );
  const git = currentGitWorkspace.value.status;
  const currentCheckpointWorkspace = workspaceStateForCwd(
    checkpointWorkspace,
    workspaceCwd,
    EMPTY_CHECKPOINTS,
  );
  const checkpoints = currentCheckpointWorkspace.value;
  const running = activeSession
    ? runningSessions.has(activeSession)
    : pendingSessionRunning;
  const policyChangeDisabled = executionPolicyChangeDisabled(
    pendingSessionRunning,
    activeSession,
    pendingPolicySessions,
  );
  const activeRunState = activeSession
    ? sessionActivity(
        sessions.find((session) => session.id === activeSession) ??
          archivedSessions.find((session) => session.id === activeSession) ??
          {},
      ).state
    : null;
  const awaitingInput = activeRunState?.kind === "awaiting_input";
  const latestTurn = turns[turns.length - 1];
  const petAnimation = petAnimationForActivity({
    loading: sessionLoading,
    running,
    awaitingInput,
    failed: activeRunState?.kind === "failed" || Boolean(latestTurn?.error),
    completed: Boolean(latestTurn?.endedAt),
  });
  // The right panel's file editor: open tabs in open order, and which one is showing. Every tab
  // is directly editable — unsaved-ness lives in files/dirty.ts, which the close guard reads.
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileReveal, setFileReveal] = useState<FileRevealTarget | null>(null);
  const fileRevealRequestRef = useRef(0);
  // Composer geometry: how tall the document area may grow before it scrolls, and whether it has
  // taken over the whole column for long-form authoring.
  const [composerH, setComposerH] = usePersistedNumber(
    "codetwo.composerHeight",
    190,
  );
  const [dockWidth, setDockWidth] = usePersistedNumber(
    "codetwo.dockWidth",
    440,
  );
  const [dockHeight, setDockHeight] = usePersistedNumber(
    "codetwo.dockHeight",
    280,
  );
  const [railWidth, setRailWidth] = usePersistedNumber(
    "codetwo.railWidth",
    288,
  );
  const [railCollapsedRaw, setRailCollapsedRaw] = usePersistedNumber(
    "codetwo.railCollapsed",
    0,
  );
  const railCollapsed = railCollapsedRaw !== 0;
  const toggleRail = useCallback(
    () => setRailCollapsedRaw(railCollapsed ? 0 : 1),
    [railCollapsed, setRailCollapsedRaw],
  );
  const [narrowLayout, setNarrowLayout] = useState(
    () => window.innerWidth < 720,
  );
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [narrowRailOpen, setNarrowRailOpen] = useState(false);
  const wasNarrowLayoutRef = useRef(narrowLayout);
  useEffect(() => {
    const measure = () => {
      const width = window.innerWidth;
      const next = width < 720;
      if (next && !wasNarrowLayoutRef.current) setNarrowRailOpen(false);
      wasNarrowLayoutRef.current = next;
      setViewportWidth(width);
      setNarrowLayout(next);
    };
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const displayedRailCollapsed = narrowLayout ? !narrowRailOpen : railCollapsed;
  const appliedSideChatWidth =
    viewportWidth < 640
      ? viewportWidth
      : viewportWidth < 960
        ? Math.min(sideChatWidth, 520)
        : viewportWidth < 1440
          ? Math.min(sideChatWidth, 360)
          : sideChatWidth;
  const toggleDisplayedRail = useCallback(() => {
    if (narrowLayout) setNarrowRailOpen((open) => !open);
    else toggleRail();
  }, [narrowLayout, toggleRail]);
  const openTaskBoard = useCallback(() => {
    setShowAutomations(false);
    setShowPluginHub(false);
    setShowTaskBoard(true);
    if (narrowLayout) setNarrowRailOpen(false);
    else if (railCollapsed) setRailCollapsedRaw(0);
  }, [narrowLayout, railCollapsed, setRailCollapsedRaw]);
  // Full-page document is *the* mode of this app, not a temporary state it visits — it's what
  // sets a document-first tool apart from a chat box, so it is also the default. Nothing takes it
  // away on your behalf; the composer's ⤢ button, the grip double-click and Mod+Shift+E change it,
  // and the choice persists.
  const [docModeRaw, setDocModeRaw] = usePersistedNumber("codetwo.docMode", 1);
  const docMode = docModeRaw !== 0;
  const setDocMode = useCallback(
    (v: boolean) => setDocModeRaw(v ? 1 : 0),
    [setDocModeRaw],
  );
  const mainRef = useRef<HTMLElement | null>(null);
  const sessionWorkspaceRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const workspace = sessionWorkspaceRef.current;
    if (!workspace) return;
    if (showTaskBoard) workspace.setAttribute("inert", "");
    else workspace.removeAttribute("inert");
  }, [showTaskBoard]);
  const toast = useToast();
  const t = useT();
  const { locale } = useLanguage();

  const setTaskContext = useCallback((task: BoardTask | null, temporary: boolean) => {
    activeBoardTaskRef.current = task;
    temporarySessionRef.current = temporary;
    setActiveBoardTask(task);
    setTemporarySession(temporary);
  }, []);

  const getBlocksRef = useRef<(() => DocBlock[]) | null>(null);
  const editorRevisionRef = useRef(0);
  const insertTextRef = useRef<((text: string) => void) | null>(null);
  const insertAnnotationRef = useRef<
    ((a: Annotation, context: string) => void) | null
  >(null);
  const insertFileRef = useRef<((path: string) => void) | null>(null);
  const focusEditorRef = useRef<(() => void) | null>(null);
  const clearEditorRef = useRef<(() => void) | null>(null);
  const insertMarkdownRef = useRef<
    ((markdown: string, mode: "replace" | "append") => Promise<void>) | null
  >(null);
  const openSkillPickerRef = useRef<(() => void) | null>(null);
  const insertSkillRef = useRef<((skill: SkillInfo) => void) | null>(null);
  const insertBriefRef = useRef<
    ((scene: SceneInfo, values?: Record<string, string>) => void) | null
  >(null);
  // R12: issue references insert as dedicated provenance-carrying blocks, not plain text.
  const insertIssueRef = useRef<
    ((issue: Issue, context: string, delegatedScene?: string) => void) | null
  >(null);
  /**
   * An issue block staged for a delegated draft, consumed right after `createSession`'s
   * synchronous reset (mirror of `pendingSceneRef`; the editor itself survives New — only a
   * locale change remounts it — so the next tick is the "editor ready" point).
   */
  const pendingIssueInsertRef = useRef<{
    issue: Issue;
    context: string;
    delegatedScene: string;
  } | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  // Event handlers and async continuations above the catalog projection need the same live policy
  // as rendered controls. Bootstrap closed: calling an unloadable command before the catalog and
  // active project realm agree is less safe than waiting one render for the policy snapshot.
  const componentEnabledRef = useRef<(id: BuiltinUiComponentId) => boolean>(
    () => false,
  );
  // ---- R4 plan-as-document (docs/design/scenes-impl-frontend.md Item 3) ----
  // Plan markdown waiting on the Replace/Append/Cancel decision because the composer isn't empty.
  const [planDocPending, setPlanDocPending] = useState<string | null>(null);
  /** The edited plan IS the next prompt: it opens into this session's composer document. */
  const openPlanAsDocument = useCallback(
    (entries: string[]) => {
      const markdown = planChecklistMarkdown(entries);
      if (docEmpty) {
        void insertMarkdownRef.current?.(markdown, "replace");
        setDocMode(true);
      } else {
        setPlanDocPending(markdown);
      }
    },
    [docEmpty, setDocMode],
  );
  const resolvePlanDocPending = useCallback(
    (mode: "replace" | "append" | null) => {
      const markdown = planDocPending;
      setPlanDocPending(null);
      if (!markdown || !mode) return;
      void insertMarkdownRef.current?.(markdown, mode);
      setDocMode(true);
    },
    [planDocPending, setDocMode],
  );
  const pinPlanArtifact = useCallback(
    (markdown: string) => {
      if (!componentEnabledRef.current("scenes.surface")) return;
      const session = activeSessionRef.current;
      if (!session) return;
      void recordSceneArtifact(session, "plan", markdown).then((record) => {
        if (record) toast(t("planDoc.pinned"), "success");
        else toast(t("planDoc.pinFailed"), "error");
      });
    },
    [t, toast],
  );
  const canPinPlan = (
    scenes.find((s) => s.reference === activeSceneName)?.artifacts ?? []
  ).some((artifact) => artifact.kind === "plan");
  // ---- R2 template-from-history (docs/design/scenes-impl-frontend.md Item 8) ----
  // Stable so the memoized TurnCards don't re-render on every App render.
  const openTemplateDraft = useCallback((promptText: string) => {
    setTemplateDraft(promptText);
  }, []);
  const currentModelRef = useRef<string | null>(null);
  currentModelRef.current = currentModel;
  // Model changes invalidate the old provider context immediately. Keep the pending id until the
  // provider echoes its authoritative model, so an echo racing React state cannot restore stale
  // capacity; session/load responses without a model change leave replayed context intact.
  const knownModelsRef = useRef<Map<string, string>>(new Map());
  const pendingModelChangesRef = useRef<Set<string>>(new Set());
  // A correlated creation event is already durable even if the best-effort rail refresh fails.
  // Keep its source/worktree receipt beside the active id so New never treats isolated cwd as a
  // source checkout while React state or the backend list is temporarily unavailable.
  const activeSessionProvenanceRef = useRef<{
    session: string;
    shell: SessionCreationShell;
  } | null>(null);
  // Mirrors `activeProject` so `selectProject` can tell a real switch from a re-click without
  // remaking its callback (and the rail rows' props) on every project change.
  const activeProjectRef = useRef<string | null>(null);
  // Project list reads can overlap local preference writes. A read that started before or during
  // a write must never restore the older SQLite snapshot after the write completes.
  const projectLoadSeqRef = useRef(0);
  const projectMutationVersionRef = useRef(0);
  const memoryReadRef = useRef<MemoryAccess>("inherit");
  const memoryWriteRef = useRef<MemoryAccess>("inherit");
  const memoryReceiptsRef = useRef<MemoryReceipt[]>([]);
  const initializePluginSessionState = useCallback(async (session: string) => {
    const updates: Promise<unknown>[] = [];
    if (componentEnabledRef.current("memory.settings")) {
      updates.push(
        setSessionMemoryPolicy(
          session,
          memoryReadRef.current,
          memoryWriteRef.current,
        ),
      );
    }
    if (componentEnabledRef.current("scenes.surface")) {
      updates.push(setSessionAutoScene(session, autoSceneRef.current));
    }
    await Promise.all(updates);
  }, []);
  const pendingCreationRef = useRef<PendingCreation | null>(null);
  // A picker change is provisional until the core publishes its durable correlated receipt.
  const pendingPolicyRequestsRef = useRef<Map<string, PendingPolicyRequest>>(
    new Map(),
  );
  const pendingPolicyBySessionRef = useRef<Map<string, string>>(new Map());
  // Preserve a policy event that races a list refresh; the event is newer than that request's
  // snapshot and must remain the authoritative rail/session projection.
  const authoritativePoliciesRef = useRef<Map<string, ExecutionPolicy>>(
    new Map(),
  );
  const policyVersionsRef = useRef<Map<string, number>>(new Map());
  // Prompt acknowledgements are broadcast to every client. Only the exact request initiated by
  // this window may clear its editor draft.
  const pendingPromptRequestsRef = useRef<Map<string, PendingPromptRequest>>(
    new Map(),
  );
  // TurnStarted consumes the pending entry, but a provider may reject images asynchronously after
  // the Composer has already cleared. Keep immutable refs until the terminal event so retry can
  // duplicate them without recovering a mutable draft.
  const acceptedCanvasRequestsRef = useRef<Map<string, PendingPromptRequest>>(
    new Map(),
  );
  // A provider picker selection after an asynchronous Canvas image rejection stages the retry in
  // a fresh session; an existing ACP session keeps its original provider for its lifetime.
  const canvasProviderRetrySessionRef = useRef<string | null>(null);
  const forceNewSessionForCanvasRetryRef = useRef(false);
  // Only session/new calls initiated by this window may take over its active conversation. A
  // remote client can create sessions on the same engine without stealing desktop focus.
  const awaitingSessionRef = useRef<string | null>(null);
  const transcriptNextBeforeRef = useRef<number | null>(null);
  const earlierLoadRef = useRef(false);
  const earlierLoadSeqRef = useRef(0);
  // Monotonic request id: a slow transcript response for A can never overwrite B after a rapid
  // session switch.
  const sessionLoadSeq = useRef(0);
  const runningSessionsRef = useRef(runningSessions);
  const sessionActivitiesRef = useRef<Map<string, SessionActivity>>(new Map());
  // A null value means an authoritative TurnStarted arrived without a correlation id. Presence in
  // the map still matters: a later rejection for some local request must not stop that foreign turn.
  const runningPromptRequestsRef = useRef<Map<string, string | null>>(
    new Map(),
  );
  const latestTurnRequestIdsRef = useRef<Map<string, string>>(new Map());
  const turnStartVersionsRef = useRef<Map<string, number>>(new Map());
  const gitRefreshSeq = useRef(0);
  const checkpointRefreshSeq = useRef(0);

  const finishPolicyRequest = useCallback(
    (requestId: string): PendingPolicyRequest | null => {
    const pending = pendingPolicyRequestsRef.current.get(requestId);
    if (!pending) return null;
    pendingPolicyRequestsRef.current.delete(requestId);
      if (
        pendingPolicyBySessionRef.current.get(pending.session) === requestId
      ) {
      pendingPolicyBySessionRef.current.delete(pending.session);
      setPendingPolicySessions((current) => {
        if (!current.has(pending.session)) return current;
        const next = new Set(current);
        next.delete(pending.session);
        return next;
      });
    }
    return pending;
    },
    [],
  );

  const applyAuthoritativeExecutionPolicy = useCallback(
    (session: string, policy: ExecutionPolicy) => {
      authoritativePoliciesRef.current.set(session, policy);
      policyVersionsRef.current.set(
        session,
        (policyVersionsRef.current.get(session) ?? 0) + 1,
      );
      // If another client wins while our request is in flight, a later local rejection restores
      // this newest acknowledged value, not the value that preceded the remote change.
      for (const pending of pendingPolicyRequestsRef.current.values()) {
        if (pending.session === session) pending.authoritative = policy;
      }
      setSessions((current) =>
        withSessionExecutionPolicy(current, session, policy),
      );
      setArchivedSessions((current) =>
        withSessionExecutionPolicy(current, session, policy),
      );
      if (activeSessionRef.current === session) {
        setMode(policy.mode);
        setSandboxState(policy.sandbox);
      }
    },
    [],
  );

  const restoreRejectedExecutionPolicy = useCallback(
    (pending: PendingPolicyRequest) => {
    if (activeSessionRef.current !== pending.session) return;
    setMode(pending.authoritative.mode);
    setSandboxState(pending.authoritative.sandbox);
    },
    [],
  );

  // Refs are updated before React schedules the render so transcript promises always see the same
  // running truth as the event handler that just mutated it.
  const updateRunningSession = useCallback(
    (session: string, isRunning: boolean) => {
      const next = withRunningSession(
        runningSessionsRef.current,
        session,
        isRunning,
      );
    runningSessionsRef.current = next;
    setRunningSessions(next);
    },
    [],
  );

  const updateTranscriptCursor = useCallback((nextBefore: number | null) => {
    transcriptNextBeforeRef.current = nextBefore;
    setTranscriptNextBefore(nextBefore);
  }, []);

  const markSessionStarted = useCallback(
    (session: string, requestId?: string | null) => {
      runningPromptRequestsRef.current.set(session, requestId ?? null);
      if (requestId) {
        latestTurnRequestIdsRef.current.set(session, requestId);
      } else {
        latestTurnRequestIdsRef.current.delete(session);
      }
      turnStartVersionsRef.current.set(
        session,
        (turnStartVersionsRef.current.get(session) ?? 0) + 1,
      );
      updateRunningSession(session, true);
    },
    [updateRunningSession],
  );

  const markSessionStopped = useCallback(
    (session: string, requestId?: string | null): boolean => {
      const current = runningPromptRequestsRef.current.get(session);
      if (
        requestId &&
        runningPromptRequestsRef.current.has(session) &&
        requestId !== current
      ) {
        return false;
      }
      runningPromptRequestsRef.current.delete(session);
      updateRunningSession(session, false);
      return true;
    },
    [updateRunningSession],
  );

  // ---- R10 dock follow ----
  useEffect(() => {
    dockTabRef.current = dockTab;
    if (dockTab !== null) setSideChatOpen(false);
  }, [dockTab]);

  useEffect(() => {
    terminalOpenRef.current = terminalOpen;
  }, [terminalOpen]);

  /** The one dock-follow chokepoint: reduce, apply an emitted switch, mirror the badge hint. */
  const followDockEvent = useCallback((event: FollowEvent) => {
    const { state, setTab } = followReduce(dockFollowRef.current, event);
    dockFollowRef.current = state;
    if (setTab === "terminal") {
      terminalOpenRef.current = true;
      setTerminalOpen(true);
    } else if (setTab) {
      setDockTab(setTab);
    }
    if (event.kind === "tool") {
      setDockAutoHint(
        state.autoTab
          ? {
              surface: state.autoTab,
              file:
                state.autoTab === event.hint.surface
                  ? event.hint.file
                  : undefined,
            }
          : null,
      );
    } else {
      setDockAutoHint(null);
    }
  }, []);

  /** The event ladder's single follow call: classify the active session's tool call and feed the
   *  reducer. Auto-follow never opens a closed dock — the reducer only records the surface then. */
  const handleDockFollow = useCallback(
    (ev: Extract<CoreEvent, { event: "tool_call" }>) => {
      const hint = classifyToolSurface({
        kind: ev.kind ?? null,
        title: ev.title,
        agentInput: ev.agent_input,
      });
      if (!hint) return;
      followDockEvent({
        kind: "tool",
        hint,
        now: Date.now(),
        dockOpen: dockTabRef.current !== null || terminalOpenRef.current,
      });
    },
    [followDockEvent],
  );

  /** Every user-driven dock change routes here so auto-follow latches off until the run ends. */
  const manualDockTab = useCallback(
    (tab: DockTab | null) => {
      followDockEvent({ kind: "manual", tab });
      setDockTab(tab);
    },
    [followDockEvent],
  );

  const manualTerminalOpen = useCallback(
    (open: boolean) => {
      followDockEvent({ kind: "manual", tab: open ? "terminal" : null });
      terminalOpenRef.current = open;
      setTerminalOpen(open);
    },
    [followDockEvent],
  );

  /** Restore immutable accepted Canvas refs after a terminal provider-image rejection.  The
   * original Composer heads may already have been cleared/purged, so each retry gets a new draft
   * id and an explicit error affordance; choosing structure-only remains a user action. */
  const restoreAcceptedCanvasForProviderError = useCallback(
    async (session: string, request: PendingPromptRequest, message: string) => {
      const refs = canvasRetryRefsForTerminal(
        "error",
        message,
        request.canvasRefs,
      );
      if (refs.length === 0) return;
      if (!restoreCanvasDocumentRef.current) {
        throw new Error("Composer retry surface is unavailable");
      }
      const restored: CanvasDraft[] = [];
      try {
        for (const ref of refs)
          restored.push(await canvasDuplicate(ref.id, ref.revision));
      } catch (error) {
        // A failed duplicate must not leave an invisible mutable head behind. Immutable history
        // remains owned by core; only the newly created retry heads are tombstoned and purged.
        await Promise.all(
          restored.map(async (draft) => {
            try {
              await canvasTombstone(draft.id);
              await canvasPurge(draft.id);
            } catch {
              /* Best effort cleanup; the primary duplicate failure remains user-visible. */
            }
          }),
        );
        throw error;
      }
      const replacements = new Map(
        refs.map((ref, index) => [
        ref.id,
        { id: restored[index]!.id, revision: restored[index]!.revision },
        ]),
      );
      const retryDoc = canvasRetryDocument(request.submittedDoc, replacements);
      const restoredDrafts = new Map(
        restored.map((draft) => [draft.id, draft]),
      );
      for (const draft of restored) {
        canvasDraftsRef.current.set(draft.id, draft);
        canvasAssetsRef.current.set(
          draft.id,
          new Map(draft.assets.map((asset) => [asset.id, asset])),
        );
      }
      restoreCanvasDocumentRef.current(retryDoc, restoredDrafts, {
        deliveryError: message,
        deliveryErrorKind: "provider_image",
      });
      canvasProviderRetrySessionRef.current = session;
      toast(
        "Canvas images are unsupported by this provider. Choose Send structure only in each restored Canvas, or switch provider to stage a new-session retry.",
        "error",
      );
    },
    [toast],
  );

  const invalidatePendingCreation = useCallback(() => {
    const pending = pendingCreationRef.current;
    awaitingSessionRef.current = null;
    pendingCreationRef.current = null;
    setPendingSessionRunning(false);
    if (pending) {
      setTurns((turns) =>
        withoutUnacceptedTurn(turns, pending.promptRequestId),
      );
    }
  }, []);

  const handleEditorEmptyChange = useCallback((empty: boolean) => {
    editorRevisionRef.current += 1;
    setDocEmpty(empty);
  }, []);

  // BlockNote bakes its dictionary in at creation, so the placeholder only changes language on a
  // remount — and a remount discards whatever is in the document. Wait for the document to be empty
  // before taking the change: then a remount costs nothing, and a draft is never traded for a
  // placeholder. If the language changes mid-draft this simply defers until the draft is gone.
  const [editorKey, setEditorKey] = useState(0);
  const mountedLocale = useRef(locale);
  useEffect(() => {
    if (mountedLocale.current === locale || !docEmpty) return;
    mountedLocale.current = locale;
    setEditorKey((k) => k + 1);
  }, [locale, docEmpty]);

  const refreshSessions = useCallback(async () => {
    const policyVersionsAtStart = new Map(policyVersionsRef.current);
    try {
      const [active, archived, nextPreviews] = await Promise.all([
        listSessions(),
        listArchivedSessions(),
        sessionPreviews(),
      ]);
      const allIncoming = [...active, ...archived];
      const hasAuthoritativeActivity = allIncoming.some(
        (session) => session.activity !== undefined,
      );
      const merge = (items: SessionInfo[]) =>
        items.map((session) => {
          let next = session;
          if (hasAuthoritativeActivity) {
            const activity = latestActivity(
              sessionActivitiesRef.current.get(session.id),
              session.activity,
            );
            sessionActivitiesRef.current.set(session.id, activity);
            next = { ...next, activity };
          }

          const versionAtStart = policyVersionsAtStart.get(session.id) ?? 0;
          const currentVersion = policyVersionsRef.current.get(session.id) ?? 0;
          const eventPolicy = authoritativePoliciesRef.current.get(session.id);
          if (currentVersion !== versionAtStart && eventPolicy) {
            return {
              ...next,
              permission_mode: eventPolicy.mode,
              sandbox_policy: eventPolicy.sandbox,
            };
          }
          authoritativePoliciesRef.current.set(session.id, {
            mode: next.permission_mode,
            sandbox: next.sandbox_policy,
          });
          return next;
        });
      const nextActive = merge(active);
      const nextArchived = merge(archived);
      setSessions(nextActive);
      setArchivedSessions(nextArchived);
      setPreviews(nextPreviews);

      const all = [...nextActive, ...nextArchived];
      if (hasAuthoritativeActivity) {
        const busy = new Set(
          all
            .filter((session) => activityIsBusy(session.activity))
            .map((session) => session.id),
        );
        // A locally submitted draft remains optimistic until the core publishes its first
        // activity revision / TurnStarted; a concurrent stale list read cannot undo that shell.
        for (const session of pendingPromptRequestsRef.current.keys())
          busy.add(session);
        runningSessionsRef.current = busy;
        setRunningSessions(busy);
        setPermissionQueue(permissionsFromSessions(all));
      }
      return all;
    } catch (error) {
      // Preserve the last good rail. Returning null distinguishes failure from an authoritative
      // empty list, and the visible error prevents stale session state masquerading as success.
      console.error("Could not refresh sessions", error);
      toast(t("toast.sessionLoadFailed", { error: String(error) }), "error");
      return null;
    }
  }, [t, toast]);

  const refreshProjects = useCallback(() => {
    const seq = ++projectLoadSeqRef.current;
    const mutationVersion = projectMutationVersionRef.current;
    listProjects()
      .then((items) => {
        if (
          seq === projectLoadSeqRef.current &&
          mutationVersion === projectMutationVersionRef.current
        ) {
          setProjects(items);
        }
      })
      .catch(() => {});
  }, []);

  const updateProjectWorktreeMode = useCallback(
    async (path: string, nextMode: ProjectWorktreeMode | null) => {
      const patchMode =
        (mode: ProjectWorktreeMode | null) => (items: Project[]) =>
        items.map((project) =>
            project.path === path
              ? { ...project, default_worktree_mode: mode }
              : project,
        );

      projectMutationVersionRef.current += 1;
      try {
        await setProjectWorktreeMode(path, nextMode);
        projectMutationVersionRef.current += 1;
        // A project default seeds future drafts. It must not overwrite an explicit choice in the
        // current Composer while Settings is open or while this native write is in flight.
        setProjects(patchMode(nextMode));
      } catch (error) {
        projectMutationVersionRef.current += 1;
        toast(
          t("toast.projectDefaultFailed", { error: String(error) }),
          "error",
        );
      }
    },
    [t, toast],
  );

  /** Switch projects: the working directory, the conversation list and the git section all follow. */
  const selectProject = useCallback(
    (path: string) => {
      // Re-clicking the current project is still an explicit navigation choice: a late creation
      // request must not take focus or submit the draft it captured before that choice.
      invalidatePendingCreation();
      setCallProjectPath(normalizePluginProjectPath(path));
      setActiveProject(path);
      setCwd(path);
      const project = projects.find((item) => item.path === path);
      setWorktreeBase(
        projectSwitchWorktreeBaseline(project?.default_worktree_mode ?? null),
      );
      // Selecting a project always opens a blank source-checkout draft, including a re-click of the
      // current project. Keeping an active worktree session while `cwd` switches to the source would
      // make file/Git/terminal surfaces show one checkout while the agent keeps editing another.
      sessionLoadSeq.current += 1;
      setSessionLoading(false);
      activeProjectRef.current = path;
      activeSessionRef.current = null;
      activeSessionProvenanceRef.current = null;
      setActiveSessionReceipt(null);
      setActiveSession(null);
      // A project opens a normal Task draft. Its Task record is created from the first prompt;
      // only the explicit Temporary session action opts out.
      setTaskContext(null, false);
      setTurns([]);
      setModels([]);
      setCurrentModel(null);
      setDefaultModel(null);
      setConfigOptions([]);
      memoryReadRef.current = "inherit";
      memoryWriteRef.current = "inherit";
      memoryReceiptsRef.current = [];
      setMemoryRead("inherit");
      setMemoryWrite("inherit");
      void openProject(path).then(refreshProjects);
    },
    [invalidatePendingCreation, projects, refreshProjects, setTaskContext],
  );

  const addProjectFolder = useCallback(async () => {
    const picked = await pickDirectory();
    if (!picked) return; // cancelled — a normal outcome, not an error
    try {
      const resolved = await addProject(picked);
      refreshProjects();
      selectProject(resolved);
    } catch (e) {
      toast(t("toast.projectFailed", { error: String(e) }), "error");
    }
  }, [refreshProjects, selectProject, toast]);

  const activeSessionTitle = useMemo(
    () =>
      (
        sessions.find((s) => s.id === activeSession) ??
        archivedSessions.find((s) => s.id === activeSession)
      )?.title ?? null,
    [sessions, archivedSessions, activeSession],
  );
  const activeTitle = activeBoardTask?.title
    ?? activeSessionTitle
    ?? t(temporarySession ? "rail.newTemporarySession" : "rail.newTask");

  // An archived chat is read-only: browsing it is fine, continuing it is not. The composer steps
  // aside for a notice until the session is restored.
  const activeArchived = useMemo(
    () => archivedSessions.some((s) => s.id === activeSession),
    [archivedSessions, activeSession],
  );

  const activeWorktreeState = useMemo(() => {
      const stored =
        sessions.find((session) => session.id === activeSession) ??
        archivedSessions.find((session) => session.id === activeSession);
    return activeSessionWorktreeState(
      activeSession,
      stored,
      activeSessionReceipt,
  );
  }, [sessions, archivedSessions, activeSession, activeSessionReceipt]);
  const activeWorktreeBaseline = activeWorktreeState.baseline;
  const activeWorktreeUnknown = activeWorktreeState.legacyUnknown;

  // The title bar's project badge — the workspace this session lives in, at a glance.
  const activeProjectName = useMemo(
    () => projects.find((p) => p.path === activeProject)?.name ?? null,
    [projects, activeProject],
  );

  const taskBoardSessions = useMemo(
    () =>
      [
        ...sessions.map((session) => ({
          id: session.id,
          title: session.title,
          archived: false,
        })),
        ...archivedSessions.map((session) => ({
          id: session.id,
          title: session.title,
          archived: true,
        })),
      ],
    [archivedSessions, sessions],
  );

  const quickQuotaProvider = useMemo(() => {
    const focused = [...sessions, ...archivedSessions].find(
      (session) => session.id === activeSession,
    );
    return quickQuotaProviderFor(
      providerLabel(provider),
      focused ? providerLabel(focused.provider) : null,
      sessions.map((session) => providerLabel(session.provider)),
    );
  }, [activeSession, archivedSessions, provider, sessions]);
  const quickQuotaProviderName =
    providers.find((candidate) => candidate.id === quickQuotaProvider)
      ?.display_name ?? quickQuotaProvider;
  const railQuickQuota = useMemo(
    () => quickQuotaSummary(quickQuotaReport),
    [quickQuotaReport],
  );

  const refreshQuickQuota = useCallback(() => {
    const request = ++quickQuotaRequestRef.current;
    setQuickQuotaLoading(true);
    void providerQuota(quickQuotaProvider)
      .then((report) => {
        if (request === quickQuotaRequestRef.current)
          setQuickQuotaReport(report);
      })
      .catch(() => {
        if (request === quickQuotaRequestRef.current) setQuickQuotaReport(null);
      })
      .finally(() => {
        if (request === quickQuotaRequestRef.current)
          setQuickQuotaLoading(false);
      });
  }, [quickQuotaProvider]);

  useEffect(() => {
    setQuickQuotaReport(null);
    refreshQuickQuota();
    const interval = window.setInterval(refreshQuickQuota, 5 * 60_000);
    window.addEventListener("focus", refreshQuickQuota);
    return () => {
      quickQuotaRequestRef.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshQuickQuota);
    };
  }, [refreshQuickQuota]);

  // Sessions store a provider id; show the registry's display name where we have one.
  const displayProvider = useCallback(
    (p: SessionInfo["provider"]) => {
      const id = providerLabel(p);
      return providers.find((x) => x.id === id)?.display_name ?? id;
    },
    [providers],
  );

  // Track whether the user has hand-picked a provider; until then we auto-pick an available one.
  const providerPinned = useRef(false);

  const refreshProviders = useCallback(() => {
    const request = ++providerRegistryRequestRef.current;
    setProvidersStatus("loading");
    void loadProviderRegistry(listProviders)
      .then((list) => {
        if (request !== providerRegistryRequestRef.current) return;
        setProviders(list);
        setProvidersStatus("ready");
        // Default to a provider whose CLI is actually installed. Shipping `grok` as the default
        // meant a machine without it failed on the first session with a raw spawn error.
        if (!providerPinned.current) {
          setProvider((current) => {
            const selected = list.find((candidate) => candidate.id === current);
            return selected?.available
              ? current
              : (list.find((candidate) => candidate.available)?.id ?? current);
          });
        }
      })
      .catch((error) => {
        if (request !== providerRegistryRequestRef.current) return;
        console.error("Could not load the provider registry", error);
        setProvidersStatus("error");
      });
  }, []);

  useEffect(() => {
    refreshProviders();
    return () => {
      providerRegistryRequestRef.current += 1;
    };
  }, [refreshProviders]);

  useEffect(() => {
    const activity = onBrowserAgentActivity(() => {
      setDockTab("browser");
      setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    });
    const downloads = onBrowserDownloadBlocked(() => {
      toast(
        "Download blocked. Approve it from the agent request or take control of the tab.",
        "error",
      );
    });
    return () => {
      void activity.then((unlisten) => unlisten());
      void downloads.then((unlisten) => unlisten());
    };
  }, [toast]);

  useEffect(() => {
    refreshSessions();

    let unlisten: (() => void) | null = null;
    void (async () => {
      unlisten = await onEngineEvent((ev: CoreEvent) => {
        if (ev.event === "session_created") {
          const refreshed = refreshSessions();
          if (!matchesSessionCreation(ev, awaitingSessionRef.current)) return;
          awaitingSessionRef.current = null;
          sessionLoadSeq.current += 1;
          setSessionLoading(false);
          activeSessionRef.current = ev.session;
          knownModelsRef.current.delete(ev.session);
          const receipt = sessionCreationReceipt(ev);
          const provenance = receipt
            ? { session: ev.session, shell: receipt }
            : null;
          activeSessionProvenanceRef.current = provenance;
          setActiveSessionReceipt(provenance);
          setActiveSession(ev.session);
          {
            const stagedTask = activeBoardTaskRef.current;
            if (stagedTask) {
              const board = loadBoardSnapshot();
              const associated = associateTaskSession(
                board.tasks,
                stagedTask.id,
                ev.session,
              );
              if (associated) {
                const saved = saveBoardSnapshot(associated);
                if (saved.ok) {
                  const task = associated.find((candidate) => candidate.id === stagedTask.id) ?? null;
                  setTaskContext(task, false);
                } else {
                  // The Session exists, but the durable association does not. Keep the UI honest
                  // instead of leaving the staged Task title visible as if persistence succeeded.
                  setTaskContext(null, true);
                  toast(saved.warning, "error");
                }
              } else {
                // The Task was deleted from another board view while this draft was open. Keep the
                // new Session usable, but never claim that its missing Task association succeeded.
                setTaskContext(null, true);
                toast("任务已不存在，本次会话已转为临时会话。", "error");
              }
            }
          }
          autoSceneBySessionRef.current.set(ev.session, autoSceneRef.current);
          {
            // Delegation trail: the delegated draft just became a real session.
            const delegation = pendingDelegationRef.current;
            if (delegation !== null) {
              pendingDelegationRef.current = null;
              void setIssueDelegationSession(delegation, ev.session);
            }
          }
          {
            // Advance-in-new-session handshake: bind the created session to its pipeline stage.
            const bind = pendingPipelineBindRef.current;
            if (bind) {
              pendingPipelineBindRef.current = null;
              if (componentEnabledRef.current("scenes.surface")) {
                void bindPipelineSession(
                  bind.instanceId,
                  bind.stageId,
                  ev.session,
                ).then(async () => {
                    if (!componentEnabledRef.current("scenes.surface")) return;
                    const detail = await getPipelineInstance(bind.instanceId);
                    if (
                      componentEnabledRef.current("scenes.surface") &&
                      activeSessionRef.current === ev.session
                    ) {
                      setPipelineDetail(detail);
                    }
                });
              }
            }
          }
          {
            // Full-apply handshake: bind the staged scene to the session the moment it exists.
            const pendingScene = pendingSceneRef.current;
            if (pendingScene) {
              pendingSceneRef.current = null;
              if (!componentEnabledRef.current("scenes.surface")) {
                setActiveSceneName(null);
                setScenePendingFields([]);
              } else {
                sceneBySessionRef.current.set(ev.session, pendingScene);
                void setSessionScene(ev.session, pendingScene, false);
                const scene = scenesRef.current.find(
                  (s) => s.reference === pendingScene,
                );
                if (scene?.execution?.model) {
                  void setSessionModel(ev.session, scene.execution.model);
                }
                setActiveSceneName(pendingScene);
                // Reasoning effort has no provider-stable config id before the session reports
                // its options, so it stays pending even after a full apply.
                setScenePendingFields(
                  scene?.execution?.reasoning_effort
                    ? ["reasoning_effort"]
                    : [],
                );
              }
            } else {
              setActiveSceneName(
                sceneBySessionRef.current.get(ev.session) ?? null,
              );
              setScenePendingFields([]);
            }
          }
          memoryReceiptsRef.current = [];
          // The creation event carries the cwd that was persisted before publication. File, Git,
          // terminal and hook surfaces switch with the active id even if a best-effort list/preview
          // refresh fails independently. Older event producers fall back to the list shell.
          if (ev.cwd) setCwd(ev.cwd);
          void refreshed.then((items) => {
            if (!items || activeSessionRef.current !== ev.session) return;
            const created = items.find((session) => session.id === ev.session);
            if (!created) return;
            if (!ev.cwd) setCwd(created.cwd);
            if (activeSessionProvenanceRef.current?.session !== ev.session) {
              const provenance = { session: ev.session, shell: created };
              activeSessionProvenanceRef.current = provenance;
              setActiveSessionReceipt(provenance);
            }
          });
          if (pendingCreationRef.current) {
            const pending = pendingCreationRef.current;
            pendingCreationRef.current = null;
            forceNewSessionForCanvasRetryRef.current = false;
            setPendingSessionRunning(false);
            updateRunningSession(ev.session, true);
            pendingPromptRequestsRef.current.set(ev.session, {
              requestId: pending.promptRequestId,
              editorSnapshot: pending.editorSnapshot,
              editorRevision: pending.editorRevision,
              submittedDoc: pending.canvasRetryDoc,
              canvasIds: pending.doc.flatMap((block) =>
                block.type === "canvas" ? [block.id] : [],
              ),
              canvasRefs: pending.doc.flatMap((block) =>
                block.type === "canvas"
                ? [{ id: block.id, revision: block.frozen_revision }]
                  : [],
              ),
            });
            void initializePluginSessionState(ev.session)
              .then(() =>
                submitPrompt(ev.session, pending.doc, pending.promptRequestId),
              )
              .then(() => {
                refreshSessions();
              })
              .catch((error) => {
                if (
                  pendingPromptRequestsRef.current.get(ev.session)
                    ?.requestId === pending.promptRequestId
                ) {
                  pendingPromptRequestsRef.current.delete(ev.session);
                }
                markSessionStopped(ev.session, pending.promptRequestId);
                const message = String(error);
                if (activeSessionRef.current === ev.session) {
                  setTurns((previous) =>
                    applyEvent(previous, {
                      event: "error",
                      session: ev.session,
                      message,
                      terminal: true,
                      request_id: pending.promptRequestId,
                    }),
                  );
                }
                if (isCanvasProviderImageError(message)) {
                  canvasDeliveryErrorRef.current?.(
                    pending.doc,
                    message,
                    "provider_image",
                  );
                  toast(
                    "Canvas images are unsupported by this provider. Choose Send structure only in each Canvas or switch provider, then retry.",
                    "error",
                  );
                } else {
                  toast(t("toast.turnFailed", { error: message }), "error");
                }
              });
          } else {
            void initializePluginSessionState(ev.session)
              .then(refreshSessions)
              .catch((error) => toast(String(error), "error"));
          }
          return;
        }
        if (ev.event === "session_title_changed") {
          const rename = (items: SessionInfo[]) =>
            items.map((session) =>
              session.id === ev.session
                ? {
                    ...session,
                    title: ev.title,
                    title_origin: "automatic" as const,
                  }
                : session,
            );
          setSessions(rename);
          setArchivedSessions(rename);
          return;
        }
        if (ev.event === "worktree_discarded") {
          // Mark the row immediately — the checkout is already gone — and let the list refresh
          // reconcile whatever else the discard changed (a deleted branch, a dropped stale row).
          const markDiscarded = (items: SessionInfo[]) =>
            items.map((session) =>
              session.id === ev.session
                ? { ...session, worktree_discarded: true }
                : session,
            );
          setSessions(markDiscarded);
          setArchivedSessions(markDiscarded);
          refreshSessions();
          toast(t("toast.worktreeDiscarded"), "success");
          return;
        }
        if (ev.event === "session_activity_changed") {
          const current = sessionActivitiesRef.current.get(ev.session);
          if (current && ev.activity.revision < current.revision) return;
          sessionActivitiesRef.current.set(ev.session, ev.activity);
          const applyActivity = (items: SessionInfo[]) =>
            items.map((session) =>
              session.id === ev.session
                ? { ...session, activity: ev.activity }
                : session,
            );
          setSessions(applyActivity);
          setArchivedSessions(applyActivity);
          updateRunningSession(ev.session, activityIsBusy(ev.activity));
          // R10: only a finished run (idle | failed) releases the manual dock latch —
          // `awaiting_input` counts as busy, so it deliberately keeps it.
          if (
            ev.session === activeSessionRef.current &&
            !activityIsBusy(ev.activity)
          ) {
            followDockEvent({ kind: "run_ended" });
          }

          setPermissionQueue((previous) =>
            permissionQueueAfterActivity(previous, ev.session, ev.activity),
          );
          return;
        }
        if (ev.event === "context_window") {
          if (pendingModelChangesRef.current.has(ev.session)) return;
          // This is deliberately handled before transcript projection: a context update is
          // session state, never a persisted/rendered transcript part.
          setContextWindows((previous) => updateContextWindow(previous, ev));
          return;
        }
        if (
          ev.event === "exit_criteria_met" ||
          ev.event === "hook_suggestion" ||
          ev.event === "test_signal" ||
          ev.event === "artifact_produced" ||
          ev.event === "hook_turn_started" ||
          ev.event === "session_cost"
        ) {
          // Scene-layer facts (R8) are session state, never transcript parts. Only the two
          // banner-worthy ones render; the rest are consumed by the core's SceneRuntime.
          if (
            (ev.event === "exit_criteria_met" ||
              ev.event === "hook_suggestion") &&
            ev.session === activeSessionRef.current &&
            componentEnabledRef.current("scenes.surface")
          ) {
            const banner = sceneBannerFromEvent(ev);
            if (banner) setSceneBanner(banner);
          }
          return;
        }
        if (ev.event === "models") {
          const known = knownModelsRef.current.get(ev.session);
          const pending = pendingModelChangesRef.current.has(ev.session);
          if (
            ev.current &&
            (pending || (known !== undefined && ev.current !== known))
          ) {
            setContextWindows((previous) =>
              clearContextWindow(previous, ev.session),
            );
          }
          if (ev.current) {
            knownModelsRef.current.set(ev.session, ev.current);
            pendingModelChangesRef.current.delete(ev.session);
          }
          if (ev.session !== activeSessionRef.current) return;
          // A switch echoes back the same list; only session/new carries a fresh one.
          if (ev.available.length > 0) setModels(ev.available);
          setCurrentModel(ev.current || null);
          setDefaultModel((prev) => prev ?? (ev.current || null));
          return;
        }
        if (ev.event === "config_options") {
          const model = ev.options.find(
            (o) => o.category === "model" || o.id === "model",
          );
          if (model?.current) {
            const known = knownModelsRef.current.get(ev.session);
            const pending = pendingModelChangesRef.current.has(ev.session);
            if (pending || (known !== undefined && model.current !== known)) {
              setContextWindows((previous) =>
                clearContextWindow(previous, ev.session),
              );
            }
            knownModelsRef.current.set(ev.session, model.current);
            pendingModelChangesRef.current.delete(ev.session);
          }
          if (ev.session !== activeSessionRef.current) return;
          // The agent's set is authoritative — it replaces any optimistic UI state wholesale.
          setConfigOptions(ev.options);
          if (model?.current) {
            setCurrentModel(model.current);
            // Same rule as `models`: the first report after a reset is the adapter's own pick.
            setDefaultModel((prev) => prev ?? model.current);
          }
          {
            // The scene's reasoning_effort had to pend until the provider named its effort
            // option (binding matrix); the first matching report applies it, once per session.
            const scene = scenesRef.current.find(
              (s) => s.reference === activeSceneNameRef.current,
            );
            const wanted = scene?.execution?.reasoning_effort;
            if (wanted && !sceneEffortAppliedRef.current.has(ev.session)) {
              const choice = sceneEffortChoice(ev.options, wanted);
              if (choice) {
                sceneEffortAppliedRef.current.add(ev.session);
                void setConfigOption(ev.session, choice.configId, choice.value)
                  .then(() => {
                    setScenePendingFields((prev) =>
                      prev.filter((field) => field !== "reasoning_effort"),
                    );
                  })
                  .catch(() => {
                    sceneEffortAppliedRef.current.delete(ev.session);
                  });
              }
            }
          }
          return;
        }
        if (ev.event === "execution_policy_changed") {
          if (ev.request_id) finishPolicyRequest(ev.request_id);
          applyAuthoritativeExecutionPolicy(ev.session, ev.policy);
          return;
        }
        if (ev.event === "error" && ev.request_id) {
          const rejectedPolicy = finishPolicyRequest(ev.request_id);
          if (rejectedPolicy) {
            restoreRejectedExecutionPolicy(rejectedPolicy);
            toast(`Could not update execution policy: ${ev.message}`, "error");
            return;
          }
        }
        if (ev.event === "permission_request") {
          const request = {
            session: ev.session,
            requestId: ev.request_id,
            title: ev.title,
            options: ev.options,
            context: ev.context,
          };
          setPermissionQueue((previous) =>
            enqueuePermission(previous, request),
          );
          return;
        }
        if (ev.event === "elicitation_request") {
          // A question joins the same queue as permissions: one agent, one blocked turn, one
          // dialog at a time. `form` is what makes it render as a question instead of an approval.
          setPermissionQueue((previous) =>
            enqueuePermission(previous, {
              session: ev.session,
              requestId: ev.request_id,
              title: ev.form.message,
              options: [],
              form: ev.form,
            }),
          );
          return;
        }
        if (ev.event === "turn_started") {
          markSessionStarted(ev.session, ev.request_id);
          const pendingRequest = pendingPromptRequestsRef.current.get(
            ev.session,
          );
          if (pendingRequest && ev.request_id === pendingRequest.requestId) {
            pendingPromptRequestsRef.current.delete(ev.session);
            if (canvasProviderRetrySessionRef.current === ev.session) {
              // An explicit structure-only retry was accepted in the original session; do not
              // force a later unrelated provider selection into a new session.
              canvasProviderRetrySessionRef.current = null;
            }
            if (pendingRequest.canvasRefs.length > 0) {
              acceptedCanvasRequestsRef.current.set(
                `${ev.session}:${pendingRequest.requestId}`,
                pendingRequest,
              );
            }
            const currentEditor = getBlocksRef.current?.();
            if (
              currentEditor &&
              matchesSubmittedEditorRevision(
                currentEditor,
                editorRevisionRef.current,
                pendingRequest.editorSnapshot,
                pendingRequest.editorRevision,
              )
            ) {
              // Core acceptance makes the frozen revision immutable history. Mark the mutable
              // Composer heads only when the submitted editor is still unchanged and we are
              // about to clear it; otherwise a later ordinary delete must remain undoable.
              for (const id of canvasIdsToPurgeAfterTurnStart(
                true,
                pendingRequest.canvasIds,
              )) {
                canvasPurgeRequestedRef.current.add(id);
              }
              clearEditorRef.current?.();
            }
          }
        }
        const awaitingCreationRequest = awaitingSessionRef.current;
        const eventSession = ev.session;
        // Capture before a terminal event clears the authoritative running request. Deltas do not
        // carry request ids themselves, so this is how a transcript load that began after
        // TurnStarted still assigns them to the correct live turn.
        const activeTurnRequestId = eventSession
          ? runningPromptRequestsRef.current.get(eventSession)
          : undefined;
        if (
          ev.event === "error" &&
          eventSession &&
          ev.request_id != null &&
          pendingPromptRequestsRef.current.get(eventSession)?.requestId ===
            ev.request_id
        ) {
          // No matching TurnStarted arrived, so the core did not durably accept this draft.
          pendingPromptRequestsRef.current.delete(eventSession);
        }
        const ended = isTerminalSessionEvent(ev);
        if (ended) {
          if (eventSession) {
            const terminalRequestId =
              ev.event === "error"
              ? (ev.request_id ?? activeTurnRequestId)
              : activeTurnRequestId;
            if (terminalRequestId) {
              const acceptedKey = canvasAcceptedRequestKey(
                eventSession,
                terminalRequestId,
              );
              const acceptedCanvasRequest =
                acceptedCanvasRequestsRef.current.get(acceptedKey);
              if (acceptedCanvasRequest) {
                acceptedCanvasRequestsRef.current.delete(acceptedKey);
                if (
                  ev.event === "error" &&
                  isCanvasProviderImageError(ev.message)
                ) {
                  void restoreAcceptedCanvasForProviderError(
                    eventSession,
                    acceptedCanvasRequest,
                    ev.message,
                  ).catch((error) => {
                    toast(
                      `Canvas retry could not be staged: ${String(error)}`,
                      "error",
                    );
                  });
                }
              }
            }
            if (markSessionStopped(eventSession, terminalRequestId)) {
              setPermissionQueue((previous) =>
                previous.filter((request) => request.session !== eventSession),
              );
            }
          } else if (
            ev.event === "error" &&
            ev.request_id != null &&
            ev.request_id === awaitingSessionRef.current
          ) {
            invalidatePendingCreation();
          }
          refreshSessions();
        }
        if (
          !shouldRenderSessionEvent(
            ev,
            activeSessionRef.current,
            awaitingCreationRequest,
          )
        )
          return;
        if (ev.event === "tool_call") handleDockFollow(ev);
        setTurns((prev) =>
          applyEvent(prev, ev, activeTurnRequestId ?? undefined),
        );
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [
    applyAuthoritativeExecutionPolicy,
    finishPolicyRequest,
    followDockEvent,
    handleDockFollow,
    initializePluginSessionState,
    invalidatePendingCreation,
    markSessionStarted,
    markSessionStopped,
    refreshSessions,
    restoreAcceptedCanvasForProviderError,
    restoreRejectedExecutionPolicy,
    toast,
    t,
    updateRunningSession,
  ]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void onAutoSceneChanged((event) => {
      if (!componentEnabledRef.current("scenes.surface")) return;
      sceneBySessionRef.current.set(event.session, event.reference);
      autoSceneBySessionRef.current.set(event.session, true);
      if (event.session !== activeSessionRef.current) return;
      setActiveSceneName(event.reference);
      setAutoScene(true);
      setScenePendingFields(event.pending);
      memoryReadRef.current = event.memoryRead;
      memoryWriteRef.current = event.memoryWrite;
      setMemoryRead(event.memoryRead);
      setMemoryWrite(event.memoryWrite);
      if (event.planFirst !== null) setPlanMode(event.planFirst);
      toast(
        t("scene.autoSwitched", { scene: event.title, reason: event.reason }),
        "success",
      );
      void refreshSessions();
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshSessions, setTaskContext, t, toast]);

  // Rendered QA has no desktop event bridge in the Vite shell. This query-controlled fixture is
  // development-only and is replaced at build time, so production never gets a fake default.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const query = new URLSearchParams(window.location.search);
    if (query.get("mockContextWindow") !== "1") return;
    const usedTokens = Number(query.get("used") ?? "53000");
    const contextWindow = Number(query.get("size") ?? "200000");
    if (
      !Number.isSafeInteger(usedTokens) ||
      usedTokens < 0 ||
      !Number.isSafeInteger(contextWindow) ||
      contextWindow <= 0
    ) {
      return;
    }
    const session = query.get("session") || "dev-context-window";
    activeSessionRef.current = session;
    knownModelsRef.current.set(session, "dev-model");
    setActiveSession(session);
    setModels([{ id: "dev-model", name: "Context QA", description: null }]);
    setCurrentModel("dev-model");
    setContextWindows((previous) => ({
      ...previous,
      [session]: { usedTokens, contextWindow },
    }));
  }, []);

  const run = useCallback(async () => {
    if (sessionLoading) {
      toast(t("toast.sessionLoading"));
      return;
    }
    // The banner is the primary gate; this backstop catches the keyboard path (⌘⏎ and friends).
    if (activeArchived) {
      toast(t("archived.notice"));
      return;
    }
    const getBlocks = getBlocksRef.current;
    if (!getBlocks) return;
    const editorSnapshot = getBlocks();
    const editorRevision = editorRevisionRef.current;
    let doc = editorSnapshot;
    // Running an empty document used to no-op in silence, which is indistinguishable from a broken
    // button. Say what's missing and put the caret where the fix goes.
    if (doc.length === 0) {
      toast(t("toast.emptyDoc"));
      focusEditorRef.current?.();
      return;
    }
    if (running) {
      toast(t("toast.alreadyRunning"));
      return;
    }
    const targetSession = canvasRetryTargetSession(
      activeSessionRef.current,
      forceNewSessionForCanvasRetryRef.current,
    );
    const worktreeBaseSha = targetSession
      ? null
      : sessionCreationBaselineSha(
          worktreeBase,
          worktreeOptions,
          worktreeOptionsLoading,
        );
    if (worktreeBaseSha === undefined) {
      toast(
        t(
          worktreeOptionsLoading
            ? "worktree.resolving"
            : "worktree.unavailable",
        ),
        "error",
      );
      return;
    }
    // Freeze every live Canvas before creating the turn or submitting the prompt. The bridge owns
    // validation/export/CAS; any stale draft, missing pixels, or budget/provider failure aborts the
    // send with no optimistic turn left behind.
    try {
      if (freezeCanvasesRef.current) doc = await freezeCanvasesRef.current(doc);
    } catch (error) {
      toast(
        `Canvas could not be frozen: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      return;
    }
    const canvasRetryDoc = doc;
    const canvasIds = doc.flatMap((block) =>
      block.type === "canvas" ? [block.id] : [],
    );
    const canvasRefs = doc.flatMap((block) =>
      block.type === "canvas"
      ? [{ id: block.id, revision: block.frozen_revision }]
        : [],
    );
    // Ordinary blank drafts become Tasks on their first real run. Temporary sessions are the only
    // explicit opt-out, so no durable Session can silently fall through the Task board again.
    if (!targetSession && !activeBoardTaskRef.current && !temporarySessionRef.current) {
      const board = loadBoardSnapshot();
      if (board.warning) toast(board.warning, "error");
      const summary = summarizeDoc(doc).replace(/\s+/g, " ").trim();
      const task = createBoardTask({
        title: summary.slice(0, 72) || "未命名任务",
        status: "todo",
        priority: "none",
        order: board.tasks.filter((candidate) => candidate.status === "todo").length,
      });
      const saved = saveBoardSnapshot([...board.tasks, task]);
      if (!saved.ok) {
        toast(saved.warning, "error");
        return;
      }
      setTaskContext(task, false);
    }
    if (planMode)
      doc = [{ type: "skill", skill_id: "plan-first", params: {} }, ...doc];
    const promptRequestId = globalThis.crypto.randomUUID();
    const creationRequestId = targetSession ? null : promptRequestId;
    if (targetSession) {
      pendingPromptRequestsRef.current.set(targetSession, {
        requestId: promptRequestId,
        editorSnapshot,
        editorRevision,
        submittedDoc: canvasRetryDoc,
        canvasIds,
        canvasRefs,
      });
      updateRunningSession(targetSession, true);
    } else {
      awaitingSessionRef.current = creationRequestId;
      pendingCreationRef.current = {
        doc,
        canvasRetryDoc,
        promptRequestId,
        editorSnapshot,
        editorRevision,
      };
      setPendingSessionRunning(true);
    }
    setTurns((prev) => [...prev, newTurn(summarizeDoc(doc), promptRequestId)]);
    try {
      if (targetSession) {
        if (componentEnabledRef.current("memory.settings")) {
          await setSessionMemoryPolicy(
            targetSession,
            memoryReadRef.current,
            memoryWriteRef.current,
          );
        }
        await submitPrompt(targetSession, doc, promptRequestId);
        refreshSessions();
      } else {
        await newSession(
          provider,
          (activeProjectRef.current ?? cwd) || ".",
          worktreeBase,
          creationRequestId!,
          worktreeBaseSha,
          { mode, sandbox },
          currentModel,
        );
      }
    } catch (e) {
      const message = String(e);
      if (targetSession) {
        if (
          pendingPromptRequestsRef.current.get(targetSession)?.requestId ===
          promptRequestId
        ) {
          pendingPromptRequestsRef.current.delete(targetSession);
        }
        markSessionStopped(targetSession, promptRequestId);
        if (activeSessionRef.current === targetSession) {
          setTurns((previous) =>
            applyEvent(previous, {
              event: "error",
              session: targetSession,
              message,
              terminal: true,
              request_id: promptRequestId,
            }),
          );
        }
      } else {
        const stillOwned = awaitingSessionRef.current === creationRequestId;
        if (!stillOwned) return;
        invalidatePendingCreation();
        setTurns((previous) =>
          applyEvent(previous, {
            event: "error",
            session: null,
            message,
            terminal: true,
            request_id: promptRequestId,
          }),
        );
      }
      if (isCanvasProviderImageError(message)) {
        canvasDeliveryErrorRef.current?.(doc, message, "provider_image");
        toast(
          "Canvas images are unsupported by this provider. Choose Send structure only in each Canvas or switch provider, then retry.",
          "error",
        );
      } else {
        toast(t("toast.turnFailed", { error: message }), "error");
      }
    }
  }, [
    provider,
    cwd,
    worktreeBase,
    worktreeOptions,
    worktreeOptionsLoading,
    mode,
    sandbox,
    currentModel,
    planMode,
    freezeCanvasesRef,
    running,
    toast,
    activeArchived,
    sessionLoading,
    t,
    refreshSessions,
    invalidatePendingCreation,
    markSessionStopped,
    setTaskContext,
    updateRunningSession,
  ]);

  const createSession = useCallback(() => {
    const currentSessionId = activeSessionRef.current;
    const storedSession =
      sessions.find((session) => session.id === currentSessionId) ??
      archivedSessions.find((session) => session.id === currentSessionId);
    const currentSession = sessionShellWithReceipt(
      currentSessionId,
      storedSession,
      activeSessionProvenanceRef.current,
    );
    const source = sessionCreationSource(
      activeProjectRef.current,
      cwd,
      currentSession,
      currentSessionId !== null,
    );
    if (source === null) {
      toast(t("toast.worktreeSourceUnknown"), "error");
      return;
    }

    invalidatePendingCreation();
    setShowTaskBoard(false);
    sessionLoadSeq.current += 1;
    setSessionLoading(false);
    setPendingSessionRunning(false);
    activeSessionRef.current = null;
    activeSessionProvenanceRef.current = null;
    setActiveSessionReceipt(null);
    setActiveSession(null);
    setTurns([]);
    setModels([]);
    setCurrentModel(null);
    setDefaultModel(null);
    setConfigOptions([]);
    memoryReadRef.current = "inherit";
    memoryWriteRef.current = "inherit";
    memoryReceiptsRef.current = [];
    setMemoryRead("inherit");
    setMemoryWrite("inherit");
    // A plain new session starts sceneless; the restart-in-scene flow stages its scene first
    // and keeps it through this reset.
    if (pendingSceneRef.current === null) {
      setActiveSceneName(null);
      setScenePendingFields([]);
    }
    setCwd(source);
    // Pressing New while already on the unsent blank draft is a focus/reset no-op for workspace
    // selection: keep the explicit Composer choice. Leaving a durable session starts a new draft
    // and seeds that draft from the project preference or the prior session's baseline kind.
    if (currentSessionId !== null) {
      const projectMode =
        projects.find((project) => project.path === activeProjectRef.current)
          ?.default_worktree_mode ?? null;
      const baseline = nextSessionWorktreeBaseline(
        projectMode,
        sessionCreationBaseline(currentSession),
      );
      if (baseline !== undefined) setWorktreeBase(baseline);
    }
    // Caret into the document; whichever mode you're in stays yours.
    setTimeout(() => focusEditorRef.current?.(), 0);
    // A New action opens a configurable blank draft. The first Run creates the durable session,
    // after the now-visible baseline picker has had a chance to tell the truth and be changed.
  }, [
    cwd,
    sessions,
    archivedSessions,
    projects,
    toast,
    t,
    invalidatePendingCreation,
  ]);

  const createTaskDraft = useCallback(() => {
    setTaskContext(null, false);
    createSession();
  }, [createSession, setTaskContext]);

  const createTemporarySession = useCallback(() => {
    setTaskContext(null, true);
    createSession();
  }, [createSession, setTaskContext]);

  const startBoardTask = useCallback((task: BoardTask) => {
    setTaskContext(task, false);
    createSession();
  }, [createSession, setTaskContext]);

  const addSelectedText = useCallback(
    (text: string) => {
      void insertMarkdownRef.current?.(
        selectedExcerptMarkdown(text),
        docEmpty ? "replace" : "append",
      );
      setDocMode(true);
      setTimeout(() => focusEditorRef.current?.(), 0);
    },
    [docEmpty, setDocMode],
  );

  const explainSelectedText = useCallback(
    (text: string) => {
      const markdown = `${t("selection.moreDetailsPrompt")}\n\n${selectedExcerptMarkdown(text)}`;
      void insertMarkdownRef.current?.(
        markdown,
        docEmpty ? "replace" : "append",
      );
      setDocMode(true);
      setTimeout(() => focusEditorRef.current?.(), 0);
    },
    [docEmpty, setDocMode, t],
  );

  const askSelectedTextInSideChat = useCallback(
    (text: string) => {
      const markdown = `${t("selection.askInSideChatPrompt")}\n\n${selectedExcerptMarkdown(text)}`;
      setSideChatSeed({ id: globalThis.crypto.randomUUID(), text: markdown });
      setSideChatOpen(true);
      manualDockTab(null);
    },
    [manualDockTab, t],
  );

  const answer = useCallback(
    async (optionId: string | null) => {
      if (!permission) return;
      const accepted = await answerPermission(
        permission.session,
        permission.requestId,
        optionId,
      );
      setPermissionQueue((previous) =>
        permissionQueueAfterAnswer(
          previous,
          permission.session,
          permission.requestId,
          accepted,
        ),
      );
    },
    [permission],
  );

  const answerQuestion = useCallback(
    async (value: ElicitationAnswer) => {
      if (!permission) return;
      const accepted = await answerElicitation(
        permission.session,
        permission.requestId,
        value,
      );
      setPermissionQueue((previous) =>
        permissionQueueAfterAnswer(
          previous,
          permission.session,
          permission.requestId,
          accepted,
        ),
      );
    },
    [permission],
  );

  /**
   * The UI asks one question about permissions; the engine keeps two axes. This is where the one
   * becomes the two — both are always set together, so a session can't drift into a combination the
   * picker can't name (an "auto-edit" that a read-only sandbox silently vetoes).
   */
  const onSessionModeChange = useCallback(
    (id: SessionMode): boolean => {
      const session = activeSessionRef.current;
      // `newSession` has already captured its first-turn policy, or this session is awaiting an
      // authoritative receipt. In both cases painting another choice would lie about what runs.
      if (
        executionPolicyChangeDisabled(
          pendingCreationRef.current !== null,
          session,
          pendingPolicyBySessionRef.current,
        )
      )
        return false;
      const preset = SESSION_MODES.find((item) => item.id === id);
      if (!preset) return false;

      if (session) {
        const requestId = globalThis.crypto.randomUUID();
        const authoritative = authoritativePoliciesRef.current.get(session) ?? {
          mode,
          sandbox,
        };
        pendingPolicyRequestsRef.current.set(requestId, {
          session,
          authoritative,
        });
        pendingPolicyBySessionRef.current.set(session, requestId);
        setPendingPolicySessions((current) => {
          if (current.has(session)) return current;
          const next = new Set(current);
          next.add(session);
          return next;
        });
        void setExecutionPolicy(
          session,
          preset.mode,
          preset.sandbox,
          requestId,
        ).catch((error) => {
          const rejected = finishPolicyRequest(requestId);
          if (!rejected) return;
          restoreRejectedExecutionPolicy(rejected);
          toast(`Could not update execution policy: ${error}`, "error");
        });
      }

      setMode(preset.mode);
      setSandboxState(preset.sandbox);
      return true;
    },
    [finishPolicyRequest, mode, restoreRejectedExecutionPolicy, sandbox, toast],
  );

  const onMemoryPolicyChange = useCallback(
    (read: MemoryAccess, write: MemoryAccess) => {
    if (!componentEnabledRef.current("memory.settings")) return;
    const previousRead = memoryReadRef.current;
    const previousWrite = memoryWriteRef.current;
    memoryReadRef.current = read;
    memoryWriteRef.current = write;
    setMemoryRead(read);
    setMemoryWrite(write);
    const session = activeSessionRef.current;
    if (session) {
        const update =
          (nextRead: MemoryAccess, nextWrite: MemoryAccess) =>
          (items: SessionInfo[]) =>
        items.map((item) =>
          item.id === session
            ? { ...item, memory_read: nextRead, memory_write: nextWrite }
            : item,
        );
      setSessions(update(read, write));
      setArchivedSessions(update(read, write));
      void setSessionMemoryPolicy(session, read, write).catch((error) => {
        memoryReadRef.current = previousRead;
        memoryWriteRef.current = previousWrite;
        setMemoryRead(previousRead);
        setMemoryWrite(previousWrite);
        setSessions(update(previousRead, previousWrite));
        setArchivedSessions(update(previousRead, previousWrite));
        toast(String(error), "error");
      });
    }
    },
    [toast],
  );

  const selectSession = useCallback(
    async (id: string) => {
      // An explicit navigation wins over any in-flight session creation. Its late SessionCreated
      // can still refresh the rail, but cannot claim focus or submit the draft captured for it.
      setShowTaskBoard(false);
      invalidatePendingCreation();
      const stored =
        sessions.find((s) => s.id === id) ??
        archivedSessions.find((s) => s.id === id);
      if (stored) {
        setCwd(stored.cwd);
        const policy = sessionExecutionPolicy(stored);
        if (policy) {
          setMode(policy.mode);
          setSandboxState(policy.sandbox);
        }
      }
      const storedProjectPath = stored ? sessionProjectPath(stored) : null;
      const projectPath = storedProjectPath
        ? (projects.find((project) => project.path === storedProjectPath)
            ?.path ?? null)
        : null;
      if (projectPath && projectPath !== activeProjectRef.current) {
        activeProjectRef.current = projectPath;
        setCallProjectPath(normalizePluginProjectPath(projectPath));
        setActiveProject(projectPath);
        void openProject(projectPath).then(refreshProjects);
      } else if (stored && !projectPath) {
        activeProjectRef.current = null;
        setCallProjectPath(null);
        setActiveProject(null);
      }

      const request = ++sessionLoadSeq.current;
      earlierLoadSeqRef.current += 1;
      earlierLoadRef.current = false;
      setLoadingEarlier(false);
      updateTranscriptCursor(null);
      // R10: focus moved — release the dock-follow latch and drop the stale badge.
      followDockEvent({ kind: "session_switched" });
      activeSessionRef.current = id;
      if (stored?.model) knownModelsRef.current.set(id, stored.model);
      else knownModelsRef.current.delete(id);
      const provenance = stored ? { session: id, shell: stored } : null;
      activeSessionProvenanceRef.current = provenance;
      setActiveSessionReceipt(provenance);
      setActiveSession(id);
      const board = loadBoardSnapshot();
      const task = board.warning ? null : taskForSession(board.tasks, id);
      setTaskContext(task, task === null);
      {
        // Restore the concrete scene and Agent-owned routing independently: Auto can be enabled
        // before the Agent has selected the first scene.
        const remembered = sceneBySessionRef.current.get(id) ?? null;
        const rememberedAuto = autoSceneBySessionRef.current.get(id) ?? false;
        setActiveSceneName(remembered);
        setAutoScene(rememberedAuto);
        setScenePendingFields([]);
        if (componentEnabledRef.current("scenes.surface")) {
          void Promise.all([getSessionScene(id), getSessionAutoScene(id)]).then(
            ([state, enabled]) => {
              if (
                !componentEnabledRef.current("scenes.surface") ||
                activeSessionRef.current !== id
              ) {
                return;
              }
              autoSceneBySessionRef.current.set(id, enabled);
              setAutoScene(enabled);
              if (!state) return;
              sceneBySessionRef.current.set(id, state.reference);
              setActiveSceneName(state.reference);
              if (!state.resolved) toast(t("scene.unresolved"), "error");
            },
          );
        }
      }
      setSessionLoading(true);
      setTurns([]);
      // Models belong to a session. The agent only reports its own menu at session/new — which for
      // a session resumed from the store hasn't happened again yet — so start from the provider's
      // built-in list and let the agent's own options replace it when the next turn revives the
      // session.
      const forProvider = providers.find(
        (p) => p.id === providerLabel(stored?.provider ?? ""),
      );
      setModels(forProvider?.models ?? []);
      setConfigOptions([]);
      setCurrentModel(stored?.model ?? null);
      setDefaultModel(null);
      const nextRead = stored?.memory_read ?? "inherit";
      const nextWrite = stored?.memory_write ?? "inherit";
      memoryReadRef.current = nextRead;
      memoryWriteRef.current = nextWrite;
      memoryReceiptsRef.current = [];
      setMemoryRead(nextRead);
      setMemoryWrite(nextWrite);
      let observedTurnVersion = turnStartVersionsRef.current.get(id) ?? 0;
      try {
        let [page, receipts] = await Promise.all([
          getTranscriptPage(id),
          componentEnabledRef.current("memory.settings")
            ? listMemoryReceipts(id)
            : Promise.resolve([]),
        ]);
        // The core persists the prompt before broadcasting TurnStarted. If that boundary arrived
        // during this read, fetch once more so the persisted tail and live event buffer share an
        // explicit request identity instead of guessing from text content or array position.
        while (request === sessionLoadSeq.current) {
          const currentTurnVersion = turnStartVersionsRef.current.get(id) ?? 0;
          if (currentTurnVersion === observedTurnVersion) break;
          observedTurnVersion = currentTurnVersion;
          page = await getTranscriptPage(id);
        }
        if (request !== sessionLoadSeq.current) return;
        memoryReceiptsRef.current = receipts;
        // Optimistic running state exists before TurnStarted/prompt persistence. It must not reopen
        // the previous persisted tail when the user re-selects this session during that window.
        const hasAuthoritativeTurn = runningPromptRequestsRef.current.has(id);
        const sessionIsRunning = runningSessionsRef.current.has(id);
        const tailState = transcriptTailState(
          sessionIsRunning,
          hasAuthoritativeTurn,
          latestTurnRequestIdsRef.current.get(id),
        );
        const loaded = turnsFromTranscript(
          page.entries,
          tailState.running,
          tailState.requestId,
          receipts,
        );
        updateTranscriptCursor(page.next_before);
        setTurns((live) =>
          mergeLoadedTurns(
            loaded,
            live,
            runningSessionsRef.current.has(id) &&
              runningPromptRequestsRef.current.has(id),
          ),
        );
      } catch (error) {
        if (request !== sessionLoadSeq.current) return;
        memoryReceiptsRef.current = [];
        setTurns([]);
        updateTranscriptCursor(null);
        toast(t("toast.sessionLoadFailed", { error: String(error) }), "error");
      } finally {
        if (request === sessionLoadSeq.current) setSessionLoading(false);
      }
    },
    [
      sessions,
      archivedSessions,
      providers,
      projects,
      refreshProjects,
      toast,
      t,
      followDockEvent,
      invalidatePendingCreation,
      setTaskContext,
      updateTranscriptCursor,
    ],
  );

  const loadEarlierTranscript = useCallback(async () => {
    const session = activeSessionRef.current;
    const before = transcriptNextBeforeRef.current;
    if (!session || before === null || earlierLoadRef.current) return;

    const sessionGeneration = sessionLoadSeq.current;
    const loadGeneration = ++earlierLoadSeqRef.current;
    const anchor = capturePrependAnchor();
    earlierLoadRef.current = true;
    setLoadingEarlier(true);
    try {
      const page = await getTranscriptPage(session, before);
      if (
        sessionGeneration !== sessionLoadSeq.current ||
        loadGeneration !== earlierLoadSeqRef.current ||
        session !== activeSessionRef.current ||
        before !== transcriptNextBeforeRef.current
      ) {
        return;
      }
      const older = turnsFromTranscript(
        page.entries,
        false,
        undefined,
        memoryReceiptsRef.current,
      );
      if (older.length > 0) {
        prepareForPrepend(anchor);
        setTurns((current) => prependTranscriptTurns(current, older));
      }
      updateTranscriptCursor(page.next_before);
    } catch (error) {
      if (
        sessionGeneration === sessionLoadSeq.current &&
        loadGeneration === earlierLoadSeqRef.current
      ) {
        toast(
          t("toast.transcriptEarlierFailed", { error: String(error) }),
          "error",
        );
      }
    } finally {
      if (loadGeneration === earlierLoadSeqRef.current) {
        earlierLoadRef.current = false;
        setLoadingEarlier(false);
      }
    }
  }, [
    capturePrependAnchor,
    prepareForPrepend,
    t,
    toast,
    updateTranscriptCursor,
  ]);

  const searchPaletteCommands = useCallback(
    async (query: string): Promise<Command[]> => {
      const hits = await searchSessions(query, 12);
      return hits.map((hit) => {
        const stored =
          sessions.find((session) => session.id === hit.session_id) ??
          archivedSessions.find((session) => session.id === hit.session_id);
        const sourcePath = stored
          ? (sessionProjectPath(stored) ?? hit.cwd)
          : hit.cwd;
        const project =
          projects.find((item) => item.path === sourcePath)?.name ?? sourcePath;
        return {
          id: `conversation-${hit.session_id}-${hit.seq}`,
          identity: `session-${hit.session_id}`,
          label: hit.title,
          detail: `${t(hit.role === "user" ? "palette.you" : "palette.agent")}: ${hit.snippet}`,
          hint: hit.archived ? t("palette.archived") : project,
          keywords: `${sourcePath} ${hit.cwd}`,
          run: () => void selectSession(hit.session_id),
        };
      });
    },
    [projects, sessions, archivedSessions, selectSession, t],
  );

  // Skills depend on the workspace: harness skill directories (.claude/skills …) are rescanned
  // for the project the user is in, so the list refreshes on mount and on every project switch.
  const refreshSkills = useCallback(async () => {
    try {
      const next = await listSkills(cwd || ".");
      setSkills(next);
      return next;
    } catch {
      return [];
    }
  }, [cwd]);

  useEffect(() => {
    refreshSkills();
  }, [refreshSkills]);

  const loadManagedCatalog = useCallback(async (scope: PluginManagerScope) => {
    const normalizedScope: PluginManagerScope =
      scope.kind === "user"
      ? scope
        : {
            kind: "project",
            projectPath: normalizePluginProjectPath(scope.projectPath),
          };
    const next = await pluginCatalog(toManagedPluginScope(normalizedScope));
    if (normalizedScope.kind === "user") {
      setManagedUserCatalog(next);
    } else {
      setManagedProjectCatalogs((current) => ({
        ...current,
        [normalizedScope.projectPath]: next,
      }));
    }
    return next;
  }, []);

  const refreshManagedCatalogs = useCallback(
    async (scope: PluginManagerScope = pluginManagerScope) => {
    const projectPaths = new Set<string>();
      if (scope.kind === "project")
        projectPaths.add(normalizePluginProjectPath(scope.projectPath));
      if (activeProject)
        projectPaths.add(normalizePluginProjectPath(activeProject));
    await Promise.all([
      loadManagedCatalog({ kind: "user" }),
      ...Array.from(projectPaths, (projectPath) =>
        loadManagedCatalog({ kind: "project", projectPath }),
      ),
    ]);
    },
    [activeProject, loadManagedCatalog, pluginManagerScope],
  );

  // Component policy is runtime state, not merely data for the management page. Keep the user
  // graph and the active project's inherited graph warm even while the page is closed.
  useEffect(() => {
    void refreshManagedCatalogs().catch((error) => {
      console.warn("Could not load plugin catalog", error);
    });
  }, [refreshManagedCatalogs]);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    const refreshBundles = () =>
      listPlugins()
      .then((next) => {
        if (!disposed) setPlugins(next);
      })
      .catch((error) => console.warn("Could not load plugin bundles", error));
    void refreshBundles();
    void onPluginsChanged(() => {
      void refreshBundles();
      void refreshManagedCatalogs().catch((error) => {
        console.warn("Could not refresh plugin catalog", error);
      });
    }).then((stop) => {
      if (disposed) stop();
      else unsubscribe = stop;
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [refreshManagedCatalogs]);

  const pluginManagerProjects = useMemo(() => {
    const seen = new Set<string>();
    return projects.flatMap((project) => {
      const path = normalizePluginProjectPath(project.path);
      if (seen.has(path)) return [];
      seen.add(path);
      return [{ path, label: project.name }];
    });
  }, [projects]);

  const selectedManagedCatalog =
    pluginManagerScope.kind === "user"
    ? managedUserCatalog
      : managedProjectCatalogs[
          normalizePluginProjectPath(pluginManagerScope.projectPath)
        ];
  const activeProjectCatalog = activeProject
    ? managedProjectCatalogs[normalizePluginProjectPath(activeProject)]
    : undefined;
  const activeManagedCatalog = activeProject
    ? (activeProjectCatalog ?? managedUserCatalog)
    : managedUserCatalog;
  const activeComponentPolicyReady =
    projectBootstrapComplete &&
    managedUserCatalog !== null &&
    (activeProject === null || activeProjectCatalog !== undefined);
  const pluginManagerModel = useMemo(
    () =>
      buildPluginManagerCatalog({
        catalog:
          selectedManagedCatalog ?? managedUserCatalog ?? EMPTY_MANAGED_CATALOG,
      userCatalog: managedUserCatalog ?? undefined,
      bundles: plugins,
      skills,
      market,
      scope: pluginManagerScope,
    }),
    [
      managedUserCatalog,
      market,
      pluginManagerScope,
      plugins,
      selectedManagedCatalog,
      skills,
    ],
  );
  const pluginManagerLabels = useMemo(() => createPluginManagerLabels(t), [t]);
  const localizedPluginManagerModel = useMemo(
    () => localizePluginManagerCatalog(pluginManagerModel, t),
    [pluginManagerModel, t],
  );
  const activePluginModel = useMemo(
    () =>
      buildPluginManagerCatalog({
      catalog: activeManagedCatalog ?? EMPTY_MANAGED_CATALOG,
      userCatalog: managedUserCatalog ?? undefined,
      bundles: plugins,
      skills,
      market,
      scope: activeProject
          ? {
              kind: "project",
              projectPath: normalizePluginProjectPath(activeProject),
            }
        : { kind: "user" },
    }),
    [
      activeManagedCatalog,
      activeProject,
      managedUserCatalog,
      market,
      plugins,
      skills,
    ],
  );
  const componentEnabled = useCallback(
    (id: BuiltinUiComponentId) =>
      pluginManagerComponentEnabled(activePluginModel.components, id, activeComponentPolicyReady),
    [activeComponentPolicyReady, activePluginModel.components],
  );
  componentEnabledRef.current = componentEnabled;
  const voiceComposerEnabled = componentEnabled("voice.composer");
  const memorySettingsEnabled = componentEnabled("memory.settings");
  const scenesSurfaceEnabled = componentEnabled("scenes.surface");
  const lspRuntimeEnabled = componentEnabled("lsp.runtime");
  const lspPluginEnabled =
    activeComponentPolicyReady &&
    (activePluginModel.plugins.find((plugin) => plugin.id === "lsp")?.state
      .effectiveEnabled ??
      false);
  const lspProjectPath = activeProject
    ? normalizePluginProjectPath(activeProject)
    : null;
  const pluginUiActions = useMemo(
    () =>
      activeComponentPolicyReady
      ? activePluginUiContributions(plugins, activePluginModel.plugins)
      : activePluginUiContributions([], []),
    [activeComponentPolicyReady, activePluginModel.plugins, plugins],
  );
  const pluginLanguageServers = useMemo(
    () =>
      activeComponentPolicyReady
      ? activePluginLanguageServers(plugins, activePluginModel.plugins)
      : [],
    [activeComponentPolicyReady, activePluginModel.plugins, plugins],
  );
  useLayoutEffect(() => {
    configurePluginLanguageServers(pluginLanguageServers);
  }, [pluginLanguageServers]);
  const invokePluginAction = useCallback(
    async (contribution: ActivePluginUiContribution) => {
    try {
      const result = await invokePluginUi(
        contribution.pluginId,
        contribution.id,
        {
          cwd: workspaceCwd,
          projectPath: lspProjectPath,
          sessionId: activeSession,
        },
        lspProjectPath,
      );
        const message =
          typeof result === "string"
        ? result
            : result &&
                typeof result === "object" &&
                "message" in result &&
                typeof result.message === "string"
          ? result.message
          : `${contribution.label} completed.`;
      toast(message, "success");
    } catch (error) {
      toast(`${contribution.label} failed: ${String(error)}`, "error");
    }
    },
    [activeSession, lspProjectPath, toast, workspaceCwd],
  );
  // Close the renderer gate synchronously, then reopen it only after this project's backend has
  // resumed. This keeps mounted editor effects from racing a suspended project realm.
  useLayoutEffect(() => {
    let current = true;
    void synchronizeLspRuntimePolicy(
      {
        catalogReady: activeComponentPolicyReady,
        pluginEnabled: lspPluginEnabled,
        componentEnabled: lspRuntimeEnabled,
        projectPath: lspProjectPath,
        workspace: workspaceCwd,
      },
      (enabled) => lspSetRuntimeEnabled(enabled, lspProjectPath),
      () => current && componentEnabledRef.current("lsp.runtime"),
    ).catch((error) =>
      console.warn("Could not update language-server runtime policy", error),
    );
    return () => {
      current = false;
    };
  }, [activeComponentPolicyReady, lspPluginEnabled, lspProjectPath, lspRuntimeEnabled]);
  const availableDockSurfaces = useMemo<DockSurface[]>(
    () => [
      ...(componentEnabled("browser.dock") ? ["browser" as const] : []),
      ...(componentEnabled("terminal.dock") ? ["terminal" as const] : []),
      ...(componentEnabled("files.surface") ? ["files" as const] : []),
      ...(componentEnabled("git.surface") ? ["git" as const] : []),
    ],
    [componentEnabled],
  );
  const availableSideDockSurfaces = useMemo(
    () => availableDockSurfaces.filter((surface) => surface !== "terminal"),
    [availableDockSurfaces],
  );

  // A live disable removes the surface immediately, including already-open dialogs. Runtime
  // cleanup is owned by the plugin scope; this closes only renderer projections of that scope.
  useEffect(() => {
    if (
      dockTab &&
      dockTab !== "home" &&
      !availableDockSurfaces.includes(dockTab)
    ) {
      manualDockTab(null);
    }
    if (terminalOpen && !availableDockSurfaces.includes("terminal")) {
      manualTerminalOpen(false);
    }
    if (!componentEnabled("files.surface")) setShowFiles(false);
    if (!componentEnabled("search.modal")) setShowWorkspaceSearch(false);
    if (!componentEnabled("issues.modal")) setShowIssues(false);
    if (!componentEnabled("git.surface")) setShowSourceControl(false);
    if (!componentEnabled("remote.modal")) setShowRemote(false);
    if (!componentEnabled("automation.page")) setShowAutomations(false);
    if (!scenesSurfaceEnabled) {
      setShowScenePicker(false);
      setShowSceneStudio(false);
      setSceneEditorRequest(null);
      setSceneEscalation(null);
      setSceneBanner(null);
      setPipelineDetail(null);
      pendingSceneRef.current = null;
      pendingPipelineBindRef.current = null;
      pendingDelegationRef.current = null;
      pendingIssueInsertRef.current = null;
    }
  }, [
    availableDockSurfaces,
    componentEnabled,
    dockTab,
    manualDockTab,
    manualTerminalOpen,
    scenesSurfaceEnabled,
    terminalOpen,
  ]);

  const refreshScenes = useCallback(async () => {
    if (!scenesSurfaceEnabled) {
      scenesRef.current = [];
      setScenes([]);
      return [];
    }
    const next = await listScenes(cwd || ".");
    if (!componentEnabledRef.current("scenes.surface")) return [];
    scenesRef.current = next;
    setScenes(next);
    return next;
  }, [cwd, scenesSurfaceEnabled]);

  // Scenes rescan with the workspace, same contract as skills. Degrades to [] on an older core.
  useEffect(() => {
    if (!scenesSurfaceEnabled) {
      setPipelines([]);
      return;
    }
    void refreshScenes();
    // Pipelines resolve from the same library; the palette's "start pipeline" commands feed here.
    void listPipelines().then((next) => {
      if (componentEnabledRef.current("scenes.surface")) setPipelines(next);
    });
  }, [refreshScenes, scenesSurfaceEnabled]);

  // The stage track follows the active session's pipeline binding (R9). Refetched at turn
  // boundaries and on banner changes — auto advances, loop re-entries, and artifact captures all
  // land there. Degrades to hidden (null) on an older core or an unbound session.
  useEffect(() => {
    const session = activeSession;
    if (!session || !scenesSurfaceEnabled) {
      setPipelineDetail(null);
      return;
    }
    let cancelled = false;
    void sessionPipeline(session).then((binding) => {
      if (cancelled) return;
      if (!binding) {
        setPipelineDetail(null);
        return;
      }
      void getPipelineInstance(binding.instance_id).then((detail) => {
        if (!cancelled) setPipelineDetail(detail);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeSession, turns.length, sceneBanner, scenesSurfaceEnabled]);

  const saveDraft = useCallback(async () => {
    if (!skillDraft || skillDraft.name.trim().length === 0) return;
    await saveSkill({
      id: slug(skillDraft.name),
      name: skillDraft.name.trim(),
      description: "",
      icon: "✦",
      payload: { kind: "fragment", text: skillDraft.text },
    });
    setSkillDraft(null);
    refreshSkills();
  }, [skillDraft, refreshSkills]);

  // Mirrors `cwd` so an in-flight git fetch can tell it's stale. Without this, the mount-time
  // fetch for the engine's own cwd (".") could resolve *after* the fetch for the project you
  // switched to and paint another repo's branch and diff into the rail.
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  useEffect(() => {
    gitRefreshSeq.current += 1;
    checkpointRefreshSeq.current += 1;
  }, [cwd]);

  const refreshGit = useCallback(() => {
    const target = cwd || ".";
    const request = ++gitRefreshSeq.current;
    const fresh = () =>
      gitRefreshSeq.current === request && (cwdRef.current || ".") === target;
    setGitWorkspace({ cwd: target, loading: true, value: EMPTY_GIT_WORKSPACE });
    gitStatus(target)
      .then((s) => {
        if (!fresh()) return;
        setGitWorkspace({
          cwd: target,
          loading: false,
          value: { status: s, diffStat: EMPTY_DIFF_STAT },
        });
        if (s.is_repo && s.files.length > 0) {
          gitDiffStat(target)
            .then((stat) => {
              if (!fresh()) return;
              setGitWorkspace((current) =>
                current.cwd === target
                  ? {
                      ...current,
                      value: {
                        ...current.value,
                        diffStat: {
                          added: stat.added,
                          deleted: stat.deleted,
                          truncated: stat.truncated,
                        },
                      },
                    }
                  : current,
              );
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (fresh()) {
          setGitWorkspace({
            cwd: target,
            loading: false,
            value: EMPTY_GIT_WORKSPACE,
          });
        }
      });
  }, [cwd]);

  const refreshCheckpoints = useCallback(() => {
    const target = cwd || ".";
    // A callback captured before a project switch must not invalidate the current project's load.
    if ((cwdRef.current || ".") !== target) return;
    const request = ++checkpointRefreshSeq.current;
    setCheckpointWorkspace({
      cwd: target,
      loading: true,
      value: EMPTY_CHECKPOINTS,
    });
    gitCheckpoints(target)
      .then((next) => {
        if (
          checkpointRefreshSeq.current === request &&
          (cwdRef.current || ".") === target
        ) {
          setCheckpointWorkspace({ cwd: target, loading: false, value: next });
        }
      })
      .catch(() => {
        if (
          checkpointRefreshSeq.current === request &&
          (cwdRef.current || ".") === target
        ) {
          setCheckpointWorkspace({
            cwd: target,
            loading: false,
            value: EMPTY_CHECKPOINTS,
          });
        }
      });
  }, [cwd]);

  const openPluginHub = useCallback(() => {
    const normalizedActiveProject = activeProject
      ? normalizePluginProjectPath(activeProject)
      : null;
    const scope: PluginManagerScope =
      normalizedActiveProject &&
      pluginManagerProjects.some(
        (project) => project.path === normalizedActiveProject,
      )
        ? { kind: "project", projectPath: normalizedActiveProject }
      : { kind: "user" };
    setPluginManagerScope(scope);
    setShowBundlePluginTools(false);
    marketCatalog()
      .then(setMarket)
      .catch(() => {});
    listPlugins()
      .then(setPlugins)
      .catch(() => {});
    void refreshManagedCatalogs(scope).catch(() => {});
    refreshSkills();
    setShowAutomations(false);
    setShowTaskBoard(false);
    setShowPluginHub(true);
  }, [
    activeProject,
    pluginManagerProjects,
    refreshManagedCatalogs,
    refreshSkills,
  ]);

  const refreshPluginManagerData = useCallback(
    async (scope: PluginManagerScope = pluginManagerScope) => {
    const [nextMarket, nextPlugins, nextSkills] = await Promise.all([
      marketCatalog(),
      listPlugins(),
      refreshSkills(),
      refreshManagedCatalogs(scope),
    ]);
    setMarket(nextMarket);
    setPlugins(nextPlugins);
    setSkills(nextSkills);
    },
    [pluginManagerScope, refreshManagedCatalogs, refreshSkills],
  );

  const planManagerChange = useCallback(
    async (
    request: PluginManagerChangeRequest,
    ): Promise<PluginManagerChangePlan> => {
      const plan = await planPluginManagerChange({
      request,
        plugins: localizedPluginManagerModel.plugins,
        components: localizedPluginManagerModel.components,
      planChange: planPluginChange,
      });
      return {
        ...plan,
        summary: pluginManagerLabels.changeSummary(
          request.targetKind,
          request.targetName,
          request.desiredState,
        ),
      };
    },
    [
      localizedPluginManagerModel.components,
      localizedPluginManagerModel.plugins,
      pluginManagerLabels,
    ],
  );

  const applyManagerChange = useCallback(
    async (plan: PluginManagerChangePlan) => {
    await applyPluginManagerChange(plan, applyPluginChange);
    await refreshPluginManagerData(plan.request.scope);
    toast(
        pluginManagerLabels.changeApplied(
          plan.request.targetName,
          plan.request.desiredState,
        ),
      "success",
    );
    },
    [pluginManagerLabels, refreshPluginManagerData, toast],
  );

  const saveManagerConfig = useCallback(
    async ({
    pluginId,
    scope,
    config,
  }: {
    pluginId: string;
    scope: PluginManagerScope;
    config: unknown;
  }) => {
      const plugin = pluginManagerModel.plugins.find(
        (item) => item.id === pluginId,
      );
    if (!plugin || plugin.source === "bundle") {
        throw new Error(
          "This bundle does not expose a host-validated configuration schema.",
        );
    }
    const plan = await planPluginChange({
      plugin: plugin.id,
      scope: toManagedPluginScope(scope),
      config,
    });
    await applyPluginChange(plan.id);
    await refreshPluginManagerData(scope);
    toast(`${plugin.name} configuration saved and reloaded.`, "success");
    },
    [pluginManagerModel.plugins, refreshPluginManagerData, toast],
  );

  const openAutomations = useCallback(() => {
    if (!componentEnabled("automation.page")) {
      toast("Automations are disabled in Plugins.", "info");
      return;
    }
    setShowTaskBoard(false);
    setShowPluginHub(false);
    setShowAutomations(true);
    if (narrowLayout) setNarrowRailOpen(false);
    else if (railCollapsed) setRailCollapsedRaw(0);
  }, [
    componentEnabled,
    narrowLayout,
    railCollapsed,
    setRailCollapsedRaw,
    toast,
  ]);

  const openSourceControl = useCallback(() => {
    if (!componentEnabled("git.surface")) {
      toast("Source control is disabled in Plugins.", "info");
      return;
    }
    setShowSourceControl(true);
  }, [componentEnabled, toast]);

  const openWorkingDirectory = useCallback(async (target: WorkspaceOpenTarget) => {
    const application =
      target === "cursor"
        ? t("header.cursor")
        : target === "antigravity"
          ? t("header.antigravity")
          : t("header.finder");
    try {
      if (!(await openWorkspace(cwd || ".", target))) {
        throw new Error("Workspace launcher unavailable");
      }
    } catch {
      toast(t("header.openFailed", { application }), "error");
    }
  }, [cwd, t, toast]);

  const doCheckpoint = useCallback(async () => {
    try {
      const cp = await gitCheckpoint(cwd || ".", "manual checkpoint");
      toast(
        cp ? "Checkpoint saved." : "Nothing to checkpoint.",
        cp ? "success" : "info",
      );
    } catch (e) {
      toast(`Checkpoint failed: ${e}`, "error");
    }
    refreshCheckpoints();
  }, [cwd, refreshCheckpoints, toast]);

  const doPush = useCallback(async () => {
    try {
      await gitPush(cwd || ".");
      toast("Pushed.", "success");
    } catch (e) {
      toast(`Push failed: ${e}`, "error");
      throw e;
    } finally {
      refreshGit();
    }
  }, [cwd, refreshGit, toast]);

  const doPreview = useCallback(async () => {
    const getBlocks = getBlocksRef.current;
    if (!getBlocks) return;
    try {
      const current = getBlocks();
      const frozen = freezeCanvasesRef.current
        ? await freezeCanvasesRef.current(current)
        : current;
      setPreview(await compileDoc(frozen, cwd || "."));
    } catch (e) {
      toast(`Could not compile the document: ${e}`, "error");
    }
  }, [cwd, freezeCanvasesRef, toast]);

  /* One card per annotation. The core renders the markdown the agent will see; the editor shows
     it as a dedicated block — host, element, note, style edits — instead of a wall of text. */
  const annotate = useCallback(async (notes: Annotation[]) => {
    for (const a of notes) {
      const ctx = await browserContext(a);
      insertAnnotationRef.current?.(a, ctx);
    }
  }, []);

  const insertIssue = useCallback(async (issue: Issue) => {
    const ctx = await issueContext(issue);
    insertIssueRef.current?.(issue, ctx);
    setShowIssues(false);
  }, []);

  const toggleDock = useCallback(
    (t: DockSurface) => {
      const component: Record<DockSurface, BuiltinUiComponentId> = {
        browser: "browser.dock",
        terminal: "terminal.dock",
        files: "files.surface",
        git: "git.surface",
      };
      if (!componentEnabled(component[t])) {
        toast(
          `${t[0]?.toUpperCase()}${t.slice(1)} is disabled in Plugins.`,
          "info",
        );
        return;
      }
      // A manual dock choice, so it routes through the follow reducer and latches auto-follow.
      if (t === "terminal") {
        manualTerminalOpen(!terminalOpenRef.current);
      } else {
        manualDockTab(dockTabRef.current === t ? null : t);
      }
      setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    },
    [componentEnabled, manualDockTab, manualTerminalOpen, toast],
  );

  const runProjectAction = useCallback((script: ProjectScript) => {
    const name = script.name || script.id;
    if (script.preview_url && script.open_preview) {
      if (componentEnabled("browser.dock")) {
        setBrowserUrl(script.preview_url);
        void browserRegistryCreate(script.preview_url).catch((error) => {
          toast(t("actionDialog.failed", { error: String(error) }), "error");
        });
        manualDockTab("browser");
        setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
      } else {
        toast("Browser preview is disabled in Plugins.", "info");
      }
    }
    toast(t("actionDialog.running", { name }));
    void runProjectScript(cwd || ".", script.id)
      .then((output) => {
        const message = output.trim()
          ? output.trim().slice(-300)
          : t("actionDialog.finished", { name });
        toast(message, "success");
      })
      .catch((error) => toast(t("actionDialog.failed", { error: String(error) }), "error"));
  }, [componentEnabled, cwd, manualDockTab, t, toast]);

  const saveProjectAction = useCallback(async (script: ProjectScript) => {
    const saved = await saveProjectScript(cwd || ".", script);
    setScripts((current) => {
      const index = current.findIndex((candidate) => candidate.id === saved.id);
      if (index < 0) return [...current, saved];
      return current.map((candidate, candidateIndex) => candidateIndex === index ? saved : candidate);
    });
    toast(t("actionDialog.saved", { name: saved.name || saved.id }), "success");
  }, [cwd, t, toast]);

  // Expanding hands the whole column to the document; focus follows so you can just start writing.
  const toggleDocMode = useCallback((v: boolean) => {
    setDocMode(v);
    if (v) setTimeout(() => focusEditorRef.current?.(), 0);
  }, []);

  const getCanvasAssets = useCallback(
    (id: string): readonly CanvasStaticAsset[] => {
    const current = canvasAssetsRef.current.get(id);
    if (current) return Array.from(current.values());
    const draft = canvasDraftsRef.current.get(id);
    return draft?.assets ?? [];
    },
    [],
  );

  const rememberCanvasDraft = useCallback((draft: CanvasDraft) => {
    canvasDraftsRef.current.set(draft.id, draft);
    const assets = new Map(draft.assets.map((asset) => [asset.id, asset]));
    canvasAssetsRef.current.set(draft.id, assets);
  }, []);

  const normalizeCanvasMedia = useCallback(
    async (
      canvasId: string,
      input: import("./canvas/media").CanvasMediaInput,
    ) => {
      const bytes =
        input.bytes instanceof Uint8Array
      ? input.bytes
      : input.bytes instanceof ArrayBuffer
        ? new Uint8Array(input.bytes)
        : new Uint8Array(await input.bytes.arrayBuffer());
    const normalized = await canvasNormalizeMedia(bytes, input.mimeType);
    const media = {
      ref: normalized.id,
      bytes: new Uint8Array(normalized.bytes),
      mimeType: normalized.mimeType,
      name: input.name,
      width: normalized.width,
      height: normalized.height,
    } as const;
      const existing =
        canvasAssetsRef.current.get(canvasId) ??
        new Map<string, CanvasStaticAsset>();
    existing.set(normalized.id, normalized);
    canvasAssetsRef.current.set(canvasId, existing);
    return media;
    },
    [],
  );

  const resolveCanvasAsset = useCallback(
    async (
      canvasId: string,
      asset: {
        ref: string;
        fileId: string;
        mimeType: "image/png" | "image/webp";
      },
    ) => {
      const stored =
        canvasAssetsRef.current.get(canvasId)?.get(asset.ref) ??
        canvasAssetsRef.current.get(canvasId)?.get(asset.fileId);
    if (stored) {
      return {
        ref: stored.id,
        fileId: stored.id,
        mimeType: stored.mimeType,
        bytes: new Uint8Array(stored.bytes),
      };
    }
    return null;
    },
    [],
  );

  const saveCanvasDraft = useCallback(
    async (
      canvasId: string,
      envelope: LocalCanvasEnvelope,
      assets: readonly CanvasStaticAsset[],
    ) => {
    const current = canvasDraftsRef.current.get(canvasId);
    const update = {
      title: current?.title ?? "Canvas",
      theme: envelope.theme,
      envelope: localCanvasScene(envelope, assets),
      manifest: localCanvasManifest(envelope),
      assets: Array.from(assets),
    };
      const saved = await canvasUpdateDraft(
        canvasId,
        envelope.revision,
        update,
      );
    rememberCanvasDraft(saved);
    return saved;
    },
    [rememberCanvasDraft],
  );

  const freezeCanvasDraft = useCallback(
    async (
    canvasId: string,
    envelope: LocalCanvasEnvelope,
    assets: readonly CanvasStaticAsset[],
    exports: readonly CanvasExport[],
    _pixelPolicy: CanvasPixelPolicy,
  ): Promise<CanvasSnapshot> => {
    const current = canvasDraftsRef.current.get(canvasId);
    const frozen = await canvasFreeze(canvasId, envelope.revision, {
      title: current?.title ?? "Canvas",
      theme: envelope.theme,
      envelope: localCanvasScene(envelope, assets),
      manifest: localCanvasManifest(envelope),
      assets: Array.from(assets),
      // Keep validated PNG exports in the immutable revision for history and later provider
      // retries. The pixel policy is applied by core lowering, not by dropping evidence here.
      exports: Array.from(exports),
    });
    return frozen;
    },
    [],
  );

  const forgetCanvasHead = useCallback((canvasId: string) => {
    canvasDraftsRef.current.delete(canvasId);
    canvasAssetsRef.current.delete(canvasId);
    canvasFrozenRef.current.delete(canvasId);
  }, []);

  const purgeCanvasHead = useCallback(
    async (canvasId: string) => {
      const hasMutableHead =
        canvasDraftsRef.current.has(canvasId) ||
        canvasAssetsRef.current.has(canvasId);
      const plan = canvasUnmountPlan(
        hasMutableHead,
        canvasTombstonesRef.current.has(canvasId),
      );
    if (!plan.purge) return;
    canvasPurgeRequestedRef.current.add(canvasId);
    if (plan.tombstone) {
      canvasTombstonesRef.current.add(canvasId);
      await canvasTombstone(canvasId);
    }
    await canvasPurge(canvasId);
    canvasTombstonesRef.current.delete(canvasId);
    canvasPurgeRequestedRef.current.delete(canvasId);
    forgetCanvasHead(canvasId);
    },
    [forgetCanvasHead],
  );

  const removeCanvasDraft = useCallback(
    (canvasId: string, nonEmpty: boolean) => {
    canvasTombstonesRef.current.add(canvasId);
    if (!nonEmpty) {
      canvasPurgeRequestedRef.current.delete(canvasId);
      void canvasPurge(canvasId)
        .then(() => forgetCanvasHead(canvasId))
        .catch(() => {});
      return;
    }
    void canvasTombstone(canvasId)
      .then(() => {
        if (!canvasPurgeRequestedRef.current.has(canvasId)) return;
        return purgeCanvasHead(canvasId);
      })
      .catch((error) => {
          toast(
            `Canvas removal could not be recorded: ${String(error)}`,
            "error",
          );
      });
    },
    [forgetCanvasHead, purgeCanvasHead, toast],
  );

  const restoreCanvasDraft = useCallback(
    (canvasId: string) => {
    if (!canvasTombstonesRef.current.has(canvasId)) return;
    canvasTombstonesRef.current.delete(canvasId);
    void canvasRestore(canvasId).catch((error) => {
      toast(`Canvas restore failed: ${String(error)}`, "error");
    });
    },
    [toast],
  );

  const purgeCanvasOnUnmount = useCallback(
    (canvasId: string) => {
    void purgeCanvasHead(canvasId).catch(() => {});
    },
    [purgeCanvasHead],
  );

  const canvasUiEnabled =
    canvasFeature.enabled && componentEnabled("canvas.editor");
  const canvasRuntime = useMemo<CanvasBlockRuntime | null>(
    () => ({
    enabled: canvasUiEnabled,
    normalizeMedia: normalizeCanvasMedia,
    resolveAsset: resolveCanvasAsset,
    getAssets: getCanvasAssets,
    onAsset: (canvasId, asset) => {
        const assets =
          canvasAssetsRef.current.get(canvasId) ??
          new Map<string, CanvasStaticAsset>();
      assets.set(asset.id, asset);
      canvasAssetsRef.current.set(canvasId, assets);
    },
    onCanvasActivity: () => {},
    saveDraft: saveCanvasDraft,
    freezeDraft: freezeCanvasDraft,
    onCanvasRemoved: removeCanvasDraft,
    onCanvasRestored: restoreCanvasDraft,
    onCanvasUnmount: (canvasId) => purgeCanvasOnUnmount(canvasId),
    onCanvasFrozen: (canvasId) => canvasFrozenRef.current.add(canvasId),
    onCanvasDeliveryError: (_canvasId, message) => toast(message, "error"),
    register: () => () => {},
    }),
    [
      canvasUiEnabled,
      freezeCanvasDraft,
      getCanvasAssets,
      normalizeCanvasMedia,
      purgeCanvasOnUnmount,
      removeCanvasDraft,
      resolveCanvasAsset,
      restoreCanvasDraft,
      saveCanvasDraft,
      toast,
    ],
  );

  const createCanvas = useCallback(async () => {
    if (!canvasUiEnabled) {
      const error = new Error(
        componentEnabled("canvas.editor")
          ? canvasFeature.status
          : "Canvas is disabled in Plugins.",
      );
      toast(error.message, "error");
      throw error;
    }
    const draft = await canvasCreateDraft("Canvas");
    rememberCanvasDraft(draft);
    return draft;
  }, [
    canvasFeature.status,
    canvasUiEnabled,
    componentEnabled,
    rememberCanvasDraft,
    toast,
  ]);

  useEffect(() => {
    const onDuplicate = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; revision?: number }>)
        .detail;
      if (!detail?.id || !Number.isFinite(detail.revision)) return;
      if (!canvasUiEnabled) {
        toast(
          componentEnabled("canvas.editor")
            ? canvasFeature.status
            : "Canvas is disabled in Plugins.",
          "error",
        );
        return;
      }
      void canvasDuplicate(detail.id, Number(detail.revision))
        .then((draft) => {
          rememberCanvasDraft(draft);
          insertCanvasDraftRef.current?.(draft);
        })
        .catch((error) =>
          toast(`Canvas duplicate failed: ${String(error)}`, "error"),
        );
    };
    window.addEventListener("codetwo-canvas-duplicate", onDuplicate);
    return () =>
      window.removeEventListener("codetwo-canvas-duplicate", onDuplicate);
  }, [
    canvasFeature.status,
    canvasUiEnabled,
    componentEnabled,
    rememberCanvasDraft,
    toast,
  ]);

  useEffect(() => {
    let confirmationOpen = false;
    const onVisualizeFollowUp = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string; title?: string }>).detail;
      const prompt = detail?.prompt?.trim();
      if (!prompt || !insertTextRef.current || confirmationOpen) return;
      confirmationOpen = true;
      void confirmNative(
        t("visualization.followUp", { prompt }),
        detail.title || t("visualization.title"),
      ).then((accepted) => {
        if (!accepted) return;
        insertTextRef.current?.(prompt);
        setTimeout(() => focusEditorRef.current?.(), 0);
      }).finally(() => {
        confirmationOpen = false;
      });
    };
    window.addEventListener("codetwo-visualize-follow-up", onVisualizeFollowUp);
    return () =>
      window.removeEventListener("codetwo-visualize-follow-up", onVisualizeFollowUp);
  }, [t]);

  /** Open a file as a tab in the right panel's editor, and bring that panel to the front. */
  const openFileTab = useCallback(
    (p: string, position?: Pick<WorkspaceContentMatch, "line" | "column">) => {
      if (!componentEnabled("files.surface")) {
        toast("Files are disabled in Plugins.", "info");
        return;
      }
      setOpenFiles((prev) => (prev.includes(p) ? prev : [...prev, p]));
      setActiveFile(p);
      setFileReveal(
        position
          ? {
              path: p,
              line: position.line,
              column: position.column,
              requestId: ++fileRevealRequestRef.current,
            }
          : null,
      );
      setDockTab("files");
      // The files surface is an editor *and* a tree; at the dock's chat-sized default the code
      // column is a sliver. Take the room the document can spare, up to a readable measure.
      if (dockWidth < 640)
        setDockWidth(Math.min(Math.max(300, window.innerWidth - 620), 800));
      setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    },
    [componentEnabled, dockWidth, setDockWidth, toast],
  );

  const closeFileTab = useCallback(
    async (p: string) => {
      // Unsaved edits die with the tab — say so first, like any editor would.
      if (isFileDirty(dirtyKey(cwd, p))) {
        const name = p.split("/").pop() ?? p;
        if (!(await confirmNative(t("files.confirmClose", { name })))) return;
        markDirty(dirtyKey(cwd, p), false);
      }
      const at = openFiles.indexOf(p);
      const next = openFiles.filter((x) => x !== p);
      setOpenFiles(next);
      // Closing the visible tab lands on its neighbour, not on an empty pane, VS Code-style.
      if (activeFile === p) {
        setActiveFile(next[Math.min(Math.max(at, 0), next.length - 1)] ?? null);
      }
    },
    [openFiles, activeFile, cwd, t],
  );

  const stepSession = useCallback(
    (delta: number) => {
      if (sessions.length === 0) return;
      const at = sessions.findIndex((s) => s.id === activeSession);
      const next = sessions[(at + delta + sessions.length) % sessions.length];
      if (next) void selectSession(next.id);
    },
    [sessions, activeSession, selectSession],
  );

  /**
   * Every action in the keymap must land here. An action with no arm is a key that silently does
   * nothing — `open_skill_picker` and `focus_editor` were exactly that.
   */
  /**
   * Soft-apply a scene (or clear with null). Tightening applies silently; loosening stops here
   * and raises the escalation dialog — the rule is absolute, so this is the only UI path in.
   */
  const applySceneChoice = useCallback(
    (reference: string | null, opts?: { confirmed?: boolean }) => {
      if (!componentEnabledRef.current("scenes.surface")) return;
      const session = activeSessionRef.current;
      autoSceneRef.current = false;
      setAutoScene(false);
      if (session) {
        autoSceneBySessionRef.current.set(session, false);
        void setSessionAutoScene(session, false);
      }
      if (reference === null) {
        setActiveSceneName(null);
        setScenePendingFields([]);
        pendingSceneRef.current = null;
        if (session) {
          sceneBySessionRef.current.delete(session);
          void setSessionScene(session, null, false);
        }
        return;
      }
      const scene = scenesRef.current.find((s) => s.reference === reference);
      if (!scene) return;
      const confirmed = opts?.confirmed ?? false;
      const escalation = escalationNeeded(scene, sessionMode(mode, sandbox));
      if (escalation && !confirmed) {
        setSceneEscalation({ reference, kind: "soft", ...escalation });
        return;
      }
      const live = {
        mode: sessionMode(mode, sandbox),
        memoryRead,
        memoryWrite,
        planFirst: planMode,
        provider,
        model: currentModel,
      };
      const execution = scene.execution;
      if (execution?.session_mode) onSessionModeChange(execution.session_mode);
      if (execution?.memory_preset) {
        const preset = MEMORY_PRESET_POLICY[execution.memory_preset];
        onMemoryPolicyChange(preset.read, preset.write);
      }
      if (execution?.plan_first !== undefined)
        setPlanMode(execution.plan_first);
      setActiveSceneName(reference);
      setScenePendingFields(softApplyPending(scene, live));
      if (session) {
        sceneBySessionRef.current.set(session, reference);
        void applySceneToSession(session, reference, confirmed).then(
          (outcome) => {
          if (!componentEnabledRef.current("scenes.surface")) return;
          // The core re-checks against the persisted policy; if it disagrees, nothing was
          // applied there — surface the same dialog instead of drifting.
          if (outcome?.escalation) {
            setSceneEscalation({
              reference,
              kind: "soft",
              from: outcome.escalation.from as SessionMode,
              to: outcome.escalation.to as SessionMode,
            });
          }
          },
        );
      } else {
        pendingSceneRef.current = reference;
      }
      toast(t("scene.switched", { scene: scene.title }));
    },
    [
      mode,
      sandbox,
      memoryRead,
      memoryWrite,
      planMode,
      provider,
      currentModel,
      onSessionModeChange,
      onMemoryPolicyChange,
      toast,
      t,
    ],
  );

  const setAutoSceneChoice = useCallback((enabled: boolean) => {
    if (!componentEnabledRef.current("scenes.surface")) return;
    const session = activeSessionRef.current;
    autoSceneRef.current = enabled;
    setAutoScene(enabled);
    if (session) {
      autoSceneBySessionRef.current.set(session, enabled);
      void setSessionAutoScene(session, enabled);
    }
  }, []);

  /** Full-apply: a fresh session in the active scene, closing the soft-apply gap. */
  const restartInScene = useCallback(
    async (confirmed = false) => {
      if (!componentEnabledRef.current("scenes.surface")) return;
      const reference = activeSceneNameRef.current;
      if (!reference) return;
      const plan = await sceneSessionPlan(reference, confirmed);
      if (!componentEnabledRef.current("scenes.surface") || !plan) return;
      if (plan.escalation) {
        setSceneEscalation({
          reference,
          kind: "restart",
          from: plan.escalation.from as SessionMode,
          to: plan.escalation.to as SessionMode,
        });
        return;
      }
      pendingSceneRef.current = reference;
      createSession();
      const params = plan.params;
      if (params?.provider) setProvider(params.provider);
      if (params?.use_worktree === false) setWorktreeBase(null);
      else if (params?.worktree_base) setWorktreeBase(params.worktree_base);
      // The draft reset cleared the posture; re-apply the scene's fields to the new draft.
      applySceneChoice(reference, { confirmed: true });
      pendingSceneRef.current = reference;
    },
    [applySceneChoice, createSession],
  );

  /** The pinned scene reference a pipeline stage's bare scene name resolves to, when installed. */
  const resolveStageScene = useCallback((target: string) => {
    return (
      scenesRef.current.find((s) => s.reference === target || s.name === target)
        ?.reference ?? target
    );
  }, []);

  /** Refresh the local scene chip state after the core soft-applied a stage's scene (R9). */
  const syncSessionScene = useCallback(async (session: string) => {
    if (!componentEnabledRef.current("scenes.surface")) return;
    const state = await getSessionScene(session);
    if (!componentEnabledRef.current("scenes.surface") || !state) return;
    sceneBySessionRef.current.set(session, state.reference);
    setActiveSceneName(state.reference);
    setScenePendingFields([]);
  }, []);

  /**
   * Advance a pipeline instance for the active session (R9). The command re-checks escalation
   * (refuse-and-report); a report raises the shared SceneEscalationDialog, and confirming
   * re-calls with confirm=true.
   */
  const advancePipelineChoice = useCallback(
    async (instanceId: string, toStage: string, confirmed = false) => {
      if (!componentEnabledRef.current("scenes.surface")) return;
      const session = activeSessionRef.current;
      const outcome = await advancePipeline(
        instanceId,
        toStage,
        session,
        confirmed,
      );
      if (!componentEnabledRef.current("scenes.surface") || !outcome) return;
      const escalation =
        outcome.escalation ?? outcome.applied_scene?.escalation ?? null;
      if (escalation) {
        const stage = pipelineDetail?.stages.find((s) => s.id === toStage);
        setSceneEscalation({
          reference: resolveStageScene(stage?.scene_ref ?? toStage),
          kind: "pipeline",
          from: escalation.from as SessionMode,
          to: escalation.to as SessionMode,
          pipeline: { instanceId, toStage },
        });
        return;
      }
      if (session) await syncSessionScene(session);
      if (!componentEnabledRef.current("scenes.surface")) return;
      const detail = await getPipelineInstance(instanceId);
      if (!componentEnabledRef.current("scenes.surface")) return;
      setPipelineDetail(detail);
      const stage = detail?.stages.find((s) => s.id === toStage);
      toast(t("stage.advanced", { stage: stage?.title ?? toStage }));
    },
    [pipelineDetail, resolveStageScene, syncSessionScene, toast, t],
  );

  /**
   * Advance into the next stage in a FRESH session (full-apply): the backend records the
   * transition and returns the stage scene's session plan; the created session is bound to the
   * stage via pendingPipelineBindRef once `session_created` arrives.
   */
  const advancePipelineInNewSession = useCallback(
    async (instanceId: string, toStage: string, confirmed = false) => {
      if (!componentEnabledRef.current("scenes.surface")) return;
      const outcome = await advancePipeline(
        instanceId,
        toStage,
        null,
        confirmed,
      );
      if (!componentEnabledRef.current("scenes.surface") || !outcome) return;
      if (outcome.escalation) {
        const stage = pipelineDetail?.stages.find((s) => s.id === toStage);
        setSceneEscalation({
          reference: resolveStageScene(stage?.scene_ref ?? toStage),
          kind: "pipeline_new",
          from: outcome.escalation.from as SessionMode,
          to: outcome.escalation.to as SessionMode,
          pipeline: { instanceId, toStage },
        });
        return;
      }
      const detail = await getPipelineInstance(instanceId);
      if (!componentEnabledRef.current("scenes.surface")) return;
      setPipelineDetail(detail);
      const stage = detail?.stages.find((s) => s.id === toStage);
      const reference = resolveStageScene(stage?.scene_ref ?? toStage);
      pendingSceneRef.current = reference;
      pendingPipelineBindRef.current = { instanceId, stageId: toStage };
      createSession();
      const params = outcome.session_plan;
      if (params?.provider) setProvider(params.provider);
      if (params?.use_worktree === false) setWorktreeBase(null);
      else if (params?.worktree_base) setWorktreeBase(params.worktree_base);
      applySceneChoice(reference, { confirmed: true });
      pendingSceneRef.current = reference;
      toast(t("stage.advancedNew", { stage: stage?.title ?? toStage }));
    },
    [
      applySceneChoice,
      createSession,
      pipelineDetail,
      resolveStageScene,
      toast,
      t,
    ],
  );

  /** Start a pipeline in the current project, binding the active session to its entry stage. */
  const startPipelineChoice = useCallback(
    async (reference: string) => {
      if (!componentEnabledRef.current("scenes.surface")) return;
      const session = activeSessionRef.current;
      const outcome = await startPipeline(reference, cwd || ".", session);
      if (!componentEnabledRef.current("scenes.surface") || !outcome) return;
      setPipelineDetail(outcome.detail);
      if (session) await syncSessionScene(session);
      if (!componentEnabledRef.current("scenes.surface")) return;
      // An entry scene looser than the session's posture applied nothing (refuse-and-report);
      // the binding landed, so confirming just soft-applies the entry scene.
      const escalation = outcome.applied_scene?.escalation;
      const entry = outcome.detail.stages.find((s) => s.state === "current");
      if (escalation && entry) {
        setSceneEscalation({
          reference: resolveStageScene(entry.scene_ref),
          kind: "soft",
          from: escalation.from as SessionMode,
          to: escalation.to as SessionMode,
        });
      }
      const title =
        pipelines.find((p) => p.reference === reference)?.title ?? reference;
      toast(t("stage.started", { pipeline: title }));
    },
    [cwd, pipelines, resolveStageScene, syncSessionScene, toast, t],
  );

  /**
   * Delegate an issue into a scene (R12): a fresh draft fully applied to that scene, opened with
   * the issue as a provenance-carrying block. Mirrors `restartInScene` rather than reusing it —
   * that flow is bound to the *active* scene and has no post-create insert seam.
   */
  const onDelegateIssue = useCallback(
    async (issue: Issue, sceneReference: string) => {
      if (!componentEnabledRef.current("scenes.surface")) return;
      const scene = scenesRef.current.find(
        (s) => s.reference === sceneReference,
      );
      if (!scene) return;
      const ctx = await issueContext(issue);
      if (!componentEnabledRef.current("scenes.surface")) return;
      const plan = await sceneSessionPlan(sceneReference, false);
      if (!componentEnabledRef.current("scenes.surface") || !plan) return;
      if (plan.escalation) {
        // Delegation never loosens the sandbox silently: same chokepoint dialog, same rule.
        // Confirming soft-applies the scene; delegation itself stays a deliberate re-run.
        setSceneEscalation({
          reference: sceneReference,
          kind: "soft",
          from: plan.escalation.from as SessionMode,
          to: plan.escalation.to as SessionMode,
        });
        return;
      }
      // Accountability trail: record the delegation now (session id lands on session_created).
      const delegationId = await recordIssueDelegation(
        issue.source,
        issue.id,
        issue.title,
        sceneReference,
        scene.title,
      );
      if (!componentEnabledRef.current("scenes.surface")) return;
      pendingSceneRef.current = sceneReference;
      pendingIssueInsertRef.current = {
        issue,
        context: ctx,
        delegatedScene: scene.title,
      };
      if (delegationId !== null) pendingDelegationRef.current = delegationId;
      createSession();
      const params = plan.params;
      if (params?.provider) setProvider(params.provider);
      if (params?.use_worktree === false) setWorktreeBase(null);
      else if (params?.worktree_base) setWorktreeBase(params.worktree_base);
      applySceneChoice(sceneReference, { confirmed: true });
      pendingSceneRef.current = sceneReference;
      // Consume after createSession's synchronous reset settles — the same tick ordering its own
      // focus timeout uses; the mounted editor survives New, so the ref is live by then.
      setTimeout(() => {
        const pending = pendingIssueInsertRef.current;
        pendingIssueInsertRef.current = null;
        if (pending) {
          insertIssueRef.current?.(
            pending.issue,
            pending.context,
            pending.delegatedScene,
          );
        }
      }, 0);
      setShowIssues(false);
      toast(
        t("issueDeleg.toast", { id: issue.id, scene: scene.title }),
        "success",
      );
      // Best-effort attribution on the tracker, fire-and-forget. GitHub only: Linear's comment
      // call needs the caller-held API token `listLinearIssues` uses, which this surface does
      // not hold — skipped rather than failing.
      if (issue.source === "github") {
        void commentIssue(
          cwd || ".",
          issue.source,
          issue.id,
          t("issueDeleg.commentBody", { scene: scene.title }),
        ).then((url) => {
          if (url && delegationId !== null)
            void setIssueDelegationComment(delegationId, url);
        });
      }
    },
    [applySceneChoice, createSession, cwd, toast, t],
  );

  const dispatchAction = useCallback(
    (action: string) => {
      switch (action) {
        case "run":
          void run();
          break;
        case "new_session":
          setShowTaskBoard(false);
          setShowPluginHub(false);
          setShowAutomations(false);
          createTaskDraft();
          break;
        case "cancel":
          if (activeSessionRef.current && running)
            void cancelTurn(activeSessionRef.current);
          else toast(t("toast.nothingRunning"));
          break;
        case "toggle_terminal":
          toggleDock("terminal");
          break;
        case "toggle_browser":
          toggleDock("browser");
          break;
        case "toggle_git":
          toggleDock("git");
          break;
        case "close_panel":
          manualDockTab(null);
          break;
        case "open_skill_picker":
          openSkillPickerRef.current?.();
          break;
        case "focus_editor":
          focusEditorRef.current?.();
          break;
        case "toggle_doc_mode":
          toggleDocMode(!docMode);
          break;
        case "open_settings":
          setShowTaskBoard(false);
          setShowPluginHub(false);
          setShowAutomations(false);
          setSettingsInitialTab("general");
          setShowSettings(true);
          break;
        case "open_command_palette":
          setShowPalette(true);
          break;
        case "open_source_control":
          openSourceControl();
          break;
        case "open_market":
          openPluginHub();
          break;
        case "open_usage":
          if (!componentEnabled("usage.settings")) {
            toast("Usage is disabled in Plugins.", "info");
            break;
          }
          setShowTaskBoard(false);
          setShowPluginHub(false);
          setShowAutomations(false);
          setSettingsInitialTab("usage");
          setShowSettings(true);
          break;
        case "open_files":
          if (componentEnabled("files.surface")) setShowFiles(true);
          else toast("Files are disabled in Plugins.", "info");
          break;
        case "open_finder":
          void openWorkingDirectory("finder");
          break;
        case "search_workspace":
          if (componentEnabled("search.modal")) setShowWorkspaceSearch(true);
          else toast("Workspace search is disabled in Plugins.", "info");
          break;
        case "open_issues":
          if (componentEnabled("issues.modal")) setShowIssues(true);
          else toast("Issues are disabled in Plugins.", "info");
          break;
        case "prev_session":
          stepSession(-1);
          break;
        case "next_session":
          stepSession(1);
          break;
        case "cycle_permission_mode": {
          if (policyChangeDisabled) break;
          const next = nextSessionMode(sessionMode(mode, sandbox));
          if (onSessionModeChange(next)) {
            toast(`Mode: ${t(`mode.${next}` as "mode.ask")}`);
          }
          break;
        }
        case "refresh_git":
          refreshGit();
          break;
        case "cycle_scene": {
          if (!componentEnabled("scenes.surface")) {
            toast("Scenes are disabled in Plugins.", "info");
            break;
          }
          const next = nextSceneInRing(
            [],
            scenesRef.current,
            activeSceneNameRef.current,
          );
          if (next) applySceneChoice(next);
          break;
        }
        case "open_scene_picker":
          if (componentEnabled("scenes.surface")) setShowScenePicker(true);
          else toast("Scenes are disabled in Plugins.", "info");
          break;
        case "open_mission_control":
          setShowMissionControl(true);
          break;
        default:
          // A binding pointing at an action this frontend doesn't implement.
          toast(`No handler for "${action}".`, "error");
          break;
      }
    },
    [
      run,
      createTaskDraft,
      running,
      mode,
      sandbox,
      policyChangeDisabled,
      onSessionModeChange,
      t,
      refreshGit,
      openSourceControl,
      openPluginHub,
      openWorkingDirectory,
      toggleDock,
      manualDockTab,
      toggleDocMode,
      docMode,
      stepSession,
      toast,
      applySceneChoice,
      componentEnabled,
    ],
  );

  // Hints come from the live keymap, so a rebind is reflected everywhere without touching labels.
  const hint = useCallback((action: string) => keyHint(bindings, action), [bindings]);
  const effectiveBindings = useMemo(
    () => [...bindings, ...projectActionBindings(scripts)],
    [bindings, scripts],
  );

  const paletteCommands: Command[] = [
    {
      id: "run",
      label: "Run prompt",
      hint: hint("run"),
      run: () => void run(),
    },
    {
      id: "new",
      label: "New task",
      hint: hint("new_session"),
      run: () => {
      setShowTaskBoard(false);
      setShowPluginHub(false);
      setShowAutomations(false);
      createTaskDraft();
      },
    },
    {
      id: "sc",
      label: "Source control",
      hint: hint("open_source_control"),
      run: openSourceControl,
    },
    {
      id: "checkpoint",
      label: "Checkpoint now",
      run: () => void doCheckpoint(),
    },
    {
      id: "market",
      label: "Open Plugin Hub",
      hint: hint("open_market"),
      run: openPluginHub,
    },
    { id: "automations", label: t("automations.title"), run: openAutomations },
    { id: "taskboard", label: t("taskboard.open"), run: openTaskBoard },
    {
      id: "issues",
      label: "GitHub / Linear issues",
      hint: hint("open_issues"),
      run: () => setShowIssues(true),
    },
    {
      id: "files",
      label: "Browse workspace files",
      hint: hint("open_files"),
      run: () => setShowFiles(true),
    },
    {
      id: "finder",
      label: t("action.open_finder"),
      hint: hint("open_finder"),
      run: () => void openWorkingDirectory("finder"),
    },
    {
      id: "search",
      label: "Search workspace contents",
      hint: hint("search_workspace"),
      run: () => setShowWorkspaceSearch(true),
    },
    {
      id: "usage",
      label: "Usage (5h / week / month)",
      hint: hint("open_usage"),
      run: () => {
        setShowTaskBoard(false);
        setShowPluginHub(false);
        setShowAutomations(false);
        setSettingsInitialTab("usage");
        setShowSettings(true);
      },
    },
    {
      id: "preview",
      label: "Preview compiled prompt",
      run: () => void doPreview(),
    },
    {
      id: "docmode",
      label: docMode
        ? "Collapse the document"
        : "Expand the document to full height",
      hint: hint("toggle_doc_mode"),
      run: () => toggleDocMode(!docMode),
    },
    {
      id: "skills",
      label: "Insert a skill",
      hint: hint("open_skill_picker"),
      run: () => openSkillPickerRef.current?.(),
    },
    {
      id: "template-from-last",
      label: t("templateFrom.palette"),
      // No-op with no history: the most recent user turn's prompt is the source.
      run: () => {
        const last = [...turns]
          .reverse()
          .find((turn) => turn.prompt.trim().length > 0);
        if (last) setTemplateDraft(last.prompt);
      },
    },
    {
      id: "rail",
      label: displayedRailCollapsed
        ? "Expand the sidebar"
        : "Collapse the sidebar",
      run: toggleDisplayedRail,
    },
    { id: "remote", label: "Remote control", run: () => setShowRemote(true) },
    {
      id: "settings",
      label: "Open settings",
      hint: hint("open_settings"),
      run: () => {
        setSettingsInitialTab("general");
        setShowSettings(true);
      },
    },
    {
      id: "terminal",
      label: "Toggle terminal",
      hint: hint("toggle_terminal"),
      run: () => toggleDock("terminal"),
    },
    {
      id: "browser",
      label: "Toggle browser",
      hint: hint("toggle_browser"),
      run: () => toggleDock("browser"),
    },
    {
      id: "filespanel",
      label: "Toggle file tree",
      run: () => toggleDock("files"),
    },
    {
      id: "gitpanel",
      label: "Toggle git panel",
      hint: hint("toggle_git"),
      run: () => toggleDock("git"),
    },
    {
      id: "git",
      label: "Refresh git status",
      hint: hint("refresh_git"),
      run: refreshGit,
    },
    {
      id: "perm",
      label: "Cycle approval mode",
      hint: hint("cycle_permission_mode"),
      run: () => dispatchAction("cycle_permission_mode"),
    },
    {
      id: "scene",
      label: t("scene.pickerTitle"),
      hint: hint("cycle_scene"),
      run: () => setShowScenePicker(true),
    },
    {
      id: "scene-studio",
      label: t("sceneEditor.manage"),
      run: () => {
      setSceneEditorRequest(null);
      setShowSceneStudio(true);
      },
    },
    {
      id: "mission",
      label: t("action.open_mission_control"),
      hint: hint("open_mission_control"),
      run: () => setShowMissionControl(true),
    },
    ...scenes.map((s) => ({
      id: `scene-${s.reference}`,
      label: `${t("scene.chip")}: ${s.title}`,
      run: () => applySceneChoice(s.reference),
    })),
    ...pipelines.map((p) => ({
      id: `pipeline-${p.reference}`,
      label: t("stage.startPipeline", { pipeline: p.title }),
      run: () => void startPipelineChoice(p.reference),
    })),
    ...scripts.map((s) => ({
      id: `script-${s.id}`,
      label: `Run script: ${s.name || s.id}`,
      hint: s.command,
      run: () => runProjectAction(s),
    })),
    ...sessions.map((s) => ({
      id: `sess-${s.id}`,
      identity: `session-${s.id}`,
      label: `Session: ${s.title}`,
      hint: displayProvider(s.provider),
      run: () => void selectSession(s.id),
    })),
  ].filter((command) => {
    if (["sc", "checkpoint", "gitpanel", "git"].includes(command.id)) {
      return componentEnabled("git.surface");
    }
    if (command.id === "automations")
      return componentEnabled("automation.page");
    if (command.id === "issues") return componentEnabled("issues.modal");
    if (["files", "filespanel"].includes(command.id))
      return componentEnabled("files.surface");
    if (command.id === "search") return componentEnabled("search.modal");
    if (command.id === "usage") return componentEnabled("usage.settings");
    if (command.id === "remote") return componentEnabled("remote.modal");
    if (command.id === "terminal") return componentEnabled("terminal.dock");
    if (command.id === "browser") return componentEnabled("browser.dock");
    if (
      command.id === "scene" ||
      command.id === "scene-studio" ||
      command.id.startsWith("scene-") ||
      command.id.startsWith("pipeline-")
    ) {
      return componentEnabled("scenes.surface");
    }
    return true;
  });

  useEffect(() => {
    canvasFeatureState()
      .then((state) => setCanvasFeature(state))
      .catch(() => {
        setCanvasFeature({
          feature: "CODETWO_CANVAS_INPUT_V1",
          enabled: false,
          status: "not production-enabled",
        });
      });
    getKeymap()
      .then(setBindings)
      .catch(() => {});
    // Open on the project used last. Failing that, register the directory the app started in, so
    // the picker is never empty and the first session has somewhere real to run.
    setCallProjectPath(null);
    listProjects()
      .then(async (list) => {
        setProjects(list);
        if (list.length > 0) {
          // The list is in a fixed order, so "used last" is a property of the rows, not their
          // position — read it off `last_opened_at` rather than taking the first one.
          const last = list.reduce((a, b) =>
            b.last_opened_at > a.last_opened_at ? b : a,
          );
          activeProjectRef.current = last.path;
          setCallProjectPath(normalizePluginProjectPath(last.path));
          setActiveProject(last.path);
          setCwd(last.path);
          setWorktreeBase(
            projectSwitchWorktreeBaseline(last.default_worktree_mode),
          );
          setProjectBootstrapComplete(true);
          return;
        }
        const here = await defaultCwd();
        setCwd(here);
        const resolved = await addProject(here).catch(() => null);
        if (resolved) {
          activeProjectRef.current = resolved;
          setCallProjectPath(normalizePluginProjectPath(resolved));
          setActiveProject(resolved);
          listProjects()
            .then(setProjects)
            .catch(() => {});
        }
        setProjectBootstrapComplete(true);
      })
      .catch(() => {
        setProjectBootstrapComplete(true);
        defaultCwd()
          .then(setCwd)
          .catch(() => {});
      });
    // The app opens on a blank page, so put the caret in it. Deferred one tick: the editor installs
    // its focus handle in its own mount effect.
    setTimeout(() => focusEditorRef.current?.(), 0);
  }, []);

  useEffect(() => {
    refreshGit();
    if (showSourceControl) refreshCheckpoints();
  }, [refreshGit, refreshCheckpoints, activeSession, showSourceControl]);

  useEffect(() => {
    listProjectScripts(cwd || ".")
      .then(setScripts)
      .catch(() => setScripts([]));
  }, [cwd]);

  useEffect(() => {
    const request = ++worktreeOptionsRequestRef.current;
    const source = (activeProject ?? cwd) || ".";
    setWorktreeOptions([]);
    setWorktreeOptionsLoading(true);
    void listWorktreeBaselines(source)
      .then((options) => {
        if (request === worktreeOptionsRequestRef.current)
          setWorktreeOptions(options);
      })
      .catch(() => {
        if (request === worktreeOptionsRequestRef.current)
          setWorktreeOptions([]);
      })
      .finally(() => {
        if (request === worktreeOptionsRequestRef.current)
          setWorktreeOptionsLoading(false);
      });
  }, [activeProject, cwd]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (capturing) {
        if (isModifierOnly(e)) return;
        e.preventDefault();
        // Escape aborts the capture rather than binding Escape to this action.
        if (e.key === "Escape") {
          setCapturing(null);
          return;
        }
        void setKeymap(capturing, comboFromEvent(e))
          .then(() => getKeymap().then(setBindings))
          .catch((err) => toast(`Could not save shortcut: ${err}`, "error"));
        setCapturing(null);
        return;
      }
      const action = actionForEvent(e, effectiveBindings);
      if (!action) return;
      // Escape is also how dialogs and the suggestion menu close; let those win when one is open.
      if (
        e.key === "Escape" &&
        document.querySelector('[role="dialog"],.bn-suggestion-menu')
      )
        return;
      e.preventDefault();
      if (action.startsWith("project_action:")) {
        const script = scripts.find((candidate) => `project_action:${candidate.id}` === action);
        if (script) runProjectAction(script);
        return;
      }
      dispatchAction(action);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [capturing, dispatchAction, effectiveBindings, runProjectAction, scripts, toast]);

  // Restore one shortcut to its shipped default.
  const resetBinding = useCallback(
    (action: string) => {
      const def = DEFAULT_KEYMAP.find(([a]) => a === action);
      if (!def) return;
      void setKeymap(action, def[1])
        .then(() => getKeymap().then(setBindings))
        .catch((err) => toast(`Could not reset shortcut: ${err}`, "error"));
    },
    [toast],
  );

  // Restore every shortcut — settings' "Restore defaults" on the keybindings tab.
  const resetAllBindings = useCallback(() => {
    void Promise.all(DEFAULT_KEYMAP.map(([a, key]) => setKeymap(a, key)))
      .then(() => getKeymap().then(setBindings))
      .catch((err) => toast(`Could not reset shortcuts: ${err}`, "error"));
  }, [toast]);

  // Discarding a worktree deletes uncommitted work, so it confirms natively first. Success
  // feedback arrives through the broadcast `worktree_discarded` event, not from this call.
  const discardWorktreeForSession = useCallback(
    async (session: SessionInfo) => {
      const path = session.worktree_path;
      if (!path || session.worktree_discarded) return;
      if (!(await confirmNative(t("worktree.discardConfirm", { path }))))
        return;
      try {
        await discardSessionWorktree(session.id);
        refreshSessions();
      } catch (error) {
        toast(t("worktree.discardFailed", { error: String(error) }), "error");
      }
    },
    [refreshSessions, t, toast],
  );

  const sessionConfig: SessionConfig = {
    providers,
    providersStatus,
    provider,
    onProvider: (p) => {
      providerPinned.current = true;
      setProvider(p);
      if (activeSessionRef.current === null) {
        setCurrentModel(null);
        setDefaultModel(null);
        setConfigOptions([]);
      }
      if (canvasProviderRetrySessionRef.current !== null) {
        // ACP sessions keep their provider. Switching after an asynchronous Canvas image failure
        // therefore stages a fresh session instead of silently resubmitting to the failed one.
        canvasProviderRetrySessionRef.current = null;
        forceNewSessionForCanvasRetryRef.current = true;
        activeSessionRef.current = null;
        activeSessionProvenanceRef.current = null;
        setActiveSessionReceipt(null);
        setActiveSession(null);
        setTurns([]);
        setModels([]);
        setCurrentModel(null);
        setDefaultModel(null);
      }
    },
    onReloadProviders: refreshProviders,
    mode,
    sandbox,
    modeChangeDisabled: policyChangeDisabled,
    onSessionMode: onSessionModeChange,
    worktreeBase,
    activeWorktreeBaseline,
    activeWorktreeUnknown,
    worktreeOptions,
    worktreeOptionsLoading,
    onWorktreeBase: setWorktreeBase,
    planMode,
    onPlan: setPlanMode,
    memoryRead,
    memoryWrite,
    memoryEnabled: memorySettingsEnabled,
    onMemoryPolicy: onMemoryPolicyChange,
    hasSession: activeSession !== null,
    scenesEnabled: scenesSurfaceEnabled,
    scenes: scenesSurfaceEnabled ? scenes : [],
    activeScene: scenesSurfaceEnabled
      ? (scenes.find((s) => s.reference === activeSceneName) ?? null)
      : null,
    autoScene: scenesSurfaceEnabled && autoScene,
    onAutoScene: setAutoSceneChoice,
    onScene: (reference, strength) => {
      if (strength === "full") {
        if (reference !== null) {
          setActiveSceneName(reference);
          void restartInScene();
        }
      } else {
        applySceneChoice(reference);
      }
    },
    onManageScenes: () => {
      setSceneEditorRequest(null);
      setShowSceneStudio(true);
    },
    sceneCustomized:
      scenesSurfaceEnabled &&
      (() => {
      const scene = scenes.find((s) => s.reference === activeSceneName);
      if (!scene) return false;
      return sceneCustomized(scene, {
        mode: sessionMode(mode, sandbox),
        memoryRead,
        memoryWrite,
        planFirst: planMode,
        provider,
        model: currentModel,
      });
    })(),
    scenePendingFields: scenesSurfaceEnabled ? scenePendingFields : [],
    onRestartInScene: () => void restartInScene(),
  };

  const handleSceneSaved = (saved: SceneInfo) => {
    if (!componentEnabledRef.current("scenes.surface")) return;
    const previous =
      sceneEditorRequest?.kind === "edit"
      ? sceneEditorRequest.scene.reference
      : null;
    if (
      previous &&
      previous === activeSceneNameRef.current &&
      previous !== saved.reference
    ) {
      activeSceneNameRef.current = saved.reference;
      setActiveSceneName(saved.reference);
      if (activeSession) {
        sceneBySessionRef.current.set(activeSession, saved.reference);
        void setSessionScene(activeSession, saved.reference, false);
      }
    }
    void refreshScenes();
    setSceneEditorRequest(null);
  };

  const handleSceneDeleted = (reference: string) => {
    if (!componentEnabledRef.current("scenes.surface")) return;
    if (reference === activeSceneNameRef.current) {
      activeSceneNameRef.current = null;
      setActiveSceneName(null);
      setScenePendingFields([]);
      if (activeSession) {
        sceneBySessionRef.current.delete(activeSession);
        void setSessionScene(activeSession, null, false);
      }
    }
    void refreshScenes();
    setSceneEditorRequest(null);
  };

  return (
    <div
      className={cn(
        "app-shell flex h-screen flex-col overflow-hidden text-foreground",
        sideChatOpen && "workspace-with-side-chat",
      )}
      style={{ "--side-chat-width": `${appliedSideChatWidth}px` } as CSSProperties}
    >
      {/* Settings takes the whole window — its own nav rail replaces the session rail, and the
          Back row at its foot is the way home. */}
      {showSettings ? (
        <SettingsPage
          initialTab={settingsInitialTab}
          bindings={bindings}
          capturing={capturing}
          onCapture={setCapturing}
          onReset={resetBinding}
          onResetAll={resetAllBindings}
          providers={providers}
          provider={provider}
          projectPath={activeProject ?? cwd}
          project={
            projects.find((project) => project.path === activeProject) ?? null
          }
          projects={projects}
          onProjectWorktreeMode={updateProjectWorktreeMode}
          onOpenSession={(id) => {
            setShowSettings(false);
            void selectSession(id);
          }}
          memoryEnabled={memorySettingsEnabled}
          onClose={() => {
            setShowSettings(false);
            setCapturing(null);
          }}
        />
      ) : showSceneStudio && scenesSurfaceEnabled ? (
        <SceneStudio
          scenes={scenes}
          active={
            scenes.find((scene) => scene.reference === activeSceneName) ?? null
          }
          request={sceneEditorRequest}
          providers={providers}
          skills={skills}
          cwd={cwd || "."}
          onRequest={setSceneEditorRequest}
          onScene={(reference) => applySceneChoice(reference)}
          onSaved={handleSceneSaved}
          onDeleted={handleSceneDeleted}
          onClose={() => {
            setSceneEditorRequest(null);
            setShowSceneStudio(false);
          }}
        />
      ) : (
      // page-in makes the return from settings (which remounts this whole subtree) a transition
      // rather than a cut, and doubles as the app's own opening animation.
      <div className="animate-page-in flex min-h-0 flex-1">
        {/* ---------------- sessions rail ---------------- */}
        {narrowLayout && narrowRailOpen && (
          <button
            type="button"
            aria-label={t("rail.collapse")}
            className="fixed inset-0 z-40 bg-black/35"
            onClick={() => setNarrowRailOpen(false)}
          />
        )}
        <SessionRail
          projects={projects}
          activeProject={activeProject}
          onSelectProject={(path) => {
            setShowAutomations(false);
            setShowPluginHub(false);
            selectProject(path);
            if (narrowLayout) setNarrowRailOpen(false);
          }}
          onAddProject={() => void addProjectFolder()}
            onRenameProject={(p, name) =>
              void renameProject(p, name).then(refreshProjects)
            }
          onRemoveProject={(p) => {
            void removeProject(p).then(() => {
              try {
                const history = loadBrowserHistory(window.localStorage);
                  saveBrowserHistory(
                    window.localStorage,
                    removeBrowserProject(history, p),
                  );
              } catch {
                // Browser history is a convenience; a blocked local store must not block removal.
              }
              refreshProjects();
              // Dropping the project you were in leaves nothing selected; fall back to the next one
              // rather than stranding the rail on a project that's no longer listed.
              if (p === activeProject) {
                const next = projects.find((x) => x.path !== p);
                if (next) selectProject(next.path);
                else {
                  activeProjectRef.current = null;
                  setCallProjectPath(null);
                  setActiveProject(null);
                }
              }
            });
          }}
          sessions={sessions}
          archivedSessions={archivedSessions}
          previews={previews}
          activeSession={activeSession}
          runningSessions={runningSessions}
          onSelect={(id) => {
            setShowTaskBoard(false);
            setShowPluginHub(false);
            setShowAutomations(false);
            void selectSession(id);
            if (narrowLayout) setNarrowRailOpen(false);
          }}
          onNew={() => {
            setShowTaskBoard(false);
            setShowPluginHub(false);
            setShowAutomations(false);
            createTaskDraft();
            if (narrowLayout) setNarrowRailOpen(false);
          }}
          onNewTemporary={() => {
            setShowTaskBoard(false);
            setShowPluginHub(false);
            setShowAutomations(false);
            createTemporarySession();
            if (narrowLayout) setNarrowRailOpen(false);
          }}
            onRename={(id, title) =>
              void renameSession(id, title).then(refreshSessions)
            }
            onPin={(id, pinned) =>
              void pinSession(id, pinned).then(refreshSessions)
            }
            onArchive={(id, archived) =>
              void archiveSession(id, archived).then(refreshSessions)
            }
          onDiscardWorktree={(s) => void discardWorktreeForSession(s)}
          displayProvider={displayProvider}
          onOpenMarket={() => {
            setShowTaskBoard(false);
            openPluginHub();
          }}
          onOpenAutomations={openAutomations}
          width={railWidth}
          onWidth={setRailWidth}
          newHint={hint("new_session")}
          searchHint={hint("open_command_palette")}
          onOpenSearch={() => setShowPalette(true)}
          onOpenSettings={() => {
            setShowTaskBoard(false);
            setShowPluginHub(false);
            setShowAutomations(false);
            setSettingsInitialTab("general");
            setShowSettings(true);
          }}
          collapsed={displayedRailCollapsed}
          overlay={narrowLayout}
          onToggleCollapse={toggleDisplayedRail}
          taskBoardOpen={showTaskBoard}
          onOpenTaskBoard={() => {
            if (showTaskBoard) setShowTaskBoard(false);
            else openTaskBoard();
          }}
          automationsOpen={showAutomations}
          pluginHubOpen={showPluginHub}
          quickQuota={railQuickQuota}
          quickQuotaLoading={quickQuotaLoading}
          quickQuotaProviderName={quickQuotaProviderName}
          onOpenUsage={() => {
            setShowTaskBoard(false);
            setShowPluginHub(false);
            setShowAutomations(false);
            setSettingsInitialTab("usage");
            setShowSettings(true);
          }}
            pluginActions={
            <PluginUiSlot
              slot="rail.features"
              contributions={pluginUiActions["rail.features"]}
              onInvoke={async (contribution) => {
                await invokePluginAction(contribution);
                if (narrowLayout) setNarrowRailOpen(false);
              }}
            />
            }
        />

          {showAutomations && (
            componentEnabled("automation.page") ? (
              <AutomationsPage
            projects={projects}
            providers={providers}
            defaultProject={(activeProject ?? cwd) || "."}
            defaultProvider={provider}
            onOpenSession={(session) => {
              setShowAutomations(false);
              void selectSession(session);
            }}
              />
            ) : null
          )}

        {showTaskBoard && (
          <TaskBoardPage
            sessions={taskBoardSessions}
            onOpenSession={(id) => {
              setShowTaskBoard(false);
              void selectSession(id);
            }}
            onStartTask={startBoardTask}
          />
        )}

        {showPluginHub && !showBundlePluginTools && (
          <PluginManagerPage
              plugins={localizedPluginManagerModel.plugins}
              components={localizedPluginManagerModel.components}
              marketplaceItems={localizedPluginManagerModel.marketplaceItems}
              headerLeadingAction={
                displayedRailCollapsed ? (
                  <IconAction
                    icon={PanelLeft}
                    label={t("rail.expand")}
                    onClick={toggleDisplayedRail}
                  />
                ) : undefined
              }
              labels={pluginManagerLabels}
            scope={pluginManagerScope}
            projects={pluginManagerProjects}
              recovery={
                (selectedManagedCatalog ?? managedUserCatalog)?.recovery
              }
            onScopeChange={(scope) => {
                const normalized =
                  scope.kind === "user"
                ? scope
                    : {
                        kind: "project" as const,
                        projectPath: normalizePluginProjectPath(
                          scope.projectPath,
                        ),
                      };
              setPluginManagerScope(normalized);
              void loadManagedCatalog(normalized).catch((error) => {
                  toast(
                    t("pluginManager.scopeLoadFailed", {
                      error: String(error),
                    }),
                    "error",
                  );
              });
            }}
            onPlanChange={planManagerChange}
            onApplyChange={applyManagerChange}
            onSaveConfig={saveManagerConfig}
            onResetPlugin={async (pluginId, scope) => {
              await resetManagedPlugin(pluginId, toManagedPluginScope(scope));
              await refreshPluginManagerData(scope);
                toast(pluginManagerLabels.settingsReset, "success");
            }}
            onInstallMarketplaceItem={async ({ itemId, scope }) => {
              if (scope.kind !== "user") {
                  throw new Error(t("pluginManager.marketplaceUserOnly"));
              }
              const id = itemId.replace(/^market:/, "");
              await marketInstall(id);
              await refreshPluginManagerData(scope);
              toast(t("pluginHub.componentInstalledToast"), "success");
            }}
            onRefreshMarketplace={async () => {
              await refreshPluginManagerData(pluginManagerScope);
            }}
            onImportGithub={async (repository) => {
              const result = await githubImportPlugin(repository);
              await refreshPluginManagerData(pluginManagerScope);
                toast(
                  t("pluginHub.pluginInstalledToast", {
                    name: result.plugin.name,
                  }),
                  "success",
                );
              return {
                pluginId: result.plugin.id,
                name: result.plugin.name,
                version: result.plugin.version,
              };
            }}
            onSetBundleEnabled={async (pluginId, enabled) => {
              await setPluginEnabled(pluginId, enabled);
              await refreshPluginManagerData(pluginManagerScope);
                toast(
                  t(
                    enabled
                      ? "pluginHub.pluginEnabledToast"
                      : "pluginHub.pluginDisabledToast",
                  ),
                  "success",
                );
            }}
            onSetBundleTrusted={async (pluginId, trusted) => {
              await setPluginTrusted(pluginId, trusted);
              await refreshPluginManagerData(pluginManagerScope);
                toast(
                  t(
                    trusted
                      ? "pluginHub.pluginTrustedToast"
                      : "pluginHub.pluginUntrustedToast",
                  ),
                  "success",
                );
            }}
            onUninstallBundle={async (pluginId, keepData) => {
              await uninstallPlugin(pluginId, keepData);
              await refreshPluginManagerData(pluginManagerScope);
              toast(t("pluginHub.pluginUninstalledToast"), "success");
            }}
            onOpenBundleTools={() => setShowBundlePluginTools(true)}
          />
        )}

        {showPluginHub && showBundlePluginTools && (
          <PluginHub
            plugins={plugins}
            skills={skills}
            items={market}
            cwd={cwd || "."}
            onUse={(skill) => {
              setShowPluginHub(false);
              setTimeout(() => insertSkillRef.current?.(skill), 0);
            }}
            onInstallMarket={async (id) => {
              try {
                await marketInstall(id);
                setMarket(await marketCatalog());
                await refreshSkills();
                toast(t("pluginHub.componentInstalledToast"), "success");
              } catch (error) {
                  toast(
                    t("pluginHub.installFailed", { error: String(error) }),
                    "error",
                  );
                throw error;
              }
            }}
            onUninstallSkill={async (id) => {
              try {
                await deleteSkill(id);
                setMarket(await marketCatalog());
                await refreshSkills();
                toast(t("pluginHub.componentUninstalledToast"), "success");
              } catch (error) {
                  toast(
                    t("pluginHub.uninstallFailed", { error: String(error) }),
                    "error",
                  );
                throw error;
              }
            }}
            onImportGithub={async (repository) => {
              const result = await githubImportPlugin(repository);
              setPlugins(await listPlugins());
              await refreshSkills();
                toast(
                  t("pluginHub.pluginInstalledToast", {
                    name: result.plugin.name,
                  }),
                  "success",
                );
              return result;
            }}
            onOpenMarketplace={pickPluginMarketplace}
              onInstallMarketplacePlugin={async (
                marketplacePath,
                pluginName,
              ) => {
              try {
                  const result = await installMarketplacePlugin(
                    marketplacePath,
                    pluginName,
                  );
                setPlugins(await listPlugins());
                await refreshSkills();
                  toast(
                    t("pluginHub.pluginInstalledToast", {
                      name: result.plugin.name,
                    }),
                    "success",
                  );
                return result;
              } catch (error) {
                  toast(
                    t("pluginHub.installFailed", { error: String(error) }),
                    "error",
                  );
                throw error;
              }
            }}
            onUninstallPlugin={async (id, keepData = false) => {
              try {
                await uninstallPlugin(id, keepData);
                setPlugins(await listPlugins());
                await refreshSkills();
                toast(t("pluginHub.pluginUninstalledToast"), "success");
              } catch (error) {
                  toast(
                    t("pluginHub.uninstallFailed", { error: String(error) }),
                    "error",
                  );
                throw error;
              }
            }}
            onSetPluginEnabled={async (id, enabled) => {
              try {
                await setPluginEnabled(id, enabled);
                setPlugins(await listPlugins());
                await refreshSkills();
                  toast(
                    t(
                      enabled
                        ? "pluginHub.pluginEnabledToast"
                        : "pluginHub.pluginDisabledToast",
                    ),
                    "success",
                  );
              } catch (error) {
                  toast(
                    t("pluginHub.stateFailed", { error: String(error) }),
                    "error",
                  );
                throw error;
              }
            }}
            onSetPluginTrusted={async (id, trusted) => {
              try {
                await setPluginTrusted(id, trusted);
                setPlugins(await listPlugins());
                  toast(
                    t(
                      trusted
                        ? "pluginHub.pluginTrustedToast"
                        : "pluginHub.pluginUntrustedToast",
                    ),
                    "success",
                  );
              } catch (error) {
                  toast(
                    t("pluginHub.stateFailed", { error: String(error) }),
                    "error",
                  );
                throw error;
              }
            }}
            onApplyScaffold={async (pluginId, scaffoldId) => {
              try {
                  const result = await applyPluginScaffold(
                    pluginId,
                    scaffoldId,
                    cwd || ".",
                  );
                  toast(
                    t("pluginHub.scaffoldInstalledToast", {
                      count: result.files,
                    }),
                    "success",
                  );
                return result;
              } catch (error) {
                  toast(
                    t("pluginHub.scaffoldFailed", { error: String(error) }),
                    "error",
                  );
                throw error;
              }
            }}
            onNew={() => setSkillDraft({ name: "", text: "" })}
            onClose={() => setShowBundlePluginTools(false)}
          />
        )}

        <div
          ref={sessionWorkspaceRef}
            aria-hidden={
              showTaskBoard || showPluginHub || showAutomations || undefined
            }
            className={
              showTaskBoard || showPluginHub || showAutomations
                ? "hidden"
                : "contents"
            }
        >
          <div
            data-workspace-stack
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            {/* ---------------- the session column ---------------- */}
            <main
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
              ref={mainRef}
            >
          {/* Also a window drag region: the overlay title bar draws nothing to grab. Buttons and
              other children stay clickable — only elements carrying the attribute start a drag. */}
          {/* Symmetric block padding keeps the 28px controls optically centred on the 48px title
              line, matching the rail and dock headers. With the rail collapsed, the inset clears
              the traffic lights and the expand button takes the wordmark's place. */}
          <header
            className={cn(
              "electrobun-webkit-app-region-drag flex shrink-0 items-center gap-2 border-b py-2.5 pr-4",
              displayedRailCollapsed ? "pl-[78px]" : "pl-4",
            )}
          >
            {displayedRailCollapsed && (
                  <IconAction
                    icon={PanelLeft}
                    label={t("rail.expand")}
                    onClick={toggleDisplayedRail}
                  />
            )}
            {/* Breadcrumb, reference-style: project / thread. */}
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            {activeProjectName && (
              <>
                <span className="electrobun-webkit-app-region-drag max-w-40 truncate text-ui text-muted-foreground">
                  {activeProjectName}
                </span>
                    <span className="shrink-0 text-ui text-muted-foreground/50">
                      /
                    </span>
              </>
            )}
            {activeBoardTask ? (
              <button
                type="button"
                className="rounded p-0.5 text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label={t("taskboard.open")}
                title={activeBoardTask.id}
                onClick={openTaskBoard}
              >
                <SquareKanban className="size-3.5" aria-hidden />
              </button>
            ) : null}
            <span className="electrobun-webkit-app-region-drag max-w-96 truncate text-ui font-medium">
              {activeTitle}
            </span>
            {activeBoardTask && activeSessionTitle ? (
              <>
                <span className="shrink-0 text-ui text-muted-foreground/50">/</span>
                <span className="electrobun-webkit-app-region-drag max-w-64 truncate text-fine text-muted-foreground">
                  {activeSessionTitle}
                </span>
              </>
            ) : null}
            {!activeBoardTask && activeSession ? (
              <span className="rounded-full bg-fill-rest px-2 py-0.5 text-cap text-muted-foreground">
                {t("rail.newTemporarySession")}
              </span>
            ) : null}

            <div className="electrobun-webkit-app-region-drag flex-1" />

            <PluginUiSlot
              slot="session.header"
              contributions={pluginUiActions["session.header"]}
              onInvoke={invokePluginAction}
            />

            {/* Full-page mode hides the transcript, so the header carries the only sign that a turn
                is in flight — and the way back to the answer without leaving the mode for good. */}
            {docMode && (running || turns.length > 0 || sessionLoading) && (
              <button
                onClick={() => toggleDocMode(false)}
                className="mr-1 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-fine text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                title={t("header.showTranscript", { count: turns.length })}
              >
                {(running || sessionLoading) && (
                  <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                )}
                {sessionLoading
                  ? t("session.loading")
                  : awaitingInput
                    ? t("session.awaitingInput")
                    : running
                      ? t("header.running")
                    : t("header.turns", { count: turns.length })}
              </button>
            )}

            <SessionHeaderActions
              canCommit={git?.is_repo === true}
              terminalActive={terminalOpen}
              panelActive={dockTab !== null}
              sideChatActive={sideChatOpen}
              actions={scripts}
              onRunAction={runProjectAction}
              onAddAction={() => setShowActionDialog(true)}
              onOpen={() => void openWorkingDirectory("cursor")}
              onOpenCursor={() => void openWorkingDirectory("cursor")}
              onOpenAntigravity={() => void openWorkingDirectory("antigravity")}
              onOpenFinder={() => void openWorkingDirectory("finder")}
              finderHint={hint("open_finder")}
              onCommit={openSourceControl}
              onCheckpoint={() => void doCheckpoint()}
              onPush={() => void doPush().catch(() => {})}
              onToggleTerminal={() => toggleDock("terminal")}
              onToggleSideChat={() => {
                setSideChatOpen((current) => {
                  const next = !current;
                  if (next) manualDockTab(null);
                  return next;
                });
              }}
              onTogglePanel={() => {
                setSideChatOpen(false);
                manualDockTab(dockTab ? null : "home");
                setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
              }}
            />
          </header>

          {/* Horizontal stage track (R9): rendered above the transcript only while the active
              session is bound to a pipeline instance. */}
          {scenesSurfaceEnabled && pipelineDetail && activeSession && (
            <StageTrack
              detail={pipelineDetail}
              onSelectSession={(id) => void selectSession(id)}
            />
          )}

          {/* The same transcript tree serves the main column and document side panel. Keeping the
              rendering path unified prevents the two modes from drifting, while the scroll
              controller preserves the reader's position as streamed content arrives. */}
              <div
                className={cn(
                  "flex min-h-0 flex-1",
                  docMode ? "flex-row" : "flex-col",
                )}
              >
            {(turns.length > 0 || running || sessionLoading) && (
              <TranscriptPane
                variant={docMode ? "side" : "main"}
                turns={turns}
                loading={sessionLoading}
                hasEarlier={transcriptNextBefore !== null}
                loadingEarlier={loadingEarlier}
                onLoadEarlier={() => void loadEarlierTranscript()}
                scroll={transcriptScroll}
                onOpenPlanAsDocument={openPlanAsDocument}
                onPinPlanArtifact={pinPlanArtifact}
                canPinPlan={scenesSurfaceEnabled && canPinPlan}
                onSaveTemplate={openTemplateDraft}
                petAnimation={petAnimation}
                voiceEnabled={voiceComposerEnabled}
                onVoiceText={(text) => insertTextRef.current?.(text)}
                onAddSelection={addSelectedText}
                onExplainSelection={explainSelectedText}
                onAskSelectionInSideChat={askSelectedTextInSideChat}
                    before={
                  <PluginUiSlot
                    slot="transcript.before"
                    contributions={pluginUiActions["transcript.before"]}
                    onInvoke={invokePluginAction}
                  />
                    }
              />
            )}

            {/* One wrapper in both modes so the Composer keeps its tree position across the toggle —
                BlockNote unmounts (and takes the draft with it) if the structure around it changes.
                Compact, the wrapper is just the composer's slot; expanded, it is the document column
                inside the outer transcript/document row. Keep this wrapper vertical so banners and
                plugin contributions remain above the document instead of consuming its width. An empty
                thread is the hero state: the heading and the card sit together in the centre. */}
            <div
              className={cn(
                "flex",
                docMode
                  ? "order-1 min-h-0 min-w-0 flex-1 flex-col"
                  : turns.length === 0 && !sessionLoading
                    ? "order-2 min-h-0 flex-1 flex-col justify-center-safe overflow-y-auto pb-16 pt-6"
                    : "order-2 shrink-0 flex-col",
              )}
            >
              {/* "What should we build in <project>?" — the project name is the project switcher. */}
              {!docMode && turns.length === 0 && !sessionLoading && (
                <h1 className="animate-rise-in mb-8 px-8 text-center text-[26px] font-semibold tracking-[-0.01em]">
                  {t("transcript.greetingIn")}{" "}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          className="rounded-(--ds-radius-micro) underline decoration-muted-foreground/40 decoration-dotted underline-offset-[7px] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          title={activeProject ?? undefined}
                        >
                          {activeProjectName ?? t("rail.noProject")}
                        </button>
                      }
                    />
                    <DropdownMenuContent side="top" align="center" className="w-60">
                      {projects.length > 0 && (
                        <>
                          <DropdownMenuGroup>
                            {projects.map((project) => (
                              <DropdownMenuItem
                                key={project.path}
                                onClick={() => selectProject(project.path)}
                              >
                                <Folder />
                                <span className="min-w-0 flex-1 truncate" title={project.path}>
                                  {project.name}
                                </span>
                                {project.path === activeProject && <Check />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onClick={() => void addProjectFolder()}>
                        <FolderPlus />
                        {t("rail.addProject")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {t("transcript.greetingEnd")}
                </h1>
              )}
              {/* An archived chat reads, but doesn't run: the composer yields its slot to this notice
                  until the session is restored. The composer stays mounted (hidden) — unmounting
                  BlockNote would take an in-progress draft with it. */}
              {activeArchived && (
                <div className="shrink-0 px-6 pb-6 pt-3">
                  <div className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_rgb(0_0_0/0.04)]">
                    <Archive className="size-4 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 flex-1 text-ui text-muted-foreground">
                      {t("archived.notice")}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() =>
                        activeSession &&
                            void archiveSession(activeSession, false).then(
                              refreshSessions,
                            )
                      }
                    >
                      {t("archived.restore")}
                    </Button>
                  </div>
                </div>
              )}
              {/* Quiet scene banner (R8): stage completion / hook suggestions for the focused
                  session, rendered above the composer. Dismissal is remembered by the core. */}
                  {scenesSurfaceEnabled &&
                    sceneBanner &&
                    sceneBanner.session === activeSession &&
                    !activeArchived && (
                <SceneBanner
                  banner={sceneBanner}
                  scenes={scenes}
                  onApplyScene={(reference) => {
                    applySceneChoice(reference);
                    setSceneBanner(null);
                  }}
                  onAdvancePipeline={(instanceId, toStage) => {
                    void advancePipelineChoice(instanceId, toStage);
                    setSceneBanner(null);
                  }}
                  onAdvancePipelineNewSession={(instanceId, toStage) => {
                    void advancePipelineInNewSession(instanceId, toStage);
                    setSceneBanner(null);
                  }}
                  onDismiss={() => {
                          void dismissSceneBanner(
                            sceneBanner.session,
                            sceneBanner.stateKey,
                          );
                    setSceneBanner(null);
                  }}
                />
              )}
              {!activeArchived && (
                <PluginUiSlot
                  slot="composer.above"
                  contributions={pluginUiActions["composer.above"]}
                  onInvoke={invokePluginAction}
                />
              )}
              <div className={cn("contents", activeArchived && "hidden")}>
                <Composer
                  config={sessionConfig}
                  hero={turns.length === 0 && !sessionLoading}
                  checkout={{
                    project: activeProjectName ?? cwd,
                    branch: git?.is_repo ? git.branch : null,
                    dirty: git?.files.length ?? 0,
                    onOpen: openSourceControl,
                  }}
                  docMode={docMode}
                  onDocMode={toggleDocMode}
                  height={composerH}
                  onHeight={setComposerH}
                  boundsRef={mainRef}
                  models={activeSession === null
                    ? providers.find((candidate) => candidate.id === provider)?.models ?? []
                    : models}
                  currentModel={currentModel}
                  defaultModel={defaultModel}
                      contextWindow={activeContextWindow(
                        contextWindows,
                        activeSession,
                      )}
                  usage={sessionUsage}
                  onModel={(id) => {
                    const session = activeSessionRef.current;
                    if (!session) {
                      setCurrentModel(id);
                      return;
                    }
                    // Optimistic: the engine answers with a `models` event, or an `error` if the provider
                    // doesn't implement the switch.
                    if (id !== currentModelRef.current) {
                      pendingModelChangesRef.current.add(session);
                      knownModelsRef.current.set(session, id);
                      setContextWindows((previous) =>
                        clearContextWindow(previous, session),
                      );
                    }
                    setCurrentModel(id);
                    void setModel(session, id).catch((e) => {
                      pendingModelChangesRef.current.delete(session);
                          toast(
                            t("toast.modelFailed", { error: String(e) }),
                            "error",
                          );
                    });
                  }}
                  configOptions={configOptions}
                  onConfigOption={(configId, value) => {
                    const session = activeSessionRef.current;
                    if (!session) return;
                        const option = configOptions.find(
                          (item) => item.id === configId,
                        );
                    if (
                          (option?.category === "model" ||
                            configId === "model") &&
                      value !== currentModelRef.current
                    ) {
                      pendingModelChangesRef.current.add(session);
                      knownModelsRef.current.set(session, value);
                      setContextWindows((previous) =>
                        clearContextWindow(previous, session),
                      );
                    }
                    // Optimistic: the engine echoes the agent's authoritative `config_options` set, or
                    // an `error` event if the option isn't supported — either replaces this state.
                    setConfigOptions((prev) =>
                          prev.map((o) =>
                            o.id === configId ? { ...o, current: value } : o,
                          ),
                    );
                        void setConfigOption(session, configId, value).catch(
                          (e) => {
                            if (
                              option?.category === "model" ||
                              configId === "model"
                            ) {
                        pendingModelChangesRef.current.delete(session);
                      }
                            toast(
                              t("toast.modelFailed", { error: String(e) }),
                              "error",
                            );
                          },
                        );
                  }}
                  running={running}
                  loading={sessionLoading}
                  docEmpty={docEmpty}
                  onRun={() => void run()}
                      onStop={() =>
                        activeSession && void cancelTurn(activeSession)
                      }
                  onAttachFile={() => {
                        if (componentEnabled("files.surface"))
                          setShowFiles(true);
                    else toast("Files are disabled in Plugins.", "info");
                  }}
                  onInsertSkill={() => openSkillPickerRef.current?.()}
                  onInsertIssue={() => {
                        if (componentEnabled("issues.modal"))
                          setShowIssues(true);
                    else toast("Issues are disabled in Plugins.", "info");
                  }}
                  onOpenMarket={openPluginHub}
                  onNewSkill={() => setSkillDraft({ name: "", text: "" })}
                  canvasEnabled={canvasUiEnabled}
                  onInsertCanvas={() => void insertCanvasRef.current?.()}
                  voiceEnabled={voiceComposerEnabled}
                  onVoiceText={(t) => insertTextRef.current?.(t)}
                  // R11: with an active-scene brief, a finished dictation is structured into a
                  // pre-filled brief card; any failure degrades to the raw-text insert above.
                  // No brief → the handler is undefined and voice behaves exactly as before.
                      onVoiceTranscript={
                        voiceComposerEnabled && scenesSurfaceEnabled
                    ? makeTranscriptHandler({
                              scene:
                                scenes.find(
                                  (s) => s.reference === activeSceneName,
                                ) ?? null,
                        structureBrief,
                              insertBrief: (scene, values) =>
                                insertBriefRef.current?.(scene, values),
                              insertText: (text) =>
                                insertTextRef.current?.(text),
                              onDegrade: () =>
                                toast(t("voice.structureFailed"), "error"),
                      })
                          : undefined
                      }
                  runHint={hint("run")}
                  skillHint={hint("open_skill_picker")}
                  filesHint={hint("open_files")}
                      pluginActions={
                    <PluginUiSlot
                      slot="composer.toolbar"
                      contributions={pluginUiActions["composer.toolbar"]}
                      onInvoke={invokePluginAction}
                    />
                      }
                  sessionId={activeSession}
                  insertBriefRef={insertBriefRef}
                >
                  <DocEditor
                    key={editorKey}
                    skills={skills}
                    cwd={cwd || "."}
                    sessionId={activeSession}
                    getBlocksRef={getBlocksRef}
                    insertTextRef={insertTextRef}
                    insertAnnotationRef={insertAnnotationRef}
                    insertFileRef={insertFileRef}
                    focusRef={focusEditorRef}
                    clearRef={clearEditorRef}
                    insertMarkdownRef={insertMarkdownRef}
                    openSkillPickerRef={openSkillPickerRef}
                    sceneSkills={(() => {
                          const scene = scenes.find(
                            (s) => s.reference === activeSceneName,
                          );
                      return scene?.skills
                        ? {
                            pinned: scene.skills.pinned ?? [],
                                suppressUnpinned:
                                  scene.skills.suppress_unpinned ?? false,
                          }
                        : null;
                    })()}
                    insertSkillRef={insertSkillRef}
                    insertBriefRef={insertBriefRef}
                    insertIssueRef={insertIssueRef}
                    canvasEnabled={canvasUiEnabled}
                    canvasRuntime={canvasRuntime}
                    createCanvas={createCanvas}
                    insertCanvasRef={insertCanvasRef}
                    insertCanvasDraftRef={insertCanvasDraftRef}
                    restoreCanvasDocumentRef={restoreCanvasDocumentRef}
                    freezeCanvasesRef={freezeCanvasesRef}
                    canvasDeliveryErrorRef={canvasDeliveryErrorRef}
                    onEmptyChange={handleEditorEmptyChange}
                  />
                </Composer>
              </div>
            </div>
          </div>
            </main>

            {/* ---------------- bottom terminal panel ---------------- */}
            {/* Always mounted so its shell and PTY survive close/open. Height collapses to zero. */}
            <Dock
              placement="bottom"
              open={terminalOpen}
              tab={terminalOpen ? "terminal" : null}
              availableSurfaces={
                availableDockSurfaces.includes("terminal") ? ["terminal"] : []
              }
              onTab={() => manualTerminalOpen(true)}
              onClose={() => manualTerminalOpen(false)}
              autoTab={dockAutoHint?.surface ?? null}
              highlightFile={dockAutoHint?.file ?? null}
              cwd={cwd || null}
              projectPath={
                activeProject ? normalizePluginProjectPath(activeProject) : null
              }
              sessionKey={activeSession ?? "main"}
              git={git}
              onRefreshGit={refreshGit}
              onOpenSourceControl={openSourceControl}
              browserUrl={browserUrl}
              onNavigate={setBrowserUrl}
              onAnnotate={(n) => void annotate(n)}
              onInsertFile={(p) => insertFileRef.current?.(p)}
              onSendText={(text) => insertTextRef.current?.(text)}
              onOpenFile={openFileTab}
              openFiles={openFiles}
              activeFile={activeFile}
              fileReveal={fileReveal}
              onActiveFile={(path) => {
                setActiveFile(path);
                setFileReveal(null);
              }}
              onCloseFile={closeFileTab}
              width={dockWidth}
              onWidth={setDockWidth}
              height={dockHeight}
              onHeight={setDockHeight}
            />
          </div>

            {/* ---------------- side dock ---------------- */}
            {/* Always mounted: closing animates the width to zero instead of unmounting, which both
                plays the full collapse and keeps shells alive across close/open. */}
            <Dock
              placement="right"
              open={dockTab !== null}
              tab={dockTab}
              availableSurfaces={availableSideDockSurfaces}
              onTab={manualDockTab}
              onClose={() => manualDockTab(null)}
              autoTab={dockAutoHint?.surface ?? null}
              highlightFile={dockAutoHint?.file ?? null}
              cwd={cwd || null}
              projectPath={
                activeProject ? normalizePluginProjectPath(activeProject) : null
              }
              sessionKey={activeSession ?? "main"}
              git={git}
              onRefreshGit={refreshGit}
              onOpenSourceControl={openSourceControl}
              browserUrl={browserUrl}
              onNavigate={setBrowserUrl}
              onAnnotate={(n) => void annotate(n)}
              onInsertFile={(p) => insertFileRef.current?.(p)}
              onSendText={(text) => insertTextRef.current?.(text)}
              onOpenFile={openFileTab}
              openFiles={openFiles}
              activeFile={activeFile}
              fileReveal={fileReveal}
              onActiveFile={(path) => {
                setActiveFile(path);
                setFileReveal(null);
              }}
              onCloseFile={closeFileTab}
              width={dockWidth}
              onWidth={setDockWidth}
              height={dockHeight}
              onHeight={setDockHeight}
            />
        </div>
      </div>
      )}

      <SideChatPanel
        open={sideChatOpen}
        width={appliedSideChatWidth}
        onWidth={setSideChatWidth}
        onClose={() => setSideChatOpen(false)}
        provider={provider}
        providers={providers}
        cwd={cwd || "."}
        model={currentModel}
        mode={mode}
        sandbox={sandbox}
        seed={sideChatSeed}
        onSeedHandled={(id) =>
          setSideChatSeed((current) =>
            current?.id === id ? null : current,
          )
        }
      />

      {/* ---------------- dialogs ---------------- */}
      {showSourceControl && componentEnabled("git.surface") && (
        <SourceControlModal
          key={cwd || "."}
          cwd={cwd || "."}
          status={git}
          statusLoading={currentGitWorkspace.loading}
          checkpoints={checkpoints}
          checkpointsLoading={currentCheckpointWorkspace.loading}
          onCommit={async (m) => {
            try {
              await gitCommit(cwd || ".", m);
              toast("Committed.", "success");
            } catch (e) {
              toast(`Commit failed: ${e}`, "error");
              throw e;
            } finally {
              refreshGit();
            }
          }}
          onPush={doPush}
          onCheckpoint={doCheckpoint}
          onRevert={async (c) => {
            await gitRevert(cwd || ".", c);
            refreshGit();
          }}
          onRefresh={() => {
            refreshGit();
            refreshCheckpoints();
          }}
          onClose={() => setShowSourceControl(false)}
        />
      )}
      {showPalette && (
        <CommandPalette
          commands={paletteCommands}
          search={searchPaletteCommands}
          onClose={() => setShowPalette(false)}
        />
      )}
      <ProjectActionDialog
        open={showActionDialog}
        actions={scripts}
        bindings={bindings}
        onOpenChange={setShowActionDialog}
        onSave={saveProjectAction}
      />
      {showRemote && componentEnabled("remote.modal") && (
        <RemoteModal onClose={() => setShowRemote(false)} />
      )}
      {showIssues && componentEnabled("issues.modal") && (
        <IssuesModal
          cwd={cwd || "."}
          scenes={scenesSurfaceEnabled ? scenes : []}
          onInsert={(i) => void insertIssue(i)}
          onDelegate={(i, sceneReference) =>
            void onDelegateIssue(i, sceneReference)
          }
          onOpenSession={(session) => {
            setShowIssues(false);
            void selectSession(session);
          }}
          onClose={() => setShowIssues(false)}
        />
      )}
      {preview && (
        <PreviewModal preview={preview} onClose={() => setPreview(null)} />
      )}
      {showMissionControl && (
        <MissionControlDialog
          sessions={sessions}
          runningSessions={runningSessions}
          contextWindows={contextWindows}
          sceneBySession={
            scenesSurfaceEnabled
              ? sceneBySessionRef.current
              : EMPTY_SCENE_BY_SESSION
          }
          onSelect={(id) => void selectSession(id)}
          onReview={openSourceControl}
          onClose={() => setShowMissionControl(false)}
        />
      )}
      {showScenePicker && scenesSurfaceEnabled && (
        <ScenePicker
          scenes={scenes}
          active={scenes.find((s) => s.reference === activeSceneName) ?? null}
          auto={autoScene}
          onAuto={setAutoSceneChoice}
          onScene={(reference) => applySceneChoice(reference)}
          onCreate={() => {
            setShowScenePicker(false);
            setSceneEditorRequest({ kind: "create" });
            setShowSceneStudio(true);
          }}
          onEdit={(scene) => {
            setShowScenePicker(false);
            setSceneEditorRequest({ kind: "edit", scene });
            setShowSceneStudio(true);
          }}
          onDuplicate={(scene) => {
            setShowScenePicker(false);
            setSceneEditorRequest({ kind: "duplicate", scene });
            setShowSceneStudio(true);
          }}
          onClose={() => setShowScenePicker(false)}
        />
      )}
      {sceneEscalation && scenesSurfaceEnabled && (
        <SceneEscalationDialog
          sceneLabel={
            scenes.find((s) => s.reference === sceneEscalation.reference)
              ?.title ?? sceneEscalation.reference
          }
          from={sceneEscalation.from}
          to={sceneEscalation.to}
          onConfirm={() => {
            const pending = sceneEscalation;
            setSceneEscalation(null);
            if (pending.kind === "soft")
              applySceneChoice(pending.reference, { confirmed: true });
            else if (pending.kind === "pipeline" && pending.pipeline)
              void advancePipelineChoice(
                pending.pipeline.instanceId,
                pending.pipeline.toStage,
                true,
              );
            else if (pending.kind === "pipeline_new" && pending.pipeline)
              void advancePipelineInNewSession(
                pending.pipeline.instanceId,
                pending.pipeline.toStage,
                true,
              );
            else void restartInScene(true);
          }}
          onCancel={() => setSceneEscalation(null)}
        />
      )}
      {showFiles && componentEnabled("files.surface") && (
        <FileBrowserModal
          cwd={cwd || "."}
          onInsert={(p) => {
            insertFileRef.current?.(p);
            setShowFiles(false);
          }}
          onClose={() => setShowFiles(false)}
        />
      )}
      {showWorkspaceSearch && componentEnabled("search.modal") && (
        <WorkspaceSearchModal
          cwd={cwd || "."}
          onOpen={(match) => openFileTab(match.path, match)}
          onClose={() => setShowWorkspaceSearch(false)}
        />
      )}

      {planDocPending && (
        <Dialog open onOpenChange={(o) => !o && resolvePlanDocPending(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("planDoc.title")}</DialogTitle>
            </DialogHeader>
            <p className="text-ui text-muted-foreground">
              {t("planDoc.confirm")}
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => resolvePlanDocPending(null)}
              >
                {t("planDoc.cancel")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => resolvePlanDocPending("append")}
              >
                {t("planDoc.append")}
              </Button>
              <Button onClick={() => resolvePlanDocPending("replace")}>
                {t("planDoc.replace")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {skillDraft && (
        <Dialog open onOpenChange={(o) => !o && setSkillDraft(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New skill</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Skill name"
              value={skillDraft.name}
              onChange={(e) =>
                setSkillDraft({ ...skillDraft, name: e.target.value })
              }
            />
            <textarea
              className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-ui outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="Prompt fragment inserted when this skill is picked"
              value={skillDraft.text}
              onChange={(e) =>
                setSkillDraft({ ...skillDraft, text: e.target.value })
              }
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setSkillDraft(null)}>
                Cancel
              </Button>
              <Button onClick={() => void saveDraft()}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {templateDraft !== null && (
        <TemplateDialog
          source={templateDraft}
          onClose={() => setTemplateDraft(null)}
          onSaved={() => {
            setTemplateDraft(null);
            void refreshSkills();
            toast(t("templateFrom.saved"), "success");
          }}
        />
      )}

      {permission?.form && (
        <QuestionDialog
          key={`${permission.session}:${permission.requestId}`}
          form={permission.form}
          onAnswer={(value) => void answerQuestion(value)}
        />
      )}

      {permission && !permission.form && (
        <Dialog open onOpenChange={(o) => !o && void answer(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CircleAlert className="size-4 text-warning" /> Permission
                requested
              </DialogTitle>
            </DialogHeader>
            <p className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-ui">
              {permission.title}
            </p>
            {permission.context && permission.context.kind !== "acp" && (
              <div className="space-y-1 text-hint text-muted-foreground">
                <p className="font-medium capitalize text-foreground">
                  {permission.context.kind.replaceAll("_", " ")}
                </p>
                {permission.context.server && (
                  <p>Server: {permission.context.server}</p>
                )}
                {permission.context.tool && (
                  <p>Tool: {permission.context.tool}</p>
                )}
                {permission.context.origin && (
                  <p>Site: {permission.context.origin}</p>
                )}
                {permission.context.application && (
                  <p>Application: {permission.context.application}</p>
                )}
                {permission.context.risk && (
                  <p>Risk: {permission.context.risk}</p>
                )}
                <p>This approval is required even in Full Access.</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => void answer(null)}>
                Cancel
              </Button>
              {permission.options.map(([id, label]) => (
                <Button key={id} onClick={() => void answer(id)}>
                  {label}
                </Button>
              ))}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
