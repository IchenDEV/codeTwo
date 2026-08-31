import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDot,
  Clock3,
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitPullRequest,
  MessageCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  SquareKanban,
  UserRound,
  X,
} from "@/components/ui/icons";
import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  getGitHubPullRequest,
  listGitHubPullRequests,
  openExternal,
  type GitHubPullRequestDetail,
  type GitHubPullRequestSummary,
} from "../bridge";
import { ActivityOrb } from "@/components/ui/activity-orb";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { DetailMetric } from "@/components/business/detail-metric";
import { MasterDetailRow } from "@/components/business/master-detail-row";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";
import {
  filterPullRequests,
  githubPullRequestReference,
  groupPullRequests,
  pullRequestCheckState,
  shortPullRequestAge,
  type PullRequestReadiness,
  type PullRequestView,
} from "./pullRequests";
import {
  taskForPullRequest,
  type BoardTask,
} from "../taskboard/taskBoard";
import "./pull-requests.css";

type DetailState =
  | { id: string; loading: true; value: GitHubPullRequestDetail | null; error: null }
  | { id: string; loading: false; value: GitHubPullRequestDetail | null; error: string | null };

export interface PullRequestTaskLinkTarget {
  id: string;
  revision: number;
}

function avatar(login: string): ReactNode {
  return (
    <span className="relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fill-rest text-metadata font-semibold uppercase text-muted-foreground">
      {login.slice(0, 1)}
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover"
        decoding="async"
        loading="lazy"
        src={`https://github.com/${encodeURIComponent(login)}.png?size=48`}
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
    </span>
  );
}

function inlineMarkdown(value: string): ReactNode[] {
  const parts = value.split(/(`[^`]+`|https?:\/\/[^\s)]+)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded-micro bg-fill-quiet px-1 font-mono text-callout">{part.slice(1, -1)}</code>;
    }
    if (/^https?:\/\//.test(part)) {
      return <a key={index} className="text-primary underline-offset-2 hover:underline" href={part} onClick={(event) => { event.preventDefault(); void openExternal(part); }}>{part}</a>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function PullRequestBody({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push(<pre key={`code-${index}`}><code>{code.join("\n")}</code></pre>);
      index += 1;
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      const content = inlineMarkdown(heading[2] ?? "");
      blocks.push(heading[1]?.length === 2
        ? <h2 key={`heading-${index}`}>{content}</h2>
        : <h3 key={`heading-${index}`}>{content}</h3>);
      index += 1;
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || ordered) {
      const items: ReactNode[] = [];
      const matcher = bullet ? /^\s*[-*]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/;
      while (index < lines.length) {
        const match = matcher.exec(lines[index] ?? "");
        if (!match) break;
        items.push(<li key={`item-${index}`}>{inlineMarkdown(match[1] ?? "")}</li>);
        index += 1;
      }
      blocks.push(bullet ? <ul key={`list-${index}`}>{items}</ul> : <ol key={`list-${index}`}>{items}</ol>);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && (lines[index] ?? "").trim() && !/^(#{2,3})\s|^\s*[-*]\s|^\s*\d+[.)]\s|^```/.test(lines[index] ?? "")) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }
  return <div className="pull-request-body text-foreground/90">{blocks}</div>;
}

