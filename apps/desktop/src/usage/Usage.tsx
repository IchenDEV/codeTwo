import { useEffect, useRef, useState } from "react";

import { QuotaProgress } from "@/components/business/quota-progress";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CircleAlert, RefreshCw } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { TooltipButton } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { providerQuota, usageHistory, usageReport } from "../bridge";
import type {
  ProviderQuotaReason,
  ProviderQuotaReport,
  ProviderQuotaWindow,
  SourceUsage,
  UsageHistoryReport,
  UsageReport,
  UsageWindow,
} from "../bridge";
import { useLanguage } from "../i18n";
import type { Translate } from "../i18n";
import { useLatestRef } from "../lib/useLatestRef";
import { ProviderIcon } from "../providers/ProviderIcon";
import {
  fmtCost,
  fmtReset,
  fmtTokens,
  seriesColorClass,
  stackHistory,
} from "./usageMath";

/**
Backend window labels are stable wire values; map them onto i18n keys for display.
*/
const windowLabelKeys = {
  "5h session": "usage.window5h",
  month: "usage.windowMonth",
  week: "usage.windowWeek",
} as const;

const chartW = 672;
const chartH = 96;

function quotaWindowLabel(minutes: number | null, t: Translate): string {
  if (minutes === 300) {
    return t("quota.window5h");
  }
  if (minutes === 10_080) {
    return t("quota.windowWeekly");
  }
  if (
    minutes !== null &&
    minutes !== undefined &&
    minutes >= 43_000 &&
    minutes <= 45_000
  ) {
    return t("quota.windowMonthly");
  }
  if (minutes === null || minutes === undefined) {
    return t("quota.windowUnknown");
  }
  if (minutes % 1_440 === 0) {
    return t("quota.windowDays", { count: minutes / 1_440 });
  }
  if (minutes % 60 === 0) {
    return t("quota.windowHours", { count: minutes / 60 });
  }
  return t("quota.windowMinutes", { count: minutes });
}

function compactDuration(milliseconds: number): string {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

function quotaResetLabel(
  resetsAt: number | null,
  locale: string,
  now: number,
  t: Translate
): string {
  if (resetsAt === null || resetsAt === undefined) {
    return t("quota.resetUnknown");
  }
  const resetMs = resetsAt * 1_000;
  if (resetMs <= now) {
    return t("quota.resetting");
  }
  const absolute = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    weekday: "short",
  }).format(resetMs);
  return t("quota.resetsIn", {
    duration: compactDuration(resetMs - now),
    time: absolute,
  });
}

function quotaReasonLabel(
  reason: ProviderQuotaReason | null,
  providerName: string,
  t: Translate
): string {
  switch (reason) {
    case "cli_not_found": {
      return t("quota.cliNotFound", { provider: providerName });
    }
    case "query_failed": {
      return t("quota.queryFailed", { provider: providerName });
    }
    default: {
      return t("quota.unsupported", { provider: providerName });
    }
  }
}

export function ProviderQuotaMeter({
  window,
  now,
}: {
  readonly window: ProviderQuotaWindow;
  readonly now: number;
}) {
  const { t, locale } = useLanguage();
  const used = Math.min(100, Math.max(0, window.used_percent));
  const remaining = Math.max(0, 100 - used);
  const label = quotaWindowLabel(window.window_minutes, t);

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body font-semibold">{label}</span>
        <span className="text-body shrink-0 font-mono font-semibold tabular-nums">
          {t("quota.remaining", { percent: Math.round(remaining) })}
        </span>
      </div>
      <div className="my-2">
        <QuotaProgress
          label={t("quota.remainingLabel", { window: label })}
          remainingPercent={remaining}
        />
      </div>
      <div className="text-callout text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span>{t("quota.used", { percent: Math.round(used) })}</span>
        <span className="font-mono tabular-nums">
          {quotaResetLabel(window.resets_at, locale, now, t)}
        </span>
      </div>
    </div>
  );
}

