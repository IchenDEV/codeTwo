import { useEffect, useState } from "react";

import { CompositeActionRow } from "@/components/business/composite-action-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { providerLabel, sessionDiffStat } from "../bridge";
import type { SessionDiffStat, SessionInfo } from "../bridge";
import { useT } from "../i18n";
import { ProviderIcon } from "../providers/ProviderIcon";
import { describeContextWindow } from "../session/contextWindow";
import type { ContextWindowBySession } from "../session/contextWindow";
// Explicit extension: Bun's directory cache is case-insensitive, and `missionControl` without an
// extension resolves against `MissionControl.tsx` (this file) when both live in one directory.
import { missionRows } from "./missionControl.ts";
import type { MissionRow, MissionState } from "./missionControl.ts";

/**
The rail's color semantics, one dot per state: amber asks, red failed, primary at work.
*/
const dotClass: Record<MissionState, string> = {
  awaiting_input: "bg-warning animate-pulse",
  failed: "bg-destructive",
  idle: "bg-muted-foreground/40",
  running: "bg-primary animate-pulse",
};

function sceneLabel(reference: string): string {
  const colon = reference.lastIndexOf(":");
  return colon >= 0 ? reference.slice(colon + 1) : reference;
}

/**
 * Diff stats are fetched per row, not per open: the dialog is a glance surface, and a session's
 * working-tree stat is stable enough to cache for the app's lifetime once seen.
 */
const diffStatCache = new Map<string, SessionDiffStat | null>();

export function DiffStatCell({
  session,
  fetchStat = sessionDiffStat,
}: {
  readonly session: string;
  /**
  Injectable for tests; defaults to the bridge call.
  */
  readonly fetchStat?: (session: string) => Promise<SessionDiffStat | null>;
}) {
  const t = useT();
  const [stat, setStat] = useState<SessionDiffStat | null | undefined>(() =>
    diffStatCache.has(session) ? diffStatCache.get(session) : undefined
  );
  useEffect(() => {
    if (diffStatCache.has(session)) {
      setStat(diffStatCache.get(session));
      return;
    }
    let isCancelled = false;
    void fetchStat(session).then((value) => {
      diffStatCache.set(session, value);
      if (!isCancelled) {
        setStat(value);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [session, fetchStat]);

  if (stat === undefined) {
    return <Spinner className="text-muted-foreground size-3" />;
  }
  if (stat === null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="text-callout whitespace-nowrap tabular-nums">
      <span className="text-success">+{stat.additions}</span>{" "}
      <span className="text-destructive">−{stat.deletions}</span>
      <span className="text-muted-foreground">
        {" "}
        · {t("mission.files", { n: stat.files })}
      </span>
    </span>
  );
}

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
  readonly sessions: SessionInfo[];
  readonly runningSessions: ReadonlySet<string>;
  readonly contextWindows: ContextWindowBySession;
  readonly sceneBySession: ReadonlyMap<string, string>;
  readonly onSelect: (id: string) => void;
  readonly onReview: (id: string) => void;
  readonly onClose: () => void;
  /**
  Injectable for tests; defaults to the bridge call.
  */
  readonly fetchStat?: (session: string) => Promise<SessionDiffStat | null>;
}) {
  const t = useT();
  const rows = missionRows(
    sessions,
    runningSessions,
    contextWindows,
    sceneBySession
  );

  const row = (r: MissionRow) => {
    const s = r.session;
    const context = describeContextWindow(contextWindows[s.id] ?? null);
    return (
      <CompositeActionRow
        key={s.id}
        accessibilityLabel={s.title}
        onSelect={() => {
          onSelect(s.id);
          onClose();
        }}
        className="rounded-control hover:bg-accent/50 focus-within:bg-accent/50 gap-3 px-2 py-1.5 transition-colors"
        contentClassName="flex items-center gap-3"
        actions={
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => {
              onSelect(s.id);
              onReview(s.id);
              onClose();
            }}
          >
            {t("mission.review")}
          </Button>
        }
      >
        <span
          className={cn("size-2 shrink-0 rounded-full", dotClass[r.state])}
          title={t(`mission.state.${r.state}` as "mission.state.idle")}
          aria-label={t(`mission.state.${r.state}` as "mission.state.idle")}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-body min-w-0 truncate">{s.title}</span>
            {r.scene ? (
              <Badge
                variant="outline"
                className="text-metadata text-muted-foreground shrink-0"
              >
                {sceneLabel(r.scene)}
              </Badge>
            ) : null}
          </div>
          <div className="text-callout text-muted-foreground flex items-center gap-1">
            <ProviderIcon
              provider={providerLabel(s.provider)}
              className="size-3 shrink-0 opacity-70"
            />
            <span className="min-w-0 truncate">
              {t(`mission.state.${r.state}` as "mission.state.idle")}
            </span>
          </div>
        </div>
        <DiffStatCell session={s.id} fetchStat={fetchStat} />
        <span
          className="text-callout text-muted-foreground w-10 shrink-0 text-right tabular-nums"
          title={context?.exact}
        >
          {r.contextPct === null ? "—" : `${Math.round(r.contextPct)}%`}
        </span>
      </CompositeActionRow>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => open == null && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("mission.title")}</DialogTitle>
          <DialogDescription>{t("mission.hint")}</DialogDescription>
        </DialogHeader>
        {rows.length === 0 ? (
          <p className="text-callout text-muted-foreground px-2 py-4">
            {t("mission.empty")}
          </p>
        ) : (
          <div className="max-h-96 space-y-px overflow-y-auto">
            {rows.map(row)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
