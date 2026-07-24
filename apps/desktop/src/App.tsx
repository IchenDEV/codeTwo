import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronRight,
  CircleAlert,
  Eye,
  GitBranch,
  Keyboard,
  PanelRight,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  Square,
  Store,
} from "lucide-react";

import { DocEditor } from "./editor/Editor";
import {
  answerPermission,
  archiveSession,
  browserContext,
  cancelTurn,
  compileDoc,
  DEFAULT_KEYMAP,
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
  listProviders,
  listSessions,
  listSkills,
  marketCatalog,
  marketInstall,
  newSession,
  onEngineEvent,
  providerLabel,
  remoteStatus,
  renameSession,
  runProjectScript,
  saveSkill,
  setKeymap,
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
  type ProjectScript,
  type ProviderInfo,
  type RemoteInfo,
  type Sandbox,
  type SessionInfo,
  type SkillInfo,
} from "./bridge";
import { MarketModal } from "./market/Market";
import { SettingsModal } from "./settings/Settings";
import { SourceControlModal } from "./git/SourceControl";
import { CommandPalette, type Command } from "./palette/CommandPalette";
import { RemoteModal } from "./remote/Remote";
import { IssuesModal } from "./issues/Issues";
import { PreviewModal } from "./editor/Preview";
import { FileBrowserModal } from "./files/FileBrowser";
import { VoiceButton } from "./voice/VoiceButton";
import { UsageModal } from "./usage/Usage";
import { ConfigPopover } from "./session/ConfigPopover";
import { TurnCard } from "./session/TurnCard";
import { applyEvent, isRunning, newTurn, turnsFromTranscript, type Turn } from "./session/turns";
import { Dock, type DockTab } from "./dock/Dock";

