import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  usageHistory,
  usageReport,
  type SourceUsage,
  type UsageHistoryReport,
  type UsageReport,
} from "../bridge";
import { useLanguage } from "../i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fmtCost, fmtReset, fmtTokens, seriesColor, stackHistory } from "./usageMath";

/** Backend window labels are stable wire values; map them onto i18n keys for display. */
const WINDOW_LABEL_KEYS = {
  "5h session": "usage.window5h",
  week: "usage.windowWeek",
  month: "usage.windowMonth",
} as const;

const CHART_W = 672;
const CHART_H = 96;

function TrendChart({ report, days }: { report: UsageHistoryReport; days: number }) {
  const { t, locale } = useLanguage();
  const [hover, setHover] = useState<number | null>(null);
  const { buckets, max } = useMemo(() => stackHistory(report.history), [report]);

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale,
        days <= 7
          ? { month: "short", day: "numeric", hour: "2-digit" }
          : { month: "short", day: "numeric" },
      ),
    [locale, days],
  );
  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
    [locale],
  );

  if (buckets.length === 0 || max === 0) {
    return <p className="text-hint text-muted-foreground">{t("usage.trendEmpty")}</p>;
  }

  const slot = CHART_W / buckets.length;
  const gap = days <= 7 ? 1 : 2;
  const barW = Math.max(1, slot - gap);
  const scale = (value: number) => (value / max) * (CHART_H - 2);
  const hovered = hover != null ? buckets[hover] : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-fine text-muted-foreground">{fmtTokens(max)}</span>
        {hovered && hovered.total > 0 && (
          <span className="font-mono text-fine text-muted-foreground">
            {timeFmt.format(hovered.startMs)} · {fmtTokens(hovered.total)}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="block h-24 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={t("usage.trendTitle")}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={CHART_W}
            y1={CHART_H * f}
            y2={CHART_H * f}
            stroke="var(--ds-color-fill-rest)"
            strokeWidth={1}
          />
        ))}
        {buckets.map((bucket, i) => {
          let y = CHART_H;
          return (
            <g key={bucket.startMs} opacity={hover == null || hover === i ? 1 : 0.45}>
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
                    fill={seriesColor(part.source)}
                  />
                );
              })}
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={CHART_H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-fine text-muted-foreground">
        <span>{dayFmt.format(buckets[0].startMs)}</span>
        <span>{dayFmt.format(buckets[buckets.length - 1].startMs)}</span>
      </div>
      {hovered && hovered.parts.length > 0 && (
        <div
          className="pointer-events-none absolute top-6 z-10 rounded-(--ds-radius-micro) bg-popover p-2 text-fine text-popover-foreground shadow-(--ds-elevation-raised) ring-1 ring-foreground/10"
          style={{
            left: `${Math.min(80, ((hover! + 0.5) / buckets.length) * 100)}%`,
          }}
        >
          {hovered.parts.map((part) => (
            <div key={part.source} className="flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: seriesColor(part.source) }}
              />
              <span>{part.source}</span>
              <span className="ml-auto pl-2 font-mono">{fmtTokens(part.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderRow({ usage, t }: { usage: SourceUsage; t: ReturnType<typeof useLanguage>["t"] }) {
  const cost = fmtCost(usage.estimated_cost_usd);
  return (
    <div>
      <div className="flex items-center gap-2 text-ui">
        <span className="size-2 shrink-0 rounded-full" style={{ background: seriesColor(usage.source) }} />
        <span className="font-semibold">{usage.source}</span>
        <span className="ml-auto font-mono text-hint text-muted-foreground">
          {fmtTokens(usage.total_tokens)}
        </span>
        <span className={cn("w-20 text-right font-mono text-hint", cost ? "" : "text-muted-foreground")}>
          {cost ?? t("usage.costUnknown")}
        </span>
      </div>
      <div className="pl-4 font-mono text-fine text-muted-foreground">
        {t("usage.tokensDetail", {
          input: fmtTokens(usage.input_tokens),
          output: fmtTokens(usage.output_tokens),
          cached: fmtTokens(usage.cached_tokens),
        })}
        {cost != null && usage.unpriced_tokens > 0 && (
          <> · {t("usage.unpricedNote", { tokens: fmtTokens(usage.unpriced_tokens) })}</>
        )}
      </div>
    </div>
  );
}

/** Rolling windows, provider trend, and local cost estimates shared by the settings page and modal. */
function UsageView({ variant }: { variant: "panel" | "dialog" }) {
  const { t } = useLanguage();
  const [report, setReport] = useState<UsageReport | null>(null);
  const [history, setHistory] = useState<UsageHistoryReport | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);

  const load = (range: 7 | 30) => {
    setLoading(true);
    Promise.all([usageReport(), usageHistory(range)])
      .then(([r, h]) => {
        setReport(r);
        setHistory(h);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => load(days), [days]);

  const bySource = history?.by_source ?? [];
  const controls = (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => load(days)}
        title={t("usage.rescan")}
      >
        <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
      </Button>
      <span className="ml-auto flex gap-1">
        {([7, 30] as const).map((range) => (
          <Button
            key={range}
            variant={days === range ? "secondary" : "ghost"}
            size="compact"
            className="px-2 text-fine"
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
            <h1 className="text-display font-semibold tracking-tight">{t("usage.title")}</h1>
            {controls}
          </div>
          <p className="pt-1.5 text-hint leading-relaxed text-muted-foreground">
            {t("usage.description")}
          </p>
        </div>
      )}

      {loading && !report && (
        <p className="text-hint text-muted-foreground">{t("usage.scanning")}</p>
      )}

      {report && (
        <div className="space-y-4">
          <div className="space-y-3">
            {report.windows.map((w) => (
              <div key={w.label}>
                <div className="flex items-baseline justify-between text-ui">
                  <span className="font-semibold">
                    {t(WINDOW_LABEL_KEYS[w.label as keyof typeof WINDOW_LABEL_KEYS] ?? "usage.window5h")}
                  </span>
                  <span className="font-mono text-hint text-muted-foreground">
                    {fmtTokens(w.total_tokens)}
                    {w.limit != null && ` / ${fmtTokens(w.limit)}`}
                    {w.fraction != null && ` · ${Math.round(w.fraction * 100)}%`}
                  </span>
                </div>
                <div className="my-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full bg-primary transition-all",
                      w.fraction != null && w.fraction >= 0.8 && "bg-warning",
                    )}
                    style={{
                      width:
                        w.fraction != null
                          ? `${Math.min(100, w.fraction * 100)}%`
                          : w.total_tokens > 0
                            ? "100%"
                            : "0%",
                      opacity: w.fraction != null ? 1 : 0.35,
                    }}
                  />
                </div>
                <div className="font-mono text-fine text-muted-foreground">
                  {t("usage.windowDetail", {
                    input: fmtTokens(w.input_tokens),
                    output: fmtTokens(w.output_tokens),
                    reset: fmtReset(w.resets_in_secs),
                  })}
                  {w.cached_tokens > 0 && (
                    <> · {t("usage.windowCache", { cached: fmtTokens(w.cached_tokens) })}</>
                  )}
                </div>
              </div>
            ))}
          </div>

          {history && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-ui font-semibold">{t("usage.trendTitle")}</span>
                <span className="flex items-center gap-3">
                  {history.history.series.map((s) => (
                    <span key={s.source} className="flex items-center gap-1 text-fine text-muted-foreground">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: seriesColor(s.source) }}
                      />
                      {s.source}
                    </span>
                  ))}
                </span>
              </div>
              <TrendChart report={history} days={days} />
            </div>
          )}

          {bySource.length === 0 ? (
            <p className="text-hint text-muted-foreground">{t("usage.noTranscripts")}</p>
          ) : (
            <div className="space-y-2">
              {bySource.map((usage) => (
                <ProviderRow key={usage.source} usage={usage} t={t} />
              ))}
            </div>
          )}

          <p className="text-fine text-muted-foreground">
            {t("usage.scannedTranscripts", { count: report.transcripts })} {t("usage.estimateNote")}
          </p>
        </div>
      )}
    </>
  );
}

/** Usage as a first-class settings page. */
export function UsagePanel() {
  return <UsageView variant="panel" />;
}

/** Usage as a quick-access modal from the environment menu and command palette. */
export function UsageModal({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <UsageView variant="dialog" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("usage.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
