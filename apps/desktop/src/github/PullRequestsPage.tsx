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
import { Fragment, useDeferredValue, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  getGitHubPullRequest,
  listGitHubPullRequests,
  openExternal,
} from "../bridge";
import type {
  GitHubPullRequestDetail,
  GitHubPullRequestSummary,
} from "../bridge";
import { ActivityOrb } from "@/components/ui/activity-orb";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";
import {
  filterPullRequests,
  githubPullRequestReference,
  groupPullRequests,
  pullRequestCheckState,
  shortPullRequestAge,
} from "./pullRequests";
import type { PullRequestReadiness, PullRequestView } from "./pullRequests";
import { taskForPullRequest } from "../taskboard/taskBoard";
import type { BoardTask } from "../taskboard/taskBoard";
import "./pull-requests.css";

type DetailState =
  | {
      id: string;
      loading: true;
      value: GitHubPullRequestDetail | null;
      error: null;
    }
  | {
      id: string;
      loading: false;
      value: GitHubPullRequestDetail | null;
      error: string | null;
    };

export interface PullRequestTaskLinkTarget {
  id: string;
  revision: number;
}

function avatar(login: string): ReactNode {
  return (
    <span className="bg-fill-rest text-metadata text-muted-foreground relative flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold uppercase">
      {login.slice(0, 1)}
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover"
        decoding="async"
        loading="lazy"
        src={`https://github.com/${encodeURIComponent(login)}.png?size=48`}
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
      />
    </span>
  );
}

function inlineMarkdown(value: string): ReactNode[] {
  const parts = value.split(/(`[^`]+`|https?:\/\/[^\s)]+)/gu).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded-micro bg-fill-quiet text-callout px-1 font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^https?:\/\//u.test(part)) {
      return (
        <a
          key={index}
          className="text-primary underline-offset-2 hover:underline"
          href={part}
          onClick={(event) => {
            event.preventDefault();
            void openExternal(part);
          }}
        >
          {part}
        </a>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

const PullRequestBody = ({ body }: { readonly body: string }) => {
  const blocks: ReactNode[] = [];
  const lines = body.replace(/\r\n/gu, "\n").split("\n");
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push(
        <pre key={`code-${index}`}>
          <code>{code.join("\n")}</code>
        </pre>
      );
      index += 1;
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/u.exec(line);
    if (heading) {
      const content = inlineMarkdown(heading[2] ?? "");
      blocks.push(
        heading[1]?.length === 2 ? (
          <h2 key={`heading-${index}`}>{content}</h2>
        ) : (
          <h3 key={`heading-${index}`}>{content}</h3>
        )
      );
      index += 1;
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/u.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/u.exec(line);
    if (bullet || ordered) {
      const items: ReactNode[] = [];
      const matcher = bullet ? /^\s*[-*]\s+(.+)$/u : /^\s*\d+[.)]\s+(.+)$/u;
      while (index < lines.length) {
        const match = matcher.exec(lines[index] ?? "");
        if (!match) {
          break;
        }
        items.push(
          <li key={`item-${index}`}>{inlineMarkdown(match[1] ?? "")}</li>
        );
        index += 1;
      }
      blocks.push(
        bullet ? (
          <ul key={`list-${index}`}>{items}</ul>
        ) : (
          <ol key={`list-${index}`}>{items}</ol>
        )
      );
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^(#{2,3})\s|^\s*[-*]\s|^\s*\d+[.)]\s|^```/u.test(lines[index] ?? "")
    ) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>
    );
  }
  return <div className="pull-request-body text-foreground/90">{blocks}</div>;
};

const PullRequestRow = ({
  item,
  selected,
  onSelect,
}: {
  readonly item: GitHubPullRequestSummary;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) => {
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
      leading={
        <span className="text-muted-foreground relative flex size-6 items-center justify-center">
          <GitPullRequest className="size-4" />
          <span
            className={cn(
              "absolute right-0 bottom-0 size-1.5 rounded-full",
              stateColor
            )}
          />
        </span>
      }
      meta={
        <span className="text-callout text-muted-foreground tabular-nums">
          {shortPullRequestAge(item.updatedAt)}
        </span>
      }
      description={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">
            {item.repository.nameWithOwner} #{item.number}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono">
            {item.author.login}
          </span>
        </span>
      }
    />
  );
};