function PullRequestRow({ item, selected, onSelect }: {
  item: GitHubPullRequestSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const stateColor = item.reviewRequested
    ? "bg-warning"
    : item.isDraft
      ? "bg-muted-foreground"
      : item.authored
        ? "bg-primary"
        : "bg-success";
  return (
    <MasterDetailRow
      label={item.title}
      selected={selected}
      onSelect={onSelect}
      className="px-3"
      leading={<span className="relative flex size-6 items-center justify-center text-muted-foreground">
        <GitPullRequest className="size-4" />
        <span className={cn("absolute bottom-0 right-0 size-1.5 rounded-full", stateColor)} />
      </span>}
      meta={<span className="text-callout tabular-nums text-muted-foreground">{shortPullRequestAge(item.updatedAt)}</span>}
      description={<span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{item.repository.nameWithOwner} #{item.number}</span>
        <span className="min-w-0 flex-1 truncate font-mono">{item.author.login}</span>
      </span>}
    />
  );
}

export function PullRequestsPage({
  headerLeadingAction,
  onChat,
  tasks = [],
  activeTaskId = null,
  onLinkTask,
  onUnlinkTask,
  onOpenTask,
  loadPullRequests = listGitHubPullRequests,
  loadPullRequest = getGitHubPullRequest,
}: {
  headerLeadingAction?: ReactNode;
  onChat: (detail: GitHubPullRequestDetail) => void;
  tasks?: readonly BoardTask[];
  activeTaskId?: string | null;
  onLinkTask?: (
    detail: GitHubPullRequestDetail,
    target: PullRequestTaskLinkTarget | null,
  ) => void;
  onUnlinkTask?: (
    detail: GitHubPullRequestDetail,
    link: PullRequestTaskLinkTarget,
  ) => void;
  onOpenTask?: (id: string) => void;
  loadPullRequests?: () => Promise<GitHubPullRequestSummary[]>;
  loadPullRequest?: (summary: GitHubPullRequestSummary) => Promise<GitHubPullRequestDetail>;
}) {
  const t = useT();
  const [items, setItems] = useState<GitHubPullRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PullRequestView>("all");
  const [readiness, setReadiness] = useState<PullRequestReadiness>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailState, setDetailState] = useState<DetailState | null>(null);
  const [detailTab, setDetailTab] = useState<"summary" | "code">("summary");
  const [compactListVisible, setCompactListVisible] = useState(true);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadPullRequests();
      if (request !== requestRef.current) return;
      setItems(next);
      setSelectedId((current) => current && next.some((item) => item.id === current)
        ? current
        : next[0]?.id ?? null);
    } catch (reason) {
      if (request !== requestRef.current) return;
      setItems([]);
      setSelectedId(null);
      setError(String(reason));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [loadPullRequests]);

  useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) { setDetailState(null); return; }
    let disposed = false;
    const item = selected;
    setDetailState((current) => ({
      id: item.id,
      loading: true,
      value: current?.id === item.id ? current.value : null,
      error: null,
    }));
    void loadPullRequest(item)
      .then((value) => { if (!disposed) setDetailState({ id: item.id, loading: false, value, error: null }); })
      .catch((reason) => { if (!disposed) setDetailState({ id: item.id, loading: false, value: null, error: String(reason) }); });
    return () => { disposed = true; };
  }, [loadPullRequest, selected]);

  const visible = useMemo(
    () => filterPullRequests(items, view, readiness, deferredQuery),
    [deferredQuery, items, readiness, view],
  );
  useEffect(() => {
    if (selectedId && visible.some((item) => item.id === selectedId)) return;
    setSelectedId(visible[0]?.id ?? null);
    setDetailTab("summary");
  }, [selectedId, visible]);
  const groups = useMemo(() => groupPullRequests(visible, view), [view, visible]);
  const detail = detailState?.id === selectedId ? detailState.value : null;
  const detailReference = detail ? githubPullRequestReference(detail) : null;
  const linkedTask = detailReference ? taskForPullRequest(tasks, detailReference) : null;
  const activeTask = activeTaskId
    ? tasks.find((task) => task.id === activeTaskId) ?? null
    : null;
  const linkTarget = !linkedTask && activeTask?.pullRequest === null ? activeTask : null;
  const checkState = detail ? pullRequestCheckState(detail) : "none";
  const groupLabel = (id: "review-requested" | "reviewed" | "authored") => t(`pullRequests.group.${id}`);
  const readinessLabel = t(`pullRequests.filter.${readiness}`);

  return (
    <section
      data-compact-detail={selectedId !== null && !compactListVisible}
      className="pull-requests-page animate-data-page-in flex min-h-0 min-w-0 flex-1 bg-background text-foreground"
      aria-label={t("pullRequests.title")}
    >
      <div className="pull-requests-list-pane flex min-h-0 shrink-0 flex-col bg-sidebar">
        <header
          data-pull-requests-list-header
          className={cn(
            "electrobun-webkit-app-region-drag flex h-layout-titlebar shrink-0 items-center gap-2 pr-3",
            headerLeadingAction ? "window-controls-safe-main" : "pl-page-section",
          )}
        >
          {headerLeadingAction ? <div data-pull-requests-leading-action className="shrink-0">{headerLeadingAction}</div> : null}
          <h1 className="shrink-0 text-dialog font-semibold">{t("pullRequests.title")}</h1>
          <div className="electrobun-webkit-app-region-drag flex-1" />
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("pullRequests.refresh")} onClick={() => void reload()} disabled={loading}>{loading ? <Spinner /> : <RefreshCw />}</Button>} />
            <TooltipContent>{t("pullRequests.refresh")}</TooltipContent>
          </Tooltip>
        </header>
        <div data-pull-requests-list-controls className="grid shrink-0 gap-2 px-4 pb-3">
          <Tabs
            data-pull-requests-views
            value={view}
            onValueChange={(value) => setView(value as PullRequestView)}
            className="ms-module-inset min-w-0 gap-0"
          >
            <TabsList variant="toolbar" aria-label={t("pullRequests.views")} className="min-w-0 overflow-x-auto">
            {(["all", "reviewing", "authored"] as const).map((id) => (
              <TabsTrigger
                key={id}
                value={id}
              >
                {t(`pullRequests.view.${id}`)}
              </TabsTrigger>
            ))}
            </TabsList>
          </Tabs>
          <div data-pull-requests-search-row className="flex min-w-0 items-center gap-2">
            <div data-pull-requests-search className="ms-inline relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input size="compact" value={query} onChange={(event) => setQuery(event.currentTarget.value)} className="pl-8" placeholder={t("pullRequests.search")} aria-label={t("pullRequests.search")} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${t("pullRequests.filterLabel")}: ${readinessLabel}`}><SlidersHorizontal className="size-4" /></Button>} />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {(["all", "ready", "draft"] as const).map((id) => (
                    <DropdownMenuItem key={id} onClick={() => setReadiness(id)}>
                      <Check className={cn("size-3.5", readiness !== id && "opacity-0")} />
                      {t(`pullRequests.filter.${id}`)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-3 pb-4">
            {loading && items.length === 0 ? (
              <div role="status" className="flex items-center justify-center gap-2 py-12 text-body text-muted-foreground"><ActivityOrb state="searching" visualSize={14} />{t("pullRequests.loading")}</div>
            ) : error ? (
              <div role="alert" className="mx-1 flex flex-col items-center gap-3 py-12 text-center text-body text-muted-foreground"><CircleAlert className="size-4 text-destructive" /><p className="max-w-72">{error}</p><Button variant="secondary" size="compact" onClick={() => void reload()}>{t("pullRequests.retry")}</Button></div>
            ) : groups.length === 0 ? (
              <Empty className="py-section"><EmptyHeader><EmptyMedia variant="icon"><GitPullRequest /></EmptyMedia><EmptyTitle>{query || readiness !== "all" ? t("pullRequests.noMatches") : t("pullRequests.empty")}</EmptyTitle></EmptyHeader></Empty>
            ) : groups.map((group) => (
              <section key={group.id} className="pt-2">
                <h2 className="px-3 pb-1 text-callout font-medium text-muted-foreground">{groupLabel(group.id)}</h2>
                <div className="flex flex-col gap-0.5">{group.items.map((item) => <PullRequestRow key={item.id} item={item} selected={item.id === selectedId} onSelect={() => { setSelectedId(item.id); setDetailTab("summary"); setCompactListVisible(false); }} />)}</div>
              </section>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="pull-request-detail-pane flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header
          data-pull-request-detail-header
          className={cn(
            "electrobun-webkit-app-region-drag flex h-layout-titlebar shrink-0 items-center gap-2 pr-4",
            headerLeadingAction ? "window-controls-safe-compact-main" : "pl-4",
          )}
        >
          {headerLeadingAction ? (
            <div data-pull-request-detail-leading-action className="window-controls-compact-leading-action shrink-0">
              {headerLeadingAction}
            </div>
          ) : null}
          {selectedId && <Button variant="ghost" size="icon-xs" className="pull-request-back" aria-label={t("pullRequests.backToList")} onClick={() => setCompactListVisible(true)}><ArrowLeft className="size-3.5" /></Button>}
          <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as typeof detailTab)} className="gap-0">
            <TabsList variant="toolbar" aria-label={t("pullRequests.detailViews")}>
            {(["summary", "code"] as const).map((id) => (
              <TabsTrigger key={id} value={id} disabled={!selected}>{t(`pullRequests.detail.${id}`)}</TabsTrigger>
            ))}
            </TabsList>
          </Tabs>
          <div className="electrobun-webkit-app-region-drag flex-1" />
          {detail && <>
            <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("pullRequests.openGithub")} onClick={() => void openExternal(detail.url)}><ExternalLink className="size-3.5" /></Button>} /><TooltipContent>{t("pullRequests.openGithub")}</TooltipContent></Tooltip>
            {linkedTask ? (
              <>
                {onOpenTask ? (
                  <Button
                    variant="secondary"
                    size="compact"
                    title={linkedTask.title}
                    onClick={() => onOpenTask(linkedTask.id)}
                  >
                    <SquareKanban className="size-3.5" />
                    {t("pullRequests.openTask")}
                  </Button>
                ) : null}
                {onUnlinkTask ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("pullRequests.unlinkTask")}
                          onClick={() => onUnlinkTask(detail, {
                            id: linkedTask.id,
                            revision: linkedTask.pullRequestLinkRevision,
                          })}
                        >
                          <X className="size-3.5" />
                        </Button>
                      }
                    />
                    <TooltipContent>{t("pullRequests.unlinkTask")}</TooltipContent>
                  </Tooltip>
                ) : null}
              </>
            ) : onLinkTask ? (
              <Button
                variant="secondary"
                size="compact"
                onClick={() => onLinkTask(detail, linkTarget
                  ? { id: linkTarget.id, revision: linkTarget.pullRequestLinkRevision }
                  : null)}
              >
                <SquareKanban className="size-3.5" />
                {linkTarget ? t("pullRequests.linkTask") : t("pullRequests.createTask")}
              </Button>
            ) : null}
            <Button variant="secondary" size="compact" onClick={() => onChat(detail)}><MessageCircle className="size-3.5" />{t("pullRequests.chat")}</Button>
          </>}
        </header>
        {!selected ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-body text-muted-foreground">{t("pullRequests.select")}</div>
        ) : detailState?.loading && !detail ? (
          <div role="status" className="flex min-h-0 flex-1 items-center justify-center gap-2 text-body text-muted-foreground"><ActivityOrb state="searching" visualSize={14} />{t("pullRequests.loadingDetail")}</div>
        ) : detailState?.error ? (
          <div role="alert" className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-body text-muted-foreground"><CircleAlert className="size-4 text-destructive" /><p>{detailState.error}</p><Button variant="secondary" size="compact" onClick={() => { const current = selected; setSelectedId(null); setTimeout(() => setSelectedId(current.id), 0); }}>{t("pullRequests.retry")}</Button></div>
        ) : detail ? (
          <ScrollArea className="min-h-0 flex-1">
            {detailTab === "summary" ? (
              <article className="mx-auto w-full max-w-5xl px-8 pb-12 pt-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-page font-semibold text-foreground">{detail.title}</h1>
                    <div className="mt-2 flex items-center gap-2 text-body text-muted-foreground">{avatar(detail.author.login)}<span>{detail.author.login}</span><span>·</span><span>{shortPullRequestAge(detail.createdAt)}</span><span>·</span><span>{detail.repository.nameWithOwner} #{detail.number}</span></div>
                  </div>
                  {detailState?.loading && <ActivityOrb state="searching" visualSize={14} />}
                </div>
                <div className="mt-8 grid gap-4">
                  <DetailMetric icon={<GitBranch className="size-3.5" />} label={t("pullRequests.branch")}><span className="font-mono text-callout">{detail.headRefName}</span><ChevronDown className="mx-2 inline size-3 -rotate-90 text-muted-foreground" /><span className="font-mono text-callout">{detail.baseRefName}</span><span className="ml-3 text-success">+{detail.additions.toLocaleString()}</span><span className="ml-2 text-destructive">−{detail.deletions.toLocaleString()}</span></DetailMetric>
                  <DetailMetric icon={<UserRound className="size-3.5" />} label={t("pullRequests.reviewers")}>{detail.reviewers.length ? detail.reviewers.map((reviewer) => `${reviewer.login} · ${reviewer.state.toLocaleLowerCase().replaceAll("_", " ")}`).join(", ") : t("pullRequests.noReviewers")}</DetailMetric>
                  <DetailMetric icon={<MessageCircle className="size-3.5" />} label={t("pullRequests.comments")}>{detail.commentsCount === 0 ? t("pullRequests.noComments") : t("pullRequests.commentCount", { count: detail.commentsCount })}</DetailMetric>
                  <DetailMetric icon={checkState === "passed" ? <Check className="size-3.5 text-success" /> : checkState === "failed" ? <CircleAlert className="size-3.5 text-destructive" /> : <Clock3 className="size-3.5" />} label={t("pullRequests.checks")}>{checkState === "none" ? t("pullRequests.noChecks") : checkState === "passed" ? t("pullRequests.checksPassed", { count: detail.checks.length }) : checkState === "failed" ? t("pullRequests.checksFailed", { count: detail.checks.filter((check) => check.conclusion === "FAILURE").length || 1 }) : t("pullRequests.checksPending", { count: detail.checks.length })}</DetailMetric>
                  <DetailMetric icon={<GitPullRequest className="size-3.5" />} label={t("pullRequests.status")}><span className="inline-flex items-center gap-1.5"><CircleDot className={cn("size-3.5", detail.isDraft ? "text-muted-foreground" : "text-success")} />{detail.isDraft ? t("pullRequests.draft") : detail.state.toLocaleLowerCase()}</span></DetailMetric>
                </div>
                <section className="mt-8">
                  <h2 className="mb-5 flex items-center gap-1.5 text-dialog font-semibold"><span>{t("pullRequests.description")}</span><ChevronDown className="size-3.5 text-muted-foreground" /></h2>
                  {detail.body.trim() ? <PullRequestBody body={detail.body} /> : <p className="text-body text-muted-foreground">{t("pullRequests.noDescription")}</p>}
                </section>
              </article>
            ) : (
              <div className="mx-auto w-full max-w-5xl px-6 pb-10 pt-5">
                <div className="mb-4 flex items-center gap-2"><Code2 className="size-4 text-muted-foreground" /><h1 className="text-section font-semibold">{t("pullRequests.changedFiles", { count: detail.changedFiles })}</h1></div>
                <div className="flex flex-col gap-1">
                  {detail.files.map((file) => (
                    <div key={file.path} className="grid min-h-control-field grid-cols-[1fr_auto_auto] items-center gap-3 rounded-control bg-fill-quiet px-3 py-2 text-body">
                      <span className="flex min-w-0 items-center gap-2"><FileCode2 className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate font-mono text-callout">{file.path}</span></span>
                      <span className="text-success tabular-nums">+{file.additions}</span><span className="text-destructive tabular-nums">−{file.deletions}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        ) : null}
      </div>
    </section>
  );
}
