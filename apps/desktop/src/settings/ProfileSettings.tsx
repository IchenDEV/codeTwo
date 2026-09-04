import { useEffect, useState } from "react";
import { Check, Lock, Pencil, Share2, UserRound } from "@/components/ui/icons";

import { usageHistory, usageReport, systemProfileAvatar } from "../bridge";
import type { SourceUsage, UsageHistoryReport, UsageReport } from "../bridge";
import { useLanguage } from "../i18n";
import { ProviderIcon } from "../providers/ProviderIcon";
import { fmtTokens, stackHistory } from "../usage/usageMath";
import type { StackedBucket } from "../usage/usageMath";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const storageKey = "codetwo.profile";
const activityDays = 90;

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
  const buckets = stackHistory(history.history).buckets;
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
    activeDays: totals.filter((total) => total > 0).length,
    buckets,
    currentStreak,
    peakTokens: Math.max(0, ...totals),
    providers: [...history.by_source].sort(
      (left, right) => right.total_tokens - left.total_tokens
    ),
    totalTokens: totals.reduce((sum, total) => sum + total, 0),
    transcripts: report.transcripts,
  };
}

interface ProfileSnapshot {
  name: string;
  handle: string;
  bio: string;
}

const emptyProfile: ProfileSnapshot = { bio: "", handle: "", name: "" };

function loadProfile(): ProfileSnapshot {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(storageKey) ?? "null"
    ) as Partial<ProfileSnapshot> | null;
    return {
      bio: typeof parsed?.bio === "string" ? parsed.bio : "",
      handle: typeof parsed?.handle === "string" ? parsed.handle : "",
      name: typeof parsed?.name === "string" ? parsed.name : "",
    };
  } catch {
    return emptyProfile;
  }
}

function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join("")
      .toUpperCase();
  }
  return Array.from(words[0] ?? "C2")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

async function shareProfile(
  title: string,
  text: string
): Promise<"shared" | "copied" | "cancelled"> {
  const share = (
    navigator as Navigator & {
      share?: (data: { title: string; text: string }) => Promise<void>;
    }
  ).share;

  if (share) {
    try {
      await share.call(navigator, { text, title });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error("clipboard unavailable");
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}

export const ProfileSettings = ({
  providerNames = {},
  reportLoader = usageReport,
  historyLoader = usageHistory,
  avatarLoader = systemProfileAvatar,
  share = shareProfile,
}: {
  readonly providerNames?: Record<string, string>;
  readonly reportLoader?: () => Promise<UsageReport>;
  readonly historyLoader?: (days: number) => Promise<UsageHistoryReport>;
  readonly avatarLoader?: () => Promise<string | null>;
  readonly share?: (
    title: string,
    text: string
  ) => Promise<"shared" | "copied" | "cancelled">;
}) => {
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
    void Promise.all([reportLoader(), historyLoader(activityDays)])
      .then(([report, history]) =>
        setSummary(summarizeProfileActivity(report, history))
      )
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(loadActivity, [loadActivity]);

  useEffect(() => {
    let isActive = true;
    void avatarLoader()
      .then((url) => {
        if (isActive) {
          setAvatarUrl(url);
        }
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, [avatarLoader]);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  });
  const numberFormatter = new Intl.NumberFormat(locale);
  const leadingCells = summary?.buckets.length
    ? new Date(summary.buckets[0].startMs).getDay()
    : 0;
  const activityCellCount = summary?.buckets.length || activityDays;

  const save = () => {
    const next = {
      bio: draft.bio.trim(),
      handle: draft.handle.trim().replace(/^@+/u, ""),
      name: draft.name.trim(),
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
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStatus(t("profile.saved"));
    } catch {
      setStatus(t("profile.saveSessionOnly"));
    }
  };

  const shareCurrentProfile = async () => {
    if (!summary) {
      return;
    }
    const text = t("profile.shareText", {
      days: summary.activeDays,
      name: displayName,
      sessions: summary.transcripts,
      streak: summary.currentStreak,
      tokens: fmtTokens(summary.totalTokens),
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
            {avatarUrl ? (
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
            {handle ? (
              <p className="text-body text-muted-foreground">@{handle}</p>
            ) : null}
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

      {editing ? (
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
                  if (name.trim()) {
                    setNameInvalid(false);
                  }
                }}
              />
              {nameInvalid ? (
                <p
                  id="profile-display-name-error"
                  role="alert"
                  className="text-callout text-destructive"
                >
                  {t("profile.nameRequired")}
                </p>
              ) : null}
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
      ) : null}

      {status ? (
        <output
          aria-live="polite"
          className="profile-status text-metadata text-muted-foreground"
        >
          {status}
        </output>
      ) : null}

      {loading && !summary ? (
        <div className="py-page-section text-metadata text-muted-foreground flex items-center justify-center gap-2">
          <Spinner />
          {t("profile.loading")}
        </div>
      ) : null}

      {loadFailed && !summary ? (
        <div className="py-page-section flex flex-col items-center gap-3 text-center">
          <p className="text-metadata text-muted-foreground">
            {t("profile.loadFailed")}
          </p>
          <Button variant="outline" size="sm" onClick={loadActivity}>
            {t("profile.retry")}
          </Button>
        </div>
      ) : null}

      {summary ? (
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
                        bucket
                          ? `${dateFormatter.format(bucket.startMs)} · ${fmtTokens(bucket.total)}`
                          : undefined
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
      ) : null}
    </div>
  );
};
