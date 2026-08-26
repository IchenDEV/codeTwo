import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Lock, Pencil, Share2, UserRound } from "@/components/ui/icons";

import {
  usageHistory,
  usageReport,
  type SourceUsage,
  type UsageHistoryReport,
  type UsageReport,
} from "../bridge";
import { useLanguage } from "../i18n";
import { ProviderIcon } from "../providers/ProviderIcon";
import { fmtTokens, stackHistory, type StackedBucket } from "../usage/usageMath";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STORAGE_KEY = "codetwo.profile";
const ACTIVITY_DAYS = 90;

export interface ProfileActivitySummary {
  totalTokens: number;
  peakTokens: number;
  activeDays: number;
  currentStreak: number;
  transcripts: number;
  buckets: StackedBucket[];
  providers: SourceUsage[];
}

export function summarizeProfileActivity(
  report: UsageReport,
  history: UsageHistoryReport,
): ProfileActivitySummary {
  const buckets = stackHistory(history.history).buckets;
  const totals = buckets.map((bucket) => bucket.total);
  let currentStreak = 0;
  for (let index = totals.length - 1; index >= 0 && totals[index] > 0; index -= 1) {
    currentStreak += 1;
  }

  return {
    totalTokens: totals.reduce((sum, total) => sum + total, 0),
    peakTokens: Math.max(0, ...totals),
    activeDays: totals.filter((total) => total > 0).length,
    currentStreak,
    transcripts: report.transcripts,
    buckets,
    providers: [...history.by_source].sort((left, right) => right.total_tokens - left.total_tokens),
  };
}

interface ProfileSnapshot {
  name: string;
  handle: string;
  bio: string;
}

const EMPTY_PROFILE: ProfileSnapshot = { name: "", handle: "", bio: "" };

function loadProfile(): ProfileSnapshot {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ProfileSnapshot> | null;
    return {
      name: typeof parsed?.name === "string" ? parsed.name : "",
      handle: typeof parsed?.handle === "string" ? parsed.handle : "",
      bio: typeof parsed?.bio === "string" ? parsed.bio : "",
    };
  } catch {
    return EMPTY_PROFILE;
  }
}

function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase();
  return Array.from(words[0] ?? "C2").slice(0, 2).join("").toUpperCase();
}

