import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Check, Lock, Pencil, Share2, UserRound } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import { usageHistory, usageReport, systemProfileAvatar } from "../bridge";
import type { SourceUsage, UsageHistoryReport, UsageReport } from "../bridge";
import { useLanguage } from "../i18n";
import { ProviderIcon } from "../providers/ProviderIcon";
import { fmtTokens, stackHistory } from "../usage/usageMath";
import type { StackedBucket } from "../usage/usageMath";

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
  history: UsageHistoryReport
): ProfileActivitySummary {
  const { buckets } = stackHistory(history.history);
  const totals = buckets.map((bucket) => bucket.total);
  let currentStreak = 0;
  for (
    let index = totals.length - 1;
    index >= 0 && totals[index] > 0;
    index -= 1
  ) {
    currentStreak += 1;
  }

  return {
    totalTokens: totals.reduce((sum, total) => sum + total, 0),
    peakTokens: Math.max(0, ...totals),
    activeDays: totals.filter((total) => total > 0).length,
    currentStreak,
    transcripts: report.transcripts,
    buckets,
    providers: [...history.by_source].toSorted(
      (left, right) => right.total_tokens - left.total_tokens
    ),
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
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null"
    ) as Partial<ProfileSnapshot> | null;
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
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length > 1)
    return words
      .slice(0, 2)
      .map((word) => [...word][0])
      .join("")
      .toUpperCase();
  return [...(words[0] ?? "C2")].slice(0, 2).join("").toUpperCase();
}

async function shareProfile(
  title: string,
  text: string
): Promise<"shared" | "copied" | "cancelled"> {
  const { share } = navigator as Navigator & {
    share?: (data: { title: string; text: string }) => Promise<void>;
  };

  if (share != null) {
    try {
      await share.call(navigator, { title, text });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        return "cancelled";
    }
  }

  if (navigator.clipboard?.writeText == null)
    throw new Error("clipboard unavailable");
  await navigator.clipboard.writeText(text);
  return "copied";
}

