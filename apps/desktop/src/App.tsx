import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronRight,
  CircleDot,
  Eye,
  GitBranch,
  Globe,
  Keyboard,
  Pencil,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Square,
  Store,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";

import { DocEditor } from "./editor/Editor";
import { TerminalPanel } from "./terminal/Terminal";
import {
  answerPermission,
  archiveSession,
  browserContext,
  cancelTurn,
  compileDoc,
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
  type Part,
  type ProjectScript,
  type ProviderInfo,
  type RemoteInfo,
  type Sandbox,
  type SessionInfo,
  type SkillInfo,
} from "./bridge";
import { BrowserPanel } from "./browser/Browser";
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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TranscriptItem {
  kind: "user" | "agent" | "thought" | "tool" | "plan" | "error" | "end";
  text: string;
}

interface PermissionState {
  session: string;
  requestId: string;
  title: string;
  options: [string, string][];
}

/** ⌘ on macOS, Ctrl elsewhere — for shortcut hints in the UI. */
const MOD = /mac/i.test(navigator.userAgent) ? "⌘" : "Ctrl";

function summarizeDoc(doc: DocBlock[]): string {
  return doc.map(describeBlock).join(" ").slice(0, 400);
}

function partToItem(role: string, part: Part): TranscriptItem {
  switch (part.kind) {
    case "text":
      return { kind: role === "user" ? "user" : "agent", text: part.text };
    case "reasoning":
      return { kind: "thought", text: part.text };
    case "tool_call":
      return { kind: "tool", text: `${part.title || part.id} — ${part.status}` };
    case "plan":
      return { kind: "plan", text: part.entries.join("\n") };
  }
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let k = e.key;
  if (k === " ") k = "Space";
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join("+");
}

/** A compact toolbar icon button with a tooltip. */
function IconAction({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: typeof Globe;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="icon"
          className={cn("size-8 shrink-0", active && "text-primary")}
          onClick={onClick}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A labelled section header in the sidebar. */
function SectionTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </span>
      {actions && <div className="flex gap-1">{actions}</div>}
    </div>
  );
}

