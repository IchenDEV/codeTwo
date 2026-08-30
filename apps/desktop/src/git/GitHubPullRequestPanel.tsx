import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  gitSourceControlInfo,
  githubCurrentPullRequest,
  githubMergePullRequest,
  githubPullRequestDiff,
  githubReviewPullRequest,
  openExternal,
  type GitHubMergeStrategy,
  type GitHubPullRequest,
  type GitHubPullRequestCheck,
  type GitHubPullRequestDiff,
  type GitHubReviewAction,
  type SourceControlInfo,
} from "../bridge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/business/status-badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";
import { diffPreviewLines } from "./state";

type PullRequestLoadState =
  | { kind: "loading"; pullRequest: null; error: null }
  | { kind: "not_github" | "cli_missing" | "empty"; pullRequest: null; error: null }
  | { kind: "error"; pullRequest: null; error: string }
  | { kind: "ready"; pullRequest: GitHubPullRequest; error: null };

type DiffLoadState =
  | { kind: "idle" | "loading"; result: null; error: null }
  | { kind: "error"; result: null; error: string }
  | { kind: "ready"; result: GitHubPullRequestDiff; error: null };

type ActionPhase = "idle" | "opening" | "comment" | "approve" | "request_changes" | "merge";

export interface GitHubPullRequestPanelApi {
  sourceControl: (cwd: string) => Promise<SourceControlInfo | null>;
  currentPullRequest: (cwd: string) => Promise<GitHubPullRequest | null>;
  pullRequestDiff: (cwd: string, number: number) => Promise<GitHubPullRequestDiff>;
  review: (
    cwd: string,
    number: number,
    action: GitHubReviewAction,
    body: string,
  ) => Promise<void>;
  merge: (cwd: string, number: number, strategy: GitHubMergeStrategy) => Promise<void>;
  open: (url: string) => Promise<void>;
}

const DEFAULT_API: GitHubPullRequestPanelApi = {
  sourceControl: gitSourceControlInfo,
  currentPullRequest: githubCurrentPullRequest,
  pullRequestDiff: githubPullRequestDiff,
  review: githubReviewPullRequest,
  merge: githubMergePullRequest,
  open: openExternal,
};

const EMPTY_DIFF_STATE: DiffLoadState = { kind: "idle", result: null, error: null };

export type GitHubCheckTone = "success" | "failure" | "pending";