async function shareProfile(title: string, text: string): Promise<"shared" | "copied" | "cancelled"> {
  const share = (navigator as Navigator & {
    share?: (data: { title: string; text: string }) => Promise<void>;
  }).share;

  if (share) {
    try {
      await share.call(navigator, { title, text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
  await navigator.clipboard.writeText(text);
  return "copied";
}

export function ProfileSettings({
  providerNames = {},
  reportLoader = usageReport,
  historyLoader = usageHistory,
  share = shareProfile,
}: {
  providerNames?: Record<string, string>;
  reportLoader?: () => Promise<UsageReport>;
  historyLoader?: (days: number) => Promise<UsageHistoryReport>;
  share?: (title: string, text: string) => Promise<"shared" | "copied" | "cancelled">;
}) {
  const { t, locale } = useLanguage();
  const [profile, setProfile] = useState(loadProfile);
  const [draft, setDraft] = useState(profile);
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState<ProfileActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);

  const displayName = profile.name.trim() || t("profile.defaultName");
  const handle = profile.handle.trim().replace(/^@+/, "");
  const bio = profile.bio.trim() || t("profile.defaultBio");

  const loadActivity = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    void Promise.all([reportLoader(), historyLoader(ACTIVITY_DAYS)])
      .then(([report, history]) => setSummary(summarizeProfileActivity(report, history)))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, [historyLoader, reportLoader]);

  useEffect(loadActivity, [loadActivity]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
    [locale],
  );
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const leadingCells = summary?.buckets.length
    ? new Date(summary.buckets[0].startMs).getDay()
    : 0;

  const save = () => {
    const next = {
      name: draft.name.trim(),
      handle: draft.handle.trim().replace(/^@+/, ""),
      bio: draft.bio.trim(),
    };
    if (!next.name) {
      setNameInvalid(true);
      return;
    }
    setNameInvalid(false);
    setProfile(next);
    setDraft(next);
    setEditing(false);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStatus(t("profile.saved"));
    } catch {
      setStatus(t("profile.saveSessionOnly"));
    }
  };

  const shareCurrentProfile = async () => {
    if (!summary) return;
    const text = t("profile.shareText", {
      name: displayName,
      tokens: fmtTokens(summary.totalTokens),
      days: summary.activeDays,
      streak: summary.currentStreak,
      sessions: summary.transcripts,
    });
    try {
      const result = await share(t("profile.shareTitle", { name: displayName }), text);
      setStatus(result === "shared" ? t("profile.shared") : result === "copied" ? t("profile.copied") : "");
    } catch {
      setStatus(t("profile.shareFailed"));
    }
  };

  return (
    <div className="profile-page">
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button
          data-profile-share
          variant="ghost"
          size="sm"
          disabled={!summary}
          onClick={() => void shareCurrentProfile()}
        >
          <Share2 />
          {t("profile.share")}
        </Button>
        <Badge variant="outline" className="gap-1.5 px-2.5 font-normal text-muted-foreground">
          <Lock className="size-3.5" aria-hidden />
          {t("profile.private")}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(profile);
            setEditing((current) => !current);
            setStatus("");
            setNameInvalid(false);
          }}
        >
          <Pencil />
          {editing ? t("profile.closeEditor") : t("profile.edit")}
        </Button>
      </div>

      <section className="profile-hero" aria-labelledby="profile-name">
        <div className="profile-avatar" aria-hidden>
          {profile.name ? profileInitials(displayName) : <UserRound className="size-8" />}
        </div>
        <h1 id="profile-name" className="text-display font-semibold tracking-tight">{displayName}</h1>
        {handle && <p className="text-ui text-muted-foreground">@{handle}</p>}
        <p className="max-w-lg text-center text-hint leading-relaxed text-muted-foreground">{bio}</p>
      </section>

      {editing && (
        <form
          className="profile-editor"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-display-name">{t("profile.name")}</Label>
              <Input
                id="profile-display-name"
                value={draft.name}
                maxLength={48}
                required
                aria-invalid={nameInvalid || undefined}
                aria-describedby={nameInvalid ? "profile-display-name-error" : undefined}
                onInput={(event) => {
                  const name = event.currentTarget.value;
                  setDraft((current) => ({ ...current, name }));
                  if (name.trim()) setNameInvalid(false);
                }}
              />
              {nameInvalid && (
                <p id="profile-display-name-error" role="alert" className="text-fine text-destructive">
                  {t("profile.nameRequired")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-handle">{t("profile.handle")}</Label>
              <Input
                id="profile-handle"
                value={draft.handle}
                maxLength={32}
                placeholder={t("profile.handlePlaceholder")}
                onInput={(event) => {
                  const handle = event.currentTarget.value;
                  setDraft((current) => ({ ...current, handle }));
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-bio">{t("profile.bio")}</Label>
            <Textarea
              id="profile-bio"
              value={draft.bio}
              maxLength={160}
              className="min-h-20"
              onInput={(event) => {
                const bio = event.currentTarget.value;
                setDraft((current) => ({ ...current, bio }));
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(profile);
                setEditing(false);
                setNameInvalid(false);
              }}
            >
              {t("profile.cancel")}
            </Button>
            <Button type="submit" size="sm">
              <Check />
              {t("profile.save")}
            </Button>
          </div>
        </form>
      )}

      {status && <p role="status" aria-live="polite" className="text-center text-hint text-muted-foreground">{status}</p>}

      {loading && !summary && (
        <div className="flex items-center justify-center gap-2 py-16 text-hint text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          {t("profile.loading")}
        </div>
      )}

      {loadFailed && !summary && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-hint text-muted-foreground">{t("profile.loadFailed")}</p>
          <Button variant="outline" size="sm" onClick={loadActivity}>{t("profile.retry")}</Button>
        </div>
      )}

      {summary && (
        <>
          <section className="profile-stat-grid" aria-label={t("profile.summary") }>
            {[
              [fmtTokens(summary.totalTokens), t("profile.tokens90d")],
              [fmtTokens(summary.peakTokens), t("profile.peakDay")],
              [numberFormatter.format(summary.activeDays), t("profile.activeDays")],
              [numberFormatter.format(summary.currentStreak), t("profile.currentStreak")],
            ].map(([value, label]) => (
              <div key={label} className="profile-stat">
                <strong className="font-mono text-ui tabular-nums">{value}</strong>
                <span className="text-fine text-muted-foreground">{label}</span>
              </div>
            ))}
          </section>

          <section className="profile-section" aria-labelledby="profile-activity-heading">
            <div className="flex items-center justify-between gap-4">
              <h2 id="profile-activity-heading" className="text-ui font-semibold">{t("profile.tokenActivity")}</h2>
              <span className="text-fine text-muted-foreground">{t("profile.last90Days")}</span>
            </div>
            {summary.activeDays === 0 ? (
              <p className="py-6 text-hint text-muted-foreground">{t("profile.noActivity")}</p>
            ) : (
              <div
                className="profile-activity-grid"
                role="img"
                aria-label={t("profile.activityLabel", { days: summary.activeDays })}
              >
                {Array.from({ length: leadingCells }, (_, index) => <span key={`leading-${index}`} />)}
                {summary.buckets.map((bucket) => (
                  <span
                    key={bucket.startMs}
                    aria-hidden
                    title={`${dateFormatter.format(bucket.startMs)} · ${fmtTokens(bucket.total)}`}
                    className={bucket.total > 0 ? "profile-activity-cell bg-primary" : "profile-activity-cell bg-fill-rest"}
                    style={bucket.total > 0 ? { opacity: Math.max(0.22, bucket.total / Math.max(1, summary.peakTokens)) } : undefined}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="profile-detail-grid">
            <section className="profile-section" aria-labelledby="profile-insights-heading">
              <h2 id="profile-insights-heading" className="text-ui font-semibold">{t("profile.insights")}</h2>
              <dl className="mt-3 space-y-3 text-hint">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t("profile.sessionsScanned")}</dt>
                  <dd className="font-mono tabular-nums">{numberFormatter.format(summary.transcripts)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t("profile.providersUsed")}</dt>
                  <dd className="font-mono tabular-nums">{numberFormatter.format(summary.providers.length)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t("profile.mostUsedProvider")}</dt>
                  <dd>{summary.providers[0] ? providerNames[summary.providers[0].source] ?? summary.providers[0].source : "—"}</dd>
                </div>
              </dl>
            </section>

            <section className="profile-section" aria-labelledby="profile-provider-heading">
              <h2 id="profile-provider-heading" className="text-ui font-semibold">{t("profile.providerActivity")}</h2>
              {summary.providers.length === 0 ? (
                <p className="mt-3 text-hint text-muted-foreground">{t("profile.noProviderActivity")}</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {summary.providers.slice(0, 5).map((provider) => (
                    <div key={provider.source}>
                      <div className="flex items-center gap-2 text-hint">
                        <ProviderIcon provider={provider.source} className="size-3.5" />
                        <span className="min-w-0 flex-1 truncate">{providerNames[provider.source] ?? provider.source}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">{fmtTokens(provider.total_tokens)}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-fill-rest">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${summary.totalTokens > 0 ? Math.min(100, provider.total_tokens / summary.totalTokens * 100) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <p className="text-center text-fine text-muted-foreground">{t("profile.localOnly")}</p>
        </>
      )}
    </div>
  );
}
