import { useEffect, useRef, useState } from "react";
import {
  GitBranch,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
} from "@/components/ui/icons";
import {
  gitCreatePr,
  gitDiff,
  gitDiffSince,
  gitSourceControlInfo,
  gitStagePaths,
  gitSuggestCommit,
  gitUnstagePaths,
  openExternal,
} from "../bridge";
import type {
  Checkpoint,
  GitDiffResult,
  GitDiffScope,
  GitFile,
  GitStatus,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { TooltipButton } from "@/components/ui/tooltip";
import { SplitButton } from "@/components/ui/split-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  changeRequestPresentation,
  diffLinePresentation,
  diffPreviewLines,
  gitFileDisplayState,
  gitFilePathspecs,
  gitFileSections,
  gitPhaseLabel,
  sourceControlStateForCwd,
  uniquePathspecs,
} from "./state";
import type { GitPhase, SourceControlLoadState } from "./state";

type DiffSelection =
  | { kind: "working"; scope: GitDiffScope; path: string | null; label: string }
  | { kind: "checkpoint"; commit: string; label: string };

interface DiffState {
  loading: boolean;
  result: GitDiffResult | null;
  error: string | null;
}

const emptyDiffState: DiffState = {
  error: null,
  loading: false,
  result: null,
};

const defaultDiffSelection: DiffSelection = {
  kind: "working",
  label: "All changes",
  path: null,
  scope: "all",
};

