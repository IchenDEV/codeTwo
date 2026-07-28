import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  Folder,
  GitBranch,
  Keyboard,
  PanelRight,
  Settings as SettingsIcon,
} from "lucide-react";

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
  gitPush,
  gitRevert,
  gitStatus,
  issueContext,
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
  remoteStatus,
  removeProject,
  renameProject,
  renameSession,
  runProjectScript,
  saveSkill,
  sessionPreviews,
  setKeymap,
  setModel,
  setPermissionMode,
  setSandbox,
  submitPrompt,
  type Checkpoint,
  type CompiledPreview,
  type CoreEvent,
  type DocBlock,
  type GitStatus,
  type Issue,
  type KeymapEntry,
  type MarketItem,
  type ModelChoice,
  type Project,
  type ProjectScript,
  type ProviderInfo,
  type RemoteInfo,
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
import { FileViewer } from "./files/FileViewer";
import { UsageModal } from "./usage/Usage";
import type { SessionConfig } from "./session/ConfigPopover";
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

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

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
          className={cn("size-8 shrink-0", active && "text-primary")}
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
  const [bindings, setBindings] = useState<KeymapEntry[]>([]);
  // A blank tab, not a landing page: most sites refuse to be iframed anyway, and this browser's
  // job is your localhost dev server, which you type in.
  const [browserUrl, setBrowserUrl] = useState("about:blank");
  const [showSettings, setShowSettings] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [showMarket, setShowMarket] = useState(false);
  const [market, setMarket] = useState<MarketItem[]>([]);
  const [showSourceControl, setShowSourceControl] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [showPalette, setShowPalette] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [remoteInfo, setRemoteInfo] = useState<RemoteInfo | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [preview, setPreview] = useState<CompiledPreview | null>(null);
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [tokens, setTokens] = useState<number>(0);
  const [showFiles, setShowFiles] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab | null>(null);
  const [docEmpty, setDocEmpty] = useState(true);
  // Models are reported by the agent at session/new, so they arrive as an event rather than a call.
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  // Projects are the rail's organising idea: the conversation list and the git section below it
  // both describe whichever one is active.
  const [projects, setProjects] = useState<Project[]>([]);
  // Row 2 of every rail entry. Refreshed when a turn ends rather than per streamed chunk — the
  // preview is a glance, and requerying the transcript table on every token would be absurd.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [activeProject, setActiveProject] = useState<string | null>(null);
  // The built-in file view. Opening is read-only; `fileEditing` is the deliberate second step.
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [fileEditing, setFileEditing] = useState(false);
  // Composer geometry: how tall the document area may grow before it scrolls, and whether it has
  // taken over the whole column for long-form authoring.
  const [composerH, setComposerH] = usePersistedNumber("codetwo.composerHeight", 190);
  const [dockWidth, setDockWidth] = usePersistedNumber("codetwo.dockWidth", 440);
  // Full-page document is *the* mode of this app, not a temporary state it visits. Nothing here
  // takes it away on your behalf — not sending, not switching sessions. It's a preference you set
  // and the app keeps, because a document-first tool that keeps collapsing into a chat box isn't
  // document-first. Only the ⤢ button and Mod+Shift+E change it.
  const [docModeRaw, setDocModeRaw] = usePersistedNumber("codetwo.docMode", 1);
  const docMode = docModeRaw !== 0;
  const setDocMode = useCallback((v: boolean) => setDocModeRaw(v ? 1 : 0), [setDocModeRaw]);
  const mainRef = useRef<HTMLElement | null>(null);
  const toast = useToast();
  const t = useT();
  const { locale } = useLanguage();

  const getBlocksRef = useRef<(() => DocBlock[]) | null>(null);
  const insertTextRef = useRef<((text: string) => void) | null>(null);
  const insertFileRef = useRef<((path: string) => void) | null>(null);
  const focusEditorRef = useRef<(() => void) | null>(null);
  const clearEditorRef = useRef<(() => void) | null>(null);
  const openSkillPickerRef = useRef<(() => void) | null>(null);
  const activeSessionRef = useRef<string | null>(null);
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
        if (ev.event === "usage") {
          setTokens(ev.input_tokens);
          return;
        }
        if (ev.event === "models") {
          // A switch echoes back the same list; only session/new carries a fresh one.
          if (ev.available.length > 0) setModels(ev.available);
          setCurrentModel(ev.current || null);
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

  const onModeChange = useCallback((m: string) => {
    setMode(m);
    if (activeSessionRef.current) void setPermissionMode(activeSessionRef.current, m);
  }, []);

  const onSandboxChange = useCallback((s: Sandbox) => {
    setSandboxState(s);
    if (activeSessionRef.current) void setSandbox(activeSessionRef.current, s);
  }, []);

  const selectSession = useCallback(
    async (id: string) => {
      activeSessionRef.current = id;
      setActiveSession(id);
      // Models belong to a session. The agent only reports the list at session/new, so for a
      // session resumed from the store we know the chosen model but not the menu it came from.
      setModels([]);
      setCurrentModel(sessions.find((s) => s.id === id)?.model ?? null);
      setTurns(turnsFromTranscript(await getTranscript(id)));
    },
    [sessions],
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

  const refreshGit = useCallback(() => {
    gitStatus(cwd || ".").then(setGit).catch(() => setGit(null));
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

  const annotate = useCallback(
    async (note: string) => {
      const ctx = await browserContext({ url: browserUrl, note, selector: null, selected_text: null });
      insertTextRef.current?.(ctx);
    },
    [browserUrl],
  );

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

  /**
   * Insert into the prompt from the file viewer. The viewer replaces the editor column, and the
   * editor nulls its insert refs on unmount — so "insert" must first close the viewer, then wait
   * for the editor to remount and re-install them. Without this the button was a silent no-op.
   */
  const insertFromViewer = useCallback((run: () => boolean) => {
    setOpenFile(null);
    setFileEditing(false);
    let tries = 0;
    const tick = () => {
      if (!run() && tries++ < 20) setTimeout(tick, 50);
    };
    setTimeout(tick, 0);
  }, []);

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
          const next = mode === "ask" ? "accept_edits" : mode === "accept_edits" ? "yolo" : "ask";
          onModeChange(next);
          toast(`Approvals: ${next.replace("_", " ")}`);
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
      onModeChange,
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
    remoteStatus().then(setRemoteInfo).catch(() => {});
    // Open on the project used last. Failing that, register the directory the app started in, so
    // the picker is never empty and the first session has somewhere real to run.
    listProjects()
      .then(async (list) => {
        setProjects(list);
        if (list.length > 0) {
          setActiveProject(list[0].path);
          setCwd(list[0].path);
          return;
        }
        const here = await defaultCwd();
        setCwd(here);
        const resolved = await addProject(here).catch(() => null);
        if (resolved) {
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

  const currentProvider = providers.find((p) => p.id === provider);

  const sessionConfig: SessionConfig = {
    providers,
    provider,
    onProvider: (p) => {
      providerPinned.current = true;
      setProvider(p);
    },
    cwd,
    onCwd: setCwd,
    mode,
    onMode: onModeChange,
    sandbox,
    onSandbox: onSandboxChange,
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
      <div className="flex min-h-0 flex-1">
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
                else setActiveProject(null);
              }
            });
          }}
          sessions={sessions}
          activeSession={activeSession}
          previews={previews}
          running={running}
          onSelect={(id) => void selectSession(id)}
          onNew={() => void createSession()}
          onRename={(id, title) => void renameSession(id, title).then(refreshSessions)}
          onArchive={(id) => void archiveSession(id, true).then(refreshSessions)}
          displayProvider={displayProvider}
          skills={skills}
          onOpenMarket={openMarket}
          onNewSkill={() => setSkillDraft({ name: "", text: "" })}
          newHint={hint("new_session")}
          searchHint={hint("open_command_palette")}
          onOpenSearch={() => setShowPalette(true)}
          onOpenSettings={() => setShowSettings(true)}
          status={
            <>
              <span
                className={cn("size-1.5 shrink-0 rounded-full", currentProvider?.available ? "bg-success" : "bg-border")}
              />
              <span className="truncate">{currentProvider?.display_name ?? provider}</span>
              {tokens > 0 && (
                <button
                  className="ml-auto shrink-0 font-mono hover:text-foreground"
                  onClick={() => setShowUsage(true)}
                  title="Usage"
                >
                  {(tokens / 1000).toFixed(1)}k
                </button>
              )}
            </>
          }
        />

        {/* ---------------- the file viewer, or the session ---------------- */}
        {openFile && activeProject ? (
          <FileViewer
            cwd={activeProject}
            path={openFile}
            editing={fileEditing}
            onEditing={setFileEditing}
            onClose={() => {
              setOpenFile(null);
              setFileEditing(false);
            }}
            onInsert={(p) =>
              insertFromViewer(() => {
                if (!insertFileRef.current) return false;
                insertFileRef.current(p);
                return true;
              })
            }
            onComment={(text) =>
              insertFromViewer(() => {
                if (!insertTextRef.current) return false;
                insertTextRef.current(text);
                return true;
              })
            }
          />
        ) : (
        <main className="content-surface flex min-w-0 flex-1 flex-col" ref={mainRef}>
          {/* Also a window drag region: the overlay title bar draws nothing to grab. Buttons and
              other children stay clickable — only elements carrying the attribute start a drag. */}
          <header data-tauri-drag-region className="flex items-center gap-1.5 px-3 pb-2 pt-7">
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
            <span data-tauri-drag-region className="max-w-96 truncate text-[13px] font-semibold">
              {activeTitle}
            </span>
            {/* The rail no longer carries a git section, so this chip is the glance — and the
                click-through to review & commit. */}
            {git?.is_repo && (
              <button
                onClick={openSourceControl}
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t("action.open_source_control")}
              >
                <GitBranch className="size-3" />
                {git.branch}
                {git.files.length > 0 && <span className="text-warning">•{git.files.length}</span>}
              </button>
            )}

            <div data-tauri-drag-region className="flex-1" />

            {/* Full-page mode hides the transcript, so the header carries the only sign that a turn
                is in flight — and the way back to the answer without leaving the mode for good. */}
            {docMode && (running || turns.length > 0) && (
              <button
                onClick={() => toggleDocMode(false)}
                className="mr-1 flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t("header.showTranscript", { count: turns.length })}
              >
                {running && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
                {running ? t("header.running") : t("header.turns", { count: turns.length })}
              </button>
            )}

            <IconAction
              icon={Keyboard}
              label={t("header.palette")}
              hint={hint("open_command_palette")}
              onClick={() => setShowPalette(true)}
            />
            <IconAction
              icon={SettingsIcon}
              label={t("header.settings")}
              hint={hint("open_settings")}
              onClick={() => setShowSettings(true)}
            />
            <IconAction
              icon={PanelRight}
              label={t("header.panel")}
              hint={hint("toggle_terminal")}
              active={dockTab !== null}
              // Opening from here lands on the surface picker; the shortcuts still jump straight
              // to a specific surface.
              onClick={() => {
                setDockTab(dockTab ? null : "home");
                setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
              }}
            />
          </header>

          {/* The transcript owns the column; the composer is docked under it. In document mode the
              transcript steps aside entirely and the editor gets the whole height. */}
          {!docMode && (
            <section className="min-h-0 flex-1 overflow-y-auto">
              {turns.length === 0 ? (
                <div className="flex h-full items-center justify-center px-6 pb-10">
                  <div className="animate-rise-in text-center">
                    <p className="text-[17px] font-medium">{t("transcript.greeting")}</p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {t("transcript.hint")}
                      <br />
                      {t("transcript.hint2", { run: hint("run"), expand: hint("toggle_doc_mode") })}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-[860px] px-6 pb-2">
                  {turns.map((t) => (
                    <TurnCard key={t.id} turn={t} />
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </section>
          )}

          <Composer
            config={sessionConfig}
            docMode={docMode}
            onDocMode={toggleDocMode}
            height={composerH}
            onHeight={setComposerH}
            boundsRef={mainRef}
            models={models}
            currentModel={currentModel}
            onModel={(id) => {
              if (!activeSessionRef.current) return;
              // Optimistic: the engine answers with a `models` event, or an `error` if the provider
              // doesn't implement the switch.
              setCurrentModel(id);
              void setModel(activeSessionRef.current, id).catch((e) =>
                toast(t("toast.modelFailed", { error: String(e) }), "error"),
              );
            }}
            running={running}
            docEmpty={docEmpty}
            onRun={() => void run()}
            onStop={() => activeSession && void cancelTurn(activeSession)}
            onPreview={() => void doPreview()}
            onAttachFile={() => setShowFiles(true)}
            onInsertSkill={() => openSkillPickerRef.current?.()}
            onInsertIssue={() => setShowIssues(true)}
            onOpenMarket={openMarket}
            onVoiceText={(t) => insertTextRef.current?.(t)}
            runHint={hint("run")}
            docModeHint={hint("toggle_doc_mode")}
            skillHint={hint("open_skill_picker")}
            filesHint={hint("open_files")}
          >
            <DocEditor
              key={editorKey}
              skills={skills}
              cwd={cwd || "."}
              getBlocksRef={getBlocksRef}
              insertTextRef={insertTextRef}
              insertFileRef={insertFileRef}
              focusRef={focusEditorRef}
              clearRef={clearEditorRef}
              openSkillPickerRef={openSkillPickerRef}
              onEmptyChange={setDocEmpty}
            />
          </Composer>
        </main>
        )}

        {/* ---------------- side dock ---------------- */}
        {dockTab && (
          <Dock
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
            onOpenFile={(p) => {
              setOpenFile(p);
              setFileEditing(false);
            }}
            openFile={openFile}
            width={dockWidth}
            onWidth={setDockWidth}
          />
        )}
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
      {showRemote && <RemoteModal info={remoteInfo} onStarted={setRemoteInfo} onClose={() => setShowRemote(false)} />}
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
              className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
            <p className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-[13px]">{permission.title}</p>
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