function LocalUsageWindow({ window }: { readonly window: UsageWindow }) {
  const { t } = useLanguage();
  const label = t(
    windowLabelKeys[window.label as keyof typeof windowLabelKeys] ??
      "usage.window5h"
  );
  const hasLimit =
    window.limit !== null &&
    window.limit !== undefined &&
    window.fraction !== null &&
    window.fraction !== undefined;
  const remainingPercent = hasLimit
    ? Math.max(0, 100 - window.fraction! * 100)
    : null;
  const remainingTokens = hasLimit
    ? Math.max(0, window.limit! - window.total_tokens)
    : null;

  return (
    <div>
      <div className="text-body flex items-baseline justify-between gap-3">
        <span className="font-semibold">{label}</span>
        <span className="text-metadata text-muted-foreground text-right font-mono">
          {hasLimit
            ? t("usage.localRemaining", {
                percent: Math.round(remainingPercent!),
                tokens: fmtTokens(remainingTokens!),
              })
            : t("usage.localUsed", { tokens: fmtTokens(window.total_tokens) })}
        </span>
      </div>
      {hasLimit ? (
        <div className="my-1.5">
          <QuotaProgress
            label={t("usage.localRemainingLabel", { window: label })}
            remainingPercent={remainingPercent!}
          />
        </div>
      ) : (
        <p className="text-callout text-muted-foreground my-1">
          {t("usage.localLimitUnknown")}
        </p>
      )}
      <div className="text-callout text-muted-foreground font-mono">
        {t("usage.windowDetail", {
          input: fmtTokens(window.input_tokens),
          output: fmtTokens(window.output_tokens),
          reset: fmtReset(window.resets_in_secs),
        })}
        {window.cached_tokens > 0 && (
          <>
            {" "}
            ·{" "}
            {t("usage.windowCache", {
              cached: fmtTokens(window.cached_tokens),
            })}
          </>
        )}
      </div>
    </div>
  );
}