export function githubCheckTone(check: GitHubPullRequestCheck): GitHubCheckTone {
  const conclusion = (check.conclusion ?? "").toLocaleUpperCase();
  if (["SUCCESS", "NEUTRAL", "SKIPPED"].includes(conclusion)) return "success";
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

export function pullRequestMergeBlock(pullRequest: GitHubPullRequest): PullRequestMergeBlock {
  if (pullRequest.state !== "OPEN") return "not_open";
  if (pullRequest.is_draft) return "draft";
  if (pullRequest.mergeable === "CONFLICTING") return "conflicting";
  return null;
}

function DiffPreview({ result }: { result: GitHubPullRequestDiff }) {
  const t = useT();
  const preview = useMemo(() => diffPreviewLines(result.text), [result.text]);
  if (!result.text.trim()) {
    return <p className="p-3 text-hint text-muted-foreground">{t("githubPr.noChanges")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-module bg-muted/40">
      {(result.truncated || preview.truncated) && (
        <p role="status" className="sticky top-0 z-10 bg-warning/10 px-3 py-2 text-cap text-warning-foreground">
          {t("githubPr.diffTruncated")}
        </p>
      )}
      <pre className="diff">
        {preview.lines.map((line, index) => {
          let className = "";
          if (line.startsWith("+") && !line.startsWith("+++")) className = "add";
          else if (line.startsWith("-") && !line.startsWith("---")) className = "del";
          else if (line.startsWith("@@")) className = "hunk";
          else if (line.startsWith("diff ") || line.startsWith("index ")) className = "meta";
          return (
            <div key={index} className={cn("diff-line", className)}>
              {line || " "}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function CheckStatusIcon({ tone }: { tone: GitHubCheckTone }) {
  if (tone === "success") return <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />;
  if (tone === "failure") return <XCircle className="size-3.5 text-destructive" aria-hidden="true" />;
  return <CircleDot className="size-3.5 text-warning" aria-hidden="true" />;
}

export function GitHubPullRequestPanel({
  cwd,
  branch,
  onRefreshGit,
  api = DEFAULT_API,
}: {
  cwd: string;
  branch: string;
  onRefreshGit?: () => void;
  api?: GitHubPullRequestPanelApi;
}) {
  const t = useT();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [loadState, setLoadState] = useState<PullRequestLoadState>({
    kind: "loading",
    pullRequest: null,
    error: null,
  });
  const [view, setView] = useState<"overview" | "changes">("overview");
  const [diffState, setDiffState] = useState<DiffLoadState>(EMPTY_DIFF_STATE);
  const [reviewBody, setReviewBody] = useState("");
  const [mergeStrategy, setMergeStrategy] = useState<GitHubMergeStrategy>("squash");
  const [phase, setPhase] = useState<ActionPhase>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const diffRequestRef = useRef(0);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  const load = useCallback(
    async (resetFeedback = true) => {
      const targetCwd = cwd;
      const request = ++loadRequestRef.current;
      if (resetFeedback) {
        setActionError(null);
        setActionStatus(null);
      }
      setLoadState({ kind: "loading", pullRequest: null, error: null });
      try {
        const sourceControl = await apiRef.current.sourceControl(targetCwd);
        if (request !== loadRequestRef.current) return;
        if (sourceControl?.provider !== "github") {
          setLoadState({ kind: "not_github", pullRequest: null, error: null });
          return;
        }
        if (sourceControl.required_cli === "gh" && !sourceControl.required_cli_available) {
          setLoadState({ kind: "cli_missing", pullRequest: null, error: null });
          return;
        }
        const pullRequest = await apiRef.current.currentPullRequest(targetCwd);
        if (request !== loadRequestRef.current) return;
        setLoadState(
          pullRequest
            ? { kind: "ready", pullRequest, error: null }
            : { kind: "empty", pullRequest: null, error: null },
        );
      } catch (error) {
        if (request === loadRequestRef.current) {
          setLoadState({ kind: "error", pullRequest: null, error: String(error) });
        }
      }
    },
    [cwd],
  );

  useEffect(() => {
    setView("overview");
    setDiffState(EMPTY_DIFF_STATE);
    setReviewBody("");
    setMergeStrategy("squash");
    setPhase("idle");
    void load();
    return () => {
      loadRequestRef.current += 1;
      diffRequestRef.current += 1;
    };
  }, [branch, load]);

  const refresh = () => {
    diffRequestRef.current += 1;
    setDiffState(EMPTY_DIFF_STATE);
    void load();
    onRefreshGit?.();
  };

  const showChanges = async () => {
    setView("changes");
    if (diffState.kind !== "idle" || loadState.kind !== "ready") return;
    const targetCwd = cwd;
    const number = loadState.pullRequest.number;
    const request = ++diffRequestRef.current;
    setDiffState({ kind: "loading", result: null, error: null });
    try {
      const result = await apiRef.current.pullRequestDiff(targetCwd, number);
      if (request === diffRequestRef.current && cwdRef.current === targetCwd) {
        setDiffState({ kind: "ready", result, error: null });
      }
    } catch (error) {
      if (request === diffRequestRef.current && cwdRef.current === targetCwd) {
        setDiffState({ kind: "error", result: null, error: String(error) });
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
    if (loadState.kind !== "ready" || phase !== "idle") return;
    const body = reviewBody.trim();
    if ((action === "comment" || action === "request_changes") && !body) {
      setActionError(t("githubPr.reviewBodyRequired"));
      return;
    }
    const pullRequest = loadState.pullRequest;
    const targetCwd = cwd;
    setPhase(action);
    setActionError(null);
    setActionStatus(null);
    try {
      await apiRef.current.review(targetCwd, pullRequest.number, action, body);
      if (cwdRef.current !== targetCwd) return;
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
    if (loadState.kind !== "ready" || phase !== "idle") return;
    const pullRequest = loadState.pullRequest;
    if (pullRequestMergeBlock(pullRequest)) return;
    const strategyLabel = t(`githubPr.mergeStrategy.${mergeStrategy}`);
    if (
      !window.confirm(
        t("githubPr.mergeConfirm", {
          number: pullRequest.number,
          branch: pullRequest.base_ref,
          strategy: strategyLabel,
        }),
      )
    ) {
      return;
    }
    const targetCwd = cwd;
    setPhase("merge");
    setActionError(null);
    setActionStatus(null);
    try {
      await apiRef.current.merge(targetCwd, pullRequest.number, mergeStrategy);
      if (cwdRef.current !== targetCwd) return;
      await load(false);
      onRefreshGit?.();
      setActionStatus(t("githubPr.mergeComplete", { number: pullRequest.number }));
    } catch (error) {
      if (cwdRef.current === targetCwd) {
        setActionError(t("githubPr.mergeFailed", { error: String(error) }));
      }
    } finally {
      setPhase("idle");
    }
  };

  const pullRequest = loadState.kind === "ready" ? loadState.pullRequest : null;
  const mergeBlock = pullRequest ? pullRequestMergeBlock(pullRequest) : "not_open";
  const checks = pullRequest?.checks ?? [];
  const failedChecks = checks.filter((check) => githubCheckTone(check) === "failure").length;
  const pendingChecks = checks.filter((check) => githubCheckTone(check) === "pending").length;

  return (
    <section aria-label={t("githubPr.title")} className="space-y-3">
      <div className="flex items-center gap-2">
        <GitPullRequest className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="text-ui font-semibold">{t("githubPr.title")}</h3>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          title={t("githubPr.refresh")}
          aria-label={t("githubPr.refresh")}
          disabled={loadState.kind === "loading" || phase !== "idle"}
          onClick={refresh}
        >
          <RefreshCw className="size-3" aria-hidden="true" />
        </Button>
      </div>

      {loadState.kind === "loading" && (
        <p role="status" className="text-muted-foreground">{t("githubPr.loading")}</p>
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

      {pullRequest && (
        <div data-github-pr={pullRequest.number} className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-control text-start text-ui font-semibold leading-snug outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("githubPr.openOnGithub", { number: pullRequest.number })}
                title={pullRequest.url}
                disabled={phase !== "idle"}
                onClick={() => void openPullRequest(pullRequest)}
              >
                <span className="text-muted-foreground">#{pullRequest.number}</span>{" "}
                {pullRequest.title}
                <ExternalLink className="ms-1 inline size-3 align-baseline" aria-hidden="true" />
              </button>
              <StatusBadge
                tone={pullRequest.is_draft
                  ? "neutral"
                  : pullRequest.state === "OPEN" || pullRequest.state === "MERGED"
                    ? "success"
                    : "neutral"}
              >
                {pullRequest.is_draft
                  ? t("githubPr.state.draft")
                  : t(`githubPr.state.${pullRequest.state.toLocaleLowerCase() as "open" | "merged" | "closed"}`)}
              </StatusBadge>
            </div>
            <p className="truncate font-mono text-cap text-muted-foreground" title={`${pullRequest.head_ref} → ${pullRequest.base_ref}`}>
              {pullRequest.head_ref} → {pullRequest.base_ref}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-cap text-muted-foreground">
              <span className="text-success">+{pullRequest.additions}</span>
              <span className="text-destructive">−{pullRequest.deletions}</span>
              <span>{t("githubPr.files", { count: pullRequest.changed_files })}</span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3" aria-hidden="true" />
                {pullRequest.comments_count + pullRequest.reviews_count}
              </span>
            </div>
          </div>

          <div className="flex gap-1 rounded-control bg-fill-quiet p-0.5">
            <button
              type="button"
              className={cn(
                "rounded-micro px-2 py-1.5 text-hint outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === "overview"
                  ? "bg-fill-hover text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={view === "overview"}
              onClick={() => setView("overview")}
            >
              {t("githubPr.overview")}
            </button>
            <button
              type="button"
              className={cn(
                "rounded-micro px-2 py-1.5 text-hint outline-none focus-visible:ring-2 focus-visible:ring-ring",
                view === "changes"
                  ? "bg-fill-hover text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={view === "changes"}
              onClick={() => void showChanges()}
            >
              {t("githubPr.changes", { count: pullRequest.changed_files })}
            </button>
          </div>

          {view === "overview" ? (
            <div className="space-y-3">
              <section className="space-y-1.5">
                <h4 className="text-cap font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("githubPr.description")}
                </h4>
                <p className="whitespace-pre-wrap text-hint leading-relaxed text-muted-foreground">
                  {pullRequest.body || t("githubPr.noDescription")}
                </p>
              </section>

              <section className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-cap font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("githubPr.checks")}
                  </h4>
                  {checks.length > 0 && (
                    <span className="text-cap text-muted-foreground">
                      {failedChecks > 0
                        ? t("githubPr.checksFailed", { count: failedChecks })
                        : pendingChecks > 0
                          ? t("githubPr.checksPending", { count: pendingChecks })
                          : t("githubPr.checksPassed")}
                    </span>
                  )}
                </div>
                {checks.length === 0 ? (
                  <p className="text-hint text-muted-foreground">{t("githubPr.noChecks")}</p>
                ) : (
                  <div className="space-y-1">
                    {checks.map((check, index) => {
                      const tone = githubCheckTone(check);
                      const content = (
                        <>
                          <CheckStatusIcon tone={tone} />
                          <span className="min-w-0 flex-1 truncate">{check.name}</span>
                          <span className="text-cap text-muted-foreground">
                            {check.conclusion ?? check.status ?? "PENDING"}
                          </span>
                        </>
                      );
                      return check.details_url ? (
                        <button
                          key={`${check.name}:${index}`}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-control bg-fill-quiet px-2.5 py-2 text-start text-hint outline-none hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => void apiRef.current.open(check.details_url!)}
                        >
                          {content}
                        </button>
                      ) : (
                        <div key={`${check.name}:${index}`} className="flex items-center gap-2 rounded-control bg-fill-quiet px-2.5 py-2 text-hint">
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
                <p role="status" className="text-muted-foreground">{t("githubPr.diffLoading")}</p>
              )}
              {diffState.kind === "error" && (
                <p role="alert" className="text-destructive">
                  {t("githubPr.diffFailed", { error: diffState.error })}
                </p>
              )}
              {diffState.kind === "ready" && <DiffPreview result={diffState.result} />}

              {pullRequest.state === "OPEN" && (
                <section className="space-y-2 pt-3" aria-label={t("githubPr.review")}>
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
                    <Button size="xs" variant="outline" disabled={phase !== "idle" || !reviewBody.trim()} onClick={() => void submitReview("comment")}>
                      {t("githubPr.comment")}
                    </Button>
                    <Button size="xs" variant="outline" disabled={phase !== "idle" || !reviewBody.trim()} onClick={() => void submitReview("request_changes")}>
                      {t("githubPr.requestChanges")}
                    </Button>
                    <Button size="xs" disabled={phase !== "idle"} onClick={() => void submitReview("approve")}>
                      {phase === "approve" ? t("githubPr.submitting") : t("githubPr.approve")}
                    </Button>
                  </div>
                </section>
              )}
            </div>
          )}

          {pullRequest.state === "OPEN" && (
            <section className="space-y-2 pt-3" aria-label={t("githubPr.mergeSection")}>
              <div className="flex gap-2">
                <Select
                  value={mergeStrategy}
                  onValueChange={(value) => setMergeStrategy(value as GitHubMergeStrategy)}
                  disabled={phase !== "idle" || Boolean(mergeBlock)}
                >
                  <SelectTrigger size="sm" className="min-w-32 flex-1" aria-label={t("githubPr.mergeStrategyLabel")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="squash">{t("githubPr.mergeStrategy.squash")}</SelectItem>
                      <SelectItem value="merge">{t("githubPr.mergeStrategy.merge")}</SelectItem>
                      <SelectItem value="rebase">{t("githubPr.mergeStrategy.rebase")}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={phase !== "idle" || Boolean(mergeBlock)}
                  onClick={() => void mergePullRequest()}
                >
                  <GitMerge className="size-3.5" aria-hidden="true" />
                  {phase === "merge" ? t("githubPr.merging") : t("githubPr.merge")}
                </Button>
              </div>
              {mergeBlock === "draft" && (
                <p className="flex items-start gap-1.5 text-cap text-muted-foreground">
                  <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  {t("githubPr.mergeDraftBlocked")}
                </p>
              )}
              {mergeBlock === "conflicting" && (
                <p className="flex items-start gap-1.5 text-cap text-destructive">
                  <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  {t("githubPr.mergeConflictBlocked")}
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {actionError && <p role="alert" className="text-hint text-destructive">{actionError}</p>}
      {actionStatus && <p role="status" className="text-hint text-success">{actionStatus}</p>}
    </section>
  );
}