const DiffView = ({ state }: { readonly state: DiffState }) => {
  const preview = diffPreviewLines(state.result?.text ?? "");

  if (state.loading) {
    return (
      <output className="p-surface-inset text-body text-muted-foreground">
        Loading diff…
      </output>
    );
  }
  if (state.error) {
    return (
      <p role="alert" className="p-surface-inset text-body text-destructive">
        Diff failed: {state.error}
      </p>
    );
  }
  if (!state.result?.text.trim()) {
    return (
      <p className="p-surface-inset text-body text-muted-foreground">
        No changes in this scope.
      </p>
    );
  }

  return (
    <div>
      {state.result.truncated || preview.truncated ? (
        <div className="sticky top-0 z-10">
          <output className="bg-warning/10 px-surface-inset text-metadata text-warning-foreground py-2">
            {state.result.truncated
              ? `Preview truncated by the ${(state.result.truncation_reason ?? "resource").replaceAll("_", " ")} limit.`
              : "Preview rendering is limited to 4,000 lines."}
          </output>
          <Separator />
        </div>
      ) : null}
      <pre className="diff">
        {preview.lines.map((line, index) => {
          const presentation = diffLinePresentation(line);
          const changedLineLabel =
            presentation.kind === "add"
              ? `Added line: ${presentation.content}`
              : presentation.kind === "del"
                ? `Removed line: ${presentation.content}`
                : undefined;
          return (
            <div
              key={index}
              className={cn(
                "diff-line",
                presentation.kind === "context" ? "" : presentation.kind
              )}
              aria-label={changedLineLabel}
            >
              <span className="diff-line-marker" aria-hidden="true">
                {presentation.marker}
              </span>
              <span>{presentation.content}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
};

const GitFileRow = ({
  file,
  scope,
  selected,
  disabled,
  onSelect,
  onToggleIndex,
}: {
  readonly file: GitFile;
  readonly scope: "staged" | "unstaged";
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
  readonly onToggleIndex: () => void;
}) => {
  const isStaged = scope === "staged";
  const displayState = gitFileDisplayState(file, scope);
  const indexAction = isStaged ? `Unstage ${file.path}` : `Stage ${file.path}`;
  return (
    <div className="group rounded-control hover:bg-accent/50 focus-within:bg-accent/50 flex min-w-0 items-center gap-1">
      <TooltipButton
        label={indexAction}
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground hover:text-primary size-7 shrink-0"
        disabled={disabled}
        onClick={onToggleIndex}
      >
        {isStaged ? (
          <Minus className="size-3.5" />
        ) : (
          <Plus className="size-3.5" />
        )}
      </TooltipButton>
      <Button
        type="button"
        variant="selectable"
        size="row"
        focusStyle="inset"
        data-selected={selected ? "true" : "false"}
        className={cn(
          "text-metadata min-w-0 flex-1 gap-2 px-1 py-1",
          selected && "bg-accent text-foreground"
        )}
        aria-pressed={selected}
        title={
          file.original_path
            ? `${file.original_path} → ${file.path}`
            : file.path
        }
        onClick={onSelect}
      >
        <span
          className={cn(
            "rounded-control text-metadata inline-flex size-4 shrink-0 items-center justify-center font-bold",
            isStaged
              ? "bg-success/15 text-success"
              : "bg-warning/15 text-warning"
          )}
          aria-hidden="true"
        >
          {displayState.charAt(0).toUpperCase()}
        </span>
        <span className="sr-only">
          {isStaged ? "Staged" : "Unstaged"} {displayState}:{" "}
        </span>
        <span className="text-muted-foreground truncate font-mono">
          {file.path}
        </span>
      </Button>
    </div>
  );
};

// Source Control: explicit index ownership, bounded diff viewer, commit/push/PR, and checkpoints.
export const SourceControlModal = ({
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
  readonly cwd: string;
  readonly status: GitStatus | null;
  readonly statusLoading: boolean;
  readonly checkpoints: Checkpoint[];
  readonly checkpointsLoading: boolean;
  readonly onCommit: (message: string) => Promise<void>;
  readonly onPush: () => Promise<void>;
  readonly onCheckpoint: () => Promise<void>;
  readonly onRevert: (commit: string) => Promise<void>;
  readonly onRefresh: () => void;
  readonly onClose: () => void;
}) => {
  const [selection, setSelection] =
    useState<DiffSelection>(defaultDiffSelection);
  const [diffState, setDiffState] = useState<DiffState>(emptyDiffState);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [checkpointToRevert, setCheckpointToRevert] =
    useState<Checkpoint | null>(null);
  const [phase, setPhase] = useState<GitPhase>("idle");
  const [suggesting, setSuggesting] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [sourceControlState, setSourceControlState] =
    useState<SourceControlLoadState>(() => ({
      cwd,
      error: null,
      info: null,
      loading: true,
    }));
  const diffRequestRef = useRef(0);
  const suggestionRequestRef = useRef(0);
  const sourceControlRequestRef = useRef(0);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const sections = gitFileSections(status?.files ?? []);
  const stagedPathspecs = uniquePathspecs(sections.staged);
  const unstagedPathspecs = uniquePathspecs(sections.unstaged);
  const isBusy = phase !== "idle" || suggesting;
  const isRepositoryReady = !statusLoading && status?.is_repo === true;
  const isRepositoryBusy = isBusy || !isRepositoryReady;
  const isCheckpointBusy = isRepositoryBusy || checkpointsLoading;
  const currentSourceControl = sourceControlStateForCwd(
    sourceControlState,
    cwd
  );
  const changeRequest = changeRequestPresentation(
    currentSourceControl.info,
    currentSourceControl.loading,
    currentSourceControl.error,
    statusLoading ? null : isRepositoryReady
  );

  useEffect(() => {
    suggestionRequestRef.current += 1;
    setSuggesting(false);
    diffRequestRef.current += 1;
    setSelection(defaultDiffSelection);
    setDiffState(emptyDiffState);
    setMessage("");
    setMessageError(null);
    setActionError(null);
    setActionStatus(null);
    setCheckpointToRevert(null);
    setPrUrl(null);
  }, [cwd]);

  const loadSourceControl = async () => {
    const targetCwd = cwd;
    const request = ++sourceControlRequestRef.current;
    setSourceControlState({
      cwd: targetCwd,
      error: null,
      info: null,
      loading: true,
    });
    try {
      const info = await gitSourceControlInfo(targetCwd);
      if (request === sourceControlRequestRef.current) {
        setSourceControlState({
          cwd: targetCwd,
          error: null,
          info,
          loading: false,
        });
      }
    } catch (error) {
      if (request === sourceControlRequestRef.current) {
        setSourceControlState({
          cwd: targetCwd,
          error: String(error),
          info: null,
          loading: false,
        });
      }
    }
  };

  useEffect(() => {
    void loadSourceControl();
    return () => {
      sourceControlRequestRef.current += 1;
    };
  }, [loadSourceControl]);

  const loadDiff = async (next: DiffSelection) => {
    if (next.kind === "working" && !isRepositoryReady) {
      diffRequestRef.current += 1;
      setDiffState(emptyDiffState);
      return;
    }
    const request = ++diffRequestRef.current;
    setDiffState((current) => ({ ...current, error: null, loading: true }));
    try {
      const result =
        next.kind === "working"
          ? await gitDiff(cwd, next.path, next.scope)
          : await gitDiffSince(cwd, next.commit);
      if (request === diffRequestRef.current) {
        setDiffState({ error: null, loading: false, result });
      }
    } catch (error) {
      if (request === diffRequestRef.current) {
        setDiffState({ error: String(error), loading: false, result: null });
      }
    }
  };

  useEffect(() => {
    void loadDiff(selection);
  }, [loadDiff, selection, status]);

  const selectDiff = (next: DiffSelection) => {
    setSelection(next);
  };

  const mutateIndex = async (
    nextPhase: "staging" | "unstaging",
    paths: string[]
  ) => {
    if (paths.length === 0 || isRepositoryBusy) {
      return;
    }
    setPhase(nextPhase);
    setActionError(null);
    setActionStatus(null);
    try {
      if (nextPhase === "staging") {
        await gitStagePaths(cwd, paths);
      } else {
        await gitUnstagePaths(cwd, paths);
      }
      setActionStatus(nextPhase === "staging" ? "Staged." : "Unstaged.");
      onRefresh();
    } catch (error) {
      setActionError(
        `${nextPhase === "staging" ? "Stage" : "Unstage"} failed: ${error}`
      );
    } finally {
      setPhase("idle");
    }
  };

  const commit = async () => {
    if (isRepositoryBusy) {
      return;
    }
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
    if (!changeRequest.canCreate || isRepositoryBusy) {
      return;
    }
    const targetCwd = cwd;
    setActionError(null);
    setActionStatus(null);
    setPrUrl(null);
    setPhase("creating_pr");
    try {
      const url = await gitCreatePr(targetCwd, message.trim() || "Update", "");
      if (cwdRef.current !== targetCwd) {
        return;
      }
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
    if (isRepositoryBusy) {
      return;
    }
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
    if (isRepositoryBusy || !changeRequest.canCreate) {
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      setMessageError("Enter a commit message.");
      return;
    }
    if (sections.staged.length === 0) {
      setMessageError("Stage at least one file before committing.");
      return;
    }
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
      if (cwdRef.current !== targetCwd) {
        return;
      }
      setPrUrl(url);
      setActionStatus(
        `Committed & ${changeRequest.createdLabel.toLowerCase()}.`
      );
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
    if (!prUrl) {
      return;
    }
    setActionError(null);
    try {
      await openExternal(prUrl);
    } catch (error) {
      setActionError(`Open ${changeRequest.label} failed: ${error}`);
    }
  };

  const openRepository = async () => {
    const url = currentSourceControl.info?.web_url;
    if (!url) {
      return;
    }
    setActionError(null);
    try {
      await openExternal(url);
    } catch (error) {
      setActionError(`Open repository failed: ${error}`);
    }
  };

  const suggestMessage = async () => {
    if (isRepositoryBusy) {
      return;
    }
    const request = ++suggestionRequestRef.current;
    setSuggesting(true);
    setActionError(null);
    try {
      const suggestion = await gitSuggestCommit(cwd);
      if (request !== suggestionRequestRef.current) {
        return;
      }
      setMessage(suggestion);
      setMessageError(null);
    } catch (error) {
      if (request === suggestionRequestRef.current) {
        setActionError(`Suggestion failed: ${error}`);
      }
    } finally {
      if (request === suggestionRequestRef.current) {
        setSuggesting(false);
      }
    }
  };

  const createCheckpoint = async () => {
    if (isCheckpointBusy) {
      return;
    }
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
    if (isCheckpointBusy) {
      return;
    }
    const label = checkpoint.message || checkpoint.id.slice(0, 8);
    setCheckpointToRevert(null);
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

  const isSelected = (scope: GitDiffScope, path: string | null) =>
    selection.kind === "working" &&
    selection.scope === scope &&
    selection.path === path;

  const refreshSourceControl = () => {
    onRefresh();
    void loadSourceControl();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-4xl"
        aria-busy={
          isBusy ||
          statusLoading ||
          checkpointsLoading ||
          currentSourceControl.loading
        }
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3">
            Source Control
            {status?.is_repo ? (
              <span className="text-metadata text-primary flex items-center gap-1 font-semibold">
                <GitBranch className="size-3.5" aria-hidden="true" />
                {status.branch}
                {status.ahead > 0 && ` ↑${status.ahead}`}
                {status.behind > 0 && ` ↓${status.behind}`}
              </span>
            ) : null}
            <TooltipButton
              label="Refresh source control"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={refreshSourceControl}
              disabled={isBusy || currentSourceControl.loading}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
            </TooltipButton>
          </DialogTitle>
        </DialogHeader>

        <section
          className="text-metadata space-y-1"
          aria-label="Hosted source control"
        >
          {currentSourceControl.info ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{currentSourceControl.info.provider_name}</dd>
              <dt className="text-muted-foreground">Remote</dt>
              <dd
                className="truncate font-mono"
                title={currentSourceControl.info.remote_name}
              >
                {currentSourceControl.info.remote_name}
              </dd>
              <dt className="text-muted-foreground">Host</dt>
              <dd
                className="truncate font-mono"
                title={currentSourceControl.info.host}
              >
                {currentSourceControl.info.host}
              </dd>
              {currentSourceControl.info.web_url ? (
                <>
                  <dt className="text-muted-foreground">Repository</dt>
                  <dd className="min-w-0">
                    <Button
                      type="button"
                      variant="link"
                      size="compact"
                      className="text-primary h-auto max-w-full justify-start truncate px-0 py-0"
                      title={currentSourceControl.info.web_url}
                      onClick={() => void openRepository()}
                    >
                      {currentSourceControl.info.web_url}
                    </Button>
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}
          <p
            id="source-control-change-request-status"
            role={changeRequest.statusKind === "error" ? "alert" : "status"}
            aria-live={
              changeRequest.statusKind === "error" ? "assertive" : "polite"
            }
            className={cn(
              "text-muted-foreground",
              changeRequest.statusKind === "error" && "text-destructive"
            )}
          >
            {changeRequest.status}
          </p>
        </section>

        <div className="flex h-[58vh] min-h-0 flex-col gap-3 sm:h-[52vh] sm:flex-row">
          <div className="max-h-48 w-full shrink-0 overflow-y-auto pe-2.5 sm:max-h-none sm:w-64">
            <p className="text-metadata text-muted-foreground pt-2 pb-1 font-semibold tracking-wider uppercase">
              Review
            </p>
            <Button
              type="button"
              variant="selectable"
              size="row"
              focusStyle="inset"
              data-selected={isSelected("all", null) ? "true" : "false"}
              className={cn(
                "text-metadata w-full px-1.5 py-1",
                isSelected("all", null) && "bg-accent text-foreground"
              )}
              aria-pressed={isSelected("all", null)}
              disabled={isRepositoryBusy}
              onClick={() =>
                selectDiff({
                  kind: "working",
                  label: "All changes",
                  path: null,
                  scope: "all",
                })
              }
            >
              All changes
            </Button>

            <div className="flex items-center justify-between pt-3 pb-1">
              <span className="text-metadata text-muted-foreground font-semibold tracking-wider uppercase">
                Staged changes ({sections.staged.length})
              </span>
              {sections.staged.length > 0 && stagedPathspecs.length <= 256 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  className="text-metadata text-muted-foreground hover:text-primary px-1.5"
                  disabled={isRepositoryBusy}
                  onClick={() => void mutateIndex("unstaging", stagedPathspecs)}
                >
                  Unstage all
                </Button>
              )}
            </div>
            {sections.staged.map((file) => (
              <GitFileRow
                key={`staged:${file.path}`}
                file={file}
                scope="staged"
                selected={isSelected("staged", file.path)}
                disabled={isRepositoryBusy}
                onSelect={() =>
                  selectDiff({
                    kind: "working",
                    label: file.path,
                    path: file.path,
                    scope: "staged",
                  })
                }
                onToggleIndex={() =>
                  void mutateIndex("unstaging", gitFilePathspecs(file))
                }
              />
            ))}
            {sections.staged.length === 0 && (
              <p
                className="text-metadata text-muted-foreground px-1.5"
                role={statusLoading ? "status" : undefined}
              >
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
              <p className="text-metadata text-muted-foreground px-1.5">
                Unstage files individually; one operation is limited to 256
                literal paths.
              </p>
            )}

            <div className="flex items-center justify-between pt-3 pb-1">
              <span className="text-metadata text-muted-foreground font-semibold tracking-wider uppercase">
                Changes ({sections.unstaged.length})
              </span>
              {sections.unstaged.length > 0 &&
                unstagedPathspecs.length <= 256 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="compact"
                    className="text-metadata text-muted-foreground hover:text-primary px-1.5"
                    disabled={isRepositoryBusy}
                    onClick={() =>
                      void mutateIndex("staging", unstagedPathspecs)
                    }
                  >
                    Stage all
                  </Button>
                )}
            </div>
            {sections.unstaged.map((file) => (
              <GitFileRow
                key={`unstaged:${file.path}`}
                file={file}
                scope="unstaged"
                selected={isSelected("unstaged", file.path)}
                disabled={isRepositoryBusy}
                onSelect={() =>
                  selectDiff({
                    kind: "working",
                    label: file.path,
                    path: file.path,
                    scope: "unstaged",
                  })
                }
                onToggleIndex={() =>
                  void mutateIndex("staging", gitFilePathspecs(file))
                }
              />
            ))}
            {isRepositoryReady && sections.unstaged.length === 0 ? (
              <p className="text-metadata text-muted-foreground px-1.5">
                Working tree clean
              </p>
            ) : null}
            {unstagedPathspecs.length > 256 && (
              <p className="text-metadata text-muted-foreground px-1.5">
                Stage files individually; one operation is limited to 256
                literal paths.
              </p>
            )}

            <div className="flex items-center justify-between pt-4 pb-1">
              <span className="text-metadata text-muted-foreground font-semibold tracking-wider uppercase">
                Checkpoints
              </span>
              <TooltipButton
                label="Create checkpoint"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={isCheckpointBusy}
                onClick={() => void createCheckpoint()}
              >
                <Plus className="size-3" aria-hidden="true" />
              </TooltipButton>
            </div>
            {checkpointsLoading ? (
              <output className="text-metadata text-muted-foreground px-1.5">
                Loading this workspace’s checkpoints…
              </output>
            ) : checkpoints.length === 0 ? (
              <p className="text-metadata text-muted-foreground px-1.5">
                None yet
              </p>
            ) : null}
            {checkpoints.map((checkpoint) => (
              <div
                key={checkpoint.id}
                className="text-metadata flex items-center gap-1 py-0.5"
              >
                <span
                  className="text-muted-foreground flex-1 truncate"
                  title={checkpoint.message}
                >
                  {checkpoint.message || checkpoint.id.slice(0, 8)}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  className="text-metadata hover:text-primary px-2"
                  disabled={isCheckpointBusy}
                  onClick={() =>
                    selectDiff({
                      commit: checkpoint.commit,
                      kind: "checkpoint",
                      label: checkpoint.message || checkpoint.id.slice(0, 8),
                    })
                  }
                >
                  Diff
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  className="text-metadata hover:text-primary px-2"
                  disabled={isCheckpointBusy}
                  onClick={() => setCheckpointToRevert(checkpoint)}
                >
                  Revert
                </Button>
              </div>
            ))}
          </div>

          <section
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            aria-label={`Diff: ${selection.label}`}
          >
            <p className="text-metadata text-muted-foreground pb-1 font-semibold tracking-wider uppercase">
              {selection.label}
            </p>
            <ScrollArea className="rounded-module bg-muted/40 min-h-0 flex-1">
              <DiffView state={diffState} />
            </ScrollArea>
          </section>
        </div>

        <AlertDialog
          open={checkpointToRevert !== null}
          onOpenChange={(open) => !open && setCheckpointToRevert(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revert checkpoint?</AlertDialogTitle>
              <AlertDialogDescription>
                Revert tracked files to checkpoint “
                {checkpointToRevert?.message ||
                  checkpointToRevert?.id.slice(0, 8)}
                ”? Uncommitted tracked changes will be overwritten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  checkpointToRevert &&
                  void revertCheckpoint(checkpointToRevert)
                }
              >
                Revert tracked files
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="space-y-1.5">
          <label
            htmlFor="source-control-commit-message"
            className="text-metadata text-muted-foreground font-semibold tracking-wider uppercase"
          >
            Commit message
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="source-control-commit-message"
              className="min-w-56 flex-1"
              value={message}
              disabled={isRepositoryBusy}
              aria-describedby={
                messageError ? "source-control-message-error" : undefined
              }
              aria-invalid={messageError ? true : undefined}
              onChange={(event) => {
                suggestionRequestRef.current += 1;
                setSuggesting(false);
                setMessage(event.target.value);
                if (messageError) {
                  setMessageError(null);
                }
              }}
              onKeyDown={(event) =>
                event.key === "Enter" && !isRepositoryBusy && void commit()
              }
            />
            <Button
              variant="outline"
              size="sm"
              title="Suggest a message from the staged files"
              disabled={isRepositoryBusy}
              onClick={() => void suggestMessage()}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />{" "}
              {suggesting ? "Suggesting…" : "Suggest"}
            </Button>
            <SplitButton
              label={
                phase === "committing"
                  ? gitPhaseLabel(phase)
                  : phase === "pushing"
                    ? gitPhaseLabel(phase)
                    : phase === "creating_pr"
                      ? changeRequest.creatingLabel
                      : "Commit & Push"
              }
              onClick={() => void commitAndPush()}
              disabled={isRepositoryBusy}
              size="sm"
              className="min-w-36"
              menuSide="top"
              actions={[
                {
                  label: "Commit",
                  onClick: () => void commit(),
                },
                {
                  disabled: !changeRequest.canCreate,
                  label: `Commit & ${changeRequest.createLabel}`,
                  onClick: () => void commitAndCreatePr(),
                },
                {
                  disabled: !changeRequest.canCreate,
                  label: changeRequest.createLabel,
                  onClick: () => void createPr(),
                },
              ]}
            />
            <Button variant="ghost" size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
          {messageError ? (
            <p
              id="source-control-message-error"
              role="alert"
              className="text-metadata text-destructive"
            >
              {messageError}
            </p>
          ) : null}
          {phase !== "idle" &&
            phase !== "committing" &&
            phase !== "pushing" &&
            phase !== "creating_pr" && (
              <output className="text-metadata text-muted-foreground">
                {gitPhaseLabel(phase, changeRequest.label)}
              </output>
            )}
          {actionError ? (
            <p role="alert" className="text-metadata text-destructive">
              {actionError}
            </p>
          ) : null}
          {actionStatus ? (
            <output className="text-metadata text-muted-foreground">
              {actionStatus}
            </output>
          ) : null}
          {prUrl ? (
            <Button
              type="button"
              variant="link"
              size="compact"
              className="text-metadata text-primary h-auto max-w-full justify-start px-0 py-0 break-all"
              onClick={() => void openCreatedChangeRequest()}
              aria-label={`Open created ${changeRequest.label}: ${prUrl}`}
            >
              {prUrl}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