export const PullRequestsPage = ({
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
  readonly headerLeadingAction?: ReactNode;
  readonly onChat: (detail: GitHubPullRequestDetail) => void;
  readonly tasks?: readonly BoardTask[];
  readonly activeTaskId?: string | null;
  readonly onLinkTask?: (
    detail: GitHubPullRequestDetail,
    target: PullRequestTaskLinkTarget | null
  ) => void;
  readonly onUnlinkTask?: (
    detail: GitHubPullRequestDetail,
    link: PullRequestTaskLinkTarget
  ) => void;
  readonly onOpenTask?: (id: string) => void;
  readonly loadPullRequests?: () => Promise<GitHubPullRequestSummary[]>;
  readonly loadPullRequest?: (
    summary: GitHubPullRequestSummary
  ) => Promise<GitHubPullRequestDetail>;
}) => {
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

  const reload = async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadPullRequests();
      if (request !== requestRef.current) {
        return;
      }
      setItems(next);
      setSelectedId((current) =>
        current && next.some((item) => item.id === current)
          ? current
          : (next[0]?.id ?? null)
      );
    } catch (reason) {
      if (request !== requestRef.current) {
        return;
      }
      setItems([]);
      setSelectedId(null);
      setError(String(reason));
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void reload();
    return () => {
      requestRef.current += 1;
    };
  }, [reload]);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  useEffect(() => {
    if (!selected) {
      setDetailState(null);
      return;
    }
    let isDisposed = false;
    const item = selected;
    setDetailState((current) => ({
      error: null,
      id: item.id,
      loading: true,
      value: current?.id === item.id ? current.value : null,
    }));
    void loadPullRequest(item)
      .then((value) => {
        if (!isDisposed) {
          setDetailState({ error: null, id: item.id, loading: false, value });
        }
      })
      .catch((reason) => {
        if (!isDisposed) {
          setDetailState({
            error: String(reason),
            id: item.id,
            loading: false,
            value: null,
          });
        }
      });
    return () => {
      isDisposed = true;
    };
  }, [loadPullRequest, selected]);

  const visible = filterPullRequests(items, view, readiness, deferredQuery);
  useEffect(() => {
    if (selectedId && visible.some((item) => item.id === selectedId)) {
      return;
    }
    setSelectedId(visible[0]?.id ?? null);
    setDetailTab("summary");
  }, [selectedId, visible]);
  const groups = groupPullRequests(visible, view);
  const detail = detailState?.id === selectedId ? detailState.value : null;
  const detailReference = detail ? githubPullRequestReference(detail) : null;
  const linkedTask = detailReference
    ? taskForPullRequest(tasks, detailReference)
    : null;
  const activeTask = activeTaskId
    ? (tasks.find((task) => task.id === activeTaskId) ?? null)
    : null;
  const linkTarget =
    !linkedTask && activeTask?.pullRequest === null ? activeTask : null;
  const checkState = detail ? pullRequestCheckState(detail) : "none";
  const groupLabel = (id: "review-requested" | "reviewed" | "authored") =>
    t(`pullRequests.group.${id}`);
  const readinessLabel = t(`pullRequests.filter.${readiness}`);

  return (
    <section
      data-compact-detail={selectedId !== null && !compactListVisible}
      className="pull-requests-page animate-data-page-in bg-background text-foreground flex min-h-0 min-w-0 flex-1"
      aria-label={t("pullRequests.title")}
    >
      <div className="pull-requests-list-pane bg-sidebar flex min-h-0 shrink-0 flex-col">
        <header
          data-pull-requests-list-header
          className={cn(
            "electrobun-webkit-app-region-drag h-layout-titlebar flex shrink-0 items-center gap-2 pr-3",
            headerLeadingAction
              ? "window-controls-safe-main"
              : "pl-page-section"
          )}
        >
          {headerLeadingAction ? (
            <div data-pull-requests-leading-action className="shrink-0">
              {headerLeadingAction}
            </div>
          ) : null}
          <h1 className="text-dialog shrink-0 font-semibold">
            {t("pullRequests.title")}
          </h1>
          <div className="electrobun-webkit-app-region-drag flex-1" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("pullRequests.refresh")}
                  onClick={() => void reload()}
                  disabled={loading}
                >
                  {loading ? <Spinner /> : <RefreshCw />}
                </Button>
              }
            />
            <TooltipContent>{t("pullRequests.refresh")}</TooltipContent>
          </Tooltip>
        </header>
        <div
          data-pull-requests-list-controls
          className="grid shrink-0 gap-2 px-4 pb-3"
        >
          <Tabs
            data-pull-requests-views
            value={view}
            onValueChange={(value) => setView(value as PullRequestView)}
            className="ms-module-inset min-w-0 gap-0"
          >
            <TabsList
              variant="toolbar"
              aria-label={t("pullRequests.views")}
              className="min-w-0 overflow-x-auto"
            >
              {(["all", "reviewing", "authored"] as const).map((id) => (
                <TabsTrigger key={id} value={id}>
                  {t(`pullRequests.view.${id}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div
            data-pull-requests-search-row
            className="flex min-w-0 items-center gap-2"
          >
            <div
              data-pull-requests-search
              className="ms-inline relative min-w-0 flex-1"
            >
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
              <Input
                size="compact"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                className="pl-8"
                placeholder={t("pullRequests.search")}
                aria-label={t("pullRequests.search")}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t("pullRequests.filterLabel")}: ${readinessLabel}`}
                  >
                    <SlidersHorizontal className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  {(["all", "ready", "draft"] as const).map((id) => (
                    <DropdownMenuItem key={id} onClick={() => setReadiness(id)}>
                      <Check
                        className={cn(
                          "size-3.5",
                          readiness !== id && "opacity-0"
                        )}
                      />
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
              <output className="text-body text-muted-foreground flex items-center justify-center gap-2 py-12">
                <ActivityOrb state="searching" visualSize={14} />
                {t("pullRequests.loading")}
              </output>
            ) : error ? (
              <div
                role="alert"
                className="text-body text-muted-foreground mx-1 flex flex-col items-center gap-3 py-12 text-center"
              >
                <CircleAlert className="text-destructive size-4" />
                <p className="max-w-72">{error}</p>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => void reload()}
                >
                  {t("pullRequests.retry")}
                </Button>
              </div>
            ) : groups.length === 0 ? (
              <Empty className="py-section">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <GitPullRequest />
                  </EmptyMedia>
                  <EmptyTitle>
                    {query || readiness !== "all"
                      ? t("pullRequests.noMatches")
                      : t("pullRequests.empty")}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              groups.map((group) => (
                <section key={group.id} className="pt-2">
                  <h2 className="text-callout text-muted-foreground px-3 pb-1 font-medium">
                    {groupLabel(group.id)}
                  </h2>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <PullRequestRow
                        key={item.id}
                        item={item}
                        selected={item.id === selectedId}
                        onSelect={() => {
                          setSelectedId(item.id);
                          setDetailTab("summary");
                          setCompactListVisible(false);
                        }}
                      />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="pull-request-detail-pane bg-background flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          data-pull-request-detail-header
          className={cn(
            "electrobun-webkit-app-region-drag h-layout-titlebar flex shrink-0 items-center gap-2 pr-4",
            headerLeadingAction ? "window-controls-safe-compact-main" : "pl-4"
          )}
        >
          {headerLeadingAction ? (
            <div
              data-pull-request-detail-leading-action
              className="window-controls-compact-leading-action shrink-0"
            >
              {headerLeadingAction}
            </div>
          ) : null}
          {selectedId ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className="pull-request-back"
              aria-label={t("pullRequests.backToList")}
              onClick={() => setCompactListVisible(true)}
            >
              <ArrowLeft className="size-3.5" />
            </Button>
          ) : null}
          <Tabs
            value={detailTab}
            onValueChange={(value) => setDetailTab(value as typeof detailTab)}
            className="gap-0"
          >
            <TabsList
              variant="toolbar"
              aria-label={t("pullRequests.detailViews")}
            >
              {(["summary", "code"] as const).map((id) => (
                <TabsTrigger key={id} value={id} disabled={!selected}>
                  {t(`pullRequests.detail.${id}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="electrobun-webkit-app-region-drag flex-1" />
          {detail ? (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("pullRequests.openGithub")}
                      onClick={() => void openExternal(detail.url)}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent>{t("pullRequests.openGithub")}</TooltipContent>
              </Tooltip>
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
                            onClick={() =>
                              onUnlinkTask(detail, {
                                id: linkedTask.id,
                                revision: linkedTask.pullRequestLinkRevision,
                              })
                            }
                          >
                            <X className="size-3.5" />
                          </Button>
                        }
                      />
                      <TooltipContent>
                        {t("pullRequests.unlinkTask")}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </>
              ) : onLinkTask ? (
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() =>
                    onLinkTask(
                      detail,
                      linkTarget
                        ? {
                            id: linkTarget.id,
                            revision: linkTarget.pullRequestLinkRevision,
                          }
                        : null
                    )
                  }
                >
                  <SquareKanban className="size-3.5" />
                  {linkTarget
                    ? t("pullRequests.linkTask")
                    : t("pullRequests.createTask")}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="compact"
                onClick={() => onChat(detail)}
              >
                <MessageCircle className="size-3.5" />
                {t("pullRequests.chat")}
              </Button>
            </>
          ) : null}
        </header>
        {!selected ? (
          <div className="text-body text-muted-foreground flex min-h-0 flex-1 items-center justify-center">
            {t("pullRequests.select")}
          </div>
        ) : detailState?.loading && !detail ? (
          <output className="text-body text-muted-foreground flex min-h-0 flex-1 items-center justify-center gap-2">
            <ActivityOrb state="searching" visualSize={14} />
            {t("pullRequests.loadingDetail")}
          </output>
        ) : detailState?.error ? (
          <div
            role="alert"
            className="text-body text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
          >
            <CircleAlert className="text-destructive size-4" />
            <p>{detailState.error}</p>
            <Button
              variant="secondary"
              size="compact"
              onClick={() => {
                const current = selected;
                setSelectedId(null);
                setTimeout(() => setSelectedId(current.id), 0);
              }}
            >
              {t("pullRequests.retry")}
            </Button>
          </div>
        ) : detail ? (
          <ScrollArea className="min-h-0 flex-1">
            {detailTab === "summary" ? (
              <article className="mx-auto w-full max-w-5xl px-8 pt-5 pb-12">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h1 className="text-page text-foreground font-semibold">
                      {detail.title}
                    </h1>
                    <div className="text-body text-muted-foreground mt-2 flex items-center gap-2">
                      {avatar(detail.author.login)}
                      <span>{detail.author.login}</span>
                      <span>·</span>
                      <span>{shortPullRequestAge(detail.createdAt)}</span>
                      <span>·</span>
                      <span>
                        {detail.repository.nameWithOwner} #{detail.number}
                      </span>
                    </div>
                  </div>
                  {detailState?.loading ? (
                    <ActivityOrb state="searching" visualSize={14} />
                  ) : null}
                </div>
                <div className="mt-8 grid gap-4">
                  <DetailMetric
                    icon={<GitBranch className="size-3.5" />}
                    label={t("pullRequests.branch")}
                  >
                    <span className="text-callout font-mono">
                      {detail.headRefName}
                    </span>
                    <ChevronDown className="text-muted-foreground mx-2 inline size-3 -rotate-90" />
                    <span className="text-callout font-mono">
                      {detail.baseRefName}
                    </span>
                    <span className="text-success ml-3">
                      +{detail.additions.toLocaleString()}
                    </span>
                    <span className="text-destructive ml-2">
                      −{detail.deletions.toLocaleString()}
                    </span>
                  </DetailMetric>
                  <DetailMetric
                    icon={<UserRound className="size-3.5" />}
                    label={t("pullRequests.reviewers")}
                  >
                    {detail.reviewers.length
                      ? detail.reviewers
                          .map(
                            (reviewer) =>
                              `${reviewer.login} · ${reviewer.state.toLocaleLowerCase().replaceAll("_", " ")}`
                          )
                          .join(", ")
                      : t("pullRequests.noReviewers")}
                  </DetailMetric>
                  <DetailMetric
                    icon={<MessageCircle className="size-3.5" />}
                    label={t("pullRequests.comments")}
                  >
                    {detail.commentsCount === 0
                      ? t("pullRequests.noComments")
                      : t("pullRequests.commentCount", {
                          count: detail.commentsCount,
                        })}
                  </DetailMetric>
                  <DetailMetric
                    icon={
                      checkState === "passed" ? (
                        <Check className="text-success size-3.5" />
                      ) : checkState === "failed" ? (
                        <CircleAlert className="text-destructive size-3.5" />
                      ) : (
                        <Clock3 className="size-3.5" />
                      )
                    }
                    label={t("pullRequests.checks")}
                  >
                    {checkState === "none"
                      ? t("pullRequests.noChecks")
                      : checkState === "passed"
                        ? t("pullRequests.checksPassed", {
                            count: detail.checks.length,
                          })
                        : checkState === "failed"
                          ? t("pullRequests.checksFailed", {
                              count:
                                detail.checks.filter(
                                  (check) => check.conclusion === "FAILURE"
                                ).length || 1,
                            })
                          : t("pullRequests.checksPending", {
                              count: detail.checks.length,
                            })}
                  </DetailMetric>
                  <DetailMetric
                    icon={<GitPullRequest className="size-3.5" />}
                    label={t("pullRequests.status")}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <CircleDot
                        className={cn(
                          "size-3.5",
                          detail.isDraft
                            ? "text-muted-foreground"
                            : "text-success"
                        )}
                      />
                      {detail.isDraft
                        ? t("pullRequests.draft")
                        : detail.state.toLocaleLowerCase()}
                    </span>
                  </DetailMetric>
                </div>
                <section className="mt-8">
                  <h2 className="text-dialog mb-5 flex items-center gap-1.5 font-semibold">
                    <span>{t("pullRequests.description")}</span>
                    <ChevronDown className="text-muted-foreground size-3.5" />
                  </h2>
                  {detail.body.trim() ? (
                    <PullRequestBody body={detail.body} />
                  ) : (
                    <p className="text-body text-muted-foreground">
                      {t("pullRequests.noDescription")}
                    </p>
                  )}
                </section>
              </article>
            ) : (
              <div className="mx-auto w-full max-w-5xl px-6 pt-5 pb-10">
                <div className="mb-4 flex items-center gap-2">
                  <Code2 className="text-muted-foreground size-4" />
                  <h1 className="text-section font-semibold">
                    {t("pullRequests.changedFiles", {
                      count: detail.changedFiles,
                    })}
                  </h1>
                </div>
                <div className="flex flex-col gap-1">
                  {detail.files.map((file) => (
                    <div
                      key={file.path}
                      className="min-h-control-field rounded-control bg-fill-quiet text-body grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FileCode2 className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="text-callout truncate font-mono">
                          {file.path}
                        </span>
                      </span>
                      <span className="text-success tabular-nums">
                        +{file.additions}
                      </span>
                      <span className="text-destructive tabular-nums">
                        −{file.deletions}
                      </span>
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
};