import { actionForEvent, comboFromEvent, isModifierOnly, keyHint } from "./keys";
import { useToast } from "./ui/toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  icon: typeof Eye;
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
  const [browserUrl, setBrowserUrl] = useState("https://developer.mozilla.org");
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
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [tokens, setTokens] = useState<number>(0);
  const [showFiles, setShowFiles] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [dockTab, setDockTab] = useState<DockTab | null>(null);
  const [editorPct, setEditorPct] = useState(45);
  const [dragging, setDragging] = useState(false);
  const [docEmpty, setDocEmpty] = useState(true);
  const mainRef = useRef<HTMLElement | null>(null);
  const toast = useToast();

  const getBlocksRef = useRef<(() => DocBlock[]) | null>(null);
  const insertTextRef = useRef<((text: string) => void) | null>(null);
  const insertFileRef = useRef<((path: string) => void) | null>(null);
  const focusEditorRef = useRef<(() => void) | null>(null);
  const openSkillPickerRef = useRef<(() => void) | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const pendingDocRef = useRef<DocBlock[] | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const refreshSessions = useCallback(() => {
    listSessions().then(setSessions).catch(() => {});
  }, []);

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
        if (ev.event === "turn_ended" || ev.event === "error") setRunning(false);
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
      toast("Write a prompt first — the document is empty.");
      focusEditorRef.current?.();
      return;
    }
    if (running) {
      toast("A turn is already running. Stop it first.");
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
    } catch (e) {
      setRunning(false);
      toast(`Could not start the turn: ${e}`, "error");
    }
  }, [provider, cwd, useWorktree, planMode, running, toast]);

  const createSession = useCallback(async () => {
    pendingDocRef.current = null;
    setTurns([]);
    try {
      await newSession(provider, cwd || ".", useWorktree);
    } catch (e) {
      toast(`Could not create a session: ${e}`, "error");
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

  const selectSession = useCallback(async (id: string) => {
    activeSessionRef.current = id;
    setActiveSession(id);
    setTurns(turnsFromTranscript(await getTranscript(id)));
  }, []);

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

  const toggleDock = useCallback((t: DockTab) => {
    setDockTab((cur) => (cur === t ? null : t));
    setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
  }, []);

  const startSplitDrag = useCallback(() => {
    setDragging(true);
    const onMove = (e: MouseEvent) => {
      const el = mainRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setEditorPct(Math.min(85, Math.max(15, ((e.clientY - rect.top) / rect.height) * 100)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.dispatchEvent(new Event("resize"));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
          else toast("Nothing is running.");
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
    { id: "skills", label: "Insert a skill", hint: hint("open_skill_picker"), run: () => openSkillPickerRef.current?.() },
    { id: "remote", label: "Remote control", run: () => setShowRemote(true) },
    { id: "settings", label: "Open settings", hint: hint("open_settings"), run: () => setShowSettings(true) },
    { id: "terminal", label: "Toggle terminal", hint: hint("toggle_terminal"), run: () => toggleDock("terminal") },
    { id: "browser", label: "Toggle browser", hint: hint("toggle_browser"), run: () => toggleDock("browser") },
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

  const currentProvider = providers.find((p) => p.id === provider);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="flex min-h-0 flex-1">
        {/* ---------------- sessions rail ---------------- */}
        <aside className="flex w-60 min-w-60 flex-col border-r bg-sidebar">
          <div className="flex items-center justify-between px-3 pb-2.5 pt-7">
            <span className="text-[15px] font-bold tracking-tight">codeTwo</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="size-7" onClick={() => void createSession()}>
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                New session <span className="ml-1 opacity-60">{hint("new_session")}</span>
              </TooltipContent>
            </Tooltip>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-px px-1.5 pb-2">
              {sessions.length === 0 && (
                <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                  No sessions yet.
                  <br />
                  Write a prompt and hit Run.
                </p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => void selectSession(s.id)}
                  className={cn(
                    "group cursor-pointer rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent",
                    s.id === activeSession && "bg-accent",
                  )}
                >
                  {renaming?.id === s.id ? (
                    <Input
                      autoFocus
                      className="h-6 text-[13px]"
                      value={renaming.title}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenaming({ id: s.id, title: e.target.value })}
                      onBlur={() => setRenaming(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          void renameSession(s.id, renaming.title).then(refreshSessions);
                          setRenaming(null);
                        } else if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <div className={cn("truncate text-[13px] font-medium", s.id === activeSession && "text-primary")}>
                      {s.title}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {displayProvider(s.provider)}
                    {s.worktree_path && <Badge variant="secondary" className="h-4 px-1 text-[9px]">wt</Badge>}
                    <span className="ml-auto hidden gap-0.5 group-hover:flex">
                      <button
                        title="Rename"
                        className="rounded p-0.5 hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenaming({ id: s.id, title: s.title });
                        }}
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        title="Archive"
                        className="rounded p-0.5 hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          void archiveSession(s.id, true).then(refreshSessions);
                        }}
                      >
                        <Archive className="size-3" />
                      </button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Skills live at the foot of the rail — they're picked with "/" in the doc, not here. */}
          <div className="border-t px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {skills.length} skills
              </span>
              <span className="flex gap-1">
                <Button variant="ghost" size="icon" className="size-5" onClick={openMarket} title="Skill market">
                  <Store className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5"
                  onClick={() => setSkillDraft({ name: "", text: "" })}
                  title="New skill"
                >
                  <Plus className="size-3" />
                </Button>
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Type <b>/</b> in the document to insert one.
            </p>
          </div>
        </aside>

        {/* ---------------- document + transcript ---------------- */}
        <main className="flex min-w-0 flex-1 flex-col" ref={mainRef}>
          <header className="flex items-center gap-1.5 border-b bg-card px-3 pb-2.5 pt-7">
            <span className="max-w-56 truncate text-[13px] font-semibold">{activeTitle}</span>

            <ConfigPopover
              providers={providers}
              provider={provider}
              onProvider={(p) => {
                providerPinned.current = true;
                setProvider(p);
              }}
              cwd={cwd}
              onCwd={setCwd}
              mode={mode}
              onMode={onModeChange}
              sandbox={sandbox}
              onSandbox={onSandboxChange}
              useWorktree={useWorktree}
              onWorktree={setUseWorktree}
              planMode={planMode}
              onPlan={setPlanMode}
            />

            <div className="flex-1" />

            <VoiceButton onText={(t) => insertTextRef.current?.(t)} />
            <IconAction icon={Eye} label="Preview compiled prompt" onClick={() => void doPreview()} />
            <IconAction
              icon={Keyboard}
              label="Command palette"
              hint={hint("open_command_palette")}
              onClick={() => setShowPalette(true)}
            />
            <IconAction
              icon={SettingsIcon}
              label="Settings"
              hint={hint("open_settings")}
              onClick={() => setShowSettings(true)}
            />
            <IconAction
              icon={PanelRight}
              label="Toggle side panel"
              hint={hint("toggle_terminal")}
              active={dockTab !== null}
              onClick={() => toggleDock(dockTab ?? "terminal")}
            />

            {running ? (
              <Button
                variant="destructive"
                size="sm"
                className="ml-1 shrink-0"
                onClick={() => activeSession && void cancelTurn(activeSession)}
              >
                <Square className="size-3.5" /> Stop
                <span className="ml-0.5 opacity-70">{hint("cancel")}</span>
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Kept enabled on purpose: a disabled button explains nothing, and clicking it
                      focuses the editor and says what's missing. */}
                  <Button
                    size="sm"
                    variant={docEmpty ? "secondary" : "default"}
                    className="ml-1 shrink-0"
                    onClick={() => void run()}
                  >
                    Run <ChevronRight className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {docEmpty ? "Write a prompt first" : "Run this document"}
                  <span className="ml-1.5 opacity-60">{hint("run")}</span>
                </TooltipContent>
              </Tooltip>
            )}
          </header>

          {/* Both panes share one centred measure so the prompt and its answer line up. */}
          <section className="min-h-[90px] overflow-y-auto pt-5" style={{ flex: `0 0 ${editorPct}%` }}>
            <div className="mx-auto w-full max-w-[820px] px-2">
              <DocEditor
                skills={skills}
                cwd={cwd || "."}
                getBlocksRef={getBlocksRef}
                insertTextRef={insertTextRef}
                insertFileRef={insertFileRef}
                focusRef={focusEditorRef}
                openSkillPickerRef={openSkillPickerRef}
                onEmptyChange={setDocEmpty}
              />
            </div>
          </section>

          <div className={cn("splitter", dragging && "dragging")} onMouseDown={startSplitDrag} title="Drag to resize" />

          <section className="min-h-20 flex-1 overflow-y-auto bg-muted/30">
            <div className="mx-auto w-full max-w-[820px] px-5">
              {turns.length === 0 ? (
                <p className="py-8 text-center text-xs leading-relaxed text-muted-foreground">
                  Compose above, then press <b>Run</b> ({hint("run")}).
                  <br />
                  Type <b>/</b> for skills, <b>@</b> to pull in a file.
                </p>
              ) : (
                turns.map((t) => <TurnCard key={t.id} turn={t} />)
              )}
              <div ref={transcriptEndRef} />
            </div>
          </section>
        </main>

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
          />
        )}
      </div>

      {/* ---------------- status bar ---------------- */}
      <footer className="flex h-7 shrink-0 items-center gap-3 border-t bg-card px-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", currentProvider?.available ? "bg-success" : "bg-border")} />
          {currentProvider?.display_name ?? provider}
        </span>
        {git?.is_repo && (
          <span className="flex items-center gap-1">
            <GitBranch className="size-3" />
            {git.branch}
            {git.files.length > 0 && <span className="text-warning">•{git.files.length}</span>}
          </span>
        )}
        <span className="font-mono">{mode}</span>
        <span className="font-mono">{sandbox.replace("_", " ")}</span>
        {useWorktree && <span>worktree</span>}
        {planMode && <span>plan</span>}
        <div className="flex-1" />
        {isRunning(turns[turns.length - 1]) && (
          <span className="flex items-center gap-1 text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" /> running
          </span>
        )}
        {tokens > 0 && (
          <button className="font-mono hover:text-foreground" onClick={() => setShowUsage(true)} title="Usage">
            {(tokens / 1000).toFixed(1)}k ctx
          </button>
        )}
      </footer>

      {/* ---------------- dialogs ---------------- */}
      {showSettings && (
        <SettingsModal
          bindings={bindings}
          capturing={capturing}
          onCapture={setCapturing}
          onReset={resetBinding}
          onClose={() => {
            setShowSettings(false);
            setCapturing(null);
          }}
        />
      )}
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
