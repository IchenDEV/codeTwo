import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, Minus, Plus, RefreshCw, Sparkles } from "@/components/ui/icons";
import {
  gitCreatePr,
  gitDiff,
  gitDiffSince,
  gitSourceControlInfo,
  gitStagePaths,
  gitSuggestCommit,
  gitUnstagePaths,
  openExternal,
  type Checkpoint,
  type GitDiffResult,
  type GitDiffScope,
  type GitFile,
  type GitStatus,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { SplitButton } from "@/components/ui/split-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  changeRequestPresentation,
  diffPreviewLines,
  gitFileDisplayState,
  gitFilePathspecs,
  gitFileSections,
  gitPhaseLabel,
  sourceControlStateForCwd,
  uniquePathspecs,
  type GitPhase,
  type SourceControlLoadState,
} from "./state";

type DiffSelection =
  | { kind: "working"; scope: GitDiffScope; path: string | null; label: string }
  | { kind: "checkpoint"; commit: string; label: string };

interface DiffState {
  loading: boolean;
  result: GitDiffResult | null;
  error: string | null;
}

const EMPTY_DIFF_STATE: DiffState = { loading: false, result: null, error: null };

const DEFAULT_DIFF_SELECTION: DiffSelection = {
  kind: "working",
  scope: "all",
  path: null,
  label: "All changes",
};

