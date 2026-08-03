import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, Folder, Keyboard, PanelLeft, PanelRight } from "lucide-react";

import { DocEditor } from "./editor/Editor";
import {
  answerPermission,
  archiveSession,
  browserContext,
  cancelTurn,
  compileDoc,
  addProject,
  DEFAULT_KEYMAP,
  defaultCwd,
  deleteSkill,
  describeBlock,
  getKeymap,
  getTranscript,
  gitCheckpoint,
  gitCheckpoints,
  gitCommit,
  gitDiff,
  gitPush,
  gitRevert,
  gitStatus,
  issueContext,
  listArchivedSessions,
  listProjectScripts,
  listProjects,
  listProviders,
  listSessions,
  listSkills,
  marketCatalog,
  marketInstall,
  newSession,
  onEngineEvent,
  openProject,
  pickDirectory,
  providerLabel,
  removeProject,
  renameProject,
  renameSession,
  runProjectScript,
  saveSkill,
  sessionPreviews,
  setConfigOption,
  setKeymap,
  setModel,
  setPermissionMode,
  setSandbox,
  submitPrompt,
  type Checkpoint,
  type CompiledPreview,
  type ConfigOptionInfo,
  type CoreEvent,
  type DocBlock,
  type Annotation,
  type GitStatus,
  type Issue,
  type KeymapEntry,
  type MarketItem,
  type ModelChoice,
  type Project,
  type ProjectScript,
  type ProviderInfo,
  type Sandbox,
  type SessionInfo,
  type SkillInfo,
} from "./bridge";
import { MarketModal } from "./market/Market";
import { SettingsPage } from "./settings/SettingsPage";
import { SourceControlModal } from "./git/SourceControl";
import { CommandPalette, type Command } from "./palette/CommandPalette";
import { RemoteModal } from "./remote/Remote";
import { IssuesModal } from "./issues/Issues";
import { PreviewModal } from "./editor/Preview";
import { FileBrowserModal } from "./files/FileBrowser";
import { UsageModal } from "./usage/Usage";
import type { SessionConfig } from "./session/config";
import { SESSION_MODES, nextSessionMode, sessionMode, type SessionMode } from "./session/mode";
import { Composer } from "./session/Composer";
import { TurnCard } from "./session/TurnCard";
import { applyEvent, newTurn, turnsFromTranscript, type Turn } from "./session/turns";
import { Dock, type DockSurface, type DockTab } from "./dock/Dock";
import { SessionRail } from "./sidebar/SessionRail";

import { actionForEvent, comboFromEvent, isModifierOnly, keyHint } from "./keys";
import { useToast } from "./ui/toast";
import { useLanguage, useT } from "./i18n";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePersistedNumber } from "@/lib/persist";
import { cn } from "@/lib/utils";

interface PermissionState {
  session: string;
  requestId: string;
  title: string;
  options: [string, string][];
}

function summarizeDoc(doc: DocBlock[]): string {
  return doc.map(describeBlock).join(" ").slice(0, 400);
}

