import { useEffect, useRef, useState } from "react";

import { StatusBadge } from "@/components/business/status-badge";
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
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  CircleAlert,
  CircleDot,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
  XCircle,
} from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  gitSourceControlInfo,
  githubCurrentPullRequest,
  githubMergePullRequest,
  githubPullRequestDiff,
  githubReviewPullRequest,
  openExternal,
} from "../bridge";
import type {
  GitHubMergeStrategy,
  GitHubPullRequest,
  GitHubPullRequestCheck,
  GitHubPullRequestDiff,
  GitHubReviewAction,
  SourceControlInfo,
} from "../bridge";
import { useT } from "../i18n";
import { diffLinePresentation, diffPreviewLines } from "./state";

type PullRequestLoadState =
  | { kind: "loading"; pullRequest: null; error: null }
  | {
      kind: "not_github" | "cli_missing" | "empty";
      pullRequest: null;
      error: null;
    }
  | { kind: "error"; pullRequest: null; error: string }
  | { kind: "ready"; pullRequest: GitHubPullRequest; error: null };

type DiffLoadState =
  | { kind: "idle" | "loading"; result: null; error: null }
  | { kind: "error"; result: null; error: string }
  | { kind: "ready"; result: GitHubPullRequestDiff; error: null };

type ActionPhase =
  | "idle"
  | "opening"
  | "comment"
  | "approve"
  | "request_changes"
  | "merge";

export interface GitHubPullRequestPanelApi {
  sourceControl: (cwd: string) => Promise<SourceControlInfo | null>;
  currentPullRequest: (cwd: string) => Promise<GitHubPullRequest | null>;
  pullRequestDiff: (
    cwd: string,
    number: number
  ) => Promise<GitHubPullRequestDiff>;
  review: (
    cwd: string,
    number: number,
    action: GitHubReviewAction,
    body: string
  ) => Promise<void>;
  merge: (
    cwd: string,
    number: number,
    strategy: GitHubMergeStrategy
  ) => Promise<void>;
  open: (url: string) => Promise<void>;
}

const defaultApi: GitHubPullRequestPanelApi = {
  currentPullRequest: githubCurrentPullRequest,
  merge: githubMergePullRequest,
  open: openExternal,
  pullRequestDiff: githubPullRequestDiff,
  review: githubReviewPullRequest,
  sourceControl: gitSourceControlInfo,
};

const emptyDiffState: DiffLoadState = {
  error: null,
  kind: "idle",
  result: null,
};

export type GitHubCheckTone = "success" | "failure" | "pending";

export function githubCheckTone(
  check: GitHubPullRequestCheck
): GitHubCheckTone {
  const conclusion = (check.conclusion ?? "").toLocaleUpperCase();
  if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(conclusion)) {
    return "success";
  }
  if (
    [
      "FAILURE",
      "ACTION_REQUIRED",
      "TIMED_OUT",
      "CANCELLED",
      "STALE",
      "STARTUP_FAILURE",
      "ERROR",
    ].includes(conclusion)
  ) {
    return "failure";
  }
  return "pending";
}

export type PullRequestMergeBlock = "not_open" | "draft" | "conflicting" | null;

export function pullRequestMergeBlock(
  pullRequest: GitHubPullRequest
): PullRequestMergeBlock {
  if (pullRequest.state !== "OPEN") {
    return "not_open";
  }
  if (pullRequest.is_draft) {
    return "draft";
  }
  if (pullRequest.mergeable === "CONFLICTING") {
    return "conflicting";
  }
  return null;
}

