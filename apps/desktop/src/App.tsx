import { useCallback, useEffect, useRef, useState } from "react";
import { DocEditor } from "./editor/Editor";
import { TerminalPanel } from "./terminal/Terminal";
import {
  answerPermission,
  archiveSession,
  browserContext,
  cancelTurn,
  compileDoc,
  deleteSkill,
  getKeymap,
  issueContext,
  renameSession,
  getTranscript,
  gitCheckpoint,
  gitCheckpoints,
  gitCommit,
  gitPush,
  gitRevert,
  gitStatus,
  listProviders,
  listSessions,
  describeBlock,
  listProjectScripts,
  listSkills,
  marketCatalog,
  marketInstall,
  runProjectScript,
  setSandbox,
  newSession,
  onEngineEvent,
  providerLabel,
  remoteStatus,
  saveSkill,
  setKeymap,
  setPermissionMode,
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
            setPermission({ session: ev.session, requestId: ev.request_id, title: ev.title, options: ev.options });
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
    // Plan mode: ask the agent to propose a plan and wait for approval before editing.
    if (planMode) {
      doc = [{ type: "skill", skill_id: "plan-first", params: {} }, ...doc];
    }
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

  const onModeChange = useCallback(
    (m: string) => {
      setMode(m);
      if (activeSessionRef.current) void setPermissionMode(activeSessionRef.current, m);
    },
    [],
  );

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

  const doPreview = useCallback(async () => {
    const getBlocks = getBlocksRef.current;
    if (!getBlocks) return;
    setPreview(await compileDoc(getBlocks(), cwd || "."));
  }, [cwd]);

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

  // Commands available in the palette (Mod+K): actions + switch-to-session.
  const paletteCommands: Command[] = [
    { id: "run", label: "Run prompt", hint: "Mod+Enter", run: () => void run() },
    { id: "new", label: "New session", hint: "Mod+N", run: () => void createSession() },
    { id: "sc", label: "Source control", hint: "Mod+Shift+G", run: openSourceControl },
    { id: "checkpoint", label: "Checkpoint now", run: () => void doCheckpoint() },
    { id: "market", label: "Open skill market", run: openMarket },
    { id: "issues", label: "GitHub issues", run: () => setShowIssues(true) },
    { id: "files", label: "Browse workspace files", run: () => setShowFiles(true) },
    { id: "usage", label: "Usage (5h / week / month)", run: () => setShowUsage(true) },
    { id: "preview", label: "Preview compiled prompt", run: () => void doPreview() },
    { id: "remote", label: "Remote control", run: () => setShowRemote(true) },
    { id: "settings", label: "Open settings", hint: "Mod+,", run: () => setShowSettings(true) },
    { id: "terminal", label: "Toggle terminal", hint: "Mod+J", run: () => setShowTerminal((v) => !v) },
    { id: "browser", label: "Toggle browser", hint: "Mod+B", run: () => setShowBrowser((v) => !v) },
    { id: "git", label: "Refresh git status", hint: "Mod+G", run: refreshGit },
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

  // Load keybindings + remote status once.
  useEffect(() => {
    getKeymap().then(setBindings).catch(() => {});
    remoteStatus().then(setRemoteInfo).catch(() => {});
  }, []);

  // Refresh git status when the working dir or active session changes.
  useEffect(() => {
    refreshGit();
  }, [refreshGit, activeSession]);

  // Project scripts declared in .codetwo.json for this working dir.
  useEffect(() => {
    listProjectScripts(cwd || ".").then(setScripts).catch(() => setScripts([]));
  }, [cwd]);

  const onSandboxChange = useCallback(
    (s: Sandbox) => {
      setSandboxState(s);
      if (activeSessionRef.current) void setSandbox(activeSessionRef.current, s);
    },
    [],
  );

  // Global keyboard shortcuts (and shortcut capture when rebinding in settings).
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
      if (!combo.startsWith("Mod+")) return; // only chorded shortcuts trigger actions
      const entry = bindings.find(([, key]) => key === combo);
      if (!entry) return;
      e.preventDefault();
      dispatchAction(entry[0]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings, capturing, dispatchAction]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">codeTwo</span>
          <button className="new-session" title="New session" onClick={() => void createSession()}>
            +
          </button>
        </div>
        <ul className="session-list">
          {sessions.length === 0 && <li className="session-empty">No sessions yet</li>}
          {sessions.map((s) => (
            <li
              key={s.id}
              className={`session-item ${s.id === activeSession ? "active" : ""}`}
              onClick={() => void selectSession(s.id)}
            >
              {renaming?.id === s.id ? (
                <input
                  className="session-rename"
                  autoFocus
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
                <span className="session-title">{s.title}</span>
              )}
              <span className="session-meta">
                {providerLabel(s.provider)}
                {s.worktree_path ? " · wt" : ""}
                <span className="session-actions">
                  <button
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenaming({ id: s.id, title: s.title });
                    }}
                  >
                    ✎
                  </button>
                  <button
                    title="Archive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void archiveSession(s.id, true).then(refreshSessions);
                    }}
                  >
                    ⌫
                  </button>
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="git-panel">
          <div className="providers-title">
            Git
            <button className="mini" title="Refresh (Mod+G)" onClick={refreshGit}>
              ⟳
            </button>
          </div>
          {git && git.is_repo ? (
            <>
              <div className="git-branch">
                ⎇ {git.branch || "?"}
                {git.ahead > 0 && <span className="git-ab">↑{git.ahead}</span>}
                {git.behind > 0 && <span className="git-ab">↓{git.behind}</span>}
              </div>
              {git.files.length === 0 && <div className="git-clean">working tree clean</div>}
              {git.files.slice(0, 12).map((f) => (
                <div key={f.path} className="git-file">
                  <span className={`git-badge ${f.staged ? "staged" : ""}`} title={f.state}>
                    {f.state.charAt(0).toUpperCase()}
                  </span>
                  <span className="git-path">{f.path}</span>
                </div>
              ))}
              {git.files.length > 12 && <div className="git-more">+{git.files.length - 12} more</div>}
            </>
          ) : (
            <div className="git-none">not a git repo</div>
          )}
        </div>

        <div className="providers">
          <div className="providers-title">
            Skills
            <span className="title-actions">
              <button className="mini" title="Skill market" onClick={openMarket}>
                🛒
              </button>
              <button className="mini" title="New skill" onClick={() => setSkillDraft({ name: "", text: "" })}>
                ＋
              </button>
            </span>
          </div>
          {skills.map((s) => (
            <div key={s.id} className="provider-row">
              <span>
                {s.icon ?? "✦"} {s.name}
              </span>
              <button className="mini-x" title="Delete skill" onClick={() => void removeSkill(s.id)}>
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="providers">
          <div className="providers-title">Providers</div>
          {providers.map((p) => (
            <div key={p.id} className="provider-row">
              <span className={`dot ${p.available ? "ok" : "off"}`} />
              <span>{p.display_name}</span>
              {p.needs_node && <span className="tag">node</span>}
            </div>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="toolbar">
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
          <input
            className="cwd"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="working dir"
            title="Working directory"
          />
          <select value={mode} onChange={(e) => onModeChange(e.target.value)} title="Permission mode">
            <option value="ask">Ask</option>
            <option value="accept_edits">Accept edits</option>
            <option value="yolo">YOLO ⚠</option>
          </select>
          <select
            value={sandbox}
            onChange={(e) => onSandboxChange(e.target.value as Sandbox)}
            title="Sandbox — what the agent may touch at all"
          >
            <option value="read_only">Read-only</option>
            <option value="workspace_write">Workspace write</option>
            <option value="danger_full_access">Full access ⚠</option>
          </select>
          <label className="wt-toggle" title="Isolate this session in a git worktree">
            <input type="checkbox" checked={useWorktree} onChange={(e) => setUseWorktree(e.target.checked)} /> worktree
          </label>
          <label className="wt-toggle" title="Ask the agent to propose a plan before editing">
            <input type="checkbox" checked={planMode} onChange={(e) => setPlanMode(e.target.checked)} /> plan
          </label>
          <div className="spacer" />
          {tokens > 0 && (
            <span
              className="ctx-meter"
              title="Estimated prompt tokens vs the context window — click for usage windows"
              onClick={() => setShowUsage(true)}
            >
              <span className="ctx-bar">
                <span
                  className={`ctx-fill ${tokens / 200000 >= 0.8 ? "tight" : ""}`}
                  style={{ width: `${Math.min(100, (tokens / 200000) * 100)}%` }}
                />
              </span>
              {(tokens / 1000).toFixed(1)}k
            </span>
          )}
          <button className="ghost" onClick={() => setShowBrowser((v) => !v)} title="Toggle browser (Mod+B)">
            {showBrowser ? "Hide browser" : "Browser"}
          </button>
          <button className="ghost" onClick={() => setShowTerminal((v) => !v)} title="Toggle terminal (Mod+J)">
            {showTerminal ? "Hide terminal" : "Terminal"}
          </button>
          <button className="ghost" onClick={openSourceControl} title="Source control (Mod+Shift+G)">
            Source
          </button>
          <VoiceButton onText={(t) => insertTextRef.current?.(t)} />
          <button className="ghost" onClick={() => void doPreview()} title="Preview compiled prompt">
            Preview
          </button>
          <button className="ghost" onClick={() => setShowPalette(true)} title="Command palette (Mod+K)">
            ⌘K
          </button>
          <button className="ghost" onClick={() => setShowSettings(true)} title="Settings (Mod+,)">
            ⚙
          </button>
          {running ? (
            <button className="run cancel" onClick={() => activeSession && void cancelTurn(activeSession)}>
              Stop ■
            </button>
          ) : (
            <button className="run" onClick={() => void run()}>
              Run ▸
            </button>
          )}
        </header>

        <section className="editor-pane">
          <DocEditor
            skills={skills}
            cwd={cwd || "."}
            getBlocksRef={getBlocksRef}
            insertTextRef={insertTextRef}
            insertFileRef={insertFileRef}
          />
        </section>

        <section className="transcript">
          {transcript.length === 0 && <div className="transcript-empty">Run a prompt to see the agent’s work here.</div>}
          {transcript.map((t, i) => (
            <div key={i} className={`t-item t-${t.kind}`}>
              {t.kind === "tool" && <span className="t-badge">tool</span>}
              {t.kind === "thought" && <span className="t-badge">thinking</span>}
              {t.kind === "plan" && <span className="t-badge">plan</span>}
              {t.kind === "error" && <span className="t-badge err">error</span>}
              {t.kind === "end" && <span className="t-badge">turn: {t.text}</span>}
              {t.kind !== "end" && <span className="t-text">{t.text}</span>}
            </div>
          ))}
        </section>

        {showBrowser && (
          <section className="browser-pane">
            <BrowserPanel url={browserUrl} onNavigate={setBrowserUrl} onAnnotate={(n) => void annotate(n)} />
          </section>
        )}

        {showTerminal && (
          <section className="terminal-pane">
            <div className="terminal-head">
              <div className="term-tabs">
                {terms.map((t) => (
                  <button
                    key={t}
                    className={`term-tab ${t === activeTerm ? "active" : ""}`}
                    onClick={() => {
                      setActiveTerm(t);
                      // Let the newly-visible xterm refit itself.
                      setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
                    }}
                  >
                    {t}
                    {terms.length > 1 && (
                      <span
                        className="term-close"
                        title="Close terminal"
                        onClick={(e) => {
                          e.stopPropagation();
                          const left = terms.filter((x) => x !== t);
                          setTerms(left);
                          if (activeTerm === t && left[0] !== undefined) setActiveTerm(left[0]);
                        }}
                      >
                        ×
                      </span>
                    )}
                  </button>
                ))}
                <button
                  className="term-tab add"
                  title="New terminal"
                  onClick={() => {
                    const id = nextTermRef.current++;
                    setTerms((v) => [...v, id]);
                    setActiveTerm(id);
                  }}
                >
                  ＋
                </button>
              </div>
              <label className="wt-toggle" title="Run terminals in persistent tmux sessions (attachable from a real terminal)">
                <input type="checkbox" checked={termTmux} onChange={(e) => setTermTmux(e.target.checked)} /> tmux
              </label>
            </div>
            {/* All terminals stay mounted so switching tabs doesn't kill the shell. */}
            {terms.map((t) => (
              <div key={t} className="term-slot" style={{ display: t === activeTerm ? "flex" : "none" }}>
                <TerminalPanel
                  cwd={cwd || null}
                  tmux={termTmux}
                  sessionKey={`${activeSession ?? "main"}-${t}`}
                />
              </div>
            ))}
          </section>
        )}
      </main>

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

      {showRemote && (
        <RemoteModal info={remoteInfo} onStarted={setRemoteInfo} onClose={() => setShowRemote(false)} />
      )}

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
        <div className="modal-backdrop">
          <div className="modal">
            <h3>New skill</h3>
            <input
              className="skill-name"
              placeholder="Skill name"
              value={skillDraft.name}
              onChange={(e) => setSkillDraft({ ...skillDraft, name: e.target.value })}
            />
            <textarea
              className="skill-text"
              placeholder="Prompt fragment inserted when this skill is picked"
              value={skillDraft.text}
              onChange={(e) => setSkillDraft({ ...skillDraft, text: e.target.value })}
            />
            <div className="modal-actions">
              <button className="modal-opt" onClick={() => void saveDraft()}>
                Save
              </button>
              <button className="modal-opt cancel" onClick={() => setSkillDraft(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {permission && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Permission requested</h3>
            <p className="modal-title">{permission.title}</p>
            <div className="modal-actions">
              {permission.options.map(([id, label]) => (
                <button key={id} className="modal-opt" onClick={() => void answer(id)}>
                  {label}
                </button>
              ))}
              <button className="modal-opt cancel" onClick={() => void answer(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