export function ProfileSettings({
  providerNames = {},
  reportLoader = usageReport,
  historyLoader = usageHistory,
  avatarLoader = systemProfileAvatar,
  share = shareProfile,
}: {
  providerNames?: Record<string, string>;
  reportLoader?: () => Promise<UsageReport>;
  historyLoader?: (days: number) => Promise<UsageHistoryReport>;
  avatarLoader?: () => Promise<string | null>;
  share?: (
    title: string,
    text: string
  ) => Promise<"shared" | "copied" | "cancelled">;
}) {
  const { t, locale } = useLanguage();
  const [profile, setProfile] = useState(loadProfile);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState(profile);
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState<ProfileActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);

  const displayName = profile.name.trim() || t("profile.defaultName");
  const handle = profile.handle.trim().replace(/^@+/u, "");
  const bio = profile.bio.trim() || t("profile.defaultBio");

  const loadActivity = () => {
    setLoading(true);
    setLoadFailed(false);
    void Promise.all([reportLoader(), historyLoader(ACTIVITY_DAYS)])
      .then(([report, history]) =>
        setSummary(summarizeProfileActivity(report, history))
      )
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(loadActivity, [loadActivity]);

  useEffect(() => {
    let active = true;
    void avatarLoader()
      .then((url) => {
        if (active) setAvatarUrl(url);
      })
      .catch(() => {
        /* empty */
      });
    return () => {
      active = false;
    };
  }, [avatarLoader]);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  const numberFormatter = new Intl.NumberFormat(locale);
  const leadingCells =
    summary?.buckets.length == null
      ? 0
      : new Date(summary.buckets[0].startMs).getDay();
  const activityCellCount = summary?.buckets.length ?? ACTIVITY_DAYS;

  const save = () => {
    const next = {
      name: draft.name.trim(),
      handle: draft.handle.trim().replace(/^@+/u, ""),
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
      const result = await share(
        t("profile.shareTitle", { name: displayName }),
        text
      );
      setStatus(
        result === "shared"
          ? t("profile.shared")
          : result === "copied"
            ? t("profile.copied")
            : ""
      );
    } catch {
      setStatus(t("profile.shareFailed"));
    }
  };

  return (
    <div className="profile-page">
      <header className="profile-header">
        <section className="profile-identity" aria-labelledby="profile-name">
          <div className="profile-avatar" aria-hidden="true">
            {avatarUrl != null && avatarUrl !== "" ? (
              <img src={avatarUrl} alt="" onError={() => setAvatarUrl(null)} />
            ) : profile.name ? (
              profileInitials(displayName)
            ) : (
              <UserRound className="size-8" />
            )}
          </div>
          <div className="profile-identity-copy">
            <h1
              id="profile-name"
              className="text-page font-semibold tracking-tight"
            >
              {displayName}
            </h1>
            {handle && (
              <p className="text-body text-muted-foreground">@{handle}</p>
            )}
            <p className="profile-bio text-metadata text-muted-foreground">
              {bio}
            </p>
          </div>
        </section>

        <div className="profile-actions">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              data-profile-share
              size="sm"
              disabled={!summary}
              onClick={() => void shareCurrentProfile()}
            >
              <Share2 />
              {t("profile.share")}
            </Button>
            <Button
              variant="outline"
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
          <p className="profile-privacy text-metadata text-muted-foreground">
            <Lock className="size-3.5" aria-hidden />
            {t("profile.private")}
          </p>
        </div>
      </header>

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
                aria-describedby={
                  nameInvalid ? "profile-display-name-error" : undefined
                }
                onInput={(event) => {
                  const name = event.currentTarget.value;
                  setDraft((current) => ({ ...current, name }));
                  if (name.trim()) setNameInvalid(false);
                }}
              />
              {nameInvalid && (
                <p
                  id="profile-display-name-error"
                  role="alert"
                  className="text-callout text-destructive"
                >
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

      {status && (
        <p
          role="status"
          aria-live="polite"
          className="profile-status text-metadata text-muted-foreground"
        >
          {status}
        </p>
      )}

      {loading && !summary && (
        <div className="py-page-section text-metadata text-muted-foreground flex items-center justify-center gap-2">
          <Spinner />
          {t("profile.loading")}
        </div>
      )}

      {loadFailed && !summary && (
        <div className="py-page-section flex flex-col items-center gap-3 text-center">
          <p className="text-metadata text-muted-foreground">
            {t("profile.loadFailed")}
          </p>
          <Button variant="outline" size="sm" onClick={loadActivity}>
            {t("profile.retry")}
          </Button>
        </div>
      )}

      {summary && (
        <section
          className="profile-activity-surface"
          aria-labelledby="profile-summary-heading"
        >
          <h2
            id="profile-summary-heading"
            className="profile-summary-title text-body text-muted-foreground"
          >
            {t("profile.last90Days")}
          </h2>

          <div className="profile-stat-grid" aria-label={t("profile.summary")}>
            <div className="profile-stat profile-primary-stat">
              <div className="profile-primary-value">
                <strong className="font-mono tabular-nums">
                  {fmtTokens(summary.totalTokens)}
                </strong>
                <span className="text-body text-muted-foreground">
                  {t("profile.tokens")}
                </span>
              </div>
            </div>
            {[
              [
                numberFormatter.format(summary.activeDays),
                t("profile.activeDays"),
              ],
              [
                numberFormatter.format(summary.transcripts),
                t("profile.sessions"),
              ],
              [
                numberFormatter.format(summary.currentStreak),
                t("profile.currentStreak"),
              ],
              [fmtTokens(summary.peakTokens), t("profile.peakDay")],
            ].map(([value, label]) => (
              <div key={label} className="profile-stat">
                <strong className="text-body font-mono tabular-nums">
                  {value}
                </strong>
                <span className="text-callout text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="profile-activity-body">
            <section
              className="profile-activity-chart"
              aria-labelledby="profile-activity-heading"
            >
              <h3
                id="profile-activity-heading"
                className="text-metadata font-medium"
              >
                {t("profile.tokenActivity")}
              </h3>
              <div
                className="profile-activity-grid"
                role="img"
                aria-label={t("profile.activityLabel", {
                  days: summary.activeDays,
                })}
              >
                {Array.from({ length: leadingCells }, (_, index) => (
                  <span key={`leading-${index}`} />
                ))}
                {Array.from({ length: activityCellCount }, (_, index) => {
                  const bucket = summary.buckets[index];
                  return (
                    <span
                      key={bucket?.startMs ?? `empty-${index}`}
                      aria-hidden
                      title={
                        bucket == null
                          ? undefined
                          : `${dateFormatter.format(bucket.startMs)} · ${fmtTokens(bucket.total)}`
                      }
                      className={
                        bucket?.total
                          ? "profile-activity-cell bg-primary"
                          : "profile-activity-cell bg-fill-rest"
                      }
                      style={
                        bucket?.total
                          ? {
                              opacity: Math.max(
                                0.22,
                                bucket.total / Math.max(1, summary.peakTokens)
                              ),
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </section>

            {summary.activeDays === 0 ? (
              <div className="profile-empty-state">
                <strong className="text-body font-semibold">
                  {t("profile.noActivity")}
                </strong>
                <p className="text-metadata text-muted-foreground max-w-xs text-center">
                  {t("profile.noActivityHint")}
                </p>
              </div>
            ) : (
              <section
                className="profile-provider-activity"
                aria-labelledby="profile-provider-heading"
              >
                <h2
                  id="profile-provider-heading"
                  className="text-body font-semibold"
                >
                  {t("profile.providerActivity")}
                </h2>
                <div className="mt-4 space-y-4">
                  {summary.providers.slice(0, 5).map((provider) => (
                    <div key={provider.source}>
                      <div className="text-metadata flex items-center gap-2">
                        <ProviderIcon
                          provider={provider.source}
                          className="size-3.5"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {providerNames[provider.source] ?? provider.source}
                        </span>
                        <span className="text-muted-foreground font-mono tabular-nums">
                          {fmtTokens(provider.total_tokens)}
                        </span>
                      </div>
                      <div className="rounded-control bg-fill-rest mt-1.5 h-1 overflow-hidden">
                        <div
                          className="rounded-control bg-primary h-full"
                          style={{
                            width: `${summary.totalTokens > 0 ? Math.min(100, (provider.total_tokens / summary.totalTokens) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