function DiffView({ state }: { state: DiffState }) {
  const preview = useMemo(
    () => diffPreviewLines(state.result?.text ?? ""),
    [state.result?.text],
  );

  if (state.loading) {
    return <p role="status" className="p-surface-inset text-ui text-muted-foreground">Loading diff…</p>;
  }
  if (state.error) {
    return <p role="alert" className="p-surface-inset text-ui text-destructive">Diff failed: {state.error}</p>;
  }
  if (!state.result?.text.trim()) {
    return <p className="p-surface-inset text-ui text-muted-foreground">No changes in this scope.</p>;
  }

  return (
    <div>
      {(state.result.truncated || preview.truncated) && (
        <div className="sticky top-0 z-10">
          <p role="status" className="bg-warning/10 px-surface-inset py-2 text-hint text-warning-foreground">
            {state.result.truncated
              ? `Preview truncated by the ${(state.result.truncation_reason ?? "resource").replaceAll("_", " ")} limit.`
              : "Preview rendering is limited to 4,000 lines."}
          </p>
          <Separator />
        </div>
      )}
      <pre className="diff">
        {preview.lines.map((line, index) => {
          let cls = "";
          if (line.startsWith("+") && !line.startsWith("+++")) cls = "add";
          else if (line.startsWith("-") && !line.startsWith("---")) cls = "del";
          else if (line.startsWith("@@")) cls = "hunk";
          else if (line.startsWith("diff ") || line.startsWith("index ")) cls = "meta";
          return (
            <div key={index} className={cn("diff-line", cls)}>
              {line || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function GitFileRow({
  file,
  scope,
  selected,
  disabled,
  onSelect,
  onToggleIndex,
}: {
  file: GitFile;
  scope: "staged" | "unstaged";
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onToggleIndex: () => void;
}) {
  const staged = scope === "staged";
  const displayState = gitFileDisplayState(file, scope);
  const indexAction = staged ? `Unstage ${file.path}` : `Stage ${file.path}`;
  return (
    <div className="group flex min-w-0 items-center gap-1 rounded-control hover:bg-accent/50 focus-within:bg-accent/50">
      <button
        type="button"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none hover:text-primary focus-visible:focus-ring"
        aria-label={indexAction}
        title={indexAction}
        disabled={disabled}
        onClick={onToggleIndex}
      >
        {staged ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
      </button>
      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-control px-1 py-1 text-start text-hint outline-none focus-visible:focus-ring",
          selected && "bg-accent text-foreground",
        )}
        aria-pressed={selected}
        title={file.original_path ? `${file.original_path} → ${file.path}` : file.path}
        onClick={onSelect}
      >
        <span
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-control text-cap font-bold",
            staged ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
          )}
          aria-hidden="true"
        >
          {displayState.charAt(0).toUpperCase()}
        </span>
        <span className="sr-only">{staged ? "Staged" : "Unstaged"} {displayState}: </span>
        <span className="truncate font-mono text-muted-foreground">{file.path}</span>
      </button>
    </div>
  );
}

// Source Control: explicit index ownership, bounded diff viewer, commit/push/PR, and checkpoints.
export function SourceControlModal({
  cwd,
  status,
  statusLoading,
  checkpoints,
  checkpointsLoading,
  onCommit,
  onPush,
  onCheckpoint,
  onRevert,
  onRefresh,
  onClose,
}: {
  cwd: string;
  status: GitStatus | null;
  statusLoading: boolean;
  checkpoints: Checkpoint[];
  checkpointsLoading: boolean;
  onCommit: (message: string) => Promise<void>;
  onPush: () => Promise<void>;
  onCheckpoint: () => Promise<void>;
  onRevert: (commit: string) => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState<DiffSelection>(DEFAULT_DIFF_SELECTION);
  const [diffState, setDiffState] = useState<DiffState>(EMPTY_DIFF_STATE);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [phase, setPhase] = useState<GitPhase>("idle");
  const [suggesting, setSuggesting] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [sourceControlState, setSourceControlState] = useState<SourceControlLoadState>(() => ({
    cwd,
    loading: true,
    info: null,
    error: null,
  }));
  const diffRequestRef = useRef(0);
  const suggestionRequestRef = useRef(0);
  const sourceControlRequestRef = useRef(0);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const sections = useMemo(() => gitFileSections(status?.files ?? []), [status?.files]);
  const stagedPathspecs = useMemo(() => uniquePathspecs(sections.staged), [sections.staged]);
  const unstagedPathspecs = useMemo(() => uniquePathspecs(sections.unstaged), [sections.unstaged]);
  const busy = phase !== "idle" || suggesting;
  const repositoryReady = !statusLoading && status?.is_repo === true;
  const repositoryBusy = busy || !repositoryReady;
  const checkpointBusy = repositoryBusy || checkpointsLoading;
  const currentSourceControl = sourceControlStateForCwd(sourceControlState, cwd);
  const changeRequest = changeRequestPresentation(
    currentSourceControl.info,
    currentSourceControl.loading,
    currentSourceControl.error,
    statusLoading ? null : repositoryReady,
  );

  useEffect(() => {
    suggestionRequestRef.current += 1;
    setSuggesting(false);
    diffRequestRef.current += 1;
    setSelection(DEFAULT_DIFF_SELECTION);
    setDiffState(EMPTY_DIFF_STATE);
    setMessage("");
    setMessageError(null);
    setActionError(null);
    setActionStatus(null);
    setPrUrl(null);
  }, [cwd]);

  const loadSourceControl = useCallback(async () => {
    const targetCwd = cwd;
    const request = ++sourceControlRequestRef.current;
    setSourceControlState({ cwd: targetCwd, loading: true, info: null, error: null });
    try {
      const info = await gitSourceControlInfo(targetCwd);
      if (request === sourceControlRequestRef.current) {
        setSourceControlState({ cwd: targetCwd, loading: false, info, error: null });
      }
    } catch (error) {
      if (request === sourceControlRequestRef.current) {
        setSourceControlState({
          cwd: targetCwd,
          loading: false,
          info: null,
          error: String(error),
        });
      }
    }
  }, [cwd]);

  useEffect(() => {
    void loadSourceControl();
    return () => {
      sourceControlRequestRef.current += 1;
    };
  }, [loadSourceControl]);

  const loadDiff = useCallback(
    async (next: DiffSelection) => {
      if (next.kind === "working" && !repositoryReady) {
        diffRequestRef.current += 1;
        setDiffState(EMPTY_DIFF_STATE);
        return;
      }
      const request = ++diffRequestRef.current;
      setDiffState((current) => ({ ...current, loading: true, error: null }));
      try {
        const result =
          next.kind === "working"
            ? await gitDiff(cwd, next.path, next.scope)
            : await gitDiffSince(cwd, next.commit);
        if (request === diffRequestRef.current) {
          setDiffState({ loading: false, result, error: null });
        }
      } catch (error) {
        if (request === diffRequestRef.current) {
          setDiffState({ loading: false, result: null, error: String(error) });
        }
      }
    },
    [cwd, repositoryReady],
  );

  useEffect(() => {
    void loadDiff(selection);
  }, [loadDiff, selection, status]);

  const selectDiff = (next: DiffSelection) => {
    setSelection(next);
  };

  const mutateIndex = async (nextPhase: "staging" | "unstaging", paths: string[]) => {
    if (paths.length === 0 || repositoryBusy) return;
    setPhase(nextPhase);
    setActionError(null);
    setActionStatus(null);
    try {
      if (nextPhase === "staging") await gitStagePaths(cwd, paths);
      else await gitUnstagePaths(cwd, paths);
      setActionStatus(nextPhase === "staging" ? "Staged." : "Unstaged.");
      onRefresh();
    } catch (error) {
      setActionError(`${nextPhase === "staging" ? "Stage" : "Unstage"} failed: ${error}`);
    } finally {
      setPhase("idle");
    }
  };

  const commit = async () => {
    if (repositoryBusy) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setMessageError("Enter a commit message.");
      return;
    }
    if (sections.staged.length === 0) {
      setMessageError("Stage at least one file before committing.");
      return;
    }
    setMessageError(null);
    suggestionRequestRef.current += 1;
    setSuggesting(false);
    setActionError(null);
    setActionStatus(null);
    setPhase("committing");
    try {
      await onCommit(trimmed);
      setMessage("");
      setActionStatus("Committed staged changes.");
    } catch (error) {
      // The message and index stay untouched so the user can fix the problem and retry.
      setActionError(`Commit failed: ${error}`);
    } finally {
      setPhase("idle");
    }
  };


  const createPr = async () => {
    if (!changeRequest.canCreate || repositoryBusy) return;
    const targetCwd = cwd;
    setActionError(null);
    setActionStatus(null);
    setPrUrl(null);
    setPhase("creating_pr");
    try {
      const url = await gitCreatePr(targetCwd, message.trim() || "Update", "");
      if (cwdRef.current !== targetCwd) return;
      setPrUrl(url);
      setActionStatus(changeRequest.createdLabel);
      onRefresh();
    } catch (error) {
      if (cwdRef.current === targetCwd) {
        setActionError(`${changeRequest.createLabel} failed: ${error}`);
      }
    } finally {
      setPhase("idle");
    }
  };

  const commitAndPush = async () => {
    if (repositoryBusy) return;
    const trimmed = message.trim();
    if (!trimmed) { setMessageError("Enter a commit message."); return; }
    if (sections.staged.length === 0) { setMessageError("Stage at least one file before committing."); return; }
    setMessageError(null);
    suggestionRequestRef.current += 1;
    setSuggesting(false);
    setActionError(null);
    setActionStatus(null);
    setPhase("committing");
    try {
      await onCommit(trimmed);
      setMessage("");
    } catch (error) {
      setActionError(`Commit failed: ${error}`);
      setPhase("idle");
      return;
    }
    setPhase("pushing");
    try {
      await onPush();
      setActionStatus("Committed & pushed.");
    } catch (error) {
      setActionError(`Push failed: ${error}`);
    } finally {
      setPhase("idle");
    }
  };

  const commitAndCreatePr = async () => {
    if (repositoryBusy || !changeRequest.canCreate) return;
    const trimmed = message.trim();
    if (!trimmed) { setMessageError("Enter a commit message."); return; }
    if (sections.staged.length === 0) { setMessageError("Stage at least one file before committing."); return; }
    const targetCwd = cwd;
    setMessageError(null);
    suggestionRequestRef.current += 1;
    setSuggesting(false);
    setActionError(null);
    setActionStatus(null);
    setPrUrl(null);
    setPhase("committing");
    try {
      await onCommit(trimmed);
      setMessage("");
    } catch (error) {
      setActionError(`Commit failed: ${error}`);
      setPhase("idle");
      return;
    }
    setPhase("creating_pr");
    try {
      const url = await gitCreatePr(targetCwd, trimmed || "Update", "");
      if (cwdRef.current !== targetCwd) return;
      setPrUrl(url);
      setActionStatus(`Committed & ${changeRequest.createdLabel.toLowerCase()}.`);
      onRefresh();
    } catch (error) {
      if (cwdRef.current === targetCwd) {
        setActionError(`${changeRequest.createLabel} failed: ${error}`);
      }
    } finally {
      setPhase("idle");
    }
  };

  const openCreatedChangeRequest = async () => {
    if (!prUrl) return;
    setActionError(null);
    try {
      await openExternal(prUrl);
    } catch (error) {
      setActionError(`Open ${changeRequest.label} failed: ${error}`);
    }
  };

  const openRepository = async () => {
    const url = currentSourceControl.info?.web_url;
    if (!url) return;
    setActionError(null);
    try {
      await openExternal(url);
    } catch (error) {
      setActionError(`Open repository failed: ${error}`);
    }
  };

  const suggestMessage = async () => {
    if (repositoryBusy) return;
    const request = ++suggestionRequestRef.current;
    setSuggesting(true);
    setActionError(null);
    try {
      const suggestion = await gitSuggestCommit(cwd);
      if (request !== suggestionRequestRef.current) return;
      setMessage(suggestion);
      setMessageError(null);
    } catch (error) {
      if (request === suggestionRequestRef.current) {
        setActionError(`Suggestion failed: ${error}`);
      }
    } finally {
      if (request === suggestionRequestRef.current) setSuggesting(false);
    }
  };

  const createCheckpoint = async () => {
    if (checkpointBusy) return;
    setPhase("checkpointing");
    setActionError(null);
    try {
      await onCheckpoint();
    } catch (error) {
      setActionError(`Checkpoint failed: ${error}`);
    } finally {
      setPhase("idle");
    }
  };

  const revertCheckpoint = async (checkpoint: Checkpoint) => {
    if (checkpointBusy) return;
    const label = checkpoint.message || checkpoint.id.slice(0, 8);
    if (!window.confirm(`Revert tracked files to checkpoint “${label}”? Uncommitted tracked changes will be overwritten.`)) {
      return;
    }
    setPhase("reverting");
    setActionError(null);
    setActionStatus(null);
    try {
      await onRevert(checkpoint.commit);
      setActionStatus(`Reverted tracked files to ${label}.`);
    } catch (error) {
      setActionError(`Revert failed: ${error}`);
    } finally {
      setPhase("idle");
    }
  };

  const selected = (scope: GitDiffScope, path: string | null) =>
    selection.kind === "working" && selection.scope === scope && selection.path === path;

  const refreshSourceControl = () => {
    onRefresh();
    void loadSourceControl();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-4xl"
        aria-busy={busy || statusLoading || checkpointsLoading || currentSourceControl.loading}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            Source Control
            {status?.is_repo && (
              <span className="flex items-center gap-1 text-hint font-semibold text-primary">
                <GitBranch className="size-3.5" aria-hidden="true" />
                {status.branch}
                {status.ahead > 0 && ` ↑${status.ahead}`}
                {status.behind > 0 && ` ↓${status.behind}`}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={refreshSourceControl}
              disabled={busy || currentSourceControl.loading}
              title="Refresh source control"
              aria-label="Refresh source control"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <section className="space-y-1 text-hint" aria-label="Hosted source control">
          {currentSourceControl.info && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{currentSourceControl.info.provider_name}</dd>
              <dt className="text-muted-foreground">Remote</dt>
              <dd className="truncate font-mono" title={currentSourceControl.info.remote_name}>
                {currentSourceControl.info.remote_name}
              </dd>
              <dt className="text-muted-foreground">Host</dt>
              <dd className="truncate font-mono" title={currentSourceControl.info.host}>
                {currentSourceControl.info.host}
              </dd>
              {currentSourceControl.info.web_url && (
                <>
                  <dt className="text-muted-foreground">Repository</dt>
                  <dd className="min-w-0">
                    <button
                      type="button"
                      className="block max-w-full truncate rounded-control text-start text-primary underline underline-offset-2 outline-none focus-visible:focus-ring"
                      title={currentSourceControl.info.web_url}
                      onClick={() => void openRepository()}
                    >
                      {currentSourceControl.info.web_url}
                    </button>
                  </dd>
                </>
              )}
            </dl>
          )}
          <p
            id="source-control-change-request-status"
            role={changeRequest.statusKind === "error" ? "alert" : "status"}
            aria-live={changeRequest.statusKind === "error" ? "assertive" : "polite"}
            className={cn(
              "text-muted-foreground",
              changeRequest.statusKind === "error" && "text-destructive",
            )}
          >
            {changeRequest.status}
          </p>
        </section>

        <div className="flex h-[58vh] min-h-0 flex-col gap-3 sm:h-[52vh] sm:flex-row">
          <div className="max-h-48 w-full shrink-0 overflow-y-auto pe-2.5 sm:max-h-none sm:w-64">
            <p className="pb-1 pt-2 text-cap font-semibold uppercase tracking-wider text-muted-foreground">
              Review
            </p>
            <button
              type="button"
              className={cn(
                "w-full rounded-control px-1.5 py-1 text-start text-hint outline-none hover:bg-accent/50 focus-visible:focus-ring",
                selected("all", null) && "bg-accent text-foreground",
              )}
              aria-pressed={selected("all", null)}
              disabled={repositoryBusy}
              onClick={() => selectDiff({ kind: "working", scope: "all", path: null, label: "All changes" })}
            >
              All changes
            </button>

            <div className="flex items-center justify-between pb-1 pt-3">
              <span className="text-cap font-semibold uppercase tracking-wider text-muted-foreground">
                Staged changes ({sections.staged.length})
              </span>
              {sections.staged.length > 0 && stagedPathspecs.length <= 256 && (
                <button
                  type="button"
                  className="min-h-control-mini rounded-control px-1.5 text-cap text-muted-foreground outline-none hover:text-primary focus-visible:focus-ring"
                  disabled={repositoryBusy}
                  onClick={() => void mutateIndex("unstaging", stagedPathspecs)}
                >
                  Unstage all
                </button>
              )}
            </div>
            {sections.staged.map((file) => (
              <GitFileRow
                key={`staged:${file.path}`}
                file={file}
                scope="staged"
                selected={selected("staged", file.path)}
                disabled={repositoryBusy}
                onSelect={() =>
                  selectDiff({ kind: "working", scope: "staged", path: file.path, label: file.path })
                }
                onToggleIndex={() => void mutateIndex("unstaging", gitFilePathspecs(file))}
              />
            ))}
            {sections.staged.length === 0 && (
              <p className="px-1.5 text-hint text-muted-foreground" role={statusLoading ? "status" : undefined}>
                {statusLoading
                  ? "Loading this workspace’s Git status…"
                  : status?.is_repo
                    ? "Nothing staged"
                    : status
                      ? "This workspace is not a Git repository."
                      : "Git status is unavailable for this workspace."}
              </p>
            )}
            {stagedPathspecs.length > 256 && (
              <p className="px-1.5 text-cap text-muted-foreground">
                Unstage files individually; one operation is limited to 256 literal paths.
              </p>
            )}

            <div className="flex items-center justify-between pb-1 pt-3">
              <span className="text-cap font-semibold uppercase tracking-wider text-muted-foreground">
                Changes ({sections.unstaged.length})
              </span>
              {sections.unstaged.length > 0 && unstagedPathspecs.length <= 256 && (
                <button
                  type="button"
                  className="min-h-control-mini rounded-control px-1.5 text-cap text-muted-foreground outline-none hover:text-primary focus-visible:focus-ring"
                  disabled={repositoryBusy}
                  onClick={() => void mutateIndex("staging", unstagedPathspecs)}
                >
                  Stage all
                </button>
              )}
            </div>
            {sections.unstaged.map((file) => (
              <GitFileRow
                key={`unstaged:${file.path}`}
                file={file}
                scope="unstaged"
                selected={selected("unstaged", file.path)}
                disabled={repositoryBusy}
                onSelect={() =>
                  selectDiff({ kind: "working", scope: "unstaged", path: file.path, label: file.path })
                }
                onToggleIndex={() => void mutateIndex("staging", gitFilePathspecs(file))}
              />
            ))}
            {repositoryReady && sections.unstaged.length === 0 && (
              <p className="px-1.5 text-hint text-muted-foreground">Working tree clean</p>
            )}
            {unstagedPathspecs.length > 256 && (
              <p className="px-1.5 text-cap text-muted-foreground">
                Stage files individually; one operation is limited to 256 literal paths.
              </p>
            )}

            <div className="flex items-center justify-between pb-1 pt-4">
              <span className="text-cap font-semibold uppercase tracking-wider text-muted-foreground">
                Checkpoints
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={checkpointBusy}
                onClick={() => void createCheckpoint()}
                title="Create checkpoint"
                aria-label="Create checkpoint"
              >
                <Plus className="size-3" aria-hidden="true" />
              </Button>
            </div>
            {checkpointsLoading ? (
              <p className="px-1.5 text-hint text-muted-foreground" role="status">
                Loading this workspace’s checkpoints…
              </p>
            ) : checkpoints.length === 0 ? (
              <p className="px-1.5 text-hint text-muted-foreground">None yet</p>
            ) : null}
            {checkpoints.map((checkpoint) => (
              <div key={checkpoint.id} className="flex items-center gap-1 py-0.5 text-hint">
                <span className="flex-1 truncate text-muted-foreground" title={checkpoint.message}>
                  {checkpoint.message || checkpoint.id.slice(0, 8)}
                </span>
                <button
                  type="button"
                  className="min-h-control-mini rounded-control bg-fill-rest px-2 text-cap outline-none hover:text-primary focus-visible:focus-ring"
                  disabled={checkpointBusy}
                  onClick={() =>
                    selectDiff({
                      kind: "checkpoint",
                      commit: checkpoint.commit,
                      label: checkpoint.message || checkpoint.id.slice(0, 8),
                    })
                  }
                >
                  Diff
                </button>
                <button
                  type="button"
                  className="min-h-control-mini rounded-control bg-fill-rest px-2 text-cap outline-none hover:text-primary focus-visible:focus-ring"
                  disabled={checkpointBusy}
                  onClick={() => void revertCheckpoint(checkpoint)}
                >
                  Revert
                </button>
              </div>
            ))}
          </div>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={`Diff: ${selection.label}`}>
            <p className="pb-1 text-cap font-semibold uppercase tracking-wider text-muted-foreground">
              {selection.label}
            </p>
            <ScrollArea className="min-h-0 flex-1 rounded-module bg-muted/40">
              <DiffView state={diffState} />
            </ScrollArea>
          </section>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="source-control-commit-message" className="text-cap font-semibold uppercase tracking-wider text-muted-foreground">
            Commit message
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="source-control-commit-message"
              className="min-w-56 flex-1"
              value={message}
              disabled={repositoryBusy}
              aria-describedby={messageError ? "source-control-message-error" : undefined}
              aria-invalid={messageError ? true : undefined}
              onChange={(event) => {
                suggestionRequestRef.current += 1;
                setSuggesting(false);
                setMessage(event.target.value);
                if (messageError) setMessageError(null);
              }}
              onKeyDown={(event) => event.key === "Enter" && !repositoryBusy && void commit()}
            />
            <Button
              variant="outline"
              size="sm"
              title="Suggest a message from the staged files"
              disabled={repositoryBusy}
              onClick={() => void suggestMessage()}
            >
              <Sparkles className="size-3.5" aria-hidden="true" /> {suggesting ? "Suggesting…" : "Suggest"}
            </Button>
            <SplitButton
              label={
                phase === "committing" ? gitPhaseLabel(phase)
                  : phase === "pushing" ? gitPhaseLabel(phase)
                  : phase === "creating_pr" ? changeRequest.creatingLabel
                  : "Commit & Push"
              }
              onClick={() => void commitAndPush()}
              disabled={repositoryBusy}
              size="sm"
              className="min-w-36"
              menuSide="top"
              actions={[
                {
                  label: "Commit",
                  onClick: () => void commit(),
                },
                {
                  label: `Commit & ${changeRequest.createLabel}`,
                  onClick: () => void commitAndCreatePr(),
                  disabled: !changeRequest.canCreate,
                },
                {
                  label: changeRequest.createLabel,
                  onClick: () => void createPr(),
                  disabled: !changeRequest.canCreate,
                },
              ]}
            />
            <Button variant="ghost" size="sm" onClick={onClose}>Done</Button>
          </div>
          {messageError && (
            <p id="source-control-message-error" role="alert" className="text-hint text-destructive">
              {messageError}
            </p>
          )}
          {phase !== "idle" && phase !== "committing" && phase !== "pushing" && phase !== "creating_pr" && (
            <p role="status" className="text-hint text-muted-foreground">{gitPhaseLabel(phase, changeRequest.label)}</p>
          )}
          {actionError && <p role="alert" className="text-hint text-destructive">{actionError}</p>}
          {actionStatus && <p role="status" className="text-hint text-muted-foreground">{actionStatus}</p>}
          {prUrl && (
            <button
              type="button"
              className="block max-w-full break-all rounded-control text-start text-hint text-primary underline underline-offset-2 outline-none focus-visible:focus-ring"
              onClick={() => void openCreatedChangeRequest()}
              aria-label={`Open created ${changeRequest.label}: ${prUrl}`}
            >
              {prUrl}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