/** +/− line counts out of a unified diff — content lines only, not the +++/--- file headers. */
function countDiff(diff: string): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) deleted++;
  }
  return { added, deleted };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          aria-label={label}
          className={cn("size-7 shrink-0", active && "text-primary")}
          onClick={onClick}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {hint && <span className="ml-1.5 opacity-60">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

export default function App() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<SessionInfo[]>([]);
  // Row 2 of every rail entry. Refreshed when a turn ends rather than per streamed chunk — the
  // preview is a glance, and requerying the transcript table on every token would be absurd.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState("grok");
  const [cwd, setCwd] = useState(".");
  const [mode, setMode] = useState("ask");
  const [sandbox, setSandboxState] = useState<Sandbox>("workspace_write");
  const [useWorktree, setUseWorktree] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [running, setRunning] = useState(false);
  const [skillDraft, setSkillDraft] = useState<{ name: string; text: string } | null>(null);
  const [git, setGit] = useState<GitStatus | null>(null);
  // Working-tree +/− lines, for the rail's status table. Parsed here, not in the core: the diff
  // text is already one call away and counting lines is nothing.
  const [diffStat, setDiffStat] = useState<{ added: number; deleted: number }>({ added: 0, deleted: 0 });
  const [bindings, setBindings] = useState<KeymapEntry[]>([]);
  // A blank tab, not a landing page: this browser's job is your localhost dev server, which you
  // type in.
  const [browserUrl, setBrowserUrl] = useState("about:blank");
  const [showSettings, setShowSettings] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [showMarket, setShowMarket] = useState(false);
  const [market, setMarket] = useState<MarketItem[]>([]);
  const [showSourceControl, setShowSourceControl] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [showPalette, setShowPalette] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [preview, setPreview] = useState<CompiledPreview | null>(null);
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab | null>(null);
  const [docEmpty, setDocEmpty] = useState(true);
  // Models are reported by the agent at session/new, so they arrive as an event rather than a call.
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  // What the adapter itself picked at session/new — the picker badges it as "Default". Later
  // `models` events are switch echoes, so only the first one after a reset gets to set this.
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  // Session config options (model + reasoning effort) — the newer ACP surface, same lifecycle.
  const [configOptions, setConfigOptions] = useState<ConfigOptionInfo[]>([]);
  // Projects are the rail's organising idea: the conversation list and the git section below it
  // both describe whichever one is active.
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<string | null>(null);
  // The right panel's file viewer: open tabs in open order, and which one is showing. Opening is
  // read-only; `fileEditing` is the deliberate second step.
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileEditing, setFileEditing] = useState(false);
  // Composer geometry: how tall the document area may grow before it scrolls, and whether it has
  // taken over the whole column for long-form authoring.
  const [composerH, setComposerH] = usePersistedNumber("codetwo.composerHeight", 190);
  const [dockWidth, setDockWidth] = usePersistedNumber("codetwo.dockWidth", 440);
  const [railWidth, setRailWidth] = usePersistedNumber("codetwo.railWidth", 288);
  const [railCollapsedRaw, setRailCollapsedRaw] = usePersistedNumber("codetwo.railCollapsed", 0);
  const railCollapsed = railCollapsedRaw !== 0;
  const toggleRail = useCallback(
    () => setRailCollapsedRaw(railCollapsed ? 0 : 1),
    [railCollapsed, setRailCollapsedRaw],
  );
  // Full-page document is *the* mode of this app, not a temporary state it visits — it's what
  // sets a document-first tool apart from a chat box, so it is also the default. Nothing takes it
  // away on your behalf; the composer's ⤢ button, the grip double-click and Mod+Shift+E change it.
  const [docModeRaw, setDocModeRaw] = usePersistedNumber("codetwo.docMode", 1);
  const docMode = docModeRaw !== 0;
  const setDocMode = useCallback((v: boolean) => setDocModeRaw(v ? 1 : 0), [setDocModeRaw]);
  const mainRef = useRef<HTMLElement | null>(null);
  const toast = useToast();
  const t = useT();
  const { locale } = useLanguage();

  const getBlocksRef = useRef<(() => DocBlock[]) | null>(null);
  const insertTextRef = useRef<((text: string) => void) | null>(null);
  const insertAnnotationRef = useRef<((a: Annotation, context: string) => void) | null>(null);
  const insertFileRef = useRef<((path: string) => void) | null>(null);
  const focusEditorRef = useRef<(() => void) | null>(null);
  const clearEditorRef = useRef<(() => void) | null>(null);
  const openSkillPickerRef = useRef<(() => void) | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  // Mirrors `activeProject` so `selectProject` can tell a real switch from a re-click without
  // remaking its callback (and the rail rows' props) on every project change.
  const activeProjectRef = useRef<string | null>(null);
  const pendingDocRef = useRef<DocBlock[] | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

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

  const refreshSessions = useCallback(() => {
    listSessions().then(setSessions).catch(() => {});
    listArchivedSessions().then(setArchivedSessions).catch(() => {});
    sessionPreviews().then(setPreviews).catch(() => {});
  }, []);

  const refreshProjects = useCallback(() => {
    listProjects().then(setProjects).catch(() => {});
  }, []);

  /** Switch projects: the working directory, the conversation list and the git section all follow. */
  const selectProject = useCallback(
    (path: string) => {
      setActiveProject(path);
      setCwd(path);
      // Switching projects means composing into a different workspace — carrying the previous
      // session across would silently send the next prompt to the old project's cwd.
      if (path !== activeProjectRef.current) {
        activeProjectRef.current = path;
        activeSessionRef.current = null;
        setActiveSession(null);
        setTurns([]);
        setModels([]);
        setCurrentModel(null);
        setDefaultModel(null);
      }
      void openProject(path).then(refreshProjects);
    },
    [refreshProjects],
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

  const activeTitle = useMemo(
    () => sessions.find((s) => s.id === activeSession)?.title ?? "New session",
    [sessions, activeSession],
  );

  // The title bar's project badge — the workspace this session lives in, at a glance.
  const activeProjectName = useMemo(
    () => projects.find((p) => p.path === activeProject)?.name ?? null,
    [projects, activeProject],
  );

  // The rail's status card names the model the next turn runs on. Same two sources as the
  // composer's picker, flattened to a label: config options first, then the flat model list,
  // then the provider's display name when nothing has been reported yet.
  const modelLabel = useMemo(() => {
    const opt = configOptions.find((o) => o.category === "model" || o.id === "model");
    if (opt) return opt.choices.find((c) => c.id === opt.current)?.name || opt.current;
    const m = models.find((x) => x.id === currentModel);
    if (m) return m.name;
    return currentModel ?? providers.find((p) => p.id === provider)?.display_name ?? provider;
  }, [configOptions, models, currentModel, providers, provider]);

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

  useEffect(() => {
    listProviders()
      .then((list) => {
        setProviders(list);
        // Default to a provider whose CLI is actually installed. Shipping `grok` as the default
        // meant a machine without it failed on the first session with a raw spawn error.
        if (!providerPinned.current) {
          const cur = list.find((p) => p.id === provider);
          if (!cur?.available) {
            const firstAvailable = list.find((p) => p.available);
            if (firstAvailable) setProvider(firstAvailable.id);
          }
        }
      })
      .catch(() => {});
    listSkills().then(setSkills).catch(() => {});
    refreshSessions();

    let unlisten: (() => void) | null = null;
    void (async () => {
      unlisten = await onEngineEvent((ev: CoreEvent) => {
        if (ev.event === "session_created") {
          activeSessionRef.current = ev.session;
          setActiveSession(ev.session);
          refreshSessions();
          if (pendingDocRef.current) {
            void submitPrompt(ev.session, pendingDocRef.current);
            pendingDocRef.current = null;
          }
          return;
        }
        if (ev.event === "models") {
          // A switch echoes back the same list; only session/new carries a fresh one.
          if (ev.available.length > 0) setModels(ev.available);
          setCurrentModel(ev.current || null);
          setDefaultModel((prev) => prev ?? (ev.current || null));
          return;
        }
        if (ev.event === "config_options") {
          // The agent's set is authoritative — it replaces any optimistic UI state wholesale.
          setConfigOptions(ev.options);
          const model = ev.options.find((o) => o.category === "model" || o.id === "model");
          if (model?.current) {
            setCurrentModel(model.current);
            // Same rule as `models`: the first report after a reset is the adapter's own pick.
            setDefaultModel((prev) => prev ?? model.current);
          }
          return;
        }
        if (ev.event === "permission_request") {
          setPermission({
            session: ev.session,
            requestId: ev.request_id,
            title: ev.title,
            options: ev.options,
          });
          return;
        }
        setTurns((prev) => applyEvent(prev, ev));
        if (ev.event === "turn_ended" || ev.event === "error") {
          setRunning(false);
          refreshSessions();
        }
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshSessions]);

  // Keep the newest turn in view while streaming.
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const run = useCallback(async () => {
    const getBlocks = getBlocksRef.current;
    if (!getBlocks) return;
    let doc = getBlocks();
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
    if (planMode) doc = [{ type: "skill", skill_id: "plan-first", params: {} }, ...doc];
    setRunning(true);
    setTurns((prev) => [...prev, newTurn(summarizeDoc(doc))]);
    try {
      if (activeSessionRef.current) {
        await submitPrompt(activeSessionRef.current, doc);
      } else {
        pendingDocRef.current = doc;
        await newSession(provider, cwd || ".", useWorktree);
      }
      // Only after the submit is accepted. Clearing first would lose the draft if it threw, and in
      // full-page mode there's no collapse to signal the send happened — an empty page is the
      // signal.
      clearEditorRef.current?.();
    } catch (e) {
      setRunning(false);
      toast(t("toast.turnFailed", { error: String(e) }), "error");
    }
  }, [provider, cwd, useWorktree, planMode, running, toast]);

  const createSession = useCallback(async () => {
    pendingDocRef.current = null;
    setTurns([]);
    setModels([]);
    setCurrentModel(null);
    setDefaultModel(null);
    setConfigOptions([]);
    // Caret into the document; whichever mode you're in stays yours.
    setTimeout(() => focusEditorRef.current?.(), 0);
    try {
      await newSession(provider, cwd || ".", useWorktree);
    } catch (e) {
      toast(t("toast.sessionFailed", { error: String(e) }), "error");
    }
  }, [provider, cwd, useWorktree, toast]);

  const answer = useCallback(
    async (optionId: string | null) => {
      if (!permission) return;
      await answerPermission(permission.session, permission.requestId, optionId);
      setPermission(null);
    },
    [permission],
  );

  /**
   * The UI asks one question about permissions; the engine keeps two axes. This is where the one
   * becomes the two — both are always set together, so a session can't drift into a combination the
   * picker can't name (an "auto-edit" that a read-only sandbox silently vetoes).
   */
  const onSessionModeChange = useCallback((id: SessionMode) => {
    const preset = SESSION_MODES.find((m) => m.id === id);
    if (!preset) return;
    setMode(preset.mode);
    setSandboxState(preset.sandbox);
    const session = activeSessionRef.current;
    if (session) {
      void setPermissionMode(session, preset.mode);
      void setSandbox(session, preset.sandbox);
    }
  }, []);

  const selectSession = useCallback(
    async (id: string) => {
      activeSessionRef.current = id;
      setActiveSession(id);
      // Models belong to a session. The agent only reports its own menu at session/new — which for
      // a session resumed from the store hasn't happened again yet — so start from the provider's
      // built-in list and let the agent's own options replace it when the next turn revives the
      // session.
      const stored =
        sessions.find((s) => s.id === id) ?? archivedSessions.find((s) => s.id === id);
      const forProvider = providers.find((p) => p.id === providerLabel(stored?.provider ?? ""));
      setModels(forProvider?.models ?? []);
      setConfigOptions([]);
      setCurrentModel(stored?.model ?? null);
      setDefaultModel(null);
      setTurns(turnsFromTranscript(await getTranscript(id)));
    },
    [sessions, archivedSessions, providers],
  );

  const refreshSkills = useCallback(() => {
    listSkills().then(setSkills).catch(() => {});
  }, []);

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

  const refreshGit = useCallback(() => {
    const target = cwd || ".";
    const fresh = () => (cwdRef.current || ".") === target;
    gitStatus(target)
      .then((s) => {
        if (!fresh()) return;
        setGit(s);
        if (s.is_repo && s.files.length > 0) {
          gitDiff(target, null)
            .then((d) => fresh() && setDiffStat(countDiff(d)))
            .catch(() => fresh() && setDiffStat({ added: 0, deleted: 0 }));
        } else {
          setDiffStat({ added: 0, deleted: 0 });
        }
      })
      .catch(() => fresh() && setGit(null));
  }, [cwd]);

  const openMarket = useCallback(() => {
    marketCatalog().then(setMarket).catch(() => {});
    setShowMarket(true);
  }, []);

  const openSourceControl = useCallback(() => {
    refreshGit();
    gitCheckpoints(cwd || ".").then(setCheckpoints).catch(() => {});
    setShowSourceControl(true);
  }, [cwd, refreshGit]);

  const doCheckpoint = useCallback(async () => {
    try {
      const cp = await gitCheckpoint(cwd || ".", "manual checkpoint");
      toast(cp ? "Checkpoint saved." : "Nothing to checkpoint.", cp ? "success" : "info");
    } catch (e) {
      toast(`Checkpoint failed: ${e}`, "error");
    }
    gitCheckpoints(cwd || ".").then(setCheckpoints).catch(() => {});
  }, [cwd, toast]);

  const doPreview = useCallback(async () => {
    const getBlocks = getBlocksRef.current;
    if (!getBlocks) return;
    try {
      setPreview(await compileDoc(getBlocks(), cwd || "."));
    } catch (e) {
      toast(`Could not compile the document: ${e}`, "error");
    }
  }, [cwd, toast]);

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
    insertTextRef.current?.(ctx);
    setShowIssues(false);
  }, []);

  const toggleDock = useCallback((t: DockSurface) => {
    setDockTab((cur) => (cur === t ? null : t));
    setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
  }, []);

  // Expanding hands the whole column to the document; focus follows so you can just start writing.
  const toggleDocMode = useCallback((v: boolean) => {
    setDocMode(v);
    if (v) setTimeout(() => focusEditorRef.current?.(), 0);
  }, []);

  /** Open a file as a tab in the right panel's viewer, and bring that panel to the front. */
  const openFileTab = useCallback(
    (p: string) => {
      setOpenFiles((prev) => (prev.includes(p) ? prev : [...prev, p]));
      setActiveFile(p);
      setFileEditing(false);
      setDockTab("files");
      // The files surface is a viewer *and* a tree; at the dock's chat-sized default the code
      // column is a sliver. Take the room the document can spare, up to a readable measure.
      if (dockWidth < 640) setDockWidth(Math.min(Math.max(300, window.innerWidth - 620), 800));
      setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
    },
    [dockWidth, setDockWidth],
  );

  const closeFileTab = useCallback(
    (p: string) => {
      const at = openFiles.indexOf(p);
      const next = openFiles.filter((x) => x !== p);
      setOpenFiles(next);
      // Closing the visible tab lands on its neighbour, not on an empty pane, VS Code-style.
      if (activeFile === p) {
        setActiveFile(next[Math.min(Math.max(at, 0), next.length - 1)] ?? null);
        setFileEditing(false);
      }
    },
    [openFiles, activeFile],
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
  const dispatchAction = useCallback(
    (action: string) => {
      switch (action) {
        case "run":
          void run();
          break;
        case "new_session":
          void createSession();
          break;
        case "cancel":
          if (activeSessionRef.current && running) void cancelTurn(activeSessionRef.current);
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
          setDockTab(null);
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
          setShowSettings(true);
          break;
        case "open_command_palette":
          setShowPalette(true);
          break;
        case "open_source_control":
          openSourceControl();
          break;
        case "open_market":
          openMarket();
          break;
        case "open_usage":
          setShowUsage(true);
          break;
        case "open_files":
          setShowFiles(true);
          break;
        case "open_issues":
          setShowIssues(true);
          break;
        case "prev_session":
          stepSession(-1);
          break;
        case "next_session":
          stepSession(1);
          break;
        case "cycle_permission_mode": {
          const next = nextSessionMode(sessionMode(mode, sandbox));
          onSessionModeChange(next);
          toast(`Mode: ${t(`mode.${next}` as "mode.ask")}`);
          break;
        }
        case "refresh_git":
          refreshGit();
          break;
        default:
          // A binding pointing at an action this frontend doesn't implement.
          toast(`No handler for "${action}".`, "error");
          break;
      }
    },
    [
      run,
      createSession,
      running,
      mode,
      sandbox,
      onSessionModeChange,
      t,
      refreshGit,
      openSourceControl,
      openMarket,
      toggleDock,
      toggleDocMode,
      docMode,
      stepSession,
      toast,
    ],
  );

  // Hints come from the live keymap, so a rebind is reflected everywhere without touching labels.
  const hint = useCallback((action: string) => keyHint(bindings, action), [bindings]);

  const paletteCommands: Command[] = [
    { id: "run", label: "Run prompt", hint: hint("run"), run: () => void run() },
    { id: "new", label: "New session", hint: hint("new_session"), run: () => void createSession() },
    { id: "sc", label: "Source control", hint: hint("open_source_control"), run: openSourceControl },
    { id: "checkpoint", label: "Checkpoint now", run: () => void doCheckpoint() },
    { id: "market", label: "Open skill market", hint: hint("open_market"), run: openMarket },
    { id: "issues", label: "GitHub / Linear issues", hint: hint("open_issues"), run: () => setShowIssues(true) },
    { id: "files", label: "Browse workspace files", hint: hint("open_files"), run: () => setShowFiles(true) },
    { id: "usage", label: "Usage (5h / week / month)", hint: hint("open_usage"), run: () => setShowUsage(true) },
    { id: "preview", label: "Preview compiled prompt", run: () => void doPreview() },
    {
      id: "docmode",
      label: docMode ? "Collapse the document" : "Expand the document to full height",
      hint: hint("toggle_doc_mode"),
      run: () => toggleDocMode(!docMode),
    },
    { id: "skills", label: "Insert a skill", hint: hint("open_skill_picker"), run: () => openSkillPickerRef.current?.() },
    { id: "rail", label: railCollapsed ? "Expand the sidebar" : "Collapse the sidebar", run: toggleRail },
    { id: "remote", label: "Remote control", run: () => setShowRemote(true) },
    { id: "settings", label: "Open settings", hint: hint("open_settings"), run: () => setShowSettings(true) },
    { id: "terminal", label: "Toggle terminal", hint: hint("toggle_terminal"), run: () => toggleDock("terminal") },
    { id: "browser", label: "Toggle browser", hint: hint("toggle_browser"), run: () => toggleDock("browser") },
    { id: "filespanel", label: "Toggle file tree", run: () => toggleDock("files") },
    { id: "gitpanel", label: "Toggle git panel", hint: hint("toggle_git"), run: () => toggleDock("git") },
    { id: "git", label: "Refresh git status", hint: hint("refresh_git"), run: refreshGit },
    { id: "perm", label: "Cycle approval mode", hint: hint("cycle_permission_mode"), run: () => dispatchAction("cycle_permission_mode") },
    ...scripts.map((s) => ({
      id: `script-${s.id}`,
      label: `Run script: ${s.name || s.id}`,
      hint: s.command,
      run: () => {
        toast(`Running “${s.name || s.id}”…`);
        void runProjectScript(cwd || ".", s.id)
          .then((out) => toast(out.trim() ? out.trim().slice(-300) : `“${s.name || s.id}” finished.`, "success"))
          .catch((e) => toast(`Script failed: ${e}`, "error"));
      },
    })),
    ...sessions.map((s) => ({
      id: `sess-${s.id}`,
      label: `Session: ${s.title}`,
      hint: displayProvider(s.provider),
      run: () => void selectSession(s.id),
    })),
  ];

  useEffect(() => {
    getKeymap().then(setBindings).catch(() => {});
    // Open on the project used last. Failing that, register the directory the app started in, so
    // the picker is never empty and the first session has somewhere real to run.
    listProjects()
      .then(async (list) => {
        setProjects(list);
        if (list.length > 0) {
          // The list is in a fixed order, so "used last" is a property of the rows, not their
          // position — read it off `last_opened_at` rather than taking the first one.
          const last = list.reduce((a, b) => (b.last_opened_at > a.last_opened_at ? b : a));
          activeProjectRef.current = last.path;
          setActiveProject(last.path);
          setCwd(last.path);
          return;
        }
        const here = await defaultCwd();
        setCwd(here);
        const resolved = await addProject(here).catch(() => null);
        if (resolved) {
          activeProjectRef.current = resolved;
          setActiveProject(resolved);
          listProjects().then(setProjects).catch(() => {});
        }
      })
      .catch(() => {
        defaultCwd().then(setCwd).catch(() => {});
      });
    // The app opens on a blank page, so put the caret in it. Deferred one tick: the editor installs
    // its focus handle in its own mount effect.
    setTimeout(() => focusEditorRef.current?.(), 0);
  }, []);

  useEffect(() => {
    refreshGit();
  }, [refreshGit, activeSession]);

  useEffect(() => {
    listProjectScripts(cwd || ".").then(setScripts).catch(() => setScripts([]));
  }, [cwd]);

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
      const action = actionForEvent(e, bindings);
      if (!action) return;
      // Escape is also how dialogs and the suggestion menu close; let those win when one is open.
      if (e.key === "Escape" && document.querySelector('[role="dialog"],.bn-suggestion-menu')) return;
      e.preventDefault();
      dispatchAction(action);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings, capturing, dispatchAction, toast]);

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

  const sessionConfig: SessionConfig = {
    providers,
    provider,
    onProvider: (p) => {
      providerPinned.current = true;
      setProvider(p);
    },
    mode,
    sandbox,
    onSessionMode: onSessionModeChange,
    useWorktree,
    onWorktree: setUseWorktree,
    planMode,
    onPlan: setPlanMode,
    hasSession: activeSession !== null,
  };

  return (
    <div className="app-shell flex h-screen flex-col overflow-hidden text-foreground">
      {/* Settings takes the whole window — its own nav rail replaces the session rail, and the
          Back row at its foot is the way home. */}
      {showSettings ? (
        <SettingsPage
          bindings={bindings}
          capturing={capturing}
          onCapture={setCapturing}
          onReset={resetBinding}
          onResetAll={resetAllBindings}
          providers={providers}
          onClose={() => {
            setShowSettings(false);
            setCapturing(null);
          }}
        />
      ) : (
      // page-in makes the return from settings (which remounts this whole subtree) a transition
      // rather than a cut, and doubles as the app's own opening animation.
      <div className="animate-page-in flex min-h-0 flex-1">
        {/* ---------------- sessions rail ---------------- */}
        <SessionRail
          projects={projects}
          activeProject={activeProject}
          onSelectProject={selectProject}
          onAddProject={() => void addProjectFolder()}
          onRenameProject={(p, name) => void renameProject(p, name).then(refreshProjects)}
          onRemoveProject={(p) => {
            void removeProject(p).then(() => {
              refreshProjects();
              // Dropping the project you were in leaves nothing selected; fall back to the next one
              // rather than stranding the rail on a project that's no longer listed.
              if (p === activeProject) {
                const next = projects.find((x) => x.path !== p);
                if (next) selectProject(next.path);
                else {
                  activeProjectRef.current = null;
                  setActiveProject(null);
                }
              }
            });
          }}
          sessions={sessions}
          archivedSessions={archivedSessions}
          previews={previews}
          activeSession={activeSession}
          running={running}
          onSelect={(id) => void selectSession(id)}
          onNew={() => void createSession()}
          onRename={(id, title) => void renameSession(id, title).then(refreshSessions)}
          onArchive={(id, archived) => void archiveSession(id, archived).then(refreshSessions)}
          displayProvider={displayProvider}
          model={modelLabel}
          provider={provider}
          git={git}
          diffStat={diffStat}
          onOpenSourceControl={openSourceControl}
          onOpenMarket={openMarket}
          width={railWidth}
          onWidth={setRailWidth}
          newHint={hint("new_session")}
          searchHint={hint("open_command_palette")}
          onOpenSearch={() => setShowPalette(true)}
          onOpenSettings={() => setShowSettings(true)}
          collapsed={railCollapsed}
          onToggleCollapse={toggleRail}
        />

        {/* ---------------- the session column ---------------- */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background" ref={mainRef}>
          {/* Also a window drag region: the overlay title bar draws nothing to grab. Buttons and
              other children stay clickable — only elements carrying the attribute start a drag. */}
          {/* A 40px bar with content centred on the 20px line the traffic lights sit on — the same
              line as the rail's wordmark and the dock's tabs. With the rail collapsed, the inset
              clears the lights and the expand button takes the wordmark's place. */}
          <header
            data-tauri-drag-region
            className={cn(
              "flex items-center gap-1.5 border-b pb-1.5 pr-3 pt-1.5",
              railCollapsed ? "pl-[78px]" : "pl-3",
            )}
          >
            {railCollapsed && (
              <IconAction icon={PanelLeft} label={t("rail.expand")} onClick={toggleRail} />
            )}
            {/* Breadcrumb, reference-style: project / thread. */}
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            {activeProjectName && (
              <>
                <span data-tauri-drag-region className="max-w-40 truncate text-ui text-muted-foreground">
                  {activeProjectName}
                </span>
                <span className="shrink-0 text-ui text-muted-foreground/50">/</span>
              </>
            )}
            <span data-tauri-drag-region className="max-w-96 truncate text-ui font-medium">
              {activeTitle}
            </span>

            <div data-tauri-drag-region className="flex-1" />

            {/* Full-page mode hides the transcript, so the header carries the only sign that a turn
                is in flight — and the way back to the answer without leaving the mode for good. */}
            {docMode && (running || turns.length > 0) && (
              <button
                onClick={() => toggleDocMode(false)}
                className="mr-1 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-fine text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                title={t("header.showTranscript", { count: turns.length })}
              >
                {running && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
                {running ? t("header.running") : t("header.turns", { count: turns.length })}
              </button>
            )}

            {/* One control, not a toolbar: the panel toggle. Opening lands on the surface picker;
                the dock's own tabs and the keyboard shortcuts pick specific surfaces. */}
            <IconAction
              icon={PanelRight}
              label={t("header.panel")}
              active={dockTab !== null}
              onClick={() => {
                setDockTab(dockTab ? null : "home");
                setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
              }}
            />
          </header>

          {/* The transcript owns the column once it exists; in document mode the editor takes the
              column and the transcript moves to a side panel on the right. */}
          {!docMode && turns.length > 0 && (
            <section className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[860px] px-6 pb-2 pt-3">
                {turns.map((t) => (
                  <TurnCard key={t.id} turn={t} />
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </section>
          )}

          {/* One wrapper in both modes so the Composer keeps its tree position across the toggle —
              BlockNote unmounts (and takes the draft with it) if the structure around it changes.
              Compact, the wrapper is just the composer's slot; expanded, it's a row that gives the
              document the column and hangs the conversation off its right. An empty thread is the
              hero state: the heading and the card sit together in the centre of the column. */}
          <div
            className={cn(
              "flex",
              docMode
                ? "min-h-0 min-w-0 flex-1"
                : turns.length === 0
                  ? "min-h-0 flex-1 flex-col justify-center pb-20"
                  : "shrink-0 flex-col",
            )}
          >
          {/* "What should we build in <project>?" — the project name carries the dotted underline. */}
          {!docMode && turns.length === 0 && (
            <h1 className="animate-rise-in mb-7 px-6 text-center text-[26px] font-semibold tracking-[-0.01em]">
              {t("transcript.greetingIn")}{" "}
              <span className="underline decoration-muted-foreground/40 decoration-dotted underline-offset-[7px]">
                {activeProjectName ?? t("rail.noProject")}
              </span>
              {t("transcript.greetingEnd")}
            </h1>
          )}
          <Composer
            config={sessionConfig}
            hero={turns.length === 0}
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
            models={models}
            currentModel={currentModel}
            defaultModel={defaultModel}
            onModel={(id) => {
              if (!activeSessionRef.current) return;
              // Optimistic: the engine answers with a `models` event, or an `error` if the provider
              // doesn't implement the switch.
              setCurrentModel(id);
              void setModel(activeSessionRef.current, id).catch((e) =>
                toast(t("toast.modelFailed", { error: String(e) }), "error"),
              );
            }}
            configOptions={configOptions}
            onConfigOption={(configId, value) => {
              if (!activeSessionRef.current) return;
              // Optimistic: the engine echoes the agent's authoritative `config_options` set, or
              // an `error` event if the option isn't supported — either replaces this state.
              setConfigOptions((prev) =>
                prev.map((o) => (o.id === configId ? { ...o, current: value } : o)),
              );
              void setConfigOption(activeSessionRef.current, configId, value).catch((e) =>
                toast(t("toast.modelFailed", { error: String(e) }), "error"),
              );
            }}
            running={running}
            docEmpty={docEmpty}
            onRun={() => void run()}
            onStop={() => activeSession && void cancelTurn(activeSession)}
            onAttachFile={() => setShowFiles(true)}
            onInsertSkill={() => openSkillPickerRef.current?.()}
            onInsertIssue={() => setShowIssues(true)}
            onOpenMarket={openMarket}
            onNewSkill={() => setSkillDraft({ name: "", text: "" })}
            onVoiceText={(t) => insertTextRef.current?.(t)}
            runHint={hint("run")}
            skillHint={hint("open_skill_picker")}
            filesHint={hint("open_files")}
          >
            <DocEditor
              key={editorKey}
              skills={skills}
              cwd={cwd || "."}
              getBlocksRef={getBlocksRef}
              insertTextRef={insertTextRef}
              insertAnnotationRef={insertAnnotationRef}
              insertFileRef={insertFileRef}
              focusRef={focusEditorRef}
              clearRef={clearEditorRef}
              openSkillPickerRef={openSkillPickerRef}
              onEmptyChange={setDocEmpty}
            />
          </Composer>

          {/* Document mode's view of the conversation: beside the page, not instead of it. Only
              once there's something to show — a fresh document keeps the full width. */}
          {docMode && (turns.length > 0 || running) && (
            <aside className="animate-slide-in-right min-h-0 w-[360px] max-w-[38%] shrink-0 overflow-y-auto border-l bg-fill-quiet px-4 pb-4 pt-2">
              {turns.map((t) => (
                <TurnCard key={t.id} turn={t} />
              ))}
              <div ref={transcriptEndRef} />
            </aside>
          )}
          </div>
        </main>

        {/* ---------------- side dock ---------------- */}
        {/* Always mounted: closing animates the width to zero instead of unmounting, which both
            plays the full collapse and keeps shells alive across close/open. */}
        <Dock
            open={dockTab !== null}
            tab={dockTab}
            onTab={setDockTab}
            onClose={() => setDockTab(null)}
            cwd={cwd || null}
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
            onActiveFile={(p) => {
              setActiveFile(p);
              setFileEditing(false);
            }}
            onCloseFile={closeFileTab}
            fileEditing={fileEditing}
            onFileEditing={setFileEditing}
            width={dockWidth}
            onWidth={setDockWidth}
          />
      </div>
      )}

      {/* ---------------- dialogs ---------------- */}
      {showMarket && (
        <MarketModal
          items={market}
          onInstall={(id) => void marketInstall(id).then(() => { marketCatalog().then(setMarket); refreshSkills(); })}
          onUninstall={(id) => void deleteSkill(id).then(() => { marketCatalog().then(setMarket); refreshSkills(); })}
          onClose={() => setShowMarket(false)}
        />
      )}
      {showSourceControl && (
        <SourceControlModal
          cwd={cwd || "."}
          status={git}
          checkpoints={checkpoints}
          onCommit={async (m) => {
            try {
              await gitCommit(cwd || ".", m);
              toast("Committed.", "success");
            } catch (e) {
              toast(`Commit failed: ${e}`, "error");
            }
            refreshGit();
          }}
          onPush={async () => {
            try {
              await gitPush(cwd || ".");
              toast("Pushed.", "success");
            } catch (e) {
              toast(`Push failed: ${e}`, "error");
            }
          }}
          onCheckpoint={doCheckpoint}
          onRevert={async (c) => {
            await gitRevert(cwd || ".", c);
            refreshGit();
          }}
          onRefresh={() => {
            refreshGit();
            gitCheckpoints(cwd || ".").then(setCheckpoints).catch(() => {});
          }}
          onClose={() => setShowSourceControl(false)}
        />
      )}
      {showPalette && <CommandPalette commands={paletteCommands} onClose={() => setShowPalette(false)} />}
      {showRemote && <RemoteModal onClose={() => setShowRemote(false)} />}
      {showIssues && (
        <IssuesModal cwd={cwd || "."} onInsert={(i) => void insertIssue(i)} onClose={() => setShowIssues(false)} />
      )}
      {preview && <PreviewModal preview={preview} onClose={() => setPreview(null)} />}
      {showUsage && <UsageModal onClose={() => setShowUsage(false)} />}
      {showFiles && (
        <FileBrowserModal
          cwd={cwd || "."}
          onInsert={(p) => {
            insertFileRef.current?.(p);
            setShowFiles(false);
          }}
          onClose={() => setShowFiles(false)}
        />
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
              onChange={(e) => setSkillDraft({ ...skillDraft, name: e.target.value })}
            />
            <textarea
              className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-ui outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="Prompt fragment inserted when this skill is picked"
              value={skillDraft.text}
              onChange={(e) => setSkillDraft({ ...skillDraft, text: e.target.value })}
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

      {permission && (
        <Dialog open onOpenChange={(o) => !o && void answer(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CircleAlert className="size-4 text-warning" /> Permission requested
              </DialogTitle>
            </DialogHeader>
            <p className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-ui">{permission.title}</p>
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