function DiffPreview({ result }: { readonly result: GitHubPullRequestDiff }) {
  const t = useT();
  const preview = diffPreviewLines(result.text);
  if (!result.text.trim()) {
    return (
      <p className="text-metadata text-muted-foreground p-3">
        {t("githubPr.noChanges")}
      </p>
    );
  }
  return (
    <div className="rounded-module bg-muted/40 overflow-x-auto">
      {result.truncated || preview.truncated ? (
        <output className="bg-warning/10 text-metadata text-warning-foreground sticky top-0 z-10 px-3 py-2">
          {t("githubPr.diffTruncated")}
        </output>
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
}

function CheckStatusIcon({ tone }: { readonly tone: GitHubCheckTone }) {
  if (tone === "success") {
    return (
      <CheckCircle2 className="text-success size-3.5" aria-hidden="true" />
    );
  }
  if (tone === "failure") {
    return <XCircle className="text-destructive size-3.5" aria-hidden="true" />;
  }
  return <CircleDot className="text-warning size-3.5" aria-hidden="true" />;
}

export function GitHubPullRequestPanel({
  cwd,
  branch,
  onRefreshGit,
  api = defaultApi,
}: {
  readonly cwd: string;
  readonly branch: string;
  readonly onRefreshGit?: () => void;
  readonly api?: GitHubPullRequestPanelApi;
}) {
  const t = useT();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [loadState, setLoadState] = useState<PullRequestLoadState>({
    error: null,
    kind: "loading",
    pullRequest: null,
  });
  const [view, setView] = useState<"overview" | "changes">("overview");
  const [diffState, setDiffState] = useState<DiffLoadState>(emptyDiffState);
  const [reviewBody, setReviewBody] = useState("");
  const [mergeStrategy, setMergeStrategy] =
    useState<GitHubMergeStrategy>("squash");
  const [phase, setPhase] = useState<ActionPhase>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const loadRequestRef = useRef(0);
  const diffRequestRef = useRef(0);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  const load = async (isResetFeedback = true) => {
    const targetCwd = cwd;
    const request = ++loadRequestRef.current;
    if (isResetFeedback) {
      setActionError(null);
      setActionStatus(null);
    }
    setLoadState({ error: null, kind: "loading", pullRequest: null });
    try {
      const sourceControl = await apiRef.current.sourceControl(targetCwd);
      if (request !== loadRequestRef.current) {
        return;
      }
      if (sourceControl?.provider !== "github") {
        setLoadState({ error: null, kind: "not_github", pullRequest: null });
        return;
      }
      if (
        sourceControl.required_cli === "gh" &&
        !sourceControl.required_cli_available
      ) {
        setLoadState({ error: null, kind: "cli_missing", pullRequest: null });
        return;
      }
      const pullRequest = await apiRef.current.currentPullRequest(targetCwd);
      if (request !== loadRequestRef.current) {
        return;
      }
      setLoadState(
        pullRequest
          ? { error: null, kind: "ready", pullRequest }
          : { error: null, kind: "empty", pullRequest: null }
      );
    } catch (error) {
      if (request === loadRequestRef.current) {
        setLoadState({
          error: String(error),
          kind: "error",
          pullRequest: null,
        });
      }
    }
  };

  useEffect(() => {
    setView("overview");
    setDiffState(emptyDiffState);
    setReviewBody("");
    setMergeStrategy("squash");
    setPhase("idle");
    setMergeConfirmOpen(false);
    void load();
    return () => {
      loadRequestRef.current += 1;
      diffRequestRef.current += 1;
    };
  }, [branch, load]);

  const refresh = () => {
    diffRequestRef.current += 1;
    setDiffState(emptyDiffState);
    void load();
    onRefreshGit?.();
  };

  const showChanges = async () => {
    setView("changes");
    if (diffState.kind !== "idle" || loadState.kind !== "ready") {
      return;
    }
    const targetCwd = cwd;
    const { number } = loadState.pullRequest;
    const request = ++diffRequestRef.current;
    setDiffState({ error: null, kind: "loading", result: null });
    try {
      const result = await apiRef.current.pullRequestDiff(targetCwd, number);
      if (request === diffRequestRef.current && cwdRef.current === targetCwd) {
        setDiffState({ error: null, kind: "ready", result });
      }
    } catch (error) {
      if (request === diffRequestRef.current && cwdRef.current === targetCwd) {
        setDiffState({ error: String(error), kind: "error", result: null });
      }
    }
  };

  const openPullRequest = async (pullRequest: GitHubPullRequest) => {
    setPhase("opening");
    setActionError(null);
    try {
      await apiRef.current.open(pullRequest.url);
    } catch (error) {
      setActionError(t("githubPr.openFailed", { error: String(error) }));
    } finally {
      setPhase("idle");
    }
  };

  const submitReview = async (action: GitHubReviewAction) => {
    if (loadState.kind !== "ready" || phase !== "idle") {
      return;
    }
    const body = reviewBody.trim();
    if ((action === "comment" || action === "request_changes") && !body) {
      setActionError(t("githubPr.reviewBodyRequired"));
      return;
    }
    const { pullRequest } = loadState;
    const targetCwd = cwd;
    setPhase(action);
    setActionError(null);
    setActionStatus(null);
    try {
      await apiRef.current.review(targetCwd, pullRequest.number, action, body);
      if (cwdRef.current !== targetCwd) {
        return;
      }
      setReviewBody("");
      await load(false);
      setActionStatus(t("githubPr.reviewSubmitted"));
    } catch (error) {
      if (cwdRef.current === targetCwd) {
        setActionError(t("githubPr.reviewFailed", { error: String(error) }));
      }
    } finally {
      setPhase("idle");
    }
  };

  const mergePullRequest = async () => {
    if (loadState.kind !== "ready" || phase !== "idle") {
      return;
    }
    const { pullRequest } = loadState;
    if (pullRequestMergeBlock(pullRequest)) {
      return;
    }
    setMergeConfirmOpen(false);
    const targetCwd = cwd;
    setPhase("merge");
    setActionError(null);
    setActionStatus(null);
    try {
      await apiRef.current.merge(targetCwd, pullRequest.number, mergeStrategy);
      if (cwdRef.current !== targetCwd) {
        return;
      }
      await load(false);
      onRefreshGit?.();
      setActionStatus(
        t("githubPr.mergeComplete", { number: pullRequest.number })
      );
    } catch (error) {
      if (cwdRef.current === targetCwd) {
        setActionError(t("githubPr.mergeFailed", { error: String(error) }));
      }
    } finally {
      setPhase("idle");
    }
  };

  const pullRequest = loadState.kind === "ready" ? loadState.pullRequest : null;
  const mergeBlock = pullRequest
    ? pullRequestMergeBlock(pullRequest)
    : "not_open";
  const checks = pullRequest?.checks ?? [];
  const failedChecks = checks.filter(
    (check) => githubCheckTone(check) === "failure"
  ).length;
  const pendingChecks = checks.filter(
    (check) => githubCheckTone(check) === "pending"
  ).length;

  return (
    <section aria-label={t("githubPr.title")} className="space-y-3">
      <div className="flex items-center gap-2">
        <GitPullRequest
          className="text-muted-foreground size-4"
          aria-hidden="true"
        />
        <h3 className="text-body font-semibold">{t("githubPr.title")}</h3>
        <TooltipButton
          label={t("githubPr.refresh")}
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          disabled={loadState.kind === "loading" || phase !== "idle"}
          onClick={refresh}
        >
          <RefreshCw className="size-3" aria-hidden="true" />
        </TooltipButton>
      </div>

      {loadState.kind === "loading" && (
        <output className="text-muted-foreground">
          {t("githubPr.loading")}
        </output>
      )}
      {loadState.kind === "not_github" && (
        <p className="text-muted-foreground">{t("githubPr.notGithub")}</p>
      )}
      {loadState.kind === "cli_missing" && (
        <p className="text-muted-foreground">{t("githubPr.cliMissing")}</p>
      )}
      {loadState.kind === "empty" && (
        <p className="text-muted-foreground">
          {t("githubPr.empty", { branch: branch || "HEAD" })}
        </p>
      )}
      {loadState.kind === "error" && (
        <p role="alert" className="text-destructive">
          {t("githubPr.loadFailed", { error: loadState.error })}
        </p>
      )}

      {pullRequest ? (
        <div data-github-pr={pullRequest.number} className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <Button
                type="button"
                variant="ghost"
                size="row"
                focusStyle="inset"
                className="hover:text-primary h-auto min-w-0 flex-1 justify-start px-0 py-0 font-semibold"
                aria-label={t("githubPr.openOnGithub", {
                  number: pullRequest.number,
                })}
                title={pullRequest.url}
                disabled={phase !== "idle"}
                onClick={() => void openPullRequest(pullRequest)}
              >
                <span className="text-muted-foreground">
                  #{pullRequest.number}
                </span>{" "}
                {pullRequest.title}
                <ExternalLink
                  className="ms-1 inline size-3 align-baseline"
                  aria-hidden="true"
                />
              </Button>
              <StatusBadge
                tone={
                  pullRequest.is_draft
                    ? "neutral"
                    : pullRequest.state === "OPEN" ||
                        pullRequest.state === "MERGED"
                      ? "success"
                      : "neutral"
                }
              >
                {pullRequest.is_draft
                  ? t("githubPr.state.draft")
                  : t(
                      `githubPr.state.${pullRequest.state.toLocaleLowerCase() as "open" | "merged" | "closed"}`
                    )}
              </StatusBadge>
            </div>
            <p
              className="text-metadata text-muted-foreground truncate font-mono"
              title={`${pullRequest.head_ref} → ${pullRequest.base_ref}`}
            >
              {pullRequest.head_ref} → {pullRequest.base_ref}
            </p>
            <div className="text-metadata text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-success">+{pullRequest.additions}</span>
              <span className="text-destructive">−{pullRequest.deletions}</span>
              <span>
                {t("githubPr.files", { count: pullRequest.changed_files })}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3" aria-hidden="true" />
                {pullRequest.comments_count + pullRequest.reviews_count}
              </span>
            </div>
          </div>

          <div className="rounded-control bg-fill-quiet flex gap-1 p-0.5">
            <Button
              type="button"
              variant="selectable"
              size="compact"
              focusStyle="inset"
              data-selected={view === "overview" ? "true" : "false"}
              className={cn(
                "text-metadata h-auto px-2 py-1.5",
                view === "overview"
                  ? "bg-fill-hover text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={view === "overview"}
              onClick={() => setView("overview")}
            >
              {t("githubPr.overview")}
            </Button>
            <Button
              type="button"
              variant="selectable"
              size="compact"
              focusStyle="inset"
              data-selected={view === "changes" ? "true" : "false"}
              className={cn(
                "text-metadata h-auto px-2 py-1.5",
                view === "changes"
                  ? "bg-fill-hover text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={view === "changes"}
              onClick={() => void showChanges()}
            >
              {t("githubPr.changes", { count: pullRequest.changed_files })}
            </Button>
          </div>

          {view === "overview" ? (
            <div className="space-y-3">
              <section className="space-y-1.5">
                <h4 className="text-metadata text-muted-foreground font-semibold tracking-wider uppercase">
                  {t("githubPr.description")}
                </h4>
                <p className="text-metadata text-muted-foreground whitespace-pre-wrap">
                  {pullRequest.body || t("githubPr.noDescription")}
                </p>
              </section>

              <section className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-metadata text-muted-foreground font-semibold tracking-wider uppercase">
                    {t("githubPr.checks")}
                  </h4>
                  {checks.length > 0 && (
                    <span className="text-metadata text-muted-foreground">
                      {failedChecks > 0
                        ? t("githubPr.checksFailed", { count: failedChecks })
                        : pendingChecks > 0
                          ? t("githubPr.checksPending", {
                              count: pendingChecks,
                            })
                          : t("githubPr.checksPassed")}
                    </span>
                  )}
                </div>
                {checks.length === 0 ? (
                  <p className="text-metadata text-muted-foreground">
                    {t("githubPr.noChecks")}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {checks.map((check, index) => {
                      const tone = githubCheckTone(check);
                      const content = (
                        <>
                          <CheckStatusIcon tone={tone} />
                          <span className="min-w-0 flex-1 truncate">
                            {check.name}
                          </span>
                          <span className="text-metadata text-muted-foreground">
                            {check.conclusion ?? check.status ?? "PENDING"}
                          </span>
                        </>
                      );
                      return check.details_url ? (
                        <Button
                          key={`${check.name}:${index}`}
                          type="button"
                          variant="ghost"
                          size="row"
                          focusStyle="inset"
                          className="bg-fill-quiet px-module-inset text-metadata w-full gap-2 py-2"
                          onClick={() =>
                            void apiRef.current.open(check.details_url!)
                          }
                        >
                          {content}
                        </Button>
                      ) : (
                        <div
                          key={`${check.name}:${index}`}
                          className="rounded-control bg-fill-quiet text-metadata flex items-center gap-2 px-2.5 py-2"
                        >
                          {content}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-3">
              {diffState.kind === "loading" && (
                <output className="text-muted-foreground">
                  {t("githubPr.diffLoading")}
                </output>
              )}
              {diffState.kind === "error" && (
                <p role="alert" className="text-destructive">
                  {t("githubPr.diffFailed", { error: diffState.error })}
                </p>
              )}
              {diffState.kind === "ready" && (
                <DiffPreview result={diffState.result} />
              )}

              {pullRequest.state === "OPEN" && (
                <section
                  className="space-y-2 pt-3"
                  aria-label={t("githubPr.review")}
                >
                  <Textarea
                    className="min-h-20"
                    value={reviewBody}
                    disabled={phase !== "idle"}
                    placeholder={t("githubPr.reviewPlaceholder")}
                    aria-label={t("githubPr.reviewPlaceholder")}
                    onChange={(event) => {
                      setReviewBody(event.currentTarget.value);
                      setActionError(null);
                    }}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={phase !== "idle" || !reviewBody.trim()}
                      onClick={() => void submitReview("comment")}
                    >
                      {t("githubPr.comment")}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={phase !== "idle" || !reviewBody.trim()}
                      onClick={() => void submitReview("request_changes")}
                    >
                      {t("githubPr.requestChanges")}
                    </Button>
                    <Button
                      size="xs"
                      disabled={phase !== "idle"}
                      onClick={() => void submitReview("approve")}
                    >
                      {phase === "approve"
                        ? t("githubPr.submitting")
                        : t("githubPr.approve")}
                    </Button>
                  </div>
                </section>
              )}
            </div>
          )}

          {pullRequest.state === "OPEN" && (
            <section
              className="space-y-2 pt-3"
              aria-label={t("githubPr.mergeSection")}
            >
              <div className="flex gap-2">
                <Select
                  value={mergeStrategy}
                  onValueChange={(value) =>
                    setMergeStrategy(value as GitHubMergeStrategy)
                  }
                  disabled={phase !== "idle" || Boolean(mergeBlock)}
                >
                  <SelectTrigger
                    size="sm"
                    className="min-w-32 flex-1"
                    aria-label={t("githubPr.mergeStrategyLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="squash">
                        {t("githubPr.mergeStrategy.squash")}
                      </SelectItem>
                      <SelectItem value="merge">
                        {t("githubPr.mergeStrategy.merge")}
                      </SelectItem>
                      <SelectItem value="rebase">
                        {t("githubPr.mergeStrategy.rebase")}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={phase !== "idle" || Boolean(mergeBlock)}
                  onClick={() => setMergeConfirmOpen(true)}
                >
                  <GitMerge className="size-3.5" aria-hidden="true" />
                  {phase === "merge"
                    ? t("githubPr.merging")
                    : t("githubPr.merge")}
                </Button>
              </div>
              {mergeBlock === "draft" && (
                <p className="text-metadata text-muted-foreground flex items-start gap-1.5">
                  <CircleAlert
                    className="mt-0.5 size-3 shrink-0"
                    aria-hidden="true"
                  />
                  {t("githubPr.mergeDraftBlocked")}
                </p>
              )}
              {mergeBlock === "conflicting" && (
                <p className="text-metadata text-destructive flex items-start gap-1.5">
                  <CircleAlert
                    className="mt-0.5 size-3 shrink-0"
                    aria-hidden="true"
                  />
                  {t("githubPr.mergeConflictBlocked")}
                </p>
              )}
            </section>
          )}
        </div>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-metadata text-destructive">
          {actionError}
        </p>
      ) : null}
      {actionStatus ? (
        <output className="text-metadata text-success">{actionStatus}</output>
      ) : null}

      <AlertDialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("githubPr.mergeSection")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pullRequest
                ? t("githubPr.mergeConfirm", {
                    branch: pullRequest.base_ref,
                    number: pullRequest.number,
                    strategy: t(`githubPr.mergeStrategy.${mergeStrategy}`),
                  })
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actionDialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void mergePullRequest()}>
              {t("githubPr.merge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