export default function App() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [provider, setProvider] = useState("grok");
  const [cwd, setCwd] = useState(".");
  const [mode, setMode] = useState("ask");
  const [useWorktree, setUseWorktree] = useState(false);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [running, setRunning] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [skillDraft, setSkillDraft] = useState<{ name: string; text: string } | null>(null);
  const [git, setGit] = useState<GitStatus | null>(null);
  const [bindings, setBindings] = useState<KeymapEntry[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
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
  const [termTmux, setTermTmux] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [sandbox, setSandboxState] = useState<Sandbox>("workspace_write");
  const [scripts, setScripts] = useState<ProjectScript[]>([]);
  const [tokens, setTokens] = useState<number>(0);
  const [showFiles, setShowFiles] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [terms, setTerms] = useState<number[]>([1]);
  const [activeTerm, setActiveTerm] = useState(1);
  const nextTermRef = useRef(2);
  const [editorPct, setEditorPct] = useState(58);
  const [dragging, setDragging] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  const getBlocksRef = useRef<(() => DocBlock[]) | null>(null);
  const insertTextRef = useRef<((text: string) => void) | null>(null);
  const insertFileRef = useRef<((path: string) => void) | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const pendingDocRef = useRef<DocBlock[] | null>(null);

  const append = useCallback((item: TranscriptItem) => setTranscript((prev) => [...prev, item]), []);

  const refreshSessions = useCallback(() => {
    listSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    listProviders().then(setProviders).catch(() => {});
    listSkills().then(setSkills).catch(() => {});
    refreshSessions();

    let unlisten: (() => void) | null = null;
    void (async () => {
      unlisten = await onEngineEvent((ev: CoreEvent) => {
        switch (ev.event) {
          case "session_created":
            activeSessionRef.current = ev.session;
            setActiveSession(ev.session);
            refreshSessions();
            if (pendingDocRef.current) {
              void submitPrompt(ev.session, pendingDocRef.current);
              pendingDocRef.current = null;
            }
            break;
          case "agent_text":
            append({ kind: "agent", text: ev.text });
            break;
          case "agent_thought":
            append({ kind: "thought", text: ev.text });
            break;
          case "tool_call":
            append({ kind: "tool", text: `${ev.title || ev.id} — ${ev.status}` });
            break;
          case "plan":
            append({ kind: "plan", text: ev.entries.join("\n") });
            break;
          case "permission_request":
            setPermission({
              session: ev.session,
              requestId: ev.request_id,
              title: ev.title,
              options: ev.options,
            });
            break;
          case "usage":
            setTokens(ev.input_tokens);
            break;
          case "turn_ended":
            append({ kind: "end", text: ev.stop_reason });
            setRunning(false);
            break;
          case "error":
            append({ kind: "error", text: ev.message });
            setRunning(false);
            break;
          default:
            break;
        }
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [append, refreshSessions]);

  const run = useCallback(async () => {
    const getBlocks = getBlocksRef.current;
    if (!getBlocks) return;
    let doc = getBlocks();
    if (doc.length === 0) return;
    if (planMode) doc = [{ type: "skill", skill_id: "plan-first", params: {} }, ...doc];
    setRunning(true);
    append({ kind: "user", text: summarizeDoc(doc) });
    if (activeSessionRef.current) {
      await submitPrompt(activeSessionRef.current, doc);
    } else {
      pendingDocRef.current = doc;
      await newSession(provider, cwd || ".", useWorktree);
    }
  }, [append, provider, cwd, useWorktree, planMode]);

  const createSession = useCallback(async () => {
    pendingDocRef.current = null;
    setTranscript([]);
    await newSession(provider, cwd || ".", useWorktree);
  }, [provider, cwd, useWorktree]);

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

  const selectSession = useCallback(async (id: string) => {
    activeSessionRef.current = id;
    setActiveSession(id);
    const entries = await getTranscript(id);
    setTranscript(entries.map(([role, part]) => partToItem(role, part)));
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

  const removeSkill = useCallback(
    async (id: string) => {
      await deleteSkill(id);
      refreshSkills();
    },
    [refreshSkills],
  );

  const refreshGit = useCallback(() => {
    gitStatus(cwd || ".").then(setGit).catch(() => setGit(null));
  }, [cwd]);

  const openMarket = useCallback(() => {
    marketCatalog().then(setMarket).catch(() => {});
    setShowMarket(true);
  }, []);

  const installMarket = useCallback(
    async (id: string) => {
      await marketInstall(id);
      marketCatalog().then(setMarket).catch(() => {});
      refreshSkills();
    },
    [refreshSkills],
  );

  const uninstallMarket = useCallback(
    async (id: string) => {
      await deleteSkill(id);
      marketCatalog().then(setMarket).catch(() => {});
      refreshSkills();
    },
    [refreshSkills],
  );

  const openSourceControl = useCallback(() => {
    refreshGit();
    gitCheckpoints(cwd || ".").then(setCheckpoints).catch(() => {});
    setShowSourceControl(true);
  }, [cwd, refreshGit]);

  const doCheckpoint = useCallback(async () => {
    await gitCheckpoint(cwd || ".", "manual checkpoint");
    gitCheckpoints(cwd || ".").then(setCheckpoints).catch(() => {});
  }, [cwd]);

  const doCommit = useCallback(
    async (message: string) => {
      await gitCommit(cwd || ".", message);
      refreshGit();
    },
    [cwd, refreshGit],
  );

  const doPush = useCallback(async () => {
    await gitPush(cwd || ".");
  }, [cwd]);

  const doRevert = useCallback(
    async (commit: string) => {
      await gitRevert(cwd || ".", commit);
      refreshGit();
    },
    [cwd, refreshGit],
  );

  const insertIssue = useCallback(async (issue: Issue) => {
    const ctx = await issueContext(issue);
    insertTextRef.current?.(ctx);
    setShowIssues(false);
  }, []);

  const startSplitDrag = useCallback(() => {
    setDragging(true);
    const onMove = (e: MouseEvent) => {
      const el = mainRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setEditorPct(Math.min(85, Math.max(15, pct)));
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

  const doPreview = useCallback(async () => {
    const getBlocks = getBlocksRef.current;
    if (!getBlocks) return;
    setPreview(await compileDoc(getBlocks(), cwd || "."));
  }, [cwd]);

  const annotate = useCallback(
    async (note: string) => {
      const ctx = await browserContext({ url: browserUrl, note, selector: null, selected_text: null });
      insertTextRef.current?.(ctx);
    },
    [browserUrl],
  );

  const onSandboxChange = useCallback((s: Sandbox) => {
    setSandboxState(s);
    if (activeSessionRef.current) void setSandbox(activeSessionRef.current, s);
  }, []);

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
          if (activeSessionRef.current) void cancelTurn(activeSessionRef.current);
          break;
        case "toggle_terminal":
          setShowTerminal((v) => !v);
          break;
        case "toggle_browser":
          setShowBrowser((v) => !v);
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
        case "cycle_permission_mode":
          onModeChange(mode === "ask" ? "accept_edits" : mode === "accept_edits" ? "yolo" : "ask");
          break;
        case "refresh_git":
          refreshGit();
          break;
        default:
          break;
      }
    },
    [run, createSession, mode, onModeChange, refreshGit, openSourceControl],
  );

  const paletteCommands: Command[] = [
    { id: "run", label: "Run prompt", hint: `${MOD}+Enter`, run: () => void run() },
    { id: "new", label: "New session", hint: `${MOD}+N`, run: () => void createSession() },
    { id: "sc", label: "Source control", hint: `${MOD}+Shift+G`, run: openSourceControl },
    { id: "checkpoint", label: "Checkpoint now", run: () => void doCheckpoint() },
    { id: "market", label: "Open skill market", run: openMarket },
    { id: "issues", label: "GitHub issues", run: () => setShowIssues(true) },
    { id: "files", label: "Browse workspace files", run: () => setShowFiles(true) },
    { id: "usage", label: "Usage (5h / week / month)", run: () => setShowUsage(true) },
    { id: "preview", label: "Preview compiled prompt", run: () => void doPreview() },
    { id: "remote", label: "Remote control", run: () => setShowRemote(true) },
    { id: "settings", label: "Open settings", hint: `${MOD}+,`, run: () => setShowSettings(true) },
    { id: "terminal", label: "Toggle terminal", hint: `${MOD}+J`, run: () => setShowTerminal((v) => !v) },
    { id: "browser", label: "Toggle browser", hint: `${MOD}+B`, run: () => setShowBrowser((v) => !v) },
    { id: "git", label: "Refresh git status", hint: `${MOD}+G`, run: refreshGit },
    ...scripts.map((s) => ({
      id: `script-${s.id}`,
      label: `Run script: ${s.name || s.id}`,
      hint: s.command,
      run: () => {
        append({ kind: "tool", text: `running script: ${s.name || s.id}` });
        void runProjectScript(cwd || ".", s.id)
          .then((out) => append({ kind: "agent", text: out.trim() || "(no output)" }))
          .catch((e) => append({ kind: "error", text: String(e) }));
      },
    })),
    ...sessions.map((s) => ({
      id: `sess-${s.id}`,
      label: `Session: ${s.title}`,
      hint: providerLabel(s.provider),
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
        if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return;
        e.preventDefault();
        const combo = comboFromEvent(e);
        void setKeymap(capturing, combo).then(() => getKeymap().then(setBindings));
        setCapturing(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo.startsWith("Mod+")) return;
      const entry = bindings.find(([, key]) => key === combo);
      if (!entry) return;
      e.preventDefault();
      dispatchAction(entry[0]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings, capturing, dispatchAction]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* ---------------- sidebar ---------------- */}
      <aside className="flex w-[264px] min-w-[264px] flex-col border-r bg-sidebar">
        <div className="flex items-center justify-between px-3.5 pb-3 pt-7">
          <span className="text-[15px] font-bold tracking-tight">codeTwo</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="size-7" onClick={() => void createSession()}>
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New session ({MOD}+N)</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="min-h-[60px] flex-1">
          <div className="space-y-0.5 px-2 pb-2">
            {sessions.length === 0 && (
              <p className="px-2 py-4 text-center text-xs leading-relaxed text-muted-foreground">
                No sessions yet.
                <br />
                Press <b>+</b> or just hit Run.
              </p>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => void selectSession(s.id)}
                className={cn(
                  "group cursor-pointer rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent",
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
                  <div
                    className={cn(
                      "truncate text-[13px] font-medium",
                      s.id === activeSession && "text-primary",
                    )}
                  >
                    {s.title}
                  </div>
                )}
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {providerLabel(s.provider)}
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

        <Separator />
        <div className="max-h-52 overflow-y-auto pb-2">
          <SectionTitle
            actions={
              <Button variant="ghost" size="icon" className="size-5" onClick={refreshGit} title={`Refresh (${MOD}+G)`}>
                <RefreshCw className="size-3" />
              </Button>
            }
          >
            Git
          </SectionTitle>
          <div className="px-3 text-xs">
            {git?.is_repo ? (
              <>
                <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
                  <GitBranch className="size-3.5" /> {git.branch || "?"}
                  {git.ahead > 0 && <span className="text-primary">↑{git.ahead}</span>}
                  {git.behind > 0 && <span className="text-primary">↓{git.behind}</span>}
                </div>
                {git.files.length === 0 && <div className="text-muted-foreground">working tree clean</div>}
                {git.files.slice(0, 10).map((f) => (
                  <div key={f.path} className="flex items-center gap-2 py-0.5">
                    <span
                      className={cn(
                        "inline-flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                        f.staged ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
                      )}
                      title={f.state}
                    >
                      {f.state.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">{f.path}</span>
                  </div>
                ))}
                {git.files.length > 10 && (
                  <div className="pt-1 text-[11px] text-muted-foreground">+{git.files.length - 10} more</div>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">not a git repo</span>
            )}
          </div>
        </div>

        <Separator />
        <div className="pb-2">
          <SectionTitle
            actions={
              <>
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
              </>
            }
          >
            Skills
          </SectionTitle>
          <div className="px-3">
            {skills.map((s) => (
              <div key={s.id} className="group flex items-center gap-2 py-0.5 text-[12.5px]">
                <span>{s.icon ?? "✦"}</span>
                <span className="truncate">{s.name}</span>
                <button
                  className="ml-auto opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  title="Delete skill"
                  onClick={() => void removeSkill(s.id)}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Separator />
        <div className="pb-3">
          <SectionTitle>Providers</SectionTitle>
          <div className="px-3">
            {providers.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-0.5 text-[12.5px] text-muted-foreground">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    p.available ? "bg-success ring-3 ring-success/20" : "bg-border",
                  )}
                />
                <span>{p.display_name}</span>
                {p.needs_node && (
                  <Badge variant="secondary" className="ml-auto h-4 px-1 text-[9px] uppercase">
                    node
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ---------------- main ---------------- */}
      <main className="flex min-w-0 flex-1 flex-col" ref={mainRef}>
        <header className="flex items-center gap-1.5 overflow-x-auto border-b bg-card px-3 pb-2 pt-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger size="sm" className="w-[132px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="h-8 w-[110px] shrink-0 font-mono text-xs"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="working dir"
            title="Working directory"
          />

          <Select value={mode} onValueChange={onModeChange}>
            <SelectTrigger size="sm" className="w-[118px] shrink-0" title="Permission mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ask">Ask</SelectItem>
              <SelectItem value="accept_edits">Accept edits</SelectItem>
              <SelectItem value="yolo">YOLO ⚠</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sandbox} onValueChange={(v) => onSandboxChange(v as Sandbox)}>
            <SelectTrigger size="sm" className="w-[124px] shrink-0" title="Sandbox — what the agent may touch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read_only">Read-only</SelectItem>
              <SelectItem value="workspace_write">Workspace</SelectItem>
              <SelectItem value="danger_full_access">Full access ⚠</SelectItem>
            </SelectContent>
          </Select>

          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
            <Checkbox checked={useWorktree} onCheckedChange={(v) => setUseWorktree(v === true)} className="size-3.5" />
            worktree
          </label>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
            <Checkbox checked={planMode} onCheckedChange={(v) => setPlanMode(v === true)} className="size-3.5" />
            plan
          </label>

          <div className="flex-1" />

          {tokens > 0 && (
            <button
              className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
              title="Estimated prompt tokens — click for usage windows"
              onClick={() => setShowUsage(true)}
            >
              <span className="h-1.5 w-14 overflow-hidden rounded-full bg-border">
                <span
                  className={cn("block h-full bg-primary", tokens / 200000 >= 0.8 && "bg-warning")}
                  style={{ width: `${Math.min(100, (tokens / 200000) * 100)}%` }}
                />
              </span>
              {(tokens / 1000).toFixed(1)}k
            </button>
          )}

          <IconAction icon={Globe} label={`Browser (${MOD}+B)`} active={showBrowser} onClick={() => setShowBrowser((v) => !v)} />
          <IconAction icon={TerminalIcon} label={`Terminal (${MOD}+J)`} active={showTerminal} onClick={() => setShowTerminal((v) => !v)} />
          <IconAction icon={GitBranch} label={`Source control (${MOD}+Shift+G)`} onClick={openSourceControl} />
          <VoiceButton onText={(t) => insertTextRef.current?.(t)} />
          <IconAction icon={Eye} label="Preview compiled prompt" onClick={() => void doPreview()} />
          <IconAction icon={Keyboard} label={`Command palette (${MOD}+K)`} onClick={() => setShowPalette(true)} />
          <IconAction icon={SettingsIcon} label={`Settings (${MOD}+,)`} onClick={() => setShowSettings(true)} />

          {running ? (
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() => activeSession && void cancelTurn(activeSession)}
            >
              <Square className="size-3.5" /> Stop
            </Button>
          ) : (
            <Button size="sm" className="shrink-0" onClick={() => void run()}>
              Run <ChevronRight className="size-3.5" />
            </Button>
          )}
        </header>

        <section className="min-h-[90px] overflow-y-auto px-2 pt-5" style={{ flex: `0 0 ${editorPct}%` }}>
          <DocEditor
            skills={skills}
            cwd={cwd || "."}
            getBlocksRef={getBlocksRef}
            insertTextRef={insertTextRef}
            insertFileRef={insertFileRef}
          />
        </section>

        <div className={cn("splitter", dragging && "dragging")} onMouseDown={startSplitDrag} title="Drag to resize" />

        <section className="min-h-20 flex-1 overflow-y-auto bg-muted/40 px-5 py-3">
          {transcript.length === 0 && (
            <p className="py-4 text-center text-xs leading-relaxed text-muted-foreground">
              Compose above, then press <b>Run</b> ({MOD}+Enter).
              <br />
              Type <b>/</b> for skills, <b>@</b> to pull in a file.
            </p>
          )}
          {transcript.map((t, i) => (
            <div key={i} className="flex items-start gap-2 py-1 text-[13px] leading-relaxed">
              {t.kind === "tool" && <Badge variant="secondary" className="mt-0.5 shrink-0 text-[9px] uppercase">tool</Badge>}
              {t.kind === "thought" && <Badge variant="outline" className="mt-0.5 shrink-0 text-[9px] uppercase">thinking</Badge>}
              {t.kind === "plan" && <Badge variant="secondary" className="mt-0.5 shrink-0 text-[9px] uppercase">plan</Badge>}
              {t.kind === "error" && <Badge variant="destructive" className="mt-0.5 shrink-0 text-[9px] uppercase">error</Badge>}
              {t.kind === "end" && (
                <Badge variant="outline" className="shrink-0 text-[9px] uppercase">turn: {t.text}</Badge>
              )}
              {t.kind !== "end" && (
                <span
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    t.kind === "user" && "font-semibold",
                    t.kind === "thought" && "italic text-muted-foreground",
                    t.kind === "error" && "text-destructive",
                  )}
                >
                  {t.text}
                </span>
              )}
            </div>
          ))}
        </section>

        {showBrowser && (
          <section className="flex h-[45%] min-h-60 border-t">
            <BrowserPanel url={browserUrl} onNavigate={setBrowserUrl} onAnnotate={(n) => void annotate(n)} />
          </section>
        )}

        {showTerminal && (
          <section className="flex h-[270px] flex-col border-t bg-terminal p-1.5">
            <div className="flex items-center gap-2 px-1 pb-1.5">
              <div className="flex gap-1">
                {terms.map((t) => (
                  <button
                    key={t}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] transition-colors",
                      t === activeTerm ? "bg-primary text-primary-foreground" : "bg-white/8 text-white/70 hover:bg-white/15",
                    )}
                    onClick={() => {
                      setActiveTerm(t);
                      setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
                    }}
                  >
                    {t}
                    {terms.length > 1 && (
                      <span
                        title="Close terminal"
                        onClick={(e) => {
                          e.stopPropagation();
                          const left = terms.filter((x) => x !== t);
                          setTerms(left);
                          if (activeTerm === t && left[0] !== undefined) setActiveTerm(left[0]);
                        }}
                      >
                        <X className="size-3" />
                      </span>
                    )}
                  </button>
                ))}
                <button
                  className="rounded bg-white/8 px-2 py-0.5 text-[11px] text-white/70 hover:bg-white/15"
                  title="New terminal"
                  onClick={() => {
                    const id = nextTermRef.current++;
                    setTerms((v) => [...v, id]);
                    setActiveTerm(id);
                  }}
                >
                  <Plus className="size-3" />
                </button>
              </div>
              <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11px] text-white/60">
                <Checkbox checked={termTmux} onCheckedChange={(v) => setTermTmux(v === true)} className="size-3.5 border-white/30" />
                tmux
              </label>
            </div>
            {terms.map((t) => (
              <div key={t} className="min-h-0 flex-1" style={{ display: t === activeTerm ? "flex" : "none" }}>
                <TerminalPanel cwd={cwd || null} tmux={termTmux} sessionKey={`${activeSession ?? "main"}-${t}`} />
              </div>
            ))}
          </section>
        )}
      </main>

      {/* ---------------- dialogs ---------------- */}
      {showSettings && (
        <SettingsModal
          bindings={bindings}
          capturing={capturing}
          onCapture={setCapturing}
          onClose={() => {
            setShowSettings(false);
            setCapturing(null);
          }}
        />
      )}
      {showMarket && (
        <MarketModal
          items={market}
          onInstall={(id) => void installMarket(id)}
          onUninstall={(id) => void uninstallMarket(id)}
          onClose={() => setShowMarket(false)}
        />
      )}
      {showSourceControl && (
        <SourceControlModal
          cwd={cwd || "."}
          status={git}
          checkpoints={checkpoints}
          onCommit={doCommit}
          onPush={doPush}
          onCheckpoint={doCheckpoint}
          onRevert={doRevert}
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
                <CircleDot className="size-4 text-warning" /> Permission requested
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
