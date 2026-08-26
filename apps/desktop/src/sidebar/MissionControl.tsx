import { useEffect, useState } from "react";
import { LoaderCircle } from "@/components/ui/icons";

import {
  providerLabel,
  sessionDiffStat,
  type SessionDiffStat,
  type SessionInfo,
} from "../bridge";
// Explicit extension: Bun's directory cache is case-insensitive, and `missionControl` without an
// extension resolves against `MissionControl.tsx` (this file) when both live in one directory.
import { missionRows, type MissionRow, type MissionState } from "./missionControl.ts";
import {
  describeContextWindow,
  type ContextWindowBySession,
} from "../session/contextWindow";
import { ProviderIcon } from "../providers/ProviderIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "../i18n";
import { cn } from "@/lib/utils";

/** The rail's color semantics, one dot per state: amber asks, red failed, primary at work. */
const DOT_CLASS: Record<MissionState, string> = {
  awaiting_input: "bg-warning animate-pulse",
  failed: "bg-destructive",
  running: "bg-primary animate-pulse",
  idle: "bg-muted-foreground/40",
};

/** A scene reference like `builtin:develop` reads better as its short name. */
function sceneLabel(reference: string): string {
  const colon = reference.lastIndexOf(":");
  return colon >= 0 ? reference.slice(colon + 1) : reference;
}

/**
 * Diff stats are fetched per row, not per open: the dialog is a glance surface, and a session's
 * working-tree stat is stable enough to cache for the app's lifetime once seen.
 */
const diffStatCache = new Map<string, SessionDiffStat | null>();

/** Spinner → `+a −d · n files` → em dash when the checkout is gone or not a repo. */
export function DiffStatCell({
  session,
  fetchStat = sessionDiffStat,
}: {
  session: string;
  /** Injectable for tests; defaults to the bridge call. */
  fetchStat?: (session: string) => Promise<SessionDiffStat | null>;
}) {
  const t = useT();
  const [stat, setStat] = useState<SessionDiffStat | null | undefined>(() =>
    diffStatCache.has(session) ? diffStatCache.get(session) : undefined,
  );
  useEffect(() => {
    if (diffStatCache.has(session)) {
      setStat(diffStatCache.get(session));
      return;
    }
    let cancelled = false;
    void fetchStat(session).then((value) => {
      diffStatCache.set(session, value);
      if (!cancelled) setStat(value);
    });
    return () => {
      cancelled = true;
    };
  }, [session, fetchStat]);

  if (stat === undefined) {
    return <LoaderCircle className="size-3 animate-spin text-muted-foreground" aria-hidden />;
  }
  if (stat === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="whitespace-nowrap text-fine tabular-nums">
      <span className="text-success">+{stat.additions}</span>{" "}
      <span className="text-destructive">−{stat.deletions}</span>
      <span className="text-muted-foreground"> · {t("mission.files", { n: stat.files })}</span>
    </span>
  );
}

/**
 * R6 (docs/roadmap.md): the cross-session overview answering "what needs me" — every session's
 * state, scene, working-tree diff, and context occupancy, with one click into review.
 */
export function MissionControlDialog({
  sessions,
  runningSessions,
  contextWindows,
  sceneBySession,
  onSelect,
  onReview,
  onClose,
  fetchStat,
}: {
  sessions: SessionInfo[];
  runningSessions: ReadonlySet<string>;
  contextWindows: ContextWindowBySession;
  sceneBySession: ReadonlyMap<string, string>;
  onSelect: (id: string) => void;
  onReview: (id: string) => void;
  onClose: () => void;
  /** Injectable for tests; defaults to the bridge call. */
  fetchStat?: (session: string) => Promise<SessionDiffStat | null>;
}) {
  const t = useT();
  const rows = missionRows(sessions, runningSessions, contextWindows, sceneBySession);

  const row = (r: MissionRow) => {
    const s = r.session;
    const context = describeContextWindow(contextWindows[s.id] ?? null);
    return (
      <div
        key={s.id}
        onClick={() => {
          onSelect(s.id);
          onClose();
        }}
        className="group flex cursor-pointer items-center gap-3 rounded-(--ds-radius-control) px-2 py-1.5 transition-colors hover:bg-accent/50"
      >
        <span
          className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[r.state])}
          title={t(`mission.state.${r.state}` as "mission.state.idle")}
          aria-label={t(`mission.state.${r.state}` as "mission.state.idle")}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-ui">{s.title}</span>
            {r.scene && (
              <Badge variant="outline" className="shrink-0 text-cap text-muted-foreground">
                {sceneLabel(r.scene)}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-fine text-muted-foreground">
            <ProviderIcon
              provider={providerLabel(s.provider)}
              className="size-3 shrink-0 opacity-70"
            />
            <span className="min-w-0 truncate">{t(`mission.state.${r.state}` as "mission.state.idle")}</span>
          </div>
        </div>
        <DiffStatCell session={s.id} fetchStat={fetchStat} />
        <span
          className="w-10 shrink-0 text-right text-fine tabular-nums text-muted-foreground"
          title={context?.exact}
        >
          {r.contextPct === null ? "—" : `${Math.round(r.contextPct)}%`}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(s.id);
            onReview(s.id);
            onClose();
          }}
        >
          {t("mission.review")}
        </Button>
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("mission.title")}</DialogTitle>
          <DialogDescription>{t("mission.hint")}</DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? (
          <p className="px-2 py-4 text-fine text-muted-foreground">{t("mission.empty")}</p>
        ) : (
          <div className="max-h-96 space-y-px overflow-y-auto">{rows.map(row)}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