function TrendChart({
  report,
  days,
}: {
  readonly report: UsageHistoryReport;
  readonly days: number;
}) {
  const { t, locale } = useLanguage();
  const [hover, setHover] = useState<number | null>(null);
  const { buckets, max } = stackHistory(report.history);

  const timeFmt = new Intl.DateTimeFormat(
    locale,
    days <= 7
      ? { day: "numeric", hour: "2-digit", month: "short" }
      : { day: "numeric", month: "short" }
  );
  const dayFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });

  if (buckets.length === 0 || max === 0) {
    return (
      <p className="text-metadata text-muted-foreground">
        {t("usage.trendEmpty")}
      </p>
    );
  }

  const slot = chartW / buckets.length;
  const gap = days <= 7 ? 1 : 2;
  const barW = Math.max(1, slot - gap);
  const scale = (value: number) => (value / max) * (chartH - 2);
  const hovered = hover !== null && hover !== undefined ? buckets[hover] : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-callout text-muted-foreground font-mono">
          {fmtTokens(max)}
        </span>
        {hovered && hovered.total > 0 ? (
          <span className="text-callout text-muted-foreground font-mono">
            {timeFmt.format(hovered.startMs)} · {fmtTokens(hovered.total)}
          </span>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="block h-24 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={t("usage.trendTitle")}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={chartW}
            y1={chartH * f}
            y2={chartH * f}
            className="stroke-fill-rest"
            strokeWidth={1}
          />
        ))}
        {buckets.map((bucket, i) => {
          let y = chartH;
          return (
            <g
              key={bucket.startMs}
              opacity={
                hover === null || hover === undefined || hover === i ? 1 : 0.45
              }
            >
              {bucket.parts.map((part) => {
                const h = Math.max(1, scale(part.value) - 1);
                y -= h + 1;
                return (
                  <rect
                    key={part.source}
                    x={i * slot}
                    y={y + 1}
                    width={barW}
                    height={h}
                    className={seriesColorClass(part.source)}
                    fill="currentColor"
                  />
                );
              })}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      <div className="text-callout text-muted-foreground mt-1 flex justify-between">
        <span>{dayFmt.format(buckets[0].startMs)}</span>
        <span>{dayFmt.format(buckets[buckets.length - 1].startMs)}</span>
      </div>
      {hovered && hovered.parts.length > 0 ? (
        <div
          className="rounded-micro bg-raised text-callout text-content shadow-raised pointer-events-none absolute top-6 z-10 p-2"
          style={{
            left: `${Math.min(80, ((hover! + 0.5) / buckets.length) * 100)}%`,
          }}
        >
          {hovered.parts.map((part) => (
            <div key={part.source} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full bg-current",
                  seriesColorClass(part.source)
                )}
              />
              <span>{part.source}</span>
              <span className="ml-auto pl-2 font-mono">
                {fmtTokens(part.value)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProviderRow({
  usage,
  t,
}: {
  readonly usage: SourceUsage;
  readonly t: ReturnType<typeof useLanguage>["t"];
}) {
  const cost = fmtCost(usage.estimated_cost_usd);
  return (
    <div>
      <div className="text-body flex items-center gap-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full bg-current",
            seriesColorClass(usage.source)
          )}
        />
        <span className="font-semibold">{usage.source}</span>
        <span className="text-metadata text-muted-foreground ml-auto font-mono">
          {fmtTokens(usage.total_tokens)}
        </span>
        <span
          className={cn(
            "text-metadata w-20 text-right font-mono",
            cost != null && cost !== "" ? "" : "text-muted-foreground"
          )}
        >
          {cost ?? t("usage.costUnknown")}
        </span>
      </div>
      <div className="text-callout text-muted-foreground pl-4 font-mono">
        {t("usage.tokensDetail", {
          cached: fmtTokens(usage.cached_tokens),
          input: fmtTokens(usage.input_tokens),
          output: fmtTokens(usage.output_tokens),
        })}
        {cost !== null && cost !== undefined && usage.unpriced_tokens > 0 && (
          <>
            {" "}
            ·{" "}
            {t("usage.unpricedNote", {
              tokens: fmtTokens(usage.unpriced_tokens),
            })}
          </>
        )}
      </div>
    </div>
  );
}

function ProviderQuotaSection({
  provider,
  providerName,
  providers,
  onProvider,
  report,
  loading,
  requestFailed,
}: {
  readonly provider: string;
  readonly providerName: string;
  readonly providers: readonly QuotaProviderOption[];
  readonly onProvider: (provider: string) => void;
  readonly report: ProviderQuotaReport | null;
  readonly loading: boolean;
  readonly requestFailed: boolean;
}) {
  const { t, locale } = useLanguage();
  const isUnavailable =
    requestFailed ||
    (report !== null && report !== undefined && report.status !== "available");
  const unavailableReason = requestFailed
    ? "query_failed"
    : (report?.reason ?? null);
  const credits = report?.credits;
  const isShowCredits =
    credits !== null &&
    credits !== undefined &&
    (credits.has_credits || credits.unlimited);
  let source: string | null = null;
  if (report?.status === "available") {
    source =
      report.source === "codex_app_server"
        ? t("quota.sourceCodex")
        : report.source;
  }

  return (
    <section aria-labelledby="provider-quota-heading" className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <ProviderIcon provider={provider} className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2
            id="provider-quota-heading"
            className="text-body truncate font-semibold"
          >
            {t("quota.title")}
          </h2>
          {report?.plan != null && report?.plan !== "" ? (
            <p className="text-callout text-muted-foreground truncate">
              {t("quota.plan", { plan: report.plan.replaceAll("_", " ") })}
            </p>
          ) : null}
        </div>
        {providers.length > 1 ? (
          <Select
            value={provider}
            onValueChange={(value) => {
              if (value != null && value !== "") {
                onProvider(value);
              }
            }}
          >
            <SelectTrigger
              data-quota-provider-select
              aria-label={t("quota.providerSelect")}
              size="sm"
              className="ml-auto w-48 max-w-full justify-between"
            >
              <SelectValue>{providerName}</SelectValue>
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectGroup>
                {providers.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <ProviderIcon
                      provider={option.id}
                      className="size-4 opacity-80"
                    />
                    <span>{option.name}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : (
          <span className="text-callout text-muted-foreground ml-auto shrink-0">
            {providerName}
          </span>
        )}
      </div>

      {loading && (report === null || report === undefined) ? (
        <p className="text-metadata text-muted-foreground py-4 text-center">
          {t("quota.checking", { provider: providerName })}
        </p>
      ) : isUnavailable ? (
        <div className="bg-fill-quiet/40 flex gap-2 px-3 py-3">
          <CircleAlert
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <div>
            <p className="text-body font-medium">
              {report?.status === "unsupported"
                ? t("quota.unsupportedTitle")
                : t("quota.unavailableTitle")}
            </p>
            <p className="text-metadata text-muted-foreground mt-1">
              {quotaReasonLabel(unavailableReason, providerName, t)}
            </p>
          </div>
        </div>
      ) : report ? (
        <div className="py-3">
          {report.windows.length > 0 ? (
            <div className="divide-y">
              {report.windows.map((window, index) => (
                <ProviderQuotaMeter
                  key={`${window.window_minutes ?? "unknown"}-${index}`}
                  window={window}
                  now={Date.now()}
                />
              ))}
            </div>
          ) : (
            <p className="text-metadata text-muted-foreground">
              {t("quota.noWindows")}
            </p>
          )}

          {isShowCredits && credits != null ? (
            <div className="mt-3 flex items-center gap-3 pt-3">
              <span className="text-body font-medium">
                {t("quota.credits")}
              </span>
              <span className="text-body ml-auto font-mono tabular-nums">
                {credits.unlimited
                  ? t("quota.unlimited")
                  : t("quota.creditBalance", {
                      balance: credits.balance ?? "—",
                    })}
              </span>
            </div>
          ) : null}

          <p className="text-callout text-muted-foreground mt-3 pt-3">
            {source != null && source !== "" ? <>{source} · </> : null}
            {t("quota.updated", {
              time: new Intl.DateTimeFormat(locale, {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              }).format(report.fetched_at_ms),
            })}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export interface QuotaProviderOption {
  id: string;
  name: string;
}

export function quotaProviderFor(
  currentProvider: string,
  selectedProvider: string | null
): string {
  return selectedProvider ?? currentProvider;
}

export function quotaProviderOptions(
  currentProvider: string,
  currentProviderName: string,
  providerNames: Record<string, string>
): QuotaProviderOption[] {
  const options: QuotaProviderOption[] = [];
  const seen = new Set<string>();
  const append = (id: string, name: string) => {
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    options.push({ id, name });
  };

  append(currentProvider, currentProviderName);
  for (const [id, name] of Object.entries(providerNames)) {
    append(id, name);
  }
  return options;
}

function UsageView({
  variant,
  provider,
  providerName,
  providerNames,
}: {
  readonly variant: "panel" | "dialog";
  readonly provider: string;
  readonly providerName: string;
  readonly providerNames: Record<string, string>;
}) {
  const { t } = useLanguage();
  const [report, setReport] = useState<UsageReport | null>(null);
  const [history, setHistory] = useState<UsageHistoryReport | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<ProviderQuotaReport | null>(null);
  const [quotaLoading, setQuotaLoading] = useState(true);
  const [quotaFailed, setQuotaFailed] = useState(false);
  const [selectedQuotaProvider, setSelectedQuotaProvider] = useState<
    string | null
  >(null);
  const quotaRequestRef = useRef(0);
  const quotaProvider = quotaProviderFor(provider, selectedQuotaProvider);
  const quotaProviderName =
    providerNames[quotaProvider] ??
    (quotaProvider === provider ? providerName : quotaProvider);
  const quotaProviders = quotaProviderOptions(
    provider,
    providerName,
    providerNames
  );

  const loadLocal = (range: 7 | 30) => {
    setLoading(true);
    void Promise.all([usageReport(), usageHistory(range)])
      .then(([r, h]) => {
        setReport(r);
        setHistory(h);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadQuota = async () => {
    const request = ++quotaRequestRef.current;
    setQuotaLoading(true);
    setQuotaFailed(false);
    try {
      const next = await providerQuota(quotaProvider);
      if (request === quotaRequestRef.current) {
        setQuota(next);
      }
    } catch {
      if (request === quotaRequestRef.current) {
        setQuota(null);
        setQuotaFailed(true);
      }
    } finally {
      if (request === quotaRequestRef.current) {
        setQuotaLoading(false);
      }
    }
  };
  const loadLocalRef = useLatestRef(loadLocal);
  const loadQuotaRef = useLatestRef(loadQuota);

  useEffect(() => {
    loadLocalRef.current(days);
  }, [days, loadLocalRef]);
  useEffect(() => {
    setQuota(null);
    void loadQuotaRef.current();
    return () => {
      quotaRequestRef.current += 1;
    };
  }, [quotaProvider, loadQuotaRef]);

  const bySource = history?.by_source ?? [];
  const isRefreshing = loading || quotaLoading;
  const controls = (
    <>
      <TooltipButton
        label={t("usage.rescan")}
        variant="ghost"
        size="icon-xs"
        disabled={isRefreshing}
        onClick={() => {
          loadLocal(days);
          void loadQuota();
        }}
      >
        {isRefreshing ? <Spinner /> : <RefreshCw />}
      </TooltipButton>
      <span className="ml-auto flex gap-1">
        {([7, 30] as const).map((range) => (
          <Button
            key={range}
            variant={days === range ? "secondary" : "ghost"}
            size="compact"
            className="text-callout px-2"
            onClick={() => setDays(range)}
          >
            {t(range === 7 ? "usage.range7d" : "usage.range30d")}
          </Button>
        ))}
      </span>
    </>
  );

  return (
    <>
      {variant === "dialog" ? (
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("usage.title")}
            {controls}
          </DialogTitle>
        </DialogHeader>
      ) : (
        <div className="pb-3">
          <div className="flex items-center gap-2">
            <h1 className="text-page font-semibold tracking-tight">
              {t("usage.title")}
            </h1>
            {controls}
          </div>
          <p className="text-metadata text-muted-foreground pt-1.5">
            {t("usage.description")}
          </p>
        </div>
      )}

      <ProviderQuotaSection
        provider={quotaProvider}
        providerName={quotaProviderName}
        providers={quotaProviders}
        onProvider={setSelectedQuotaProvider}
        report={quota}
        loading={quotaLoading}
        requestFailed={quotaFailed}
      />

      {loading && !report ? (
        <p className="text-metadata text-muted-foreground mt-5">
          {t("usage.scanning")}
        </p>
      ) : null}

      {report ? (
        <section
          aria-labelledby="local-activity-heading"
          className="mt-5 space-y-4"
        >
          <div>
            <h2 id="local-activity-heading" className="text-body font-semibold">
              {t("usage.localTitle")}
            </h2>
            <p className="text-callout text-muted-foreground mt-1">
              {t("usage.localDescription")}
            </p>
          </div>
          <div className="space-y-3">
            {report.windows.map((w) => (
              <LocalUsageWindow key={w.label} window={w} />
            ))}
          </div>

          {history ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-body font-semibold">
                  {t("usage.trendTitle")}
                </span>
                <span className="flex items-center gap-3">
                  {history.history.series.map((s) => (
                    <span
                      key={s.source}
                      className="text-callout text-muted-foreground flex items-center gap-1"
                    >
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full bg-current",
                          seriesColorClass(s.source)
                        )}
                      />
                      {s.source}
                    </span>
                  ))}
                </span>
              </div>
              <TrendChart report={history} days={days} />
            </div>
          ) : null}

          {bySource.length === 0 ? (
            <p className="text-metadata text-muted-foreground">
              {t("usage.noTranscripts")}
            </p>
          ) : (
            <div className="space-y-2">
              {bySource.map((usage) => (
                <ProviderRow key={usage.source} usage={usage} t={t} />
              ))}
            </div>
          )}

          <p className="text-callout text-muted-foreground">
            {t("usage.scannedTranscripts", { count: report.transcripts })}{" "}
            {t("usage.estimateNote")}
          </p>
        </section>
      ) : null}
    </>
  );
}

export function UsagePanel({
  provider,
  providerName,
  providerNames = {},
}: {
  readonly provider: string;
  readonly providerName: string;
  readonly providerNames?: Record<string, string>;
}) {
  return (
    <UsageView
      variant="panel"
      provider={provider}
      providerName={providerName}
      providerNames={providerNames}
    />
  );
}

export function UsageModal({
  provider,
  providerName,
  providerNames = {},
  onClose,
}: {
  readonly provider: string;
  readonly providerName: string;
  readonly providerNames?: Record<string, string>;
  readonly onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <UsageView
          variant="dialog"
          provider={provider}
          providerName={providerName}
          providerNames={providerNames}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("usage.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
